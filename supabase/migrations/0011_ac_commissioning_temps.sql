-- ============================================================================
-- ProofPod — AC Commissioning: commissioning checks + temperature readings
-- Run after 0001-0010.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ac_commissioning  (one row per system). Checklist booleans are nullable —
-- null means "not yet recorded", distinct from a genuine "no".
-- ----------------------------------------------------------------------------
create table if not exists public.ac_commissioning (
  id                            uuid primary key default gen_random_uuid(),
  company_id                    uuid not null references public.companies (id) on delete cascade,
  ac_system_id                  uuid not null unique references public.ac_systems (id) on delete cascade,

  transit_brackets_removed      boolean,
  electrical_connections_tight  boolean,
  local_isolator_fitted         boolean,
  equipment_labelled            boolean,
  covers_fixed_clean            boolean,
  functional_test_satisfactory  boolean,

  mcb_fuse_spec                 text,
  outdoor_nameplate_flc_amps    numeric(6,2),
  suction_pipe_size             text,
  liquid_pipe_size              text,

  current_cooling_l1            numeric(6,2),
  current_cooling_l2            numeric(6,2),
  current_cooling_l3            numeric(6,2),
  current_heating_l1            numeric(6,2),
  current_heating_l2            numeric(6,2),
  current_heating_l3            numeric(6,2),

  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);
create trigger ac_commissioning_touch before update on public.ac_commissioning
  for each row execute function public.touch_updated_at();

alter table public.ac_commissioning enable row level security;
create policy ac_commissioning_select on public.ac_commissioning
  for select using (company_id in (select public.user_company_ids()));

-- ----------------------------------------------------------------------------
-- ac_temperature_readings  (one row per indoor unit x mode; each carries its
-- own recorded_at/by so partial completion and hand-off between engineers on
-- different days works without conflict)
-- ----------------------------------------------------------------------------
do $$ begin
  create type ac_temp_mode as enum ('cooling', 'heating');
exception when duplicate_object then null; end $$;

create table if not exists public.ac_temperature_readings (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  ac_system_id  uuid not null references public.ac_systems (id) on delete cascade,
  ac_unit_id    uuid not null references public.ac_units (id) on delete cascade,
  mode          ac_temp_mode not null,
  air_on_c      numeric(5,2),
  air_off_c     numeric(5,2),
  recorded_at   timestamptz,
  recorded_by   uuid references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  unique (ac_unit_id, mode)
);
create trigger ac_temperature_readings_touch before update on public.ac_temperature_readings
  for each row execute function public.touch_updated_at();

alter table public.ac_temperature_readings enable row level security;
create policy ac_temperature_readings_select on public.ac_temperature_readings
  for select using (company_id in (select public.user_company_ids()));

-- ============================================================================
-- create_ac_system: also seed the blank commissioning row + both temperature
-- reading rows for the (single, for Split) indoor unit.
-- ============================================================================
create or replace function public.create_ac_system(
  p_project_id uuid,
  p_system_ref text,
  p_area_served text,
  p_outdoor_location text,
  p_manufacturer text,
  p_refrigerant_code text,
  p_gwp numeric,
  p_manufacturer_other text default null,
  p_refrigerant_other text default null,
  p_system_type ac_system_type default 'split'
) returns public.ac_systems
language plpgsql security definer set search_path = public as $$
declare
  v_project public.projects;
  v_system public.ac_systems;
  v_indoor public.ac_units;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'project not found'; end if;
  perform public.require_member(v_project.company_id);

  if not public.company_has_module(v_project.company_id, 'ac_commissioning') then
    raise exception 'AC Commissioning is not enabled for this company';
  end if;

  if coalesce(trim(p_system_ref), '') = '' then raise exception 'system reference required'; end if;
  if coalesce(trim(p_area_served), '') = '' then raise exception 'area served required'; end if;
  if coalesce(trim(p_outdoor_location), '') = '' then raise exception 'outdoor unit location required'; end if;
  if p_manufacturer = 'Other' and coalesce(trim(p_manufacturer_other), '') = '' then
    raise exception 'manufacturer name required';
  end if;
  if p_refrigerant_code = 'Other' and coalesce(trim(p_refrigerant_other), '') = '' then
    raise exception 'refrigerant type required';
  end if;

  insert into public.ac_systems (
    company_id, project_id, system_type, system_ref, area_served, outdoor_location,
    manufacturer, manufacturer_other, refrigerant_code, refrigerant_other, gwp, created_by
  ) values (
    v_project.company_id, p_project_id, coalesce(p_system_type, 'split'),
    trim(p_system_ref), trim(p_area_served), trim(p_outdoor_location),
    p_manufacturer, nullif(trim(p_manufacturer_other), ''),
    p_refrigerant_code, nullif(trim(p_refrigerant_other), ''), p_gwp,
    auth.uid()
  ) returning * into v_system;

  insert into public.ac_units (company_id, ac_system_id, unit_role, unit_index)
  values (v_system.company_id, v_system.id, 'outdoor', 1);
  insert into public.ac_units (company_id, ac_system_id, unit_role, unit_index, location)
  values (v_system.company_id, v_system.id, 'indoor', 1, v_system.area_served)
  returning * into v_indoor;

  insert into public.ac_evacuations (company_id, ac_system_id)
  values (v_system.company_id, v_system.id);
  insert into public.ac_charges (company_id, ac_system_id)
  values (v_system.company_id, v_system.id);
  insert into public.ac_commissioning (company_id, ac_system_id)
  values (v_system.company_id, v_system.id);
  insert into public.ac_temperature_readings (company_id, ac_system_id, ac_unit_id, mode)
  values (v_system.company_id, v_system.id, v_indoor.id, 'cooling'),
         (v_system.company_id, v_system.id, v_indoor.id, 'heating');

  perform public._ac_audit(v_system.company_id, 'system_created', p_project_id, v_system.id,
    jsonb_build_object('ref', v_system.ref, 'system_ref', v_system.system_ref,
                       'system_type', v_system.system_type));
  return v_system;
end $$;

-- ============================================================================
-- RPCs
-- ============================================================================

create or replace function public.update_ac_commissioning(
  p_ac_system_id uuid,
  p_transit_brackets_removed boolean default null,
  p_electrical_connections_tight boolean default null,
  p_local_isolator_fitted boolean default null,
  p_equipment_labelled boolean default null,
  p_covers_fixed_clean boolean default null,
  p_functional_test_satisfactory boolean default null,
  p_mcb_fuse_spec text default null,
  p_outdoor_nameplate_flc_amps numeric default null,
  p_suction_pipe_size text default null,
  p_liquid_pipe_size text default null,
  p_current_cooling_l1 numeric default null,
  p_current_cooling_l2 numeric default null,
  p_current_cooling_l3 numeric default null,
  p_current_heating_l1 numeric default null,
  p_current_heating_l2 numeric default null,
  p_current_heating_l3 numeric default null
) returns public.ac_commissioning
language plpgsql security definer set search_path = public as $$
declare
  v_system public.ac_systems;
  v_row public.ac_commissioning;
begin
  select * into v_system from public.ac_systems where id = p_ac_system_id;
  if not found then raise exception 'system not found'; end if;
  perform public.require_member(v_system.company_id);
  if v_system.locked then raise exception 'system is locked'; end if;

  update public.ac_commissioning set
    transit_brackets_removed = coalesce(p_transit_brackets_removed, transit_brackets_removed),
    electrical_connections_tight = coalesce(p_electrical_connections_tight, electrical_connections_tight),
    local_isolator_fitted = coalesce(p_local_isolator_fitted, local_isolator_fitted),
    equipment_labelled = coalesce(p_equipment_labelled, equipment_labelled),
    covers_fixed_clean = coalesce(p_covers_fixed_clean, covers_fixed_clean),
    functional_test_satisfactory = coalesce(p_functional_test_satisfactory, functional_test_satisfactory),
    mcb_fuse_spec = coalesce(nullif(trim(p_mcb_fuse_spec), ''), mcb_fuse_spec),
    outdoor_nameplate_flc_amps = coalesce(p_outdoor_nameplate_flc_amps, outdoor_nameplate_flc_amps),
    suction_pipe_size = coalesce(nullif(trim(p_suction_pipe_size), ''), suction_pipe_size),
    liquid_pipe_size = coalesce(nullif(trim(p_liquid_pipe_size), ''), liquid_pipe_size),
    current_cooling_l1 = coalesce(p_current_cooling_l1, current_cooling_l1),
    current_cooling_l2 = coalesce(p_current_cooling_l2, current_cooling_l2),
    current_cooling_l3 = coalesce(p_current_cooling_l3, current_cooling_l3),
    current_heating_l1 = coalesce(p_current_heating_l1, current_heating_l1),
    current_heating_l2 = coalesce(p_current_heating_l2, current_heating_l2),
    current_heating_l3 = coalesce(p_current_heating_l3, current_heating_l3)
  where ac_system_id = p_ac_system_id
  returning * into v_row;
  if not found then raise exception 'commissioning record not found'; end if;

  return v_row;
end $$;

create or replace function public.upsert_ac_temperature_reading(
  p_ac_unit_id uuid, p_mode ac_temp_mode, p_air_on_c numeric, p_air_off_c numeric
) returns public.ac_temperature_readings
language plpgsql security definer set search_path = public as $$
declare
  v_unit public.ac_units;
  v_system public.ac_systems;
  v_row public.ac_temperature_readings;
begin
  select * into v_unit from public.ac_units where id = p_ac_unit_id;
  if not found then raise exception 'unit not found'; end if;
  perform public.require_member(v_unit.company_id);

  select * into v_system from public.ac_systems where id = v_unit.ac_system_id;
  if v_system.locked then raise exception 'system is locked'; end if;

  update public.ac_temperature_readings set
    air_on_c = coalesce(p_air_on_c, air_on_c),
    air_off_c = coalesce(p_air_off_c, air_off_c),
    recorded_at = now(),
    recorded_by = auth.uid()
  where ac_unit_id = p_ac_unit_id and mode = p_mode
  returning * into v_row;
  if not found then raise exception 'temperature record not found'; end if;

  return v_row;
end $$;

grant execute on function
  public.update_ac_commissioning(
    uuid, boolean, boolean, boolean, boolean, boolean, boolean,
    text, numeric, text, text, numeric, numeric, numeric, numeric, numeric, numeric
  ),
  public.upsert_ac_temperature_reading(uuid, ac_temp_mode, numeric, numeric)
to authenticated;
