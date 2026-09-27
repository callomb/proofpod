-- ============================================================================
-- ProofPod — AC Commissioning: F-Gas project settings + certificates
-- Reuses the existing private `certificates` storage bucket (its policy is
-- generic — keyed only on the company-id path segment + is_admin — so no
-- bucket-policy change is needed) and the snapshot-freeze + PDF pattern from
-- 0003_admin_certificates.sql, but with AC's own tables throughout.
-- Run after 0001-0012.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ac_project_settings  (F-Gas fields that are project-level, not per-system —
-- entered once, reused across every system on that project)
-- ----------------------------------------------------------------------------
create table if not exists public.ac_project_settings (
  project_id       uuid primary key references public.projects (id) on delete cascade,
  company_id       uuid not null references public.companies (id) on delete cascade,
  plant_operator   text,
  operator_contact text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger ac_project_settings_touch before update on public.ac_project_settings
  for each row execute function public.touch_updated_at();

alter table public.ac_project_settings enable row level security;
create policy ac_project_settings_select on public.ac_project_settings
  for select using (company_id in (select public.user_company_ids()));

create or replace function public.set_ac_project_settings(
  p_project_id uuid, p_plant_operator text default null, p_operator_contact text default null
) returns public.ac_project_settings
language plpgsql security definer set search_path = public as $$
declare
  v_project public.projects;
  v_row public.ac_project_settings;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'project not found'; end if;
  perform public.require_admin(v_project.company_id);

  insert into public.ac_project_settings (project_id, company_id, plant_operator, operator_contact)
  values (p_project_id, v_project.company_id, nullif(trim(p_plant_operator), ''), nullif(trim(p_operator_contact), ''))
  on conflict (project_id) do update set
    plant_operator = excluded.plant_operator,
    operator_contact = excluded.operator_contact
  returning * into v_row;

  return v_row;
end $$;

-- ----------------------------------------------------------------------------
-- ac_certificates  (immutable jsonb snapshot per document, mirrors
-- `certificates`; own number sequence)
-- ----------------------------------------------------------------------------
do $$ begin
  create type ac_doc_type as enum
    ('pressure_test', 'commissioning', 'drain_test', 'fgas_log', 'fgas_inventory');
exception when duplicate_object then null; end $$;

create sequence if not exists public.ac_certificate_number_seq start 1;

create table if not exists public.ac_certificates (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  ac_system_id  uuid not null references public.ac_systems (id) on delete cascade,
  doc_type      ac_doc_type not null,
  number        text not null unique
                  default ('ACC-' || lpad(nextval('public.ac_certificate_number_seq')::text, 6, '0')),
  snapshot      jsonb not null,
  pdf_path      text,
  issued_by     uuid references auth.users (id) on delete set null,
  issued_at     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists ac_certificates_system_idx on public.ac_certificates (ac_system_id);
create index if not exists ac_certificates_project_idx on public.ac_certificates (project_id, issued_at desc);

alter table public.ac_certificates enable row level security;
create policy ac_certificates_select on public.ac_certificates
  for select using (public.is_admin(company_id));

-- ----------------------------------------------------------------------------
-- issue_ac_certificate: freezes a snapshot for one document type, admin-only.
-- ----------------------------------------------------------------------------
create or replace function public.issue_ac_certificate(
  p_ac_system_id uuid, p_doc_type ac_doc_type
) returns public.ac_certificates
language plpgsql security definer set search_path = public as $$
declare
  v_system public.ac_systems;
  v_company public.companies;
  v_project public.projects;
  v_settings public.ac_project_settings;
  v_outdoor public.ac_units;
  v_units jsonb;
  v_latest_pt public.ac_pressure_tests;
  v_pt_photos jsonb;
  v_evac public.ac_evacuations;
  v_evac_photo jsonb;
  v_charge public.ac_charges;
  v_comm public.ac_commissioning;
  v_temps jsonb;
  v_drains jsonb;
  v_snapshot jsonb;
  v_cert public.ac_certificates;
begin
  select * into v_system from public.ac_systems where id = p_ac_system_id;
  if not found then raise exception 'system not found'; end if;
  perform public.require_admin(v_system.company_id);

  select * into v_company from public.companies where id = v_system.company_id;
  select * into v_project from public.projects where id = v_system.project_id;
  select * into v_settings from public.ac_project_settings where project_id = v_system.project_id;

  -- --- doc-type preconditions: only certify what actually happened --------
  if p_doc_type = 'pressure_test' then
    select * into v_latest_pt from public.ac_pressure_tests
     where ac_system_id = p_ac_system_id order by attempt_no desc limit 1;
    if v_latest_pt.id is null or v_latest_pt.status <> 'passed' then
      raise exception 'the pressure test has not passed yet';
    end if;
  elsif p_doc_type = 'drain_test' then
    if exists (
      select 1 from public.ac_units u
      where u.ac_system_id = p_ac_system_id and u.unit_role = 'indoor'
        and not exists (
          select 1 from public.ac_drain_tests d
           where d.ac_unit_id = u.id and d.result = 'passed'
           order by d.tested_at desc limit 1
        )
    ) then
      raise exception 'every indoor unit needs a passed drain test first';
    end if;
  else
    if v_system.status <> 'complete' then
      raise exception 'the system must be marked complete first';
    end if;
  end if;

  -- --- shared building blocks ------------------------------------------
  select * into v_outdoor from public.ac_units where ac_system_id = p_ac_system_id and unit_role = 'outdoor';

  select jsonb_agg(jsonb_build_object(
    'unit_role', u.unit_role, 'reference', u.reference, 'location', u.location,
    'asset_number', u.asset_number, 'model_number', u.model_number, 'serial_number', u.serial_number
  ) order by u.unit_role desc, u.unit_index) into v_units
  from public.ac_units u where u.ac_system_id = p_ac_system_id;

  select * into v_latest_pt from public.ac_pressure_tests
   where ac_system_id = p_ac_system_id order by attempt_no desc limit 1;
  select jsonb_agg(jsonb_build_object('subject', p.subject, 'storage_path', p.storage_path, 'taken_at', p.taken_at))
    into v_pt_photos
  from public.ac_photos p where p.ac_pressure_test_id = v_latest_pt.id;

  select * into v_evac from public.ac_evacuations where ac_system_id = p_ac_system_id;
  select jsonb_build_object('storage_path', p.storage_path, 'taken_at', p.taken_at) into v_evac_photo
  from public.ac_photos p where p.ac_system_id = p_ac_system_id and p.subject = 'evacuation_final'
  order by p.taken_at desc limit 1;

  select * into v_charge from public.ac_charges where ac_system_id = p_ac_system_id;
  select * into v_comm from public.ac_commissioning where ac_system_id = p_ac_system_id;

  select jsonb_agg(jsonb_build_object(
    'ac_unit_id', t.ac_unit_id, 'mode', t.mode, 'air_on_c', t.air_on_c, 'air_off_c', t.air_off_c,
    'recorded_at', t.recorded_at
  )) into v_temps
  from public.ac_temperature_readings t where t.ac_system_id = p_ac_system_id;

  select jsonb_agg(latest) into v_drains from (
    select distinct on (d.ac_unit_id) d.ac_unit_id, d.drain_type, d.pump_model,
      d.water_added_litres, d.result, d.tested_at
    from public.ac_drain_tests d
    join public.ac_units u on u.id = d.ac_unit_id
    where u.ac_system_id = p_ac_system_id
    order by d.ac_unit_id, d.tested_at desc
  ) latest;

  v_snapshot := jsonb_build_object(
    'company', jsonb_build_object(
      'name', v_company.name, 'address_line1', v_company.address_line1,
      'address_line2', v_company.address_line2, 'city', v_company.city,
      'postcode', v_company.postcode, 'phone', v_company.phone, 'logo_path', v_company.logo_path
    ),
    'project', jsonb_build_object(
      'name', v_project.name, 'project_number', v_project.project_number,
      'client_name', v_project.client_name, 'site_address', v_project.site_address,
      'plant_operator', v_settings.plant_operator, 'operator_contact', v_settings.operator_contact
    ),
    'system', jsonb_build_object(
      'ref', v_system.ref, 'system_ref', v_system.system_ref, 'system_type', v_system.system_type,
      'area_served', v_system.area_served, 'outdoor_location', v_system.outdoor_location,
      'manufacturer', coalesce(v_system.manufacturer_other, v_system.manufacturer),
      'refrigerant', coalesce(v_system.refrigerant_other, v_system.refrigerant_code),
      'gwp', v_system.gwp
    ),
    'units', coalesce(v_units, '[]'::jsonb),
    'pressure_test', case when v_latest_pt.id is null then null else jsonb_build_object(
      'attempt_no', v_latest_pt.attempt_no, 'status', v_latest_pt.status,
      'start_pressure_bar', v_latest_pt.start_pressure_bar, 'end_pressure_bar', v_latest_pt.end_pressure_bar,
      'test_duration_min', v_latest_pt.test_duration_min, 'started_at', v_latest_pt.started_at,
      'completed_at', v_latest_pt.completed_at, 'result_at', v_latest_pt.result_at,
      'photos', coalesce(v_pt_photos, '[]'::jsonb)
    ) end,
    'evacuation', case when v_evac.id is null then null else jsonb_build_object(
      'checklist', v_evac.checklist, 'completed_at', v_evac.completed_at, 'photo', v_evac_photo
    ) end,
    'charge', case when v_charge.id is null then null else jsonb_build_object(
      'factory_charge_kg', v_charge.factory_charge_kg,
      'factory_pipe_allowance_m', v_charge.factory_pipe_allowance_m,
      'installed_pipe_length_m', v_charge.installed_pipe_length_m,
      'actual_additional_kg', v_charge.actual_additional_kg,
      'total_charge_kg', v_charge.total_charge_kg,
      'gwp', v_system.gwp,
      'tonnes_co2e', round(v_charge.total_charge_kg * v_system.gwp / 1000, 3)
    ) end,
    'commissioning', case when v_comm.id is null then null else jsonb_build_object(
      'transit_brackets_removed', v_comm.transit_brackets_removed,
      'electrical_connections_tight', v_comm.electrical_connections_tight,
      'local_isolator_fitted', v_comm.local_isolator_fitted,
      'equipment_labelled', v_comm.equipment_labelled,
      'covers_fixed_clean', v_comm.covers_fixed_clean,
      'functional_test_satisfactory', v_comm.functional_test_satisfactory,
      'mcb_fuse_spec', v_comm.mcb_fuse_spec, 'outdoor_nameplate_flc_amps', v_comm.outdoor_nameplate_flc_amps,
      'suction_pipe_size', v_comm.suction_pipe_size, 'liquid_pipe_size', v_comm.liquid_pipe_size,
      'current_cooling', jsonb_build_array(v_comm.current_cooling_l1, v_comm.current_cooling_l2, v_comm.current_cooling_l3),
      'current_heating', jsonb_build_array(v_comm.current_heating_l1, v_comm.current_heating_l2, v_comm.current_heating_l3)
    ) end,
    'temperatures', coalesce(v_temps, '[]'::jsonb),
    'drain_tests', coalesce(v_drains, '[]'::jsonb),
    'completed_at', v_system.completed_at,
    'issued_at', now()
  );

  insert into public.ac_certificates (company_id, project_id, ac_system_id, doc_type, snapshot, issued_by)
  values (v_system.company_id, v_system.project_id, p_ac_system_id, p_doc_type, v_snapshot, auth.uid())
  returning * into v_cert;

  perform public._ac_audit(v_system.company_id, 'certificate_issued', v_system.project_id, v_system.id,
    jsonb_build_object('doc_type', p_doc_type, 'number', v_cert.number));
  return v_cert;
end $$;

grant execute on function
  public.set_ac_project_settings(uuid, text, text),
  public.issue_ac_certificate(uuid, ac_doc_type)
to authenticated;

-- ============================================================================
-- Storage: reuse the existing private `certificates` bucket — policy already
-- keys off the company-id path segment + is_admin generically, so no change.
-- ============================================================================
