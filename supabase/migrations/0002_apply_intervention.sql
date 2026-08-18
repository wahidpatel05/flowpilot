-- =============================================================================
-- FlowPilot — 0002_apply_intervention.sql
--
-- THE KEYSTONE HOP, in Postgres.
--
-- Every other hop in the FlowPilot loop is a surface displaying something. This
-- file is the one place where the facility's capacity actually changes. Three
-- teams (Control on web, Desk on web, Visitor on Android) must never each
-- implement it, so it lives here as one atomic RPC per lifecycle transition:
--
--   Recommendation --approve_recommendation()--> Intervention (approved)
--                  --accept_intervention()----> Intervention (accepted)
--                  --apply_intervention()-----> counter_assignments WRITTEN  <-- KEYSTONE
--                  --expire_temporary_assignments()--> Intervention (completed)
--   Recommendation --reject_recommendation()---> rejected
--
-- CONTRACT SOURCE OF TRUTH: flowpilot-core/src/types.ts (FROZEN).
-- Every status string written below already exists in a CHECK constraint in
-- 0001_init.sql:
--   recommendations.status / interventions.status
--       ('recommended','approved','pending_staff','accepted','applied',
--        'rejected','completed')
--   counter_assignments.status          ('active','ended')
--   counter_assignments.assignment_type ('primary','temporary')
--   counters.status                     ('active','inactive')
--   staff.status                        ('idle','active')
--   action_type                         ('activate_counter','reassign_staff')
--
-- There is no 'reassign_counter'. There is no 'human_minutes_saved'.
--
-- Runs standalone AFTER 0001_init.sql. Idempotent: every function is preceded
-- by DROP FUNCTION IF EXISTS on its exact signature, so a changed signature can
-- never leave an orphaned overload behind for the clients to hit by accident.
--
-- NOTE ON TIMELINE ORDERING: every intervention_events / queue_events row below
-- stamps created_at with clock_timestamp(), NOT now(). now() is the TRANSACTION
-- timestamp, so two events appended by the same function call would share it to
-- the microsecond and Control's "order by created_at" timeline would render
-- 'applied' before 'approved' at random. clock_timestamp() is the real instant
-- of the insert, so it is not a fabricated timestamp. Each event also carries
-- metadata.sequence (the canonical lifecycle position from spec sheet section
-- 12), so a client can order by (created_at, (metadata->>'sequence')::int) and
-- be correct even on a coarse clock.
--
-- NOTE ON ETA: these functions deliberately do NOT compute predicted wait.
-- calculateEta() in flowpilot-core is the single ETA implementation
-- (INTEGRATION.md rule 1). queue_events.predicted_wait is left NULL here and
-- the clients recompute; the row exists so Operational Replay can reconstruct
-- the capacity change (active_counters before -> after).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Internal helper: human-readable names for an action payload.
--
-- intervention_events.message renders straight into Control's timeline, so it
-- must read like a human wrote it and must never contain a raw uuid. This
-- resolves a payload's ids to names once, so every event writer below phrases
-- things the same way.
-- -----------------------------------------------------------------------------
drop function if exists public.fp_action_label(text, jsonb) cascade;

create function public.fp_action_label(p_action_type text, p_payload jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'staff_name', coalesce(
      (select st.name from public.staff st
        where st.id = nullif(p_payload ->> 'staffId', '')::uuid),
      'the staff member'),
    'counter_name', coalesce(
      (select c.name from public.counters c
        where c.id = nullif(p_payload ->> 'counterId', '')::uuid),
      'the counter'),
    -- activate_counter carries serviceId; reassign_staff carries toServiceId.
    'service_name', coalesce(
      (select sv.name from public.services sv
        where sv.id = nullif(p_payload ->> 'serviceId', '')::uuid),
      (select sv.name from public.services sv
        where sv.id = nullif(p_payload ->> 'toServiceId', '')::uuid),
      'the service'),
    'from_service_name', coalesce(
      (select sv.name from public.services sv
        where sv.id = nullif(p_payload ->> 'fromServiceId', '')::uuid),
      'their current service'),
    'to_service_name', coalesce(
      (select sv.name from public.services sv
        where sv.id = nullif(p_payload ->> 'toServiceId', '')::uuid),
      'the service'),
    'duration_minutes',
      coalesce(nullif(p_payload ->> 'durationMinutes', '')::numeric, 30)
  );
$fn$;

comment on function public.fp_action_label(text, jsonb) is
  'Internal. Resolves an action_payload''s ids to display names so intervention_events.message never contains a raw uuid.';

-- -----------------------------------------------------------------------------
-- 1. approve_recommendation(p_recommendation_id)
--
-- The manager-approves hop. A Recommendation is FlowPilot''s opinion; the moment
-- a human approves it, it becomes an Intervention. The two are never the same
-- record (CONTEXT.md), so this INSERTs an interventions row rather than
-- mutating the recommendation into one.
-- -----------------------------------------------------------------------------
drop function if exists public.approve_recommendation(uuid) cascade;

create function public.approve_recommendation(p_recommendation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_rec    public.recommendations;
  v_lbl    jsonb;
  v_int_id uuid;
  v_msg    text;
begin
  select * into v_rec
    from public.recommendations
   where id = p_recommendation_id
   for update;

  if not found then
    raise exception 'FlowPilot: recommendation % does not exist.', p_recommendation_id
      using errcode = 'P0001';
  end if;

  if v_rec.status <> 'recommended' then
    raise exception
      'FlowPilot: this recommendation cannot be approved because it is already "%". Only a recommendation still in "recommended" can be approved.',
      v_rec.status
      using errcode = 'P0001';
  end if;

  v_lbl := public.fp_action_label(v_rec.action_type, v_rec.action_payload);

  insert into public.interventions (
    recommendation_id, action_type, action_payload,
    status, approved_at, estimated_minutes_returned
  ) values (
    v_rec.id, v_rec.action_type, v_rec.action_payload,
    'approved', now(), v_rec.estimated_minutes_returned
  )
  returning id into v_int_id;

  update public.recommendations
     set status = 'approved'
   where id = v_rec.id;

  -- recommendation_created: only if this recommendation was never logged before.
  if not exists (
    select 1
      from public.intervention_events ie
      join public.interventions i on i.id = ie.intervention_id
     where i.recommendation_id = v_rec.id
       and ie.event_type = 'recommendation_created'
  ) then
    if v_rec.action_type = 'activate_counter' then
      v_msg := format(
        'FlowPilot recommended opening %s with %s for %s.',
        v_lbl ->> 'counter_name', v_lbl ->> 'staff_name', v_lbl ->> 'service_name');
    else
      v_msg := format(
        'FlowPilot recommended moving %s from %s to %s.',
        v_lbl ->> 'staff_name', v_lbl ->> 'from_service_name', v_lbl ->> 'to_service_name');
    end if;

    insert into public.intervention_events (
      intervention_id, event_type, message, metadata, created_at
    ) values (
      v_int_id, 'recommendation_created', v_msg,
      jsonb_build_object(
        'sequence', 2,
        'recommendation_id', v_rec.id,
        'action_type', v_rec.action_type,
        'estimated_minutes_returned', v_rec.estimated_minutes_returned,
        'confidence', v_rec.confidence),
      clock_timestamp()
    );
  end if;

  if v_rec.action_type = 'activate_counter' then
    v_msg := format(
      'Manager approved opening %s with %s for %s.',
      v_lbl ->> 'counter_name', v_lbl ->> 'staff_name', v_lbl ->> 'service_name');
  else
    v_msg := format(
      'Manager approved reassignment of %s to %s.',
      v_lbl ->> 'staff_name', v_lbl ->> 'to_service_name');
  end if;

  insert into public.intervention_events (
    intervention_id, event_type, message, metadata, created_at
  ) values (
    v_int_id, 'approved', v_msg,
    jsonb_build_object(
      'sequence', 3,
      'recommendation_id', v_rec.id,
      'action_type', v_rec.action_type),
    clock_timestamp()
  );

  return jsonb_build_object(
    'intervention_id', v_int_id,
    'status', 'approved',
    'recommendation_id', v_rec.id,
    'action_type', v_rec.action_type,
    'estimated_minutes_returned', v_rec.estimated_minutes_returned
  );
end
$fn$;

comment on function public.approve_recommendation(uuid) is
  'Manager-approves hop. Creates the interventions row (status approved) from a recommendation, mirrors the recommendation to approved, and appends recommendation_created + approved timeline events. Returns {intervention_id, status, ...}.';

-- -----------------------------------------------------------------------------
-- 2. accept_intervention(p_intervention_id)
--
-- The Desk's "Accept" button. Acknowledgement only: capacity does not change
-- here. apply_intervention() is the only thing that touches the facility.
-- -----------------------------------------------------------------------------
drop function if exists public.accept_intervention(uuid) cascade;

create function public.accept_intervention(p_intervention_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_int public.interventions;
  v_lbl jsonb;
  v_msg text;
begin
  select * into v_int
    from public.interventions
   where id = p_intervention_id
   for update;

  if not found then
    raise exception 'FlowPilot: intervention % does not exist.', p_intervention_id
      using errcode = 'P0001';
  end if;

  if v_int.status not in ('approved', 'pending_staff') then
    raise exception
      'FlowPilot: this intervention cannot be accepted because it is "%". Only an approved or pending_staff intervention can be accepted.',
      v_int.status
      using errcode = 'P0001';
  end if;

  update public.interventions
     set status = 'accepted', accepted_at = now()
   where id = v_int.id;

  if v_int.recommendation_id is not null then
    update public.recommendations
       set status = 'accepted'
     where id = v_int.recommendation_id;
  end if;

  v_lbl := public.fp_action_label(v_int.action_type, v_int.action_payload);

  if v_int.action_type = 'activate_counter' then
    v_msg := format(
      '%s accepted and is opening %s for %s.',
      v_lbl ->> 'staff_name', v_lbl ->> 'counter_name', v_lbl ->> 'service_name');
  else
    v_msg := format(
      '%s accepted the reassignment to %s.',
      v_lbl ->> 'staff_name', v_lbl ->> 'to_service_name');
  end if;

  insert into public.intervention_events (
    intervention_id, event_type, message, metadata, created_at
  ) values (
    v_int.id, 'staff_accepted', v_msg,
    jsonb_build_object('sequence', 5, 'action_type', v_int.action_type),
    clock_timestamp()
  );

  return jsonb_build_object(
    'intervention_id', v_int.id,
    'status', 'accepted',
    'accepted_at', now(),
    'action_type', v_int.action_type
  );
end
$fn$;

comment on function public.accept_intervention(uuid) is
  'The Desk Accept button. approved|pending_staff -> accepted, appends a staff_accepted timeline event. Does NOT change capacity.';

-- -----------------------------------------------------------------------------
-- 3. apply_intervention(p_intervention_id)   <-- THE KEYSTONE
--
-- The only place in FlowPilot where the facility actually changes. If this row
-- is never written, the Visitor's ETA never drops and there is no demo.
--
-- Atomicity: a plpgsql function body already runs inside the caller's
-- transaction, and the whole mutating section is additionally wrapped in an
-- explicit BEGIN ... EXCEPTION block. That block establishes a subtransaction,
-- so ANY error below rolls the entire application back to the point of entry
-- and then re-raises the original error unchanged. A partially applied
-- intervention (counter opened but no assignment row, or an assignment ended
-- but its replacement missing) is worse than a clean failure, and cannot
-- happen.
--
-- Idempotency is EXPLICIT, not silent: a second call raises. A double-click on
-- stage must not move a staff member twice.
-- -----------------------------------------------------------------------------
drop function if exists public.apply_intervention(uuid) cascade;

create function public.apply_intervention(p_intervention_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_int              public.interventions;
  p                  jsonb;
  v_lbl              jsonb;
  v_counter_id       uuid;
  v_staff_id         uuid;
  v_service_id       uuid;
  v_from_service_id  uuid;
  v_to_service_id    uuid;
  v_duration         numeric;
  v_ends_at          timestamptz;
  v_new_assignment   uuid;
  v_ended_assignment uuid;
  v_old_counter_id   uuid;
  v_affected         uuid[];
  v_before           jsonb;
  v_after            jsonb;
  v_msg              text;
  v_sid              uuid;
begin
  -- ==== atomic block =======================================================
  begin
    select * into v_int
      from public.interventions
     where id = p_intervention_id
     for update;

    if not found then
      raise exception 'FlowPilot: intervention % does not exist.', p_intervention_id
        using errcode = 'P0001';
    end if;

    -- Explicit idempotency guard. Loud, never silent.
    if v_int.status = 'applied' then
      raise exception
        'FlowPilot: this intervention was already applied (at %). Capacity has NOT been changed a second time.',
        coalesce(to_char(v_int.applied_at, 'HH24:MI:SS'), 'an earlier point')
        using errcode = 'P0001';
    end if;

    if v_int.status = 'completed' then
      raise exception
        'FlowPilot: this intervention has already run its course and is completed. It cannot be applied again.'
        using errcode = 'P0001';
    end if;

    if v_int.status not in ('approved', 'accepted') then
      raise exception
        'FlowPilot: this intervention cannot be applied because it is "%". Only an approved or accepted intervention can be applied.',
        v_int.status
        using errcode = 'P0001';
    end if;

    p     := coalesce(v_int.action_payload, '{}'::jsonb);
    v_lbl := public.fp_action_label(v_int.action_type, p);

    -- Active counters per service BEFORE anything moves, for the replay rows.
    select jsonb_object_agg(x.id::text, x.n) into v_before
      from (
        select sv.id,
               (select count(*) from public.counter_assignments ca
                 where ca.service_id = sv.id and ca.status = 'active') as n
          from public.services sv
      ) x;

    -- =====================================================================
    -- Branch on action_type. THERE ARE ONLY TWO.
    -- =====================================================================
    if v_int.action_type = 'activate_counter' then

      v_counter_id := nullif(p ->> 'counterId', '')::uuid;
      v_staff_id   := nullif(p ->> 'staffId', '')::uuid;
      v_service_id := nullif(p ->> 'serviceId', '')::uuid;
      v_duration   := coalesce(nullif(p ->> 'durationMinutes', '')::numeric, 30);

      -- ---- VALIDATE BEFORE MUTATING --------------------------------------
      if v_counter_id is null or v_staff_id is null or v_service_id is null then
        raise exception
          'FlowPilot: this activate_counter intervention is missing counterId, staffId or serviceId in its payload.'
          using errcode = 'P0001';
      end if;

      if v_duration <= 0 then
        raise exception 'FlowPilot: durationMinutes must be greater than zero (got %).', v_duration
          using errcode = 'P0001';
      end if;

      if not exists (select 1 from public.counters where id = v_counter_id) then
        raise exception 'FlowPilot: the counter named in this intervention no longer exists.'
          using errcode = 'P0001';
      end if;

      if not exists (select 1 from public.staff where id = v_staff_id) then
        raise exception 'FlowPilot: the staff member named in this intervention no longer exists.'
          using errcode = 'P0001';
      end if;

      if not exists (select 1 from public.services where id = v_service_id) then
        raise exception 'FlowPilot: the service named in this intervention no longer exists.'
          using errcode = 'P0001';
      end if;

      -- Skill is a hard constraint, never a preference (CONTEXT.md).
      if not exists (
        select 1 from public.staff_skills
         where staff_id = v_staff_id and service_id = v_service_id
      ) then
        raise exception
          'FlowPilot: % does not hold the skill for %, so % cannot be opened for that service. Skill is a hard requirement.',
          v_lbl ->> 'staff_name', v_lbl ->> 'service_name', v_lbl ->> 'counter_name'
          using errcode = 'P0001';
      end if;

      -- A counter is one physical position: it cannot hold two live bindings.
      if exists (
        select 1 from public.counter_assignments
         where counter_id = v_counter_id and status = 'active'
      ) then
        raise exception
          'FlowPilot: % already has an active assignment, so it cannot be opened again.',
          v_lbl ->> 'counter_name'
          using errcode = 'P0001';
      end if;

      -- No source service loses capacity on this branch, so the "at least one
      -- active counter afterwards" guard is vacuously satisfied:
      -- activate_counter only ever ADDS a counter.

      v_affected := array[v_service_id];
      v_ends_at  := now() + (v_duration * interval '1 minute');

      -- ---- MUTATE --------------------------------------------------------
      update public.counters set status = 'active' where id = v_counter_id;
      update public.staff    set status = 'active' where id = v_staff_id;

      insert into public.counter_assignments (
        counter_id, staff_id, service_id, assignment_type, status, started_at, ends_at
      ) values (
        v_counter_id, v_staff_id, v_service_id, 'temporary', 'active', now(), v_ends_at
      )
      returning id into v_new_assignment;

      v_msg := format(
        '%s opened for %s. %s is now serving there for the next %s minutes.',
        v_lbl ->> 'counter_name', v_lbl ->> 'service_name',
        v_lbl ->> 'staff_name', v_duration::text);

    elsif v_int.action_type = 'reassign_staff' then

      v_staff_id        := nullif(p ->> 'staffId', '')::uuid;
      v_counter_id      := nullif(p ->> 'counterId', '')::uuid;
      v_from_service_id := nullif(p ->> 'fromServiceId', '')::uuid;
      v_to_service_id   := nullif(p ->> 'toServiceId', '')::uuid;
      v_duration        := coalesce(nullif(p ->> 'durationMinutes', '')::numeric, 30);

      -- ---- VALIDATE BEFORE MUTATING --------------------------------------
      if v_staff_id is null or v_counter_id is null
         or v_from_service_id is null or v_to_service_id is null then
        raise exception
          'FlowPilot: this reassign_staff intervention is missing staffId, counterId, fromServiceId or toServiceId in its payload.'
          using errcode = 'P0001';
      end if;

      if v_duration <= 0 then
        raise exception 'FlowPilot: durationMinutes must be greater than zero (got %).', v_duration
          using errcode = 'P0001';
      end if;

      if v_from_service_id = v_to_service_id then
        raise exception
          'FlowPilot: this reassignment would move % to %, the service they are already serving.',
          v_lbl ->> 'staff_name', v_lbl ->> 'to_service_name'
          using errcode = 'P0001';
      end if;

      if not exists (select 1 from public.staff where id = v_staff_id) then
        raise exception 'FlowPilot: the staff member named in this intervention no longer exists.'
          using errcode = 'P0001';
      end if;

      if not exists (select 1 from public.counters where id = v_counter_id) then
        raise exception 'FlowPilot: the counter named in this intervention no longer exists.'
          using errcode = 'P0001';
      end if;

      if not exists (select 1 from public.services where id = v_from_service_id) then
        raise exception 'FlowPilot: the source service named in this intervention no longer exists.'
          using errcode = 'P0001';
      end if;

      if not exists (select 1 from public.services where id = v_to_service_id) then
        raise exception 'FlowPilot: the destination service named in this intervention no longer exists.'
          using errcode = 'P0001';
      end if;

      -- Skill gate on the DESTINATION service. Hard constraint.
      if not exists (
        select 1 from public.staff_skills
         where staff_id = v_staff_id and service_id = v_to_service_id
      ) then
        raise exception
          'FlowPilot: % does not hold the skill for %, so this reassignment was refused. Skill is a hard requirement.',
          v_lbl ->> 'staff_name', v_lbl ->> 'to_service_name'
          using errcode = 'P0001';
      end if;

      -- The assignment being moved.
      select ca.id, ca.counter_id
        into v_ended_assignment, v_old_counter_id
        from public.counter_assignments ca
       where ca.staff_id   = v_staff_id
         and ca.service_id = v_from_service_id
         and ca.status     = 'active'
       order by ca.started_at desc
       limit 1
       for update;

      if v_ended_assignment is null then
        raise exception
          'FlowPilot: % has no active assignment on %, so there is nothing to reassign.',
          v_lbl ->> 'staff_name', v_lbl ->> 'from_service_name'
          using errcode = 'P0001';
      end if;

      -- Never strand the source service at zero capacity: calculateWaitMinutes()
      -- returns Infinity when activeCounters <= 0, and the ETA becomes
      -- unrenderable on the Visitor's phone.
      if (
        select count(*) from public.counter_assignments ca
         where ca.service_id = v_from_service_id
           and ca.status = 'active'
           and ca.id <> v_ended_assignment
      ) < 1 then
        raise exception
          'FlowPilot: moving % off % would leave % with zero active counters. Open another counter for % first.',
          v_lbl ->> 'staff_name', v_lbl ->> 'from_service_name',
          v_lbl ->> 'from_service_name', v_lbl ->> 'from_service_name'
          using errcode = 'P0001';
      end if;

      v_affected := array[v_from_service_id, v_to_service_id];
      v_ends_at  := now() + (v_duration * interval '1 minute');

      -- ---- MUTATE --------------------------------------------------------
      -- END the current binding, then create the temporary one.
      update public.counter_assignments
         set status = 'ended', ends_at = now()
       where id = v_ended_assignment;

      update public.counters set status = 'active' where id = v_counter_id;
      update public.staff    set status = 'active' where id = v_staff_id;

      insert into public.counter_assignments (
        counter_id, staff_id, service_id, assignment_type, status, started_at, ends_at
      ) values (
        v_counter_id, v_staff_id, v_to_service_id, 'temporary', 'active', now(), v_ends_at
      )
      returning id into v_new_assignment;

      -- If they walked away from a different desk and left it unmanned, that
      -- desk is furniture again.
      if v_old_counter_id is distinct from v_counter_id
         and not exists (
           select 1 from public.counter_assignments
            where counter_id = v_old_counter_id and status = 'active'
         ) then
        update public.counters set status = 'inactive' where id = v_old_counter_id;
      end if;

      v_msg := format(
        '%s moved from %s to %s at %s for the next %s minutes.',
        v_lbl ->> 'staff_name', v_lbl ->> 'from_service_name',
        v_lbl ->> 'to_service_name', v_lbl ->> 'counter_name',
        v_duration::text);

    else
      -- Unreachable while the CHECK constraint holds. Kept so that a future
      -- action_type can never silently do nothing.
      raise exception
        'FlowPilot: unknown action_type "%". FlowPilot only knows activate_counter and reassign_staff.',
        v_int.action_type
        using errcode = 'P0001';
    end if;

    -- ---- capacity after the change --------------------------------------
    select jsonb_object_agg(x.id::text, x.n) into v_after
      from (
        select sv.id,
               (select count(*) from public.counter_assignments ca
                 where ca.service_id = sv.id and ca.status = 'active') as n
          from public.services sv
         where sv.id = any(v_affected)
      ) x;

    -- ---- lifecycle -------------------------------------------------------
    update public.interventions
       set status = 'applied', applied_at = now()
     where id = v_int.id;

    if v_int.recommendation_id is not null then
      update public.recommendations
         set status = 'applied'
       where id = v_int.recommendation_id;
    end if;

    -- ---- timeline: applied, then eta_recalculated ------------------------
    insert into public.intervention_events (
      intervention_id, event_type, message, metadata, created_at
    ) values (
      v_int.id, 'applied', v_msg,
      jsonb_build_object(
        'sequence', 6,
        'assignment_id', v_new_assignment,
        'ended_assignment_id', v_ended_assignment,
        'action_type', v_int.action_type,
        'affected_service_ids', to_jsonb(v_affected),
        'active_counters_before', v_before,
        'active_counters_after', v_after,
        'ends_at', v_ends_at),
      clock_timestamp()
    );

    v_msg := '';
    foreach v_sid in array v_affected loop
      v_msg := v_msg || format(
        '%s now has %s active counter(s), from %s. ',
        (select sv.name from public.services sv where sv.id = v_sid),
        coalesce(v_after ->> v_sid::text, '0'),
        coalesce(v_before ->> v_sid::text, '0'));
    end loop;

    v_msg := 'ETA recalculated. ' || v_msg ||
      case
        when coalesce(v_int.estimated_minutes_returned, 0) > 0 then
          format('Estimated time returned: %s minutes of visitor waiting.',
                 round(v_int.estimated_minutes_returned)::text)
        else 'Waiting visitors will see a new estimate on their next refresh.'
      end;

    insert into public.intervention_events (
      intervention_id, event_type, message, metadata, created_at
    ) values (
      v_int.id, 'eta_recalculated', v_msg,
      jsonb_build_object(
        'sequence', 7,
        'affected_service_ids', to_jsonb(v_affected),
        'active_counters_after', v_after,
        'estimated_minutes_returned', v_int.estimated_minutes_returned,
        'note', 'The ETA itself is computed by calculateEta() in flowpilot-core, never in SQL.'),
      clock_timestamp()
    );

    -- ---- Operational Replay: one capacity_changed row per affected service.
    -- predicted_wait stays NULL on purpose: flowpilot-core owns ETA maths.
    foreach v_sid in array v_affected loop
      insert into public.queue_events (
        service_id, event_type, queue_length, active_counters, metadata, created_at
      ) values (
        v_sid,
        'capacity_changed',
        (select count(*) from public.tokens t
          where t.service_id = v_sid and t.status = 'waiting'),
        coalesce((v_after ->> v_sid::text)::integer, 0),
        jsonb_build_object(
          'intervention_id', v_int.id,
          'recommendation_id', v_int.recommendation_id,
          'action_type', v_int.action_type,
          'assignment_id', v_new_assignment,
          'active_counters_before', coalesce((v_before ->> v_sid::text)::integer, 0),
          'estimated_minutes_returned', v_int.estimated_minutes_returned,
          'source', 'apply_intervention'),
        clock_timestamp()
      );
    end loop;

  exception when others then
    -- Roll the whole application back to the subtransaction start and hand the
    -- original error (message and errcode) straight to the caller. Nothing
    -- half-applied ever survives this function.
    raise;
  end;
  -- ==== end atomic block ===================================================

  return jsonb_build_object(
    'intervention_id', v_int.id,
    'status', 'applied',
    'applied_at', now(),
    'action_type', v_int.action_type,
    'assignment_id', v_new_assignment,
    'ended_assignment_id', v_ended_assignment,
    'affected_service_ids', to_jsonb(v_affected),
    'active_counters_before', v_before,
    'active_counters_after', v_after,
    'ends_at', v_ends_at,
    'estimated_minutes_returned', v_int.estimated_minutes_returned,
    'counter_name', v_lbl ->> 'counter_name',
    'staff_name', v_lbl ->> 'staff_name'
  );
end
$fn$;

comment on function public.apply_intervention(uuid) is
  'THE KEYSTONE. The only place FlowPilot changes real capacity. Atomic, skill-checked, refuses to strand a service at zero active counters, and raises loudly rather than applying twice. Writes counter_assignments, flips counters/staff status, appends applied + eta_recalculated timeline events and one capacity_changed queue_event per affected service.';

-- -----------------------------------------------------------------------------
-- 4. expire_temporary_assignments()
--
-- Temporary assignments expire (CONTEXT.md). Safe to call on a timer, on page
-- focus, or twice in a row: the status = 'active' predicate makes it a no-op
-- once the work is done.
--
-- The originating intervention is found via the assignment_id recorded in the
-- 'applied' event's metadata, because counter_assignments has no
-- intervention_id column and 0001_init.sql must not be modified.
--
-- Deliberately does NOT resurrect the primary assignment that a reassign_staff
-- ended. Restoring the roster is a roster decision: the manager reassigns back,
-- or reset_demo() restores the baseline.
-- -----------------------------------------------------------------------------
drop function if exists public.expire_temporary_assignments() cascade;

create function public.expire_temporary_assignments()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r           record;
  v_int_id    uuid;
  v_rec_id    uuid;
  v_expired   integer := 0;
  v_completed integer := 0;
  v_ids       uuid[]  := '{}'::uuid[];
  v_services  uuid[]  := '{}'::uuid[];
  v_sid       uuid;
begin
  for r in
    select ca.id, ca.counter_id, ca.staff_id, ca.service_id, ca.ends_at,
           c.name  as counter_name,
           st.name as staff_name,
           sv.name as service_name
      from public.counter_assignments ca
      join public.counters c    on c.id  = ca.counter_id
      join public.services sv   on sv.id = ca.service_id
      left join public.staff st on st.id = ca.staff_id
     where ca.assignment_type = 'temporary'
       and ca.status = 'active'
       and ca.ends_at is not null
       and ca.ends_at <= now()
     order by ca.ends_at
  loop
    update public.counter_assignments
       set status = 'ended'
     where id = r.id
       and status = 'active';

    if not found then
      continue;  -- expired by a concurrent caller between select and update
    end if;

    v_expired := v_expired + 1;
    v_ids     := v_ids || r.id;

    if not (r.service_id = any(v_services)) then
      v_services := v_services || r.service_id;
    end if;

    -- Release the person and the furniture, but only if nothing else holds them.
    if r.staff_id is not null and not exists (
      select 1 from public.counter_assignments
       where staff_id = r.staff_id and status = 'active'
    ) then
      update public.staff set status = 'idle' where id = r.staff_id;
    end if;

    if not exists (
      select 1 from public.counter_assignments
       where counter_id = r.counter_id and status = 'active'
    ) then
      update public.counters set status = 'inactive' where id = r.counter_id;
    end if;

    -- Close out the intervention that created this assignment, if any.
    select ie.intervention_id into v_int_id
      from public.intervention_events ie
     where ie.event_type = 'applied'
       and ie.metadata ->> 'assignment_id' = r.id::text
     order by ie.created_at desc
     limit 1;

    if v_int_id is not null then
      update public.interventions
         set status = 'completed'
       where id = v_int_id
         and status = 'applied';

      if found then
        v_completed := v_completed + 1;

        insert into public.intervention_events (
          intervention_id, event_type, message, metadata, created_at
        ) values (
          v_int_id, 'completed',
          format('Temporary assignment ended. %s stepped away from %s, and %s is back to its normal capacity.',
                 coalesce(r.staff_name, 'The staff member'), r.counter_name, r.service_name),
          jsonb_build_object(
            'sequence', 8,
            'assignment_id', r.id,
            'service_id', r.service_id,
            'counter_id', r.counter_id,
            'staff_id', r.staff_id,
            'ends_at', r.ends_at),
          clock_timestamp()
        );

        select i.recommendation_id into v_rec_id
          from public.interventions i
         where i.id = v_int_id;

        if v_rec_id is not null then
          update public.recommendations set status = 'completed' where id = v_rec_id;
        end if;
      end if;
    end if;
  end loop;

  -- One replay frame per service that lost capacity.
  foreach v_sid in array v_services loop
    insert into public.queue_events (
      service_id, event_type, queue_length, active_counters, metadata, created_at
    ) values (
      v_sid,
      'capacity_changed',
      (select count(*) from public.tokens t
        where t.service_id = v_sid and t.status = 'waiting'),
      (select count(*) from public.counter_assignments ca
        where ca.service_id = v_sid and ca.status = 'active'),
      jsonb_build_object('source', 'expire_temporary_assignments'),
      clock_timestamp()
    );
  end loop;

  return jsonb_build_object(
    'expired_assignments', v_expired,
    'assignment_ids', to_jsonb(v_ids),
    'interventions_completed', v_completed,
    'affected_service_ids', to_jsonb(v_services)
  );
end
$fn$;

comment on function public.expire_temporary_assignments() is
  'Housekeeping. Ends temporary active assignments whose ends_at has passed, releases the staff member (idle) and counter (inactive) when nothing else holds them, moves the originating intervention to completed and appends a completed timeline event. Idempotent.';

-- -----------------------------------------------------------------------------
-- 5. reject_recommendation(p_recommendation_id, p_reason)
--
-- The manager dismisses FlowPilot's opinion.
--
-- DEVIATION, deliberate: intervention_events.intervention_id is NOT NULL, and a
-- Recommendation only becomes an Intervention when a human approves it
-- (CONTEXT.md). A recommendation rejected BEFORE approval therefore has no
-- intervention row to hang a timeline event on, and inventing one would put a
-- record in interventions that no human ever approved. So:
--   * always write an audit row to queue_events ('recommendation_rejected')
--     with the reason, so Operational Replay sees every rejection;
--   * additionally append the 'rejected' event to intervention_events when an
--     intervention already exists (approved, then withdrawn), and flip that
--     intervention to rejected too.
-- The return value reports which happened via 'timeline_event_written'.
-- -----------------------------------------------------------------------------
drop function if exists public.reject_recommendation(uuid, text) cascade;

create function public.reject_recommendation(
  p_recommendation_id uuid,
  p_reason            text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_rec      public.recommendations;
  v_lbl      jsonb;
  v_int_id   uuid;
  v_reason   text;
  v_msg      text;
  v_timeline boolean := false;
begin
  select * into v_rec
    from public.recommendations
   where id = p_recommendation_id
   for update;

  if not found then
    raise exception 'FlowPilot: recommendation % does not exist.', p_recommendation_id
      using errcode = 'P0001';
  end if;

  if v_rec.status in ('applied', 'completed') then
    raise exception
      'FlowPilot: this recommendation is already "%" and cannot be rejected. Its capacity change has already happened.',
      v_rec.status
      using errcode = 'P0001';
  end if;

  if v_rec.status = 'rejected' then
    raise exception 'FlowPilot: this recommendation has already been rejected.'
      using errcode = 'P0001';
  end if;

  v_lbl    := public.fp_action_label(v_rec.action_type, v_rec.action_payload);
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  update public.recommendations set status = 'rejected' where id = v_rec.id;

  if v_rec.action_type = 'activate_counter' then
    v_msg := format('Manager rejected opening %s with %s for %s.',
      v_lbl ->> 'counter_name', v_lbl ->> 'staff_name', v_lbl ->> 'service_name');
  else
    v_msg := format('Manager rejected moving %s from %s to %s.',
      v_lbl ->> 'staff_name', v_lbl ->> 'from_service_name', v_lbl ->> 'to_service_name');
  end if;

  if v_reason is not null then
    v_msg := v_msg || ' Reason: ' || v_reason;
  end if;

  -- If it had already become an Intervention, withdraw that too and put the
  -- rejection on the timeline, where Control is watching.
  select i.id into v_int_id
    from public.interventions i
   where i.recommendation_id = v_rec.id
     and i.status not in ('applied', 'completed')
   order by i.created_at desc
   limit 1;

  if v_int_id is not null then
    update public.interventions set status = 'rejected' where id = v_int_id;

    insert into public.intervention_events (
      intervention_id, event_type, message, metadata, created_at
    ) values (
      v_int_id, 'rejected', v_msg,
      jsonb_build_object(
        'sequence', 9,
        'recommendation_id', v_rec.id,
        'reason', v_reason,
        'action_type', v_rec.action_type),
      clock_timestamp()
    );

    v_timeline := true;
  end if;

  insert into public.queue_events (
    service_id, event_type, queue_length, active_counters, metadata, created_at
  ) values (
    v_rec.service_id,
    'recommendation_rejected',
    (select count(*) from public.tokens t
      where t.service_id = v_rec.service_id and t.status = 'waiting'),
    (select count(*) from public.counter_assignments ca
      where ca.service_id = v_rec.service_id and ca.status = 'active'),
    jsonb_build_object(
      'recommendation_id', v_rec.id,
      'intervention_id', v_int_id,
      'reason', v_reason,
      'action_type', v_rec.action_type,
      'message', v_msg,
      'source', 'reject_recommendation'),
    clock_timestamp()
  );

  return jsonb_build_object(
    'recommendation_id', v_rec.id,
    'status', 'rejected',
    'intervention_id', v_int_id,
    'reason', v_reason,
    'message', v_msg,
    'timeline_event_written', v_timeline
  );
end
$fn$;

comment on function public.reject_recommendation(uuid, text) is
  'Manager dismisses a recommendation. Sets it rejected, records the reason, withdraws the not-yet-applied intervention and appends a rejected timeline event if one exists, and always writes a recommendation_rejected queue_event for Replay.';

-- =============================================================================
-- 6. Grants
-- =============================================================================
-- The clients (Control, Desk, Visitor) authenticate with the publishable key as
-- the anon role. Every function above is SECURITY DEFINER with a pinned
-- search_path, so anon may call them without needing to reason about table
-- privileges. This is also why the keystone cannot be reimplemented per
-- surface: the RPC is the only door.
grant execute on function public.fp_action_label(text, jsonb)      to anon, authenticated;
grant execute on function public.approve_recommendation(uuid)      to anon, authenticated;
grant execute on function public.accept_intervention(uuid)         to anon, authenticated;
grant execute on function public.apply_intervention(uuid)          to anon, authenticated;
grant execute on function public.expire_temporary_assignments()    to anon, authenticated;
grant execute on function public.reject_recommendation(uuid, text) to anon, authenticated;

-- =============================================================================
-- END 0002_apply_intervention.sql
-- =============================================================================
