-- Migration 066: Harden Port Calls RPC functions
--
-- Supabase security advisor flagged create_port_call, start_port_call_workflow,
-- advance_workflow_step, update_port_call_document_status, and
-- is_polaris_global_admin as callable by the unauthenticated `anon` role via
-- PostgREST (e.g. POST /rest/v1/rpc/create_port_call). Because these are
-- SECURITY DEFINER, they run with the function owner's privileges and bypass
-- the RLS policies on port_calls/port_call_workflow_steps/port_call_documents
-- entirely regardless of caller — RLS on the base tables does not protect
-- against this; the grant on the function itself is the only gate.
--
-- Two independent problems, both fixed here:
--   1. EXECUTE was never revoked from PUBLIC (Postgres's default grant on a
--      newly created function), so anon could call all four write functions
--      directly with no session at all.
--   2. Every write function trusted a client-supplied p_created_by /
--      p_performed_by parameter instead of deriving identity from the
--      session — so even a legitimate authenticated caller could pass any
--      other user's id and have actions attributed to them in the audit log.
--
-- Fix: revoke EXECUTE from PUBLIC/anon (grant only to authenticated), and
-- have each function use auth.uid() internally instead of a caller-supplied
-- identity parameter. Signatures change (identity param removed), so the
-- three Port Calls frontend call sites are updated in the same commit.

-- 1. create_port_call: drop p_created_by, use auth.uid()
drop function if exists public.create_port_call(uuid, uuid, timestamptz, timestamptz, uuid, uuid, uuid);

create function public.create_port_call(
  p_vessel_id uuid,
  p_destination_country_id uuid,
  p_eta timestamptz,
  p_etd timestamptz,
  p_assigned_office_id uuid,
  p_assigned_agent_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_port_call_id uuid;
  v_initial_status_id uuid;
  v_created_by uuid := auth.uid();
begin
  if v_created_by is null then
    raise exception 'Authentication required';
  end if;

  select id into v_initial_status_id
  from public.port_call_status where code = 'enquiry';

  insert into public.port_calls (
    vessel_id, destination_country_id, eta, etd,
    assigned_office_id, assigned_agent_id, status_id, created_by
  ) values (
    p_vessel_id, p_destination_country_id, p_eta, p_etd,
    p_assigned_office_id, p_assigned_agent_id, v_initial_status_id, v_created_by
  ) returning id into v_port_call_id;

  insert into public.port_call_documents (
    port_call_id, requirement_config_id, code, label, is_mandatory
  )
  select v_port_call_id, c.id, c.code, c.label, c.is_mandatory
  from public.country_requirement_config c
  where c.country_id = p_destination_country_id
    and c.requirement_type = 'pre_arrival_document'
    and c.is_active;

  insert into public.port_call_audit_log (port_call_id, action, snapshot_data, performed_by)
  values (v_port_call_id, 'port_call_created', jsonb_build_object(
    'vessel_id', p_vessel_id, 'destination_country_id', p_destination_country_id
  ), v_created_by);

  return v_port_call_id;
end;
$$;

revoke all on function public.create_port_call from public;
grant execute on function public.create_port_call to authenticated;

-- 2. start_port_call_workflow: drop p_performed_by, use auth.uid()
drop function if exists public.start_port_call_workflow(uuid, text, uuid);

create function public.start_port_call_workflow(
  p_port_call_id uuid,
  p_workflow_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workflow_id uuid;
  v_performed_by uuid := auth.uid();
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;

  select id into v_workflow_id
  from public.workflow_definitions where code = p_workflow_code;

  if v_workflow_id is null then
    raise exception 'Unknown workflow code: %', p_workflow_code;
  end if;

  insert into public.port_call_workflow_steps (
    port_call_id, workflow_definition_id, step_definition_id
  )
  select p_port_call_id, v_workflow_id, sd.id
  from public.workflow_step_definitions sd
  where sd.workflow_definition_id = v_workflow_id
    and sd.is_active
  on conflict (port_call_id, step_definition_id) do nothing;

  insert into public.port_call_audit_log (port_call_id, action, snapshot_data, performed_by)
  values (p_port_call_id, 'workflow_started', jsonb_build_object('workflow_code', p_workflow_code), v_performed_by);
end;
$$;

revoke all on function public.start_port_call_workflow from public;
grant execute on function public.start_port_call_workflow to authenticated;

-- 3. advance_workflow_step: drop p_performed_by, use auth.uid()
drop function if exists public.advance_workflow_step(uuid, text, text, text, uuid);

create function public.advance_workflow_step(
  p_port_call_id uuid,
  p_step_code text,
  p_new_status text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_step_id uuid;
  v_performed_by uuid := auth.uid();
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;

  if p_new_status not in ('in_progress', 'completed', 'rejected', 'skipped') then
    raise exception 'Invalid step status: %', p_new_status;
  end if;

  select wfs.id into v_step_id
  from public.port_call_workflow_steps wfs
  join public.workflow_step_definitions sd on sd.id = wfs.step_definition_id
  where wfs.port_call_id = p_port_call_id
    and sd.code = p_step_code;

  if v_step_id is null then
    raise exception 'Step % not found for port_call %', p_step_code, p_port_call_id;
  end if;

  update public.port_call_workflow_steps
  set status = p_new_status,
      notes = p_notes,
      completed_by = case when p_new_status = 'completed' then v_performed_by else completed_by end,
      completed_at = case when p_new_status = 'completed' then now() else completed_at end
  where id = v_step_id;

  insert into public.port_call_audit_log (port_call_id, action, snapshot_data, performed_by)
  values (p_port_call_id, 'workflow_step_advanced', jsonb_build_object(
    'step_code', p_step_code, 'new_status', p_new_status, 'notes', p_notes
  ), v_performed_by);

  if p_step_code = 'port_entry' and p_new_status = 'completed' then
    update public.port_calls
    set status_id = (select id from public.port_call_status where code = 'inward_clearance_completed')
    where id = p_port_call_id;
  end if;
end;
$$;

revoke all on function public.advance_workflow_step from public;
grant execute on function public.advance_workflow_step to authenticated;

-- 4. update_port_call_document_status: drop p_performed_by, use auth.uid()
drop function if exists public.update_port_call_document_status(uuid, text, text, uuid);

create function public.update_port_call_document_status(
  p_document_id uuid,
  p_validation_status text,
  p_approval_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_port_call_id uuid;
  v_performed_by uuid := auth.uid();
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;

  select port_call_id into v_port_call_id
  from public.port_call_documents where id = p_document_id;

  update public.port_call_documents
  set validation_status = coalesce(p_validation_status, validation_status),
      approval_status = coalesce(p_approval_status, approval_status)
  where id = p_document_id;

  insert into public.port_call_audit_log (port_call_id, action, snapshot_data, performed_by)
  values (v_port_call_id, 'document_status_updated', jsonb_build_object(
    'document_id', p_document_id,
    'validation_status', p_validation_status,
    'approval_status', p_approval_status
  ), v_performed_by);
end;
$$;

revoke all on function public.update_port_call_document_status from public;
grant execute on function public.update_port_call_document_status to authenticated;

-- 5. Same anon-executable gap on the admin-check helper and the auth
-- trigger function — signatures are unchanged (neither takes a spoofable
-- identity param), just close the PUBLIC/anon execute grant.
revoke all on function public.is_polaris_global_admin(uuid) from public;
grant execute on function public.is_polaris_global_admin(uuid) to authenticated;

revoke all on function public.handle_new_auth_user() from public;
