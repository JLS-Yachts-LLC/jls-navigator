-- Full daily history of sign on/off changes on visa records.
-- The visa record itself keeps only ONE sign_on_date/sign_off_date pair (it
-- mirrors the SharePoint tracker), so every change used to overwrite the last
-- movement. This table records each genuine change, from any source (app UI,
-- tracker sync, service role), regardless of whether the visa is linked to a
-- crew_members row.

create table if not exists public.visa_movement_history (
  id uuid primary key default gen_random_uuid(),
  visa_id uuid not null references public.visa_applications(id) on delete cascade,
  field text not null check (field in ('sign_on','sign_off')),
  old_date date,
  new_date date,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  changed_by_email text,
  source text not null default 'app'
);

create index if not exists visa_movement_history_visa_idx
  on public.visa_movement_history (visa_id, changed_at desc);

alter table public.visa_movement_history enable row level security;

create policy vmh_read on public.visa_movement_history
  for select using ((select auth.role()) = 'authenticated' and not is_portal_captain());

-- Writes happen only via the trigger below (SECURITY DEFINER); no client insert policy.

create or replace function public.log_visa_movement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text;
  v_source text;
begin
  -- propagate_crew_movement() writes sign_on/off back onto the latest visa row
  -- whenever a crew_signon_events row is inserted; skip those echoes so a
  -- movement recorded via the Sign On/Off module isn't double-logged.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  v_email := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', '');
  v_source := case when auth.uid() is null then 'sync' else 'app' end;

  if new.sign_on_date is distinct from old.sign_on_date then
    insert into visa_movement_history (visa_id, field, old_date, new_date, changed_by, changed_by_email, source)
    values (new.id, 'sign_on', old.sign_on_date, new.sign_on_date, auth.uid(), v_email, v_source);
    -- Mirror into the canonical Movements module when the visa is linked to a
    -- crew record (its propagation handles timeline + notifications).
    if new.crew_member_id is not null and new.sign_on_date is not null then
      insert into crew_signon_events (crew_member_id, yacht_id, event_type, event_date, notes, created_by)
      values (new.crew_member_id, new.yacht_id, 'sign_on', new.sign_on_date, 'Recorded from visa record', auth.uid());
    end if;
  end if;

  if new.sign_off_date is distinct from old.sign_off_date then
    insert into visa_movement_history (visa_id, field, old_date, new_date, changed_by, changed_by_email, source)
    values (new.id, 'sign_off', old.sign_off_date, new.sign_off_date, auth.uid(), v_email, v_source);
    if new.crew_member_id is not null and new.sign_off_date is not null then
      insert into crew_signon_events (crew_member_id, yacht_id, event_type, event_date, notes, created_by)
      values (new.crew_member_id, new.yacht_id, 'sign_off', new.sign_off_date, 'Recorded from visa record', auth.uid());
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_visa_movement on public.visa_applications;
create trigger trg_log_visa_movement
  after update of sign_on_date, sign_off_date on public.visa_applications
  for each row execute function public.log_visa_movement();
