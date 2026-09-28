-- Yacht Shipments: the Monday "Export" board carries two columns the Import
-- board doesn't — "Cruising Permit Cancelled" and "P.O.C". They were captured
-- in extra.monday by the sync but had nowhere to land, so the Export tab never
-- showed them. Plain text, nullable, mirrored read-only from Monday.
alter table public.yacht_shipments
  add column if not exists cruising_permit_cancelled text,
  add column if not exists poc text;

comment on column public.yacht_shipments.cruising_permit_cancelled is
  'Export board only — Monday "Cruising Permit Cancelled" (e.g. In progress / NOT REQUIRED).';
comment on column public.yacht_shipments.poc is
  'Export board only — Monday "P.O.C" (point of contact / agent).';
