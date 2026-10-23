-- SD-0083 — Quotations in Anchor.
--
-- Staff upload a one-off quotation PDF on Anchor → Templates and send it to the
-- client to accept and sign. A quotation is an ordinary e-sign document (same
-- signing link, certificate and audit trail); `kind` tells the Quotations box
-- which documents are quotes, and switches the email and signing page wording
-- to "accept & sign". Existing documents stay 'document'.

alter table public.esign_documents
  add column if not exists kind text not null default 'document'
    check (kind in ('document', 'quotation'));

create index if not exists esign_documents_kind_idx
  on public.esign_documents (kind) where kind <> 'document';
