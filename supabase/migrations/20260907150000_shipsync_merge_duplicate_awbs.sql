-- Merge the Import/Transit shipments recorded twice under one AWB.
--
-- Two separate causes put them there:
--
--  1. The Monday sync used to match only on its own item id, so a shipment the
--     Power App had already scanned in was inserted again rather than merged.
--     Fixed going forward in a9c975db; this clears the backlog it left.
--  2. Two SharePoint pulls overlapping (a list webhook landing while the
--     5-minute cron is mid-pull) can both see the same list item as new and both
--     insert it. Rare -- two shipments on 2026-09-07, 150ms apart, same
--     sp_item_id. The unique index that closes that race off for good is a
--     SEPARATE migration, deliberately: it has to run after this one, and a
--     failure to create it must not roll back the merge (which is what happened
--     on the first attempt, when the two were in one file and one transaction).
--
-- A naive delete would not have worked: whichever row still holds the upstream
-- link gets recreated by the next sync. So the surviving row inherits BOTH links
-- (Monday's item id and SharePoint's), and both syncs then converge on it.
--
-- Pairs where BOTH rows carry a Monday item id are LEFT ALONE (4 of them). Those
-- are two genuine board entries sharing an AWB — duplication in Monday itself,
-- not something to resolve by deleting one of ours.
--
-- Reversible: every removed row is kept verbatim in
-- shipsync_duplicate_merge_backup, and the pairing is kept in
-- shipsync_dup_merge_plan.
--
-- Idempotent: the plan is only built for AWBs that still have more than one
-- row, so a second run finds nothing left to do.

-- ── 1. Work out the pairs, once, so update and delete can't disagree ─────────

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
  where local_import in ('Import', 'Transit') and coalesce(barcode, '') <> ''
  group by barcode
  -- Two OR MORE: one AWB turned up with three rows (the overlapping-pull race
  -- can fire more than once), and an exact-pair rule silently skipped it.
  having count(*) > 1
),
ranked as (
  select
    p.id, p.barcode,
    count(*) filter (where coalesce(p.extra->>'monday_item_id', '') <> '')
      over (partition by p.barcode) as monday_rows,
    -- The Monday-linked row survives: it is the Import board's record, and the
    -- hourly sync would recreate it anyway. Failing that, the scanned row.
    row_number() over (
      partition by p.barcode
      order by (coalesce(p.extra->>'monday_item_id', '') <> '') desc,
               (coalesce(p.extra->>'sp_item_id', '') <> '') desc,
               p.created_at asc
    ) as rn
  from public.shipsync_packages p
  join dupes using (barcode)
  where p.local_import in ('Import', 'Transit')
)
insert into public.shipsync_dup_merge_plan (barcode, keep_id, drop_id)
select k.barcode, k.id, l.id
from ranked k
join ranked l on l.barcode = k.barcode and l.rn > 1
where k.rn = 1 and k.monday_rows < 2
on conflict (drop_id) do nothing;

-- ── 2. Keep a verbatim copy of what is about to go ──────────────────────────

insert into public.shipsync_duplicate_merge_backup (drop_id, kept_id, row_data)
select pl.drop_id, pl.keep_id, to_jsonb(p)
from public.shipsync_dup_merge_plan pl
join public.shipsync_packages p on p.id = pl.drop_id
on conflict (drop_id) do nothing;

-- ── 3. Fold the dropped row's information into the survivor ─────────────────
-- The survivor wins every contest; the other row only fills what it left empty.
-- Status is the exception: a scan that reached a real state outranks the
-- 'in_office' the Monday sync stamps on every row it inserts.

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
  warehouse_zone        = coalesce(p.warehouse_zone, l.warehouse_zone),
  delivery_note_no      = coalesce(p.delivery_note_no, l.delivery_note_no),
  invoice_no            = coalesce(p.invoice_no, l.invoice_no),
  description           = coalesce(p.description, l.description),
  documents             = case when p.documents is null or jsonb_array_length(to_jsonb(p.documents)) = 0
                               then l.documents else p.documents end,
  received_at           = coalesce(p.received_at, l.received_at),
  sp_synced_at          = coalesce(p.sp_synced_at, l.sp_synced_at),
  -- The SharePoint link is the important one: without it the next pull would
  -- simply insert the scanned row again.
  extra                 = p.extra || case
                            when coalesce(p.extra->>'sp_item_id', '') = ''
                             and coalesce(l.extra->>'sp_item_id', '') <> ''
                            then jsonb_build_object('sp_item_id', l.extra->>'sp_item_id')
                            else '{}'::jsonb
                          end,
  updated_at            = now()
from public.shipsync_dup_merge_plan pl
join public.shipsync_packages l on l.id = pl.drop_id
where p.id = pl.keep_id;

-- ── 4. Remove the now-redundant rows ────────────────────────────────────────

delete from public.shipsync_packages p
using public.shipsync_dup_merge_plan pl
where p.id = pl.drop_id;
