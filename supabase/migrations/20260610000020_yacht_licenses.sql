-- Yacht IT licensing / software subscriptions per vessel.
create table if not exists public.yacht_licenses (
  id                  uuid        primary key default gen_random_uuid(),
  yacht_id            uuid        references public.yachts(id) on delete set null,
  vessel_name         text,                    -- label, used when the vessel isn't in the fleet table
  license_name        text        not null,
  start_date          date,
  expiration_date     date,
  invoice_date        date,
  license_key         text,
  proof_document      text,
  company_contacts    text,
  party_responsible   text,
  configuration_item  text,
  user_license_count  integer,
  notes               text,
  archived            boolean     not null default false,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists yacht_licenses_yacht_idx  on public.yacht_licenses (yacht_id);
create index if not exists yacht_licenses_expiry_idx on public.yacht_licenses (expiration_date);

alter table public.yacht_licenses enable row level security;
drop policy if exists "Authenticated users can manage yacht_licenses" on public.yacht_licenses;
create policy "Authenticated users can manage yacht_licenses"
  on public.yacht_licenses for all using (auth.role() = 'authenticated');

drop trigger if exists yacht_licenses_updated_at on public.yacht_licenses;
create trigger yacht_licenses_updated_at
  before update on public.yacht_licenses
  for each row execute function public.set_updated_at();
