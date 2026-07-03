-- Loop-guard state for native QBO document generation (port of n8n "QBO Logs").
-- Attaching a generated PDF/XLSX to a QBO document bumps its LastUpdatedTime and
-- fires another webhook - this table lets the worker recognise its own echoes.
create table if not exists public.qbo_doc_logs (
  id                       uuid primary key default gen_random_uuid(),
  doc_type                 text not null,
  doc_id                   text not null,
  doc_number               text,
  last_updated_time        text,
  del_last_updated_time    text,
  create_last_updated_time text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (doc_type, doc_id)
);
alter table public.qbo_doc_logs enable row level security;
-- service-role only (no policies): never client-visible.
