-- ============================================================================
-- ProofPod — AC Commissioning: systems, units, evidence photos, audit trail
-- Fully independent of pressure_tests/test_stages/test_photos/audit_events —
-- own tables throughout, reusing only companies/projects/auth, the
-- user_company_ids()/is_admin()/require_member()/require_admin() RLS helpers,
-- and the existing private `evidence` storage bucket (its policy already
-- keys off the company-id path segment generically, so no bucket-policy
-- change is needed).
-- Run after 0001-0007.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type ac_system_type as enum
    ('split', 'twin_split', 'triple_split', 'quad_split', 'vrf', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ac_system_status as enum ('in_progress', 'complete', 'void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ac_unit_role as enum ('outdoor', 'indoor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ac_photo_subject as enum
    ('pressure_start', 'pressure_end', 'evacuation_final',
     'outdoor_data_plate', 'indoor_data_plate');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- ac_systems  (one row per system on a project; a project can hold many)
-- ----------------------------------------------------------------------------
create sequence if not exists public.ac_system_ref_seq start 1001;

create table if not exists public.ac_systems (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies (id) on delete cascade,
  project_id         uuid not null references public.projects (id) on delete cascade,
  ref                text not null unique
                       default ('AC-' || lpad(nextval('public.ac_system_ref_seq')::text, 6, '0')),

  system_type        ac_system_type not null default 'split',
  system_ref         text not null,
  area_served        text not null,
  outdoor_location   text not null,

  manufacturer       text not null,
  manufacturer_other text,
  refrigerant_code   text not null,
  refrigerant_other  text,
  gwp                numeric(8,2) not null,

  status             ac_system_status not null default 'in_progress',
  locked             boolean not null default false,
  completed_at       timestamptz,
  completed_by       uuid references auth.users (id) on delete set null,
  voided_at          timestamptz,
  voided_by          uuid references auth.users (id) on delete set null,
  void_reason        text,

  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users (id) on delete set null,
  updated_at         timestamptz not null default now()
);
create index if not exists ac_systems_project_idx on public.ac_systems (project_id);
create index if not exists ac_systems_company_idx on public.ac_systems (company_id);
create trigger ac_systems_touch before update on public.ac_systems
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- ac_units  (outdoor + indoor equipment per system; unit_index leaves room
-- for twin/triple/quad's multiple indoor units later without restructuring)
-- ----------------------------------------------------------------------------
create table if not exists public.ac_units (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies (id) on delete cascade,
  ac_system_id   uuid not null references public.ac_systems (id) on delete cascade,
  unit_role      ac_unit_role not null,
  unit_index     integer not null default 1,

  reference      text,
  location       text,
  asset_number   text,
  model_number   text,
  serial_number  text,
  ocr_extracted  jsonb,
  confirmed_at   timestamptz,
  confirmed_by   uuid references auth.users (id) on delete set null,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (ac_system_id, unit_role, unit_index)
);
create index if not exists ac_units_system_idx on public.ac_units (ac_system_id);
create trigger ac_units_touch before update on public.ac_units
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- ac_photos  (all AC evidence photos — pressure start/end, evacuation final,
-- data plates — stored in the existing private `evidence` bucket)
-- ----------------------------------------------------------------------------
create table if not exists public.ac_photos (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies (id) on delete cascade,
  project_id         uuid not null references public.projects (id) on delete cascade,
  ac_system_id       uuid not null references public.ac_systems (id) on delete cascade,
  ac_unit_id         uuid references public.ac_units (id) on delete set null,
  ac_pressure_test_id uuid, -- FK added in 0009 once ac_pressure_tests exists
  subject            ac_photo_subject not null,
  storage_path       text not null,
  mime               text,
  size_bytes         integer,
  taken_at           timestamptz not null default now(),
  taken_by           uuid not null references auth.users (id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists ac_photos_system_idx on public.ac_photos (ac_system_id);

-- ----------------------------------------------------------------------------
-- ac_audit_events  (own provenance trail — audit_events.test_id is a hard FK
-- to pressure_tests, so AC gets its own table rather than touching it)
-- ----------------------------------------------------------------------------
create table if not exists public.ac_audit_events (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  actor_id     uuid references auth.users (id) on delete set null,
  project_id   uuid references public.projects (id) on delete set null,
  ac_system_id uuid references public.ac_systems (id) on delete set null,
  event_type   text not null,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists ac_audit_events_company_idx
  on public.ac_audit_events (company_id, created_at desc);
create index if not exists ac_audit_events_system_idx on public.ac_audit_events (ac_system_id);

create or replace function public._ac_audit(
  p_company_id uuid, p_event text, p_project uuid default null,
  p_system uuid default null, p_data jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public as $$
  insert into public.ac_audit_events (company_id, actor_id, project_id, ac_system_id, event_type, data)
  values (p_company_id, auth.uid(), p_project, p_system, p_event, p_data);
$$;

-- ============================================================================
-- Row Level Security — select only; all writes go through the RPCs below.
-- ============================================================================
alter table public.ac_systems      enable row level security;
alter table public.ac_units        enable row level security;
alter table public.ac_photos       enable row level security;
alter table public.ac_audit_events enable row level security;

create policy ac_systems_select on public.ac_systems
  for select using (company_id in (select public.user_company_ids()));
create policy ac_units_select on public.ac_units
  for select using (company_id in (select public.user_company_ids()));
create policy ac_photos_select on public.ac_photos
  for select using (company_id in (select public.user_company_ids()));
create policy ac_audit_select on public.ac_audit_events
  for select using (company_id in (select public.user_company_ids()));

-- ============================================================================
-- RPCs
-- ============================================================================

-- --- create a system + its outdoor/indoor unit stubs -----------------------
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

  perform public._ac_audit(v_system.company_id, 'system_created', p_project_id, v_system.id,
    jsonb_build_object('ref', v_system.ref, 'system_ref', v_system.system_ref,
                       'system_type', v_system.system_type));
  return v_system;
end $$;

-- --- update outdoor/indoor unit identification ------------------------------
create or replace function public.update_ac_unit(
  p_unit_id uuid,
  p_reference text default null,
  p_location text default null,
  p_asset_number text default null,
  p_model_number text default null,
  p_serial_number text default null
) returns public.ac_units
language plpgsql security definer set search_path = public as $$
declare
  v_unit public.ac_units;
  v_system public.ac_systems;
  v_identified boolean;
begin
  select * into v_unit from public.ac_units where id = p_unit_id for update;
  if not found then raise exception 'unit not found'; end if;
  perform public.require_member(v_unit.company_id);

  select * into v_system from public.ac_systems where id = v_unit.ac_system_id;
  if v_system.locked then raise exception 'system is locked'; end if;

  v_identified := p_model_number is not null or p_serial_number is not null;

  update public.ac_units set
    reference     = coalesce(nullif(trim(p_reference), ''), reference),
    location      = coalesce(nullif(trim(p_location), ''), location),
    asset_number  = coalesce(nullif(trim(p_asset_number), ''), asset_number),
    model_number  = coalesce(nullif(trim(p_model_number), ''), model_number),
    serial_number = coalesce(nullif(trim(p_serial_number), ''), serial_number),
    confirmed_at  = case when v_identified then now() else confirmed_at end,
    confirmed_by  = case when v_identified then auth.uid() else confirmed_by end
  where id = p_unit_id
  returning * into v_unit;

  if v_identified then
    perform public._ac_audit(v_unit.company_id, 'unit_identified', v_system.project_id, v_system.id,
      jsonb_build_object('unit_role', v_unit.unit_role, 'unit_index', v_unit.unit_index));
  end if;

  return v_unit;
end $$;

-- --- record the OCR suggestion (never authoritative on its own) ------------
create or replace function public.save_ac_unit_ocr(
  p_unit_id uuid, p_ocr jsonb
) returns public.ac_units
language plpgsql security definer set search_path = public as $$
declare v_unit public.ac_units;
begin
  select * into v_unit from public.ac_units where id = p_unit_id;
  if not found then raise exception 'unit not found'; end if;
  perform public.require_member(v_unit.company_id);

  update public.ac_units set ocr_extracted = p_ocr
   where id = p_unit_id returning * into v_unit;
  return v_unit;
end $$;

-- --- evidence photos ---------------------------------------------------
create or replace function public.record_ac_photo(
  p_ac_system_id uuid, p_subject ac_photo_subject, p_storage_path text,
  p_ac_unit_id uuid default null, p_mime text default null, p_size_bytes integer default null
) returns public.ac_photos
language plpgsql security definer set search_path = public as $$
declare
  v_system public.ac_systems;
  v_row public.ac_photos;
begin
  select * into v_system from public.ac_systems where id = p_ac_system_id;
  if not found then raise exception 'system not found'; end if;
  perform public.require_member(v_system.company_id);

  insert into public.ac_photos (
    company_id, project_id, ac_system_id, ac_unit_id, subject, storage_path, mime, size_bytes, taken_by
  ) values (
    v_system.company_id, v_system.project_id, p_ac_system_id, p_ac_unit_id,
    p_subject, p_storage_path, p_mime, p_size_bytes, auth.uid()
  ) returning * into v_row;

  perform public._ac_audit(v_system.company_id, 'photo_captured', v_system.project_id, p_ac_system_id,
    jsonb_build_object('subject', p_subject));
  return v_row;
end $$;

-- --- void ----------------------------------------------------------------
create or replace function public.void_ac_system(
  p_ac_system_id uuid, p_reason text default null
) returns public.ac_systems
language plpgsql security definer set search_path = public as $$
declare v_system public.ac_systems;
begin
  select * into v_system from public.ac_systems where id = p_ac_system_id for update;
  if not found then raise exception 'system not found'; end if;
  perform public.require_member(v_system.company_id);

  update public.ac_systems set
    status = 'void', voided_at = now(), voided_by = auth.uid(),
    void_reason = nullif(trim(p_reason), '')
  where id = p_ac_system_id
  returning * into v_system;

  perform public._ac_audit(v_system.company_id, 'system_voided', v_system.project_id, v_system.id,
    jsonb_build_object('reason', p_reason));
  return v_system;
end $$;

-- ============================================================================
-- Permissions
-- ============================================================================
grant execute on function
  public.create_ac_system(uuid, text, text, text, text, text, numeric, text, text, ac_system_type),
  public.update_ac_unit(uuid, text, text, text, text, text),
  public.save_ac_unit_ocr(uuid, jsonb),
  public.record_ac_photo(uuid, ac_photo_subject, text, uuid, text, integer),
  public.void_ac_system(uuid, text)
to authenticated;
