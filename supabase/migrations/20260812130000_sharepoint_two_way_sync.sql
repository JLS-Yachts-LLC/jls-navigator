-- Two-way SharePoint sync: make in-app edits survive, and let removals land.
--
-- Three defects this addresses (diagnosed 2026-08-12):
--
-- 1. In-app edits were silently reverted. The push-back job runs hourly and only
--    pushes a row when updated_at > sharepoint_synced_at, but the inbound sync
--    runs every 15 minutes and rewrites BOTH timestamps (sharepoint_synced_at
--    explicitly, updated_at via the set_updated_at trigger). The pull therefore
--    reset the row's "needs pushing" state and overwrote the edited field with
--    the SharePoint value. Outbound almost never won the race.
--    → sharepoint_dirty_at records an in-app edit explicitly. It is set by a
--      trigger whenever a row changes WITHOUT the sync stamping
--      sharepoint_synced_at — i.e. only by app writes — and cleared once the
--      change has been pushed. The pull skips dirty rows until they are pushed.
--
-- 2. Rows created in Polaris were never pushed, because the push-back job
--    filtered to rows already carrying a sharepoint_item_id (a deliberate guard
--    against mass-creating thousands of historical records).
--    → The dirty flag replaces that guard: it starts null everywhere, so no
--      backfill is pushed, and only records actually touched from now on are
--      sent. Creation is then safe to allow.
--
-- 3. Removals in SharePoint never reached Polaris, so the app accumulated rows
--    forever (181 yachts against SharePoint's 136).
--    → archived_at hides a record whose SharePoint item has gone, without
--      destroying it: its permits, visas and history stay intact and it comes
--      back automatically if the item reappears. sharepoint_missing_since
--      records when it was first noticed absent.

-- ── Dirty tracking (all synced tables) ───────────────────────────────────────
alter table public.yachts       add column if not exists sharepoint_dirty_at timestamptz;
alter table public.permits      add column if not exists sharepoint_dirty_at timestamptz;
alter table public.crew_members add column if not exists sharepoint_dirty_at timestamptz;
alter table public.small_boats  add column if not exists sharepoint_dirty_at timestamptz;

create index if not exists yachts_sp_dirty_idx       on public.yachts (sharepoint_dirty_at)       where sharepoint_dirty_at is not null;
create index if not exists permits_sp_dirty_idx      on public.permits (sharepoint_dirty_at)      where sharepoint_dirty_at is not null;
create index if not exists crew_members_sp_dirty_idx on public.crew_members (sharepoint_dirty_at) where sharepoint_dirty_at is not null;
create index if not exists small_boats_sp_dirty_idx  on public.small_boats (sharepoint_dirty_at)  where sharepoint_dirty_at is not null;

/**
 * Flag a row as needing a push to SharePoint.
 *
 * Every sync write — inbound pull and outbound push alike — sets
 * sharepoint_synced_at. An UPDATE that leaves it untouched therefore came from
 * the application, and is exactly what has to travel outward.
 */
create or replace function public.mark_sharepoint_dirty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sharepoint_synced_at is not distinct from old.sharepoint_synced_at then
    new.sharepoint_dirty_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_yachts_sp_dirty       on public.yachts;
drop trigger if exists trg_permits_sp_dirty      on public.permits;
drop trigger if exists trg_crew_members_sp_dirty on public.crew_members;
drop trigger if exists trg_small_boats_sp_dirty  on public.small_boats;

create trigger trg_yachts_sp_dirty       before update on public.yachts       for each row execute function public.mark_sharepoint_dirty();
create trigger trg_permits_sp_dirty      before update on public.permits      for each row execute function public.mark_sharepoint_dirty();
create trigger trg_crew_members_sp_dirty before update on public.crew_members for each row execute function public.mark_sharepoint_dirty();
create trigger trg_small_boats_sp_dirty  before update on public.small_boats  for each row execute function public.mark_sharepoint_dirty();

-- ── Archive on removal ───────────────────────────────────────────────────────
-- `status` is itself pulled from SharePoint (In Country / Departed / Change
-- Agency), so archiving needs columns of its own.
alter table public.yachts      add column if not exists archived_at              timestamptz;
alter table public.yachts      add column if not exists sharepoint_missing_since timestamptz;
alter table public.small_boats add column if not exists archived_at              timestamptz;
alter table public.small_boats add column if not exists sharepoint_missing_since timestamptz;

create index if not exists yachts_archived_idx      on public.yachts (archived_at)      where archived_at is null;
create index if not exists small_boats_archived_idx on public.small_boats (archived_at) where archived_at is null;

comment on column public.yachts.archived_at is
  'Set when the yacht''s SharePoint list item is gone. Hidden from lists and counts; records preserved. Cleared automatically if the item returns.';
