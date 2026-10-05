-- The send pipeline, in the database so the consent rule is applied in one place
-- (wa_can_message) and a send can never message anyone twice.

-- Set when a batch takes a message to send; a second batch running at the same
-- time (a double-click on Send) skips it. A claim older than 10 minutes is
-- treated as abandoned, so a crashed batch doesn't strand its messages.
alter table public.wa_messages add column if not exists claimed_at timestamptz;

-- Queue a campaign: one row per active list member, the ineligible ones marked
-- skipped with the reason now, so the send report shows everyone. Idempotent —
-- a campaign is only queued once.
create or replace function public.wa_queue_campaign(p_campaign uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_category text; v_list uuid; n_queued int := 0; n_skipped int := 0;
begin
  select t.category, c.list_id into v_category, v_list
  from wa_campaigns c join wa_templates t on t.id = c.template_id where c.id = p_campaign;
  if v_category is null then raise exception 'Campaign has no template'; end if;

  if not exists (select 1 from wa_messages where campaign_id = p_campaign) then
    insert into wa_messages (campaign_id, contact_id, phone_e164, status, skip_reason)
    select p_campaign, m.contact_id, ct.phone_e164,
           case when r.reason is null then 'queued' else 'skipped' end, r.reason
    from wa_list_members m
    join wa_contacts ct on ct.id = m.contact_id
    cross join lateral (select public.wa_can_message(m.contact_id, v_category) as reason) r
    where m.list_id = v_list and m.removed_at is null;
  end if;

  select count(*) filter (where status = 'queued'), count(*) filter (where status = 'skipped')
    into n_queued, n_skipped from wa_messages where campaign_id = p_campaign;
  return jsonb_build_object('queued', n_queued, 'skipped', n_skipped);
end;
$$;

-- Take the next batch to send. Consent is re-checked here, at the moment of
-- sending: someone who opted out after the campaign was queued is skipped.
create or replace function public.wa_claim_batch(p_campaign uuid, p_limit int)
returns table (message_id uuid, contact_id uuid, phone_e164 text, contact_name text)
language plpgsql security definer set search_path = public as $$
declare v_category text;
begin
  select t.category into v_category
  from wa_campaigns c join wa_templates t on t.id = c.template_id where c.id = p_campaign;

  return query
  with picked as (
    select m.id from wa_messages m
    where m.campaign_id = p_campaign and m.status = 'queued'
      and (m.claimed_at is null or m.claimed_at < now() - interval '10 minutes')
    order by m.queued_at
    limit p_limit
    for update skip locked
  ),
  checked as (
    select m.id, m.contact_id, public.wa_can_message(m.contact_id, v_category) as reason
    from wa_messages m join picked p on p.id = m.id
  ),
  skipped as (
    update wa_messages m set status = 'skipped', skip_reason = c.reason
    from checked c where m.id = c.id and c.reason is not null
    returning m.id
  ),
  claimed as (
    update wa_messages m set claimed_at = now()
    from checked c where m.id = c.id and c.reason is null
    returning m.id, m.contact_id
  )
  select cl.id, cl.contact_id, ct.phone_e164, ct.name
  from claimed cl join wa_contacts ct on ct.id = cl.contact_id;
end;
$$;

-- Apply a delivery receipt from Meta. Statuses only move forward
-- (sent → delivered → read); a failure is recorded whenever it arrives.
create or replace function public.wa_apply_status(
  p_wamid text, p_status text, p_at timestamptz, p_error_code text default null, p_error text default null)
returns void language sql security definer set search_path = public as $$
  update wa_messages set
    status = case
      when p_status = 'failed' then 'failed'
      when array_position(array['queued','sent','delivered','read'], p_status)
         > coalesce(array_position(array['queued','sent','delivered','read'], status), 0) then p_status
      else status end,
    sent_at      = case when p_status = 'sent' then coalesce(sent_at, p_at) else sent_at end,
    delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, p_at) else delivered_at end,
    read_at      = case when p_status = 'read' then coalesce(read_at, p_at) else read_at end,
    failed_at    = case when p_status = 'failed' then coalesce(failed_at, p_at) else failed_at end,
    error_code   = coalesce(p_error_code, error_code),
    error_message = coalesce(p_error, error_message)
  where wa_message_id = p_wamid and status <> 'skipped';
$$;

revoke execute on function public.wa_queue_campaign(uuid) from public, anon, authenticated;
revoke execute on function public.wa_claim_batch(uuid, int) from public, anon, authenticated;
revoke execute on function public.wa_apply_status(text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.wa_queue_campaign(uuid) to service_role;
grant execute on function public.wa_claim_batch(uuid, int) to service_role;
grant execute on function public.wa_apply_status(text, text, timestamptz, text, text) to service_role;
