-- ════════════════════════════════════════════════════════════════════════════
-- Guest accounts — outside people who can see only what staff share with them.
--
-- A guest is a login that is neither staff nor a Client Portal account. Today the
-- one thing a guest can do is open the Training documents (files and folders)
-- that a member of the team has shared with them, or with a guest group they
-- belong to — Read, or Read & write.
--
-- How a guest is kept away from everything else:
--
--   1. Every public table already carries the RESTRICTIVE `portal_captain_block`
--      policy (`not is_portal_captain()`), and 39 SECURITY DEFINER RPCs refuse
--      callers through `assert_not_portal_captain()`. Both helpers now also say
--      yes for an active guest, so a guest is fenced out of the whole schema
--      exactly as a captain is. The captain-scoped permissive policies that ALSO
--      use is_portal_captain() all go on to require captain_yacht_ids() /
--      captain_accounts / aal2, none of which a guest has — so nothing opens up.
--      (Measured 2026-10-14: an authenticated login that is neither staff nor a
--      captain could read 150+ tables. That is what a guest would have been.)
--   2. Storage policies treat "staff" as having a user_profiles row; a guest
--      never has one (the auth.users triggers below stand down for guests, and
--      the invite API strips any that appear), so every private bucket refuses
--      a guest.
--   3. A guest reads and writes NOTHING directly. All guest traffic goes through
--      /api/guest, which resolves the guest from the JWT, checks the request
--      against guest_shares and only then touches data with the service role.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists public.guest_accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid unique references auth.users(id) on delete set null,
  email          text not null,
  display_name   text,
  company        text,
  active         boolean not null default true,
  invited_by     uuid,
  invited_by_name text,
  invite_sent_at timestamptz,
  invite_error   text,
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists guest_accounts_email_key on public.guest_accounts (lower(email));

create table if not exists public.guest_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists guest_groups_name_key on public.guest_groups (lower(name));

create table if not exists public.guest_group_members (
  group_id  uuid not null references public.guest_groups(id) on delete cascade,
  guest_id  uuid not null references public.guest_accounts(id) on delete cascade,
  added_by  uuid,
  added_at  timestamptz not null default now(),
  primary key (group_id, guest_id)
);
create index if not exists guest_group_members_guest_idx on public.guest_group_members (guest_id);

-- One row = one item shared with one guest OR one group. A folder share covers
-- everything inside it, now and later. Revoking keeps the row (revoked_at) so the
-- history of who had access survives.
create table if not exists public.guest_shares (
  id             uuid primary key default gen_random_uuid(),
  resource_type  text not null check (resource_type in ('training_folder', 'training_document')),
  resource_id    uuid not null,
  guest_id       uuid references public.guest_accounts(id) on delete cascade,
  group_id       uuid references public.guest_groups(id) on delete cascade,
  permission     text not null default 'read' check (permission in ('read', 'read_write')),
  note           text,
  expires_at     timestamptz,
  shared_by      uuid,
  shared_by_name text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  revoked_by     uuid,
  revoked_by_name text,
  constraint guest_shares_one_target check (num_nonnulls(guest_id, group_id) = 1)
);
create index if not exists guest_shares_resource_idx on public.guest_shares (resource_type, resource_id);
create index if not exists guest_shares_guest_idx on public.guest_shares (guest_id) where revoked_at is null;
create index if not exists guest_shares_group_idx on public.guest_shares (group_id) where revoked_at is null;
-- At most one live share per item per guest / per group — sharing again updates it.
create unique index if not exists guest_shares_live_guest_key
  on public.guest_shares (resource_type, resource_id, guest_id) where revoked_at is null and guest_id is not null;
create unique index if not exists guest_shares_live_group_key
  on public.guest_shares (resource_type, resource_id, group_id) where revoked_at is null and group_id is not null;

-- What guests actually did: opened, downloaded, uploaded, renamed, removed.
create table if not exists public.guest_activity (
  id             uuid primary key default gen_random_uuid(),
  guest_id       uuid references public.guest_accounts(id) on delete set null,
  share_id       uuid references public.guest_shares(id) on delete set null,
  action         text not null,
  resource_type  text,
  resource_id    uuid,
  resource_name  text,
  detail         text,
  ip_address     text,
  created_at     timestamptz not null default now()
);
create index if not exists guest_activity_guest_idx on public.guest_activity (guest_id, created_at desc);
create index if not exists guest_activity_share_idx on public.guest_activity (share_id, created_at desc);

-- Things a guest added, so staff can see where a file came from (and so a guest
-- may only remove what a guest added).
alter table public.training_documents
  add column if not exists guest_uploaded_by uuid references public.guest_accounts(id) on delete set null;
alter table public.training_document_folders
  add column if not exists guest_created_by uuid references public.guest_accounts(id) on delete set null;

-- updated_at
drop trigger if exists guest_accounts_touch on public.guest_accounts;
create trigger guest_accounts_touch before update on public.guest_accounts
  for each row execute function public.portal_touch_updated_at();
drop trigger if exists guest_groups_touch on public.guest_groups;
create trigger guest_groups_touch before update on public.guest_groups
  for each row execute function public.portal_touch_updated_at();
drop trigger if exists guest_shares_touch on public.guest_shares;
create trigger guest_shares_touch before update on public.guest_shares
  for each row execute function public.portal_touch_updated_at();

-- ── Identity helpers ────────────────────────────────────────────────────────
create or replace function public.is_portal_guest()
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from guest_accounts where user_id = auth.uid() and active) $$;

-- Despite the name, this now means "an outside (non-staff) login": a Client
-- Portal captain OR a guest. Every portal_captain_block policy and RPC guard
-- keys off it, so widening it here fences guests out of the whole schema.
create or replace function public.is_portal_captain()
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from captain_accounts where user_id = auth.uid() and active)
       or exists (select 1 from guest_accounts   where user_id = auth.uid() and active) $$;

create or replace function public.assert_not_portal_captain()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from captain_accounts where user_id = auth.uid() and active)
     or exists (select 1 from guest_accounts where user_id = auth.uid() and active) then
    raise exception 'This action is not available to portal accounts' using errcode = '42501';
  end if;
end $$;

-- A new auth user is a staff member unless it is tagged as an outside login.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if coalesce(new.raw_user_meta_data->>'portal', '') in ('captain', 'guest') then
    return new;  -- client-portal or guest login: not a staff member
  end if;
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end; $function$;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_global_admin_role_id uuid;
  v_read_only_role_id uuid;
  v_legacy_role text;
begin
  if coalesce(new.raw_user_meta_data->>'portal', '') in ('captain', 'guest') then
    return new;  -- client-portal or guest login: not a staff member
  end if;

  select role_id into v_global_admin_role_id from public.roles where name = 'global_admin';
  select role_id into v_read_only_role_id from public.roles where name = 'read_only';
  select role into v_legacy_role from public.user_roles where user_id = new.id;

  insert into public.user_profiles (user_id, display_name, email, role_id, active, timezone)
  values (
    new.id,
    coalesce(nullif(trim(split_part(new.email, '@', 1)), ''), 'Unnamed user'),
    new.email,
    case when v_legacy_role = 'admin' then v_global_admin_role_id else v_read_only_role_id end,
    true,
    'Asia/Dubai'
  )
  on conflict (user_id) do nothing;

  return new;
end; $function$;

-- ── RLS: staff only. Guests go through /api/guest (service role). ────────────
do $$
declare t text;
begin
  foreach t in array array['guest_accounts', 'guest_groups', 'guest_group_members', 'guest_shares', 'guest_activity'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_read on public.%I', t);
    execute format($p$create policy staff_read on public.%I for select to authenticated
      using (exists (select 1 from public.user_profiles up where up.user_id = (select auth.uid())))$p$, t);
    execute format('drop policy if exists portal_captain_block on public.%I', t);
    execute format($p$create policy portal_captain_block on public.%I as restrictive for all to authenticated
      using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()))$p$, t);
  end loop;
end $$;
-- Writes go through /api/admin/guests and /api/guest-shares (service role), so
-- invites, emails and the audit trail always happen together. No write policies.

-- The staff app asks this once after sign-in to send a guest to /guest.
revoke execute on function public.is_portal_guest() from public, anon;
grant execute on function public.is_portal_guest() to authenticated;
