-- Client Portal — requests and live chat for small-boat owners.
--
-- A request (captain_requests) and a chat thread (portal_chats) belonged to a
-- yacht. Boat owners now raise requests and chat too, so each names a yacht OR
-- an Orbit 2 managed boat — the same shape as captain_accounts. A portal login
-- reads and writes only rows for its own yachts or boats.

-- Requests
alter table public.captain_requests alter column yacht_id drop not null;
alter table public.captain_requests
  add column if not exists boat_id uuid references public.orbit2_boats(id) on delete cascade;
alter table public.captain_requests drop constraint if exists captain_requests_one_vessel;
alter table public.captain_requests
  add constraint captain_requests_one_vessel check (num_nonnulls(yacht_id, boat_id) = 1);
create index if not exists captain_requests_boat_idx on public.captain_requests (boat_id, created_at desc) where boat_id is not null;

drop policy if exists captain_insert on public.captain_requests;
create policy captain_insert on public.captain_requests for insert to authenticated
  with check (
    public.is_portal_captain() and public.portal_aal2() and created_by = auth.uid()
    and (yacht_id in (select public.captain_yacht_ids()) or boat_id in (select public.captain_boat_ids()))
  );
drop policy if exists captain_select on public.captain_requests;
create policy captain_select on public.captain_requests for select to authenticated
  using (
    public.is_portal_captain() and public.portal_aal2()
    and (yacht_id in (select public.captain_yacht_ids()) or boat_id in (select public.captain_boat_ids()))
  );
drop policy if exists captain_update on public.captain_requests;
create policy captain_update on public.captain_requests for update to authenticated
  using (
    public.is_portal_captain() and public.portal_aal2() and created_by = auth.uid()
    and (yacht_id in (select public.captain_yacht_ids()) or boat_id in (select public.captain_boat_ids()))
  )
  with check (yacht_id in (select public.captain_yacht_ids()) or boat_id in (select public.captain_boat_ids()));

-- Chat threads (one per portal account, which is per vessel)
alter table public.portal_chats alter column yacht_id drop not null;
alter table public.portal_chats
  add column if not exists boat_id uuid references public.orbit2_boats(id) on delete cascade;
alter table public.portal_chats drop constraint if exists portal_chats_one_vessel;
alter table public.portal_chats
  add constraint portal_chats_one_vessel check (num_nonnulls(yacht_id, boat_id) = 1);

-- Alerts: name the boat when there's no yacht.
create or replace function public.portal_alert_on_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_vessel text;
begin
  select coalesce(
    (select vessel_name from public.yachts where id = new.yacht_id),
    (select name from public.orbit2_boats where id = new.boat_id)
  ) into v_vessel;
  begin
    perform public.portal_alert_raise(
      new.yacht_id, 'request', new.id,
      coalesce(v_vessel, 'Client') || ': ' || coalesce(new.reference || ' · ', '') || new.title,
      left(coalesce(new.details, ''), 2000),
      case when new.priority in ('high', 'urgent') then 'warning' else 'info' end
    );
  exception when others then
    raise warning 'portal alert failed: %', sqlerrm;
  end;
  return new;
end $$;

create or replace function public.portal_alert_on_request_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.sender_role is distinct from 'captain' then return new; end if;
  select cr.yacht_id, cr.reference, cr.title, coalesce(y.vessel_name, b.name) as vessel_name into r
    from public.captain_requests cr
    left join public.yachts y on y.id = cr.yacht_id
    left join public.orbit2_boats b on b.id = cr.boat_id
   where cr.id = new.request_id;
  begin
    perform public.portal_alert_raise(
      r.yacht_id, 'request_message', new.request_id,
      coalesce(r.vessel_name, 'Client') || ': reply on ' || coalesce(r.reference, 'a request') || ' from ' || coalesce(new.sender_name, 'the client'),
      left(new.body, 2000), 'info'
    );
  exception when others then
    raise warning 'portal alert failed: %', sqlerrm;
  end;
  return new;
end $$;

create or replace function public.portal_alert_on_chat_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.sender_role is distinct from 'portal' then return new; end if;
  select c.yacht_id, coalesce(y.vessel_name, b.name) as vessel_name into r
    from public.portal_chats c
    left join public.yachts y on y.id = c.yacht_id
    left join public.orbit2_boats b on b.id = c.boat_id
   where c.id = new.chat_id;
  begin
    perform public.portal_alert_raise(
      r.yacht_id, 'chat', new.chat_id,
      coalesce(r.vessel_name, 'Client') || ': chat from ' || coalesce(new.sender_name, 'the client'),
      left(new.body, 2000), 'info'
    );
  exception when others then
    raise warning 'portal alert failed: %', sqlerrm;
  end;
  return new;
end $$;

revoke all on function public.portal_alert_on_request() from public, anon, authenticated;
revoke all on function public.portal_alert_on_request_message() from public, anon, authenticated;
revoke all on function public.portal_alert_on_chat_message() from public, anon, authenticated;
