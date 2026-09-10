-- ============================================================================
-- ProofPod — initial schema
-- Evidence capture for pressure testing.
--
-- Run this in the Supabase SQL Editor (or via `supabase db push`).
-- Safe to run once on a fresh project.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type project_status as enum ('active', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type test_status as enum ('in_progress', 'passed', 'failed', 'void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type stage_key as enum ('initial', 'strength', 'pressure');
exception when duplicate_object then null; end $$;

do $$ begin
  create type stage_status as enum ('not_started', 'in_progress', 'complete');
exception when duplicate_object then null; end $$;

do $$ begin
  create type system_kind as enum ('cold', 'hot', 'boosted', 'heating', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type photo_kind as enum ('start', 'end', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_role as enum ('owner', 'admin', 'member');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- updated_at helper
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- companies
-- ----------------------------------------------------------------------------
create table if not exists public.companies (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  -- contractor details, for certificates later
  address_line1     text,
  address_line2     text,
  city              text,
  postcode          text,
  country           text default 'United Kingdom',
  phone             text,
  logo_path         text,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now()
);
create trigger companies_touch before update on public.companies
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Auto-create a profile row when a user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = case when public.profiles.full_name = '' then excluded.full_name
                         else public.profiles.full_name end;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- company_members
-- ----------------------------------------------------------------------------
create table if not exists public.company_members (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        member_role not null default 'member',
  created_at  timestamptz not null default now(),
  unique (company_id, user_id)
);
create index if not exists company_members_user_idx on public.company_members (user_id);
create index if not exists company_members_company_idx on public.company_members (company_id);

-- ----------------------------------------------------------------------------
-- company_invites  (shareable-link invites — no email dependency for the beta)
-- ----------------------------------------------------------------------------
create table if not exists public.company_invites (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  email       text,
  role        member_role not null default 'member',
  token       text not null unique default encode(gen_random_bytes(18), 'hex'),
  invited_by  uuid references auth.users (id) on delete set null,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '30 days')
);
create index if not exists company_invites_company_idx on public.company_invites (company_id);

-- ----------------------------------------------------------------------------
-- test_profiles  (company default stage values; projects may point at one)
-- ----------------------------------------------------------------------------
create table if not exists public.test_profiles (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references public.companies (id) on delete cascade,
  name                   text not null default 'Company default',
  is_company_default     boolean not null default false,

  initial_pressure_bar   numeric(5,2) not null default 2.0,
  initial_duration_min   integer not null default 20,
  strength_pressure_bar  numeric(5,2) not null default 4.0,
  strength_duration_min  integer not null default 20,
  pressure_pressure_bar  numeric(5,2) not null default 2.5,
  pressure_duration_min  integer not null default 60,

  created_at             timestamptz not null default now(),
  created_by             uuid references auth.users (id) on delete set null,
  updated_at             timestamptz not null default now()
);
create unique index if not exists one_company_default
  on public.test_profiles (company_id) where is_company_default;
create trigger test_profiles_touch before update on public.test_profiles
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- projects
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  name             text not null,
  project_number   text,
  client_name      text,
  site_address     text,
  status           project_status not null default 'active',
  test_profile_id  uuid references public.test_profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) on delete set null,
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz
);
create index if not exists projects_company_status_idx
  on public.projects (company_id, status);
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- pressure_tests
-- ----------------------------------------------------------------------------
create sequence if not exists public.pressure_test_ref_seq start 1001;

create table if not exists public.pressure_tests (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  ref           text not null unique
                  default ('PP-' || lpad(nextval('public.pressure_test_ref_seq')::text, 6, '0')),

  floor         text not null default '0',
  system        system_kind not null,
  system_other  text,
  area          text not null,

  status        test_status not null default 'in_progress',
  result_at     timestamptz,
  result_by     uuid references auth.users (id) on delete set null,
  locked        boolean not null default false,

  voided_at     timestamptz,
  voided_by     uuid references auth.users (id) on delete set null,
  void_reason   text,

  retest_of     uuid references public.pressure_tests (id) on delete set null,

  -- effective stage values for THIS test (snapshotted from the profile at creation;
  -- editable via the settings gear while the test is unlocked)
  initial_pressure_bar   numeric(5,2) not null,
  initial_duration_min   integer not null,
  strength_pressure_bar  numeric(5,2) not null,
  strength_duration_min  integer not null,
  pressure_pressure_bar  numeric(5,2) not null,
  pressure_duration_min  integer not null,

  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now()
);
create index if not exists pressure_tests_project_idx on public.pressure_tests (project_id);
create index if not exists pressure_tests_company_idx on public.pressure_tests (company_id);
create index if not exists pressure_tests_retest_idx on public.pressure_tests (retest_of);
create trigger pressure_tests_touch before update on public.pressure_tests
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- test_stages  (always 3 per test; independent)
-- ----------------------------------------------------------------------------
create table if not exists public.test_stages (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies (id) on delete cascade,
  test_id              uuid not null references public.pressure_tests (id) on delete cascade,
  stage                stage_key not null,
  status               stage_status not null default 'not_started',

  -- snapshot of the target values at the moment the stage was started
  target_pressure_bar  numeric(5,2),
  target_duration_min  integer,

  started_at           timestamptz,
  started_by           uuid references auth.users (id) on delete set null,
  completed_at         timestamptz,
  completed_by         uuid references auth.users (id) on delete set null,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (test_id, stage)
);
create index if not exists test_stages_test_idx on public.test_stages (test_id);
create trigger test_stages_touch before update on public.test_stages
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- test_photos
-- ----------------------------------------------------------------------------
create table if not exists public.test_photos (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  test_id       uuid not null references public.pressure_tests (id) on delete cascade,
  stage_id      uuid references public.test_stages (id) on delete set null,
  stage         stage_key,
  kind          photo_kind not null default 'other',
  storage_path  text not null,
  mime          text,
  size_bytes    integer,
  taken_at      timestamptz not null default now(),
  taken_by      uuid not null references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists test_photos_test_idx on public.test_photos (test_id);

-- ----------------------------------------------------------------------------
-- audit_events  (lightweight provenance trail)
-- ----------------------------------------------------------------------------
create table if not exists public.audit_events (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  project_id  uuid references public.projects (id) on delete set null,
  test_id     uuid references public.pressure_tests (id) on delete set null,
  event_type  text not null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_events_company_idx on public.audit_events (company_id, created_at desc);
create index if not exists audit_events_test_idx on public.audit_events (test_id);

-- ============================================================================
-- Membership helper — SECURITY DEFINER so RLS policies can call it without
-- recursing into company_members.
-- ============================================================================
create or replace function public.user_company_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select company_id from public.company_members where user_id = auth.uid()
$$;

create or replace function public.is_member(p_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.company_members
    where user_id = auth.uid() and company_id = p_company_id
  )
$$;

create or replace function public.require_member(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_member(p_company_id) then
    raise exception 'not a member of this company' using errcode = '42501';
  end if;
end $$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.companies        enable row level security;
alter table public.profiles         enable row level security;
alter table public.company_members  enable row level security;
alter table public.company_invites  enable row level security;
alter table public.test_profiles    enable row level security;
alter table public.projects         enable row level security;
alter table public.pressure_tests   enable row level security;
alter table public.test_stages      enable row level security;
alter table public.test_photos      enable row level security;
alter table public.audit_events     enable row level security;

-- companies -----------------------------------------------------------------
create policy companies_select on public.companies
  for select using (id in (select public.user_company_ids()));
create policy companies_update on public.companies
  for update using (id in (select public.user_company_ids()))
  with check (id in (select public.user_company_ids()));

-- profiles ----------------------------------------------------------------
create policy profiles_select_self on public.profiles
  for select using (
    id = auth.uid()
    or id in (
      select user_id from public.company_members
      where company_id in (select public.user_company_ids())
    )
  );
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- company_members --------------------------------------------------------
create policy members_select on public.company_members
  for select using (company_id in (select public.user_company_ids()));

-- company_invites -------------------------------------------------------
create policy invites_select on public.company_invites
  for select using (company_id in (select public.user_company_ids()));

-- test_profiles -------------------------------------------------------
create policy test_profiles_select on public.test_profiles
  for select using (company_id in (select public.user_company_ids()));
create policy test_profiles_write on public.test_profiles
  for all using (company_id in (select public.user_company_ids()))
  with check (company_id in (select public.user_company_ids()));

-- projects ---------------------------------------------------------
create policy projects_select on public.projects
  for select using (company_id in (select public.user_company_ids()));
create policy projects_insert on public.projects
  for insert with check (company_id in (select public.user_company_ids()));
create policy projects_update on public.projects
  for update using (company_id in (select public.user_company_ids()))
  with check (company_id in (select public.user_company_ids()));

-- pressure_tests --------------------------------------------------
create policy tests_select on public.pressure_tests
  for select using (company_id in (select public.user_company_ids()));
-- direct updates only while unlocked; locked tests change only via RPC
create policy tests_update_unlocked on public.pressure_tests
  for update using (
    company_id in (select public.user_company_ids()) and locked = false
  )
  with check (company_id in (select public.user_company_ids()));

-- test_stages ---------------------------------------------------
create policy stages_select on public.test_stages
  for select using (company_id in (select public.user_company_ids()));

-- test_photos -------------------------------------------------
create policy photos_select on public.test_photos
  for select using (company_id in (select public.user_company_ids()));
create policy photos_insert on public.test_photos
  for insert with check (
    company_id in (select public.user_company_ids()) and taken_by = auth.uid()
  );

-- audit_events ----------------------------------------------
create policy audit_select on public.audit_events
  for select using (company_id in (select public.user_company_ids()));

-- ============================================================================
-- RPCs  (all SECURITY DEFINER; each checks membership)
-- ============================================================================

-- audit helper (internal)
create or replace function public._audit(
  p_company_id uuid, p_event text, p_project uuid default null,
  p_test uuid default null, p_data jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public as $$
  insert into public.audit_events (company_id, actor_id, project_id, test_id, event_type, data)
  values (p_company_id, auth.uid(), p_project, p_test, p_event, p_data);
$$;

-- --- onboarding: create a company for the current user ----------------------
create or replace function public.bootstrap_company(
  p_full_name text, p_company_name text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(trim(p_company_name), '') = '' then
    raise exception 'company name required';
  end if;

  update public.profiles
     set full_name = coalesce(nullif(trim(p_full_name), ''), full_name)
   where id = auth.uid();

  insert into public.companies (name, created_by)
  values (trim(p_company_name), auth.uid())
  returning id into v_company;

  insert into public.company_members (company_id, user_id, role)
  values (v_company, auth.uid(), 'owner');

  insert into public.test_profiles (company_id, name, is_company_default, created_by)
  values (v_company, 'Company default', true, auth.uid());

  perform public._audit(v_company, 'company_created', null, null,
    jsonb_build_object('name', trim(p_company_name)));

  return v_company;
end $$;

-- --- invites --------------------------------------------------------------
create or replace function public.create_invite(
  p_company_id uuid, p_email text default null, p_role member_role default 'member'
) returns public.company_invites
language plpgsql security definer set search_path = public as $$
declare v_row public.company_invites;
begin
  perform public.require_member(p_company_id);
  insert into public.company_invites (company_id, email, role, invited_by)
  values (p_company_id, nullif(trim(p_email), ''), coalesce(p_role, 'member'), auth.uid())
  returning * into v_row;
  perform public._audit(p_company_id, 'invite_created');
  return v_row;
end $$;

create or replace function public.accept_invite(
  p_token text, p_full_name text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_inv public.company_invites;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into v_inv from public.company_invites
   where token = p_token
   for update;

  if not found then raise exception 'invite not found'; end if;
  if v_inv.expires_at < now() then raise exception 'invite expired'; end if;

  update public.profiles
     set full_name = coalesce(nullif(trim(p_full_name), ''), full_name)
   where id = auth.uid();

  insert into public.company_members (company_id, user_id, role)
  values (v_inv.company_id, auth.uid(), v_inv.role)
  on conflict (company_id, user_id) do nothing;

  update public.company_invites
     set accepted_by = auth.uid(), accepted_at = now()
   where id = v_inv.id and accepted_at is null;

  perform public._audit(v_inv.company_id, 'member_joined');
  return v_inv.company_id;
end $$;

-- --- projects -----------------------------------------------------------
create or replace function public.create_project(
  p_company_id uuid, p_name text
) returns public.projects
language plpgsql security definer set search_path = public as $$
declare v_row public.projects;
begin
  perform public.require_member(p_company_id);
  if coalesce(trim(p_name), '') = '' then raise exception 'project name required'; end if;

  insert into public.projects (company_id, name, created_by)
  values (p_company_id, trim(p_name), auth.uid())
  returning * into v_row;

  perform public._audit(p_company_id, 'project_created', v_row.id, null,
    jsonb_build_object('name', v_row.name));
  return v_row;
end $$;

create or replace function public.set_project_status(
  p_project_id uuid, p_status project_status
) returns public.projects
language plpgsql security definer set search_path = public as $$
declare v_row public.projects;
begin
  select * into v_row from public.projects where id = p_project_id;
  if not found then raise exception 'project not found'; end if;
  perform public.require_member(v_row.company_id);

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

-- --- tests -------------------------------------------------------------
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
  v_profile public.test_profiles;
  v_test public.pressure_tests;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'project not found'; end if;
  perform public.require_member(v_project.company_id);

  if coalesce(trim(p_area), '') = '' then raise exception 'area required'; end if;

  select * into v_profile from public.test_profiles
   where id = v_project.test_profile_id;
  if not found then
    select * into v_profile from public.test_profiles
     where company_id = v_project.company_id and is_company_default limit 1;
  end if;
  if not found then raise exception 'no test profile for company'; end if;

  insert into public.pressure_tests (
    company_id, project_id, floor, system, system_other, area,
    initial_pressure_bar, initial_duration_min,
    strength_pressure_bar, strength_duration_min,
    pressure_pressure_bar, pressure_duration_min,
    created_by
  ) values (
    v_project.company_id, p_project_id, coalesce(nullif(trim(p_floor), ''), '0'),
    p_system, nullif(trim(p_system_other), ''), trim(p_area),
    v_profile.initial_pressure_bar, v_profile.initial_duration_min,
    v_profile.strength_pressure_bar, v_profile.strength_duration_min,
    v_profile.pressure_pressure_bar, v_profile.pressure_duration_min,
    auth.uid()
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

create or replace function public.update_test_settings(
  p_test_id uuid,
  p_initial_pressure_bar numeric, p_initial_duration_min integer,
  p_strength_pressure_bar numeric, p_strength_duration_min integer,
  p_pressure_pressure_bar numeric, p_pressure_duration_min integer
) returns public.pressure_tests
language plpgsql security definer set search_path = public as $$
declare v_test public.pressure_tests;
begin
  select * into v_test from public.pressure_tests where id = p_test_id;
  if not found then raise exception 'test not found'; end if;
  perform public.require_member(v_test.company_id);
  if v_test.locked then raise exception 'test is locked'; end if;

  update public.pressure_tests set
    initial_pressure_bar = p_initial_pressure_bar,
    initial_duration_min = p_initial_duration_min,
    strength_pressure_bar = p_strength_pressure_bar,
    strength_duration_min = p_strength_duration_min,
    pressure_pressure_bar = p_pressure_pressure_bar,
    pressure_duration_min = p_pressure_duration_min
  where id = p_test_id
  returning * into v_test;

  perform public._audit(v_test.company_id, 'test_settings_updated', v_test.project_id, v_test.id);
  return v_test;
end $$;

-- --- stages ----------------------------------------------------------
create or replace function public.start_stage(p_stage_id uuid)
returns public.test_stages
language plpgsql security definer set search_path = public as $$
declare
  v_stage public.test_stages;
  v_test public.pressure_tests;
  v_target_p numeric;
  v_target_d integer;
begin
  select * into v_stage from public.test_stages where id = p_stage_id for update;
  if not found then raise exception 'stage not found'; end if;
  perform public.require_member(v_stage.company_id);

  select * into v_test from public.pressure_tests where id = v_stage.test_id;
  if v_test.locked then raise exception 'test is locked'; end if;

  v_target_p := case v_stage.stage
    when 'initial' then v_test.initial_pressure_bar
    when 'strength' then v_test.strength_pressure_bar
    else v_test.pressure_pressure_bar end;
  v_target_d := case v_stage.stage
    when 'initial' then v_test.initial_duration_min
    when 'strength' then v_test.strength_duration_min
    else v_test.pressure_duration_min end;

  update public.test_stages set
    status = 'in_progress',
    started_at = coalesce(started_at, now()),
    started_by = coalesce(started_by, auth.uid()),
    target_pressure_bar = coalesce(target_pressure_bar, v_target_p),
    target_duration_min = coalesce(target_duration_min, v_target_d)
  where id = p_stage_id
  returning * into v_stage;

  update public.pressure_tests set updated_at = now() where id = v_stage.test_id;

  perform public._audit(v_stage.company_id, 'stage_started', v_test.project_id, v_test.id,
    jsonb_build_object('stage', v_stage.stage));
  return v_stage;
end $$;

create or replace function public.complete_stage(p_stage_id uuid)
returns public.test_stages
language plpgsql security definer set search_path = public as $$
declare
  v_stage public.test_stages;
  v_test public.pressure_tests;
begin
  select * into v_stage from public.test_stages where id = p_stage_id for update;
  if not found then raise exception 'stage not found'; end if;
  perform public.require_member(v_stage.company_id);

  select * into v_test from public.pressure_tests where id = v_stage.test_id;
  if v_test.locked then raise exception 'test is locked'; end if;

  update public.test_stages set
    status = 'complete',
    started_at = coalesce(started_at, now()),
    started_by = coalesce(started_by, auth.uid()),
    completed_at = now(),
    completed_by = auth.uid()
  where id = p_stage_id
  returning * into v_stage;

  update public.pressure_tests set updated_at = now() where id = v_stage.test_id;

  perform public._audit(v_stage.company_id, 'stage_completed', v_test.project_id, v_test.id,
    jsonb_build_object('stage', v_stage.stage));
  return v_stage;
end $$;

-- --- photos --------------------------------------------------------
create or replace function public.record_photo(
  p_test_id uuid, p_storage_path text, p_kind photo_kind default 'other',
  p_stage_id uuid default null, p_mime text default null, p_size_bytes integer default null
) returns public.test_photos
language plpgsql security definer set search_path = public as $$
declare
  v_test public.pressure_tests;
  v_stage public.test_stages;
  v_row public.test_photos;
begin
  select * into v_test from public.pressure_tests where id = p_test_id;
  if not found then raise exception 'test not found'; end if;
  perform public.require_member(v_test.company_id);

  if p_stage_id is not null then
    select * into v_stage from public.test_stages where id = p_stage_id;
  end if;

  insert into public.test_photos (
    company_id, project_id, test_id, stage_id, stage, kind, storage_path, mime, size_bytes, taken_by
  ) values (
    v_test.company_id, v_test.project_id, p_test_id, p_stage_id,
    v_stage.stage, p_kind, p_storage_path, p_mime, p_size_bytes, auth.uid()
  ) returning * into v_row;

  perform public._audit(v_test.company_id, 'photo_captured', v_test.project_id, p_test_id,
    jsonb_build_object('kind', p_kind, 'stage', v_stage.stage));
  return v_row;
end $$;

-- --- pass / fail --------------------------------------------------
create or replace function public.set_test_result(
  p_test_id uuid, p_result text
) returns public.pressure_tests
language plpgsql security definer set search_path = public as $$
declare v_test public.pressure_tests;
begin
  if p_result not in ('passed', 'failed') then raise exception 'invalid result'; end if;
  select * into v_test from public.pressure_tests where id = p_test_id for update;
  if not found then raise exception 'test not found'; end if;
  perform public.require_member(v_test.company_id);
  if v_test.locked then raise exception 'test is locked'; end if;

  update public.pressure_tests set
    status = p_result::test_status,
    result_at = now(),
    result_by = auth.uid(),
    locked = (p_result = 'passed')
  where id = p_test_id
  returning * into v_test;

  perform public._audit(v_test.company_id, 'test_' || p_result, v_test.project_id, v_test.id);
  return v_test;
end $$;

create or replace function public.void_test(
  p_test_id uuid, p_reason text default null
) returns public.pressure_tests
language plpgsql security definer set search_path = public as $$
declare v_test public.pressure_tests;
begin
  select * into v_test from public.pressure_tests where id = p_test_id for update;
  if not found then raise exception 'test not found'; end if;
  perform public.require_member(v_test.company_id);

  update public.pressure_tests set
    status = 'void',
    voided_at = now(),
    voided_by = auth.uid(),
    void_reason = nullif(trim(p_reason), '')
  where id = p_test_id
  returning * into v_test;

  perform public._audit(v_test.company_id, 'test_voided', v_test.project_id, v_test.id,
    jsonb_build_object('reason', p_reason));
  return v_test;
end $$;

-- --- retest -----------------------------------------------------
create or replace function public.create_retest(p_test_id uuid)
returns public.pressure_tests
language plpgsql security definer set search_path = public as $$
declare
  v_src public.pressure_tests;
  v_new public.pressure_tests;
begin
  select * into v_src from public.pressure_tests where id = p_test_id;
  if not found then raise exception 'test not found'; end if;
  perform public.require_member(v_src.company_id);

  insert into public.pressure_tests (
    company_id, project_id, floor, system, system_other, area, retest_of,
    initial_pressure_bar, initial_duration_min,
    strength_pressure_bar, strength_duration_min,
    pressure_pressure_bar, pressure_duration_min,
    created_by
  ) values (
    v_src.company_id, v_src.project_id, v_src.floor, v_src.system, v_src.system_other,
    v_src.area, v_src.id,
    v_src.initial_pressure_bar, v_src.initial_duration_min,
    v_src.strength_pressure_bar, v_src.strength_duration_min,
    v_src.pressure_pressure_bar, v_src.pressure_duration_min,
    auth.uid()
  ) returning * into v_new;

  insert into public.test_stages (company_id, test_id, stage)
  values (v_new.company_id, v_new.id, 'initial'),
         (v_new.company_id, v_new.id, 'strength'),
         (v_new.company_id, v_new.id, 'pressure');

  perform public._audit(v_new.company_id, 'retest_created', v_new.project_id, v_new.id,
    jsonb_build_object('retest_of', v_src.id, 'retest_of_ref', v_src.ref));
  return v_new;
end $$;

-- ============================================================================
-- project_overview view — per-project test counts for the home screen
-- security_invoker => underlying RLS applies to the caller
-- ============================================================================
create or replace view public.project_overview
with (security_invoker = true) as
  select
    p.*,
    coalesce(c.total, 0)       as tests_total,
    coalesce(c.in_progress, 0) as tests_in_progress,
    coalesce(c.passed, 0)      as tests_passed,
    coalesce(c.failed, 0)      as tests_failed,
    coalesce(c.void, 0)        as tests_void
  from public.projects p
  left join lateral (
    select
      count(*)                                          as total,
      count(*) filter (where t.status = 'in_progress')  as in_progress,
      count(*) filter (where t.status = 'passed')       as passed,
      count(*) filter (where t.status = 'failed')       as failed,
      count(*) filter (where t.status = 'void')         as void
    from public.pressure_tests t
    where t.project_id = p.id
  ) c on true;

-- ============================================================================
-- Demo data — populates the CALLER's first company. Handy for a walkthrough.
--   select public.seed_demo_data();
-- ============================================================================
create or replace function public.seed_demo_data()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_proj uuid;
  v_test uuid;
  v_stage uuid;
begin
  select company_id into v_company from public.company_members
   where user_id = auth.uid() order by created_at limit 1;
  if v_company is null then raise exception 'join or create a company first'; end if;

  -- Lisbon House ----------------------------------------------------------
  v_proj := (public.create_project(v_company, 'Lisbon House')).id;
  update public.projects set client_name = 'Grosvenor Estates',
    project_number = '24-118', site_address = '12 Lisbon Street, London W1'
    where id = v_proj;

  -- a passed test
  v_test := (public.create_test(v_proj, '1', 'cold', 'Male WCs')).id;
  select id into v_stage from public.test_stages where test_id = v_test and stage = 'pressure';
  perform public.start_stage(v_stage);
  perform public.complete_stage(v_stage);
  perform public.set_test_result(v_test, 'passed');

  -- an in-progress test
  v_test := (public.create_test(v_proj, '1', 'cold', 'Female WCs')).id;
  select id into v_stage from public.test_stages where test_id = v_test and stage = 'pressure';
  perform public.start_stage(v_stage);

  -- a failed test
  v_test := (public.create_test(v_proj, '2', 'hot', 'Plant Room')).id;
  select id into v_stage from public.test_stages where test_id = v_test and stage = 'strength';
  perform public.start_stage(v_stage);
  perform public.complete_stage(v_stage);
  perform public.set_test_result(v_test, 'failed');

  -- Portman House -------------------------------------------------------
  v_proj := (public.create_project(v_company, 'Portman House')).id;
  v_test := (public.create_test(v_proj, '0', 'boosted', 'Riser 3')).id;
  select id into v_stage from public.test_stages where test_id = v_test and stage = 'pressure';
  perform public.start_stage(v_stage);

  -- Anglia Way ---------------------------------------------------------
  v_proj := (public.create_project(v_company, 'Anglia Way')).id;

  perform public._audit(v_company, 'demo_data_seeded');
end $$;

-- ============================================================================
-- Permissions
-- ============================================================================
grant usage on schema public to authenticated;
grant select on public.project_overview to authenticated;

grant execute on function
  public.bootstrap_company(text, text),
  public.create_invite(uuid, text, member_role),
  public.accept_invite(text, text),
  public.create_project(uuid, text),
  public.set_project_status(uuid, project_status),
  public.create_test(uuid, text, system_kind, text, text),
  public.update_test_settings(uuid, numeric, integer, numeric, integer, numeric, integer),
  public.start_stage(uuid),
  public.complete_stage(uuid),
  public.record_photo(uuid, text, photo_kind, uuid, text, integer),
  public.set_test_result(uuid, text),
  public.void_test(uuid, text),
  public.create_retest(uuid),
  public.seed_demo_data()
to authenticated;
