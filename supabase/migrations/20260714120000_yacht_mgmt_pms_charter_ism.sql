-- Yacht Management App modules: Charter, PMS (planned maintenance) and ISM (safety).
-- Portal-readable per the isolation model: staff manage (non-captains), captains get
-- read-only select on their own yacht at aal2. NOT yet wired into the portal nav — the
-- tables + RLS exist so the sections are ready to switch on.

-- ── Charter ───────────────────────────────────────────────────────────────────
create table if not exists public.charter_bookings (
  id            uuid primary key default gen_random_uuid(),
  yacht_id      uuid references public.yachts(id) on delete cascade,
  charter_ref   text,
  charterer_name text,
  broker        text,
  status        text not null default 'enquiry'
                  check (status in ('enquiry','option','confirmed','in_progress','completed','cancelled')),
  start_date    date,
  end_date      date,
  embark_port   text,
  disembark_port text,
  itinerary     text,
  guest_count   int,
  charter_fee   numeric,
  currency      text default 'EUR',
  documents     jsonb not null default '[]'::jsonb,  -- [{ name, path }]
  notes         text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── PMS: equipment register + planned tasks ────────────────────────────────────
create table if not exists public.pms_equipment (
  id            uuid primary key default gen_random_uuid(),
  yacht_id      uuid references public.yachts(id) on delete cascade,
  name          text not null,
  category      text,           -- engine / generator / deck / nav / safety / hvac …
  maker         text,
  model         text,
  serial_number text,
  location      text,
  running_hours numeric,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.pms_tasks (
  id             uuid primary key default gen_random_uuid(),
  yacht_id       uuid references public.yachts(id) on delete cascade,
  equipment_id   uuid references public.pms_equipment(id) on delete set null,
  title          text not null,
  description    text,
  interval_kind  text default 'calendar' check (interval_kind in ('calendar','hours')),
  interval_value int,
  interval_unit  text check (interval_unit in ('days','weeks','months','years','hours')),
  last_done_date date,
  last_done_hours numeric,
  next_due_date  date,
  next_due_hours numeric,
  status         text not null default 'upcoming'
                   check (status in ('upcoming','due','overdue','done')),
  assigned_to    text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── ISM: certificates + drill log ──────────────────────────────────────────────
create table if not exists public.ism_certificates (
  id               uuid primary key default gen_random_uuid(),
  yacht_id         uuid references public.yachts(id) on delete cascade,
  title            text not null,
  certificate_type text,          -- SMC / DOC / ISSC / MLC / class …
  reference        text,
  issuing_authority text,
  issued_date      date,
  expiry_date      date,
  status           text not null default 'valid'
                     check (status in ('valid','expiring','expired','pending')),
  file_path        text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.ism_drills (
  id           uuid primary key default gen_random_uuid(),
  yacht_id     uuid references public.yachts(id) on delete cascade,
  drill_type   text not null,     -- fire / abandon ship / MOB / security …
  conducted_at date,
  conducted_by text,
  participants text,
  location     text,
  file_path    text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────────
create index if not exists charter_bookings_yacht_idx  on public.charter_bookings(yacht_id);
create index if not exists pms_equipment_yacht_idx      on public.pms_equipment(yacht_id);
create index if not exists pms_tasks_yacht_idx          on public.pms_tasks(yacht_id);
create index if not exists pms_tasks_equipment_idx      on public.pms_tasks(equipment_id);
create index if not exists ism_certificates_yacht_idx   on public.ism_certificates(yacht_id);
create index if not exists ism_drills_yacht_idx         on public.ism_drills(yacht_id);

-- ── updated_at triggers (reuse the portal helper) + RLS ─────────────────────────
do $$
declare t text;
        tables text[] := array['charter_bookings','pms_equipment','pms_tasks','ism_certificates','ism_drills'];
begin
  foreach t in array tables loop
    -- touch updated_at
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.portal_touch_updated_at()', t, t);

    -- RLS: staff manage everything; captains read only their own yacht at aal2
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_manage on public.%I', t);
    execute format('create policy staff_manage on public.%I for all to authenticated using (not public.is_portal_captain()) with check (not public.is_portal_captain())', t);
    execute format('drop policy if exists captain_select on public.%I', t);
    execute format('create policy captain_select on public.%I for select to authenticated using (public.is_portal_captain() and public.portal_aal2() and yacht_id in (select public.captain_yacht_ids()))', t);
  end loop;
end $$;
