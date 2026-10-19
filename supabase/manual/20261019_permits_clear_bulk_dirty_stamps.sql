-- Permits: let SharePoint win over Polaris's stale copies before the sync goes back on.
-- PREPARED 19 Oct 2026 — NOT RUN. Matt runs this (Supabase SQL editor), then re-runs the
-- dry run (Sync Centre → Permits), then decides whether to switch the 7 lists back on.
--
-- Why: a real permits sync PUSHES every row with sharepoint_dirty_at set over its
-- SharePoint item (and the pull skips those rows). 2,124 rows carry a dirty stamp from
-- the 3 Sep dedupe/backfill (15:09:58 and 15:21:46 UTC) — nobody edited them. Enabling
-- as-is would overwrite 46 days of hand edits in SharePoint with Polaris's old values.
-- Also bulk/system-only: 9 rows re-pointed from the merged duplicate "Socialista" to
-- ALTAVITA (7 Oct), and the status-only "Pending → Active" backfill (19 Oct 10:58 —
-- status is not a SharePoint column) and email-sent stamps.
--
-- Rule: clear the stamp unless a PERSON changed a column that goes to SharePoint since
-- the 3 Sep clean-up. That keeps the handful of real Polaris edits (5 DMA permits staff
-- completed in Polaris) queued to push, and rows with no SharePoint item (made in
-- Polaris) keep theirs so the sync can link them to their SharePoint twin or create them.
--
-- sharepoint_synced_at is stamped in the same UPDATE on purpose: mark_sharepoint_dirty()
-- re-sets the dirty flag on any update that leaves sharepoint_synced_at unchanged.

-- 1) Preview: what would be cleared vs kept.
with mapped(col) as (values
  ('holder_name'),('contact_email'),('yacht_id'),('notes'),('issuing_authority'),('requested_by'),
  ('issue_date'),('permit_number'),('expiry_date'),('jls_quotation_number'),('preferred_inspection_date')),
staff_edit as (
  select distinct a.resource_id as id
  from audit_log a
  where a.event_type = 'data_edit'
    and a.created_at > '2026-09-03 15:30+00'
    and coalesce(a.metadata->>'actor_kind', '') = 'user'
    and exists (select 1 from jsonb_object_keys(a.metadata->'changes') k join mapped m on m.col = k))
select
  p.sharepoint_item_id is not null                as linked_to_sharepoint,
  p.id in (select id from staff_edit)             as staff_edited,
  count(*)
from permits p
where p.sharepoint_dirty_at is not null
group by 1, 2
order by 1, 2;
-- Checked 19 Oct 12:40: linked & not staff-edited = 2,136 (→ cleared); linked & staff-edited = 5
-- (kept); not linked = 31 kept (made in Polaris; 7 are exit/entry, which has no list).

-- 2) Back up, then clear.
begin;

create table if not exists public.permits_dirty_backup_20261019 as
  select id, sharepoint_dirty_at, sharepoint_synced_at from public.permits where sharepoint_dirty_at is not null;
alter table public.permits_dirty_backup_20261019 enable row level security;
revoke all on public.permits_dirty_backup_20261019 from anon, authenticated;

with mapped(col) as (values
  ('holder_name'),('contact_email'),('yacht_id'),('notes'),('issuing_authority'),('requested_by'),
  ('issue_date'),('permit_number'),('expiry_date'),('jls_quotation_number'),('preferred_inspection_date')),
staff_edit as (
  select distinct a.resource_id as id
  from audit_log a
  where a.event_type = 'data_edit'
    and a.created_at > '2026-09-03 15:30+00'
    and coalesce(a.metadata->>'actor_kind', '') = 'user'
    and exists (select 1 from jsonb_object_keys(a.metadata->'changes') k join mapped m on m.col = k))
update public.permits p
set sharepoint_dirty_at = null,
    sharepoint_synced_at = now()
where p.sharepoint_dirty_at is not null
  and p.sharepoint_item_id is not null
  and p.id not in (select id from staff_edit);

-- Check before committing: should be ≈ 5 linked dirty rows left (+ the Polaris-made ones).
select sharepoint_item_id is not null as linked, count(*) from public.permits
where sharepoint_dirty_at is not null group by 1;

commit;

-- Undo (if ever needed):
-- update public.permits p set sharepoint_dirty_at = b.sharepoint_dirty_at, sharepoint_synced_at = b.sharepoint_synced_at
--   from public.permits_dirty_backup_20261019 b where b.id = p.id;
