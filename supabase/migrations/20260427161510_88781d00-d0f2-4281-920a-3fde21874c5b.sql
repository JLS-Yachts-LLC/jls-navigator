
-- Roles enum + table
create type public.app_role as enum ('admin', 'manager', 'user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- Security definer for role checks
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$$;

-- Yachts table
create table public.yachts (
  id uuid primary key default gen_random_uuid(),
  vessel_name text not null,
  vessel_type text,
  flag text,
  imo_no text,
  official_no text,
  port_of_registry text,
  built_year int,
  builders_name text,
  built_place text,
  gross_tonnage numeric,
  net_tonnage numeric,
  length_overall_m numeric,
  breadth_m numeric,
  draught_m numeric,
  air_draft_m numeric,
  radio_call_sign text,
  frequency text,
  equipment_model text,
  manufacturer text,
  serial_no text,
  mmsi text,
  max_crew int,
  max_guests int,
  owners_name text,
  owners_nationality text,
  owners_address text,
  company_name text,
  contact_person text,
  email_address text,
  contact_no text,
  billing_address text,
  link_to_folder text,
  vessel_image text,
  status text default 'Active',
  berth text,
  eta date,
  etd date,
  location text,
  archive boolean not null default false,
  cruising_permit_expiry date,
  departed_date date,
  dma_permit_phase_status text,
  planner_id text,
  engine text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.yachts enable row level security;

-- Profiles policies
create policy "Profiles viewable by authenticated"
  on public.profiles for select to authenticated using (true);
create policy "Users update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);
create policy "Users insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

-- user_roles policies
create policy "Users view own roles"
  on public.user_roles for select to authenticated using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "Admins manage roles"
  on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Yachts policies
create policy "Authenticated view yachts"
  on public.yachts for select to authenticated using (true);
create policy "Authenticated insert yachts"
  on public.yachts for insert to authenticated with check (auth.uid() = created_by);
create policy "Owner or admin update yachts"
  on public.yachts for update to authenticated
  using (auth.uid() = created_by or public.has_role(auth.uid(), 'admin'));
create policy "Owner or admin delete yachts"
  on public.yachts for delete to authenticated
  using (auth.uid() = created_by or public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_yachts_updated before update on public.yachts
  for each row execute function public.set_updated_at();
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage bucket for vessel images
insert into storage.buckets (id, name, public) values ('vessel-images', 'vessel-images', true)
  on conflict (id) do nothing;

create policy "Vessel images public read"
  on storage.objects for select using (bucket_id = 'vessel-images');
create policy "Authenticated upload vessel images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'vessel-images');
create policy "Authenticated update vessel images"
  on storage.objects for update to authenticated
  using (bucket_id = 'vessel-images');
create policy "Authenticated delete vessel images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'vessel-images');
