-- ============================================================================
-- ProofPod — AC Commissioning: tolerate short signal drops.
-- The phone keeps photos and entries until signal returns and then sends them.
-- To keep the evidence honest, each record keeps the moment it happened ON
-- SITE (the phone's clock, passed in as p_at / p_taken_at), while the server's
-- own clock is preserved in ac_audit_events.created_at (when it arrived).
-- The phone's time is only trusted if it is not in the future and not more
-- than 2 days old; otherwise the server's time is used.
-- Retried sends are safe: stage/result/evacuation completion and photo
-- records are idempotent, and a repeated drain test (same unit + time) is
-- ignored.
-- Run after 0001-0023.
-- ============================================================================

create or replace function public._ac_event_time(p_at timestamptz)
returns timestamptz language sql stable as $$
  select case
    when p_at is null or p_at > now() or p_at < now() - interval '2 days' then now()
    else p_at
  end
$$;

-- ---- pressure test stages ---------------------------------------------------
drop function if exists public.start_ac_pressure_test_stage(uuid);
drop function if exists public.complete_ac_pressure_test_stage(uuid);

create or replace function public.start_ac_pressure_test_stage(p_stage_id uuid, p_at timestamptz default null)
returns public.ac_pressure_test_stages
language plpgsql security definer set search_path = public as $$
declare
  v_stage public.ac_pressure_test_stages;
  v_test public.ac_pressure_tests;
  v_at timestamptz := public._ac_event_time(p_at);
begin
  select * into v_stage from public.ac_pressure_test_stages where id = p_stage_id for update;
  if not found then raise exception 'stage not found'; end if;
  perform public.require_member(v_stage.company_id);

  select * into v_test from public.ac_pressure_tests where id = v_stage.ac_pressure_test_id;
  if v_test.locked then raise exception 'attempt is locked'; end if;

  update public.ac_pressure_test_stages set
    status = case when status = 'complete' then status else 'in_progress' end,
    started_at = coalesce(started_at, v_at),
    started_by = coalesce(started_by, auth.uid())
  where id = p_stage_id
  returning * into v_stage;

  perform public._ac_audit(v_stage.company_id, 'pressure_test_stage_started', v_test.project_id, v_test.ac_system_id,
    jsonb_build_object('ref', v_test.ref, 'stage_no', v_stage.stage_no, 'captured_at', v_at));
  return v_stage;
end $$;

create or replace function public.complete_ac_pressure_test_stage(p_stage_id uuid, p_at timestamptz default null)
returns public.ac_pressure_test_stages
language plpgsql security definer set search_path = public as $$
declare
  v_stage public.ac_pressure_test_stages;
  v_test public.ac_pressure_tests;
  v_at timestamptz := public._ac_event_time(p_at);
begin
  select * into v_stage from public.ac_pressure_test_stages where id = p_stage_id for update;
  if not found then raise exception 'stage not found'; end if;
  perform public.require_member(v_stage.company_id);

  select * into v_test from public.ac_pressure_tests where id = v_stage.ac_pressure_test_id;
  if v_test.locked then raise exception 'attempt is locked'; end if;

  update public.ac_pressure_test_stages set
    status = 'complete',
    started_at = coalesce(started_at, v_at),
    started_by = coalesce(started_by, auth.uid()),
    completed_at = coalesce(completed_at, v_at),
    completed_by = coalesce(completed_by, auth.uid())
  where id = p_stage_id
  returning * into v_stage;

  perform public._ac_audit(v_stage.company_id, 'pressure_test_stage_completed', v_test.project_id, v_test.ac_system_id,
    jsonb_build_object('ref', v_test.ref, 'stage_no', v_stage.stage_no, 'captured_at', v_at));
  return v_stage;
end $$;

-- ---- pressure test result -----------------------------------------------------
drop function if exists public.set_ac_pressure_test_result(uuid, text);

create or replace function public.set_ac_pressure_test_result(
  p_attempt_id uuid, p_result text, p_at timestamptz default null
) returns public.ac_pressure_tests
language plpgsql security definer set search_path = public as $$
declare
  v_row public.ac_pressure_tests;
  v_at timestamptz := public._ac_event_time(p_at);
begin
  if p_result not in ('passed', 'failed') then raise exception 'invalid result'; end if;
  select * into v_row from public.ac_pressure_tests where id = p_attempt_id for update;
  if not found then raise exception 'attempt not found'; end if;
  perform public.require_member(v_row.company_id);
  -- A repeated send of the same result (e.g. the reply was lost) changes nothing.
  if v_row.status::text = p_result and v_row.result_at is not null then return v_row; end if;
  if v_row.locked then raise exception 'attempt is locked'; end if;

  update public.ac_pressure_tests set
    status = p_result::ac_pressure_test_status,
    result_at = v_at,
    result_by = auth.uid(),
    locked = (p_result = 'passed')
  where id = p_attempt_id
  returning * into v_row;

  perform public._ac_audit(v_row.company_id, 'pressure_test_' || p_result, null, v_row.ac_system_id,
    jsonb_build_object('attempt_no', v_row.attempt_no, 'captured_at', v_at));
  return v_row;
end $$;

-- ---- evacuation completion ----------------------------------------------------
drop function if exists public.complete_ac_evacuation(uuid);

create or replace function public.complete_ac_evacuation(p_ac_system_id uuid, p_at timestamptz default null)
returns public.ac_evacuations
language plpgsql security definer set search_path = public as $$
declare
  v_system public.ac_systems;
  v_row public.ac_evacuations;
  v_has_photo boolean;
  v_at timestamptz := public._ac_event_time(p_at);
begin
  select * into v_system from public.ac_systems where id = p_ac_system_id;
  if not found then raise exception 'system not found'; end if;
  perform public.require_member(v_system.company_id);

  select * into v_row from public.ac_evacuations where ac_system_id = p_ac_system_id;
  if found and v_row.completed_at is not null then return v_row; end if;
  if v_system.locked then raise exception 'system is locked'; end if;

  select exists(
    select 1 from public.ac_photos
     where ac_system_id = p_ac_system_id and subject = 'evacuation_final'
  ) into v_has_photo;
  if not v_has_photo then raise exception 'a final evacuation photo is required first'; end if;

  update public.ac_evacuations
     set completed_at = v_at, completed_by = auth.uid()
   where ac_system_id = p_ac_system_id
  returning * into v_row;

  perform public._ac_audit(v_system.company_id, 'evacuation_completed', v_system.project_id, v_system.id,
    jsonb_build_object('captured_at', v_at));
  return v_row;
end $$;

-- ---- temperature readings -------------------------------------------------------
drop function if exists public.upsert_ac_temperature_reading(uuid, ac_temp_mode, numeric, numeric);

create or replace function public.upsert_ac_temperature_reading(
  p_ac_unit_id uuid, p_mode ac_temp_mode, p_air_on_c numeric, p_air_off_c numeric,
  p_at timestamptz default null
) returns public.ac_temperature_readings
language plpgsql security definer set search_path = public as $$
declare
  v_unit public.ac_units;
  v_system public.ac_systems;
  v_row public.ac_temperature_readings;
  v_at timestamptz := public._ac_event_time(p_at);
begin
  select * into v_unit from public.ac_units where id = p_ac_unit_id;
  if not found then raise exception 'unit not found'; end if;
  perform public.require_member(v_unit.company_id);

  select * into v_system from public.ac_systems where id = v_unit.ac_system_id;
  if v_system.locked then raise exception 'system is locked'; end if;

  update public.ac_temperature_readings set
    air_on_c = coalesce(p_air_on_c, air_on_c),
    air_off_c = coalesce(p_air_off_c, air_off_c),
    recorded_at = v_at,
    recorded_by = auth.uid()
  where ac_unit_id = p_ac_unit_id and mode = p_mode
  returning * into v_row;
  if not found then raise exception 'temperature record not found'; end if;

  return v_row;
end $$;

-- ---- drain tests ------------------------------------------------------------------
create unique index if not exists ac_drain_tests_unit_time_uniq
  on public.ac_drain_tests (ac_unit_id, tested_at);

drop function if exists public.create_ac_drain_test(uuid, ac_drain_type, ac_drain_result, text, numeric, text);

create or replace function public.create_ac_drain_test(
  p_ac_unit_id uuid,
  p_drain_type ac_drain_type,
  p_result ac_drain_result,
  p_pump_model text default null,
  p_water_added_litres numeric default null,
  p_notes text default null,
  p_at timestamptz default null
) returns public.ac_drain_tests
language plpgsql security definer set search_path = public as $$
declare
  v_unit public.ac_units;
  v_system public.ac_systems;
  v_row public.ac_drain_tests;
  v_at timestamptz := public._ac_event_time(p_at);
begin
  select * into v_unit from public.ac_units where id = p_ac_unit_id;
  if not found then raise exception 'unit not found'; end if;
  perform public.require_member(v_unit.company_id);

  select * into v_system from public.ac_systems where id = v_unit.ac_system_id;
  if v_system.locked then raise exception 'system is locked'; end if;

  insert into public.ac_drain_tests (
    company_id, ac_system_id, ac_unit_id, drain_type, pump_model, water_added_litres, result, notes,
    tested_by, tested_at
  ) values (
    v_unit.company_id, v_unit.ac_system_id, p_ac_unit_id, p_drain_type,
    case when p_drain_type = 'pump' then nullif(trim(p_pump_model), '') else null end,
    p_water_added_litres, p_result, nullif(trim(p_notes), ''), auth.uid(), v_at
  )
  on conflict (ac_unit_id, tested_at) do nothing
  returning * into v_row;

  if v_row.id is null then
    -- Same unit + moment already recorded: this is a repeated send.
    select * into v_row from public.ac_drain_tests where ac_unit_id = p_ac_unit_id and tested_at = v_at;
    return v_row;
  end if;

  perform public._ac_audit(v_row.company_id, 'drain_test_recorded', v_system.project_id, v_system.id,
    jsonb_build_object('ac_unit_id', p_ac_unit_id, 'result', p_result, 'captured_at', v_at));
  return v_row;
end $$;

-- ---- evidence photos ----------------------------------------------------------------
drop function if exists public.record_ac_photo(ac_photo_subject, text, uuid, uuid, uuid, uuid, integer, text, integer);

create or replace function public.record_ac_photo(
  p_subject ac_photo_subject, p_storage_path text,
  p_ac_system_id uuid default null,
  p_project_id uuid default null,
  p_ac_unit_id uuid default null,
  p_ac_pressure_test_id uuid default null,
  p_stage_no integer default null,
  p_mime text default null, p_size_bytes integer default null,
  p_taken_at timestamptz default null
) returns public.ac_photos
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_project_id uuid;
  v_row public.ac_photos;
  v_at timestamptz := public._ac_event_time(p_taken_at);
begin
  if p_ac_system_id is not null then
    select company_id, project_id into v_company_id, v_project_id
      from public.ac_systems where id = p_ac_system_id;
  elsif p_ac_pressure_test_id is not null then
    select company_id, project_id into v_company_id, v_project_id
      from public.ac_pressure_tests where id = p_ac_pressure_test_id;
  elsif p_project_id is not null then
    select company_id into v_company_id from public.projects where id = p_project_id;
    v_project_id := p_project_id;
  end if;

  if v_company_id is null then raise exception 'a system, pressure test, or project is required'; end if;
  perform public.require_member(v_company_id);

  -- A repeated send of the same stored photo returns the existing record.
  select * into v_row from public.ac_photos where storage_path = p_storage_path and company_id = v_company_id;
  if found then return v_row; end if;

  insert into public.ac_photos (
    company_id, project_id, ac_system_id, ac_unit_id, ac_pressure_test_id, stage_no,
    subject, storage_path, mime, size_bytes, taken_by, taken_at
  ) values (
    v_company_id, v_project_id, p_ac_system_id, p_ac_unit_id, p_ac_pressure_test_id, p_stage_no,
    p_subject, p_storage_path, p_mime, p_size_bytes, auth.uid(), v_at
  ) returning * into v_row;

  perform public._ac_audit(v_company_id, 'photo_captured', v_project_id, p_ac_system_id,
    jsonb_build_object('subject', p_subject, 'stage_no', p_stage_no, 'captured_at', v_at));
  return v_row;
end $$;

grant execute on function
  public.start_ac_pressure_test_stage(uuid, timestamptz),
  public.complete_ac_pressure_test_stage(uuid, timestamptz),
  public.set_ac_pressure_test_result(uuid, text, timestamptz),
  public.complete_ac_evacuation(uuid, timestamptz),
  public.upsert_ac_temperature_reading(uuid, ac_temp_mode, numeric, numeric, timestamptz),
  public.create_ac_drain_test(uuid, ac_drain_type, ac_drain_result, text, numeric, text, timestamptz),
  public.record_ac_photo(ac_photo_subject, text, uuid, uuid, uuid, uuid, integer, text, integer, timestamptz)
to authenticated;
