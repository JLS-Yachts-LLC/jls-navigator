-- Contacts groups (Resources → Contacts) — the list staff pick a contact's group
-- from, so a new group exists before anyone is in it. directory_contacts.group_name
-- stays plain text holding the group's name.
create table if not exists public.directory_contact_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists directory_contact_groups_name_key on public.directory_contact_groups (lower(trim(name)));

alter table public.directory_contact_groups enable row level security;
revoke all on public.directory_contact_groups from anon;
drop policy if exists staff_manage on public.directory_contact_groups;
create policy staff_manage on public.directory_contact_groups for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists portal_captain_denied on public.directory_contact_groups;
create policy portal_captain_denied on public.directory_contact_groups as restrictive for all to authenticated
  using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));

-- The groups in use today.
insert into public.directory_contact_groups (name)
select distinct trim(group_name) from public.directory_contacts where coalesce(trim(group_name), '') <> ''
on conflict do nothing;
insert into public.directory_contact_groups (name) values ('Networks'), ('Managers'), ('Yacht Captains')
on conflict do nothing;
