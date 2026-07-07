-- Native QB Invoice PDF generator: per-invoice state so the attach-echo webhook
-- (our own upload bumping LastUpdatedTime) never triggers a regeneration loop.
-- (Applied live 2026-07-03; also registers the qb-invoice-pdf automation, OFF.)
create table if not exists public.qbo_invoice_pdf_state (
  qbo_id            text primary key,
  doc_number        text,
  last_updated_time text,
  attached_at       timestamptz,
  updated_at        timestamptz not null default now()
);
alter table public.qbo_invoice_pdf_state enable row level security;
drop policy if exists staff_read on public.qbo_invoice_pdf_state;
create policy staff_read on public.qbo_invoice_pdf_state
  for select to authenticated using (not public.is_portal_captain());
