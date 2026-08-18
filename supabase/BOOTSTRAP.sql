-- FlowPilot — one-paste database bootstrap.
-- Paste this whole file into the Supabase SQL editor and Run.
-- Safe to re-run: it drops and recreates everything, then reseeds.
-- Contains: 0001_init.sql (schema) + seed.sql (demo data).
-- The apply_intervention() RPCs are in 0002 and are pasted separately.

-- ============ 0001_init.sql ============
-- =============================================================================
-- FlowPilot — 0001_init.sql
-- Postgres / Supabase. Runs top-to-bottom in the Supabase SQL editor.
--
-- CONTRACT SOURCE OF TRUTH: flowpilot-core/src/types.ts (FROZEN).
-- Every status CHECK constraint below mirrors a union type in that file
-- character-for-character. If you need a new status string, change types.ts
-- first, then this file. Never the other way round.
--
-- Deviations from FLOWPILOT_SPEC_SHEET_V2.md section 5 (deliberate, approved):
--   1. action_type is CHECK-constrained to ('activate_counter','reassign_staff').
--      'reassign_counter' does not exist in this domain. The movable unit is a
--      (staff, counter, service) assignment. Physical counters do not move.
--   2. human_minutes_saved is renamed estimated_minutes_returned everywhere
--      (recommendations, interventions). It is a counterfactual estimate from
--      the simulator, never a measurement.
--
-- This migration is destructive by design (demo reset). It drops and recreates
-- the whole public FlowPilot schema.
-- =============================================================================

-- gen_random_uuid() is core Postgres from 13 onwards; pgcrypto is only a
-- belt-and-braces fallback for older installs. Never let it break the run.
do $ext$
begin
  create extension if not exists pgcrypto;
exception when others then
  raise notice 'pgcrypto unavailable - relying on built-in gen_random_uuid() (Postgres 13+)';
end
$ext$;

-- -----------------------------------------------------------------------------
-- 0. Idempotent teardown (demo resets).
-- -----------------------------------------------------------------------------
drop function if exists public.reset_demo() cascade;
drop function if exists public.simulate_rush() cascade;

drop table if exists public.crowd_samples cascade;
drop table if exists public.service_flow_edges cascade;
drop table if exists public.journey_steps cascade;
drop table if exists public.journeys cascade;
drop table if exists public.intervention_events cascade;
drop table if exists public.interventions cascade;
drop table if exists public.recommendations cascade;
drop table if exists public.queue_events cascade;
drop table if exists public.tokens cascade;
drop table if exists public.counter_assignments cascade;
drop table if exists public.counters cascade;
drop table if exists public.staff_skills cascade;
drop table if exists public.staff cascade;
drop table if exists public.services cascade;
drop table if exists public.locations cascade;
drop table if exists public.organizations cascade;

drop sequence if exists public.token_number_seq cascade;
drop sequence if exists public.journey_number_seq cascade;

create sequence public.token_number_seq start 101;
create sequence public.journey_number_seq start 101;

-- -----------------------------------------------------------------------------
-- 1. organizations
-- -----------------------------------------------------------------------------
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  industry_type text not null default 'education',
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. locations
-- -----------------------------------------------------------------------------
create table public.locations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  max_capacity    integer not null default 200 check (max_capacity > 0),
  created_at      timestamptz not null default now()
);

create index locations_organization_id_idx on public.locations (organization_id);

-- -----------------------------------------------------------------------------
-- 3. services
-- -----------------------------------------------------------------------------
create table public.services (
  id                       uuid primary key default gen_random_uuid(),
  location_id              uuid not null references public.locations(id) on delete cascade,
  name                     text not null,
  slug                     text not null unique,
  description              text,
  default_service_minutes  numeric not null default 5 check (default_service_minutes > 0),
  healthy_wait_threshold   numeric not null default 15 check (healthy_wait_threshold >= 0),
  critical_wait_threshold  numeric not null default 30 check (critical_wait_threshold >= 0),
  created_at               timestamptz not null default now(),
  constraint services_thresholds_ordered
    check (critical_wait_threshold > healthy_wait_threshold)
);

comment on column public.services.default_service_minutes is
  'Fallback service duration used by calculateAverageServiceMinutes() when there is not enough completed-token history.';
comment on column public.services.healthy_wait_threshold is
  'predictedWaitMinutes <= this => QueueHealth "healthy". Between the two => "busy".';
comment on column public.services.critical_wait_threshold is
  'predictedWaitMinutes >= this => QueueHealth "critical".';

create index services_location_id_idx on public.services (location_id);

-- -----------------------------------------------------------------------------
-- 4. staff
-- -----------------------------------------------------------------------------
create table public.staff (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  -- StaffAvailability in types.ts, and it maps onto StaffMemberState.availability.
  -- The recommendation engine relies on status = 'idle' to find an
  -- activate_counter candidate.
  status          text not null default 'idle'
                  check (status in ('idle','active')),
  created_at      timestamptz not null default now()
);

comment on column public.staff.status is
  'StaffAvailability in types.ts; feeds StaffMemberState.availability. idle = free to be bound to an inactive counter (the activate_counter candidate). active = currently bound to an active counter. There is deliberately no "offline" value: types.ts does not define one, and adding one here would let status strings drift from the frozen contract.';

create index staff_organization_id_idx on public.staff (organization_id);
create index staff_status_idx on public.staff (status);

-- -----------------------------------------------------------------------------
-- 5. staff_skills — gates reassign_staff. A staff member may only be rebound
--    to a service they hold a skill row for.
-- -----------------------------------------------------------------------------
create table public.staff_skills (
  staff_id    uuid not null references public.staff(id) on delete cascade,
  service_id  uuid not null references public.services(id) on delete cascade,
  proficiency numeric check (proficiency is null or (proficiency >= 0 and proficiency <= 1)),
  created_at  timestamptz not null default now(),
  primary key (staff_id, service_id)
);

create index staff_skills_service_id_idx on public.staff_skills (service_id);

-- -----------------------------------------------------------------------------
-- 6. counters — physical desks. These never move between services.
-- -----------------------------------------------------------------------------
create table public.counters (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name        text not null,
  -- CounterStatus in types.ts
  status      text not null default 'inactive'
              check (status in ('active','inactive')),
  created_at  timestamptz not null default now()
);

create index counters_location_id_idx on public.counters (location_id);
create index counters_status_idx on public.counters (status);

-- -----------------------------------------------------------------------------
-- 7. counter_assignments — the movable unit: a (staff, counter, service) binding
-- -----------------------------------------------------------------------------
create table public.counter_assignments (
  id              uuid primary key default gen_random_uuid(),
  counter_id      uuid not null references public.counters(id) on delete cascade,
  staff_id        uuid references public.staff(id) on delete set null,
  service_id      uuid not null references public.services(id) on delete cascade,
  -- AssignmentType in types.ts
  assignment_type text not null default 'primary'
                  check (assignment_type in ('primary','temporary')),
  -- No AssignmentStatus union exists in types.ts. See README deviation notes.
  status          text not null default 'active'
                  check (status in ('active','ended')),
  started_at      timestamptz not null default now(),
  ends_at         timestamptz,
  created_at      timestamptz not null default now()
);

comment on table public.counter_assignments is
  'A (staff, counter, service) binding. activate_counter creates one; reassign_staff ends one and creates a temporary one. Counters themselves never change service.';
comment on column public.counter_assignments.ends_at is
  'Set for temporary assignments (durationMinutes from the action payload). NULL for open-ended primary bindings.';

-- HOT QUERY: active capacity per service (activeCounters in QueueSnapshot).
create index counter_assignments_service_status_idx
  on public.counter_assignments (service_id, status);
create index counter_assignments_counter_id_idx on public.counter_assignments (counter_id);
create index counter_assignments_staff_id_idx   on public.counter_assignments (staff_id);

-- -----------------------------------------------------------------------------
-- 8. journeys / journey_steps — declared before tokens so tokens can FK them
-- -----------------------------------------------------------------------------
create table public.journeys (
  id             uuid primary key default gen_random_uuid(),
  journey_number text not null unique,
  -- No JourneyStatus union exists in types.ts. See README deviation notes.
  status         text not null default 'active'
                 check (status in ('active','completed','cancelled')),
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create table public.journey_steps (
  id             uuid primary key default gen_random_uuid(),
  journey_id     uuid not null references public.journeys(id) on delete cascade,
  service_id     uuid not null references public.services(id) on delete cascade,
  sequence       integer not null check (sequence >= 0),
  -- No JourneyStepStatus union exists in types.ts. Values chosen to match the
  -- FR-022 render: completed / active / pending, plus skipped.
  status         text not null default 'pending'
                 check (status in ('pending','active','completed','skipped')),
  predicted_wait numeric,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (journey_id, sequence)
);

create index journey_steps_journey_id_idx on public.journey_steps (journey_id);
create index journey_steps_service_id_idx on public.journey_steps (service_id);

-- -----------------------------------------------------------------------------
-- 9. tokens
-- -----------------------------------------------------------------------------
create table public.tokens (
  id                 uuid primary key default gen_random_uuid(),
  service_id         uuid not null references public.services(id) on delete cascade,
  journey_id         uuid references public.journeys(id) on delete set null,
  token_number       text not null,
  -- TokenStatus in types.ts
  status             text not null default 'waiting'
                     check (status in ('waiting','called','serving','completed','cancelled','skipped')),
  priority           integer not null default 0,
  joined_at          timestamptz not null default now(),
  called_at          timestamptz,
  service_started_at timestamptz,
  completed_at       timestamptz,
  cancelled_at       timestamptz,
  is_simulated       boolean not null default false,
  created_at         timestamptz not null default now()
);

comment on column public.tokens.is_simulated is
  'TRUE for tokens injected by simulate_rush(). Real demo traffic stays FALSE so the two can be told apart on Control.';
comment on column public.tokens.service_started_at is
  'With completed_at this is the ONLY measured service-duration source. calculateAverageServiceMinutes() reads completed tokens where both are non-null.';

-- HOT QUERY: the live queue for a service, in join order.
create index tokens_service_status_joined_idx
  on public.tokens (service_id, status, joined_at);
-- HOT QUERY: recent completed durations for calculateAverageServiceMinutes().
create index tokens_service_completed_idx
  on public.tokens (service_id, completed_at desc)
  where status = 'completed';
create index tokens_journey_id_idx    on public.tokens (journey_id);
create index tokens_token_number_idx  on public.tokens (token_number);

-- -----------------------------------------------------------------------------
-- 10. queue_events — append-only; feeds Operational Replay
-- -----------------------------------------------------------------------------
create table public.queue_events (
  id              uuid primary key default gen_random_uuid(),
  service_id      uuid not null references public.services(id) on delete cascade,
  token_id        uuid references public.tokens(id) on delete set null,
  -- Intentionally NOT check-constrained: the spec sheet defines no closed set
  -- for queue events (unlike intervention_events). Conventional values:
  --   token_joined, token_called, token_serving, token_completed,
  --   token_cancelled, token_skipped, snapshot, rush_simulated,
  --   capacity_changed, eta_recalculated
  event_type      text not null,
  queue_length    integer,
  active_counters integer,
  predicted_wait  numeric,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- HOT QUERY: replay / forecast window for one service.
create index queue_events_service_created_idx
  on public.queue_events (service_id, created_at);
create index queue_events_token_id_idx on public.queue_events (token_id);

-- -----------------------------------------------------------------------------
-- 11. recommendations
-- -----------------------------------------------------------------------------
create table public.recommendations (
  id                         uuid primary key default gen_random_uuid(),
  service_id                 uuid not null references public.services(id) on delete cascade,
  -- ActionType in types.ts. 'reassign_counter' is DELETED from this domain.
  action_type                text not null
                             check (action_type in ('activate_counter','reassign_staff')),
  action_payload             jsonb not null default '{}'::jsonb,
  baseline_wait              numeric,
  predicted_wait             numeric,
  baseline_person_minutes    numeric,
  predicted_person_minutes   numeric,
  estimated_minutes_returned numeric,
  confidence                 text
                             check (confidence is null or confidence in ('low','medium','high')),
  -- InterventionStatus in types.ts (shared lifecycle with interventions)
  status                     text not null default 'recommended'
                             check (status in ('recommended','approved','pending_staff','accepted','applied','rejected','completed')),
  created_at                 timestamptz not null default now()
);

comment on column public.recommendations.estimated_minutes_returned is
  'ESTIMATED, NOT MEASURED. Counterfactual person-minutes difference produced by the simulator: max(0, baseline_person_minutes - predicted_person_minutes). It is what the model believes WOULD have been lost had the intervention not been applied. Never present it as an observed measurement. Renamed from the spec-sheet column human_minutes_saved. UI label: "Estimated time returned".';
comment on column public.recommendations.action_payload is
  'ActivateCounterPayload | ReassignStaffPayload from types.ts, camelCase keys preserved verbatim.';
comment on column public.recommendations.predicted_wait is
  'Maps to Recommendation.optimizedWaitMinutes in types.ts (spec-sheet column name kept).';
comment on column public.recommendations.predicted_person_minutes is
  'Maps to Recommendation.optimizedPersonMinutes in types.ts (spec-sheet column name kept).';

create index recommendations_service_created_idx
  on public.recommendations (service_id, created_at desc);
create index recommendations_status_idx on public.recommendations (status);

-- -----------------------------------------------------------------------------
-- 12. interventions
-- -----------------------------------------------------------------------------
create table public.interventions (
  id                         uuid primary key default gen_random_uuid(),
  recommendation_id          uuid references public.recommendations(id) on delete set null,
  action_type                text not null
                             check (action_type in ('activate_counter','reassign_staff')),
  action_payload             jsonb not null default '{}'::jsonb,
  -- InterventionStatus in types.ts
  status                     text not null default 'recommended'
                             check (status in ('recommended','approved','pending_staff','accepted','applied','rejected','completed')),
  approved_at                timestamptz,
  accepted_at                timestamptz,
  applied_at                 timestamptz,
  estimated_minutes_returned numeric,
  created_at                 timestamptz not null default now()
);

comment on column public.interventions.estimated_minutes_returned is
  'ESTIMATED, NOT MEASURED. Carried over from the originating recommendation at apply time. Counterfactual simulator output, not an observation of real waiting time. Renamed from the spec-sheet column human_minutes_saved. Cumulative session total = sum over interventions where status in (applied, completed).';

create index interventions_recommendation_id_idx on public.interventions (recommendation_id);
create index interventions_status_created_idx    on public.interventions (status, created_at desc);

-- -----------------------------------------------------------------------------
-- 13. intervention_events — append-only timeline. Do not fabricate timestamps.
-- -----------------------------------------------------------------------------
create table public.intervention_events (
  id              uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.interventions(id) on delete cascade,
  -- Canonical values (spec sheet section 12): forecast_triggered,
  -- recommendation_created, approved, staff_notified, staff_accepted,
  -- applied, eta_recalculated, completed, rejected.
  -- Left unconstrained so the timeline can grow without a migration.
  event_type      text not null,
  message         text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- HOT QUERY: chronological timeline for one intervention.
create index intervention_events_intervention_created_idx
  on public.intervention_events (intervention_id, created_at);

-- -----------------------------------------------------------------------------
-- 14. service_flow_edges — facility flow graph / digital twin
-- -----------------------------------------------------------------------------
create table public.service_flow_edges (
  id              uuid primary key default gen_random_uuid(),
  from_service_id uuid not null references public.services(id) on delete cascade,
  to_service_id   uuid not null references public.services(id) on delete cascade,
  expected_share  numeric not null default 0
                  check (expected_share >= 0 and expected_share <= 1),
  source          text not null default 'seed'
                  check (source in ('seed','observed','journey')),
  created_at      timestamptz not null default now(),
  constraint service_flow_edges_no_self_loop check (from_service_id <> to_service_id),
  unique (from_service_id, to_service_id)
);

comment on column public.service_flow_edges.expected_share is
  'Fraction 0..1 of visitors completing from_service who go on to to_service. Drives downstreamArrivalRatePerMinute in FacilityServiceState.';

create index service_flow_edges_from_idx on public.service_flow_edges (from_service_id);
create index service_flow_edges_to_idx   on public.service_flow_edges (to_service_id);

-- -----------------------------------------------------------------------------
-- 15. crowd_samples — OPTIONAL per spec sheet section 5. Unseeded.
-- -----------------------------------------------------------------------------
create table public.crowd_samples (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  service_id  uuid references public.services(id) on delete cascade,
  head_count  integer check (head_count >= 0),
  source      text not null default 'manual',
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index crowd_samples_location_created_idx on public.crowd_samples (location_id, created_at);

-- =============================================================================
-- 16. Realtime
-- =============================================================================
-- The statement we need is:
--   alter publication supabase_realtime add table public.<table>;
-- Guarded below so re-running this migration cannot fail with 42710 (relation
-- is already member of publication), and so this file still runs on a plain
-- Postgres that has no supabase_realtime publication.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime not found - skipping Realtime setup';
    return;
  end if;

  for t in
    select unnest(array[
      'tokens',
      'counter_assignments',
      'recommendations',
      'interventions',
      'intervention_events',
      'queue_events'
    ])
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname   = 'supabase_realtime'
        and schemaname = 'public'
        and tablename  = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- Full row images so clients can filter on OLD values and diff updates.
alter table public.tokens              replica identity full;
alter table public.counter_assignments replica identity full;
alter table public.recommendations     replica identity full;
alter table public.interventions       replica identity full;
alter table public.intervention_events replica identity full;
alter table public.queue_events        replica identity full;

-- =============================================================================
-- 17. Row Level Security
-- =============================================================================
-- HACKATHON POSTURE: RLS is ON for every table, with fully permissive anon +
-- authenticated read/write policies. There is no auth in this 3-hour demo; the
-- goal is "it works from the client with only the anon key".
--
-- ###########################################################################
-- # PRODUCTION POLICIES — what the block below would become.                #
-- # DO NOT SHIP THE PERMISSIVE POLICIES. Replace them with:                 #
-- #                                                                         #
-- # -- Catalog: world readable, never client writable.                      #
-- # create policy services_public_read on public.services                   #
-- #   for select to anon, authenticated using (true);                       #
-- #                                                                         #
-- # -- Visitors: read/insert only their OWN tokens.                         #
-- # --   (requires adding tokens.owner_id uuid references auth.users(id))   #
-- # create policy tokens_owner_select on public.tokens                      #
-- #   for select to authenticated using (owner_id = auth.uid());            #
-- # create policy tokens_owner_insert on public.tokens                      #
-- #   for insert to authenticated with check (owner_id = auth.uid());       #
-- #                                                                         #
-- # -- Desk operators: mutate tokens only for the service they are bound to.#
-- # create policy tokens_desk_update on public.tokens                       #
-- #   for update to authenticated using (                                   #
-- #     exists (                                                            #
-- #       select 1 from public.counter_assignments ca                       #
-- #       join public.staff s on s.id = ca.staff_id                         #
-- #       where ca.service_id = tokens.service_id                           #
-- #         and ca.status = 'active'                                        #
-- #         and s.auth_user_id = auth.uid()                                 #
-- #     )                                                                   #
-- #   );                                                                    #
-- #                                                                         #
-- # -- Capacity + intelligence tables: writable only by an ops-manager      #
-- # -- claim or service_role. anon gets SELECT at most.                     #
-- # create policy interventions_ops_all on public.interventions             #
-- #   for all to authenticated                                              #
-- #   using      (auth.jwt() ->> 'role' = 'ops_manager')                    #
-- #   with check (auth.jwt() ->> 'role' = 'ops_manager');                   #
-- #                                                                         #
-- # -- Append-only audit tables: INSERT + SELECT only.                      #
-- # revoke update, delete on public.queue_events from anon, authenticated;  #
-- # revoke update, delete on public.intervention_events                     #
-- #   from anon, authenticated;                                             #
-- #                                                                         #
-- # -- reset_demo() / simulate_rush() would be dropped, or their EXECUTE    #
-- # -- grant narrowed to service_role.                                      #
-- ###########################################################################
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename in (
        'organizations','locations','services','staff','staff_skills',
        'counters','counter_assignments','tokens','queue_events',
        'recommendations','interventions','intervention_events',
        'journeys','journey_steps','service_flow_edges','crowd_samples'
      )
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_demo_all', t);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
      t || '_demo_all', t
    );
  end loop;
end
$$;

-- =============================================================================
-- 18. Demo control functions
-- =============================================================================

-- Baseline live state, defined in exactly one place and used by BOTH seed.sql
-- and the Control "Reset Demo" button:
--   waiting  : documents 5, fees 3, examination 6
--   serving  : one token per ACTIVE counter assignment
--   counters : Counter 1/2/3 active | Counter 4/5 inactive
--   staff    : whoever holds an active assignment is 'active', the rest 'idle'
create or replace function public.reset_demo()
returns jsonb
language plpgsql
as $fn$
declare
  v_documents   uuid;
  v_fees        uuid;
  v_examination uuid;
  v_waiting     integer := 0;
  v_serving     integer := 0;
  r             record;
  i             integer;
begin
  select id into v_documents   from public.services where slug = 'documents';
  select id into v_fees        from public.services where slug = 'fees';
  select id into v_examination from public.services where slug = 'examination';

  if v_documents is null or v_fees is null or v_examination is null then
    raise exception 'reset_demo(): services are not seeded - run supabase/seed.sql first';
  end if;

  -- 1. Wipe live state. Completed token history is preserved.
  delete from public.intervention_events;
  delete from public.interventions;
  delete from public.recommendations;
  delete from public.journey_steps;
  delete from public.journeys;
  delete from public.tokens
   where status <> 'completed' or is_simulated = true;
  delete from public.queue_events where token_id is null;
  delete from public.crowd_samples;

  -- 2. Restore baseline capacity.
  delete from public.counter_assignments where assignment_type = 'temporary';
  update public.counter_assignments set status = 'active', ends_at = null;
  update public.counters set status = 'active'
   where name in ('Counter 1','Counter 2','Counter 3');
  update public.counters set status = 'inactive'
   where name in ('Counter 4','Counter 5');
  update public.staff s set status = case
    when exists (
      select 1 from public.counter_assignments ca
      where ca.staff_id = s.id and ca.status = 'active'
    ) then 'active' else 'idle' end;

  -- 3. Re-seed the live waiting queue.
  for r in
    select * from (values
      (v_documents,   'D', 5),
      (v_fees,        'F', 3),
      (v_examination, 'E', 6)
    ) as v(service_id, prefix, n)
  loop
    for i in 1..r.n loop
      insert into public.tokens (service_id, token_number, status, joined_at)
      values (
        r.service_id,
        r.prefix || '-' || lpad(nextval('public.token_number_seq')::text, 3, '0'),
        'waiting',
        now() - make_interval(mins => (r.n - i + 1) * 3)
      );
      v_waiting := v_waiting + 1;
    end loop;
  end loop;

  -- 4. One 'serving' token per active counter assignment.
  for r in
    select ca.service_id, s.slug
      from public.counter_assignments ca
      join public.services s on s.id = ca.service_id
     where ca.status = 'active'
  loop
    insert into public.tokens (
      service_id, token_number, status, joined_at, called_at, service_started_at
    )
    values (
      r.service_id,
      upper(left(r.slug, 1)) || '-' || lpad(nextval('public.token_number_seq')::text, 3, '0'),
      'serving',
      now() - interval '9 minutes',
      now() - interval '3 minutes',
      now() - interval '2 minutes'
    );
    v_serving := v_serving + 1;
  end loop;

  -- 5. A t0 snapshot per service so Operational Replay has a first frame.
  insert into public.queue_events (
    service_id, event_type, queue_length, active_counters, metadata
  )
  select s.id,
         'snapshot',
         (select count(*) from public.tokens t
           where t.service_id = s.id and t.status = 'waiting'),
         (select count(*) from public.counter_assignments ca
           where ca.service_id = s.id and ca.status = 'active'),
         jsonb_build_object('reason', 'reset_demo')
    from public.services s;

  return jsonb_build_object(
    'reset', true,
    'waiting_tokens', v_waiting,
    'serving_tokens', v_serving,
    'completed_history_preserved',
      (select count(*) from public.tokens where status = 'completed')
  );
end
$fn$;

comment on function public.reset_demo() is
  'Truncates live state (waiting/called/serving and simulated tokens, journeys, recommendations, interventions, timelines) and re-seeds the baseline live queue plus baseline counter capacity. Completed token history is left intact so ETA stays realistic.';

-- Spec sheet section 24: Documents +8, Fees +4, Examination +12.
create or replace function public.simulate_rush()
returns jsonb
language plpgsql
as $fn$
declare
  r       record;
  i       integer;
  v_total integer := 0;
begin
  for r in
    select sv.id as service_id, v.prefix, v.n
      from (values
        ('documents',   'D',  8),
        ('fees',        'F',  4),
        ('examination', 'E', 12)
      ) as v(slug, prefix, n)
      join public.services sv on sv.slug = v.slug
  loop
    for i in 1..r.n loop
      insert into public.tokens (
        service_id, token_number, status, joined_at, is_simulated
      )
      values (
        r.service_id,
        r.prefix || '-' || lpad(nextval('public.token_number_seq')::text, 3, '0'),
        'waiting',
        now() - make_interval(secs => (r.n - i) * 20),
        true
      );
      v_total := v_total + 1;
    end loop;

    insert into public.queue_events (
      service_id, event_type, queue_length, active_counters, metadata
    )
    values (
      r.service_id,
      'rush_simulated',
      (select count(*) from public.tokens t
        where t.service_id = r.service_id and t.status = 'waiting'),
      (select count(*) from public.counter_assignments ca
        where ca.service_id = r.service_id and ca.status = 'active'),
      jsonb_build_object('added', r.n, 'is_simulated', true)
    );
  end loop;

  return jsonb_build_object(
    'rush', true,
    'tokens_added', v_total,
    'documents', 8,
    'fees', 4,
    'examination', 12
  );
end
$fn$;

comment on function public.simulate_rush() is
  'Injects the canonical demo rush (documents +8, fees +4, examination +12) as waiting tokens with is_simulated = true, and appends one rush_simulated queue_event per service.';

-- =============================================================================
-- 19. Grants
-- =============================================================================
-- Supabase already applies these via default privileges, but state them
-- explicitly so the schema works on a project whose defaults were tightened.
-- RLS (section 17) is what actually gates access; these are just the
-- table-level privileges RLS is evaluated on top of.
-- Both functions are SECURITY INVOKER, so a caller holding only the anon key
-- needs DML on the tables and nextval on token_number_seq.
grant usage on schema public to anon, authenticated;
grant all on all tables    in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

grant execute on function public.reset_demo()    to anon, authenticated;
grant execute on function public.simulate_rush() to anon, authenticated;

-- =============================================================================
-- END 0001_init.sql
-- =============================================================================

-- ============ seed.sql ============
-- =============================================================================
-- FlowPilot — seed.sql
-- Run AFTER supabase/migrations/0001_init.sql. Safe to re-run: every insert is
-- keyed on a stable UUID and uses ON CONFLICT, and the live queue is rebuilt by
-- reset_demo() at the bottom.
--
-- Fixed UUIDs are intentional. Web / Android / scripts may hardcode them.
-- See supabase/README.md for the full ID table.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Organization + location
-- -----------------------------------------------------------------------------
insert into public.organizations (id, name, industry_type) values
  ('00000000-0000-4000-8000-000000000001', 'MHSSCE', 'education')
on conflict (id) do update set name = excluded.name;

insert into public.locations (id, organization_id, name, max_capacity) values
  ('00000000-0000-4000-8000-000000000010',
   '00000000-0000-4000-8000-000000000001',
   'Student Services', 200)
on conflict (id) do update set name = excluded.name,
                               max_capacity = excluded.max_capacity;

-- -----------------------------------------------------------------------------
-- Services
--   healthy_wait_threshold  : <= this  => healthy
--   critical_wait_threshold : >= this  => critical  (between the two => busy)
-- -----------------------------------------------------------------------------
insert into public.services (
  id, location_id, name, slug, description,
  default_service_minutes, healthy_wait_threshold, critical_wait_threshold
) values
  ('00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000010',
   'Document Verification', 'documents',
   'Bonafide letters, transcripts, attestation and certificate verification.',
   4, 15, 30),
  ('00000000-0000-4000-8000-000000000102',
   '00000000-0000-4000-8000-000000000010',
   'Fees', 'fees',
   'Tuition and exam fee payment, receipts, refunds and instalment queries.',
   3, 12, 25),
  ('00000000-0000-4000-8000-000000000103',
   '00000000-0000-4000-8000-000000000010',
   'Examination Cell', 'examination',
   'Hall tickets, revaluation requests, result corrections and backlog forms.',
   6, 15, 30)
on conflict (id) do update set
  name                    = excluded.name,
  slug                    = excluded.slug,
  description             = excluded.description,
  default_service_minutes = excluded.default_service_minutes,
  healthy_wait_threshold  = excluded.healthy_wait_threshold,
  critical_wait_threshold = excluded.critical_wait_threshold;

-- -----------------------------------------------------------------------------
-- Staff
--   Staff A — documents + examination   (active)
--   Staff B — fees                      (active)
--   Staff C — documents + fees          (active)
--   Staff D — examination               (IDLE — the activate_counter candidate)
-- -----------------------------------------------------------------------------
insert into public.staff (id, organization_id, name, status) values
  ('00000000-0000-4000-8000-000000000201',
   '00000000-0000-4000-8000-000000000001', 'Priya Deshmukh', 'active'),
  ('00000000-0000-4000-8000-000000000202',
   '00000000-0000-4000-8000-000000000001', 'Rahul Iyer',     'active'),
  ('00000000-0000-4000-8000-000000000203',
   '00000000-0000-4000-8000-000000000001', 'Ayesha Khan',    'active'),
  ('00000000-0000-4000-8000-000000000204',
   '00000000-0000-4000-8000-000000000001', 'Vikram Rao',     'idle')
on conflict (id) do update set name   = excluded.name,
                               status = excluded.status;

insert into public.staff_skills (staff_id, service_id, proficiency) values
  -- Priya Deshmukh (Staff A): documents + examination
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 0.95),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000103', 0.80),
  -- Rahul Iyer (Staff B): fees
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102', 0.95),
  -- Ayesha Khan (Staff C): documents + fees
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000101', 0.85),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000102', 0.90),
  -- Vikram Rao (Staff D, idle): examination
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000103', 0.90)
on conflict (staff_id, service_id) do update set proficiency = excluded.proficiency;

-- -----------------------------------------------------------------------------
-- Counters (SRS section 15 desk layout)
--   Counter 1 documents desk    ACTIVE
--   Counter 2 documents desk    ACTIVE
--   Counter 3 fees desk         ACTIVE
--   Counter 4 fees desk         INACTIVE — spare capacity
--   Counter 5 examination desk  INACTIVE — the activate_counter target
--
-- A counter's SERVICE is expressed by its counter_assignment, never by a column
-- on this table: counters are physical desks and do not move. Only three staff
-- are on shift (the fourth is deliberately idle), so exactly three desks are
-- active at baseline — one per service.
-- -----------------------------------------------------------------------------
insert into public.counters (id, location_id, name, status) values
  ('00000000-0000-4000-8000-000000000301',
   '00000000-0000-4000-8000-000000000010', 'Counter 1', 'active'),
  ('00000000-0000-4000-8000-000000000302',
   '00000000-0000-4000-8000-000000000010', 'Counter 2', 'active'),
  ('00000000-0000-4000-8000-000000000303',
   '00000000-0000-4000-8000-000000000010', 'Counter 3', 'active'),
  ('00000000-0000-4000-8000-000000000304',
   '00000000-0000-4000-8000-000000000010', 'Counter 4', 'inactive'),
  ('00000000-0000-4000-8000-000000000305',
   '00000000-0000-4000-8000-000000000010', 'Counter 5', 'inactive')
on conflict (id) do update set name   = excluded.name,
                               status = excluded.status;

-- -----------------------------------------------------------------------------
-- counter_assignments — primary active bindings for the three counters that
-- start active. Counter 4 and Counter 5 have no binding: they are the spare
-- capacity the recommendation engine can activate.
--
-- Every service has EXACTLY ONE active counter at baseline. This matters:
-- calculateWaitMinutes() returns Infinity when activeCounters <= 0, so no
-- service may start at zero capacity or its ETA is unrenderable. The signature
-- acceptance test has a visitor join Examination, so Examination in particular
-- must be servable from t0.
--
-- Note Counter 2 is a documents desk currently staffed for Examination Cell.
-- That is legal and intentional: the movable unit is the (staff, counter,
-- service) assignment. Priya is the only on-shift staff member with the
-- examination skill, so she holds the examination binding.
-- -----------------------------------------------------------------------------
insert into public.counter_assignments (
  id, counter_id, staff_id, service_id, assignment_type, status, started_at
) values
  -- Counter 1 -> Ayesha Khan -> Document Verification
  ('00000000-0000-4000-8000-000000000401',
   '00000000-0000-4000-8000-000000000301',
   '00000000-0000-4000-8000-000000000203',
   '00000000-0000-4000-8000-000000000101',
   'primary', 'active', now() - interval '3 hours'),
  -- Counter 2 -> Priya Deshmukh -> Examination Cell
  ('00000000-0000-4000-8000-000000000402',
   '00000000-0000-4000-8000-000000000302',
   '00000000-0000-4000-8000-000000000201',
   '00000000-0000-4000-8000-000000000103',
   'primary', 'active', now() - interval '3 hours'),
  -- Counter 3 -> Rahul Iyer -> Fees
  ('00000000-0000-4000-8000-000000000403',
   '00000000-0000-4000-8000-000000000303',
   '00000000-0000-4000-8000-000000000202',
   '00000000-0000-4000-8000-000000000102',
   'primary', 'active', now() - interval '3 hours')
on conflict (id) do update set
  counter_id      = excluded.counter_id,
  staff_id        = excluded.staff_id,
  service_id      = excluded.service_id,
  assignment_type = excluded.assignment_type,
  status          = excluded.status;

-- -----------------------------------------------------------------------------
-- service_flow_edges — facility flow graph
--   documents   -> examination  0.6
--   examination -> fees         0.7
--   documents   -> fees         0.3
-- -----------------------------------------------------------------------------
insert into public.service_flow_edges (
  id, from_service_id, to_service_id, expected_share, source
) values
  ('00000000-0000-4000-8000-000000000501',
   '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000103', 0.6, 'seed'),
  ('00000000-0000-4000-8000-000000000502',
   '00000000-0000-4000-8000-000000000103',
   '00000000-0000-4000-8000-000000000102', 0.7, 'seed'),
  ('00000000-0000-4000-8000-000000000503',
   '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000102', 0.3, 'seed')
on conflict (from_service_id, to_service_id) do update set
  expected_share = excluded.expected_share,
  source         = excluded.source;

-- =============================================================================
-- Completed history — 40 tokens (15 documents / 12 fees / 13 examination)
-- so calculateAverageServiceMinutes() has real measured spans to average.
-- Durations cluster around each service's default_service_minutes with
-- +/- 25% variance. Spread backwards over roughly the last 5 hours.
-- =============================================================================
delete from public.tokens where status = 'completed';

-- Document Verification — default 4 min, durations 180-300s
insert into public.tokens (
  service_id, token_number, status,
  joined_at, called_at, service_started_at, completed_at
)
select
  sv.id,
  'D-' || lpad(nextval('public.token_number_seq')::text, 3, '0'),
  'completed',
  now() - make_interval(mins => g * 17 + 45),
  now() - make_interval(mins => g * 17 + 45) + interval '90 seconds',
  now() - make_interval(mins => g * 17 + 45) + interval '2 minutes',
  now() - make_interval(mins => g * 17 + 45) + interval '2 minutes'
        + make_interval(secs => (240 + (random() * 120 - 60))::int)
from public.services sv, generate_series(1, 15) as g
where sv.slug = 'documents';

-- Fees — default 3 min, durations 135-225s
insert into public.tokens (
  service_id, token_number, status,
  joined_at, called_at, service_started_at, completed_at
)
select
  sv.id,
  'F-' || lpad(nextval('public.token_number_seq')::text, 3, '0'),
  'completed',
  now() - make_interval(mins => g * 21 + 38),
  now() - make_interval(mins => g * 21 + 38) + interval '60 seconds',
  now() - make_interval(mins => g * 21 + 38) + interval '100 seconds',
  now() - make_interval(mins => g * 21 + 38) + interval '100 seconds'
        + make_interval(secs => (180 + (random() * 90 - 45))::int)
from public.services sv, generate_series(1, 12) as g
where sv.slug = 'fees';

-- Examination Cell — default 6 min, durations 270-450s
insert into public.tokens (
  service_id, token_number, status,
  joined_at, called_at, service_started_at, completed_at
)
select
  sv.id,
  'E-' || lpad(nextval('public.token_number_seq')::text, 3, '0'),
  'completed',
  now() - make_interval(mins => g * 23 + 52),
  now() - make_interval(mins => g * 23 + 52) + interval '3 minutes',
  now() - make_interval(mins => g * 23 + 52) + interval '4 minutes',
  now() - make_interval(mins => g * 23 + 52) + interval '4 minutes'
        + make_interval(secs => (360 + (random() * 180 - 90))::int)
from public.services sv, generate_series(1, 13) as g
where sv.slug = 'examination';

-- Historical completion events. These carry a token_id, so reset_demo() keeps
-- them: Operational Replay still has a past to scrub through after a reset.
insert into public.queue_events (
  service_id, token_id, event_type, predicted_wait, metadata, created_at
)
select t.service_id,
       t.id,
       'token_completed',
       round((extract(epoch from (t.completed_at - t.service_started_at)) / 60.0)::numeric, 2),
       jsonb_build_object('source', 'seed_history'),
       t.completed_at
from public.tokens t
where t.status = 'completed';

-- =============================================================================
-- Live state — delegated to reset_demo() so seed and reset can never drift.
--   waiting : documents 5, fees 3, examination 6
--   serving : one token per active counter assignment (Counter 1, 2, 3)
--
-- Resulting baseline health (1 active counter per service):
--   fees        3 waiting x 3 min => ~9 min   healthy
--   documents   5 waiting x 4 min => ~20 min  busy
--   examination 6 waiting x 6 min => ~36 min  CRITICAL
--
-- Examination is therefore the pressure point from t0, and the P1 fix is
-- deterministic: activate_counter on Counter 5 with Vikram Rao, the idle
-- examination-skilled staff member. simulate_rush() deepens the same crisis.
-- =============================================================================
select public.reset_demo() as reset_demo_result;

-- =============================================================================
-- Verification summary — eyeball this after running.
-- =============================================================================
select
  s.slug,
  s.default_service_minutes,
  count(*) filter (where t.status = 'waiting')   as waiting,
  count(*) filter (where t.status = 'serving')   as serving,
  count(*) filter (where t.status = 'completed') as completed,
  (select count(*) from public.counter_assignments ca
    where ca.service_id = s.id and ca.status = 'active') as active_counters,
  round(avg(
    (extract(epoch from (t.completed_at - t.service_started_at)) / 60.0)::numeric
  ) filter (where t.status = 'completed'), 2) as measured_avg_service_minutes
from public.services s
left join public.tokens t on t.service_id = s.id
group by s.id, s.slug, s.default_service_minutes
order by s.slug;
