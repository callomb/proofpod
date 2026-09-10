-- ============================================================================
-- ProofPod — storage buckets & policies
-- Run after 0001_initial_schema.sql
-- ============================================================================

-- Private bucket for evidence photographs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 26214400,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public bucket for company logos (keeps certificate rendering simple later).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
  set public = excluded.public;

-- ----------------------------------------------------------------------------
-- Path convention (evidence):
--   <company_id>/<project_id>/<test_id>/<filename>
-- The first path segment is the company id — gate on membership of that company.
-- ----------------------------------------------------------------------------

drop policy if exists "evidence read" on storage.objects;
create policy "evidence read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "evidence insert" on storage.objects;
create policy "evidence insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

-- No update / delete policy for evidence: photos are immutable.

-- ----------------------------------------------------------------------------
-- branding: <company_id>/<filename>
-- ----------------------------------------------------------------------------

drop policy if exists "branding read" on storage.objects;
create policy "branding read" on storage.objects
  for select using (bucket_id = 'branding');

drop policy if exists "branding write" on storage.objects;
create policy "branding write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'branding'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "branding update" on storage.objects;
create policy "branding update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'branding'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );
