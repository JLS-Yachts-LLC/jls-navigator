-- Anchor → Forms: where the signature goes on each form's PDF.
--
-- "Send for signature" on a form created the e-Sign document with no signature
-- position, so the signer's signature only ever went on the certificate page —
-- Mike's signature on the DMA Notice of Departure (DOC-0017, 23 Oct 2026)
-- never reached the form's "Stamp & Signature" box.
--
-- The spot is now worked out when the PDF is built (the DMA box, or an
-- in-house form's [[signature]] spot) and kept here; "Send for signature" and
-- the approval chain's signatory stamp both use it. Shape as
-- esign_documents.signature_fields: [{ page, x, y, role, label }], x/y the
-- centre as fractions of the page from the top-left. [] = no known spot.
-- Null = built before this column; api.anchor-forms works it out again.

alter table public.anchor_form_submissions
  add column if not exists signature_fields jsonb;
