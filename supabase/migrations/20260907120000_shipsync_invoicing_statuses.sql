-- Local Packages: invoicing statuses and an invoice number.
--
-- Asked for by the logistics team: a package that has been delivered but not yet
-- invoiced needs to be distinguishable from one that is fully closed off, and the
-- invoice number itself needs somewhere to live so it can be seen and searched on
-- the Local Packages list.
--
--   Delivered - TBI  (delivered_tbi) -- delivered, To Be Invoiced
--   Completed        (completed)     -- invoice raised, nothing outstanding
--
-- Same vocabulary the Import board already uses for the equivalent Monday
-- labels, so the two tabs read the same way.
--
-- Idempotent: the constraint is dropped and recreated, and the column is added
-- only if it isn't already there.

alter table public.shipsync_packages
  add column if not exists invoice_no text;

alter table public.shipsync_packages
  drop constraint if exists shipsync_packages_status_check;

alter table public.shipsync_packages
  add constraint shipsync_packages_status_check
  check (status = any (array[
    'in_office'::text,
    'in_storage'::text,
    'assigned'::text,
    'out_for_delivery'::text,
    'delivered'::text,
    'delivered_tbi'::text,
    'completed'::text,
    'to_collect'::text,
    'collected'::text,
    'refused'::text
  ]));

comment on column public.shipsync_packages.invoice_no is
  'Invoice number raised for this package. Set on the Local Packages list, by row or in bulk.';
