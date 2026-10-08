-- Automated Reports belong to Crew & Immigration: seeing them needs view on the
-- crew_immigration module, changing them (opt in, recipients, schedule, on/off,
-- client access, remove) needs edit. Global admins pass via has_module_permission.
-- The Client Portal's own changes go through /api/portal/reports (service role).
drop policy if exists "staff manage" on public.vessel_report_subscriptions;
drop policy if exists "crew immigration read" on public.vessel_report_subscriptions;
drop policy if exists "crew immigration add" on public.vessel_report_subscriptions;
drop policy if exists "crew immigration change" on public.vessel_report_subscriptions;
drop policy if exists "crew immigration remove" on public.vessel_report_subscriptions;
create policy "crew immigration read" on public.vessel_report_subscriptions for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'crew_immigration', 'view'));
create policy "crew immigration add" on public.vessel_report_subscriptions for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'crew_immigration', 'edit'));
create policy "crew immigration change" on public.vessel_report_subscriptions for update to authenticated
  using (public.has_module_permission((select auth.uid()), 'crew_immigration', 'edit'))
  with check (public.has_module_permission((select auth.uid()), 'crew_immigration', 'edit'));
create policy "crew immigration remove" on public.vessel_report_subscriptions for delete to authenticated
  using (public.has_module_permission((select auth.uid()), 'crew_immigration', 'edit'));

drop policy if exists "staff read" on public.vessel_report_runs;
create policy "crew immigration read" on public.vessel_report_runs for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'crew_immigration', 'view'));
drop policy if exists "staff read" on public.vessel_report_events;
create policy "crew immigration read" on public.vessel_report_events for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'crew_immigration', 'view'));
