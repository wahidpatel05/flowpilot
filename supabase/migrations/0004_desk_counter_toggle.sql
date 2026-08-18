-- =============================================================================
-- DeQueue — 0004_desk_counter_toggle.sql
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
    raise exception 'DeQueue: counter % does not exist.', p_counter_id
      using errcode = 'P0001';
  end if;

  if p_active = false then
    if v_counter.status = 'inactive' then
      raise exception
        'DeQueue: % is already inactive.', v_counter.name
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
        'DeQueue: % has no active assignment to end.', v_counter.name
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
      'DeQueue: % is already active.', v_counter.name
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
      'DeQueue: % has no prior Assignment to resume. Open it via activate_counter first.',
      v_counter.name
      using errcode = 'P0001';
  end if;

  if v_assignment.status = 'active' then
    raise exception
      'DeQueue: % already has an active assignment.', v_counter.name
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
