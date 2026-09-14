-- ============================================================================
-- ProofPod — platform admin tier + username-based accounts
-- Run after 0001-0004.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Usernames: an alternative to email for signing in. Stored lowercase.
-- Accounts created by a company admin (staff) or the platform admin
-- (a new company's admin) get a username instead of a real email; the app
-- signs them in with a synthetic address derived from it.
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists username text;

create unique index if not exists profiles_username_key
  on public.profiles (username)
  where username is not null;

alter table public.profiles
  drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9](?:[a-z0-9._-]{1,30})[a-z0-9]$');

-- ----------------------------------------------------------------------------
-- Platform admins: a small allow-list of accounts that can see/manage every
-- company. Deliberately NOT reachable through company RLS — the app checks
-- this table with the caller's own session (self-row only) and then uses the
-- service-role client for the actual cross-company reads/writes.
-- ----------------------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

drop policy if exists platform_admins_select_self on public.platform_admins;
create policy platform_admins_select_self on public.platform_admins
  for select using (user_id = auth.uid());

-- No insert/update/delete policy: platform admins are granted only via a
-- one-off service-role script, never self-service through the app.
