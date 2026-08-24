-- ============================================================
-- Pre-Arrival / Cruising Permit forms — auto-populated from yacht profile
--
-- Reconciliation notes (spec written against an assumed schema):
--   * Owner + billing live DIRECTLY on `yachts` (owners_name/nationality/address,
--     company_name/contact_person/email_address/contact_no/billing_address) —
--     there are no yacht_owners / billing_contacts tables.
--   * There is no yacht_crew table, and `yachts` has no extended-dimensions /
--     engine-breakdown / hull-id / fuel-type columns. Those form fields have no
--     profile home yet, so (additive-only decision) they are captured per
--     submission on pre_arrival_forms rather than by ALTERing the live yachts
--     table. When the profile later gains those columns they can move to prefill.
--   * `yachts` uses vessel_name (not name), max_guests (not max_guest),
--     frequency/equipment_model/manufacturer/serial_no (not radio_* names),
--     and a single `engine` text field.
-- ============================================================

-- ── Feature tables ───────────────────────────────────────────────────────────
create table if not exists public.pre_arrival_forms (
  id                uuid primary key default gen_random_uuid(),
  yacht_id          uuid not null references public.yachts(id) on delete cascade,
  status            text not null default 'draft'
                      check (status in ('draft','ready_for_review','submitted')),

  -- trip-specific fields (never prefilled)
  arrival_date      date,
  last_port_of_call text,
  arrival_emirate   text,
  arrival_port      text,

  -- particulars with no profile home yet — captured per submission so the permit
  -- record is complete without altering the live yachts table
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

  -- department heads (no yacht_crew table yet)
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

-- Which profile fields the client explicitly reviewed/confirmed for a submission.
create table if not exists public.pre_arrival_form_confirmations (
  pre_arrival_form_id uuid not null references public.pre_arrival_forms(id) on delete cascade,
  field_key           text not null,
  confirmed           boolean not null default false,
  confirmed_at        timestamptz,
  primary key (pre_arrival_form_id, field_key)
);

-- Tenders / toys — a profile-level repeating table (source for the form's rows).
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

-- ── Prefill view — one row per yacht, live from the profile ──────────────────
-- Only columns that actually exist on `yachts`. Owner + billing are on yachts.
create or replace view public.v_prearrival_prefill as
select
  y.id                    as yacht_id,
  y.vessel_name,
  y.imo_no,
  y.vessel_type,
  y.official_no,
  y.flag,
  y.port_of_registry,
  y.gross_tonnage,
  y.net_tonnage,
  y.length_overall_m,
  y.breadth_m,
  y.draught_m,
  y.air_draft_m,
  y.max_crew,
  y.max_guests,
  y.mmsi,
  y.radio_call_sign,
  y.frequency,
  y.equipment_model,
  y.manufacturer,
  y.serial_no,
  y.engine,
  y.owners_name,
  y.owners_nationality,
  y.owners_address,
  y.company_name,
  y.contact_person,
  y.email_address,
  y.contact_no,
  y.billing_address
from public.yachts y;

-- ── RLS (client-facing form: authenticated users) ───────────────────────────
alter table public.pre_arrival_forms             enable row level security;
alter table public.pre_arrival_form_confirmations enable row level security;
alter table public.yacht_tenders                 enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pre_arrival_forms','pre_arrival_form_confirmations','yacht_tenders'] loop
    execute format('drop policy if exists %1$s_rw on public.%1$s', t);
    execute format($f$create policy %1$s_rw on public.%1$s for all
      using ((select auth.role()) = 'authenticated')
      with check ((select auth.role()) = 'authenticated')$f$, t);
  end loop;
end $$;
