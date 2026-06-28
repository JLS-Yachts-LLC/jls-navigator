-- Reusable contract profiles (e.g. "Captain Rotation", "90d Rotation") that prefill
-- the contract builder. The full wizard config lives in `values` jsonb.
create table if not exists public.crew_contract_profiles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  values      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.crew_contract_profiles enable row level security;
drop policy if exists crew_contract_profiles_auth on public.crew_contract_profiles;
create policy crew_contract_profiles_auth on public.crew_contract_profiles for all to authenticated using (true) with check (true);

alter table public.crew_contracts add column if not exists position text;
alter table public.crew_contracts add column if not exists employment_type text;
