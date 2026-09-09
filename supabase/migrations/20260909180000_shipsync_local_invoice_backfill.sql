-- Local Packages: fill in invoice numbers Monday already holds.
--
-- Jonathan sent a spreadsheet of Local packages with their invoice numbers and
-- asked for them to be applied. The spreadsheet is a Monday export — and it turns
-- out the Monday Local board's own "Invoice No." column has been arriving with
-- every hourly sync all along, stored verbatim under extra.monday and never mapped
-- to a real field. 247 packages carry one there; 234 of those have a blank
-- invoice_no in Polaris. The office has been re-keying numbers Polaris was
-- already receiving.
--
-- The sync maps the column from now on (same commit). This is the one-off
-- catch-up for everything already synced.
--
-- Fills blanks only. A number typed into Polaris by hand is left exactly as it is,
-- even where Monday disagrees — that is a question for a person, not a script.
-- Monday's "New item" is its untouched-cell placeholder, not an invoice number.
--
-- Idempotent: only rows with no invoice_no are touched.

update public.shipsync_packages
   set invoice_no = extra->'monday'->>'Invoice No.',
       updated_at = now()
 where (local_import is null or local_import = 'Local')
   and invoice_no is null
   and coalesce(extra->'monday'->>'Invoice No.', '') not in ('', 'New item');
