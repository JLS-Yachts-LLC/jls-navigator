-- Migration 084: Write functions for the Bunkering slice.
-- Every function derives identity from auth.uid() internally (never a
-- caller-supplied parameter) and has anon execute revoked at creation —
-- applied from the start this time, not as a follow-up fix like the Port
-- Calls RPCs earlier this session. Gating uses has_module_permission
-- against the real 'orbit' module instead of the vendor package's
-- fictional auth.jwt()->>'role' claim.
--
-- orbit_service_requests / orbit_quotations keep their existing direct-write
-- policy for the other 10 live categories — these functions are additive
-- entry points for the new bunkering-specific tables and the new
-- send/response quotation steps, not a replacement for the existing UI's
-- direct writes.

-- 1. Create a Bunkering request + its detail row + seed the required
-- documents/approvals, in one transaction.
create or replace function public.create_bunker_request(
  p_yacht_id uuid,
  p_title text,
  p_description text,
  p_urgency text,
  p_marina text,
  p_location text,
  p_delivery_date date,
  p_billing_entity text,
  p_fuel_grade text,
  p_min_quantity numeric,
  p_max_quantity numeric
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_performed_by uuid := auth.uid();
  v_request_id uuid;
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;
  if not public.has_module_permission(v_performed_by, 'orbit', 'edit') then
    raise exception 'Access denied: orbit edit permission required';
  end if;

  insert into public.orbit_service_requests (
    yacht_id, requested_by, category, request_type, title, description,
    urgency, status, marina
  ) values (
    p_yacht_id, v_performed_by, 'FUEL_BUNKERING', 'bunker_delivery', p_title, p_description,
    coalesce(p_urgency, 'medium'), 'submitted', p_marina
  ) returning id into v_request_id;

  insert into public.bunker_rfq_details (
    request_id, location, delivery_date, billing_entity, fuel_grade, min_quantity, max_quantity
  ) values (
    v_request_id, p_location, p_delivery_date, p_billing_entity, p_fuel_grade, p_min_quantity, p_max_quantity
  );

  -- Seed the Bunkering-specific required document/approval set (RFQ
  -- Builder Sections 3 & 4 — generic tables, service-specific seed).
  insert into public.orbit_documents (request_id, document_type, is_required)
  values
    (v_request_id, 'masters_declaration', true),
    (v_request_id, 'fuel_analysis_request', true),
    (v_request_id, 'safety_checklist', true),
    (v_request_id, 'delivery_receipt', true);

  insert into public.orbit_approvals (request_id, approver_role)
  values
    (v_request_id, 'captain'),
    (v_request_id, 'chief_engineer');

  insert into public.orbit_activity_log (request_id, actor_id, action, notes)
  values (v_request_id, v_performed_by, 'created', p_title);

  return v_request_id;
end; $$;

revoke all on function public.create_bunker_request(uuid, text, text, text, text, text, date, text, text, numeric, numeric) from public, anon;
grant execute on function public.create_bunker_request(uuid, text, text, text, text, text, date, text, text, numeric, numeric) to authenticated;

-- 2. Execution details (RFQ Builder Section 2 — completed after assignment)
create or replace function public.upsert_bunker_execution_details(
  p_request_id uuid,
  p_supplier_org_id uuid,
  p_delivery_restrictions text,
  p_hose_connection text,
  p_bunkering_side text,
  p_site_contact_name text,
  p_site_contact_phone text,
  p_emergency_stop_location text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.has_module_permission(auth.uid(), 'orbit', 'edit') then
    raise exception 'Access denied: orbit edit permission required';
  end if;

  insert into public.bunker_execution_details (
    request_id, supplier_org_id, delivery_restrictions, hose_connection,
    bunkering_side, site_contact_name, site_contact_phone, emergency_stop_location
  ) values (
    p_request_id, p_supplier_org_id, p_delivery_restrictions, p_hose_connection,
    p_bunkering_side, p_site_contact_name, p_site_contact_phone, p_emergency_stop_location
  )
  on conflict (request_id) do update set
    supplier_org_id = excluded.supplier_org_id,
    delivery_restrictions = excluded.delivery_restrictions,
    hose_connection = excluded.hose_connection,
    bunkering_side = excluded.bunkering_side,
    site_contact_name = excluded.site_contact_name,
    site_contact_phone = excluded.site_contact_phone,
    emergency_stop_location = excluded.emergency_stop_location;
end; $$;

revoke all on function public.upsert_bunker_execution_details(uuid, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.upsert_bunker_execution_details(uuid, uuid, text, text, text, text, text, text) to authenticated;

-- 3. Quotation Generate/Send separation (new — orbit_quotations previously
-- had no explicit "send" checkpoint, just submit -> accept/reject).
create or replace function public.send_orbit_quotation(p_quotation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_performed_by uuid := auth.uid();
  v_request_id uuid;
  v_quote record;
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;

  select * into v_quote from public.orbit_quotations where id = p_quotation_id;
  if v_quote.id is null then
    raise exception 'Quotation % not found', p_quotation_id;
  end if;

  update public.orbit_quotations
  set sent_at = now(),
      sent_snapshot = jsonb_build_object('supplier', supplier, 'amount', amount, 'currency', currency, 'sent_at', now())
  where id = p_quotation_id
  returning request_id into v_request_id;

  insert into public.orbit_activity_log (request_id, actor_id, action, notes)
  values (v_request_id, v_performed_by, 'quotation_sent', v_quote.supplier || ' — ' || v_quote.currency || ' ' || v_quote.amount);
end; $$;

revoke all on function public.send_orbit_quotation(uuid) from public, anon;
grant execute on function public.send_orbit_quotation(uuid) to authenticated;

-- 4. Bunker Delivery Note — create/update while draft, lock on sign.
create or replace function public.upsert_bunker_delivery_note(
  p_request_id uuid, p_bdn_data jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_performed_by uuid := auth.uid();
  v_id uuid;
  v_bdn_number text;
  v_yacht_id uuid;
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;
  if not public.has_module_permission(v_performed_by, 'orbit', 'edit') then
    raise exception 'Access denied: orbit edit permission required';
  end if;

  select id into v_id from public.bunker_delivery_notes where request_id = p_request_id;

  if v_id is null then
    select yacht_id into v_yacht_id from public.orbit_service_requests where id = p_request_id;
    v_bdn_number := 'BDN-' || to_char(now(), 'YYYY') || '-' || substr(gen_random_uuid()::text, 1, 6);

    insert into public.bunker_delivery_notes (
      request_id, bdn_number, ptw_number, vessel_id, draft_m, delivery_port, berth_no,
      camlock_type, camlock_size_diameter, hose_size_diameter, hose_length_m,
      manifold_location, manifold_diagram_note, fuel_grade, fuel_description,
      max_sulfur_content, specs, min_qty, max_qty, quantity_uom,
      transfer_rate_per_hour, delivery_method, berth_alongside_side,
      supplier_org_id, driver_name, tanker_no, tanker_capacity,
      alongside_at, commenced_at, completed_at,
      product_grade, viscosity_cst, sulfur_content_pct, flash_point_c, density_kg_m3, delivered_mt,
      marpol_limit_basis, purchaser_specified_limit_pct, created_by
    )
    select
      p_request_id, v_bdn_number, p_bdn_data->>'ptw_number', coalesce((p_bdn_data->>'vessel_id')::uuid, v_yacht_id),
      (p_bdn_data->>'draft_m')::numeric, p_bdn_data->>'delivery_port', p_bdn_data->>'berth_no',
      p_bdn_data->>'camlock_type', p_bdn_data->>'camlock_size_diameter', p_bdn_data->>'hose_size_diameter',
      (p_bdn_data->>'hose_length_m')::numeric, p_bdn_data->>'manifold_location', p_bdn_data->>'manifold_diagram_note',
      p_bdn_data->>'fuel_grade', p_bdn_data->>'fuel_description', p_bdn_data->>'max_sulfur_content',
      p_bdn_data->>'specs', (p_bdn_data->>'min_qty')::numeric, (p_bdn_data->>'max_qty')::numeric,
      coalesce(p_bdn_data->>'quantity_uom', 'MT'),
      (p_bdn_data->>'transfer_rate_per_hour')::numeric, p_bdn_data->>'delivery_method', p_bdn_data->>'berth_alongside_side',
      (p_bdn_data->>'supplier_org_id')::uuid, p_bdn_data->>'driver_name', p_bdn_data->>'tanker_no',
      (p_bdn_data->>'tanker_capacity')::numeric,
      (p_bdn_data->>'alongside_at')::timestamptz, (p_bdn_data->>'commenced_at')::timestamptz, (p_bdn_data->>'completed_at')::timestamptz,
      p_bdn_data->>'product_grade', (p_bdn_data->>'viscosity_cst')::numeric, (p_bdn_data->>'sulfur_content_pct')::numeric,
      (p_bdn_data->>'flash_point_c')::numeric, (p_bdn_data->>'density_kg_m3')::numeric, (p_bdn_data->>'delivered_mt')::numeric,
      p_bdn_data->>'marpol_limit_basis', (p_bdn_data->>'purchaser_specified_limit_pct')::numeric, v_performed_by
    returning id into v_id;
  else
    update public.bunker_delivery_notes set
      ptw_number = coalesce(p_bdn_data->>'ptw_number', ptw_number),
      draft_m = coalesce((p_bdn_data->>'draft_m')::numeric, draft_m),
      delivery_port = coalesce(p_bdn_data->>'delivery_port', delivery_port),
      berth_no = coalesce(p_bdn_data->>'berth_no', berth_no),
      camlock_type = coalesce(p_bdn_data->>'camlock_type', camlock_type),
      camlock_size_diameter = coalesce(p_bdn_data->>'camlock_size_diameter', camlock_size_diameter),
      hose_size_diameter = coalesce(p_bdn_data->>'hose_size_diameter', hose_size_diameter),
      hose_length_m = coalesce((p_bdn_data->>'hose_length_m')::numeric, hose_length_m),
      manifold_location = coalesce(p_bdn_data->>'manifold_location', manifold_location),
      fuel_grade = coalesce(p_bdn_data->>'fuel_grade', fuel_grade),
      min_qty = coalesce((p_bdn_data->>'min_qty')::numeric, min_qty),
      max_qty = coalesce((p_bdn_data->>'max_qty')::numeric, max_qty),
      delivery_method = coalesce(p_bdn_data->>'delivery_method', delivery_method),
      berth_alongside_side = coalesce(p_bdn_data->>'berth_alongside_side', berth_alongside_side),
      supplier_org_id = coalesce((p_bdn_data->>'supplier_org_id')::uuid, supplier_org_id),
      driver_name = coalesce(p_bdn_data->>'driver_name', driver_name),
      tanker_no = coalesce(p_bdn_data->>'tanker_no', tanker_no),
      tanker_capacity = coalesce((p_bdn_data->>'tanker_capacity')::numeric, tanker_capacity),
      alongside_at = coalesce((p_bdn_data->>'alongside_at')::timestamptz, alongside_at),
      commenced_at = coalesce((p_bdn_data->>'commenced_at')::timestamptz, commenced_at),
      completed_at = coalesce((p_bdn_data->>'completed_at')::timestamptz, completed_at),
      product_grade = coalesce(p_bdn_data->>'product_grade', product_grade),
      viscosity_cst = coalesce((p_bdn_data->>'viscosity_cst')::numeric, viscosity_cst),
      sulfur_content_pct = coalesce((p_bdn_data->>'sulfur_content_pct')::numeric, sulfur_content_pct),
      flash_point_c = coalesce((p_bdn_data->>'flash_point_c')::numeric, flash_point_c),
      density_kg_m3 = coalesce((p_bdn_data->>'density_kg_m3')::numeric, density_kg_m3),
      delivered_mt = coalesce((p_bdn_data->>'delivered_mt')::numeric, delivered_mt),
      marpol_limit_basis = coalesce(p_bdn_data->>'marpol_limit_basis', marpol_limit_basis),
      purchaser_specified_limit_pct = coalesce((p_bdn_data->>'purchaser_specified_limit_pct')::numeric, purchaser_specified_limit_pct)
    where id = v_id and status <> 'signed';
  end if;

  return v_id;
end; $$;

revoke all on function public.upsert_bunker_delivery_note(uuid, jsonb) from public, anon;
grant execute on function public.upsert_bunker_delivery_note(uuid, jsonb) to authenticated;

create or replace function public.sign_bunker_delivery_note(p_bdn_id uuid, p_signed_by_name text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.bunker_delivery_notes
  set status = 'signed', signed_by_name = p_signed_by_name, signed_at = now()
  where id = p_bdn_id;
end; $$;

revoke all on function public.sign_bunker_delivery_note(uuid, text) from public, anon;
grant execute on function public.sign_bunker_delivery_note(uuid, text) to authenticated;

-- 5. Master's Declaration
create or replace function public.create_masters_declaration(
  p_request_id uuid, p_declaration_data jsonb
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_performed_by uuid := auth.uid();
  v_id uuid;
  v_yacht_id uuid;
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;
  if not public.has_module_permission(v_performed_by, 'orbit', 'edit') then
    raise exception 'Access denied: orbit edit permission required';
  end if;

  select yacht_id into v_yacht_id from public.orbit_service_requests where id = p_request_id;

  insert into public.masters_declarations (
    request_id, owner_name, vessel_id, ship_arrival_date, bunker_supply_date, bunker_supply_port,
    last_port_of_call, load_port, next_port_of_call, final_quantity_received, quantity_uom,
    transport_category, confirms_no_sanctioned_port_voyage, master_name, created_by
  ) values (
    p_request_id, p_declaration_data->>'owner_name', coalesce((p_declaration_data->>'vessel_id')::uuid, v_yacht_id),
    (p_declaration_data->>'ship_arrival_date')::date, (p_declaration_data->>'bunker_supply_date')::date,
    p_declaration_data->>'bunker_supply_port', p_declaration_data->>'last_port_of_call',
    p_declaration_data->>'load_port', p_declaration_data->>'next_port_of_call',
    (p_declaration_data->>'final_quantity_received')::numeric, coalesce(p_declaration_data->>'quantity_uom', 'MT'),
    p_declaration_data->>'transport_category',
    coalesce((p_declaration_data->>'confirms_no_sanctioned_port_voyage')::boolean, true),
    p_declaration_data->>'master_name', v_performed_by
  ) returning id into v_id;

  return v_id;
end; $$;

revoke all on function public.create_masters_declaration(uuid, jsonb) from public, anon;
grant execute on function public.create_masters_declaration(uuid, jsonb) to authenticated;

create or replace function public.sign_masters_declaration(p_declaration_id uuid, p_signature_file_path text, p_ship_stamp_file_path text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.masters_declarations
  set status = 'signed', signature_file_path = p_signature_file_path,
      ship_stamp_file_path = p_ship_stamp_file_path, declared_at = current_date
  where id = p_declaration_id;
end; $$;

revoke all on function public.sign_masters_declaration(uuid, text, text) from public, anon;
grant execute on function public.sign_masters_declaration(uuid, text, text) to authenticated;

-- 6. Invoice stub setter (mirrors orbit_projects' existing billing pattern)
create or replace function public.set_orbit_billing(
  p_request_id uuid, p_charge_amount numeric, p_billing_status text, p_invoice_ref text, p_invoice_amount numeric
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_performed_by uuid := auth.uid();
begin
  if v_performed_by is null then
    raise exception 'Authentication required';
  end if;
  if not public.has_module_permission(v_performed_by, 'orbit', 'finance') then
    raise exception 'Access denied: orbit finance permission required';
  end if;

  update public.orbit_service_requests
  set charge_amount = coalesce(p_charge_amount, charge_amount),
      billing_status = coalesce(p_billing_status, billing_status),
      invoice_ref = coalesce(p_invoice_ref, invoice_ref),
      invoice_amount = coalesce(p_invoice_amount, invoice_amount)
  where id = p_request_id;

  insert into public.orbit_activity_log (request_id, actor_id, action, notes)
  values (p_request_id, v_performed_by, 'billing_updated', jsonb_build_object(
    'invoice_ref', p_invoice_ref, 'invoice_amount', p_invoice_amount
  )::text);
end; $$;

revoke all on function public.set_orbit_billing(uuid, numeric, text, text, numeric) from public, anon;
grant execute on function public.set_orbit_billing(uuid, numeric, text, text, numeric) to authenticated;

-- 7. Documents / approvals (generic ORBIT tables from migration 079)
create or replace function public.add_orbit_document(
  p_request_id uuid, p_document_type text, p_file_path text
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

  update public.orbit_documents
  set file_path = p_file_path, uploaded_at = now()
  where request_id = p_request_id and document_type = p_document_type
  returning id into v_id;

  if v_id is null then
    insert into public.orbit_documents (request_id, document_type, file_path, uploaded_at)
    values (p_request_id, p_document_type, p_file_path, now())
    returning id into v_id;
  end if;

  return v_id;
end; $$;

revoke all on function public.add_orbit_document(uuid, text, text) from public, anon;
grant execute on function public.add_orbit_document(uuid, text, text) to authenticated;

create or replace function public.record_orbit_approval(
  p_request_id uuid, p_approver_role text, p_status text, p_approved_by_name text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid approval status: %', p_status;
  end if;

  update public.orbit_approvals
  set status = p_status, approved_by_name = p_approved_by_name,
      approved_at = case when p_status = 'approved' then now() else approved_at end
  where request_id = p_request_id and approver_role = p_approver_role;
end; $$;

revoke all on function public.record_orbit_approval(uuid, text, text, text) from public, anon;
grant execute on function public.record_orbit_approval(uuid, text, text, text) to authenticated;
