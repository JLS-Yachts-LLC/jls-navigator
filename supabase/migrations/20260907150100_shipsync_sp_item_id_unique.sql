-- One SharePoint list item can only ever own one package row.
--
-- Two SharePoint pulls can overlap — a list webhook arriving while the 5-minute
-- cron is mid-pull — and the sync has no lock between them, so both can see the
-- same list item as new and both insert it. That is how 1Z9552870462893398 and
-- 1Z9552870463618782 ended up doubled on 2026-09-07, 150ms apart, each pair
-- sharing an sp_item_id.
--
-- Rather than trying to make two Worker invocations coordinate, the database
-- refuses the second insert outright. The sync reports the row as an error
-- instead of quietly creating a duplicate, which is the failure mode we want.
--
-- Deliberately a SEPARATE migration from the merge that cleared the backlog:
-- when both were in one file, this index failing took the whole merge down with
-- it. Run 20260907150000 first — this cannot be created while any duplicate
-- sp_item_id remains.
--
-- Idempotent: if not exists.

create unique index if not exists shipsync_packages_sp_item_id_key
  on public.shipsync_packages ((extra->>'sp_item_id'))
  where coalesce(extra->>'sp_item_id', '') <> '';
