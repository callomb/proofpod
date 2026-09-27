-- ============================================================================
-- ProofPod — per-company module toggle
-- Adds a second module (AC Commissioning) alongside plumbing pressure testing.
-- Plumbing stays on for every company, existing and new, by default — nothing
-- changes for a company that only ever uses plumbing. AC Commissioning starts
-- OFF everywhere and is switched on per company from /platform.
-- Run after 0001-0006.
-- ============================================================================

do $$ begin
  create type module_key as enum ('plumbing', 'ac_commissioning');
exception when duplicate_object then null; end $$;

create table if not exists public.company_modules (
  company_id  uuid not null references public.companies (id) on delete cascade,
  module      module_key not null,
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  primary key (company_id, module)
);

alter table public.company_modules enable row level security;

drop policy if exists company_modules_select on public.company_modules;
create policy company_modules_select on public.company_modules
  for select using (company_id in (select public.user_company_ids()));

-- No RLS write policy: modules are only ever toggled by the platform admin
-- portal, which uses the service-role client (bypasses RLS), exactly like
-- platform_admins.

-- ----------------------------------------------------------------------------
-- Backfill: every existing company already has plumbing; AC starts off.
-- ----------------------------------------------------------------------------
insert into public.company_modules (company_id, module, enabled)
select id, 'plumbing', true from public.companies
on conflict (company_id, module) do nothing;

insert into public.company_modules (company_id, module, enabled)
select id, 'ac_commissioning', false from public.companies
on conflict (company_id, module) do nothing;

-- ----------------------------------------------------------------------------
-- Server-side helper for RPCs to check module access (defence in depth beyond
-- hiding the button in the UI). Defaults to true for plumbing / false for
-- anything else if a row is somehow missing.
-- ----------------------------------------------------------------------------
create or replace function public.company_has_module(p_company_id uuid, p_module module_key)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select enabled from public.company_modules
      where company_id = p_company_id and module = p_module),
    p_module = 'plumbing'
  )
$$;

-- ----------------------------------------------------------------------------
-- bootstrap_company: every self-serve company gets plumbing on, AC off.
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

  insert into public.company_modules (company_id, module, enabled)
  values (v_company, 'plumbing', true), (v_company, 'ac_commissioning', false);

  perform public._audit(v_company, 'company_created', null, null,
    jsonb_build_object('name', trim(p_company_name)));
  return v_company;
end $$;
