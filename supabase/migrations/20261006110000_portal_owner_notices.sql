-- Client Portal — tell a boat owner when JLS finishes a job on their boat.
--
-- When an Orbit 2 boat job (orbit2_boat_tasks) moves to "Complete", a notice is
-- queued here; the worker emails it to the boat's portal owners (active
-- captain_accounts on that boat with an email) on its 5-minute tick. Delivery to
-- clients is still governed by CLIENT_EMAIL_ENABLED on the Worker.
--
-- Staff-only table; portal logins never see it.

create table if not exists public.portal_owner_notices (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.orbit2_boats(id) on delete cascade,
  kind text not null check (kind in ('job_complete')),
  source_id uuid not null,
  title text not null,
  body text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  send_error text,
  unique (kind, source_id)
);
create index if not exists portal_owner_notices_pending_idx on public.portal_owner_notices (created_at) where sent_at is null;

alter table public.portal_owner_notices enable row level security;
drop policy if exists staff_read on public.portal_owner_notices;
create policy staff_read on public.portal_owner_notices for select to authenticated using (not public.is_portal_captain());
drop policy if exists portal_captain_block on public.portal_owner_notices;
create policy portal_captain_block on public.portal_owner_notices as restrictive for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());

create or replace function public.portal_owner_notice_on_job() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_label text;
begin
  if new.status is distinct from 'Complete' or old.status is not distinct from 'Complete' then return new; end if;
  -- Only boats that actually have a portal owner.
  if not exists (select 1 from public.captain_accounts where boat_id = new.boat_id and active) then return new; end if;
  v_label := case new.kind
    when 'booked' then 'Service' when 'maintenance' then 'Maintenance' when 'defect' then 'Defect repair'
    when 'inventory' then 'Inventory check' when 'rya_checklist' then 'RYA checklist'
    when 'dma_checklist' then 'DMA checklist' when 'fma_checklist' then 'FMA checklist' else 'Job' end;
  begin
    insert into public.portal_owner_notices (boat_id, kind, source_id, title, body)
    values (new.boat_id, 'job_complete', new.id,
            coalesce(nullif(new.title, ''), v_label) || ' — completed',
            v_label || coalesce(' ' || new.job_no, '') || ' completed by JLS Yachts.')
    on conflict (kind, source_id) do nothing;
  exception when others then
    raise warning 'owner notice failed: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.portal_owner_notice_on_job() from public, anon, authenticated;

drop trigger if exists portal_owner_notice_job on public.orbit2_boat_tasks;
create trigger portal_owner_notice_job after update of status on public.orbit2_boat_tasks
  for each row execute function public.portal_owner_notice_on_job();
