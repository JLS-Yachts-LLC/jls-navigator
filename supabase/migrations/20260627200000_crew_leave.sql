create table if not exists public.crew_leave (
  id              uuid primary key default gen_random_uuid(),
  placed_crew_id  uuid not null references public.placed_crew(id) on delete cascade,
  leave_type      text not null default 'rotation',  -- rotation | paid | unpaid | travel | other
  start_date      date not null,
  end_date        date not null,
  days            numeric,
  accrues         boolean not null default false,
  status          text not null default 'scheduled', -- scheduled | taken | cancelled
  note            text,
  created_at      timestamptz not null default now()
);
create index if not exists crew_leave_crew_idx on public.crew_leave (placed_crew_id);
create index if not exists crew_leave_date_idx on public.crew_leave (start_date);
alter table public.crew_leave enable row level security;
drop policy if exists crew_leave_auth on public.crew_leave;
create policy crew_leave_auth on public.crew_leave for all to authenticated using (true) with check (true);
