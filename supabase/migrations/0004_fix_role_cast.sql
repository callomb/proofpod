-- ============================================================================
-- ProofPod — fix: CASE expressions returning text must be cast to member_role
-- Run after 0003.
-- ============================================================================

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
    (case when p_role = 'admin' then 'admin' else 'member' end)::member_role,
    auth.uid()
  )
  returning * into v_row;
  perform public._audit(p_company_id, 'invite_created', null, null,
    jsonb_build_object('role', v_row.role));
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
     set role = (case when p_role = 'admin' then 'admin' else 'member' end)::member_role
   where company_id = p_company_id and user_id = p_user_id
  returning * into v_row;
  perform public._audit(p_company_id, 'member_role_changed', null, null,
    jsonb_build_object('user_id', p_user_id, 'role', v_row.role));
  return v_row;
end $$;

grant execute on function
  public.create_invite(uuid, text, text, member_role),
  public.set_member_role(uuid, uuid, member_role)
to authenticated;
