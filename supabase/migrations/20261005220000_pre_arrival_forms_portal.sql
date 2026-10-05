-- Pre-Arrival / Cruising Permit forms — make them live, isolated, and usable
-- from the Client Portal.
--
-- 20260824160000_pre_arrival_forms.sql was never applied to the live database
-- (the staff "Pre-Arrival Form" button failed for want of its tables), and as
-- written it was unsafe to apply: an "any authenticated user" policy on every
-- table, so one client could read and write another vessel's forms, and a
-- prefill view without security_invoker, which would have shown every yacht's
-- owner and billing details to any signed-in user.
--
-- This migration creates the same objects idempotently with the portal's
-- isolation model instead:
--   * staff (anyone who is not a portal login) manage everything;
--   * a portal login reads only its own vessel's rows, from an MFA-verified
--     session, and never writes directly — the portal writes through
--     /api/portal/prearrival with the service role, hard-filtered to its vessel;
--   * the prefill view runs with the caller's permissions (security_invoker), so
--     it shows a portal login only its own yacht.
--
-- A submission from the portal also raises a Client Request so JLS sees it in
-- triage; captain_request_id records which one.

create table if not exists public.pre_arrival_forms (
  id                uuid primary key default gen_random_uuid(),
  yacht_id          uuid not null references public.yachts(id) on delete cascade,
  status            text not null default 'draft'
                      check (status in ('draft','ready_for_review','submitted')),
  arrival_date      date,
  last_port_of_call text,
  arrival_emirate   text,
  arrival_port      text,
  max_air_draft_m       numeric,
  beam_m                numeric,
  max_forward_draft_m   numeric,
  dead_weight_tn        numeric,
  max_stern_draft_m     numeric,
  summer_dead_weight_tn numeric,
  displacement_tn       numeric,
  main_propulsion_kw    numeric,
  generators_kw         numeric,
  hull_id_number        text,
  engine_serial_no      text,
  fuel_type             text,
  captain_name          text,
  captain_email         text,
  purser_name           text,
  purser_email          text,
  chief_engineer_name   text,
  chief_engineer_email  text,
  created_at        timestamptz not null default now(),
  submitted_at      timestamptz,
  submitted_by      uuid references auth.users(id)
);
create index if not exists pre_arrival_forms_yacht_idx on public.pre_arrival_forms (yacht_id, created_at desc);

alter table public.pre_arrival_forms add column if not exists submitted_by_name text;
alter table public.pre_arrival_forms add column if not exists captain_request_id uuid references public.captain_requests(id) on delete set null;
alter table public.pre_arrival_forms add column if not exists updated_at timestamptz not null default now();

create table if not exists public.pre_arrival_form_confirmations (
  pre_arrival_form_id uuid not null references public.pre_arrival_forms(id) on delete cascade,
  field_key           text not null,
  confirmed           boolean not null default false,
  confirmed_at        timestamptz,
  primary key (pre_arrival_form_id, field_key)
);
-- No yacht_id of its own; scoped through its form below.

create table if not exists public.yacht_tenders (
  id                 uuid primary key default gen_random_uuid(),
  yacht_id           uuid not null references public.yachts(id) on delete cascade,
  description        text,
  manufacturer_model text,
  length_m           numeric,
  id_serial_no       text,
  color              text,
  fuel_type          text,
  year_of_build      int,
  created_at         timestamptz not null default now()
);
create index if not exists yacht_tenders_yacht_idx on public.yacht_tenders (yacht_id, created_at);

drop trigger if exists pre_arrival_forms_updated on public.pre_arrival_forms;
create trigger pre_arrival_forms_updated before update on public.pre_arrival_forms
  for each row execute function public.set_updated_at();

create or replace view public.v_prearrival_prefill
with (security_invoker = true) as
select
  y.id as yacht_id, y.vessel_name, y.imo_no, y.vessel_type, y.official_no, y.flag, y.port_of_registry,
  y.gross_tonnage, y.net_tonnage, y.length_overall_m, y.breadth_m, y.draught_m, y.air_draft_m,
  y.max_crew, y.max_guests, y.mmsi, y.radio_call_sign, y.frequency, y.equipment_model, y.manufacturer,
  y.serial_no, y.engine, y.owners_name, y.owners_nationality, y.owners_address, y.company_name,
  y.contact_person, y.email_address, y.contact_no, y.billing_address
from public.yachts y;

alter table public.pre_arrival_forms              enable row level security;
alter table public.pre_arrival_form_confirmations enable row level security;
alter table public.yacht_tenders                  enable row level security;

-- Replace the original "any authenticated user" policies.
drop policy if exists pre_arrival_forms_rw on public.pre_arrival_forms;
drop policy if exists pre_arrival_form_confirmations_rw on public.pre_arrival_form_confirmations;
drop policy if exists yacht_tenders_rw on public.yacht_tenders;

do $$
declare t text;
begin
  foreach t in array array['pre_arrival_forms', 'yacht_tenders'] loop
    execute format('drop policy if exists staff_manage on public.%I', t);
    execute format($p$create policy staff_manage on public.%I for all to authenticated
      using (not public.is_portal_captain()) with check (not public.is_portal_captain())$p$, t);
    execute format('drop policy if exists captain_select on public.%I', t);
    execute format($p$create policy captain_select on public.%I for select to authenticated
      using (public.is_portal_captain() and public.portal_aal2() and yacht_id in (select public.captain_yacht_ids()))$p$, t);
  end loop;
  foreach t in array array['pre_arrival_forms', 'yacht_tenders', 'pre_arrival_form_confirmations'] loop
    execute format('drop policy if exists portal_captain_block_insert on public.%I', t);
    execute format($p$create policy portal_captain_block_insert on public.%I as restrictive for insert to authenticated
      with check (not public.is_portal_captain())$p$, t);
    execute format('drop policy if exists portal_captain_block_update on public.%I', t);
    execute format($p$create policy portal_captain_block_update on public.%I as restrictive for update to authenticated
      using (not public.is_portal_captain())$p$, t);
    execute format('drop policy if exists portal_captain_block_delete on public.%I', t);
    execute format($p$create policy portal_captain_block_delete on public.%I as restrictive for delete to authenticated
      using (not public.is_portal_captain())$p$, t);
  end loop;
end $$;

drop policy if exists staff_manage on public.pre_arrival_form_confirmations;
create policy staff_manage on public.pre_arrival_form_confirmations for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists captain_select on public.pre_arrival_form_confirmations;
create policy captain_select on public.pre_arrival_form_confirmations for select to authenticated
  using (
    public.is_portal_captain() and public.portal_aal2()
    and pre_arrival_form_id in (select f.id from public.pre_arrival_forms f where f.yacht_id in (select public.captain_yacht_ids()))
  );

grant select on public.v_prearrival_prefill to authenticated;
revoke all on public.v_prearrival_prefill from anon;
