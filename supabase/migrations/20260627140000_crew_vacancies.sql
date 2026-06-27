-- Job adverts / vacancies for crew placement. The "talent pool" of crew open to work
-- is derived from placed_crew (placement_type='pool' or status='available').
create table if not exists public.crew_vacancies (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  yacht_id      uuid references public.yachts(id) on delete set null,
  vessel_name   text,
  department    text,
  rank          text,
  employment_type text,
  salary_range  text,
  currency      text default 'EUR',
  location      text,
  start_date    date,
  status        text not null default 'open',  -- open | filled | closed | on_hold
  description   text,
  filled_by     uuid references public.placed_crew(id) on delete set null,
  posted_date   date default current_date,
  created_at    timestamptz not null default now()
);
create index if not exists crew_vacancies_status_idx on public.crew_vacancies (status);
alter table public.crew_vacancies enable row level security;
drop policy if exists crew_vacancies_auth on public.crew_vacancies;
create policy crew_vacancies_auth on public.crew_vacancies for all to authenticated using (true) with check (true);
