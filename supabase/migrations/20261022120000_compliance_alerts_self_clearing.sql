-- Visa compliance alerts clear themselves once they no longer apply (SD-0078).
--
-- Astrid asked what the "5 compliance alerts require attention" on the Visa
-- dashboard wanted from her. Nothing. All five were visas that had expired in
-- July, frozen at "(0 days)", and the visas had since been cancelled, expired
-- or re-dated. The daily monitor only looks at visas expiring in the next 30
-- days, so once the date passed an alert was never touched again. 176 of the
-- 203 open alerts were like that.
--
-- Also: alerts were de-duplicated on (crew_id, alert_type, due_date), and 113
-- visas aren't linked to a crew member. Every unlinked visa expiring on the
-- same day shared ONE alert, with no name on it ("AE visa for  expires …").
-- They are keyed by the record the alert is about now — the application, the
-- passport — falling back to the crew member.
--
--   resolve_stale_compliance_alerts()  run by the monitor before each check;
--                                      returns how many it cleared
--   resolved_at / resolved_reason      when and why — "Resolved by hand" for
--                                      the dashboard's Resolve button

alter table public.compliance_alerts
  add column if not exists resolved_at     timestamptz,
  add column if not exists resolved_reason text;

-- ── Stamp a hand resolve ──────────────────────────────────────────────────
create or replace function public.compliance_alert_resolved_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.resolved and not coalesce(old.resolved, false) then
    new.resolved_at := coalesce(new.resolved_at, now());
    new.resolved_reason := coalesce(new.resolved_reason, 'Resolved by hand');
  elsif not new.resolved then
    new.resolved_at := null;
    new.resolved_reason := null;
  end if;
  return new;
end $$;
drop trigger if exists compliance_alert_resolved_stamp on public.compliance_alerts;
create trigger compliance_alert_resolved_stamp before update on public.compliance_alerts
  for each row execute function public.compliance_alert_resolved_stamp();

-- ── Clear the ones that no longer apply ───────────────────────────────────
create or replace function public.resolve_stale_compliance_alerts() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Dubai')::date;
  v_n int;
begin
  with stale as (
    select a.id,
      case
        when a.alert_type = 'visa_expiry' and v.id is null then 'Visa application deleted'
        when a.alert_type = 'visa_expiry' and v.status <> 'approved' then 'Visa is now ' || v.status
        when a.alert_type = 'visa_expiry' and v.visa_expiry is distinct from a.due_date then 'Visa expiry date changed'
        when a.alert_type = 'visa_expiry' and a.due_date < v_today then 'Visa has expired'
        when a.alert_type = 'passport_expiry' and p.id is null then 'Passport removed'
        when a.alert_type = 'passport_expiry' and p.expiry_date is distinct from a.due_date then 'Passport expiry date changed'
        when a.alert_type = 'passport_expiry' and a.due_date < v_today then 'Passport has expired'
        when a.alert_type = 'missing_document' and (v.id is null or v.status <> 'pending_docs') then 'Application moved on'
      end as reason
    from public.compliance_alerts a
    left join public.visa_applications v on v.id = a.application_id
    left join public.crew_passports p on p.id = a.passport_id
    where not a.resolved
  )
  update public.compliance_alerts a
     set resolved = true, resolved_at = now(), resolved_reason = s.reason
    from stale s
   where a.id = s.id and s.reason is not null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.resolve_stale_compliance_alerts() from public, anon, authenticated;
grant execute on function public.resolve_stale_compliance_alerts() to service_role;

-- Clear the backlog now, before the new identity index (fewer rows to collide).
select public.resolve_stale_compliance_alerts();

-- ── One open alert per record, not per crew member ────────────────────────
drop index if exists public.compliance_alerts_open_identity_uniq;
create unique index if not exists compliance_alerts_open_subject_uniq
  on public.compliance_alerts (alert_type, (coalesce(application_id, passport_id, crew_id)), due_date) nulls not distinct
  where not resolved;
