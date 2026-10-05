-- Client Portal — the Owner's brief (Agency with JLS).
--
-- A monthly page for the owner: the month's spend, compliance, what happened
-- and what's next are all worked out live from the vessel's records. This table
-- holds only the part a person writes — the agent's headline and short summary
-- for the month — and whether it's been published to the client yet.
--
-- Same isolation as the portal's other tables: staff manage everything; a
-- portal login reads its own vessel's PUBLISHED briefs from an MFA-verified
-- session and never writes.

create table if not exists public.portal_owner_briefs (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  headline text,
  summary text,
  author_name text,
  author_title text,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (yacht_id, month)
);

alter table public.portal_owner_briefs enable row level security;
drop policy if exists staff_manage on public.portal_owner_briefs;
create policy staff_manage on public.portal_owner_briefs for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists captain_select on public.portal_owner_briefs;
create policy captain_select on public.portal_owner_briefs for select to authenticated
  using (public.is_portal_captain() and public.portal_aal2() and published_at is not null
         and yacht_id in (select public.captain_yacht_ids()));
drop policy if exists portal_captain_block_insert on public.portal_owner_briefs;
create policy portal_captain_block_insert on public.portal_owner_briefs as restrictive for insert to authenticated
  with check (not public.is_portal_captain());
drop policy if exists portal_captain_block_update on public.portal_owner_briefs;
create policy portal_captain_block_update on public.portal_owner_briefs as restrictive for update to authenticated
  using (not public.is_portal_captain());
drop policy if exists portal_captain_block_delete on public.portal_owner_briefs;
create policy portal_captain_block_delete on public.portal_owner_briefs as restrictive for delete to authenticated
  using (not public.is_portal_captain());
