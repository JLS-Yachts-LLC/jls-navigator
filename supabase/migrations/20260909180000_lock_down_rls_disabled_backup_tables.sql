-- Five public tables were left with RLS disabled and full anon grants.
--
-- All five are scratch from data-cleanup work (the permits dedupe, the
-- compliance-alerts dedupe, the ShipSync duplicate merge), but they hold real
-- copies of real data — 27,825 compliance alerts and 1,382 permit rows, which
-- carry crew personal data. With RLS off and anon holding SELECT through
-- TRUNCATE, anyone with the publishable key could read or delete the lot.
--
-- Found by the Supabase security advisor (rls_disabled_in_public, the only
-- ERROR-level finding on this project).
--
-- Nothing in the application references any of them (checked across src/), so
-- they are locked shut rather than given policies:
--   - RLS enabled with no policies = default deny for anon and authenticated.
--   - Grants revoked as well, so the exposure does not depend on RLS alone.
-- service_role bypasses RLS, so anything server-side that ever needs them
-- still works, and they remain available for a manual restore if the cleanups
-- ever need reverting.
--
-- Applied live 2026-09-09.

alter table public.compliance_alerts_dedupe_backup_20260904 enable row level security;
alter table public.permits_dedupe_backup_20260903            enable row level security;
alter table public.shipsync_duplicate_merge_backup           enable row level security;
alter table public.shipsync_dup_merge_plan                   enable row level security;
alter table public.shipsync_status_closeoff_log              enable row level security;

revoke all on public.compliance_alerts_dedupe_backup_20260904 from anon, authenticated;
revoke all on public.permits_dedupe_backup_20260903            from anon, authenticated;
revoke all on public.shipsync_duplicate_merge_backup           from anon, authenticated;
revoke all on public.shipsync_dup_merge_plan                   from anon, authenticated;
revoke all on public.shipsync_status_closeoff_log              from anon, authenticated;

comment on table public.compliance_alerts_dedupe_backup_20260904 is
  'Backup from the 2026-09-04 compliance-alerts dedupe. Locked down: RLS on, no policies, no anon/authenticated grants. Service-role only.';
comment on table public.permits_dedupe_backup_20260903 is
  'Backup from the 2026-09-03 permits dedupe. Locked down: RLS on, no policies, no anon/authenticated grants. Service-role only.';
comment on table public.shipsync_duplicate_merge_backup is
  'Backup from the ShipSync duplicate merge. Locked down: RLS on, no policies, no anon/authenticated grants. Service-role only.';
comment on table public.shipsync_dup_merge_plan is
  'Plan rows for the ShipSync duplicate merge. Locked down: RLS on, no policies, no anon/authenticated grants. Service-role only.';
comment on table public.shipsync_status_closeoff_log is
  'Log from the ShipSync status close-off. Locked down: RLS on, no policies, no anon/authenticated grants. Service-role only.';
