-- ============================================================================
-- ProofPod — AC Commissioning: drain test + system completion
-- Run after 0001-0011.
-- ============================================================================

do $$ begin
  create type ac_drain_type as enum ('pump', 'gravity');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ac_drain_result as enum ('passed', 'failed');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- ac_drain_tests  (per indoor unit; nothing overwritten — the most recent row
-- per unit is the current record, same "never delete" philosophy as the rest)
-- ----------------------------------------------------------------------------
create table if not exists public.ac_drain_tests (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete cascade,
  ac_system_id        uuid not null references public.ac_systems (id) on delete cascade,
  ac_unit_id          uuid not null references public.ac_units (id) on delete cascade,

  drain_type          ac_drain_type not null,
  pump_model          text,
  water_added_litres  numeric(6,2),
  result              ac_drain_result not null,
  notes               text,

  tested_at           timestamptz not null default now(),
  tested_by           uuid not null references auth.users (id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists ac_drain_tests_unit_idx on public.ac_drain_tests (ac_unit_id, tested_at desc);

alter table public.ac_drain_tests enable row level security;
create policy ac_drain_tests_select on public.ac_drain_tests
  for select using (company_id in (select public.user_company_ids()));

create or replace function public.create_ac_drain_test(
  p_ac_unit_id uuid,
  p_drain_type ac_drain_type,
  p_result ac_drain_result,
  p_pump_model text default null,
  p_water_added_litres numeric default null,
  p_notes text default null
) returns public.ac_drain_tests
language plpgsql security definer set search_path = public as $$
declare
  v_unit public.ac_units;
  v_system public.ac_systems;
  v_row public.ac_drain_tests;
begin
  select * into v_unit from public.ac_units where id = p_ac_unit_id;
  if not found then raise exception 'unit not found'; end if;
  perform public.require_member(v_unit.company_id);

  select * into v_system from public.ac_systems where id = v_unit.ac_system_id;
  if v_system.locked then raise exception 'system is locked'; end if;

  insert into public.ac_drain_tests (
    company_id, ac_system_id, ac_unit_id, drain_type, pump_model, water_added_litres, result, notes, tested_by
  ) values (
    v_unit.company_id, v_unit.ac_system_id, p_ac_unit_id, p_drain_type,
    case when p_drain_type = 'pump' then nullif(trim(p_pump_model), '') else null end,
    p_water_added_litres, p_result, nullif(trim(p_notes), ''), auth.uid()
  ) returning * into v_row;

  perform public._ac_audit(v_row.company_id, 'drain_test_recorded', v_system.project_id, v_system.id,
    jsonb_build_object('ac_unit_id', p_ac_unit_id, 'result', p_result));
  return v_row;
end $$;

grant execute on function
  public.create_ac_drain_test(uuid, ac_drain_type, ac_drain_result, text, numeric, text)
to authenticated;

-- ============================================================================
-- complete_ac_system: re-validates every mandatory item server-side (mirrors
-- what the UI's "N items remaining" checklist already shows the engineer).
-- This checks DATA IS CAPTURED, never test outcomes — a failed drain test or
-- a low temperature reading doesn't block completion, only a missing one
-- does. Consistent with "record what happened, never judge methodology."
-- ============================================================================
create or replace function public.complete_ac_system(p_ac_system_id uuid)
returns public.ac_systems
language plpgsql security definer set search_path = public as $$
declare
  v_system public.ac_systems;
  v_missing text[] := '{}';
  v_outdoor public.ac_units;
  v_indoor record;
  v_latest_pt public.ac_pressure_tests;
  v_evac public.ac_evacuations;
  v_charge public.ac_charges;
  v_comm public.ac_commissioning;
begin
  select * into v_system from public.ac_systems where id = p_ac_system_id for update;
  if not found then raise exception 'system not found'; end if;
  perform public.require_member(v_system.company_id);
  if v_system.locked then raise exception 'system is already complete'; end if;

  select * into v_outdoor from public.ac_units
   where ac_system_id = p_ac_system_id and unit_role = 'outdoor' limit 1;
  if v_outdoor.model_number is null or v_outdoor.serial_number is null then
    v_missing := v_missing || 'Outdoor unit identification';
  end if;

  for v_indoor in
    select * from public.ac_units where ac_system_id = p_ac_system_id and unit_role = 'indoor'
  loop
    if v_indoor.model_number is null or v_indoor.serial_number is null then
      v_missing := v_missing || ('Indoor unit identification (' || coalesce(v_indoor.reference, 'indoor unit') || ')');
    end if;

    if not exists (
      select 1 from public.ac_temperature_readings
       where ac_unit_id = v_indoor.id and mode = 'cooling' and air_on_c is not null and air_off_c is not null
    ) then
      v_missing := v_missing || ('Cooling temperatures (' || coalesce(v_indoor.reference, 'indoor unit') || ')');
    end if;
    if not exists (
      select 1 from public.ac_temperature_readings
       where ac_unit_id = v_indoor.id and mode = 'heating' and air_on_c is not null and air_off_c is not null
    ) then
      v_missing := v_missing || ('Heating temperatures (' || coalesce(v_indoor.reference, 'indoor unit') || ')');
    end if;

    if not exists (select 1 from public.ac_drain_tests where ac_unit_id = v_indoor.id) then
      v_missing := v_missing || ('Drain test (' || coalesce(v_indoor.reference, 'indoor unit') || ')');
    end if;
  end loop;

  select * into v_latest_pt from public.ac_pressure_tests
   where ac_system_id = p_ac_system_id order by attempt_no desc limit 1;
  if v_latest_pt.id is null or v_latest_pt.status <> 'passed' then
    v_missing := v_missing || 'Pressure test (passed)';
  end if;

  select * into v_evac from public.ac_evacuations where ac_system_id = p_ac_system_id;
  if v_evac.completed_at is null then
    v_missing := v_missing || 'Evacuation';
  end if;

  select * into v_charge from public.ac_charges where ac_system_id = p_ac_system_id;
  if v_charge.factory_charge_kg is null or v_charge.actual_additional_kg is null then
    v_missing := v_missing || 'Refrigerant charge';
  end if;

  select * into v_comm from public.ac_commissioning where ac_system_id = p_ac_system_id;
  if v_comm.transit_brackets_removed is null or v_comm.electrical_connections_tight is null
     or v_comm.local_isolator_fitted is null or v_comm.equipment_labelled is null
     or v_comm.covers_fixed_clean is null or v_comm.functional_test_satisfactory is null
     or v_comm.mcb_fuse_spec is null or v_comm.outdoor_nameplate_flc_amps is null
     or v_comm.suction_pipe_size is null or v_comm.liquid_pipe_size is null
  then
    v_missing := v_missing || 'Commissioning checks';
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception '% item(s) still required: %', array_length(v_missing, 1), array_to_string(v_missing, '; ')
      using errcode = '22023';
  end if;

  update public.ac_systems set
    status = 'complete', locked = true, completed_at = now(), completed_by = auth.uid()
  where id = p_ac_system_id
  returning * into v_system;

  perform public._ac_audit(v_system.company_id, 'system_completed', v_system.project_id, v_system.id);
  return v_system;
end $$;

grant execute on function public.complete_ac_system(uuid) to authenticated;
