-- merge_crew_members: repoint visas and alerts that reference a duplicate
-- passport before that passport is dropped. Merging Michael Fetton's six
-- profiles failed on visa_applications_passport_id_fkey: his Oman visa used the
-- spare profile's copy of the same passport. Also moves onboard_rest_hours and
-- clears crew_dob_sp_check, both added after the function and both cascading.
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
  -- A passport that collides with the keeper's copy may still be the one a visa
  -- or an alert points at; repoint those to the keeper's copy first, or the
  -- delete below is refused (visa_applications.passport_id is NO ACTION).
  update visa_applications v set passport_id = k.id
    from crew_passports d join crew_passports k on k.crew_id = p_keep and k.passport_number = d.passport_number
   where d.crew_id = p_drop and v.passport_id = d.id;
  update visa_applications v set selected_passport_id = k.id
    from crew_passports d join crew_passports k on k.crew_id = p_keep and k.passport_number = d.passport_number
   where d.crew_id = p_drop and v.selected_passport_id = d.id;
  update compliance_alerts a set passport_id = k.id
    from crew_passports d join crew_passports k on k.crew_id = p_keep and k.passport_number = d.passport_number
   where d.crew_id = p_drop and a.passport_id = d.id;

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

  -- Added since SD-0026; both cascade from crew_members, so unmoved rows would
  -- be deleted with the duplicate. Rest hours are one per crew per day — the
  -- keeper's own day wins. crew_dob_sp_check is a per-crew check cache.
  delete from onboard_rest_hours d
   where d.crew_member_id = p_drop
     and exists (select 1 from onboard_rest_hours k where k.crew_member_id = p_keep and k.day = d.day);
  update onboard_rest_hours set crew_member_id = p_keep where crew_member_id = p_drop;
  delete from crew_dob_sp_check where crew_id = p_drop;

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
