-- ============================================================================
-- ProofPod — admin portal + certificate generation
-- Run after 0001 and 0002. Safe to run once on an existing project.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Roles: V1 has two roles. role = 'admin' is an admin; every other value
-- ('member') is a Site User. (Enum unchanged to stay transaction-safe.)
-- ----------------------------------------------------------------------------
do $$ begin
  create type member_status as enum ('active', 'inactive');
exception when duplicate_object then null; end $$;

alter table public.company_members
  add column if not exists status member_status not null default 'active';

-- the original company creator was 'owner' — treat as admin
update public.company_members set role = 'admin' where role = 'owner';

-- invites carry an intended name now
alter table public.company_invites
  add column if not exists full_name text;

-- ----------------------------------------------------------------------------
-- Project-level test setting overrides
--   hierarchy: company default -> project override -> per-test values
-- ----------------------------------------------------------------------------
alter table public.projects
  add column if not exists override_test_profile boolean not null default false,
  add column if not exists initial_pressure_bar  numeric(5,2),
  add column if not exists initial_duration_min  integer,
  add column if not exists strength_pressure_bar numeric(5,2),
  add column if not exists strength_duration_min integer,
  add column if not exists pressure_pressure_bar numeric(5,2),
  add column if not exists pressure_duration_min integer;

-- Let a user always read their own membership rows (even if deactivated) so the
-- app can show a clean "access removed" state instead of the onboarding screen.
drop policy if exists members_select_self on public.company_members;
create policy members_select_self on public.company_members
  for select using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Membership / admin helpers
-- ----------------------------------------------------------------------------
create or replace function public.user_company_ids()
returns setof uuid
language sql security definer stable
set search_path = public
as $$
  select company_id from public.company_members
  where user_id = auth.uid() and status = 'active'
$$;

create or replace function public.is_admin(p_company_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from public.company_members
    where user_id = auth.uid()
      and company_id = p_company_id
      and role = 'admin'
      and status = 'active'
  )
$$;

create or replace function public.require_admin(p_company_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin(p_company_id) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
end $$;

-- Company & default-profile edits are admin-only now (replaces 0001 policies).
drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies
  for update using (public.is_admin(id)) with check (public.is_admin(id));

drop policy if exists test_profiles_write on public.test_profiles;
create policy test_profiles_write on public.test_profiles
  for all using (public.is_admin(company_id)) with check (public.is_admin(company_id));

-- ----------------------------------------------------------------------------
-- bootstrap_company: creator becomes an admin
-- ----------------------------------------------------------------------------
create or replace function public.bootstrap_company(
  p_full_name text, p_company_name text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(trim(p_company_name), '') = '' then raise exception 'company name required'; end if;

  update public.profiles
     set full_name = coalesce(nullif(trim(p_full_name), ''), full_name)
   where id = auth.uid();

  insert into public.companies (name, created_by)
  values (trim(p_company_name), auth.uid())
  returning id into v_company;

  insert into public.company_members (company_id, user_id, role, status)
  values (v_company, auth.uid(), 'admin', 'active');

  insert into public.test_profiles (company_id, name, is_company_default, created_by)
  values (v_company, 'Company default', true, auth.uid());

  perform public._audit(v_company, 'company_created', null, null,
    jsonb_build_object('name', trim(p_company_name)));
  return v_company;
end $$;

-- ----------------------------------------------------------------------------
-- Invites: name + role, applied on accept
-- ----------------------------------------------------------------------------
create or replace function public.create_invite(
  p_company_id uuid,
  p_full_name text default null,
  p_email text default null,
  p_role member_role default 'member'
) returns public.company_invites
language plpgsql security definer set search_path = public as $$
declare v_row public.company_invites;
begin
  perform public.require_admin(p_company_id);
  insert into public.company_invites (company_id, full_name, email, role, invited_by)
  values (
    p_company_id,
    nullif(trim(p_full_name), ''),
    nullif(trim(p_email), ''),
    case when p_role = 'admin' then 'admin' else 'member' end,
    auth.uid()
  )
  returning * into v_row;
  perform public._audit(p_company_id, 'invite_created', null, null,
    jsonb_build_object('role', v_row.role));
  return v_row;
end $$;

create or replace function public.accept_invite(
  p_token text, p_full_name text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_inv public.company_invites;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into v_inv from public.company_invites where token = p_token for update;
  if not found then raise exception 'invite not found'; end if;
  if v_inv.expires_at < now() then raise exception 'invite expired'; end if;

  update public.profiles
     set full_name = coalesce(
       nullif(trim(p_full_name), ''),
       nullif(trim(v_inv.full_name), ''),
       full_name)
   where id = auth.uid();

  insert into public.company_members (company_id, user_id, role, status)
  values (v_inv.company_id, auth.uid(), v_inv.role, 'active')
  on conflict (company_id, user_id)
    do update set status = 'active', role = excluded.role;

  update public.company_invites
     set accepted_by = auth.uid(), accepted_at = now()
   where id = v_inv.id and accepted_at is null;

  perform public._audit(v_inv.company_id, 'member_joined', null, null,
    jsonb_build_object('role', v_inv.role));
  return v_inv.company_id;
end $$;

-- ----------------------------------------------------------------------------
-- User management
-- ----------------------------------------------------------------------------
create or replace function public.set_member_status(
  p_company_id uuid, p_user_id uuid, p_status member_status
) returns public.company_members
language plpgsql security definer set search_path = public as $$
declare v_row public.company_members;
begin
  perform public.require_admin(p_company_id);

  if p_status = 'inactive' then
    if (select count(*) from public.company_members
        where company_id = p_company_id and role = 'admin' and status = 'active'
          and user_id <> p_user_id) = 0
       and exists (select 1 from public.company_members
                   where company_id = p_company_id and user_id = p_user_id and role = 'admin')
    then
      raise exception 'cannot deactivate the last active admin';
    end if;
  end if;

  update public.company_members
     set status = p_status
   where company_id = p_company_id and user_id = p_user_id
  returning * into v_row;

  perform public._audit(p_company_id,
    case when p_status = 'inactive' then 'member_deactivated' else 'member_reactivated' end,
    null, null, jsonb_build_object('user_id', p_user_id));
  return v_row;
end $$;

create or replace function public.set_member_role(
  p_company_id uuid, p_user_id uuid, p_role member_role
) returns public.company_members
language plpgsql security definer set search_path = public as $$
declare v_row public.company_members;
begin
  perform public.require_admin(p_company_id);
  update public.company_members
     set role = case when p_role = 'admin' then 'admin' else 'member' end
   where company_id = p_company_id and user_id = p_user_id
  returning * into v_row;
  perform public._audit(p_company_id, 'member_role_changed', null, null,
    jsonb_build_object('user_id', p_user_id, 'role', v_row.role));
  return v_row;
end $$;

-- ----------------------------------------------------------------------------
-- Project admin actions (admin only)
-- ----------------------------------------------------------------------------
create or replace function public.update_project_details(
  p_project_id uuid,
  p_name text,
  p_project_number text default null,
  p_client_name text default null,
  p_site_address text default null
) returns public.projects
language plpgsql security definer set search_path = public as $$
declare v_row public.projects;
begin
  select * into v_row from public.projects where id = p_project_id;
  if not found then raise exception 'project not found'; end if;
  perform public.require_admin(v_row.company_id);
  if coalesce(trim(p_name), '') = '' then raise exception 'project name required'; end if;

  update public.projects set
    name = trim(p_name),
    project_number = nullif(trim(p_project_number), ''),
    client_name = nullif(trim(p_client_name), ''),
    site_address = nullif(trim(p_site_address), '')
  where id = p_project_id
  returning * into v_row;

  perform public._audit(v_row.company_id, 'project_details_updated', v_row.id);
  return v_row;
end $$;

create or replace function public.set_project_test_override(
  p_project_id uuid,
  p_enabled boolean,
  p_initial_pressure_bar numeric default null,
  p_initial_duration_min integer default null,
  p_strength_pressure_bar numeric default null,
  p_strength_duration_min integer default null,
  p_pressure_pressure_bar numeric default null,
  p_pressure_duration_min integer default null
) returns public.projects
language plpgsql security definer set search_path = public as $$
declare
  v_row public.projects;
  v_def public.test_profiles;
begin
  select * into v_row from public.projects where id = p_project_id;
  if not found then raise exception 'project not found'; end if;
  perform public.require_admin(v_row.company_id);

  select * into v_def from public.test_profiles
   where company_id = v_row.company_id and is_company_default limit 1;

  if p_enabled then
    update public.projects set
      override_test_profile = true,
      initial_pressure_bar  = coalesce(p_initial_pressure_bar,  v_def.initial_pressure_bar),
      initial_duration_min  = coalesce(p_initial_duration_min,  v_def.initial_duration_min),
      strength_pressure_bar = coalesce(p_strength_pressure_bar, v_def.strength_pressure_bar),
      strength_duration_min = coalesce(p_strength_duration_min, v_def.strength_duration_min),
      pressure_pressure_bar = coalesce(p_pressure_pressure_bar, v_def.pressure_pressure_bar),
      pressure_duration_min = coalesce(p_pressure_duration_min, v_def.pressure_duration_min)
    where id = p_project_id returning * into v_row;
  else
    update public.projects set
      override_test_profile = false,
      initial_pressure_bar = null, initial_duration_min = null,
      strength_pressure_bar = null, strength_duration_min = null,
      pressure_pressure_bar = null, pressure_duration_min = null
    where id = p_project_id returning * into v_row;
  end if;

  perform public._audit(v_row.company_id, 'project_test_override_set', v_row.id,
    null, jsonb_build_object('enabled', p_enabled));
  return v_row;
end $$;

-- archive / reactivate is now admin only
create or replace function public.set_project_status(
  p_project_id uuid, p_status project_status
) returns public.projects
language plpgsql security definer set search_path = public as $$
declare v_row public.projects;
begin
  select * into v_row from public.projects where id = p_project_id;
  if not found then raise exception 'project not found'; end if;
  perform public.require_admin(v_row.company_id);

  update public.projects
     set status = p_status,
         archived_at = case when p_status = 'archived' then now() else null end
   where id = p_project_id
  returning * into v_row;

  perform public._audit(v_row.company_id,
    case when p_status = 'archived' then 'project_archived' else 'project_reactivated' end,
    v_row.id);
  return v_row;
end $$;

-- ----------------------------------------------------------------------------
-- create_test: resolve company default -> project override
-- ----------------------------------------------------------------------------
create or replace function public.create_test(
  p_project_id uuid,
  p_floor text,
  p_system system_kind,
  p_area text,
  p_system_other text default null
) returns public.pressure_tests
language plpgsql security definer set search_path = public as $$
declare
  v_project public.projects;
  v_def public.test_profiles;
  v_test public.pressure_tests;
  ip numeric; idm integer; sp numeric; sdm integer; pp numeric; pdm integer;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'project not found'; end if;
  perform public.require_member(v_project.company_id);
  if coalesce(trim(p_area), '') = '' then raise exception 'area required'; end if;

  select * into v_def from public.test_profiles
   where company_id = v_project.company_id and is_company_default limit 1;
  if not found then raise exception 'no test profile for company'; end if;

  if v_project.override_test_profile then
    ip := coalesce(v_project.initial_pressure_bar,  v_def.initial_pressure_bar);
    idm:= coalesce(v_project.initial_duration_min,  v_def.initial_duration_min);
    sp := coalesce(v_project.strength_pressure_bar, v_def.strength_pressure_bar);
    sdm:= coalesce(v_project.strength_duration_min, v_def.strength_duration_min);
    pp := coalesce(v_project.pressure_pressure_bar, v_def.pressure_pressure_bar);
    pdm:= coalesce(v_project.pressure_duration_min, v_def.pressure_duration_min);
  else
    ip := v_def.initial_pressure_bar;  idm := v_def.initial_duration_min;
    sp := v_def.strength_pressure_bar; sdm := v_def.strength_duration_min;
    pp := v_def.pressure_pressure_bar; pdm := v_def.pressure_duration_min;
  end if;

  insert into public.pressure_tests (
    company_id, project_id, floor, system, system_other, area,
    initial_pressure_bar, initial_duration_min,
    strength_pressure_bar, strength_duration_min,
    pressure_pressure_bar, pressure_duration_min, created_by
  ) values (
    v_project.company_id, p_project_id, coalesce(nullif(trim(p_floor), ''), '0'),
    p_system, nullif(trim(p_system_other), ''), trim(p_area),
    ip, idm, sp, sdm, pp, pdm, auth.uid()
  ) returning * into v_test;

  insert into public.test_stages (company_id, test_id, stage)
  values (v_test.company_id, v_test.id, 'initial'),
         (v_test.company_id, v_test.id, 'strength'),
         (v_test.company_id, v_test.id, 'pressure');

  perform public._audit(v_test.company_id, 'test_created', p_project_id, v_test.id,
    jsonb_build_object('ref', v_test.ref, 'floor', v_test.floor,
                       'system', v_test.system, 'area', v_test.area));
  return v_test;
end $$;

-- ----------------------------------------------------------------------------
-- admin_update_test: correct identifying fields on an IN PROGRESS test
-- ----------------------------------------------------------------------------
create or replace function public.admin_update_test(
  p_test_id uuid,
  p_floor text,
  p_system system_kind,
  p_area text,
  p_system_other text default null
) returns public.pressure_tests
language plpgsql security definer set search_path = public as $$
declare v_test public.pressure_tests;
begin
  select * into v_test from public.pressure_tests where id = p_test_id;
  if not found then raise exception 'test not found'; end if;
  perform public.require_admin(v_test.company_id);
  if v_test.status <> 'in_progress' then
    raise exception 'only in-progress tests can be edited';
  end if;

  update public.pressure_tests set
    floor = coalesce(nullif(trim(p_floor), ''), floor),
    system = p_system,
    system_other = nullif(trim(p_system_other), ''),
    area = coalesce(nullif(trim(p_area), ''), area)
  where id = p_test_id
  returning * into v_test;

  perform public._audit(v_test.company_id, 'test_edited', v_test.project_id, v_test.id);
  return v_test;
end $$;

-- ============================================================================
-- Certificates
-- ============================================================================
create sequence if not exists public.certificate_number_seq start 1;

create table if not exists public.certificates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  number      text not null unique
                default ('PPC-' || lpad(nextval('public.certificate_number_seq')::text, 6, '0')),
  test_count  integer not null default 0,
  snapshot    jsonb not null,
  pdf_path    text,
  issued_by   uuid references auth.users (id) on delete set null,
  issued_at   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists certificates_project_idx on public.certificates (project_id);
create index if not exists certificates_company_idx on public.certificates (company_id, issued_at desc);

create table if not exists public.certificate_tests (
  certificate_id uuid not null references public.certificates (id) on delete cascade,
  test_id        uuid not null references public.pressure_tests (id) on delete restrict,
  primary key (certificate_id, test_id)
);

alter table public.certificates      enable row level security;
alter table public.certificate_tests enable row level security;

create policy certificates_select on public.certificates
  for select using (public.is_admin(company_id));
create policy certificates_update on public.certificates
  for update using (public.is_admin(company_id)) with check (public.is_admin(company_id));

create policy certificate_tests_select on public.certificate_tests
  for select using (
    exists (select 1 from public.certificates c
            where c.id = certificate_id and public.is_admin(c.company_id))
  );

-- Build an immutable snapshot + issue the certificate in one transaction.
create or replace function public.issue_certificate(
  p_project_id uuid, p_test_ids uuid[]
) returns public.certificates
language plpgsql security definer set search_path = public as $$
declare
  v_project public.projects;
  v_company public.companies;
  v_cert public.certificates;
  v_snapshot jsonb;
  v_tests jsonb;
  v_bad int;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'project not found'; end if;
  perform public.require_admin(v_project.company_id);

  if p_test_ids is null or array_length(p_test_ids, 1) is null then
    raise exception 'select at least one passed test';
  end if;

  select count(*) into v_bad
  from unnest(p_test_ids) tid
  left join public.pressure_tests t on t.id = tid
  where t.id is null or t.project_id <> p_project_id or t.status <> 'passed';
  if v_bad > 0 then
    raise exception 'all selected tests must be passed tests in this project';
  end if;

  select * into v_company from public.companies where id = v_project.company_id;

  select jsonb_agg(tj order by tj->>'ref') into v_tests
  from (
    select jsonb_build_object(
      'id', t.id,
      'ref', t.ref,
      'floor', t.floor,
      'system', t.system,
      'system_other', t.system_other,
      'area', t.area,
      'status', t.status,
      'result_at', t.result_at,
      'result_by', coalesce(rp.full_name, 'Someone'),
      'created_by', coalesce(cp.full_name, 'Someone'),
      'stages', (
        select jsonb_agg(jsonb_build_object(
          'stage', s.stage,
          'target_pressure_bar', coalesce(s.target_pressure_bar,
            case s.stage when 'initial' then t.initial_pressure_bar
                         when 'strength' then t.strength_pressure_bar
                         else t.pressure_pressure_bar end),
          'target_duration_min', coalesce(s.target_duration_min,
            case s.stage when 'initial' then t.initial_duration_min
                         when 'strength' then t.strength_duration_min
                         else t.pressure_duration_min end),
          'started_at', s.started_at,
          'completed_at', s.completed_at,
          'started_by', sp.full_name,
          'completed_by', cpp.full_name
        ) order by array_position(array['initial','strength','pressure']::text[], s.stage::text))
        from public.test_stages s
        left join public.profiles sp on sp.id = s.started_by
        left join public.profiles cpp on cpp.id = s.completed_by
        where s.test_id = t.id and s.status <> 'not_started'
      ),
      'photos', (
        select jsonb_agg(jsonb_build_object(
          'kind', p.kind, 'stage', p.stage, 'storage_path', p.storage_path,
          'taken_at', p.taken_at
        ) order by p.taken_at)
        from public.test_photos p where p.test_id = t.id
      )
    ) tj
    from public.pressure_tests t
    left join public.profiles rp on rp.id = t.result_by
    left join public.profiles cp on cp.id = t.created_by
    where t.id = any(p_test_ids)
  ) sub;

  v_snapshot := jsonb_build_object(
    'company', jsonb_build_object(
      'name', v_company.name,
      'address_line1', v_company.address_line1,
      'address_line2', v_company.address_line2,
      'city', v_company.city,
      'postcode', v_company.postcode,
      'phone', v_company.phone,
      'logo_path', v_company.logo_path
    ),
    'project', jsonb_build_object(
      'name', v_project.name,
      'project_number', v_project.project_number,
      'client_name', v_project.client_name,
      'site_address', v_project.site_address
    ),
    'tests', coalesce(v_tests, '[]'::jsonb),
    'issued_at', now()
  );

  insert into public.certificates (company_id, project_id, test_count, snapshot, issued_by)
  values (v_project.company_id, p_project_id, array_length(p_test_ids, 1), v_snapshot, auth.uid())
  returning * into v_cert;

  insert into public.certificate_tests (certificate_id, test_id)
  select v_cert.id, tid from unnest(p_test_ids) tid;

  perform public._audit(v_project.company_id, 'certificate_issued', p_project_id, null,
    jsonb_build_object('number', v_cert.number, 'test_count', v_cert.test_count));
  return v_cert;
end $$;

-- ============================================================================
-- project_overview: expose override columns (view already SELECT *; recreate to
-- be explicit is unnecessary — SELECT p.* picks up new columns automatically)
-- ============================================================================

-- ============================================================================
-- Storage: private certificates bucket
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificates', 'certificates', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = excluded.public;

drop policy if exists "certificates read" on storage.objects;
create policy "certificates read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'certificates'
    and public.is_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "certificates write" on storage.objects;
create policy "certificates write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'certificates'
    and public.is_admin(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "certificates update" on storage.objects;
create policy "certificates update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'certificates'
    and public.is_admin(((storage.foldername(name))[1])::uuid)
  );

-- ============================================================================
-- Permissions
-- ============================================================================
grant execute on function
  public.create_invite(uuid, text, text, member_role),
  public.set_member_status(uuid, uuid, member_status),
  public.set_member_role(uuid, uuid, member_role),
  public.update_project_details(uuid, text, text, text, text),
  public.set_project_test_override(uuid, boolean, numeric, integer, numeric, integer, numeric, integer),
  public.admin_update_test(uuid, text, system_kind, text, text),
  public.issue_certificate(uuid, uuid[])
to authenticated;

-- Older single-arg create_invite signature (from 0001) is superseded; drop it
-- so PostgREST resolves the new one unambiguously.
drop function if exists public.create_invite(uuid, text, member_role);
