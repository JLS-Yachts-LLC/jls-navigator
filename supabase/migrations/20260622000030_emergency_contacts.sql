-- Emergency Contacts directory (My Vessel → Emergency Contacts).
-- Safety-critical reference data: any signed-in user can READ; only admins manage.
-- No seed data — numbers are populated by admins (never fabricate emergency numbers).

create table if not exists public.emergency_contacts (
  id            uuid primary key default gen_random_uuid(),
  category      text not null check (category in (
                  'company_247','dpa_cso','agent','port_authority','coast_guard',
                  'medical','flag_state','insurer','technical','owner_rep','other')),
  name          text not null,
  role          text,
  organisation  text,
  phone         text,
  phone_alt     text,
  email         text,
  available_247 boolean not null default false,
  scope         text not null default 'global' check (scope in ('global','vessel','location')),
  vessel_id     uuid references public.yachts(id) on delete cascade,
  location_id   uuid references public.locations(location_id) on delete set null,
  region        text,
  notes         text,
  sort_order    integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_emergency_contacts_vessel on public.emergency_contacts(vessel_id) where vessel_id is not null;
create index if not exists idx_emergency_contacts_active on public.emergency_contacts(active, category);

drop trigger if exists trg_emergency_contacts_updated on public.emergency_contacts;
create trigger trg_emergency_contacts_updated before update on public.emergency_contacts
  for each row execute function public.polaris_set_updated_at();

alter table public.emergency_contacts enable row level security;
drop policy if exists emergency_contacts_read on public.emergency_contacts;
create policy emergency_contacts_read on public.emergency_contacts for select
  using ((select auth.role()) = 'authenticated');
drop policy if exists emergency_contacts_admin on public.emergency_contacts;
create policy emergency_contacts_admin on public.emergency_contacts for all
  using (public.has_role((select auth.uid()), 'admin'::public.app_role))
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
