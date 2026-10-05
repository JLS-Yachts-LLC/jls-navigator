-- The only way consent changes. Every call writes a wa_consent_events row, so
-- "when did this person agree, to what, and how" always has an answer.
--
-- Staff (signed in, communications edit) may record a consent they obtained by
-- phone or in person — channel 'staff' only, and a note is mandatory, because
-- an unexplained manual opt-in is no proof at all. Every other channel (the
-- email link, WhatsApp replies, Meta's preference webhook) is the server's,
-- via the service role.
create or replace function public.wa_record_consent(
  p_contact_id uuid,
  p_action text,
  p_updates boolean,
  p_marketing boolean,
  p_channel text,
  p_note text default null,
  p_wording_version text default null,
  p_wording text default null,
  p_phone text default null,
  p_ip text default null,
  p_user_agent text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_email text;
  v_status text;
  v_updates boolean;
  v_marketing boolean;
begin
  if not v_service then
    if v_uid is null or not public.has_module_permission(v_uid, 'communications', 'edit') then
      raise exception 'Not allowed to record WhatsApp consent';
    end if;
    if p_channel <> 'staff' then
      raise exception 'Staff can only record consent with channel staff';
    end if;
    if p_action in ('opted_in', 'updated') and coalesce(trim(p_note), '') = '' then
      raise exception 'Say how this consent was given (for example: by phone with the captain, 5 Oct)';
    end if;
    select email into v_email from auth.users where id = v_uid;
  end if;

  select consent_status, consent_updates, consent_marketing
    into v_status, v_updates, v_marketing
  from wa_contacts where id = p_contact_id for update;
  if not found then raise exception 'Contact not found'; end if;

  if p_action = 'invited' then
    -- An invitation never overrides a decision already made.
    if v_status in ('none', 'invited') then v_status := 'invited'; end if;
  elsif p_action = 'opted_out' then
    -- A full opt-out clears everything. A marketing-only opt-out (the "Stop
    -- promotions" button) passes p_updates = the current value to keep updates.
    v_updates := coalesce(p_updates, false);
    v_marketing := coalesce(p_marketing, false);
    v_status := case when v_updates or v_marketing then 'opted_in' else 'opted_out' end;
  else
    v_updates := coalesce(p_updates, v_updates);
    v_marketing := coalesce(p_marketing, v_marketing);
    v_status := case when v_updates or v_marketing then 'opted_in' else 'opted_out' end;
  end if;

  perform set_config('wa.consent_write', 'on', true);
  update wa_contacts set
    consent_status = v_status,
    consent_updates = v_updates,
    consent_marketing = v_marketing,
    consent_at = case when p_action in ('opted_in', 'updated') and (v_updates or v_marketing) then now() else consent_at end,
    opted_out_at = case when v_status = 'opted_out' and p_action <> 'invited' then now()
                        when v_status = 'opted_in' then null else opted_out_at end,
    phone_e164 = coalesce(p_phone, phone_e164),
    phone_confirmed = case when p_phone is not null and p_channel in ('email_link', 'staff') then true else phone_confirmed end
  where id = p_contact_id;
  perform set_config('wa.consent_write', 'off', true);

  insert into wa_consent_events (contact_id, action, consent_updates, consent_marketing, channel,
    wording_version, wording, phone_e164, ip, user_agent, actor_user_id, actor_email, note)
  values (p_contact_id, p_action, v_updates, v_marketing, p_channel,
    p_wording_version, p_wording, coalesce(p_phone, (select phone_e164 from wa_contacts where id = p_contact_id)),
    p_ip, p_user_agent, v_uid, v_email, nullif(trim(p_note), ''));
end;
$$;

-- Refuse a consent change that didn't come through wa_record_consent().
create or replace function public.wa_contacts_guard_consent()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('wa.consent_write', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.consent_status := 'none';
    new.consent_updates := false;
    new.consent_marketing := false;
    new.consent_at := null;
    new.opted_out_at := null;
    new.phone_confirmed := false;
    return new;
  end if;
  if new.consent_status is distinct from old.consent_status
     or new.consent_updates is distinct from old.consent_updates
     or new.consent_marketing is distinct from old.consent_marketing
     or new.consent_at is distinct from old.consent_at
     or new.opted_out_at is distinct from old.opted_out_at
     or new.phone_confirmed is distinct from old.phone_confirmed then
    raise exception 'WhatsApp consent can only be changed through wa_record_consent()';
  end if;
  -- The client agreed to messages at the number they gave, not at whatever it
  -- is later edited to.
  if new.phone_e164 is distinct from old.phone_e164 and old.phone_confirmed then
    raise exception 'This number was confirmed by the client. Send them a new opt-in to change it.';
  end if;
  return new;
end;
$$;

drop trigger if exists wa_contacts_guard_consent on public.wa_contacts;
create trigger wa_contacts_guard_consent before insert or update on public.wa_contacts
  for each row execute function public.wa_contacts_guard_consent();

-- Why a contact may NOT be sent a template of this category right now, or null
-- if they may. The send path checks it per message at the moment of sending.
create or replace function public.wa_can_message(p_contact_id uuid, p_category text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when c.id is null then 'contact not found'
    when c.phone_e164 is null then 'no WhatsApp number'
    when c.consent_status = 'opted_out' then 'opted out'
    when c.consent_status <> 'opted_in' then 'has not opted in'
    when p_category = 'MARKETING' and not c.consent_marketing then 'not opted in to news & offers'
    when p_category = 'UTILITY' and not c.consent_updates then 'not opted in to updates'
    else null
  end
  from (select 1) one left join wa_contacts c on c.id = p_contact_id;
$$;

revoke execute on function public.wa_record_consent(uuid, text, boolean, boolean, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.wa_record_consent(uuid, text, boolean, boolean, text, text, text, text, text, text, text) to authenticated, service_role;
revoke execute on function public.wa_can_message(uuid, text) from public, anon, authenticated;
grant execute on function public.wa_can_message(uuid, text) to service_role;
revoke execute on function public.wa_contacts_guard_consent() from public, anon, authenticated;
