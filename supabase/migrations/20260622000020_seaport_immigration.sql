-- ============================================================
-- POLARIS — Seaport Immigration (Sign On/Off) module.  Tickets #123–#127.
-- POLARIS_SEAPORT_IMMIGRATION.md §1, adapted to the live schema:
--   spec vessels(vessel_id) -> yachts(id);  crew_members(crew_id) -> crew_members(id).
-- RLS: the spec's vessel_crew/office mapping tables don't exist here, so this uses
-- authenticated full access (internal Port & Agency team tooling) + admin-all.
-- SLA is maintained automatically by triggers (satisfies #125).
-- ============================================================

create table if not exists public.seaport_requests (
  request_id      uuid primary key default gen_random_uuid(),
  vessel_id       uuid not null references public.yachts(id),
  submitted_by    uuid not null references auth.users(id),
  request_date    date not null,
  status          text not null default 'submitted'
                  check (status in ('submitted','acknowledged','in_progress','completed','report_sent')),
  acknowledged_by uuid references auth.users(id),
  acknowledged_at timestamptz,
  completed_at    timestamptz,
  report_sent_at  timestamptz,
  report_url      text,
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table if not exists public.seaport_arrivals (
  arrival_id      uuid primary key default gen_random_uuid(),
  request_id      uuid not null references public.seaport_requests(request_id) on delete cascade,
  crew_id         uuid references public.crew_members(id),
  crew_name       text not null,
  flight_date     date,
  flight_time     text,
  flight_number   text,
  sign_on         boolean default true,
  pickup_required boolean default false,
  pickup_time     text,
  crew_contact    text,
  status          text not null default 'pending'
                  check (status in ('pending','in_progress','completed','no_show','cancelled')),
  executed_at     timestamptz,
  executed_by     uuid references auth.users(id),
  execution_notes text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table if not exists public.seaport_departures (
  departure_id    uuid primary key default gen_random_uuid(),
  request_id      uuid not null references public.seaport_requests(request_id) on delete cascade,
  crew_id         uuid references public.crew_members(id),
  crew_name       text not null,
  flight_date     date,
  flight_time     text,
  flight_number   text,
  sign_off        boolean default true,
  pickup_required boolean default false,
  pickup_time     text,
  crew_contact    text,
  status          text not null default 'pending'
                  check (status in ('pending','in_progress','completed','no_show','cancelled')),
  executed_at     timestamptz,
  executed_by     uuid references auth.users(id),
  execution_notes text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table if not exists public.seaport_sla (
  sla_id               uuid primary key default gen_random_uuid(),
  request_id           uuid not null unique references public.seaport_requests(request_id) on delete cascade,
  submitted_at         timestamptz not null,
  acknowledged_at      timestamptz,
  first_execution_at   timestamptz,
  fully_completed_at   timestamptz,
  report_sent_at       timestamptz,
  mins_to_acknowledge  integer,
  mins_to_first_action integer,
  mins_to_completion   integer,
  mins_to_report       integer,
  sla_breached         boolean default false,
  sla_target_mins      integer default 240
);

create index if not exists idx_seaport_requests_vessel on public.seaport_requests(vessel_id);
create index if not exists idx_seaport_requests_status on public.seaport_requests(status);
create index if not exists idx_seaport_arrivals_request on public.seaport_arrivals(request_id);
create index if not exists idx_seaport_departures_request on public.seaport_departures(request_id);

-- updated_at triggers
drop trigger if exists trg_seaport_requests_updated on public.seaport_requests;
create trigger trg_seaport_requests_updated before update on public.seaport_requests
  for each row execute function public.polaris_set_updated_at();

-- ─── SLA auto-maintenance (#125) ──────────────────────────────────────────────
-- Mirror the request's own timestamps into seaport_sla and compute durations.
create or replace function public.seaport_sla_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.seaport_sla (request_id, submitted_at)
      values (new.request_id, coalesce(new.created_at, now()))
      on conflict (request_id) do nothing;
    return new;
  end if;

  update public.seaport_sla s set
    acknowledged_at = new.acknowledged_at,
    mins_to_acknowledge = case when new.acknowledged_at is not null
      then round(extract(epoch from (new.acknowledged_at - s.submitted_at)) / 60)::int end,
    fully_completed_at = new.completed_at,
    mins_to_completion = case when new.completed_at is not null
      then round(extract(epoch from (new.completed_at - s.submitted_at)) / 60)::int end,
    sla_breached = case when new.completed_at is not null
      then (extract(epoch from (new.completed_at - s.submitted_at)) / 60) > s.sla_target_mins
      else s.sla_breached end,
    report_sent_at = new.report_sent_at,
    mins_to_report = case when new.report_sent_at is not null and s.fully_completed_at is not null
      then round(extract(epoch from (new.report_sent_at - s.fully_completed_at)) / 60)::int end
  where s.request_id = new.request_id;
  return new;
end;
$$;

drop trigger if exists trg_seaport_sla_sync_ins on public.seaport_requests;
create trigger trg_seaport_sla_sync_ins after insert on public.seaport_requests
  for each row execute function public.seaport_sla_sync();
drop trigger if exists trg_seaport_sla_sync_upd on public.seaport_requests;
create trigger trg_seaport_sla_sync_upd after update on public.seaport_requests
  for each row execute function public.seaport_sla_sync();

-- First crew row marked completed → stamp first_execution_at once.
create or replace function public.seaport_sla_first_exec()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    update public.seaport_sla s set
      first_execution_at = coalesce(s.first_execution_at, now()),
      mins_to_first_action = coalesce(s.mins_to_first_action,
        round(extract(epoch from (now() - s.submitted_at)) / 60)::int)
    where s.request_id = new.request_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_seaport_arr_first_exec on public.seaport_arrivals;
create trigger trg_seaport_arr_first_exec after update on public.seaport_arrivals
  for each row execute function public.seaport_sla_first_exec();
drop trigger if exists trg_seaport_dep_first_exec on public.seaport_departures;
create trigger trg_seaport_dep_first_exec after update on public.seaport_departures
  for each row execute function public.seaport_sla_first_exec();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.seaport_requests   enable row level security;
alter table public.seaport_arrivals    enable row level security;
alter table public.seaport_departures  enable row level security;
alter table public.seaport_sla         enable row level security;

do $$ declare t text; begin
  foreach t in array array['seaport_requests','seaport_arrivals','seaport_departures','seaport_sla'] loop
    execute format('drop policy if exists %1$s_rw on public.%1$s', t);
    execute format($f$create policy %1$s_rw on public.%1$s for all
      using ((select auth.role()) = 'authenticated')
      with check ((select auth.role()) = 'authenticated')$f$, t);
  end loop;
end $$;
