-- Orbit 2 — two client-requested changes:
--
-- 1. EHS NOC Record needs a Status column (defaulting to "To be Invoiced", with
--    "Invoiced" the only other option) and an Invoice Number text column, so the
--    register can be split into All / To be Invoiced / Invoiced views.
--
-- 2. Remarks (not Team Comments — those stay a field-crew log) need to be
--    inline-editable by an Orbit 2 admin. The append-only design stands for
--    everyone else; `edited_at` records when an admin has corrected an entry,
--    so the log still shows that it happened rather than silently rewriting
--    history.

alter table public.orbit2_noc_records
  add column if not exists status text not null default 'To be Invoiced'
    check (status in ('To be Invoiced', 'Invoiced')),
  add column if not exists invoice_number text;

alter table public.orbit2_notes
  add column if not exists edited_at timestamptz;
