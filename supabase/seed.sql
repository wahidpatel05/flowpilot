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
