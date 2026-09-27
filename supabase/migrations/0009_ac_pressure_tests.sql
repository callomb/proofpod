-- ============================================================================
-- ProofPod — AC Commissioning: pressure test attempts
-- Independent of pressure_tests. A "repair & retest" creates a new attempt
-- row rather than overwriting the failed one — nothing is ever deleted.
-- Run after 0001-0008.
-- ============================================================================

do $$ begin
  create type ac_pressure_test_status as enum ('in_progress', 'passed', 'failed');
exception when duplicate_object then null; end $$;

create table if not exists public.ac_pressure_tests (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete cascade,
  ac_system_id        uuid not null references public.ac_systems (id) on delete cascade,
  attempt_no          integer not null,
  retest_of           uuid references public.ac_pressure_tests (id) on delete set null,

  status              ac_pressure_test_status not null default 'in_progress',
  locked              boolean not null default false,

  start_pressure_bar  numeric(6,2),
  test_duration_min   integer,
  end_pressure_bar    numeric(6,2),
  notes               text,

  started_at          timestamptz,
  started_by          uuid references auth.users (id) on delete set null,
  completed_at        timestamptz,
  completed_by        uuid references auth.users (id) on delete set null,
  result_at           timestamptz,
  result_by           uuid references auth.users (id) on delete set null,

  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id) on delete set null,
  updated_at          timestamptz not null default now(),
  unique (ac_system_id, attempt_no)
);
create index if not exists ac_pressure_tests_system_idx on public.ac_pressure_tests (ac_system_id);
create trigger ac_pressure_tests_touch before update on public.ac_pressure_tests
  for each row execute function public.touch_updated_at();

alter table public.ac_pressure_tests enable row level security;
create policy ac_pressure_tests_select on public.ac_pressure_tests
  for select using (company_id in (select public.user_company_ids()));

-- Now that ac_pressure_tests exists, wire up the FK left pending in 0008.
alter table public.ac_photos
  add constraint ac_photos_pressure_test_fkey
  foreign key (ac_pressure_test_id) references public.ac_pressure_tests (id) on delete set null;

-- record_ac_photo: superseded to also accept a pressure-test attempt link.
drop function if exists public.record_ac_photo(uuid, ac_photo_subject, text, uuid, text, integer);

create or replace function public.record_ac_photo(
  p_ac_system_id uuid, p_subject ac_photo_subject, p_storage_path text,
  p_ac_unit_id uuid default null, p_ac_pressure_test_id uuid default null,
  p_mime text default null, p_size_bytes integer default null
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
    company_id, project_id, ac_system_id, ac_unit_id, ac_pressure_test_id,
    subject, storage_path, mime, size_bytes, taken_by
  ) values (
    v_system.company_id, v_system.project_id, p_ac_system_id, p_ac_unit_id, p_ac_pressure_test_id,
    p_subject, p_storage_path, p_mime, p_size_bytes, auth.uid()
  ) returning * into v_row;

  perform public._ac_audit(v_system.company_id, 'photo_captured', v_system.project_id, p_ac_system_id,
    jsonb_build_object('subject', p_subject));
  return v_row;
end $$;

grant execute on function
  public.record_ac_photo(uuid, ac_photo_subject, text, uuid, uuid, text, integer)
to authenticated;

-- ============================================================================
-- RPCs
-- ============================================================================

-- --- create a new attempt (row exists immediately so a photo can link to it,
-- before any reading/timestamp is recorded — mirrors the stage pattern) ------
create or replace function public.create_ac_pressure_test_attempt(
  p_ac_system_id uuid, p_retest_of uuid default null
) returns public.ac_pressure_tests
language plpgsql security definer set search_path = public as $$
declare
  v_system public.ac_systems;
  v_next_no integer;
  v_row public.ac_pressure_tests;
begin
  select * into v_system from public.ac_systems where id = p_ac_system_id for update;
  if not found then raise exception 'system not found'; end if;
  perform public.require_member(v_system.company_id);
  if v_system.locked then raise exception 'system is locked'; end if;

  select coalesce(max(attempt_no), 0) + 1 into v_next_no
   from public.ac_pressure_tests where ac_system_id = p_ac_system_id;

  insert into public.ac_pressure_tests (company_id, ac_system_id, attempt_no, retest_of, created_by)
  values (v_system.company_id, p_ac_system_id, v_next_no, p_retest_of, auth.uid())
  returning * into v_row;

  perform public._ac_audit(v_row.company_id, 'pressure_test_attempt_created', v_system.project_id, v_system.id,
    jsonb_build_object('attempt_no', v_row.attempt_no, 'retest_of', p_retest_of));
  return v_row;
end $$;

-- --- start (after the start photo has been recorded) -----------------------
create or replace function public.start_ac_pressure_test_attempt(
  p_attempt_id uuid, p_start_pressure_bar numeric, p_notes text default null
) returns public.ac_pressure_tests
language plpgsql security definer set search_path = public as $$
declare v_row public.ac_pressure_tests;
begin
  select * into v_row from public.ac_pressure_tests where id = p_attempt_id for update;
  if not found then raise exception 'attempt not found'; end if;
  perform public.require_member(v_row.company_id);
  if v_row.locked then raise exception 'attempt is locked'; end if;

  update public.ac_pressure_tests set
    start_pressure_bar = p_start_pressure_bar,
    notes = coalesce(nullif(trim(p_notes), ''), notes),
    started_at = coalesce(started_at, now()),
    started_by = coalesce(started_by, auth.uid())
  where id = p_attempt_id
  returning * into v_row;

  perform public._ac_audit(v_row.company_id, 'pressure_test_started', null, v_row.ac_system_id,
    jsonb_build_object('attempt_no', v_row.attempt_no));
  return v_row;
end $$;

-- --- complete (after the end photo has been recorded) -----------------------
create or replace function public.complete_ac_pressure_test_attempt(
  p_attempt_id uuid, p_end_pressure_bar numeric, p_test_duration_min integer, p_notes text default null
) returns public.ac_pressure_tests
language plpgsql security definer set search_path = public as $$
declare v_row public.ac_pressure_tests;
begin
  select * into v_row from public.ac_pressure_tests where id = p_attempt_id for update;
  if not found then raise exception 'attempt not found'; end if;
  perform public.require_member(v_row.company_id);
  if v_row.locked then raise exception 'attempt is locked'; end if;

  update public.ac_pressure_tests set
    end_pressure_bar = p_end_pressure_bar,
    test_duration_min = p_test_duration_min,
    notes = coalesce(nullif(trim(p_notes), ''), notes),
    completed_at = coalesce(completed_at, now()),
    completed_by = coalesce(completed_by, auth.uid())
  where id = p_attempt_id
  returning * into v_row;

  perform public._ac_audit(v_row.company_id, 'pressure_test_completed', null, v_row.ac_system_id,
    jsonb_build_object('attempt_no', v_row.attempt_no));
  return v_row;
end $$;

-- --- result ---------------------------------------------------------------
create or replace function public.set_ac_pressure_test_result(
  p_attempt_id uuid, p_result text
) returns public.ac_pressure_tests
language plpgsql security definer set search_path = public as $$
declare v_row public.ac_pressure_tests;
begin
  if p_result not in ('passed', 'failed') then raise exception 'invalid result'; end if;
  select * into v_row from public.ac_pressure_tests where id = p_attempt_id for update;
  if not found then raise exception 'attempt not found'; end if;
  perform public.require_member(v_row.company_id);
  if v_row.locked then raise exception 'attempt is locked'; end if;

  update public.ac_pressure_tests set
    status = p_result::ac_pressure_test_status,
    result_at = now(),
    result_by = auth.uid(),
    locked = (p_result = 'passed')
  where id = p_attempt_id
  returning * into v_row;

  perform public._ac_audit(v_row.company_id, 'pressure_test_' || p_result, null, v_row.ac_system_id,
    jsonb_build_object('attempt_no', v_row.attempt_no));
  return v_row;
end $$;

grant execute on function
  public.create_ac_pressure_test_attempt(uuid, uuid),
  public.start_ac_pressure_test_attempt(uuid, numeric, text),
  public.complete_ac_pressure_test_attempt(uuid, numeric, integer, text),
  public.set_ac_pressure_test_result(uuid, text)
to authenticated;
