-- Migration 071: Client management (FRS §9)
-- Reuses public.organisations (migration 065; its type check constraint
-- already includes 'client') as the core client entity, and agency_contacts
-- (already has org_id + vessel_id) for client contacts, and yachts.org_id
-- for client fleet lookups — instead of the original zip's separate
-- client_profiles/client_contacts/client_vessels tables, which would have
-- duplicated an entity this repo already has. Only the placement-specific
-- fields that don't belong on the generic organisations table get a slim
-- 1:1 extension table here.

create table if not exists public.crew_placement_client_profiles (
  org_id uuid primary key references public.organisations(org_id) on delete cascade,
  terms_of_business text,
  recruitment_preferences text,
  is_repeat_client boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.crew_placement_client_profiles is
  'Placement-specific extension of public.organisations for clients of the
   Crew Placement module. The organisation itself (name, type=''client'',
   country_code) lives in organisations; contacts live in agency_contacts
   (org_id-scoped); fleet lookups use yachts.org_id. This table only holds
   fields that are meaningless outside a recruitment context.';

drop trigger if exists trg_crew_placement_client_profiles_updated_at on public.crew_placement_client_profiles;
create trigger trg_crew_placement_client_profiles_updated_at
  before update on public.crew_placement_client_profiles
  for each row execute function public.set_updated_at();

alter table public.crew_placement_client_profiles enable row level security;

create policy crew_placement_client_profiles_select on public.crew_placement_client_profiles
  for select using (auth.role() = 'authenticated');

-- No direct write policy — mutation via create_client / update_client in
-- migration 075.
