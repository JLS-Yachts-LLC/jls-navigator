-- Merge the Local packages recorded twice under one AWB.
--
-- Reported by Jonathan: "a lot of duplicates, ex 130201246824". That waybill has
-- two rows — one from Monday (item 3144930842, status completed) and one from a
-- ShipSync scan (SharePoint item 8822, status delivered). 141 waybills are in
-- that state, 284 rows in all.
--
-- Identical cause to the Import board's backlog, which 20260907150000 cleared:
-- the Local Monday sync matched only on Monday's own item id, so a package the
-- Power App had already scanned in was inserted again rather than merged. Fixed
-- going forward in the same commit as this migration; this clears the backlog.
--
-- Same approach, same reasoning, same safety net as the Import merge — reusing
-- its plan and backup tables so there is one place to look:
--
--   * A plain delete would not hold. Whichever row still carries the upstream
--     link is recreated by the next sync, so the survivor inherits BOTH links
--     (Monday's item id and SharePoint's) and the two syncs converge on it.
--   * The survivor wins every field contest; the dropped row only fills what it
--     left empty. Status is the exception: a real scanned state outranks the
--     'in_office' Monday reports when it simply has no Date Delivered yet.
--   * Rows where BOTH carry a Monday item id are LEFT ALONE — two genuine board
--     entries sharing a waybill is duplication in Monday, not here.
--   * Every removed row is kept verbatim in shipsync_duplicate_merge_backup,
--     paired in shipsync_dup_merge_plan.
--
-- Idempotent: the plan is only built for AWBs that still have more than one row.

create table if not exists public.shipsync_dup_merge_plan (
  barcode    text not null,
  keep_id    uuid not null,
  drop_id    uuid not null primary key,
  planned_at timestamptz not null default now()
);

create table if not exists public.shipsync_duplicate_merge_backup (
  drop_id      uuid primary key,
  kept_id      uuid not null,
  row_data     jsonb not null,
  backed_up_at timestamptz not null default now()
);

with dupes as (
  select barcode
  from public.shipsync_packages
  where (local_import is null or local_import = 'Local') and coalesce(barcode, '') <> ''
  group by barcode
  having count(*) > 1
),
ranked as (
  select
    p.id, p.barcode,
    count(*) filter (where coalesce(p.extra->>'monday_item_id', '') <> '')
      over (partition by p.barcode) as monday_rows,
    row_number() over (
      partition by p.barcode
      order by (coalesce(p.extra->>'monday_item_id', '') <> '') desc,
               (coalesce(p.extra->>'sp_item_id', '') <> '') desc,
               p.created_at asc
    ) as rn
  from public.shipsync_packages p
  join dupes using (barcode)
  where p.local_import is null or p.local_import = 'Local'
)
insert into public.shipsync_dup_merge_plan (barcode, keep_id, drop_id)
select k.barcode, k.id, l.id
from ranked k
join ranked l on l.barcode = k.barcode and l.rn > 1
where k.rn = 1 and k.monday_rows < 2
on conflict (drop_id) do nothing;

insert into public.shipsync_duplicate_merge_backup (drop_id, kept_id, row_data)
select pl.drop_id, pl.keep_id, to_jsonb(p)
from public.shipsync_dup_merge_plan pl
join public.shipsync_packages p on p.id = pl.drop_id
on conflict (drop_id) do nothing;

update public.shipsync_packages p set
  status                = case when p.status = 'in_office' and l.status <> 'in_office'
                               then l.status else p.status end,
  delivered_at          = coalesce(p.delivered_at, l.delivered_at),
  receiver_full_name    = coalesce(p.receiver_full_name, l.receiver_full_name),
  receiver_designation  = coalesce(p.receiver_designation, l.receiver_designation),
  receiver_email        = coalesce(p.receiver_email, l.receiver_email),
  signature_url         = coalesce(p.signature_url, l.signature_url),
  delivery_photo_url    = coalesce(p.delivery_photo_url, l.delivery_photo_url),
  item_photo_url        = coalesce(p.item_photo_url, l.item_photo_url),
  office_photo_url      = coalesce(p.office_photo_url, l.office_photo_url),
  scan_out_time         = coalesce(p.scan_out_time, l.scan_out_time),
  driver_scan_out_time  = coalesce(p.driver_scan_out_time, l.driver_scan_out_time),
  driver_id             = coalesce(p.driver_id, l.driver_id),
  delivery_note_id      = coalesce(p.delivery_note_id, l.delivery_note_id),
  warehouse_zone        = coalesce(p.warehouse_zone, l.warehouse_zone),
  delivery_note_no      = coalesce(p.delivery_note_no, l.delivery_note_no),
  invoice_no            = coalesce(p.invoice_no, l.invoice_no),
  description           = coalesce(p.description, l.description),
  package_owner         = coalesce(p.package_owner, l.package_owner),
  courier               = coalesce(p.courier, l.courier),
  documents             = case when p.documents is null or jsonb_array_length(to_jsonb(p.documents)) = 0
                               then l.documents else p.documents end,
  received_at           = coalesce(p.received_at, l.received_at),
  sp_synced_at          = coalesce(p.sp_synced_at, l.sp_synced_at),
  updated_at            = now()
from public.shipsync_dup_merge_plan pl
join public.shipsync_packages l on l.id = pl.drop_id
where p.id = pl.keep_id;

delete from public.shipsync_packages p
using public.shipsync_dup_merge_plan pl
where p.id = pl.drop_id;

-- The SharePoint link moves LAST, after the row that held it is gone.
-- shipsync_packages_sp_item_id_key is a plain (non-deferrable) unique index, so
-- copying the id onto the survivor while the original still existed tripped it
-- mid-transaction. Reading it back out of the backup avoids that entirely.
update public.shipsync_packages p
   set extra = p.extra || jsonb_build_object('sp_item_id', b.row_data->'extra'->>'sp_item_id'),
       updated_at = now()
from public.shipsync_duplicate_merge_backup b
where p.id = b.kept_id
  and coalesce(p.extra->>'sp_item_id', '') = ''
  and coalesce(b.row_data->'extra'->>'sp_item_id', '') <> '';
