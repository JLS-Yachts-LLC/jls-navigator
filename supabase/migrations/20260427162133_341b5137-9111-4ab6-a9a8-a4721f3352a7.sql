
create type public.permit_type as enum (
  'exit_entry',
  'sanitation',
  'cruising_mothership',
  'cruising_tenders',
  'gate_pass',
  'tdra',
  'navigation_license',
  'dma'
);

create type public.permit_status as enum ('pending', 'active', 'expired', 'cancelled');

create table public.permits (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid references public.yachts(id) on delete cascade,
  permit_type public.permit_type not null,
  permit_number text,
  status public.permit_status not null default 'pending',
  issue_date date,
  expiry_date date,
  issuing_authority text,
  holder_name text,
  dma_phase text,
  document_url text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index permits_type_idx on public.permits(permit_type);
create index permits_yacht_idx on public.permits(yacht_id);
create index permits_expiry_idx on public.permits(expiry_date);

alter table public.permits enable row level security;

create policy "Authenticated view permits"
  on public.permits for select to authenticated using (true);
create policy "Authenticated insert permits"
  on public.permits for insert to authenticated with check (auth.uid() = created_by);
create policy "Owner or admin update permits"
  on public.permits for update to authenticated
  using (auth.uid() = created_by or public.has_role(auth.uid(), 'admin'));
create policy "Owner or admin delete permits"
  on public.permits for delete to authenticated
  using (auth.uid() = created_by or public.has_role(auth.uid(), 'admin'));

create trigger trg_permits_updated before update on public.permits
  for each row execute function public.set_updated_at();
