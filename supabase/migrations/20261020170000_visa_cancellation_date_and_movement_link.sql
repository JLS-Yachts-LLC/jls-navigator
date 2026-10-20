-- Visa cancellation date + every sign on/off linked to the visa it happened under.
--
-- Asked for by the Agency/finance team (Jeannin, 20 Oct 2026): a cancelled visa
-- showed no date it was cancelled, and a crew member on a six-month multiple-entry
-- visa can sign on and off several times — but a visa only held one Sign On/Sign Off
-- pair and every new movement was stamped onto the crew member's NEWEST visa row,
-- whichever visa was actually valid on the day.
--
--  1. visa_applications.cancelled_on (+ cancelled_on_estimated): asked for when a
--     visa is cancelled; if nobody gives one, the day it was marked cancelled is used
--     and flagged as estimated. Back-filled from visa_status_history the same way.
--  2. crew_signon_events.visa_id: each movement links to the visa valid on its date
--     (visa_for_movement). The visa's sign_on_date/sign_off_date stay as the LATEST
--     sign on / sign off under that visa; the full list lives on the events.

alter table public.visa_applications
  add column if not exists cancelled_on date,
  add column if not exists cancelled_on_estimated boolean not null default false;

comment on column public.visa_applications.cancelled_on is
  'Date the visa was cancelled. Entered when cancelling; defaults to the day it was marked cancelled (cancelled_on_estimated = true).';

alter table public.crew_signon_events
  add column if not exists visa_id uuid references public.visa_applications(id) on delete set null;

create index if not exists crew_signon_events_visa_id_idx on public.crew_signon_events (visa_id);

-- ── 1. Cancellation date ────────────────────────────────────────────────────

create or replace function public.visa_stamp_cancelled_on()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' then
    if new.status = 'cancelled' and old.status is distinct from 'cancelled' and new.cancelled_on is null then
      -- Nobody gave a date: use the day it was marked cancelled (Dubai), flagged estimated.
      new.cancelled_on := (now() at time zone 'Asia/Dubai')::date;
      new.cancelled_on_estimated := true;
    elsif new.status is distinct from 'cancelled' and old.status = 'cancelled' then
      -- Reinstated: it is no longer cancelled.
      new.cancelled_on := null;
      new.cancelled_on_estimated := false;
    elsif new.cancelled_on is distinct from old.cancelled_on
          and new.cancelled_on_estimated is not distinct from old.cancelled_on_estimated then
      -- Someone entered or corrected the date: it is no longer an estimate.
      new.cancelled_on_estimated := false;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_visa_stamp_cancelled_on on public.visa_applications;
create trigger trg_visa_stamp_cancelled_on
  before update on public.visa_applications
  for each row execute function public.visa_stamp_cancelled_on();

-- Back-fill: the last time each cancelled visa was marked cancelled in Polaris
-- (by staff or the tracker sync). The 2 Jul import rows ('backfill') carry the
-- import date, not a cancellation date, so they're left blank.
update public.visa_applications va
   set cancelled_on = h.d, cancelled_on_estimated = true
  from (
    select distinct on (visa_id) visa_id, (changed_at at time zone 'Asia/Dubai')::date as d
      from public.visa_status_history
     where new_status = 'cancelled' and source in ('app', 'sync')
     order by visa_id, changed_at desc
  ) h
 where va.id = h.visa_id and va.status = 'cancelled' and va.cancelled_on is null;

-- ── 2. Which visa a movement belongs to ─────────────────────────────────────

create or replace function public.visa_for_movement(p_crew uuid, p_date date)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from (
    -- a) the visa that was valid that day (issued on/before, not yet expired or cancelled)
    select id, 1 as rnk, coalesce(visa_issuance_date, visa_issue_date) as d, created_at
      from visa_applications
     where crew_member_id = p_crew
       and status not in ('draft', 'submitted', 'rejected', 'pending_docs', 'in_review')
       and coalesce(visa_issuance_date, visa_issue_date) <= p_date
       and p_date <= coalesce(least(cancelled_on, visa_expiry, visa_expiry_date), 'infinity'::date)
    union all
    -- b) else the newest visa issued (or opened) on or before that day
    select id, 2, coalesce(visa_issuance_date, visa_issue_date, created_at::date), created_at
      from visa_applications
     where crew_member_id = p_crew
       and status not in ('draft', 'rejected')
       and coalesce(visa_issuance_date, visa_issue_date, created_at::date) <= p_date
    union all
    -- c) else the crew member's newest visa (what every movement used to be stamped on)
    select id, 3, null, created_at
      from visa_applications
     where crew_member_id = p_crew
       and status not in ('draft', 'rejected')
  ) c
  order by rnk, d desc nulls last, created_at desc
  limit 1
$$;

revoke all on function public.visa_for_movement(uuid, date) from public, anon;
grant execute on function public.visa_for_movement(uuid, date) to authenticated, service_role;

-- Link the existing movements BEFORE the refresh trigger below exists, so the
-- back-fill doesn't rewrite any visa's Sign On/Off dates.
update public.crew_signon_events
   set visa_id = public.visa_for_movement(crew_member_id, event_date)
 where visa_id is null and crew_member_id is not null and event_date is not null;

create or replace function public.link_movement_to_visa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    if new.visa_id is null and new.crew_member_id is not null and new.event_date is not null then
      new.visa_id := visa_for_movement(new.crew_member_id, new.event_date);
    end if;
  elsif (new.event_date is distinct from old.event_date or new.crew_member_id is distinct from old.crew_member_id)
        and new.visa_id is not distinct from old.visa_id
        and pg_trigger_depth() = 1 then
    -- Re-dated or moved to another crew member: re-pick the visa (unless the visa was
    -- set explicitly, or the change is a visa record correcting its own movement).
    new.visa_id := visa_for_movement(new.crew_member_id, new.event_date);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_link_movement_to_visa on public.crew_signon_events;
create trigger trg_link_movement_to_visa
  before insert or update on public.crew_signon_events
  for each row execute function public.link_movement_to_visa();

-- A visa's Sign On / Sign Off = the latest of each among its movements (kept as
-- is when it has none, e.g. dates that came only from the Excel tracker).
create or replace function public.refresh_visa_movement_dates(p_visa uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update visa_applications v
     set sign_on_date  = coalesce(m.last_on,  v.sign_on_date),
         sign_off_date = coalesce(m.last_off, v.sign_off_date)
    from (
      select max(event_date) filter (where event_type = 'sign_on')  as last_on,
             max(event_date) filter (where event_type = 'sign_off') as last_off
        from crew_signon_events
       where visa_id = p_visa and coalesce(status, 'confirmed') <> 'cancelled'
    ) m
   where v.id = p_visa
     and (v.sign_on_date is distinct from coalesce(m.last_on, v.sign_on_date)
       or v.sign_off_date is distinct from coalesce(m.last_off, v.sign_off_date));
$$;

create or replace function public.movement_refresh_visa_dates()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    if old.visa_id is not null then perform refresh_visa_movement_dates(old.visa_id); end if;
    return old;
  end if;
  if new.visa_id is not null then perform refresh_visa_movement_dates(new.visa_id); end if;
  if old.visa_id is not null and old.visa_id is distinct from new.visa_id then
    perform refresh_visa_movement_dates(old.visa_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_movement_refresh_visa_dates on public.crew_signon_events;
create trigger trg_movement_refresh_visa_dates
  after update of event_date, event_type, status, visa_id or delete on public.crew_signon_events
  for each row execute function public.movement_refresh_visa_dates();

-- New movements: stamp the visa they belong to (was: the crew member's newest visa).
create or replace function public.propagate_crew_movement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_crew_name text;
  v_vessel    text;
  v_tl_type   text;
  v_when      timestamptz;
BEGIN
  v_tl_type := CASE WHEN NEW.event_type = 'sign_off' THEN 'SIGN_OFF' ELSE 'SIGN_ON' END;
  v_when    := COALESCE(NEW.departure_datetime, NEW.arrival_datetime, NEW.event_date::timestamptz, now());

  SELECT COALESCE(c.full_name, NULLIF(trim(concat(c.first_name, ' ', c.last_name)), ''), 'Crew member')
    INTO v_crew_name FROM crew_members c WHERE c.id = NEW.crew_member_id;
  SELECT y.vessel_name INTO v_vessel FROM yachts y WHERE y.id = NEW.yacht_id;

  INSERT INTO crew_timeline_events
    (crew_member_id, yacht_id, event_type, event_datetime, reference_id, reference_type, notes, created_by)
  VALUES
    (NEW.crew_member_id, NEW.yacht_id, v_tl_type, v_when, NEW.id, 'crew_signon_event', NEW.port, NEW.created_by);

  IF v_tl_type = 'SIGN_ON' AND NEW.yacht_id IS NOT NULL THEN
    UPDATE crew_members SET yacht_id = NEW.yacht_id, updated_at = now() WHERE id = NEW.crew_member_id;
  END IF;

  -- The visa keeps the LATEST sign on / sign off made under it, so a back-dated
  -- entry doesn't overwrite a newer one.
  IF NEW.visa_id IS NOT NULL AND COALESCE(NEW.status, 'confirmed') <> 'cancelled' THEN
    IF v_tl_type = 'SIGN_ON' THEN
      UPDATE visa_applications SET sign_on_date = NEW.event_date
       WHERE id = NEW.visa_id AND (sign_on_date IS NULL OR sign_on_date < NEW.event_date);
    ELSE
      UPDATE visa_applications SET sign_off_date = NEW.event_date
       WHERE id = NEW.visa_id AND (sign_off_date IS NULL OR sign_off_date < NEW.event_date);
    END IF;
  END IF;

  INSERT INTO notifications (user_id, type, urgency, title, body, action_url)
  SELECT up.user_id, 'crew_movement', 'info',
         CASE WHEN v_tl_type = 'SIGN_ON' THEN 'Crew sign-on' ELSE 'Crew sign-off' END,
         v_crew_name
           || CASE WHEN v_tl_type = 'SIGN_ON' THEN ' signed on' ELSE ' signed off' END
           || COALESCE(' — ' || v_vessel, '')
           || COALESCE(' on ' || to_char(NEW.event_date, 'DD Mon YYYY'), ''),
         '/crew-immigration/crew/' || NEW.crew_member_id
    FROM user_profiles up
    JOIN roles r ON r.role_id = up.role_id
   WHERE r.name IN ('global_admin', 'org_admin') AND COALESCE(up.active, true);

  RETURN NEW;
END;
$function$;

-- Editing a visa's own Sign On / Sign Off: a changed date CORRECTS the movement it
-- came from (if there is one under this visa); a new date is a new movement,
-- linked to this visa.
create or replace function public.log_visa_movement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email text;
  v_source text;
  v_fixed int;
begin
  -- propagate_crew_movement() / refresh_visa_movement_dates() write sign_on/off
  -- back onto the visa row; skip those echoes so nothing is double-logged.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  v_email := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', '');
  v_source := case when auth.uid() is null then 'sync' else 'app' end;

  if new.sign_on_date is distinct from old.sign_on_date then
    insert into visa_movement_history (visa_id, field, old_date, new_date, changed_by, changed_by_email, source)
    values (new.id, 'sign_on', old.sign_on_date, new.sign_on_date, auth.uid(), v_email, v_source);
    if new.crew_member_id is not null and new.sign_on_date is not null then
      v_fixed := 0;
      -- A correction only if the crew did NOT sign off in between (you can't sign on
      -- twice in a row); otherwise it's a new sign on and the earlier one stays.
      if old.sign_on_date is not null and not (
           coalesce(new.sign_off_date > least(old.sign_on_date, new.sign_on_date) and new.sign_off_date < greatest(old.sign_on_date, new.sign_on_date), false)
           or exists (select 1 from crew_signon_events
                       where visa_id = new.id and event_type = 'sign_off' and coalesce(status, '') <> 'cancelled'
                         and event_date > least(old.sign_on_date, new.sign_on_date)
                         and event_date < greatest(old.sign_on_date, new.sign_on_date))) then
        update crew_signon_events set event_date = new.sign_on_date
         where visa_id = new.id and event_type = 'sign_on' and event_date = old.sign_on_date;
        get diagnostics v_fixed = row_count;
      end if;
      if v_fixed = 0 then
        insert into crew_signon_events (crew_member_id, yacht_id, visa_id, event_type, event_date, notes, created_by)
        values (new.crew_member_id, new.yacht_id, new.id, 'sign_on', new.sign_on_date, 'Recorded from visa record', auth.uid());
      end if;
    end if;
  end if;

  if new.sign_off_date is distinct from old.sign_off_date then
    insert into visa_movement_history (visa_id, field, old_date, new_date, changed_by, changed_by_email, source)
    values (new.id, 'sign_off', old.sign_off_date, new.sign_off_date, auth.uid(), v_email, v_source);
    if new.crew_member_id is not null and new.sign_off_date is not null then
      v_fixed := 0;
      if old.sign_off_date is not null and not (
           coalesce(new.sign_on_date > least(old.sign_off_date, new.sign_off_date) and new.sign_on_date < greatest(old.sign_off_date, new.sign_off_date), false)
           or exists (select 1 from crew_signon_events
                       where visa_id = new.id and event_type = 'sign_on' and coalesce(status, '') <> 'cancelled'
                         and event_date > least(old.sign_off_date, new.sign_off_date)
                         and event_date < greatest(old.sign_off_date, new.sign_off_date))) then
        update crew_signon_events set event_date = new.sign_off_date
         where visa_id = new.id and event_type = 'sign_off' and event_date = old.sign_off_date;
        get diagnostics v_fixed = row_count;
      end if;
      if v_fixed = 0 then
        insert into crew_signon_events (crew_member_id, yacht_id, visa_id, event_type, event_date, notes, created_by)
        values (new.crew_member_id, new.yacht_id, new.id, 'sign_off', new.sign_off_date, 'Recorded from visa record', auth.uid());
      end if;
    end if;
  end if;

  return new;
end;
$function$;
