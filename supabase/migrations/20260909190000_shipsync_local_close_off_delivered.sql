-- Local Packages: close off delivered packages as Completed.
--
-- Asked for by Jonathan (logistics), 9 Sep 2026, in two parts:
--   1. Every delivered package that has an invoice number -> Completed.
--   2. Every delivered package with NO invoice number, delivered before
--      1 September 2026 -> Completed as well. (Anything delivered from 1 Sept on
--      with no invoice is left as Delivered: it is still in the invoicing queue.)
--
-- He had been doing this by hand and watching it undo itself: the hourly Monday
-- sync reset every Monday-linked row to 'delivered' on each run. That is fixed in
-- d9892a20 (live 14:33 on 9 Sep), so what this sets will now hold.
--
-- Every row's previous status is recorded first in
-- shipsync_status_closeoff_log, so the whole thing can be reversed if the rule
-- turns out to be wrong for any of them.
--
-- Idempotent: only rows still at 'delivered' are touched.

create table if not exists public.shipsync_status_closeoff_log (
  package_id  uuid primary key,
  barcode     text,
  old_status  text not null,
  new_status  text not null,
  reason      text not null,
  changed_at  timestamptz not null default now()
);

insert into public.shipsync_status_closeoff_log (package_id, barcode, old_status, new_status, reason)
select id, barcode, status, 'completed',
       case when invoice_no is not null then 'invoiced' else 'delivered before 2026-09-01, no invoice' end
from public.shipsync_packages
where (local_import is null or local_import = 'Local')
  and status = 'delivered'
  and (invoice_no is not null or delivered_at < '2026-09-01')
on conflict (package_id) do nothing;

update public.shipsync_packages p
   set status = 'completed',
       updated_at = now()
from public.shipsync_status_closeoff_log l
where p.id = l.package_id
  and p.status = 'delivered';
