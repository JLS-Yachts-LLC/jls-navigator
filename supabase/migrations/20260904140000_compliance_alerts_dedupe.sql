-- Collapse the duplicate compliance alerts, then stop them coming back.
--
-- `upsertAlert` de-duplicated with `.eq('crew_id', alert.crew_id ?? null)`, which
-- supabase-js sends as `crew_id=eq.null` for PostgreSQL to cast to a uuid. That
-- errored on every run (288 times in 24 hours), and because it ERRORED rather
-- than returning no rows, each run took the insert branch: 27,825 rows held only
-- 185 distinct alerts, one repeated 188 times.
--
-- Applied 2026-09-04. Recorded here for the migration history; the live database
-- was changed directly (this deploy pipeline does not run migrations).
--
-- Reversible: the whole table was copied to compliance_alerts_dedupe_backup_20260904.

create table if not exists public.compliance_alerts_dedupe_backup_20260904 as
select * from public.compliance_alerts;

comment on table public.compliance_alerts_dedupe_backup_20260904 is
  'Full copy of compliance_alerts before the 2026-09-04 dedupe (27,825 rows). The newest row per (crew_id, alert_type, due_date, resolved) was kept.';

-- Newest wins: it carries the current severity and message, which the monitor
-- updates on each run. `resolved` is part of the key so a resolved alert and a
-- later re-raised one are not collapsed into each other.
with ranked as (
  select id,
         row_number() over (
           partition by crew_id, alert_type, due_date, resolved
           order by created_at desc, id desc) as rn
  from public.compliance_alerts
)
delete from public.compliance_alerts a using ranked r
 where a.id = r.id and r.rn > 1;

-- The backstop. NULLS NOT DISTINCT (PG15+) is essential rather than cosmetic:
-- crew_id and due_date are nullable and 27,722 of the duplicates had a null
-- crew_id, so a default unique index — treating every NULL as distinct — would
-- have permitted all of them.
create unique index if not exists compliance_alerts_open_identity_uniq
  on public.compliance_alerts (crew_id, alert_type, due_date)
  nulls not distinct
  where resolved = false;
