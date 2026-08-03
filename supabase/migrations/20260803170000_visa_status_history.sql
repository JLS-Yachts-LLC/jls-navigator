-- Full history of visa application status changes — who submitted / approved /
-- cancelled a visa, and when.
--
-- The application row keeps only its CURRENT status, so a cancellation used to
-- leave no trace of when it happened or who did it. Status is changed from
-- several paths (the detail page's status buttons, the back-office
-- /api/visa/applications/:id/status action, the issued-visa attach flow, and the
-- tracker sync), so this is logged by a trigger rather than at each call site —
-- that way no path can bypass the log.
--
-- Complements visa_movement_history (sign on/off dates) and visa_admin_actions
-- (back-office operational actions).

create table if not exists public.visa_status_history (
  id uuid primary key default gen_random_uuid(),
  visa_id uuid not null references public.visa_applications(id) on delete cascade,
  old_status text,
  new_status text,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  changed_by_email text,
  source text not null default 'app'
);

create index if not exists visa_status_history_visa_idx
  on public.visa_status_history (visa_id, changed_at desc);

alter table public.visa_status_history enable row level security;

create policy vsh_read on public.visa_status_history
  for select using ((select auth.role()) = 'authenticated' and not is_portal_captain());

-- Writes happen only via the trigger below (SECURITY DEFINER); no client insert policy.

create or replace function public.log_visa_status_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text;
  v_source text;
begin
  v_email  := nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'email', '');
  v_source := case when auth.uid() is null then 'sync' else 'app' end;

  -- Creation: record the status the application started life with, so the
  -- history reads as a complete chain from draft through to cancelled.
  if tg_op = 'INSERT' then
    if new.status is not null then
      insert into visa_status_history (visa_id, old_status, new_status, changed_by, changed_by_email, source)
      values (new.id, null, new.status, auth.uid(), v_email, v_source);
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into visa_status_history (visa_id, old_status, new_status, changed_by, changed_by_email, source)
    values (new.id, old.status, new.status, auth.uid(), v_email, v_source);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_visa_status_insert on public.visa_applications;
create trigger trg_log_visa_status_insert
  after insert on public.visa_applications
  for each row execute function public.log_visa_status_change();

drop trigger if exists trg_log_visa_status_change on public.visa_applications;
create trigger trg_log_visa_status_change
  after update of status on public.visa_applications
  for each row execute function public.log_visa_status_change();
