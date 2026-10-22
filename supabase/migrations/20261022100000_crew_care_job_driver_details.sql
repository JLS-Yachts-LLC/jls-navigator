-- Crew Care job cards — the driver, and telling the requester who it is.
--
-- Asked for by Maddie (22 Oct 2026, for Capt. Mike / Capt. Steve's transfers):
-- Crew Care marks each request Assigned or Unassigned and enters the assigned
-- driver's details, and the person who raised the request gets those details
-- once a driver is on it.
--
--   driver_id / driver_name / driver_phone   who is driving (a crew_drivers row,
--                                            or a name typed in for a third party)
--   vehicle_id / vehicle                     what they're driving
--   driver_assigned_at                       stamped whenever the details change;
--                                            null = Unassigned
--   notify_emails                            where the driver details are emailed
--                                            (filled with the raiser's address)
--   driver_notice_claimed_at / _result       the worker's claim + what happened
--
-- The raiser's in-app bell rings from here (internal jobs only — a portal
-- captain hears through Client Requests, never automatically). The email goes
-- from the worker tick (lib/crew-care/job-alerts.server, sendDriverNotices).
--
-- A linked trip (Create trip) keeps the same driver and vehicle both ways, so
-- assigning on the Trips board fills the job card too. Each side only writes
-- when the value differs, so the two triggers can't loop.

alter table public.crew_care_jobs
  add column if not exists driver_id                uuid references public.crew_drivers(id) on delete set null,
  add column if not exists driver_name              text,
  add column if not exists driver_phone             text,
  add column if not exists vehicle_id               uuid references public.crew_vehicles(id) on delete set null,
  add column if not exists vehicle                  text,
  add column if not exists driver_assigned_at       timestamptz,
  add column if not exists notify_emails            text[] not null default '{}',
  add column if not exists driver_notice_claimed_at timestamptz,
  add column if not exists driver_notice_result     text;

create index if not exists crew_care_jobs_driver_notice_idx on public.crew_care_jobs (driver_assigned_at)
  where driver_assigned_at is not null and driver_notice_claimed_at is null;

-- ── Reference, timestamps, and the driver stamp ───────────────────────────
create or replace function public.crew_care_job_biu() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.reference is null or new.reference = '' then
      new.reference := 'JC-' || lpad(nextval('public.crew_care_job_ref_seq')::text, 4, '0');
    end if;
  else
    new.reference := old.reference;
    new.updated_at := now();
  end if;
  if new.status = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
  if new.status <> 'completed' then new.completed_at := null; end if;

  new.driver_name := nullif(btrim(coalesce(new.driver_name, '')), '');
  new.driver_phone := nullif(btrim(coalesce(new.driver_phone, '')), '');
  new.vehicle := nullif(btrim(coalesce(new.vehicle, '')), '');
  if new.driver_name is null then
    -- Unassigned: nothing to tell anyone.
    new.driver_id := null;
    new.driver_assigned_at := null;
    new.driver_notice_claimed_at := null;
    new.driver_notice_result := null;
  elsif tg_op = 'INSERT'
     or (new.driver_name, new.driver_phone, new.vehicle) is distinct from (old.driver_name, old.driver_phone, old.vehicle) then
    -- New or changed details go out again. clock_timestamp so a second change
    -- in the same transaction still reads as new.
    new.driver_assigned_at := clock_timestamp();
    new.driver_notice_claimed_at := null;
    new.driver_notice_result := null;
  end if;
  return new;
end $$;

-- ── The raiser's bell when a driver is assigned ───────────────────────────
create or replace function public.crew_care_job_driver_bell() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.source <> 'internal' or new.created_by is null or new.driver_name is null
     or new.driver_assigned_at is not distinct from old.driver_assigned_at
     or new.created_by is not distinct from auth.uid() then
    return new;
  end if;
  begin
    insert into public.notifications (user_id, type, urgency, title, body, action_url, metadata)
    values (new.created_by, 'crew_care_driver', 'info',
            'Driver assigned — ' || new.reference || ': ' || new.title,
            left(concat_ws(' · ', new.driver_name, new.driver_phone, new.vehicle,
              case when new.needed_at is not null then to_char(new.needed_at at time zone 'Asia/Dubai', 'DD Mon HH24:MI') end), 500),
            '/crew-cab/jobs?job=' || new.id,
            jsonb_build_object('job_id', new.id));
  exception when others then
    raise warning 'crew care driver bell failed: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists crew_care_jobs_driver_bell on public.crew_care_jobs;
create trigger crew_care_jobs_driver_bell after update on public.crew_care_jobs
  for each row execute function public.crew_care_job_driver_bell();

-- ── Job card → linked trip ────────────────────────────────────────────────
create or replace function public.crew_care_job_driver_to_trip() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.trip_id is not null
     and (new.driver_id, new.vehicle_id) is distinct from (old.driver_id, old.vehicle_id) then
    update public.crew_trips set driver_id = new.driver_id, vehicle_id = new.vehicle_id
     where id = new.trip_id and (driver_id, vehicle_id) is distinct from (new.driver_id, new.vehicle_id);
  end if;
  return new;
end $$;
drop trigger if exists crew_care_job_driver_to_trip on public.crew_care_jobs;
create trigger crew_care_job_driver_to_trip after update on public.crew_care_jobs
  for each row execute function public.crew_care_job_driver_to_trip();

-- ── Trips board → job card ────────────────────────────────────────────────
create or replace function public.crew_care_trip_driver_to_job() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_phone text; v_vehicle text;
begin
  if (new.driver_id, new.vehicle_id) is not distinct from (old.driver_id, old.vehicle_id) then return new; end if;
  select full_name, phone into v_name, v_phone from public.crew_drivers where id = new.driver_id;
  select nullif(concat_ws(' · ', nullif(concat_ws(' ', color, make, model), ''), registration), '')
    into v_vehicle from public.crew_vehicles where id = new.vehicle_id;
  update public.crew_care_jobs j
     set driver_id    = new.driver_id,
         driver_name  = case when new.driver_id is distinct from j.driver_id then v_name else j.driver_name end,
         driver_phone = case when new.driver_id is distinct from j.driver_id then v_phone else j.driver_phone end,
         vehicle_id   = new.vehicle_id,
         vehicle      = case when new.vehicle_id is distinct from j.vehicle_id then v_vehicle else j.vehicle end
   where j.trip_id = new.id
     and (j.driver_id, j.vehicle_id) is distinct from (new.driver_id, new.vehicle_id);
  return new;
end $$;
drop trigger if exists crew_care_trip_driver_to_job on public.crew_trips;
create trigger crew_care_trip_driver_to_job after update of driver_id, vehicle_id on public.crew_trips
  for each row execute function public.crew_care_trip_driver_to_job();

revoke all on function public.crew_care_job_driver_bell() from public, anon, authenticated;
revoke all on function public.crew_care_job_driver_to_trip() from public, anon, authenticated;
revoke all on function public.crew_care_trip_driver_to_job() from public, anon, authenticated;
