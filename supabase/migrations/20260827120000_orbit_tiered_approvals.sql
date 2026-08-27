-- ORBIT tiered spend approvals.
--
-- Adopted from the Orbit Yacht Flow demo's one genuinely good idea: derive how
-- many approval stages a spend needs from its VALUE, auto-approve small amounts,
-- and record what each approver actually saw — currency, amount and the FX rate
-- used at that moment — so an approval is defensible months later.
--
-- Base currency is AED (JLS invoices in AED); foreign quotes are normalised
-- through orbit_fx_rates, and the rate is snapshotted onto every approval row so
-- a later rate change can never rewrite history.

-- ── Per-vessel approval limits ────────────────────────────────────────────────
-- One row per yacht; the row with yacht_id IS NULL is the fleet default used for
-- any vessel without its own policy.
create table if not exists public.orbit_approval_policies (
  id             uuid primary key default gen_random_uuid(),
  yacht_id       uuid references public.yachts(id) on delete cascade,
  captain_limit  numeric not null default 5000,   -- at/below → auto-approved
  manager_limit  numeric not null default 50000,  -- at/below → captain + manager
  base_currency  text not null default 'AED',
  notes          text,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id) on delete set null,
  constraint orbit_policy_limits_ordered check (manager_limit >= captain_limit)
);

-- One policy per vessel, and only one fleet default.
create unique index if not exists orbit_approval_policies_yacht_key
  on public.orbit_approval_policies (yacht_id) where yacht_id is not null;
create unique index if not exists orbit_approval_policies_default_key
  on public.orbit_approval_policies ((yacht_id is null)) where yacht_id is null;

-- ── FX rates (to base currency) ───────────────────────────────────────────────
create table if not exists public.orbit_fx_rates (
  currency    text primary key,
  rate_to_aed numeric not null check (rate_to_aed > 0),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

-- ── Approval chain rows ───────────────────────────────────────────────────────
-- The table already existed (flat, single-stage). These columns turn it into a
-- staged chain with a full audit snapshot.
alter table public.orbit_approvals add column if not exists quotation_id uuid references public.orbit_quotations(id) on delete cascade;
alter table public.orbit_approvals add column if not exists yacht_id uuid references public.yachts(id) on delete set null;
alter table public.orbit_approvals add column if not exists stage_number integer not null default 1;
alter table public.orbit_approvals add column if not exists total_stages integer not null default 1;
alter table public.orbit_approvals add column if not exists action text;
-- What the approver was looking at, and the rate that produced it.
alter table public.orbit_approvals add column if not exists amount_original numeric;
alter table public.orbit_approvals add column if not exists currency_original text;
alter table public.orbit_approvals add column if not exists amount_base numeric;
alter table public.orbit_approvals add column if not exists fx_rate numeric;
alter table public.orbit_approvals add column if not exists comments text;
alter table public.orbit_approvals add column if not exists approver_id uuid references auth.users(id) on delete set null;

create index if not exists orbit_approvals_request_idx on public.orbit_approvals (request_id, stage_number);
create index if not exists orbit_approvals_quotation_idx on public.orbit_approvals (quotation_id, stage_number);

-- ── Approval state on the things being approved ───────────────────────────────
alter table public.orbit_service_requests add column if not exists approval_status text not null default 'not_required'
  check (approval_status in ('not_required','awaiting_approval','approved','auto_approved','rejected'));
alter table public.orbit_service_requests add column if not exists approval_stage integer not null default 0;
alter table public.orbit_service_requests add column if not exists approval_total_stages integer not null default 0;

alter table public.orbit_quotations add column if not exists approval_status text not null default 'not_required'
  check (approval_status in ('not_required','awaiting_approval','approved','auto_approved','rejected'));
alter table public.orbit_quotations add column if not exists approval_stage integer not null default 0;
alter table public.orbit_quotations add column if not exists approval_total_stages integer not null default 0;
alter table public.orbit_quotations add column if not exists amount_base numeric;

-- ── Seeds ─────────────────────────────────────────────────────────────────────
-- Fleet default limits; adjust per vessel in ORBIT → Approvals.
insert into public.orbit_approval_policies (yacht_id, captain_limit, manager_limit, base_currency, notes)
select null, 5000, 50000, 'AED', 'Fleet default — used by any vessel without its own policy'
where not exists (select 1 from public.orbit_approval_policies where yacht_id is null);

-- Indicative rates to AED; maintained in the UI.
insert into public.orbit_fx_rates (currency, rate_to_aed) values
  ('AED', 1), ('USD', 3.6725), ('EUR', 4.02), ('GBP', 4.68), ('CHF', 4.15)
on conflict (currency) do nothing;

-- ── RLS: staff-only, portal captains blocked ──────────────────────────────────
alter table public.orbit_approval_policies enable row level security;
alter table public.orbit_fx_rates enable row level security;

create policy orbit_approval_policies_staff on public.orbit_approval_policies
  for all to authenticated using (not is_portal_captain()) with check (not is_portal_captain());
create policy orbit_fx_rates_staff on public.orbit_fx_rates
  for all to authenticated using (not is_portal_captain()) with check (not is_portal_captain());
