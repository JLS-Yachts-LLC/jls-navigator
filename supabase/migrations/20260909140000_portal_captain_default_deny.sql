-- Portal captains: default-deny everything that is not explicitly theirs.
--
-- WHY. Polaris already has a real captain-isolation layer — is_portal_captain(),
-- portal_aal2(), captain_yacht_ids() — and it works: a captain session sees 0 of
-- 184 yachts, 0 of 3,792 permits, 0 crew, 0 visas, 0 of 7,340 QuickBooks invoices.
-- Those policies are RESTRICTIVE, so they AND with everything else and cannot be
-- OR'd away. Good.
--
-- The gap is that the layer was applied table by table, to the tables the portal
-- screens touch. Every table added since — and several never covered — has only a
-- permissive "any authenticated user" policy, and a captain login IS an
-- authenticated user. Probing an actual captain-shaped session found 20 tables
-- fully readable, including:
--   document_shares + document_share_access — the secure-link TOKENS and the
--     access trail for every client's documents. A captain could lift any other
--     client's token and open their permit.
--   warehouse_client_items (108), yacht_shipments (89), warehouse_internal_items
--     (60), warehouse_shelves (77) — other clients' goods in the warehouse.
--   training_students (106), training_classes (143) — named individuals.
--   crew_document_sharepoint_links (37) — links to crew paperwork.
--   qb_ext_events/installs, esign_templates, berths, marinas, it_projects,
--     staff_departments, forms, feature_badges, directory_contacts.
-- Most were writable too: as that session, UPDATE on all 184 yachts and DELETE of
-- every document_shares row both succeeded (rolled back).
--
-- Enumerating tables to protect is the wrong default — it fails silently every
-- time someone adds a table. So this inverts it: one RESTRICTIVE deny-all per
-- table for anyone who is a portal captain, on every table that has no captain
-- purpose. The portal's own tables are deliberately excluded (captain_accounts,
-- captain_requests, captain_request_messages, portal_chats, portal_chat_messages,
-- portal_directory) along with the vessel-scoped ones it reads (yachts, permits,
-- crew_members, visa_applications, ism_certificates, ism_drills, pms_tasks,
-- pms_equipment, charter_bookings), which keep their existing scoped policies.
-- Public reference data (country_dial_codes, country_language_map, languages) is
-- left alone. The portal's server endpoints use the service role, which bypasses
-- RLS, so nothing the portal legitimately serves is affected.
--
-- No live staff account is a portal captain: the only active captain_accounts row
-- with a login is m.peeters@jlsyachts.com, a stale AQUILA test account last used
-- 16 May 2026 (Matt works as mattpeeters@newhorizon-it.co.uk, global_admin).

drop policy if exists portal_captain_denied on public.ais_destination_geocode;
create policy portal_captain_denied on public.ais_destination_geocode as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.app_dev_tasks;
create policy portal_captain_denied on public.app_dev_tasks as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.berth_billing_audit_log;
create policy portal_captain_denied on public.berth_billing_audit_log as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.berth_billing_lines;
create policy portal_captain_denied on public.berth_billing_lines as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.berth_invoice_lines;
create policy portal_captain_denied on public.berth_invoice_lines as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.berth_invoices;
create policy portal_captain_denied on public.berth_invoices as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.berth_occupancies;
create policy portal_captain_denied on public.berth_occupancies as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.berth_supplier_invoices;
create policy portal_captain_denied on public.berth_supplier_invoices as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.berths;
create policy portal_captain_denied on public.berths as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.crew_document_folders;
create policy portal_captain_denied on public.crew_document_folders as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.crew_document_placements;
create policy portal_captain_denied on public.crew_document_placements as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.crew_document_sharepoint_links;
create policy portal_captain_denied on public.crew_document_sharepoint_links as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.crew_vehicle_photos;
create policy portal_captain_denied on public.crew_vehicle_photos as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.directory_contacts;
create policy portal_captain_denied on public.directory_contacts as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.document_share_access;
create policy portal_captain_denied on public.document_share_access as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.document_shares;
create policy portal_captain_denied on public.document_shares as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.esign_templates;
create policy portal_captain_denied on public.esign_templates as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.feature_badges;
create policy portal_captain_denied on public.feature_badges as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.form_submissions;
create policy portal_captain_denied on public.form_submissions as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.forms;
create policy portal_captain_denied on public.forms as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.it_backup_instances;
create policy portal_captain_denied on public.it_backup_instances as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.it_backup_runs;
create policy portal_captain_denied on public.it_backup_runs as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.it_project_tasks;
create policy portal_captain_denied on public.it_project_tasks as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.it_projects;
create policy portal_captain_denied on public.it_projects as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.marinas;
create policy portal_captain_denied on public.marinas as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.orbit_approval_policies;
create policy portal_captain_denied on public.orbit_approval_policies as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.orbit_fx_rates;
create policy portal_captain_denied on public.orbit_fx_rates as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.portal_document_access;
create policy portal_captain_denied on public.portal_document_access as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.qb_entity_locks;
create policy portal_captain_denied on public.qb_entity_locks as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.qb_ext_events;
create policy portal_captain_denied on public.qb_ext_events as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.qb_ext_installs;
create policy portal_captain_denied on public.qb_ext_installs as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.qb_proforma_docs;
create policy portal_captain_denied on public.qb_proforma_docs as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.qb_templates;
create policy portal_captain_denied on public.qb_templates as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.qbo_doc_logs;
create policy portal_captain_denied on public.qbo_doc_logs as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.qbo_invoice_pdf_state;
create policy portal_captain_denied on public.qbo_invoice_pdf_state as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.staff_departments;
create policy portal_captain_denied on public.staff_departments as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.ticket_mail_processed;
create policy portal_captain_denied on public.ticket_mail_processed as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.training_calendar_events;
create policy portal_captain_denied on public.training_calendar_events as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.training_classes;
create policy portal_captain_denied on public.training_classes as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.training_courses;
create policy portal_captain_denied on public.training_courses as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.training_instructors;
create policy portal_captain_denied on public.training_instructors as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.training_students;
create policy portal_captain_denied on public.training_students as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.user_departments;
create policy portal_captain_denied on public.user_departments as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.vehicle_condition_reports;
create policy portal_captain_denied on public.vehicle_condition_reports as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.vehicle_damage_reports;
create policy portal_captain_denied on public.vehicle_damage_reports as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.vehicle_service_requests;
create policy portal_captain_denied on public.vehicle_service_requests as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.visa_movement_history;
create policy portal_captain_denied on public.visa_movement_history as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.visa_status_history;
create policy portal_captain_denied on public.visa_status_history as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.warehouse_client_items;
create policy portal_captain_denied on public.warehouse_client_items as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.warehouse_internal_items;
create policy portal_captain_denied on public.warehouse_internal_items as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.warehouse_package_contents;
create policy portal_captain_denied on public.warehouse_package_contents as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.warehouse_shelves;
create policy portal_captain_denied on public.warehouse_shelves as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.yacht_activity_log;
create policy portal_captain_denied on public.yacht_activity_log as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.yacht_document_duplicate_dismissals;
create policy portal_captain_denied on public.yacht_document_duplicate_dismissals as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.yacht_document_folders;
create policy portal_captain_denied on public.yacht_document_folders as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.yacht_document_placements;
create policy portal_captain_denied on public.yacht_document_placements as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.yacht_document_sharepoint_links;
create policy portal_captain_denied on public.yacht_document_sharepoint_links as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.yacht_documents;
create policy portal_captain_denied on public.yacht_documents as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
drop policy if exists portal_captain_denied on public.yacht_shipments;
create policy portal_captain_denied on public.yacht_shipments as restrictive for all to authenticated using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));

-- ── The token tables should never have been world-readable either ──────────────
-- document_shares_staff_read was `using (true)`: ANY signed-in user could read
-- every client's share token, not just captains. Same for the access trail.
drop policy if exists document_shares_staff_read on public.document_shares;
create policy document_shares_staff_read on public.document_shares
  for select to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

drop policy if exists document_share_access_staff_read on public.document_share_access;
create policy document_share_access_staff_read on public.document_share_access
  for select to authenticated
  using (exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

-- ── A portal login must not be born as staff ───────────────────────────────────
-- Both triggers on auth.users assume every new user is a JLS staff member, so
-- creating a captain login through Manage Users silently gave it a user_profiles
-- row (role read_only) and a user_roles 'user' row. That matters twice over:
-- "staff" is defined as *having a user_profiles row* in every storage policy, and
-- is_portal_captain() would then be competing with a staff identity on the same
-- account. /api/admin/portal-users already tags these users
-- (user_metadata.portal = 'captain'), so both triggers now stand down for them.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if coalesce(new.raw_user_meta_data->>'portal', '') = 'captain' then
    return new;  -- client-portal login: not a staff member
  end if;
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end; $function$;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_global_admin_role_id uuid;
  v_read_only_role_id uuid;
  v_legacy_role text;
begin
  if coalesce(new.raw_user_meta_data->>'portal', '') = 'captain' then
    return new;  -- client-portal login: not a staff member
  end if;

  select role_id into v_global_admin_role_id from public.roles where name = 'global_admin';
  select role_id into v_read_only_role_id from public.roles where name = 'read_only';
  select role into v_legacy_role from public.user_roles where user_id = new.id;

  insert into public.user_profiles (user_id, display_name, email, role_id, active, timezone)
  values (
    new.id,
    coalesce(nullif(trim(split_part(new.email, '@', 1)), ''), 'Unnamed user'),
    new.email,
    case when v_legacy_role = 'admin' then v_global_admin_role_id else v_read_only_role_id end,
    true,
    'Asia/Dubai'
  )
  on conflict (user_id) do nothing;

  return new;
end; $function$;

-- ── Applied live 2026-09-09 ────────────────────────────────────────────────────
-- The AQUILA test captain (m.peeters@jlsyachts.com) was an old global_admin
-- repurposed as a captain, so it still carried a staff user_profiles row. RLS
-- neutralised that (user_profiles is itself captain-fenced, so the storage
-- policies' EXISTS returned false) but requireAdminAccess reads user_profiles
-- with the SERVICE ROLE, which bypasses RLS — that account could call every
-- admin endpoint. Stripped, and tagged as a portal login:
--
--   delete from public.user_profiles where user_id = '2b0476e5-…';
--   delete from public.profiles      where id      = '2b0476e5-…';
--   update auth.users set raw_user_meta_data =
--     coalesce(raw_user_meta_data,'{}'::jsonb) || '{"portal":"captain","vessel":"AQUILA"}'::jsonb
--   where id = '2b0476e5-…';
--
-- requireAdminAccess now also refuses any active captain outright, because the
-- API layer bypasses RLS and cannot rely on the fences above.
