-- ═══════════════════════════════════════════════════════════════════════════
-- Captain's View (client portal) — schema + helpers + scoped RLS.
-- Captains (client logins) may ONLY see/create content for their own yacht,
-- and only with an MFA-verified session (JWT aal = 'aal2').
-- The companion migration (…_captain_portal_lockdown.sql) blocks captains from
-- every other table/view/RPC in the database.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists public.captain_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  yacht_id    uuid not null references public.yachts(id) on delete cascade,
  display_name text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, yacht_id)
);

create sequence if not exists public.captain_request_ref_seq;

create table if not exists public.captain_requests (
  id          uuid primary key default gen_random_uuid(),
  reference   text unique,
  yacht_id    uuid not null references public.yachts(id) on delete cascade,
  created_by  uuid not null references auth.users(id),
  category    text not null check (category in
                ('provisioning','uniform','bunkering','permits','it_support','visa_immigration','general')),
  title       text not null,
  details     text,
  priority    text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status      text not null default 'new' check (status in
                ('new','acknowledged','in_progress','completed','cancelled')),
  needed_by   date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.captain_request_messages (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.captain_requests(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id),
  sender_name    text,
  sender_role    text not null check (sender_role in ('captain','staff')),
  body           text not null,
  created_at     timestamptz not null default now()
);

create table if not exists public.portal_directory (
  id           uuid primary key default gen_random_uuid(),
  department   text not null,
  contact_name text,
  phone        text,
  email        text,
  notes        text,
  sort_order   int not null default 100,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Helpers (security definer so they work regardless of table policies) ────
create or replace function public.is_portal_captain()
returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from captain_accounts where user_id = auth.uid() and active) $$;

create or replace function public.captain_yacht_ids()
returns setof uuid language sql stable security definer set search_path = public as
$$ select yacht_id from captain_accounts where user_id = auth.uid() and active $$;

-- MFA gate: true only for sessions verified with a second factor.
create or replace function public.portal_aal2()
returns boolean language sql stable as
$$ select coalesce(auth.jwt()->>'aal','aal1') = 'aal2' $$;

-- Raised inside guarded RPC wrappers (see lockdown migration).
create or replace function public.assert_not_portal_captain()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from captain_accounts where user_id = auth.uid() and active) then
    raise exception 'This action is not available to portal accounts' using errcode = '42501';
  end if;
end $$;

-- ── Reference + updated_at triggers ─────────────────────────────────────────
create or replace function public.captain_request_before_insert()
returns trigger language plpgsql as $$
begin
  if new.reference is null then
    new.reference := 'CR-' || lpad(nextval('public.captain_request_ref_seq')::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists captain_request_before_insert on public.captain_requests;
create trigger captain_request_before_insert
  before insert on public.captain_requests
  for each row execute function public.captain_request_before_insert();

create or replace function public.portal_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists captain_requests_touch on public.captain_requests;
create trigger captain_requests_touch before update on public.captain_requests
  for each row execute function public.portal_touch_updated_at();
drop trigger if exists captain_accounts_touch on public.captain_accounts;
create trigger captain_accounts_touch before update on public.captain_accounts
  for each row execute function public.portal_touch_updated_at();
drop trigger if exists portal_directory_touch on public.portal_directory;
create trigger portal_directory_touch before update on public.portal_directory
  for each row execute function public.portal_touch_updated_at();

grant usage on sequence public.captain_request_ref_seq to authenticated;

-- ── RLS: portal tables ───────────────────────────────────────────────────────
alter table public.captain_accounts enable row level security;
alter table public.captain_requests enable row level security;
alter table public.captain_request_messages enable row level security;
alter table public.portal_directory enable row level security;

-- captain_accounts: staff manage; captains may read ONLY their own link row
-- (needed at aal1 to drive the MFA-enrolment flow).
drop policy if exists staff_manage on public.captain_accounts;
create policy staff_manage on public.captain_accounts
  for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists captain_read_own on public.captain_accounts;
create policy captain_read_own on public.captain_accounts
  for select to authenticated using (user_id = auth.uid());

-- captain_requests
drop policy if exists staff_all on public.captain_requests;
create policy staff_all on public.captain_requests
  for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists captain_select on public.captain_requests;
create policy captain_select on public.captain_requests
  for select to authenticated
  using (public.is_portal_captain() and public.portal_aal2()
         and yacht_id in (select public.captain_yacht_ids()));
drop policy if exists captain_insert on public.captain_requests;
create policy captain_insert on public.captain_requests
  for insert to authenticated
  with check (public.is_portal_captain() and public.portal_aal2()
              and yacht_id in (select public.captain_yacht_ids())
              and created_by = auth.uid());
drop policy if exists captain_update on public.captain_requests;
create policy captain_update on public.captain_requests
  for update to authenticated
  using (public.is_portal_captain() and public.portal_aal2()
         and created_by = auth.uid()
         and yacht_id in (select public.captain_yacht_ids()))
  with check (yacht_id in (select public.captain_yacht_ids()));

-- captain_request_messages
drop policy if exists staff_all on public.captain_request_messages;
create policy staff_all on public.captain_request_messages
  for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists captain_select on public.captain_request_messages;
create policy captain_select on public.captain_request_messages
  for select to authenticated
  using (public.is_portal_captain() and public.portal_aal2()
         and request_id in (select id from public.captain_requests));
drop policy if exists captain_insert on public.captain_request_messages;
create policy captain_insert on public.captain_request_messages
  for insert to authenticated
  with check (public.is_portal_captain() and public.portal_aal2()
              and sender_user_id = auth.uid() and sender_role = 'captain'
              and request_id in (select id from public.captain_requests));

-- portal_directory: staff manage, captains read active entries (MFA'd)
drop policy if exists staff_manage on public.portal_directory;
create policy staff_manage on public.portal_directory
  for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists captain_read on public.portal_directory;
create policy captain_read on public.portal_directory
  for select to authenticated
  using (public.is_portal_captain() and public.portal_aal2() and active);

-- ── RLS: scoped, MFA-gated captain access to their OWN yacht's data ─────────
-- RESTRICTIVE policies AND with the existing permissive ones: staff keep full
-- access (is_portal_captain() is false), captains are cut down to their yacht,
-- read-only, and only at aal2.
do $$
declare t text;
begin
  foreach t in array array['yachts','crew_members','permits','visa_applications'] loop
    execute format('drop policy if exists portal_captain_scope_select on public.%I', t);
    execute format(
      'create policy portal_captain_scope_select on public.%I as restrictive for select to authenticated
       using ((not public.is_portal_captain()) or (public.portal_aal2() and %s in (select public.captain_yacht_ids())))',
      t, case when t = 'yachts' then 'id' else 'yacht_id' end);
    execute format('drop policy if exists portal_captain_block_insert on public.%I', t);
    execute format(
      'create policy portal_captain_block_insert on public.%I as restrictive for insert to authenticated
       with check (not public.is_portal_captain())', t);
    execute format('drop policy if exists portal_captain_block_update on public.%I', t);
    execute format(
      'create policy portal_captain_block_update on public.%I as restrictive for update to authenticated
       using (not public.is_portal_captain())', t);
    execute format('drop policy if exists portal_captain_block_delete on public.%I', t);
    execute format(
      'create policy portal_captain_block_delete on public.%I as restrictive for delete to authenticated
       using (not public.is_portal_captain())', t);
  end loop;
end $$;

-- ── Directory seed (numbers to be filled in by staff) ───────────────────────
insert into public.portal_directory (department, contact_name, phone, email, sort_order)
select * from (values
  ('Port Operations & Agency', null::text, null::text, 'operations@jlsyachts.com', 10),
  ('Visa & Immigration',       null, null, 'visas@jlsyachts.com',      20),
  ('Provisioning & Uniform',   null, null, 'provisioning@jlsyachts.com', 30),
  ('Bunkering',                null, null, 'bunkering@jlsyachts.com',  40),
  ('Yacht IT Support',         null, null, 'support@jlsyachts.com',    50),
  ('Accounts & Finance',       null, null, 'accounts@jlsyachts.com',   60),
  ('Emergency (24/7)',         null, null, null,                       70)
) v(department, contact_name, phone, email, sort_order)
where not exists (select 1 from public.portal_directory);
