-- Resolve the "579 errors in 24h" alert on this project. Four distinct causes,
-- none of which was a failure anyone would have noticed from the app.
--
-- ── 1. 590 × 23505 unique_violation on qb_entity_locks_pkey ───────────────────
-- The QuickBooks per-entity lock was acquired by INSERT, and contention was
-- detected by letting that INSERT fail on the primary key. The pattern works, but
-- every normal collision writes a Postgres ERROR — 590 in one day, enough to trip
-- the infrastructure monitor and to bury real errors underneath. Contention is not
-- an error and should not be logged as one.
--
-- It also hid a genuine race: taking over a dead holder's lock was
-- SELECT-then-UPDATE, so two invocations could both read the same stale row and
-- both conclude they had won — exactly what the lock exists to prevent.
--
-- qb_try_entity_lock does it as ONE conditional upsert: insert if free, take over
-- only if the holder is older than p_stale_seconds, return false otherwise. No
-- error either way, and only one caller can win. Granted to service_role only —
-- the lock is worker-internal, and leaving it callable by anon/authenticated would
-- undo yesterday's 20260910070000 lockdown.
create or replace function public.qb_try_entity_lock(p_key text, p_stale_seconds integer default 180)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare got boolean;
begin
  insert into public.qb_entity_locks as l (key, locked_at)
  values (p_key, now())
  on conflict (key) do update
    set locked_at = now()
    where l.locked_at < now() - make_interval(secs => p_stale_seconds)
  returning true into got;
  return coalesce(got, false);
end;
$$;

revoke execute on function public.qb_try_entity_lock(text, integer) from public, anon, authenticated;
grant  execute on function public.qb_try_entity_lock(text, integer) to service_role;

-- Four locks had been stranded since 30 July / 24 August — Workers killed mid-run,
-- so the finally{} that releases them never ran. Nothing held them; they existed
-- only to be collided with. (Release is already in a finally block, so this is
-- eviction, not a missing cleanup path.)
delete from public.qb_entity_locks where locked_at < now() - interval '1 hour';

-- ── 2. 31 × 57014 statement timeout ───────────────────────────────────────────
-- The hot read is `from automation_runs where started_at >= $1 limit $2 offset $3`
-- — 8,127 calls a day averaging 1.75s, about four hours of database time. Both
-- existing indexes lead with automation_key, so a filter on started_at alone could
-- not use either: shallow pages did a full index scan, and deep OFFSETs fell back
-- to a sequential scan discarding 123,746 rows each time. Under concurrency that
-- is what tipped into the statement timeout.
--
-- Measured on the deep-offset plan: 223ms → 79ms, seq scan → index scan, and the
-- row estimate went from 13 (vs 1000 actual) to 21,767 (vs 21,000 actual).
create index if not exists automation_runs_started_at_idx
  on public.automation_runs (started_at desc);

-- automation_runs_key_idx and idx_automation_runs_key_started were byte-identical
-- on (automation_key, started_at DESC). Two copies cost write time and space on a
-- table taking ~3,000 inserts a day, for no read benefit.
drop index if exists public.automation_runs_key_idx;

analyze public.automation_runs;

-- ── 3. 4 × 23502 not_null_violation on visa_expiry_flags.crew_id ──────────────
-- Same shape as yesterday's passport 'XX' placeholder: a NOT NULL on something we
-- often do not have. A flag records that a VISA is expiring; crew_id is a
-- convenience link, and 5,525 of the 5,985 visa applications on file have no crew
-- member attached. So every flag on an unlinked visa failed — and because the
-- insert's error was never read, it failed SILENTLY: the notification still went
-- out and expiry_flags_sent was still stamped.
--
-- The damage that hid: 247 visas are marked as flagged with no audit row behind
-- them, against only 232 flag rows that exist in total. The insert's outcome is
-- now checked and logged (src/lib/visa/visaExpiryFlags.server.ts), so a lost flag
-- can no longer be invisible.
alter table public.visa_expiry_flags alter column crew_id drop not null;

-- ── 4. 8 × 22P02 invalid uuid "x" ─────────────────────────────────────────────
-- Code-only, no schema change: SeaportImmigrationSection guarded an empty id list
-- with `.in("request_id", ["x"])`, and request_id is a uuid, so Postgres rejected
-- "x" on every render for a vessel with no seaport requests. It now skips the two
-- queries entirely when there is nothing to look up.
