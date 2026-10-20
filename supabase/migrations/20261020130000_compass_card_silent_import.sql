-- Compass Card events: a row that arrives already marked as alerted rings no bell.
--
-- Used for the one-off import of what was already waiting in Compass Card when the
-- integration went live (pending vendors and offers, recent unapproved sign-ups):
-- those rows are stored with alert_claimed_at set, so nobody is sent hundreds of
-- alerts for old items. Normal events arrive unclaimed and ring the bell as before.
create or replace function public.compass_card_event_bell() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.alert_claimed_at is not null then
    return new;
  end if;
  begin
    insert into public.notifications (user_id, type, urgency, title, body, action_url, metadata)
    select r.user_id, 'compass_card_' || new.event_type,
           case when new.event_type in ('vendor_signup', 'offer_submitted') then 'warning' else 'info' end,
           left('Compass Card: ' || new.title, 300),
           left(coalesce(new.summary, ''), 500),
           '/compass-card?event=' || new.id,
           jsonb_build_object('compass_event_id', new.id, 'event_type', new.event_type)
      from public.compass_card_recipients(new.team) r;
  exception when others then
    raise warning 'compass card bell failed: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.compass_card_event_bell() from public, anon, authenticated;

create index if not exists compass_card_events_occurred_idx on public.compass_card_events (occurred_at desc);
