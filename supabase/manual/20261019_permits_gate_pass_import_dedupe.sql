-- Permits: remove the 5 Jun 2026 CSV-import copies of SharePoint-linked gate passes.
-- PREPARED 19 Oct 2026 — NOT RUN. Waiting for Matt's OK.
--
-- Why: 1,286 gate_pass rows have no SharePoint link (sharepoint_item_id and
-- sharepoint_list_name both null). All were created 2026-06-05 09:40 by
-- scripts/generate-all-new-permits-sql.mjs from a CSV export of the SharePoint
-- "Gate Pass" list, so most of them are the same pass as a row the sync later linked
-- (sharepoint_list_name = 'Gate Pass'). The sync leaves unlinked rows alone, so both
-- copies show on the Permits page.
--
-- Match rule: same trimmed permit_number, same holder (case/space-insensitive), and
-- the import's issue_date is exactly one day after the linked row's. The one-day gap
-- is the old SD-0017 bug (SharePoint dates read in UTC) on the LINKED row: the pass
-- number starts DDMMYY and agrees with the import's date on 1,103 of the 1,174 numbered
-- pairs and with the linked row's date on 0. Every number+date match is +1, never 0 or -1.
-- Holder is part of the key because one pass number can cover several people (group
-- passes), and SharePoint itself holds a few duplicated items, so a pair is not always 1:1.
--
-- Checked 19 Oct 2026 (re-run step 1 before running step 2):
--   1,177 pairs → 1,164 import rows duplicate 1,163 linked rows (removed).
--   122 import rows are NOT duplicates and stay:
--     55 whose number is on no linked row, 67 whose number is on a linked row but
--     2–17 days apart (different passes or later-edited items), and 1 same
--     number/vessel/date+1 with a different surname (MUHAMMAD AMIN SHARIF vs ARAIN) —
--     left for a person to judge.
--   No permit_expiry_alerts or yacht_activity_log rows point at the import rows.
--
-- What the import copy has that the linked row lacks — the CSV carried SharePoint
-- columns the sync config does not map:
--   "Save Only"          → status: import says active (submitted) on 577 linked rows where
--                          the linked row is the insert default 'pending'. MERGED
--                          (pending → active only; never downgrades).
--   "Gate Pass Duration" → dma_phase (One Day / One Week / One Month) on 1,133 linked rows
--                          where the linked row has none. MERGED (fill blanks only).
--   correct issue_date   → the linked row is a day early. FIXED to the import's date
--                          (what the next sync pull will write anyway, now that
--                          spDateOnly() is fixed — but the sync is off).
--   "Company" + "Port to Visit" → appended to notes as " | Company: … | Port: …".
--                          NOT merged (see optional step 2b): notes maps to SharePoint
--                          "Remarks", so the next pull would overwrite it where Remarks
--                          is filled, and a later staff edit would push it into Remarks.
--                          The full import row is kept in the backup table regardless.
--   yacht_id, document_url, email_sent_*, expiry_date, quotation, applied_by:
--     the import never has a value the linked row lacks (the linked row has extra
--     yacht_id on 418, expiry on 14). Nothing to carry.
--
-- The merge UPDATE stamps sharepoint_synced_at so mark_sharepoint_dirty() does NOT
-- queue 1,163 rows to be pushed over SharePoint, and keeps any existing dirty stamp
-- (none of the 1,163 were dirty on 19 Oct).

-- 1) Preview (read-only). Expect: pairs 1177, import_rows 1164, linked_rows 1163,
--    status_upgrades 577, dma_fill 1133, date_fix 1163, linked_dirty 0 (checked 19 Oct).
with imp as (
  select * from public.permits
  where permit_type = 'gate_pass' and sharepoint_item_id is null and sharepoint_list_name is null
), lnk as (
  select * from public.permits where sharepoint_list_name = 'Gate Pass'
), m as (
  select i.id as import_id, l.id as linked_id
  from imp i join lnk l
    on btrim(i.permit_number) = btrim(l.permit_number)
   and i.issue_date = l.issue_date + 1
   and regexp_replace(lower(btrim(i.holder_name)), '\s+', ' ', 'g')
     = regexp_replace(lower(btrim(l.holder_name)), '\s+', ' ', 'g')
)
select
  (select count(*) from m)                                    as pairs,
  (select count(distinct import_id) from m)                   as import_rows,
  (select count(distinct linked_id) from m)                   as linked_rows,
  (select count(*) from lnk where id in (select linked_id from m) and status = 'pending'
     and exists (select 1 from m join imp i on i.id = m.import_id
                 where m.linked_id = lnk.id and i.status = 'active'))       as status_upgrades,
  (select count(*) from lnk where id in (select linked_id from m) and dma_phase is null
     and exists (select 1 from m join imp i on i.id = m.import_id
                 where m.linked_id = lnk.id and i.dma_phase is not null))   as dma_fill,
  (select count(distinct linked_id) from m)                   as date_fix,
  (select count(*) from lnk where id in (select linked_id from m) and sharepoint_dirty_at is not null) as linked_dirty;

-- 2) Back up, merge, delete — one transaction; the checks raise and roll back on surprise.
begin;

-- 2a) Which import row duplicates which linked row (kept, so the clean-up is traceable).
create table public.permits_gp_import_dupe_map_20261019 as
with imp as (
  select * from public.permits
  where permit_type = 'gate_pass' and sharepoint_item_id is null and sharepoint_list_name is null
), lnk as (
  select * from public.permits where sharepoint_list_name = 'Gate Pass'
)
select i.id as import_id, l.id as linked_id
from imp i join lnk l
  on btrim(i.permit_number) = btrim(l.permit_number)
 and i.issue_date = l.issue_date + 1
 and regexp_replace(lower(btrim(i.holder_name)), '\s+', ' ', 'g')
   = regexp_replace(lower(btrim(l.holder_name)), '\s+', ' ', 'g');

-- Full copy of every import row about to be deleted.
create table public.permits_gp_import_backup_20261019 as
  select * from public.permits
  where id in (select import_id from public.permits_gp_import_dupe_map_20261019);

-- Pre-merge values of the linked rows this changes.
create table public.permits_gp_linked_backup_20261019 as
  select id, status, dma_phase, issue_date, updated_at, sharepoint_synced_at, sharepoint_dirty_at
  from public.permits
  where id in (select linked_id from public.permits_gp_import_dupe_map_20261019);

alter table public.permits_gp_import_dupe_map_20261019 enable row level security;
alter table public.permits_gp_import_backup_20261019   enable row level security;
alter table public.permits_gp_linked_backup_20261019   enable row level security;
revoke all on public.permits_gp_import_dupe_map_20261019 from anon, authenticated;
revoke all on public.permits_gp_import_backup_20261019   from anon, authenticated;
revoke all on public.permits_gp_linked_backup_20261019   from anon, authenticated;

comment on table public.permits_gp_import_backup_20261019 is
  'Full copy of the gate_pass rows from the 2026-06-05 CSV import that duplicated SharePoint-linked Gate Pass rows, deleted 2026-10-19. Map: permits_gp_import_dupe_map_20261019. Linked rows before the merge: permits_gp_linked_backup_20261019.';

do $$
declare n_pairs int; n_imp int; n_lnk int;
begin
  select count(*), count(distinct import_id), count(distinct linked_id)
    into n_pairs, n_imp, n_lnk from public.permits_gp_import_dupe_map_20261019;
  if n_pairs <> 1177 or n_imp <> 1164 or n_lnk <> 1163 then
    raise exception 'Match counts changed since 19 Oct (pairs %, import %, linked %) — re-check before running', n_pairs, n_imp, n_lnk;
  end if;
end $$;

-- 2b) Merge onto the linked row.
with agg as (
  select m.linked_id,
         bool_or(i.status = 'active')                                                     as any_active,
         (array_agg(i.dma_phase order by i.created_at, i.id)
            filter (where i.dma_phase is not null))[1]                                    as dma_phase,
         min(i.issue_date)                                                                as issue_date
  from public.permits_gp_import_dupe_map_20261019 m
  join public.permits i on i.id = m.import_id
  group by m.linked_id
)
update public.permits p
   set status               = case when p.status = 'pending' and a.any_active then 'active'::permit_status else p.status end,
       dma_phase            = coalesce(p.dma_phase, a.dma_phase),
       issue_date           = a.issue_date,
       -- stamping synced_at keeps mark_sharepoint_dirty() from queuing a push to SharePoint;
       -- re-setting dirty_at to its own value keeps any real pending edit queued.
       sharepoint_synced_at = now(),
       sharepoint_dirty_at  = p.sharepoint_dirty_at
  from agg a
 where p.id = a.linked_id;

-- OPTIONAL (only if Matt wants Company / Port visible on the linked rows): append the
-- import's " | Company: … | Port: …" tail to the linked notes. Caveat: notes is the
-- SharePoint "Remarks" column, so once the sync is back on, a pull rewrites notes to
-- Remarks wherever Remarks is filled, and a staff edit would push the tail into Remarks.
-- The better fix is mapping those SharePoint columns in the Gate Pass sync config.
--
-- with tail as (
--   select distinct on (m.linked_id) m.linked_id, substring(i.notes from '(Company: .*|Port: .*)$') as extra
--   from public.permits_gp_import_dupe_map_20261019 m join public.permits i on i.id = m.import_id
--   where i.notes ~ '(Company|Port): '
--   order by m.linked_id, i.created_at, i.id
-- )
-- update public.permits p
--    set notes = case when coalesce(btrim(p.notes), '') = '' then t.extra else p.notes || ' | ' || t.extra end,
--        sharepoint_synced_at = now(), sharepoint_dirty_at = p.sharepoint_dirty_at
--   from tail t
--  where p.id = t.linked_id and t.extra is not null and coalesce(p.notes, '') not like '%' || t.extra;

-- 2c) Remove the import duplicates.
delete from public.permits
 where id in (select import_id from public.permits_gp_import_dupe_map_20261019);

-- 2d) Verify before committing.
do $$
declare n_left int; n_unlinked int; n_dirty int; n_backup int;
begin
  select count(*) into n_left from public.permits
   where id in (select import_id from public.permits_gp_import_dupe_map_20261019);
  select count(*) into n_unlinked from public.permits
   where permit_type = 'gate_pass' and sharepoint_item_id is null and sharepoint_list_name is null;
  select count(*) into n_dirty from public.permits p
   join public.permits_gp_linked_backup_20261019 b on b.id = p.id
   where p.sharepoint_dirty_at is distinct from b.sharepoint_dirty_at;
  select count(*) into n_backup from public.permits_gp_import_backup_20261019;
  if n_left <> 0 or n_backup <> 1164 or n_dirty <> 0 then
    raise exception 'Verify failed: % import dupes left, % backed up, % linked rows changed dirty state', n_left, n_backup, n_dirty;
  end if;
  raise notice 'OK: 1164 removed, % unlinked gate passes remain (expect 122)', n_unlinked;
end $$;

commit;

-- Undo (if ever needed):
-- begin;
-- insert into public.permits select * from public.permits_gp_import_backup_20261019;
-- update public.permits p
--    set status = b.status, dma_phase = b.dma_phase, issue_date = b.issue_date,
--        sharepoint_synced_at = b.sharepoint_synced_at, sharepoint_dirty_at = b.sharepoint_dirty_at
--   from public.permits_gp_linked_backup_20261019 b where b.id = p.id;
-- -- (the update re-stamps sharepoint_dirty_at via the trigger only if synced_at is unchanged;
-- --  it is restored to the old value, which differs from now(), so dirty_at is taken from b)
-- commit;
