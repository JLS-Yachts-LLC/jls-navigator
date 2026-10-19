-- Maritime Declaration of Health (SD-0064) — completed by the master in the
-- Client Portal (Arrivals & departures) before every Abu Dhabi arrival, at least
-- five working days ahead, signed (and stamped if the ship has one), and sent
-- back to JLS as a Client Request with a PDF in Abu Dhabi Ports' layout.
--
-- Same isolation as pre_arrival_forms: staff manage everything; a portal login
-- reads only its own vessel's rows from an MFA-verified session and never writes
-- directly — the portal writes through /api/portal/health-declaration with the
-- service role, hard-filtered to its vessel. Signature, stamp and PDF are stored
-- privately in permit-documents under portal/<yacht_id>/health/…

create table if not exists public.health_declarations (
  id                         uuid primary key default gen_random_uuid(),
  yacht_id                   uuid not null references public.yachts(id) on delete cascade,
  status                     text not null default 'draft' check (status in ('draft','submitted')),
  -- voyage
  arrival_date               date,
  port_of_arrival            text,
  arriving_from              text,
  sailing_to                 text,
  crew_count                 int,
  passenger_count            int,
  ports_of_call              jsonb not null default '[]'::jsonb,   -- [{ port, departed }]
  joined_persons             jsonb not null default '[]'::jsonb,   -- [{ name, joined_from: [..3] }]
  -- ship
  ship_name                  text,
  imo_no                     text,
  flag                       text,
  master_name                text,
  gross_tonnage              text,
  inland_tonnage             text,
  surgeon_name               text,
  -- sanitation
  sanitation_cert_carried    text check (sanitation_cert_carried in ('yes','no')),
  sanitation_cert_issued_at  text,
  sanitation_cert_date       date,
  reinspection_required      text check (reinspection_required in ('yes','no')),
  visited_affected_area      text check (visited_affected_area in ('yes','no')),
  affected_area_port         text,
  affected_area_date         date,
  -- health questions ({ q_death: 'yes'|'no', deaths_count, q_death_details, … }):
  -- <question>_details is the schedule entry for each yes; particulars is any further remark
  answers                    jsonb not null default '{}'::jsonb,
  particulars                text,
  -- signing
  signature_ref              text,
  stamp_ref                  text,
  pdf_ref                    text,
  document_id                uuid references public.yacht_documents(id) on delete set null,  -- the PDF on the vessel's Documents
  due_date                   date,
  late                       boolean not null default false,
  submitted_at               timestamptz,
  submitted_by               uuid references auth.users(id),
  submitted_by_name          text,
  captain_request_id         uuid references public.captain_requests(id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
alter table public.health_declarations add column if not exists inland_tonnage text;
create index if not exists health_declarations_yacht_idx on public.health_declarations (yacht_id, created_at desc);
create index if not exists health_declarations_request_idx on public.health_declarations (captain_request_id);

drop trigger if exists health_declarations_updated on public.health_declarations;
create trigger health_declarations_updated before update on public.health_declarations
  for each row execute function public.set_updated_at();

alter table public.health_declarations enable row level security;

drop policy if exists staff_manage on public.health_declarations;
create policy staff_manage on public.health_declarations for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists captain_select on public.health_declarations;
create policy captain_select on public.health_declarations for select to authenticated
  using (public.is_portal_captain() and public.portal_aal2() and yacht_id in (select public.captain_yacht_ids()));
drop policy if exists portal_captain_block_insert on public.health_declarations;
create policy portal_captain_block_insert on public.health_declarations as restrictive for insert to authenticated
  with check (not public.is_portal_captain());
drop policy if exists portal_captain_block_update on public.health_declarations;
create policy portal_captain_block_update on public.health_declarations as restrictive for update to authenticated
  using (not public.is_portal_captain());
drop policy if exists portal_captain_block_delete on public.health_declarations;
create policy portal_captain_block_delete on public.health_declarations as restrictive for delete to authenticated
  using (not public.is_portal_captain());

-- Guest (outside) logins never see health data.
drop policy if exists portal_guest_block on public.health_declarations;
create policy portal_guest_block on public.health_declarations as restrictive for all to authenticated
  using (not public.is_portal_guest()) with check (not public.is_portal_guest());

revoke all on public.health_declarations from anon;
