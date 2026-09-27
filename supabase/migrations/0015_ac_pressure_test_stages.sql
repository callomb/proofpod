-- ============================================================================
-- ProofPod — AC Commissioning: 6-stage refrigerant pipe leak test procedure
--
-- Replaces the single start/end reading with a proper 6-stage checklist,
-- mirroring test_stages for plumbing: each stage has a pre-set target
-- pressure/duration (the engineer doesn't type a reading, just starts/
-- completes each stage), no enforced order between stages ("record what
-- happened, never judge methodology" — same rule as everywhere else in the
-- product). Only stages 4 and 5 require a photo to start/complete; 1, 2, 3
-- and 6 are a plain button, same split as plumbing's single photo-gated
-- stage. Old attempt-level start_pressure_bar/end_pressure_bar/
-- test_duration_min columns are left in place (unused going forward) rather
-- than dropped, to avoid a destructive change for no benefit.
--
-- Run after 0001-0014.
-- ============================================================================

do $$ begin
  create type ac_pressure_stage_status as enum ('not_started', 'in_progress', 'complete');
exception when duplicate_object then null; end $$;

create table if not exists public.ac_pressure_test_stages (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies (id) on delete cascade,
  ac_pressure_test_id  uuid not null references public.ac_pressure_tests (id) on delete cascade,
  stage_no             integer not null check (stage_no between 1 and 6),
  target_pressure_bar  numeric(6,2) not null,
  target_duration_min  integer, -- null for stage 6: "until system is evacuated"
  requires_photo       boolean not null default false,
  status               ac_pressure_stage_status not null default 'not_started',
  started_at           timestamptz,
  started_by           uuid references auth.users (id) on delete set null,
  completed_at         timestamptz,
  completed_by         uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (ac_pressure_test_id, stage_no)
);
create index if not exists ac_pressure_test_stages_test_idx
  on public.ac_pressure_test_stages (ac_pressure_test_id);
create trigger ac_pressure_test_stages_touch before update on public.ac_pressure_test_stages
  for each row execute function public.touch_updated_at();

alter table public.ac_pressure_test_stages enable row level security;
create policy ac_pressure_test_stages_select on public.ac_pressure_test_stages
  for select using (company_id in (select public.user_company_ids()));

-- Tag which of the 6 stages a photo belongs to (in addition to the existing
-- ac_pressure_test_id link).
alter table public.ac_photos
  add column if not exists stage_no integer;

-- ============================================================================
-- create_ac_pressure_test_attempt: also creates the 6 stage rows. Stage 4's
-- target caps at 38 bar for Daikin systems (39 bar otherwise) per the
-- current procedure sheet; standalone tests (no system, no known
-- manufacturer) use the general 39 bar figure. Stage 4/5 durations are the
-- Split-system figures — the only system type this build supports; once
-- Twin/Triple/Quad/VRF are real workflows, this can branch on system_type.
-- ============================================================================
create or replace function public.create_ac_pressure_test_attempt(
  p_ac_system_id uuid default null,
  p_project_id uuid default null,
  p_reference text default null,
  p_retest_of uuid default null
) returns public.ac_pressure_tests
language plpgsql security definer set search_path = public as $$
declare
  v_system public.ac_systems;
  v_project public.projects;
  v_retested public.ac_pressure_tests;
  v_company_id uuid;
  v_project_id uuid;
  v_next_no integer := 1;
  v_lineage_id uuid;
  v_reference text;
  v_row public.ac_pressure_tests;
  v_stage4_pressure numeric := 39.0;
begin
  if p_ac_system_id is not null then
    select * into v_system from public.ac_systems where id = p_ac_system_id for update;
    if not found then raise exception 'system not found'; end if;
    if v_system.locked then raise exception 'system is locked'; end if;
    v_company_id := v_system.company_id;
    v_project_id := v_system.project_id;
    if v_system.manufacturer = 'Daikin' then v_stage4_pressure := 38.0; end if;
  elsif p_project_id is not null then
    select * into v_project from public.projects where id = p_project_id;
    if not found then raise exception 'project not found'; end if;
    v_company_id := v_project.company_id;
    v_project_id := p_project_id;
  else
    raise exception 'either a system or a project is required';
  end if;

  perform public.require_member(v_company_id);
  if not public.company_has_module(v_company_id, 'ac_commissioning') then
    raise exception 'AC Commissioning is not enabled for this company';
  end if;

  if p_retest_of is not null then
    select * into v_retested from public.ac_pressure_tests where id = p_retest_of;
    if not found then raise exception 'attempt to retest not found'; end if;
    v_next_no := v_retested.attempt_no + 1;
    v_lineage_id := v_retested.lineage_id;
    v_reference := coalesce(nullif(trim(p_reference), ''), v_retested.reference);
  else
    v_lineage_id := gen_random_uuid();
    v_reference := nullif(trim(p_reference), '');
    if p_ac_system_id is null and v_reference is null then
      raise exception 'reference required';
    end if;
  end if;

  insert into public.ac_pressure_tests (
    company_id, ac_system_id, project_id, reference, attempt_no, retest_of, lineage_id, created_by
  ) values (
    v_company_id, p_ac_system_id, v_project_id, v_reference,
    v_next_no, p_retest_of, v_lineage_id, auth.uid()
  ) returning * into v_row;

  insert into public.ac_pressure_test_stages
    (company_id, ac_pressure_test_id, stage_no, target_pressure_bar, target_duration_min, requires_photo)
  values
    (v_company_id, v_row.id, 1, 3.0,  3,   false),
    (v_company_id, v_row.id, 2, 15.0, 3,   false),
    (v_company_id, v_row.id, 3, 32.0, 3,   false),
    (v_company_id, v_row.id, 4, v_stage4_pressure, 15,  true),
    (v_company_id, v_row.id, 5, 33.0, 120, true),
    (v_company_id, v_row.id, 6, 15.0, null, false);

  perform public._ac_audit(v_company_id, 'pressure_test_attempt_created', v_project_id, p_ac_system_id,
    jsonb_build_object('ref', v_row.ref, 'attempt_no', v_row.attempt_no, 'retest_of', p_retest_of));
  return v_row;
end $$;

-- ============================================================================
-- Stage start/complete — mirrors start_stage/complete_stage for plumbing.
-- No enforced order between stages, no auto pass/fail — same rule as
-- everywhere else. Photo-gated stages (4, 5) still just record a
-- timestamp here; the client uploads the photo and calls record_ac_photo
-- with this stage's stage_no BEFORE calling this.
-- ============================================================================
create or replace function public.start_ac_pressure_test_stage(p_stage_id uuid)
returns public.ac_pressure_test_stages
language plpgsql security definer set search_path = public as $$
declare
  v_stage public.ac_pressure_test_stages;
  v_test public.ac_pressure_tests;
begin
  select * into v_stage from public.ac_pressure_test_stages where id = p_stage_id for update;
  if not found then raise exception 'stage not found'; end if;
  perform public.require_member(v_stage.company_id);

  select * into v_test from public.ac_pressure_tests where id = v_stage.ac_pressure_test_id;
  if v_test.locked then raise exception 'attempt is locked'; end if;

  update public.ac_pressure_test_stages set
    status = 'in_progress',
    started_at = coalesce(started_at, now()),
    started_by = coalesce(started_by, auth.uid())
  where id = p_stage_id
  returning * into v_stage;

  perform public._ac_audit(v_stage.company_id, 'pressure_test_stage_started', v_test.project_id, v_test.ac_system_id,
    jsonb_build_object('ref', v_test.ref, 'stage_no', v_stage.stage_no));
  return v_stage;
end $$;

create or replace function public.complete_ac_pressure_test_stage(p_stage_id uuid)
returns public.ac_pressure_test_stages
language plpgsql security definer set search_path = public as $$
declare
  v_stage public.ac_pressure_test_stages;
  v_test public.ac_pressure_tests;
begin
  select * into v_stage from public.ac_pressure_test_stages where id = p_stage_id for update;
  if not found then raise exception 'stage not found'; end if;
  perform public.require_member(v_stage.company_id);

  select * into v_test from public.ac_pressure_tests where id = v_stage.ac_pressure_test_id;
  if v_test.locked then raise exception 'attempt is locked'; end if;

  update public.ac_pressure_test_stages set
    status = 'complete',
    started_at = coalesce(started_at, now()),
    started_by = coalesce(started_by, auth.uid()),
    completed_at = now(),
    completed_by = auth.uid()
  where id = p_stage_id
  returning * into v_stage;

  perform public._ac_audit(v_stage.company_id, 'pressure_test_stage_completed', v_test.project_id, v_test.ac_system_id,
    jsonb_build_object('ref', v_test.ref, 'stage_no', v_stage.stage_no));
  return v_stage;
end $$;

-- record_ac_photo: superseded again to also tag a stage_no.
drop function if exists public.record_ac_photo(ac_photo_subject, text, uuid, uuid, uuid, uuid, text, integer);

create or replace function public.record_ac_photo(
  p_subject ac_photo_subject, p_storage_path text,
  p_ac_system_id uuid default null,
  p_project_id uuid default null,
  p_ac_unit_id uuid default null,
  p_ac_pressure_test_id uuid default null,
  p_stage_no integer default null,
  p_mime text default null, p_size_bytes integer default null
) returns public.ac_photos
language plpgsql security definer set search_path = public as $$
declare
  v_company_id uuid;
  v_project_id uuid;
  v_row public.ac_photos;
begin
  if p_ac_system_id is not null then
    select company_id, project_id into v_company_id, v_project_id
      from public.ac_systems where id = p_ac_system_id;
  elsif p_ac_pressure_test_id is not null then
    select company_id, project_id into v_company_id, v_project_id
      from public.ac_pressure_tests where id = p_ac_pressure_test_id;
  elsif p_project_id is not null then
    select company_id into v_company_id from public.projects where id = p_project_id;
    v_project_id := p_project_id;
  end if;

  if v_company_id is null then raise exception 'a system, pressure test, or project is required'; end if;
  perform public.require_member(v_company_id);

  insert into public.ac_photos (
    company_id, project_id, ac_system_id, ac_unit_id, ac_pressure_test_id, stage_no,
    subject, storage_path, mime, size_bytes, taken_by
  ) values (
    v_company_id, v_project_id, p_ac_system_id, p_ac_unit_id, p_ac_pressure_test_id, p_stage_no,
    p_subject, p_storage_path, p_mime, p_size_bytes, auth.uid()
  ) returning * into v_row;

  perform public._ac_audit(v_company_id, 'photo_captured', v_project_id, p_ac_system_id,
    jsonb_build_object('subject', p_subject, 'stage_no', p_stage_no));
  return v_row;
end $$;

grant execute on function
  public.start_ac_pressure_test_stage(uuid),
  public.complete_ac_pressure_test_stage(uuid),
  public.record_ac_photo(ac_photo_subject, text, uuid, uuid, uuid, uuid, integer, text, integer)
to authenticated;
