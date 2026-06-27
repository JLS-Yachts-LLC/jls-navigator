-- Synced cache of QBO documents (invoices, pro-formas, estimates) for the Finance module.
create table if not exists public.qbo_invoices (
  id            uuid primary key default gen_random_uuid(),
  qbo_id        text not null,
  doc_type      text not null,             -- invoice | proforma | estimate
  doc_number    text,
  txn_date      date,
  due_date      date,                       -- invoice due date / estimate expiry
  customer_ref  text,
  customer_name text,
  yacht_id      uuid references public.yachts(id) on delete set null,
  total_amt     numeric,
  balance       numeric,
  currency      text,
  status        text,                       -- Paid|Unpaid|Partial|Overdue (invoice) / TxnStatus (estimate)
  line_items    jsonb,
  pdf_path      text,
  pdf_synced_at timestamptz,
  raw           jsonb,
  synced_at     timestamptz not null default now(),
  unique (qbo_id, doc_type)
);
create index if not exists qbo_invoices_type_date_idx on public.qbo_invoices (doc_type, txn_date desc);
create index if not exists qbo_invoices_yacht_idx on public.qbo_invoices (yacht_id);
create index if not exists qbo_invoices_status_idx on public.qbo_invoices (status);

create table if not exists public.qbo_sync_state (
  id           int primary key default 1,
  last_run_at  timestamptz,
  last_full_at timestamptz,
  last_count   int,
  last_error   text
);
insert into public.qbo_sync_state (id) values (1) on conflict (id) do nothing;

alter table public.qbo_invoices enable row level security;
alter table public.qbo_sync_state enable row level security;
drop policy if exists qbo_invoices_auth on public.qbo_invoices;
create policy qbo_invoices_auth on public.qbo_invoices for all to authenticated using (true) with check (true);
drop policy if exists qbo_sync_state_auth on public.qbo_sync_state;
create policy qbo_sync_state_auth on public.qbo_sync_state for all to authenticated using (true) with check (true);
