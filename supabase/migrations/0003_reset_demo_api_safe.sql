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
