-- ============================================================================
-- ProofPod — AC Commissioning: evacuation + refrigerant charge
-- Run after 0001-0009.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ac_evacuations  (one row per system; checklist is a fixed, code-defined
-- item list stored as jsonb — not hard-coded into the UI, so it can move to
-- a configurable table later without a component rewrite)
-- ----------------------------------------------------------------------------
create table if not exists public.ac_evacuations (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  ac_system_id  uuid not null unique references public.ac_systems (id) on delete cascade,
  checklist     jsonb not null default '{}'::jsonb,
  completed_at  timestamptz,
  completed_by  uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger ac_evacuations_touch before update on public.ac_evacuations
  for each row execute function public.touch_updated_at();

alter table public.ac_evacuations enable row level security;
create policy ac_evacuations_select on public.ac_evacuations
  for select using (company_id in (select public.user_company_ids()));

-- ----------------------------------------------------------------------------
-- ac_charges  (one row per system — factory / additional / total charge)
-- ----------------------------------------------------------------------------
create table if not exists public.ac_charges (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references public.companies (id) on delete cascade,
  ac_system_id             uuid not null unique references public.ac_systems (id) on delete cascade,

  factory_charge_kg        numeric(7,3),
  factory_pipe_allowance_m numeric(7,2),
  installed_pipe_length_m  numeric(7,2),

  additional_method        text not null default 'manual' check (additional_method in ('manual', 'calculated')),
  actual_additional_kg     numeric(7,3),
  calculated_additional_kg numeric(7,3) not null default 0,
  total_charge_kg          numeric(7,3) not null default 0,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  updated_by               uuid references auth.users (id) on delete set null
);
create trigger ac_charges_touch before update on public.ac_charges
  for each row execute function public.touch_updated_at();

alter table public.ac_charges enable row level security;
create policy ac_charges_select on public.ac_charges
  for select using (company_id in (select public.user_company_ids()));

-- ----------------------------------------------------------------------------
-- ac_charge_calc_lines  (the pipe-size calculator, one row per pipe size used)
-- ----------------------------------------------------------------------------
create table if not exists public.ac_charge_calc_lines (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  ac_system_id  uuid not null references public.ac_systems (id) on delete cascade,
  pipe_size     text not null,
  length_m      numeric(7,2) not null default 0,
  rate_kg_per_m numeric(7,4),
  overridden    boolean not null default false,
  calculated_kg numeric(9,4) generated always as (length_m * coalesce(rate_kg_per_m, 0)) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (ac_system_id, pipe_size)
);
create trigger ac_charge_calc_lines_touch before update on public.ac_charge_calc_lines
  for each row execute function public.touch_updated_at();

alter table public.ac_charge_calc_lines enable row level security;
create policy ac_charge_calc_lines_select on public.ac_charge_calc_lines
  for select using (company_id in (select public.user_company_ids()));

-- ----------------------------------------------------------------------------
-- ac_charge_rates  (reference data: pipe size x manufacturer x refrigerant x
-- model -> kg/m. Global, not company-scoped. Seeded with the 9 pipe sizes and
-- NO invented rates — all null until real manufacturer figures are supplied;
-- the calculator works today with fully manual rates and will pick up
-- defaults automatically once this table is populated. Read-only to the app
-- for now — populated later via a service-role script or admin screen.)
-- ----------------------------------------------------------------------------
create table if not exists public.ac_charge_rates (
  id             uuid primary key default gen_random_uuid(),
  pipe_size      text not null,
  manufacturer   text,
  refrigerant_code text,
  model          text,
  kg_per_m       numeric(7,4),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id) on delete set null
);
create unique index if not exists ac_charge_rates_key on public.ac_charge_rates (
  pipe_size, coalesce(manufacturer, ''), coalesce(refrigerant_code, ''), coalesce(model, '')
);

alter table public.ac_charge_rates enable row level security;
create policy ac_charge_rates_select on public.ac_charge_rates
  for select to authenticated using (true);

insert into public.ac_charge_rates (pipe_size)
select p from unnest(array[
  '1/4"', '3/8"', '1/2"', '5/8"', '3/4"', '7/8"', '1 1/8"', '1 3/8"', '1 5/8"'
]) as p
on conflict do nothing;

-- ============================================================================
-- create_ac_system: also seed the blank evacuation/charge rows, mirroring how
-- ac_units are pre-created — keeps every downstream RPC a plain UPDATE.
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
  values (v_system.company_id, v_system.id, 'indoor', 1, v_system.area_served);

  insert into public.ac_evacuations (company_id, ac_system_id)
  values (v_system.company_id, v_system.id);
  insert into public.ac_charges (company_id, ac_system_id)
  values (v_system.company_id, v_system.id);

  perform public._ac_audit(v_system.company_id, 'system_created', p_project_id, v_system.id,
    jsonb_build_object('ref', v_system.ref, 'system_ref', v_system.system_ref,
                       'system_type', v_system.system_type));
  return v_system;
end $$;

-- ============================================================================
-- RPCs
-- ============================================================================

-- --- evacuation checklist (partial save allowed) ----------------------------
create or replace function public.save_ac_evacuation_checklist(
  p_ac_system_id uuid, p_checklist jsonb
) returns public.ac_evacuations
language plpgsql security definer set search_path = public as $$
declare
  v_system public.ac_systems;
  v_row public.ac_evacuations;
begin
  select * into v_system from public.ac_systems where id = p_ac_system_id;
  if not found then raise exception 'system not found'; end if;
  perform public.require_member(v_system.company_id);
  if v_system.locked then raise exception 'system is locked'; end if;

  update public.ac_evacuations
     set checklist = coalesce(checklist, '{}'::jsonb) || p_checklist
   where ac_system_id = p_ac_system_id
  returning * into v_row;
  if not found then raise exception 'evacuation record not found'; end if;

  return v_row;
end $$;

-- --- complete evacuation (requires the final photo to already exist) -------
create or replace function public.complete_ac_evacuation(p_ac_system_id uuid)
returns public.ac_evacuations
language plpgsql security definer set search_path = public as $$
declare
  v_system public.ac_systems;
  v_row public.ac_evacuations;
  v_has_photo boolean;
begin
  select * into v_system from public.ac_systems where id = p_ac_system_id;
  if not found then raise exception 'system not found'; end if;
  perform public.require_member(v_system.company_id);
  if v_system.locked then raise exception 'system is locked'; end if;

  select exists(
    select 1 from public.ac_photos
     where ac_system_id = p_ac_system_id and subject = 'evacuation_final'
  ) into v_has_photo;
  if not v_has_photo then raise exception 'a final evacuation photo is required first'; end if;

  update public.ac_evacuations
     set completed_at = now(), completed_by = auth.uid()
   where ac_system_id = p_ac_system_id
  returning * into v_row;

  perform public._ac_audit(v_system.company_id, 'evacuation_completed', v_system.project_id, v_system.id);
  return v_row;
end $$;

-- --- refrigerant charge ------------------------------------------------
create or replace function public.update_ac_charge(
  p_ac_system_id uuid,
  p_factory_charge_kg numeric default null,
  p_factory_pipe_allowance_m numeric default null,
  p_installed_pipe_length_m numeric default null,
  p_additional_method text default null,
  p_actual_additional_kg numeric default null
) returns public.ac_charges
language plpgsql security definer set search_path = public as $$
declare
  v_system public.ac_systems;
  v_row public.ac_charges;
begin
  select * into v_system from public.ac_systems where id = p_ac_system_id;
  if not found then raise exception 'system not found'; end if;
  perform public.require_member(v_system.company_id);
  if v_system.locked then raise exception 'system is locked'; end if;

  update public.ac_charges set
    factory_charge_kg = coalesce(p_factory_charge_kg, factory_charge_kg),
    factory_pipe_allowance_m = coalesce(p_factory_pipe_allowance_m, factory_pipe_allowance_m),
    installed_pipe_length_m = coalesce(p_installed_pipe_length_m, installed_pipe_length_m),
    additional_method = coalesce(p_additional_method, additional_method),
    actual_additional_kg = coalesce(p_actual_additional_kg, actual_additional_kg),
    updated_by = auth.uid()
  where ac_system_id = p_ac_system_id
  returning * into v_row;
  if not found then raise exception 'charge record not found'; end if;

  -- Total (and the F-Gas record) always use the ACTUAL quantity added, never
  -- the calculator's estimate — the calculator only helps arrive at a number
  -- to physically dispense; what matters for the record is what was added.
  update public.ac_charges
     set total_charge_kg = coalesce(factory_charge_kg, 0) + coalesce(actual_additional_kg, 0)
   where ac_system_id = p_ac_system_id
  returning * into v_row;

  return v_row;
end $$;

-- --- pipe-size calculator line (upsert; recomputes calculated_additional_kg) -
create or replace function public.upsert_ac_charge_calc_line(
  p_ac_system_id uuid, p_pipe_size text, p_length_m numeric,
  p_rate_kg_per_m numeric, p_overridden boolean default false
) returns public.ac_charge_calc_lines
language plpgsql security definer set search_path = public as $$
declare
  v_system public.ac_systems;
  v_row public.ac_charge_calc_lines;
  v_sum numeric;
begin
  select * into v_system from public.ac_systems where id = p_ac_system_id;
  if not found then raise exception 'system not found'; end if;
  perform public.require_member(v_system.company_id);
  if v_system.locked then raise exception 'system is locked'; end if;

  insert into public.ac_charge_calc_lines (
    company_id, ac_system_id, pipe_size, length_m, rate_kg_per_m, overridden
  ) values (
    v_system.company_id, p_ac_system_id, p_pipe_size, coalesce(p_length_m, 0), p_rate_kg_per_m, coalesce(p_overridden, false)
  )
  on conflict (ac_system_id, pipe_size) do update set
    length_m = excluded.length_m,
    rate_kg_per_m = excluded.rate_kg_per_m,
    overridden = excluded.overridden
  returning * into v_row;

  select coalesce(sum(calculated_kg), 0) into v_sum
   from public.ac_charge_calc_lines where ac_system_id = p_ac_system_id;

  -- calculated_additional_kg is stored for reference only — it never feeds
  -- total_charge_kg directly; see update_ac_charge for why.
  update public.ac_charges
     set calculated_additional_kg = v_sum
   where ac_system_id = p_ac_system_id;

  return v_row;
end $$;

grant execute on function
  public.save_ac_evacuation_checklist(uuid, jsonb),
  public.complete_ac_evacuation(uuid),
  public.update_ac_charge(uuid, numeric, numeric, numeric, text, numeric),
  public.upsert_ac_charge_calc_line(uuid, text, numeric, numeric, boolean)
to authenticated;
