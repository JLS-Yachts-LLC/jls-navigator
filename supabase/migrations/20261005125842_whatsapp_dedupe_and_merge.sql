-- 1) A broadcast reaches each WhatsApp number once, however many contact
--    records share it. The first eligible member keeps the message; the rest
--    are skipped with a reason, so the report still shows them.
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
    select p_campaign, x.contact_id, x.phone_e164,
           case when x.reason is null and x.rn = 1 then 'queued' else 'skipped' end,
           case when x.reason is not null then x.reason
                when x.rn > 1 then 'same WhatsApp number as another recipient on this list' end
    from (
      select m.contact_id, ct.phone_e164, r.reason,
             case when r.reason is null
                  then row_number() over (partition by (r.reason is null), ct.phone_e164 order by m.added_at, m.contact_id)
                  else 1 end as rn
      from wa_list_members m
      join wa_contacts ct on ct.id = m.contact_id
      cross join lateral (select public.wa_can_message(m.contact_id, v_category) as reason) r
      where m.list_id = v_list and m.removed_at is null
    ) x;
  end if;

  select count(*) filter (where status = 'queued'), count(*) filter (where status = 'skipped')
    into n_queued, n_skipped from wa_messages where campaign_id = p_campaign;
  return jsonb_build_object('queued', n_queued, 'skipped', n_skipped);
end;
$$;

-- 2) Remember which imported records were merged away, so "Import from vessels"
--    doesn't bring the duplicate straight back.
alter table public.wa_contacts add column if not exists merged_sources text[] not null default '{}';

-- 3) Merge duplicate contacts (same person) into one.
create or replace function public.wa_merge_contacts(p_keep uuid, p_merge uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_keep wa_contacts%rowtype;
  v_ids uuid[];
  v_all uuid[];
  v_win uuid;
  v_w wa_contacts%rowtype;
  v_names text;
  v_sources text[];
  v_final wa_contacts%rowtype;
begin
  if v_uid is null or not public.has_module_permission(v_uid, 'communications', 'edit') or public.is_portal_captain() then
    raise exception 'Not allowed to merge WhatsApp contacts';
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_merge) x where x is not null and x <> p_keep;
  if v_ids is null then raise exception 'Choose at least one duplicate to merge'; end if;
  if cardinality(v_ids) > 20 then raise exception 'Merge at most 20 contacts at a time'; end if;
  v_all := v_ids || p_keep;

  select * into v_keep from wa_contacts where id = p_keep for update;
  if not found then raise exception 'The contact to keep was not found'; end if;
  perform 1 from wa_contacts where id = any(v_ids) for update;
  if (select count(*) from wa_contacts where id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'A duplicate was not found — refresh and try again';
  end if;

  -- Only the same person: same WhatsApp number, or (where one has no number) the same email.
  if exists (
    select 1 from wa_contacts c where c.id = any(v_ids) and not (
      (c.phone_e164 is not null and c.phone_e164 = v_keep.phone_e164)
      or ((c.phone_e164 is null or v_keep.phone_e164 is null)
          and c.email is not null and v_keep.email is not null and lower(c.email) = lower(v_keep.email))
    )
  ) then
    raise exception 'Only contacts with the same WhatsApp number (or, without a number, the same email) can be merged';
  end if;

  select string_agg(name, ', ' order by name) into v_names from wa_contacts where id = any(v_ids);
  select coalesce(array_agg(s), '{}') into v_sources from (
    select source || ':' || source_id as s from wa_contacts where id = any(v_ids) and source_id is not null
    union select unnest(merged_sources) from wa_contacts where id = any(v_ids)
  ) q;

  -- Consent follows the person's latest decision across all the records.
  select e.contact_id into v_win from wa_consent_events e
   where e.contact_id = any(v_all) and e.action in ('opted_in', 'opted_out', 'updated')
   order by e.created_at desc, e.id desc limit 1;
  if v_win is not null then select * into v_w from wa_contacts where id = v_win; end if;

  -- Lists: one active membership per list; extras are closed with a reason.
  update wa_list_members m set removed_at = now(), removed_by = v_uid, remove_reason = 'Merged into ' || v_keep.name
   where m.contact_id = any(v_ids) and m.removed_at is null
     and exists (select 1 from wa_list_members k where k.list_id = m.list_id and k.contact_id = p_keep and k.removed_at is null);
  update wa_list_members m set removed_at = now(), removed_by = v_uid, remove_reason = 'Merged into ' || v_keep.name
   where m.contact_id = any(v_ids) and m.removed_at is null
     and exists (select 1 from wa_list_members o where o.list_id = m.list_id and o.contact_id = any(v_ids)
                 and o.removed_at is null and o.id < m.id);
  update wa_list_members set contact_id = p_keep where contact_id = any(v_ids);

  -- History moves across intact.
  update wa_messages set contact_id = p_keep where contact_id = any(v_ids);
  update wa_inbound set contact_id = p_keep where contact_id = any(v_ids);
  update wa_consent_events set contact_id = p_keep where contact_id = any(v_ids);
  update wa_optin_invites set contact_id = p_keep where contact_id = any(v_ids);

  -- Reminder log: a reminder already sent to the person counts once.
  delete from wa_automation_log l where l.contact_id = any(v_ids) and exists (
    select 1 from wa_automation_log k where k.contact_id = p_keep
      and k.automation_id = l.automation_id and k.source_id = l.source_id and k.threshold = l.threshold);
  delete from wa_automation_log l where l.contact_id = any(v_ids) and exists (
    select 1 from wa_automation_log o where o.contact_id = any(v_ids) and o.id < l.id
      and o.automation_id = l.automation_id and o.source_id = l.source_id and o.threshold = l.threshold);
  update wa_automation_log set contact_id = p_keep where contact_id = any(v_ids);

  -- One conversation, combining the threads.
  insert into wa_conversations as cv (contact_id, status, assigned_to, last_inbound_at, last_outbound_at,
                                      last_message_at, last_preview, last_direction, unread_count)
  select p_keep,
         case when bool_or(status = 'open') then 'open' else 'closed' end,
         (array_agg(assigned_to order by (contact_id = p_keep) desc, last_message_at desc nulls last) filter (where assigned_to is not null))[1],
         max(last_inbound_at), max(last_outbound_at), max(last_message_at),
         (array_agg(last_preview order by last_message_at desc nulls last))[1],
         (array_agg(last_direction order by last_message_at desc nulls last))[1],
         sum(unread_count)
    from wa_conversations where contact_id = any(v_all)
  having count(*) > 0
  on conflict (contact_id) do update set
    status = excluded.status, assigned_to = excluded.assigned_to,
    last_inbound_at = excluded.last_inbound_at, last_outbound_at = excluded.last_outbound_at,
    last_message_at = excluded.last_message_at, last_preview = excluded.last_preview,
    last_direction = excluded.last_direction, unread_count = excluded.unread_count;
  delete from wa_conversations where contact_id = any(v_ids);

  -- The kept record: fill gaps from the duplicates; consent from the latest decision.
  perform set_config('wa.consent_write', 'on', true);
  update wa_contacts k set
    email = coalesce(k.email, (select email from wa_contacts where id = any(v_ids) and email is not null order by created_at limit 1)),
    phone_e164 = coalesce(k.phone_e164, (select phone_e164 from wa_contacts where id = any(v_ids) and phone_e164 is not null order by phone_confirmed desc, created_at limit 1)),
    yacht_id = coalesce(k.yacht_id, (select yacht_id from wa_contacts where id = any(v_ids) and yacht_id is not null order by created_at limit 1)),
    notes = nullif(concat_ws(' · ', k.notes, (select string_agg(distinct notes, ' · ') from wa_contacts where id = any(v_ids) and notes is not null)), ''),
    merged_sources = (select coalesce(array_agg(distinct s), '{}') from unnest(k.merged_sources || v_sources) s),
    consent_status = case when v_win is not null then v_w.consent_status
                          when k.consent_status = 'invited' or exists (select 1 from wa_contacts where id = any(v_ids) and consent_status = 'invited') then 'invited'
                          else k.consent_status end,
    consent_updates = case when v_win is not null then v_w.consent_updates else k.consent_updates end,
    consent_marketing = case when v_win is not null then v_w.consent_marketing else k.consent_marketing end,
    consent_at = case when v_win is not null then v_w.consent_at else k.consent_at end,
    opted_out_at = case when v_win is not null then v_w.opted_out_at else k.opted_out_at end,
    phone_confirmed = case when v_win is not null then v_w.phone_confirmed or k.phone_confirmed else k.phone_confirmed end
  where k.id = p_keep
  returning * into v_final;

  delete from wa_contacts where id = any(v_ids);
  perform set_config('wa.consent_write', 'off', true);

  insert into wa_consent_events (contact_id, action, consent_updates, consent_marketing, channel, note, actor_user_id, actor_email, phone_e164)
  values (p_keep, 'updated', v_final.consent_updates, v_final.consent_marketing, 'system',
          'Merged ' || cardinality(v_ids) || ' duplicate contact record(s) into this one (' || v_names || '). '
            || 'Their messages and consent history now show here; consent follows the latest decision.',
          v_uid, (select email from auth.users where id = v_uid), v_final.phone_e164);

  return jsonb_build_object('kept', p_keep, 'merged', cardinality(v_ids), 'consent_status', v_final.consent_status);
end;
$$;

revoke execute on function public.wa_merge_contacts(uuid, uuid[]) from public, anon;
grant execute on function public.wa_merge_contacts(uuid, uuid[]) to authenticated;
