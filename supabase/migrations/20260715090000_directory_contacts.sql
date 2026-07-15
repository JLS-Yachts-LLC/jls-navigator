-- Business/network Contacts Directory (internal, staff-only). Distinct from the
-- staff Team Directory (departments/staff_profiles) and the client-portal directory.
-- Contacts are organised into free-form groups (Networks, Managers, Yacht Captains, …).

create table if not exists public.directory_contacts (
  id          uuid primary key default gen_random_uuid(),
  group_name  text not null default 'General',
  name        text,
  company     text,
  position    text,
  phone       text,
  email       text,
  notes       text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists directory_contacts_group_idx on public.directory_contacts(group_name);
create index if not exists directory_contacts_email_idx on public.directory_contacts(lower(email));

-- updated_at touch (reuse the portal helper)
drop trigger if exists directory_contacts_touch on public.directory_contacts;
create trigger directory_contacts_touch before update on public.directory_contacts
  for each row execute function public.portal_touch_updated_at();

-- RLS: internal staff only. Portal captains have no access.
alter table public.directory_contacts enable row level security;
drop policy if exists staff_manage on public.directory_contacts;
create policy staff_manage on public.directory_contacts
  for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
