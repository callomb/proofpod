-- ============================================================================
-- F-Gas label requests no longer need to be sent over the internet: Tagref now
-- shares this database, so a request is just a saved row that Tagref's queue
-- screen reads (with the server-side service-role key) and marks produced.
-- The table was empty when this ran, so the delivery bookkeeping is dropped.
-- Also links the request to the Tagref asset when the outdoor unit's scanned
-- asset number matches one. Run after 0001-0022.
-- ============================================================================

alter table public.ac_fgas_label_requests
  drop constraint if exists ac_fgas_label_requests_status_check,
  drop column if exists attempts,
  drop column if exists last_error,
  drop column if exists sent_at;

alter table public.ac_fgas_label_requests
  alter column status set default 'requested',
  add constraint ac_fgas_label_requests_status_check check (status in ('requested', 'produced')),
  add column if not exists produced_at timestamptz,
  add column if not exists tagref_asset_id bigint references public.tagref_assets (asset_id);

drop function if exists public.record_ac_fgas_label_send(uuid, boolean, text);

create or replace function public.request_ac_fgas_label(p_ac_system_id uuid)
returns public.ac_fgas_label_requests
language plpgsql security definer set search_path = public as $$
declare
  v_system public.ac_systems;
  v_company public.companies;
  v_project public.projects;
  v_outdoor public.ac_units;
  v_charge public.ac_charges;
  v_existing public.ac_fgas_label_requests;
  v_asset_digits text;
  v_tagref_asset bigint;
  v_id uuid := gen_random_uuid();
  v_row public.ac_fgas_label_requests;
begin
  select * into v_system from public.ac_systems where id = p_ac_system_id;
  if not found then raise exception 'system not found'; end if;
  perform public.require_member(v_system.company_id);

  select * into v_existing from public.ac_fgas_label_requests where ac_system_id = p_ac_system_id;
  if found then return v_existing; end if;

  if v_system.status <> 'complete' then
    raise exception 'the system must be complete before requesting an F-Gas label';
  end if;

  select * into v_company from public.companies where id = v_system.company_id;
  select * into v_project from public.projects where id = v_system.project_id;
  select * into v_outdoor from public.ac_units where ac_system_id = p_ac_system_id and unit_role = 'outdoor' limit 1;
  select * into v_charge from public.ac_charges where ac_system_id = p_ac_system_id;

  -- Tagref asset ids are the digits of a scanned label ("R100108" -> 100108);
  -- a hand-typed asset number has no Tagref match.
  v_asset_digits := case when v_outdoor.asset_number ~ '^R[0-9]+$' then substring(v_outdoor.asset_number from 2) end;
  select asset_id into v_tagref_asset from public.tagref_assets where asset_id = v_asset_digits::bigint;

  insert into public.ac_fgas_label_requests (id, company_id, project_id, ac_system_id, requested_by, tagref_asset_id, payload)
  values (
    v_id, v_system.company_id, v_system.project_id, p_ac_system_id, auth.uid(), v_tagref_asset,
    jsonb_build_object(
      'request_id', v_id,
      'proofpod_system_id', v_system.id,
      'company_name', v_company.name,
      'project_name', v_project.name,
      'project_number', v_project.project_number,
      'system_ref', v_system.system_ref,
      'outdoor_asset_id', v_asset_digits,
      'outdoor_asset_number', v_outdoor.asset_number,
      'outdoor_reference', v_outdoor.reference,
      'outdoor_model', v_outdoor.model_number,
      'outdoor_serial', v_outdoor.serial_number,
      'area_served', v_system.area_served,
      'refrigerant', coalesce(v_system.refrigerant_other, v_system.refrigerant_code),
      'gwp', v_system.gwp,
      'total_charge_kg', v_charge.total_charge_kg,
      'co2e_kg', round(v_charge.total_charge_kg * v_system.gwp, 1),
      'commissioning_date', to_char(v_system.completed_at at time zone 'Europe/London', 'YYYY-MM-DD'),
      'requested_at', now()
    )
  )
  returning * into v_row;

  perform public._ac_audit(v_system.company_id, 'fgas_label_requested', v_system.project_id, v_system.id);
  return v_row;
end $$;

grant execute on function public.request_ac_fgas_label(uuid) to authenticated;
