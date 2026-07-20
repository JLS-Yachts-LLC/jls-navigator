-- Sales Order → Prof Inv registry: one row per quotation that has had a
-- "Prof Inv NNNN-YY Client" document generated (trigger = quotation marked
-- Accepted when converted to a Sales Order). Provides the year-scoped counter
-- (unique year+prof_no makes racing allocations fail loudly and retry) and
-- idempotency (estimate pk = generate once per quotation).
create table if not exists public.qb_proforma_docs (
  estimate_qbo_id     text primary key,
  year                int  not null,
  prof_no             int  not null,
  doc_number          text not null,
  client_name         text,
  estimate_doc_number text,
  pdf_path            text,
  created_at          timestamptz not null default now(),
  unique (year, prof_no)
);
