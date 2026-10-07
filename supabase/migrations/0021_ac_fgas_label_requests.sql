-- ============================================================================
-- ProofPod — AC Commissioning: "Request F-Gas label". Once a system is
-- complete (so the charge is final), a frozen copy of the label data is saved
-- here and sent to Tagref, which produces the label. The request is stored
-- first so nothing is lost if Tagref can't be reached; status tracks whether
-- it has been delivered. One request per system.
-- Run after 0001-0020.
-- ============================================================================

create table if not exists public.ac_fgas_label_requests (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  ac_system_id  uuid not null unique references public.ac_systems (id) on delete cascade,
  payload       jsonb not null,
  status        text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts      integer not null default 0,
  last_error    text,
  sent_at       timestamptz,
  requested_by  uuid references auth.users (id) on delete set null,
  requested_at  timestamptz not null default now()
);

alter table public.ac_fgas_label_requests enable row level security;
create policy ac_fgas_label_requests_select on public.ac_fgas_label_requests
  for select using (company_id in (select public.user_company_ids()));

-- Creates (or returns the existing) request, building the payload from the
-- completed system. Only complete systems qualify.
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

  insert into public.ac_fgas_label_requests (id, company_id, project_id, ac_system_id, requested_by, payload)
  values (
    v_id, v_system.company_id, v_system.project_id, p_ac_system_id, auth.uid(),
    jsonb_build_object(
      'request_id', v_id,
      'proofpod_system_id', v_system.id,
      'company_name', v_company.name,
      'project_name', v_project.name,
      'project_number', v_project.project_number,
      'system_ref', v_system.system_ref,
      -- Tagref asset ids are the digits of a scanned label ("R100108" -> "100108");
      -- a hand-typed asset number has no Tagref match, so this is null.
      'outdoor_asset_id', case when v_outdoor.asset_number ~ '^R[0-9]+$' then substring(v_outdoor.asset_number from 2) else null end,
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

-- Records the outcome of an attempt to deliver the request to Tagref.
create or replace function public.record_ac_fgas_label_send(
  p_request_id uuid, p_ok boolean, p_error text default null
) returns public.ac_fgas_label_requests
language plpgsql security definer set search_path = public as $$
declare v_row public.ac_fgas_label_requests;
begin
  select * into v_row from public.ac_fgas_label_requests where id = p_request_id for update;
  if not found then raise exception 'request not found'; end if;
  perform public.require_member(v_row.company_id);
  if v_row.status = 'sent' then return v_row; end if;

  update public.ac_fgas_label_requests set
    attempts   = attempts + 1,
    status     = case when p_ok then 'sent' else 'failed' end,
    last_error = case when p_ok then null else p_error end,
    sent_at    = case when p_ok then now() else sent_at end
  where id = p_request_id
  returning * into v_row;

  perform public._ac_audit(v_row.company_id,
    case when p_ok then 'fgas_label_sent' else 'fgas_label_send_failed' end,
    v_row.project_id, v_row.ac_system_id,
    jsonb_build_object('attempts', v_row.attempts, 'error', p_error));
  return v_row;
end $$;

grant execute on function
  public.request_ac_fgas_label(uuid),
  public.record_ac_fgas_label_send(uuid, boolean, text)
to authenticated;
