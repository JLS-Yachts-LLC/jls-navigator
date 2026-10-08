-- Automated reports can also go by WhatsApp: the approved "vessel_report"
-- template with the report PDF as its document, to the vessel's own WhatsApp
-- contacts picked on the report (each must have agreed to updates — checked at
-- send time by wa_can_message). Email and WhatsApp are switched separately.
alter table public.vessel_report_subscriptions
  add column if not exists send_email boolean not null default true,
  add column if not exists send_whatsapp boolean not null default false,
  add column if not exists wa_contact_ids uuid[] not null default '{}';

-- Switched on only with someone to send it to, on a channel that's on.
alter table public.vessel_report_subscriptions drop constraint if exists vessel_report_needs_recipient;
alter table public.vessel_report_subscriptions add constraint vessel_report_needs_recipient check (
  not enabled
  or (send_email and cardinality(recipients) > 0)
  or (send_whatsapp and cardinality(wa_contact_ids) > 0)
);

grant update (send_email, send_whatsapp, wa_contact_ids) on public.vessel_report_subscriptions to authenticated;

alter table public.vessel_report_runs add column if not exists whatsapp_to text[] not null default '{}';

-- Log channel changes too.
create or replace function public.vessel_report_subscriptions_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_actions text[] := '{}';
  r record;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  select coalesce(nullif(display_name, ''), email) into v_name from public.user_profiles where user_id = auth.uid();
  if tg_op = 'INSERT' then
    v_actions := array['opted_in'];
    r := new;
  elsif tg_op = 'DELETE' then
    v_actions := array['removed'];
    r := old;
  else
    r := new;
    if new.enabled is distinct from old.enabled then v_actions := v_actions || (case when new.enabled then 'switched_on' else 'switched_off' end); end if;
    if new.recipients is distinct from old.recipients or new.cc is distinct from old.cc then v_actions := v_actions || 'recipients_changed'; end if;
    if new.schedule is distinct from old.schedule then v_actions := v_actions || 'schedule_changed'; end if;
    if new.client_can_manage is distinct from old.client_can_manage then v_actions := v_actions || (case when new.client_can_manage then 'offered_to_client' else 'withdrawn_from_client' end); end if;
    if new.send_email is distinct from old.send_email or new.send_whatsapp is distinct from old.send_whatsapp then v_actions := v_actions || 'channels_changed'; end if;
    if new.wa_contact_ids is distinct from old.wa_contact_ids then v_actions := v_actions || 'whatsapp_contacts_changed'; end if;
  end if;
  if cardinality(v_actions) > 0 then
    insert into public.vessel_report_events (subscription_id, yacht_id, report_key, actor_kind, actor_id, actor_name, action, detail)
    select case when tg_op = 'DELETE' then null else r.id end, r.yacht_id, r.report_key, 'staff', auth.uid(), v_name, a,
           jsonb_build_object('recipients', r.recipients, 'cc', r.cc, 'schedule', r.schedule, 'enabled', r.enabled,
                              'send_email', r.send_email, 'send_whatsapp', r.send_whatsapp, 'wa_contacts', cardinality(r.wa_contact_ids))
    from unnest(v_actions) a;
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.vessel_report_subscriptions_log() from public, anon, authenticated;
