-- ============================================================================
-- ProofPod — AC Commissioning: engineer signature (required) and optional
-- witness (typed name + signature), captured when the system is completed.
-- Signatures are PNGs in the private evidence bucket; their paths are stored
-- on the system, locked with it, and frozen into the certificate snapshot.
-- The Full Certificate only prints a witness block when a witness signed.
-- Run after 0001-0019.
-- ============================================================================

alter table public.ac_systems
  add column if not exists engineer_signature_path text,
  add column if not exists witness_name text,
  add column if not exists witness_signature_path text;

drop function if exists public.complete_ac_system(uuid);

create or replace function public.complete_ac_system(
  p_ac_system_id uuid,
  p_signature_path text,
  p_witness_name text default null,
  p_witness_signature_path text default null
)
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

  -- Signatures are stored in the private evidence bucket under this
  -- company's folder; refuse paths pointing anywhere else.
  if nullif(trim(p_signature_path), '') is null then
    raise exception 'the engineer signature is required to complete the system' using errcode = '22023';
  end if;
  if p_signature_path not like v_system.company_id::text || '/%' then
    raise exception 'invalid signature path' using errcode = '22023';
  end if;
  if (nullif(trim(p_witness_name), '') is null) <> (nullif(trim(p_witness_signature_path), '') is null) then
    raise exception 'a witness needs both a name and a signature' using errcode = '22023';
  end if;
  if p_witness_signature_path is not null and p_witness_signature_path not like v_system.company_id::text || '/%' then
    raise exception 'invalid witness signature path' using errcode = '22023';
  end if;

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
    status = 'complete', locked = true, completed_at = now(), completed_by = auth.uid(),
    engineer_signature_path = trim(p_signature_path),
    witness_name = nullif(trim(p_witness_name), ''),
    witness_signature_path = nullif(trim(p_witness_signature_path), '')
  where id = p_ac_system_id
  returning * into v_system;

  perform public._ac_audit(v_system.company_id, 'system_completed', v_system.project_id, v_system.id,
    jsonb_build_object('witnessed', p_witness_signature_path is not null));
  return v_system;
end $$;


grant execute on function public.complete_ac_system(uuid, text, text, text) to authenticated;

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
  v_pt_stages jsonb;
  v_evac public.ac_evacuations;
  v_evac_photo jsonb;
  v_charge public.ac_charges;
  v_comm public.ac_commissioning;
  v_temps jsonb;
  v_drains jsonb;
  v_completed_by_name text;
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
    'id', u.id, 'unit_role', u.unit_role, 'reference', u.reference, 'location', u.location,
    'asset_number', u.asset_number, 'model_number', u.model_number, 'serial_number', u.serial_number,
    'manufacture_date', u.manufacture_date
  ) order by u.unit_role desc, u.unit_index) into v_units
  from public.ac_units u where u.ac_system_id = p_ac_system_id;

  select * into v_latest_pt from public.ac_pressure_tests
   where ac_system_id = p_ac_system_id order by attempt_no desc limit 1;

  select jsonb_agg(jsonb_build_object(
    'stage_no', s.stage_no,
    'target_pressure_bar', s.target_pressure_bar,
    'target_duration_min', s.target_duration_min,
    'requires_photo', s.requires_photo,
    'status', s.status,
    'started_at', s.started_at,
    'completed_at', s.completed_at,
    'photos', (
      select jsonb_agg(jsonb_build_object(
        'subject', p.subject, 'storage_path', p.storage_path, 'taken_at', p.taken_at,
        'taken_by_name', pr.full_name
      ))
      from public.ac_photos p
      left join public.profiles pr on pr.id = p.taken_by
      where p.ac_pressure_test_id = v_latest_pt.id and p.stage_no = s.stage_no
    )
  ) order by s.stage_no) into v_pt_stages
  from public.ac_pressure_test_stages s
  where s.ac_pressure_test_id = v_latest_pt.id;

  select * into v_evac from public.ac_evacuations where ac_system_id = p_ac_system_id;
  select jsonb_build_object(
    'storage_path', p.storage_path, 'taken_at', p.taken_at, 'taken_by_name', pr.full_name
  ) into v_evac_photo
  from public.ac_photos p
  left join public.profiles pr on pr.id = p.taken_by
  where p.ac_system_id = p_ac_system_id and p.subject = 'evacuation_final'
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

  select full_name into v_completed_by_name from public.profiles where id = v_system.completed_by;

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
      'result_at', v_latest_pt.result_at,
      'stages', coalesce(v_pt_stages, '[]'::jsonb)
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
    'completed_by_name', v_completed_by_name,
    'engineer_signature_path', v_system.engineer_signature_path,
    'witness', case when v_system.witness_signature_path is null then null else jsonb_build_object(
      'name', v_system.witness_name, 'signature_path', v_system.witness_signature_path
    ) end,
    'issued_at', now()
  );

  insert into public.ac_certificates (company_id, project_id, ac_system_id, doc_type, snapshot, issued_by)
  values (v_system.company_id, v_system.project_id, p_ac_system_id, p_doc_type, v_snapshot, auth.uid())
  returning * into v_cert;

  perform public._ac_audit(v_system.company_id, 'certificate_issued', v_system.project_id, v_system.id,
    jsonb_build_object('doc_type', p_doc_type, 'number', v_cert.number));
  return v_cert;
end $$;
