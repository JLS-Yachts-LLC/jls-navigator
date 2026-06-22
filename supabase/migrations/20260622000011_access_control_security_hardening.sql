-- Security hardening for recent additions (flagged by Supabase security advisor).

-- 1. search_audit_log (created in 20260619000002 without RLS — ERROR-level:
--    a public table fully exposed via PostgREST). Inserts come from the
--    service-role key (which bypasses RLS), so enabling RLS + an admin-only
--    read policy closes the hole without breaking search logging.
alter table public.search_audit_log enable row level security;
drop policy if exists search_audit_log_admin on public.search_audit_log;
create policy search_audit_log_admin on public.search_audit_log for select
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

-- 2. Pin search_path on the trigger helper functions (mutable search_path warning).
alter function public.polaris_set_updated_at() set search_path = '';
alter function public.polaris_sync_crew_full_name() set search_path = '';
