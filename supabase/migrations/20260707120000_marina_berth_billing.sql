-- Migration: Marina Berth Billing & Revenue Management (Agency Module)
--
-- Vertical slice: berth assignment -> automatic charge calculation ->
-- draft invoice -> invoice lifecycle -> supplier invoice linkage ->
-- live dashboard resolver view. Follows the same read/write separation
-- rule as the Port Calls slice (058-062/066/067): nothing mutates the
-- core tables directly from the client, only via the SECURITY DEFINER
-- functions below, each of which derives identity from auth.uid() (never
-- a client-supplied id — see 066's writeup of why that was unsafe) and
-- has EXECUTE revoked from public/anon before being granted to
-- authenticated (066/067 — Supabase grants EXECUTE to anon by default on
-- every new function in public, independently of the PUBLIC grant, and
-- that grant survives `revoke ... from public`).
--
-- Real schema references confirmed against live db (no public.orgs /
-- public.profiles / public.vessels / native enum types anywhere in this
-- project — status columns are text + check, matching every other
-- module here):
--   vessel   -> public.yachts(id)
--   customer -> public.organisations(org_id)
--   staff    -> public.user_profiles(user_id)
-- berth_occupancies.port_call_id links a berth stay back to its Port
-- Call (public.port_calls) when one exists, and invoice lifecycle
-- transitions keep port_calls.finance_status (migration 058) in sync —
-- that column was added there as a stub specifically for a slice like
-- this one to fill in.
--
-- NOT in this migration (follow-on tickets):
--   - Role-gated write functions (port_calls' own write functions are
--     "authenticated only" too — see 058's note; tighten both together
--     once the role/permission model for financial actions is decided)
--   - Alert engine / notifications wiring, KPI materialized view,
--     exception report queries
--   - pg_cron scheduling of fn_calculate_billing for daily/extension runs
--   - QuickBooks export (see qbo_invoices — a distinct, separate table;
--     no relation to berth billing in this slice)
--   - Statements of account, recurring invoices, tariff import, contract
--     renewal automation

-- ---------------------------------------------------------------------
-- 1. Reference data: marinas & berths
-- ---------------------------------------------------------------------

create table if not exists public.marinas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  location    text,
  org_id      uuid references public.organisations(org_id),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.berths (
  id            uuid primary key default gen_random_uuid(),
  marina_id     uuid not null references public.marinas(id),
  berth_number  text not null,
  max_loa_m     numeric(6,2),
  status        text not null default 'available'
                check (status in ('available', 'occupied', 'maintenance', 'reserved')),
  created_at    timestamptz not null default now(),
  unique (marina_id, berth_number)
);

-- ---------------------------------------------------------------------
-- 2. Berth occupancy — the core transactional record
-- ---------------------------------------------------------------------

create table if not exists public.berth_occupancies (
  id                    uuid primary key default gen_random_uuid(),
  berth_id              uuid not null references public.berths(id),
  vessel_id             uuid not null references public.yachts(id),
  customer_org_id       uuid not null references public.organisations(org_id),
  port_call_id          uuid references public.port_calls(id),

  arrival_at            timestamptz not null,
  expected_departure_at timestamptz,
  actual_departure_at   timestamptz,

  daily_rate            numeric(12,2),
  monthly_rate          numeric(12,2),
  currency              text not null default 'AED',
  billing_frequency     text not null default 'daily'
                        check (billing_frequency in ('daily', 'monthly')),
  contract_reference    text,
  discount_pct          numeric(5,2) not null default 0,
  vat_treatment         text not null default 'standard'
                        check (vat_treatment in ('standard', 'zero_rated', 'exempt')),
  purchase_order        text,

  status                text not null default 'occupied'
                        check (status in ('occupied', 'ready_for_invoice', 'invoiced', 'closed')),

  created_by            uuid references public.user_profiles(user_id),
  created_at            timestamptz not null default now(),

  constraint chk_berth_occupancy_rate_present check (daily_rate is not null or monthly_rate is not null),
  constraint chk_berth_occupancy_departure_after_arrival check (
    expected_departure_at is null or expected_departure_at >= arrival_at
  )
);

create index if not exists idx_berth_occupancies_berth on public.berth_occupancies(berth_id);
create index if not exists idx_berth_occupancies_status on public.berth_occupancies(status);
create index if not exists idx_berth_occupancies_vessel on public.berth_occupancies(vessel_id);
create index if not exists idx_berth_occupancies_port_call on public.berth_occupancies(port_call_id);

comment on table public.berth_occupancies is
  'One row per vessel berth stay. Every billing line and invoice traces
   back to a row here. port_call_id links to the Agency Module''s Port
   Calls slice (public.port_calls) when this stay is tied to a tracked
   arrival — nullable because not every berth stay originates from a
   Port Call record in this slice.';

-- ---------------------------------------------------------------------
-- 3. Billing lines (write-once — generated only via fn_calculate_billing)
-- ---------------------------------------------------------------------

create table if not exists public.berth_billing_lines (
  id                uuid primary key default gen_random_uuid(),
  occupancy_id      uuid not null references public.berth_occupancies(id),
  period_start      date not null,
  period_end        date not null,
  calculation_type  text not null
                    check (calculation_type in ('daily', 'monthly', 'prorated', 'extension', 'berth_change', 'final')),

  base_amount       numeric(12,2) not null,
  discount_amount   numeric(12,2) not null default 0,
  vat_amount        numeric(12,2) not null default 0,
  total_amount      numeric(12,2) not null,
  currency          text not null,

  calculated_at     timestamptz not null default now(),
  calculated_by     text not null default 'system'
);

create index if not exists idx_berth_billing_lines_occupancy on public.berth_billing_lines(occupancy_id);

create or replace function public.fn_prevent_billing_line_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'berth_billing_lines is write-once: % not permitted', tg_op;
end;
$$;

drop trigger if exists trg_billing_lines_no_update on public.berth_billing_lines;
create trigger trg_billing_lines_no_update
  before update or delete on public.berth_billing_lines
  for each row execute function public.fn_prevent_billing_line_mutation();

-- ---------------------------------------------------------------------
-- 4. Invoices & invoice lines
--    (named berth_invoices / berth_invoice_lines — distinct from
--    public.qbo_invoices, which is the separate QuickBooks sync table)
-- ---------------------------------------------------------------------

create table if not exists public.berth_invoices (
  id                uuid primary key default gen_random_uuid(),
  occupancy_id      uuid not null references public.berth_occupancies(id),
  customer_org_id   uuid not null references public.organisations(org_id),
  invoice_number    text unique,

  status            text not null default 'draft'
                    check (status in ('draft', 'pending_approval', 'approved', 'sent', 'paid', 'closed')),

  subtotal          numeric(12,2) not null default 0,
  vat_amount        numeric(12,2) not null default 0,
  total_amount      numeric(12,2) not null default 0,
  currency          text not null,

  created_at        timestamptz not null default now(),
  approved_by       uuid references public.user_profiles(user_id),
  approved_at       timestamptz,
  sent_at           timestamptz,
  paid_at           timestamptz,
  closed_at         timestamptz
);

create index if not exists idx_berth_invoices_occupancy on public.berth_invoices(occupancy_id);
create index if not exists idx_berth_invoices_status on public.berth_invoices(status);

create table if not exists public.berth_invoice_lines (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.berth_invoices(id) on delete cascade,
  billing_line_id   uuid not null references public.berth_billing_lines(id),
  description       text not null,
  amount            numeric(12,2) not null
);

-- ---------------------------------------------------------------------
-- 5. Supplier invoices (the marina's invoice to us)
-- ---------------------------------------------------------------------

create table if not exists public.berth_supplier_invoices (
  id                      uuid primary key default gen_random_uuid(),
  marina_id               uuid not null references public.marinas(id),
  occupancy_id            uuid references public.berth_occupancies(id),
  supplier_invoice_number text not null,
  amount                  numeric(12,2) not null,
  currency                text not null,
  due_date                date not null,
  payment_status          text not null default 'unpaid'
                          check (payment_status in ('unpaid', 'paid', 'overdue')),
  cost_centre             text,
  received_at             timestamptz not null default now(),
  paid_at                 timestamptz,
  unique (marina_id, supplier_invoice_number)
);

-- ---------------------------------------------------------------------
-- 6. Audit log (write-once, same pattern as port_call_audit_log)
-- ---------------------------------------------------------------------

create table if not exists public.berth_billing_audit_log (
  id             uuid primary key default gen_random_uuid(),
  occupancy_id   uuid not null references public.berth_occupancies(id) on delete cascade,
  action         text not null,
  snapshot_data  jsonb not null,
  performed_by   uuid references public.user_profiles(user_id),
  performed_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. FUNCTIONS (SECURITY DEFINER — all writes go through these)
-- ---------------------------------------------------------------------

-- fn_assign_berth: records arrival, opens the occupancy, marks the berth
-- occupied. Authenticated-only in this slice (see file header note).
create or replace function public.fn_assign_berth(
  p_berth_id              uuid,
  p_vessel_id             uuid,
  p_customer_org_id       uuid,
  p_port_call_id          uuid,
  p_arrival_at            timestamptz,
  p_expected_departure_at timestamptz,
  p_daily_rate            numeric,
  p_monthly_rate          numeric,
  p_currency              text,
  p_billing_frequency     text,
  p_contract_reference    text,
  p_discount_pct          numeric,
  p_vat_treatment         text,
  p_purchase_order        text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_by uuid := auth.uid();
  v_occupancy_id uuid;
  v_berth_status text;
begin
  if v_created_by is null then
    raise exception 'Authentication required';
  end if;

  select status into v_berth_status from public.berths where id = p_berth_id for update;
  if v_berth_status is null then
    raise exception 'fn_assign_berth: berth % not found', p_berth_id;
  elsif v_berth_status = 'occupied' then
    raise exception 'fn_assign_berth: berth % is already occupied', p_berth_id;
  end if;

  insert into public.berth_occupancies (
    berth_id, vessel_id, customer_org_id, port_call_id, arrival_at, expected_departure_at,
    daily_rate, monthly_rate, currency, billing_frequency, contract_reference,
    discount_pct, vat_treatment, purchase_order, created_by
  ) values (
    p_berth_id, p_vessel_id, p_customer_org_id, p_port_call_id, p_arrival_at, p_expected_departure_at,
    p_daily_rate, p_monthly_rate, coalesce(p_currency, 'AED'), coalesce(p_billing_frequency, 'daily'),
    p_contract_reference, coalesce(p_discount_pct, 0), coalesce(p_vat_treatment, 'standard'),
    p_purchase_order, v_created_by
  ) returning id into v_occupancy_id;

  update public.berths set status = 'occupied' where id = p_berth_id;

  insert into public.berth_billing_audit_log (occupancy_id, action, snapshot_data, performed_by)
  values (v_occupancy_id, 'berth_assigned', jsonb_build_object(
    'berth_id', p_berth_id, 'vessel_id', p_vessel_id, 'customer_org_id', p_customer_org_id
  ), v_created_by);

  return v_occupancy_id;
end;
$$;

revoke all on function public.fn_assign_berth from public;
revoke execute on function public.fn_assign_berth from anon;
grant execute on function public.fn_assign_berth to authenticated;

-- fn_calculate_billing: computes charges for a period and writes a
-- billing line. Not exposed to the client (no grant to authenticated) —
-- called only from fn_record_departure in this slice, and intended for
-- a future pg_cron job (which runs with elevated privilege, bypassing
-- grants). "No manual calculation" per the original brief.
create or replace function public.fn_calculate_billing(
  p_occupancy_id     uuid,
  p_period_start     date,
  p_period_end       date,
  p_calculation_type text default 'daily'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_occ record;
  v_days int;
  v_base numeric(12,2);
  v_discount numeric(12,2);
  v_vat numeric(12,2);
  v_total numeric(12,2);
  v_billing_line_id uuid;
begin
  select * into v_occ from public.berth_occupancies where id = p_occupancy_id;
  if v_occ is null then
    raise exception 'fn_calculate_billing: occupancy % not found', p_occupancy_id;
  end if;

  v_days := (p_period_end - p_period_start) + 1;

  if v_occ.billing_frequency = 'monthly' then
    v_base := round(
      (v_occ.monthly_rate / extract(day from (date_trunc('month', p_period_start)
        + interval '1 month - 1 day'))) * v_days,
      2
    );
  else
    v_base := round(v_occ.daily_rate * v_days, 2);
  end if;

  v_discount := round(v_base * (v_occ.discount_pct / 100), 2);

  v_vat := case v_occ.vat_treatment
    when 'standard' then round((v_base - v_discount) * 0.05, 2)  -- UAE VAT 5%
    else 0
  end;

  v_total := (v_base - v_discount) + v_vat;

  insert into public.berth_billing_lines (
    occupancy_id, period_start, period_end, calculation_type,
    base_amount, discount_amount, vat_amount, total_amount, currency,
    calculated_by
  ) values (
    p_occupancy_id, p_period_start, p_period_end, p_calculation_type,
    v_base, v_discount, v_vat, v_total, v_occ.currency,
    'system'
  ) returning id into v_billing_line_id;

  update public.berth_occupancies
    set status = 'ready_for_invoice'
    where id = p_occupancy_id and status = 'occupied';

  return v_billing_line_id;
end;
$$;

revoke all on function public.fn_calculate_billing from public;
revoke execute on function public.fn_calculate_billing from anon;
revoke execute on function public.fn_calculate_billing from authenticated;

-- fn_generate_draft_invoice: rolls up unbilled billing lines for an
-- occupancy into a draft invoice. Keeps port_calls.finance_status in
-- sync when this occupancy is tied to a Port Call.
create or replace function public.fn_generate_draft_invoice(
  p_occupancy_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_occ record;
  v_performed_by uuid := auth.uid();
  v_invoice_id uuid;
  v_subtotal numeric(12,2);
  v_vat numeric(12,2);
  v_total numeric(12,2);
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;

  select * into v_occ from public.berth_occupancies where id = p_occupancy_id;
  if v_occ is null then
    raise exception 'fn_generate_draft_invoice: occupancy % not found', p_occupancy_id;
  end if;

  select coalesce(sum(total_amount - vat_amount), 0), coalesce(sum(vat_amount), 0),
         coalesce(sum(total_amount), 0)
    into v_subtotal, v_vat, v_total
    from public.berth_billing_lines bl
    where bl.occupancy_id = p_occupancy_id
      and not exists (
        select 1 from public.berth_invoice_lines il where il.billing_line_id = bl.id
      );

  if v_total = 0 then
    raise exception 'fn_generate_draft_invoice: no unbilled billing lines for occupancy %', p_occupancy_id;
  end if;

  insert into public.berth_invoices (occupancy_id, customer_org_id, subtotal, vat_amount, total_amount, currency)
  values (p_occupancy_id, v_occ.customer_org_id, v_subtotal, v_vat, v_total, v_occ.currency)
  returning id into v_invoice_id;

  insert into public.berth_invoice_lines (invoice_id, billing_line_id, description, amount)
  select v_invoice_id, bl.id,
         format('Berth charge %s to %s (%s)', bl.period_start, bl.period_end, bl.calculation_type),
         bl.total_amount
  from public.berth_billing_lines bl
  where bl.occupancy_id = p_occupancy_id
    and not exists (select 1 from public.berth_invoice_lines il where il.billing_line_id = bl.id);

  update public.berth_occupancies set status = 'invoiced' where id = p_occupancy_id;

  if v_occ.port_call_id is not null then
    update public.port_calls
      set finance_status = 'invoiced'
      where id = v_occ.port_call_id
        and finance_status not in ('paid', 'on_hold');
  end if;

  insert into public.berth_billing_audit_log (occupancy_id, action, snapshot_data, performed_by)
  values (p_occupancy_id, 'draft_invoice_generated', jsonb_build_object(
    'invoice_id', v_invoice_id, 'total_amount', v_total
  ), v_performed_by);

  return v_invoice_id;
end;
$$;

revoke all on function public.fn_generate_draft_invoice from public;
revoke execute on function public.fn_generate_draft_invoice from anon;
grant execute on function public.fn_generate_draft_invoice to authenticated;

-- fn_advance_invoice_status: enforces the linear status path
-- draft -> pending_approval -> approved -> sent -> paid -> closed.
-- No role gate yet (see file header note — matches port_calls' own
-- write functions, which are authenticated-only in this repo today).
create or replace function public.fn_advance_invoice_status(
  p_invoice_id uuid,
  p_new_status text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_performed_by uuid := auth.uid();
  v_current text;
  v_occupancy_id uuid;
  v_valid_next text[];
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;

  select status, occupancy_id into v_current, v_occupancy_id
    from public.berth_invoices where id = p_invoice_id for update;

  if v_current is null then
    raise exception 'fn_advance_invoice_status: invoice % not found', p_invoice_id;
  end if;

  v_valid_next := case v_current
    when 'draft' then array['pending_approval']
    when 'pending_approval' then array['approved']
    when 'approved' then array['sent']
    when 'sent' then array['paid']
    when 'paid' then array['closed']
    else array[]::text[]
  end;

  if not (p_new_status = any(v_valid_next)) then
    raise exception 'fn_advance_invoice_status: cannot move % -> %', v_current, p_new_status;
  end if;

  update public.berth_invoices set
    status = p_new_status,
    invoice_number = case when p_new_status = 'approved' and invoice_number is null
                          then 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || substr(id::text, 1, 6)
                          else invoice_number end,
    approved_by = case when p_new_status = 'approved' then v_performed_by else approved_by end,
    approved_at = case when p_new_status = 'approved' then now() else approved_at end,
    sent_at     = case when p_new_status = 'sent' then now() else sent_at end,
    paid_at     = case when p_new_status = 'paid' then now() else paid_at end,
    closed_at   = case when p_new_status = 'closed' then now() else closed_at end
  where id = p_invoice_id;

  if p_new_status = 'paid' then
    update public.port_calls pc
      set finance_status = 'paid'
      from public.berth_occupancies bo
      where bo.id = v_occupancy_id
        and pc.id = bo.port_call_id;
  end if;

  insert into public.berth_billing_audit_log (occupancy_id, action, snapshot_data, performed_by)
  values (v_occupancy_id, 'invoice_status_advanced', jsonb_build_object(
    'invoice_id', p_invoice_id, 'from_status', v_current, 'to_status', p_new_status
  ), v_performed_by);
end;
$$;

revoke all on function public.fn_advance_invoice_status from public;
revoke execute on function public.fn_advance_invoice_status from anon;
grant execute on function public.fn_advance_invoice_status to authenticated;

-- fn_record_departure: closes the occupancy, frees the berth, triggers a
-- final billing calculation for any remaining unbilled days.
create or replace function public.fn_record_departure(
  p_occupancy_id uuid,
  p_actual_departure_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_performed_by uuid := auth.uid();
  v_occ record;
  v_last_billed_date date;
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;

  select * into v_occ from public.berth_occupancies where id = p_occupancy_id for update;
  if v_occ is null then
    raise exception 'fn_record_departure: occupancy % not found', p_occupancy_id;
  end if;

  select max(period_end) into v_last_billed_date
    from public.berth_billing_lines where occupancy_id = p_occupancy_id;

  if v_last_billed_date is null or v_last_billed_date < p_actual_departure_at::date then
    perform public.fn_calculate_billing(
      p_occupancy_id,
      coalesce(v_last_billed_date + 1, v_occ.arrival_at::date),
      p_actual_departure_at::date,
      'final'
    );
  end if;

  update public.berth_occupancies
    set actual_departure_at = p_actual_departure_at,
        status = 'closed'
    where id = p_occupancy_id;

  update public.berths set status = 'available' where id = v_occ.berth_id;

  insert into public.berth_billing_audit_log (occupancy_id, action, snapshot_data, performed_by)
  values (p_occupancy_id, 'departure_recorded', jsonb_build_object(
    'actual_departure_at', p_actual_departure_at
  ), v_performed_by);
end;
$$;

revoke all on function public.fn_record_departure from public;
revoke execute on function public.fn_record_departure from anon;
grant execute on function public.fn_record_departure to authenticated;

-- ---------------------------------------------------------------------
-- 8. Resolver view — sole source for the live dashboard
--    (security_invoker explicit — PG15+ views default to running as the
--    view owner otherwise, which would silently bypass RLS; same fix as
--    062 applied to v_inward_clearance_active)
-- ---------------------------------------------------------------------

create or replace view public.v_berth_billing_dashboard
with (security_invoker = true) as
select
  bo.id                                                   as occupancy_id,
  y.vessel_name                                            as vessel,
  co.name                                                  as client,
  m.name                                                   as marina,
  b.berth_number                                           as berth,
  bo.port_call_id                                          as port_call_id,
  bo.arrival_at                                            as arrival,
  bo.actual_departure_at                                   as departure,
  coalesce(bo.daily_rate, bo.monthly_rate)                 as rate,
  bo.billing_frequency                                     as billing_period,
  (coalesce(bo.actual_departure_at, now())::date - bo.arrival_at::date) + 1
                                                            as days_occupied,
  coalesce(sum(bl.total_amount), 0)                        as revenue_earned,
  bool_or(inv.id is not null)                              as invoice_raised,
  bool_or(inv.status in ('sent', 'paid', 'closed'))        as invoice_sent,
  bool_or(inv.status = 'paid')                             as client_paid,
  bool_or(si.id is not null)                               as supplier_invoice_received,
  bool_or(si.payment_status = 'paid')                      as supplier_paid,
  coalesce(sum(inv.total_amount), 0)
    - coalesce(sum(case when inv.status = 'paid' then inv.total_amount else 0 end), 0)
                                                            as outstanding_balance,
  coalesce(sum(inv.total_amount), 0) - coalesce(sum(si.amount), 0)
                                                            as margin,
  max(now()::date - inv.created_at::date)                  as age_of_invoice_days,
  p.display_name                                            as responsible_team_member
from public.berth_occupancies bo
join public.berths b on b.id = bo.berth_id
join public.marinas m on m.id = b.marina_id
join public.yachts y on y.id = bo.vessel_id
join public.organisations co on co.org_id = bo.customer_org_id
left join public.berth_billing_lines bl on bl.occupancy_id = bo.id
left join public.berth_invoices inv on inv.occupancy_id = bo.id
left join public.berth_supplier_invoices si on si.occupancy_id = bo.id
left join public.user_profiles p on p.user_id = bo.created_by
group by bo.id, y.vessel_name, co.name, m.name, b.berth_number, bo.port_call_id, bo.arrival_at,
         bo.actual_departure_at, bo.daily_rate, bo.monthly_rate, bo.billing_frequency,
         p.display_name;

comment on view public.v_berth_billing_dashboard is
  'Sole source for the Berth Billing dashboard. Do not query
   berth_occupancies/berth_invoices/etc directly from the frontend —
   same rule as v_inward_clearance_active for Port Calls.';

-- ---------------------------------------------------------------------
-- 9. RLS
-- ---------------------------------------------------------------------

alter table public.marinas enable row level security;
alter table public.berths enable row level security;
alter table public.berth_occupancies enable row level security;
alter table public.berth_billing_lines enable row level security;
alter table public.berth_invoices enable row level security;
alter table public.berth_invoice_lines enable row level security;
alter table public.berth_supplier_invoices enable row level security;
alter table public.berth_billing_audit_log enable row level security;

create policy marinas_select on public.marinas
  for select using (auth.role() = 'authenticated');

create policy berths_select on public.berths
  for select using (auth.role() = 'authenticated');

create policy berth_occupancies_select on public.berth_occupancies
  for select using (auth.role() = 'authenticated');

create policy berth_billing_lines_select on public.berth_billing_lines
  for select using (auth.role() = 'authenticated');

create policy berth_invoices_select on public.berth_invoices
  for select using (auth.role() = 'authenticated');

create policy berth_invoice_lines_select on public.berth_invoice_lines
  for select using (auth.role() = 'authenticated');

create policy berth_supplier_invoices_select on public.berth_supplier_invoices
  for select using (auth.role() = 'authenticated');

create policy berth_billing_audit_log_select on public.berth_billing_audit_log
  for select using (auth.role() = 'authenticated');

-- No insert/update/delete policies on any of the above — all mutation
-- goes through the SECURITY DEFINER functions in section 7, which run
-- with elevated privilege and perform their own auth.uid() checks.
