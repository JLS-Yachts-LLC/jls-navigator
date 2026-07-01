-- Migration 075: Write functions for the new pipeline/CRM/reference/client
-- capabilities. placement_candidates and crew_vacancies already have
-- permissive direct-write RLS (authenticated_all / crew_vacancies_auth,
-- confirmed live) used by the existing legacy /crew-placement ResourcePage —
-- left untouched. Functions here cover only the genuinely new,
-- multi-step operations that don't already have a write path: client
-- creation, workflow start/advance, interviews, placement creation/
-- advancement, references, CRM logging, and versioned document upload.
--
-- Every function derives identity from auth.uid() internally — never a
-- caller-supplied parameter — and anon execute is revoked at creation time,
-- per the hardening lesson from the Port Calls RPCs earlier this session.

create or replace function public.create_placement_client(
  p_company_name text,
  p_country_code text,
  p_terms_of_business text,
  p_recruitment_preferences text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_performed_by uuid := auth.uid();
  v_org_id uuid;
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;
  if not public.has_module_permission(v_performed_by, 'crew_placement', 'edit') then
    raise exception 'Access denied: crew_placement edit permission required';
  end if;

  insert into public.organisations (name, type, country_code, active)
  values (p_company_name, 'client', p_country_code, true)
  returning org_id into v_org_id;

  insert into public.crew_placement_client_profiles (org_id, terms_of_business, recruitment_preferences)
  values (v_org_id, p_terms_of_business, p_recruitment_preferences);

  return v_org_id;
end; $$;

create or replace function public.update_placement_client(
  p_org_id uuid,
  p_terms_of_business text,
  p_recruitment_preferences text,
  p_is_repeat_client boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.has_module_permission(auth.uid(), 'crew_placement', 'edit') then
    raise exception 'Access denied: crew_placement edit permission required';
  end if;

  update public.crew_placement_client_profiles
  set terms_of_business = coalesce(p_terms_of_business, terms_of_business),
      recruitment_preferences = coalesce(p_recruitment_preferences, recruitment_preferences),
      is_repeat_client = coalesce(p_is_repeat_client, is_repeat_client)
  where org_id = p_org_id;
end; $$;

-- Generic workflow start/advance (FRS §5, §10, §12), scoped to the Crew
-- Placement instance table (placement_workflow_steps), independent of the
-- Agency Module's port_call_workflow_steps.
create or replace function public.start_placement_workflow(
  p_entity_type text, p_entity_id uuid, p_workflow_code text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_performed_by uuid := auth.uid();
  v_workflow_id uuid;
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;

  select id into v_workflow_id from public.workflow_definitions where code = p_workflow_code;
  if v_workflow_id is null then
    raise exception 'Unknown workflow code: %', p_workflow_code;
  end if;

  insert into public.placement_workflow_steps (entity_type, entity_id, workflow_definition_id, step_definition_id)
  select p_entity_type, p_entity_id, v_workflow_id, sd.id
  from public.workflow_step_definitions sd
  where sd.workflow_definition_id = v_workflow_id and sd.is_active
  on conflict (entity_type, entity_id, step_definition_id) do nothing;
end; $$;

create or replace function public.advance_placement_step(
  p_entity_type text, p_entity_id uuid, p_step_code text, p_new_status text, p_notes text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_performed_by uuid := auth.uid();
  v_step_id uuid;
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;
  if p_new_status not in ('in_progress', 'completed', 'rejected', 'skipped') then
    raise exception 'Invalid step status: %', p_new_status;
  end if;

  select pws.id into v_step_id
  from public.placement_workflow_steps pws
  join public.workflow_step_definitions sd on sd.id = pws.step_definition_id
  where pws.entity_type = p_entity_type and pws.entity_id = p_entity_id and sd.code = p_step_code;

  if v_step_id is null then
    raise exception 'Step % not found for % %', p_step_code, p_entity_type, p_entity_id;
  end if;

  update public.placement_workflow_steps
  set status = p_new_status, notes = p_notes,
      completed_by = case when p_new_status = 'completed' then v_performed_by else completed_by end,
      completed_at = case when p_new_status = 'completed' then now() else completed_at end
  where id = v_step_id;
end; $$;

-- Interview management (FRS §11)
create or replace function public.schedule_placement_interview(
  p_application_id uuid, p_interview_type text, p_scheduled_at timestamptz,
  p_location text, p_interviewer_name text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_performed_by uuid := auth.uid();
  v_id uuid;
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;

  insert into public.placement_interviews (application_id, interview_type, scheduled_at, location, interviewer_name, created_by)
  values (p_application_id, p_interview_type, p_scheduled_at, p_location, p_interviewer_name, v_performed_by)
  returning id into v_id;

  update public.placement_applications set status = 'interviewing' where id = p_application_id;

  return v_id;
end; $$;

create or replace function public.record_placement_interview_feedback(
  p_interview_id uuid, p_status text, p_feedback text, p_rating int, p_recommendation text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.placement_interviews
  set status = coalesce(p_status, status), feedback = p_feedback, rating = p_rating, recommendation = p_recommendation
  where id = p_interview_id;
end; $$;

-- Placement management (FRS §12) — creating a placement also marks the
-- application offered and starts the placement_management workflow on it,
-- in the same transaction (Generate/Submit separation still holds: this is
-- one deliberate "create the placement record" action, distinct from later
-- advancing it through stages).
create or replace function public.create_placement_record(
  p_application_id uuid
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_performed_by uuid := auth.uid();
  v_placement_id uuid;
  v_candidate_id uuid;
  v_vacancy_id uuid;
  v_client_org_id uuid;
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;

  select candidate_id, vacancy_id into v_candidate_id, v_vacancy_id
  from public.placement_applications where id = p_application_id;

  if v_candidate_id is null then
    raise exception 'Application % not found', p_application_id;
  end if;

  select client_org_id into v_client_org_id from public.crew_vacancies where id = v_vacancy_id;

  insert into public.placement_records (application_id, candidate_id, vacancy_id, client_org_id)
  values (p_application_id, v_candidate_id, v_vacancy_id, v_client_org_id)
  returning id into v_placement_id;

  perform public.start_placement_workflow('placement', v_placement_id, 'placement_management');

  update public.placement_applications set status = 'offered' where id = p_application_id;

  return v_placement_id;
end; $$;

create or replace function public.advance_placement_record(
  p_placement_id uuid, p_new_status text, p_notes text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_new_status not in (
    'offer_accepted', 'contract_signed', 'pre_joining', 'joined', 'in_followup', 'completed', 'terminated_early'
  ) then
    raise exception 'Invalid placement status: %', p_new_status;
  end if;

  update public.placement_records
  set status = p_new_status,
      contract_signed_at = case when p_new_status = 'contract_signed' then now() else contract_signed_at end,
      joining_confirmed_at = case when p_new_status = 'joined' then now() else joining_confirmed_at end,
      followup_30_day_notes = case when p_new_status = 'in_followup' then p_notes else followup_30_day_notes end,
      review_90_day_notes = case when p_new_status = 'completed' then p_notes else review_90_day_notes end
  where id = p_placement_id;
end; $$;

-- Reference management (FRS §13)
create or replace function public.request_placement_reference(
  p_candidate_id uuid, p_experience_id uuid, p_reference_type text,
  p_referee_name text, p_referee_email text, p_referee_phone text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_performed_by uuid := auth.uid();
  v_id uuid;
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;

  insert into public.placement_candidate_references (
    candidate_id, experience_id, reference_type, referee_name, referee_email, referee_phone,
    request_status, requested_at, requested_by
  ) values (
    p_candidate_id, p_experience_id, p_reference_type, p_referee_name, p_referee_email, p_referee_phone,
    'requested', now(), v_performed_by
  ) returning id into v_id;

  return v_id;
end; $$;

create or replace function public.record_placement_reference_response(
  p_reference_id uuid, p_response_text text, p_rating int, p_request_status text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.placement_candidate_references
  set response_text = p_response_text, rating = p_rating,
      request_status = coalesce(p_request_status, 'received'),
      responded_at = now()
  where id = p_reference_id;
end; $$;

-- CRM interaction log (FRS §8)
create or replace function public.log_placement_crm_interaction(
  p_entity_type text, p_entity_id uuid, p_channel text, p_direction text, p_summary text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_performed_by uuid := auth.uid();
  v_id uuid;
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;

  insert into public.placement_crm_interactions (entity_type, entity_id, channel, direction, summary, logged_by)
  values (p_entity_type, p_entity_id, p_channel, p_direction, p_summary, v_performed_by)
  returning id into v_id;

  return v_id;
end; $$;

-- Document store (FRS §4) — version-controlled add
create or replace function public.add_placement_candidate_document(
  p_candidate_id uuid, p_document_type text, p_title text, p_file_path text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_performed_by uuid := auth.uid();
  v_document_id uuid;
  v_next_version int;
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;

  select id, current_version + 1 into v_document_id, v_next_version
  from public.placement_candidate_documents
  where candidate_id = p_candidate_id and document_type = p_document_type and title = p_title;

  if v_document_id is null then
    insert into public.placement_candidate_documents (candidate_id, document_type, title, current_version)
    values (p_candidate_id, p_document_type, p_title, 1)
    returning id into v_document_id;
    v_next_version := 1;
  else
    update public.placement_candidate_documents set current_version = v_next_version where id = v_document_id;
  end if;

  insert into public.placement_candidate_document_versions (document_id, version, file_path, uploaded_by)
  values (v_document_id, v_next_version, p_file_path, v_performed_by);

  return v_document_id;
end; $$;

-- Grants: authenticated only, anon explicitly excluded from the start.
grant execute on function public.create_placement_client to authenticated;
grant execute on function public.update_placement_client to authenticated;
grant execute on function public.start_placement_workflow to authenticated;
grant execute on function public.advance_placement_step to authenticated;
grant execute on function public.schedule_placement_interview to authenticated;
grant execute on function public.record_placement_interview_feedback to authenticated;
grant execute on function public.create_placement_record to authenticated;
grant execute on function public.advance_placement_record to authenticated;
grant execute on function public.request_placement_reference to authenticated;
grant execute on function public.record_placement_reference_response to authenticated;
grant execute on function public.log_placement_crm_interaction to authenticated;
grant execute on function public.add_placement_candidate_document to authenticated;

revoke execute on function public.create_placement_client from anon;
revoke execute on function public.update_placement_client from anon;
revoke execute on function public.start_placement_workflow from anon;
revoke execute on function public.advance_placement_step from anon;
revoke execute on function public.schedule_placement_interview from anon;
revoke execute on function public.record_placement_interview_feedback from anon;
revoke execute on function public.create_placement_record from anon;
revoke execute on function public.advance_placement_record from anon;
revoke execute on function public.request_placement_reference from anon;
revoke execute on function public.record_placement_reference_response from anon;
revoke execute on function public.log_placement_crm_interaction from anon;
revoke execute on function public.add_placement_candidate_document from anon;
