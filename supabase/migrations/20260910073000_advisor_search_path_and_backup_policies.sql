-- Clear the last two fixable Supabase security-advisor lints.
--
-- ── 1. function_search_path_mutable (13 functions) ────────────────────────────
-- A function with no pinned search_path resolves unqualified names against
-- whatever the caller's search_path happens to be. The classic attack is a
-- attacker-created object in a schema that sits earlier in the path shadowing the
-- real one. None of these 13 are SECURITY DEFINER, so there was no
-- privilege-escalation path and this was hardening rather than a live hole — but
-- it is a one-line fix each.
--
-- `pg_temp` is listed LAST deliberately. When it is not named at all Postgres
-- searches it FIRST for tables, which is the very shadowing this guards against;
-- naming it last pins it behind public.
-- `extensions` is included because get_candidate_match_score leans on pg_trgm,
-- and it costs nothing for the others.
alter function public.update_updated_at_column()                   set search_path = public, extensions, pg_temp;
alter function public.orbit_parse_length(text)                     set search_path = public, extensions, pg_temp;
alter function public.orbit_boat_type_from_registry(text)          set search_path = public, extensions, pg_temp;
alter function public.shipsync_touch_updated_at()                  set search_path = public, extensions, pg_temp;
alter function public.get_candidate_match_score(uuid,uuid)         set search_path = public, extensions, pg_temp;
alter function public.get_expiring_placement_certificates(integer) set search_path = public, extensions, pg_temp;
alter function public.get_inactive_placement_candidates(integer)   set search_path = public, extensions, pg_temp;
alter function public.prevent_orbit_quotation_snapshot_overwrite() set search_path = public, extensions, pg_temp;
alter function public.prevent_signed_bdn_edit()                    set search_path = public, extensions, pg_temp;
alter function public.prevent_signed_declaration_edit()            set search_path = public, extensions, pg_temp;
alter function public.portal_aal2()                                set search_path = public, extensions, pg_temp;
alter function public.captain_request_before_insert()              set search_path = public, extensions, pg_temp;
alter function public.portal_touch_updated_at()                    set search_path = public, extensions, pg_temp;

-- ── 2. rls_enabled_no_policy (5 tables) ───────────────────────────────────────
-- These five had RLS on and no policies, which is already deny-all, so the lint
-- was INFO. The obvious tidy-up was to drop them — and that would have been a bad
-- mistake. Counting first showed they are the ONLY copy of roughly 29,000 deleted
-- rows:
--   permits_dedupe_backup_20260903        1,382 rows, only 1 still live  → 1,381 exist nowhere else
--   compliance_alerts_dedupe_backup_2026… 27,825 rows, 185 still live    → ~27,640 exist nowhere else
--   shipsync_duplicate_merge_backup       207 rows of row_data jsonb, the dropped packages
--   shipsync_dup_merge_plan               the 207 keep/drop decisions behind that merge
--   shipsync_status_closeoff_log          969 rows, ALL written 2026-09-09 — an active
--                                         audit log, not a backup at all
-- Destroying a week of undo history to silence an INFO lint is the wrong trade, so
-- they keep their data and get a staff-read policy instead. Staff = has a
-- user_profiles row, which also excludes portal captains (user_profiles is itself
-- captain-fenced). No insert/update/delete for anyone: these are forensic records,
-- written once by the cleanup that produced them.
--
-- Worth knowing when someone next revisits this: the ShipSync merge plan is fully
-- applied (0 of its 207 drop_ids still exist), but 35 duplicate barcodes remain in
-- shipsync_packages and NONE of them appear in the plan — they arrived after it was
-- drawn up, so they are new drift rather than unfinished work.
create policy staff_read on public.permits_dedupe_backup_20260903 for select to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

create policy staff_read on public.compliance_alerts_dedupe_backup_20260904 for select to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

create policy staff_read on public.shipsync_dup_merge_plan for select to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

create policy staff_read on public.shipsync_duplicate_merge_backup for select to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

create policy staff_read on public.shipsync_status_closeoff_log for select to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

-- Leaves exactly two advisor warnings standing, both deliberate:
--   authenticated_security_definer_function_executable (66) — these ARE the staff
--     RPCs the browser calls; revoking `authenticated` would break the app.
--   extension_in_public (pg_trgm) — moving it means dropping and rebuilding the
--     trigram indexes behind the search boxes; a maintenance window, not a quick fix.
