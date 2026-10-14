-- Bunkering: the vessel acts for itself in the Client Portal — the Captain or Chief Engineer confirms the requirements and approves
-- a quotation that JLS has shared and put "with the vessel".
--
-- These are called ONLY by the portal API, with the service role, after it has checked who the caller is (a signed-in, two-factor
-- verified client login for THIS yacht, in a position allowed to approve, not an admin preview). They are security definer, and
-- nobody else can run them: execute is revoked from everyone but the service role. Each one also re-checks that the enquiry belongs
-- to the yacht it is called for, so a vessel can only ever act on its own enquiry.
--
-- Additive only: two functions. Safe to run once.

-- The vessel's confirmation that fuel type, specification and quantity have been checked against its requirements.
create or replace function public.portal_bunker_confirm(p_yacht uuid, p_enquiry uuid, p_user uuid, p_role text, p_name text)
returns public.bunker_enquiries
language plpgsql security definer set search_path = public as $$
declare r public.bunker_enquiries;
begin
  select * into r from public.bunker_enquiries where id = p_enquiry and yacht_id = p_yacht for update;
  if not found then raise exception 'Enquiry not found'; end if;
  if r.status in ('approved', 'delivered', 'cancelled') then raise exception 'This enquiry is already %', r.status; end if;
  if p_role not in ('Captain', 'Chief Engineer') then raise exception 'The confirmation must come from the Captain or the Chief Engineer'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Your name is needed to record this'; end if;
  update public.bunker_enquiries set declared_by_role = p_role, declared_by_name = btrim(p_name), declared_at = now(),
    declaration_method = 'Confirmed in the Client Portal', declaration_signature_url = null
  where id = p_enquiry returning * into r;
  insert into public.bunker_enquiry_events (enquiry_id, kind, actor_id, actor_name, body)
  values (p_enquiry, 'edited', p_user, btrim(p_name) || ' (client portal)',
          'Requirements confirmed by ' || btrim(p_name) || ' (' || p_role || ') in the Client Portal');
  return r;
end $$;
revoke execute on function public.portal_bunker_confirm(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.portal_bunker_confirm(uuid, uuid, uuid, text, text) to service_role;

-- The vessel's approval of ONE quotation. Only while the enquiry is With the vessel (JLS has released it for approval), and only a
-- quotation JLS has shared and that has been received.
create or replace function public.portal_bunker_approve(p_yacht uuid, p_enquiry uuid, p_quote uuid, p_user uuid, p_role text, p_name text)
returns public.bunker_enquiries
language plpgsql security definer set search_path = public as $$
declare r public.bunker_enquiries; q public.bunker_quotes;
begin
  select * into r from public.bunker_enquiries where id = p_enquiry and yacht_id = p_yacht for update;
  if not found then raise exception 'Enquiry not found'; end if;
  if r.status <> 'awaiting_vessel' then raise exception 'This enquiry is not waiting for your approval (it is %)', replace(r.status, '_', ' '); end if;
  select * into q from public.bunker_quotes where id = p_quote and enquiry_id = p_enquiry and shared_with_vessel;
  if not found then raise exception 'That quotation is not available to approve'; end if;
  if q.status <> 'received' then raise exception 'Only a received quotation can be approved (this one is %)', q.status; end if;
  if p_role not in ('Captain', 'Chief Engineer') then raise exception 'The approval must come from the Captain or the Chief Engineer'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Your name is needed to record this'; end if;

  update public.bunker_quotes set status = 'approved' where id = p_quote;
  update public.bunker_quotes set status = 'rejected' where enquiry_id = p_enquiry and id <> p_quote and status = 'received';
  update public.bunker_enquiries set status = 'approved', approved_quote_id = p_quote, approved_by_role = p_role, approved_by_name = btrim(p_name),
    approved_at = now(), approval_method = 'Approved in the Client Portal'
  where id = p_enquiry returning * into r;
  insert into public.bunker_enquiry_events (enquiry_id, kind, actor_id, actor_name, body, from_status, to_status)
  values (p_enquiry, 'approved', p_user, btrim(p_name) || ' (client portal)',
          q.supplier || ' — ' || coalesce(q.quantity::text, '?') || ' ' || coalesce(q.quantity_unit, '') || ' at ' || coalesce(q.unit_price::text, '?') || ' ' || q.currency
          || ' ' || coalesce(q.price_unit, '') || ' — approved by ' || btrim(p_name) || ' (' || p_role || ') in the Client Portal',
          'awaiting_vessel', 'approved');
  return r;
end $$;
revoke execute on function public.portal_bunker_approve(uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.portal_bunker_approve(uuid, uuid, uuid, uuid, text, text) to service_role;
