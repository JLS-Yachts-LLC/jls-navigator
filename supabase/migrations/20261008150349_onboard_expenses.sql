-- On board: Expenses, petty cash and charter APA.
--
--   onboard_cash_accounts  where money is held on board: petty cash, a crew card,
--                          a bank account, or a charter's APA (linked to the booking)
--   onboard_expenses       the ledger: money spent (expense), money received
--                          (funds_in — a top-up, or the APA paid by the charterer)
--                          and money handed back (return — APA balance to the guest)
--   onboard_budgets        the year's budget per cost category
--
-- Same isolation as the other On board tables: staff manage everything; a portal
-- login reads only its own vessel's rows from an MFA-verified session and never
-- writes directly — writes go through /api/portal/expenses with the service role.

create table if not exists public.onboard_cash_accounts (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  name text not null,
  kind text not null default 'petty_cash' check (kind in ('petty_cash', 'card', 'bank', 'apa')),
  currency text not null default 'EUR' check (currency in ('EUR', 'USD', 'AED', 'GBP')),
  holder_name text,
  charter_booking_id uuid references public.charter_bookings(id) on delete set null,
  opening_balance numeric not null default 0,
  low_balance numeric check (low_balance >= 0),
  archived boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists onboard_cash_accounts_yacht_idx on public.onboard_cash_accounts (yacht_id);
create index if not exists onboard_cash_accounts_charter_idx on public.onboard_cash_accounts (charter_booking_id) where charter_booking_id is not null;

create table if not exists public.onboard_expenses (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  account_id uuid not null references public.onboard_cash_accounts(id) on delete cascade,
  kind text not null default 'expense' check (kind in ('expense', 'funds_in', 'return')),
  amount numeric not null check (amount > 0),
  entry_date date not null default current_date,
  supplier text,
  description text,
  category text,
  department text check (department in ('galley', 'interior', 'bar', 'deck', 'engine', 'safety', 'other')),
  vat_amount numeric check (vat_amount >= 0),
  original_amount numeric check (original_amount > 0),
  original_currency text,
  reference text,
  receipt_scanned boolean not null default false,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists onboard_expenses_yacht_date_idx on public.onboard_expenses (yacht_id, entry_date desc);
create index if not exists onboard_expenses_account_idx on public.onboard_expenses (account_id);

create table if not exists public.onboard_budgets (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  category text not null,
  currency text not null default 'EUR' check (currency in ('EUR', 'USD', 'AED', 'GBP')),
  amount numeric not null check (amount >= 0),
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (yacht_id, year, category, currency)
);

drop trigger if exists onboard_cash_accounts_updated on public.onboard_cash_accounts;
create trigger onboard_cash_accounts_updated before update on public.onboard_cash_accounts
  for each row execute function public.set_updated_at();
drop trigger if exists onboard_expenses_updated on public.onboard_expenses;
create trigger onboard_expenses_updated before update on public.onboard_expenses
  for each row execute function public.set_updated_at();
drop trigger if exists onboard_budgets_updated on public.onboard_budgets;
create trigger onboard_budgets_updated before update on public.onboard_budgets
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['onboard_cash_accounts', 'onboard_expenses', 'onboard_budgets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists staff_manage on public.%I', t);
    execute format($p$create policy staff_manage on public.%I for all to authenticated
      using (not public.is_portal_captain()) with check (not public.is_portal_captain())$p$, t);
    execute format('drop policy if exists captain_select on public.%I', t);
    execute format($p$create policy captain_select on public.%I for select to authenticated
      using (public.is_portal_captain() and public.portal_aal2() and yacht_id in (select public.captain_yacht_ids()))$p$, t);
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

-- Receipts on expenses.
alter table public.portal_files drop constraint if exists portal_files_ref_table_check;
alter table public.portal_files add constraint portal_files_ref_table_check check (ref_table = any (array[
  'onboard_checklist_runs', 'ism_drills', 'pms_tasks', 'onboard_handover_notes',
  'onboard_tasks', 'onboard_inventory_items', 'onboard_expenses'
]));
