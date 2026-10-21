-- Permit portal-access notifications (SD-0072, Polaris feedback, 21 Oct 2026).
--
-- Client ask: staff want to be told when a client has opened/downloaded a
-- permit document that was shared with them via the client portal. Polaris
-- already logs every portal file open/download in portal_document_access
-- (user_id, source_table, source_id, storage_ref, accessed_at, outcome) but
-- nothing surfaces it, so nobody notices unless they go and query the table.
--
-- This adds a trigger that, the first time a permit's shared document is
-- opened or downloaded by a client, rings the in-app bell (public.notifications
-- — the same table compass_card_event_bell() writes to) for whoever shared
-- it: the permit's email_sent_by, falling back to created_by. Scoped to the
-- FIRST access only (per permit) so re-opens/re-downloads don't spam staff.

create or replace function public.permit_portal_access_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_permit     public.permits%rowtype;
  v_recipient  uuid;
  v_prior      boolean;
begin
  if new.source_table <> 'permits' then
    return new;
  end if;

  if new.outcome not in ('viewed', 'downloaded') then
    return new;
  end if;

  -- Only notify on the first ever access of this permit's shared document;
  -- this row has already been committed by the time the trigger fires, so
  -- "any other row for this permit" means this one isn't the first.
  select exists (
    select 1 from public.portal_document_access
     where source_table = 'permits'
       and source_id = new.source_id
       and id <> new.id
  ) into v_prior;

  if v_prior then
    return new;
  end if;

  select * into v_permit from public.permits where id = new.source_id;
  if not found then
    return new;
  end if;

  v_recipient := coalesce(v_permit.email_sent_by, v_permit.created_by);
  if v_recipient is null then
    return new;
  end if;

  begin
    insert into public.notifications (user_id, type, urgency, title, body, action_url, metadata)
    values (
      v_recipient,
      'permit_portal_opened',
      'info',
      left('Permit link ' || new.outcome || ': ' || coalesce(v_permit.permit_number, v_permit.holder_name, 'permit'), 300),
      left(coalesce(v_permit.holder_name, 'The client') || ' has ' || new.outcome || ' the shared permit document.', 500),
      '/permits/' || replace(v_permit.permit_type, '_', '-'),
      jsonb_build_object('permit_id', v_permit.id, 'portal_access_id', new.id, 'outcome', new.outcome)
    );
  exception when others then
    raise warning 'permit portal access notify failed: %', sqlerrm;
  end;

  return new;
end $$;

revoke all on function public.permit_portal_access_notify() from public, anon, authenticated;

drop trigger if exists portal_document_access_permit_notify on public.portal_document_access;
create trigger portal_document_access_permit_notify
  after insert on public.portal_document_access
  for each row execute function public.permit_portal_access_notify();

create index if not exists portal_document_access_source_idx
  on public.portal_document_access (source_table, source_id);
