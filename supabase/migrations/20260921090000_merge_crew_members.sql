-- Merge one crew profile into another, moving everything attached to it. SD-0026.
--
-- Astrid asked how to resolve two profiles for the same person. There was no
-- answer: the Duplicate Crew screen finds them but only merges SharePoint
-- folders, and deleting the spare is actively dangerous — crew_members cascades
-- to visa_applications, crew_passports, crew_documents, crew_signon_events and
-- crew_timeline_events, so deleting a duplicate destroys that profile's visa
-- history. Where the person also has compliance alerts, seaport rows or expiry
-- flags the delete is refused instead, so the behaviour is inconsistent as well
-- as destructive.
--
-- This moves every child row onto the keeper, fills the keeper's blank fields
-- from the record being absorbed, then deletes the now-empty duplicate. One
-- function, so it is a single transaction: it either all moves or none of it
-- does, which a series of calls from the browser could never promise.
--
-- Collisions: four child tables are unique per crew member, so a row that would
-- land on top of one the keeper already has is dropped rather than moved —
-- keeping the keeper's own copy. Everything else is keyed on its own id and
-- simply repoints.
create or replace function public.merge_crew_members(p_keep uuid, p_drop uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  moved jsonb := '{}'::jsonb;
  n int;
begin
  if p_keep is null or p_drop is null then
    raise exception 'Both crew members must be given';
  end if;
  if p_keep = p_drop then
    raise exception 'Cannot merge a crew member into themselves';
  end if;
  if not exists (select 1 from crew_members where id = p_keep) then
    raise exception 'The crew member to keep no longer exists';
  end if;
  if not exists (select 1 from crew_members where id = p_drop) then
    raise exception 'The duplicate no longer exists';
  end if;

  -- ── Unique per crew member: drop what would collide, move the rest ──
  delete from crew_passports d
   where d.crew_id = p_drop
     and exists (select 1 from crew_passports k
                  where k.crew_id = p_keep and k.passport_number = d.passport_number);
  update crew_passports set crew_id = p_keep where crew_id = p_drop;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('passports', n);

  delete from crew_document_placements d
   where d.crew_member_id = p_drop
     and exists (select 1 from crew_document_placements k
                  where k.crew_member_id = p_keep and k.doc_key = d.doc_key);
  update crew_document_placements set crew_member_id = p_keep where crew_member_id = p_drop;

  delete from crew_document_sharepoint_links d
   where d.crew_member_id = p_drop
     and exists (select 1 from crew_document_sharepoint_links k
                  where k.crew_member_id = p_keep and k.doc_key = d.doc_key);
  update crew_document_sharepoint_links set crew_member_id = p_keep where crew_member_id = p_drop;

  delete from crew_document_folders d
   where d.crew_member_id = p_drop
     and exists (select 1 from crew_document_folders k
                  where k.crew_member_id = p_keep and k.name = d.name);
  update crew_document_folders set crew_member_id = p_keep where crew_member_id = p_drop;

  -- ── Everything else repoints ──
  update visa_applications set crew_member_id = p_keep where crew_member_id = p_drop;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('visa_applications', n);

  update crew_documents set crew_member_id = p_keep where crew_member_id = p_drop;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('documents', n);

  update crew_signon_events set crew_member_id = p_keep where crew_member_id = p_drop;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('sign_on_off_events', n);

  update crew_timeline_events set crew_member_id = p_keep where crew_member_id = p_drop;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('timeline_events', n);

  update compliance_alerts   set crew_id = p_keep where crew_id = p_drop;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('compliance_alerts', n);

  update seaport_arrivals    set crew_id = p_keep where crew_id = p_drop;
  update seaport_departures  set crew_id = p_keep where crew_id = p_drop;
  update visa_expiry_flags   set crew_id = p_keep where crew_id = p_drop;
  update training_certifications set crew_member_id = p_keep where crew_member_id = p_drop;
  get diagnostics n = row_count; moved := moved || jsonb_build_object('certifications', n);
  update training_records    set crew_member_id = p_keep where crew_member_id = p_drop;
  update phone_country_selection_log set crew_member_id = p_keep where crew_member_id = p_drop;

  -- ── Fill the keeper's gaps from the record being absorbed ──
  -- Only ever fills a NULL. The keeper is the record the operator chose, so its
  -- own values are never overwritten by the one being discarded.
  update crew_members k set
    date_of_birth        = coalesce(k.date_of_birth, d.date_of_birth),
    email                = coalesce(nullif(trim(k.email), ''), d.email),
    phone                = coalesce(nullif(trim(k.phone), ''), d.phone),
    nationality          = coalesce(nullif(trim(k.nationality), ''), d.nationality),
    rank                 = coalesce(nullif(trim(k.rank), ''), d.rank),
    passport_number      = coalesce(nullif(trim(k.passport_number), ''), d.passport_number),
    passport_expiry_date = coalesce(k.passport_expiry_date, d.passport_expiry_date),
    yacht_id             = coalesce(k.yacht_id, d.yacht_id),
    sharepoint_item_id   = coalesce(k.sharepoint_item_id, d.sharepoint_item_id),
    updated_at           = now()
  from crew_members d
  where k.id = p_keep and d.id = p_drop;

  delete from crew_members where id = p_drop;

  return moved || jsonb_build_object('kept', p_keep, 'removed', p_drop);
end $$;

comment on function public.merge_crew_members(uuid, uuid) is
  'Move every record attached to the duplicate crew member onto the keeper, fill the keeper''s blank fields, then delete the duplicate. One transaction. SD-0026.';

revoke all on function public.merge_crew_members(uuid, uuid) from public, anon;
grant execute on function public.merge_crew_members(uuid, uuid) to authenticated;
