-- ============================================================================
-- ProofPod — AC Commissioning: standalone pressure tests (no System required)
--
-- Some AC jobs are just a leak test — asking for manufacturer/refrigerant/GWP
-- up front is friction the engineer doesn't need. This lets an ac_pressure_tests
-- row attach directly to a project instead of an ac_system, reusing the exact
-- same attempt lifecycle (photo-gated start/end, repair & retest) already
-- built for System-scoped ones.
--
-- Run after 0001-0013.
-- ============================================================================

alter table public.ac_pressure_tests
  alter column ac_system_id drop not null;

alter table public.ac_pressure_tests
  add column if not exists project_id uuid references public.projects (id) on delete cascade,
  add column if not exists reference text,
  add column if not exists ref text,
  add column if not exists lineage_id uuid;

-- Backfill existing (System-scoped) rows: project_id from their system, ref
-- assigned from the same sequence, lineage_id = their own id (none had
-- retests before this migration, since retest support only just shipped).
create sequence if not exists public.ac_pressure_test_ref_seq start 1001;

update public.ac_pressure_tests t
   set project_id = s.project_id
  from public.ac_systems s
 where t.ac_system_id = s.id and t.project_id is null;

update public.ac_pressure_tests
   set ref = 'APT-' || lpad(nextval('public.ac_pressure_test_ref_seq')::text, 6, '0')
 where ref is null;

-- Recursive so any existing multi-level retest chain resolves to the same
-- root in one pass (a plain self-join only sees the pre-statement snapshot,
-- which would miscompute lineage_id for a retest-of-a-retest).
with recursive chain as (
  select id, id as lineage_id
  from public.ac_pressure_tests
  where retest_of is null
  union all
  select t.id, c.lineage_id
  from public.ac_pressure_tests t
  join chain c on t.retest_of = c.id
)
update public.ac_pressure_tests t
   set lineage_id = c.lineage_id
  from chain c
 where t.id = c.id and t.lineage_id is null;

alter table public.ac_pressure_tests
  alter column project_id set not null,
  alter column ref set not null,
  alter column ref set default ('APT-' || lpad(nextval('public.ac_pressure_test_ref_seq')::text, 6, '0')),
  alter column lineage_id set not null;

alter table public.ac_pressure_tests
  drop constraint if exists ac_pressure_tests_ac_system_id_attempt_no_key;

alter table public.ac_pressure_tests
  add constraint ac_pressure_tests_ref_key unique (ref);

-- A standalone row (no system) must carry its own identifying reference.
alter table public.ac_pressure_tests
  drop constraint if exists ac_pressure_tests_standalone_reference_check;
alter table public.ac_pressure_tests
  add constraint ac_pressure_tests_standalone_reference_check
  check (ac_system_id is not null or reference is not null);

create index if not exists ac_pressure_tests_project_idx on public.ac_pressure_tests (project_id);
create index if not exists ac_pressure_tests_lineage_idx on public.ac_pressure_tests (lineage_id);

-- ac_photos: ac_system_id is no longer the only way to anchor a photo.
alter table public.ac_photos
  alter column ac_system_id drop not null;

-- ============================================================================
-- create_ac_pressure_test_attempt: superseded — now takes EITHER an
-- ac_system_id (existing behaviour, unchanged) OR a project_id + reference
-- (new, standalone). attempt_no numbering is now derived from the retested
-- row directly rather than a per-system max() — simpler, and works the same
-- either way.
-- ============================================================================
drop function if exists public.create_ac_pressure_test_attempt(uuid, uuid);

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
begin
  if p_ac_system_id is not null then
    select * into v_system from public.ac_systems where id = p_ac_system_id for update;
    if not found then raise exception 'system not found'; end if;
    if v_system.locked then raise exception 'system is locked'; end if;
    v_company_id := v_system.company_id;
    v_project_id := v_system.project_id;
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
    -- carry the standalone reference forward so a retest is self-descriptive
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

  perform public._ac_audit(v_company_id, 'pressure_test_attempt_created', v_project_id, p_ac_system_id,
    jsonb_build_object('ref', v_row.ref, 'attempt_no', v_row.attempt_no, 'retest_of', p_retest_of));
  return v_row;
end $$;

-- ============================================================================
-- record_ac_photo: superseded — anchors to a system, a pressure test, or a
-- bare project (in that preference order), instead of requiring a system.
-- ============================================================================
drop function if exists public.record_ac_photo(uuid, ac_photo_subject, text, uuid, uuid, text, integer);

create or replace function public.record_ac_photo(
  p_subject ac_photo_subject, p_storage_path text,
  p_ac_system_id uuid default null,
  p_project_id uuid default null,
  p_ac_unit_id uuid default null,
  p_ac_pressure_test_id uuid default null,
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
    company_id, project_id, ac_system_id, ac_unit_id, ac_pressure_test_id,
    subject, storage_path, mime, size_bytes, taken_by
  ) values (
    v_company_id, v_project_id, p_ac_system_id, p_ac_unit_id, p_ac_pressure_test_id,
    p_subject, p_storage_path, p_mime, p_size_bytes, auth.uid()
  ) returning * into v_row;

  perform public._ac_audit(v_company_id, 'photo_captured', v_project_id, p_ac_system_id,
    jsonb_build_object('subject', p_subject));
  return v_row;
end $$;

grant execute on function
  public.create_ac_pressure_test_attempt(uuid, uuid, text, uuid),
  public.record_ac_photo(ac_photo_subject, text, uuid, uuid, uuid, uuid, text, integer)
to authenticated;
