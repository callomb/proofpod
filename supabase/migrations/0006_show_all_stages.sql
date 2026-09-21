-- ============================================================================
-- ProofPod — hide Initial/Strength by default (opt-in per test or company)
-- Run after 0001-0005.
-- ============================================================================

alter table public.test_profiles
  add column if not exists show_all_stages boolean not null default false;

alter table public.pressure_tests
  add column if not exists show_all_stages boolean not null default false;

-- create_test: copy the company default onto the new test ---------------------
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
    pressure_pressure_bar, pressure_duration_min,
    show_all_stages, created_by
  ) values (
    v_project.company_id, p_project_id, coalesce(nullif(trim(p_floor), ''), '0'),
    p_system, nullif(trim(p_system_other), ''), trim(p_area),
    ip, idm, sp, sdm, pp, pdm,
    v_def.show_all_stages, auth.uid()
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

-- create_retest: keep the source test's visibility choice ---------------------
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
    show_all_stages, created_by
  ) values (
    v_src.company_id, v_src.project_id, v_src.floor, v_src.system, v_src.system_other,
    v_src.area, v_src.id,
    v_src.initial_pressure_bar, v_src.initial_duration_min,
    v_src.strength_pressure_bar, v_src.strength_duration_min,
    v_src.pressure_pressure_bar, v_src.pressure_duration_min,
    v_src.show_all_stages, auth.uid()
  ) returning * into v_new;

  insert into public.test_stages (company_id, test_id, stage)
  values (v_new.company_id, v_new.id, 'initial'),
         (v_new.company_id, v_new.id, 'strength'),
         (v_new.company_id, v_new.id, 'pressure');

  perform public._audit(v_new.company_id, 'retest_created', v_new.project_id, v_new.id,
    jsonb_build_object('retest_of', v_src.id, 'retest_of_ref', v_src.ref));
  return v_new;
end $$;

-- Per-test toggle (test gear) --------------------------------------------------
create or replace function public.set_test_show_all_stages(
  p_test_id uuid, p_show boolean
) returns public.pressure_tests
language plpgsql security definer set search_path = public as $$
declare v_test public.pressure_tests;
begin
  select * into v_test from public.pressure_tests where id = p_test_id;
  if not found then raise exception 'test not found'; end if;
  perform public.require_member(v_test.company_id);
  if v_test.locked then raise exception 'test is locked'; end if;

  update public.pressure_tests set show_all_stages = coalesce(p_show, false)
   where id = p_test_id returning * into v_test;
  return v_test;
end $$;

grant execute on function
  public.set_test_show_all_stages(uuid, boolean)
to authenticated;
