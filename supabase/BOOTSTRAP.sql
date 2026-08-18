-- FlowPilot — complete one-paste database bootstrap.
-- Paste this entire file into the Supabase SQL editor and press Run.
-- Safe to re-run: it drops and recreates everything, then reseeds.
--
-- Contents, in the order verified against Postgres:
--   1. 0001_init.sql               16 tables, CHECK constraints, indexes, RLS, Realtime
--   2. seed.sql                    MHSSCE demo data + service history for real ETAs
--   3. 0002_apply_intervention.sql  the closed-loop RPCs, including apply_intervention()
--   4. 0003_reset_demo_api_safe.sql reset_demo() with WHERE clauses, so it is legal via the API
--   5. 0004_desk_counter_toggle.sql set_counter_active(), the Desk's own Counter toggle

-- =================== 1/5  0001_init.sql ===================
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

-- =================== 2/5  seed.sql ===================
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

-- =================== 3/5  0002_apply_intervention.sql ===================
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

-- =================== 4/5  0003_reset_demo_api_safe.sql ===================
-- =============================================================================
-- FlowPilot — 0003_reset_demo_api_safe.sql
--
-- BUG FIX, found by running the golden path against the live project:
-- reset_demo() raised SQLSTATE 21000 "DELETE requires a WHERE clause" and did
-- nothing at all.
--
-- Supabase runs API sessions with pg_safeupdate armed, so an UPDATE or DELETE
-- with no WHERE clause is rejected. That protection is a good thing — it is what
-- stops a client wiping a table — but reset_demo() is SECURITY INVOKER, so its
-- body executes inside that same protected session and its seven unqualified
-- statements were all illegal there. It only ever worked from the SQL editor.
--
-- The consequence was worse than a broken script: Control's "Reset Demo" button
-- would have failed on stage, and INTEGRATION.md tells all three teams to
-- rehearse with reset_demo() rather than by hand.
--
-- The fix is to give every statement a real predicate. `where id is not null` is
-- always true on a primary key, so the behaviour is unchanged and pg_safeupdate
-- is satisfied. SECURITY INVOKER is kept deliberately: the function needs DML
-- under the caller's RLS plus nextval on token_number_seq, exactly as before.
--
-- Runs standalone AFTER 0001_init.sql (and is idempotent — it is a
-- CREATE OR REPLACE of one function). simulate_rush() needs no change: it only
-- INSERTs, and pg_safeupdate does not police inserts.
-- =============================================================================

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
  --    Every predicate below is trivially true; it exists so the statement is
  --    legal in a pg_safeupdate-armed API session.
  delete from public.intervention_events where id is not null;
  delete from public.interventions       where id is not null;
  delete from public.recommendations     where id is not null;
  delete from public.journey_steps       where id is not null;
  delete from public.journeys            where id is not null;
  delete from public.tokens
   where status <> 'completed' or is_simulated = true;
  delete from public.queue_events where token_id is null;
  delete from public.crowd_samples where id is not null;

  -- 2. Restore baseline capacity.
  delete from public.counter_assignments where assignment_type = 'temporary';
  update public.counter_assignments set status = 'active', ends_at = null
   where id is not null;
  update public.counters set status = 'active'
   where name in ('Counter 1','Counter 2','Counter 3');
  update public.counters set status = 'inactive'
   where name in ('Counter 4','Counter 5');
  update public.staff s set status = case
    when exists (
      select 1 from public.counter_assignments ca
      where ca.staff_id = s.id and ca.status = 'active'
    ) then 'active' else 'idle' end
   where s.id is not null;

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
  'Truncates live state (waiting/called/serving and simulated tokens, journeys, recommendations, interventions, timelines) and re-seeds the baseline live queue plus baseline counter capacity. Completed token history is left intact so ETA stays realistic. Every DELETE/UPDATE carries a predicate so the function is legal in a pg_safeupdate-armed Supabase API session (see 0003).';

grant execute on function public.reset_demo() to anon, authenticated;

-- =============================================================================
-- END 0003_reset_demo_api_safe.sql
-- =============================================================================

-- =================== 5/5  0004_desk_counter_toggle.sql ===================
-- =============================================================================
-- FlowPilot — 0004_desk_counter_toggle.sql
--
-- The Desk's own Counter toggle. NOT one of the two Intervention action types
-- (activate_counter, reassign_staff) from ADR-0001 — those move an Assignment
-- between Services under a Recommendation, gated by Skill. This is smaller and
-- more local: a Staff member stepping away from, or back to, the SAME Counter
-- and Service they are already bound to. No Skill check is needed because
-- nothing about who-serves-what is changing, only whether they are presently
-- at it.
--
-- INTEGRATION.md says "Do not write counter_assignments by hand from a
-- client." This RPC is what keeps that true for the Desk: the toggle still
-- goes through one security-definer door, same as every other capacity write.
--
-- Runs standalone AFTER 0001_init.sql and 0002_apply_intervention.sql.
-- =============================================================================

drop function if exists public.set_counter_active(uuid, boolean) cascade;

create function public.set_counter_active(p_counter_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_counter     public.counters;
  v_assignment  public.counter_assignments;
  v_service_id  uuid;
begin
  select * into v_counter from public.counters where id = p_counter_id for update;

  if not found then
    raise exception 'FlowPilot: counter % does not exist.', p_counter_id
      using errcode = 'P0001';
  end if;

  if p_active = false then
    if v_counter.status = 'inactive' then
      raise exception
        'FlowPilot: % is already inactive.', v_counter.name
        using errcode = 'P0001';
    end if;

    select * into v_assignment
      from public.counter_assignments
     where counter_id = p_counter_id and status = 'active'
     order by started_at desc
     limit 1
     for update;

    if not found then
      raise exception
        'FlowPilot: % has no active assignment to end.', v_counter.name
        using errcode = 'P0001';
    end if;

    update public.counter_assignments
       set status = 'ended', ends_at = now()
     where id = v_assignment.id;

    update public.counters set status = 'inactive' where id = p_counter_id;

    if v_assignment.staff_id is not null and not exists (
      select 1 from public.counter_assignments
       where staff_id = v_assignment.staff_id and status = 'active'
    ) then
      update public.staff set status = 'idle' where id = v_assignment.staff_id;
    end if;

    return jsonb_build_object(
      'counter_id', p_counter_id,
      'active', false,
      'ended_assignment_id', v_assignment.id,
      'service_id', v_assignment.service_id
    );
  end if;

  -- p_active = true: resume this Counter's own primary Assignment. Reviving a
  -- Recommendation-driven temporary Assignment is deliberately out of scope —
  -- that Assignment's lifecycle belongs to apply_intervention() /
  -- expire_temporary_assignments(), not to a manual toggle.
  if v_counter.status = 'active' then
    raise exception
      'FlowPilot: % is already active.', v_counter.name
      using errcode = 'P0001';
  end if;

  select * into v_assignment
    from public.counter_assignments
   where counter_id = p_counter_id and assignment_type = 'primary'
   order by started_at desc
   limit 1
   for update;

  if not found then
    raise exception
      'FlowPilot: % has no prior Assignment to resume. Open it via activate_counter first.',
      v_counter.name
      using errcode = 'P0001';
  end if;

  if v_assignment.status = 'active' then
    raise exception
      'FlowPilot: % already has an active assignment.', v_counter.name
      using errcode = 'P0001';
  end if;

  update public.counter_assignments
     set status = 'active', ends_at = null
   where id = v_assignment.id;

  update public.counters set status = 'active' where id = p_counter_id;

  if v_assignment.staff_id is not null then
    update public.staff set status = 'active' where id = v_assignment.staff_id;
  end if;

  v_service_id := v_assignment.service_id;

  return jsonb_build_object(
    'counter_id', p_counter_id,
    'active', true,
    'resumed_assignment_id', v_assignment.id,
    'service_id', v_service_id
  );
end
$fn$;

comment on function public.set_counter_active(uuid, boolean) is
  'The Desk Counter toggle. Ends or resumes THIS counter''s own (primary) assignment in place — no Service change, no Skill check. Distinct from activate_counter/reassign_staff, which move an Assignment under a Recommendation.';

grant execute on function public.set_counter_active(uuid, boolean) to anon, authenticated;

-- =============================================================================
-- END 0004_desk_counter_toggle.sql
-- =============================================================================
