-- Make `audit_log` actually answer "who changed this record, and when".
--
-- The table already existed with the right shape but was never wired up — it held
-- a single row. This adds a trigger-based writer, because plenty of writes go
-- straight from the client through RLS rather than a server route, so app-level
-- logging would miss them (and would have missed the case that prompted this:
-- a vessel photo written by the SharePoint sync under the service role).
--
-- Design notes:
--   • AFTER trigger, FOR EACH ROW, on yachts / permits / visa_applications.
--   • Stores a jsonb diff of the columns that actually changed, not whole-row
--     snapshots, so the table stays small and readable.
--   • Machine noise is excluded per table (AIS position churn, SharePoint sync
--     bookkeeping); an UPDATE that touched only those writes nothing at all.
--   • Known personal-data columns record that they changed WITHOUT the values,
--     so the audit trail never becomes a second copy of passport data.
--   • Service-role and cron writes have no auth.uid(); they are recorded as
--     actor_kind 'service'/'system' rather than dropped — that is exactly the
--     case that was previously unanswerable.

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_module        text   := coalesce(nullif(tg_argv[0], ''), tg_table_name);
  v_resource_type text   := coalesce(nullif(tg_argv[1], ''), tg_table_name);
  v_ignore        text[] := case when coalesce(tg_argv[2], '') = '' then array[]::text[]
                                 else string_to_array(tg_argv[2], ',') end;
  v_redact        text[] := case when coalesce(tg_argv[3], '') = '' then array[]::text[]
                                 else string_to_array(tg_argv[3], ',') end;
  v_old      jsonb;
  v_new      jsonb;
  v_changes  jsonb := '{}'::jsonb;
  v_key      text;
  v_uid      uuid  := auth.uid();
  v_role     text  := '';
  v_actor    text;
  v_resource uuid;
  v_ip       text  := null;
  v_ua       text  := null;
begin
  -- Bookkeeping columns are never interesting on their own.
  v_ignore := v_ignore || array['updated_at', 'created_at'];

  if tg_op = 'INSERT' then
    v_new      := to_jsonb(new);
    v_resource := (v_new ->> 'id')::uuid;
    v_changes  := jsonb_build_object('created', true);

  elsif tg_op = 'DELETE' then
    v_old      := to_jsonb(old);
    v_resource := (v_old ->> 'id')::uuid;
    v_changes  := jsonb_build_object('deleted', true);

  else
    v_old      := to_jsonb(old);
    v_new      := to_jsonb(new);
    v_resource := (v_new ->> 'id')::uuid;

    for v_key in select jsonb_object_keys(v_new) loop
      continue when v_key = any (v_ignore);
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        if v_key = any (v_redact) then
          v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('changed', true));
        else
          v_changes := v_changes || jsonb_build_object(
            v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
        end if;
      end if;
    end loop;

    -- Only machine noise moved — nothing worth a row.
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  end if;

  -- Who did it. auth.uid() is null for the service role and for cron/SQL writes,
  -- so fall back to the request role to tell "our sync" from "someone in psql".
  begin
    v_role := coalesce(auth.role(), '');
  exception when others then
    v_role := '';
  end;

  v_actor := case
    when v_uid is not null       then 'user'
    when v_role = 'service_role' then 'service'
    when v_role = 'anon'         then 'anon'
    else 'system'
  end;

  -- Request context, when PostgREST provides it (absent for cron and psql).
  begin
    v_ip := nullif(split_part(
      coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''), ',', 1), '');
    v_ua := nullif(current_setting('request.headers', true)::jsonb ->> 'user-agent', '');
  exception when others then
    v_ip := null;
    v_ua := null;
  end;

  -- audit_log.event_type has its own vocabulary (audit_log_event_type_check) built
  -- around login/data_*/admin_action; use it rather than widening the constraint.
  insert into public.audit_log
    (user_id, event_type, module, resource_type, resource_id, ip_address, user_agent, metadata)
  values
    (v_uid,
     case tg_op when 'INSERT' then 'data_create'
                when 'DELETE' then 'data_delete'
                else 'data_edit' end,
     v_module, v_resource_type, v_resource, v_ip, v_ua,
     jsonb_build_object('actor_kind', v_actor, 'changes', v_changes));

  return null;
end
$$;

comment on function public.audit_row_change() is
  'Row-change auditor. Trigger args: module, resource_type, ignored columns (csv), redacted columns (csv).';

create index if not exists audit_log_resource_idx on public.audit_log (resource_type, resource_id, created_at desc);
create index if not exists audit_log_created_idx  on public.audit_log (created_at desc);

-- ── Yachts ───────────────────────────────────────────────────────────────────
-- AIS fields move every few minutes for 138 vessels; auditing them would bury
-- the changes a person actually made.
drop trigger if exists audit_yachts on public.yachts;
create trigger audit_yachts
  after insert or update or delete on public.yachts
  for each row execute function public.audit_row_change(
    'vessels', 'yacht',
    'ais_course,ais_destination,ais_eta,ais_heading,ais_lat,ais_lon,ais_navstat,ais_position_at,ais_speed,ais_synced_at,dest_lat,dest_lon,sharepoint_synced_at,sharepoint_dirty_at',
    ''
  );

-- ── Permits ──────────────────────────────────────────────────────────────────
drop trigger if exists audit_permits on public.permits;
create trigger audit_permits
  after insert or update or delete on public.permits
  for each row execute function public.audit_row_change(
    'permits', 'permit',
    'sharepoint_synced_at,sharepoint_dirty_at',
    ''
  );

-- ── Visa applications ────────────────────────────────────────────────────────
-- Passport and visa identifiers are recorded as "changed" only.
drop trigger if exists audit_visa_applications on public.visa_applications;
create trigger audit_visa_applications
  after insert or update or delete on public.visa_applications
  for each row execute function public.audit_row_change(
    'crew_immigration', 'visa_application',
    'sharepoint_synced_at',
    'passport_number,passport_expiry,passport_id,selected_passport_id,visa_number,nationality'
  );

-- ── Reading the trail ────────────────────────────────────────────────────────
-- `audit_log_own` already covers "my own rows, or an admin sees everything", but
-- the point of this trail is that any staff member can ask who last touched a
-- vessel or permit — including the rows with no user at all (the sync). Visa
-- audit rows stay admin-only, matching how the module itself is gated.
--
-- Note this policy must exclude portal captains itself: permissive policies are
-- OR-ed, so relying on the existing portal_captain_block would not hold.
drop policy if exists audit_log_staff_read on public.audit_log;
create policy audit_log_staff_read
  on public.audit_log for select
  to authenticated
  using (
    not is_portal_captain()
    and resource_type in ('yacht', 'permit')
  );
