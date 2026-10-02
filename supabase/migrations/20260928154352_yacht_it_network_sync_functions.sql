-- Change feed. Columns listed explicitly: what crosses to New Horizon is a
-- decision, not whatever the table happens to hold by then.
create or replace function public.yacht_it_sync_changes(p_since timestamptz)
returns jsonb language sql stable set search_path = public as $$
  with since as (select coalesce(p_since, '-infinity'::timestamptz) as t)
  select jsonb_build_object(
    'now', now(),
    'maps', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, name, imo, builder, flag, length_m, notes, created_at, updated_at
      from yacht_it_maps, since where updated_at > since.t) x), '[]'::jsonb),
    'zones', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, map_id, name, deck, position_x, position_y, width, height, colour,
             sort_order, created_at, updated_at
      from yacht_it_zones, since where updated_at > since.t) x), '[]'::jsonb),
    'systems', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, map_id, zone_id, discipline, name, manufacturer, model, role_description,
             hostname, ip_address, subnet, vlan, mac, uplink_system_id, switch_port,
             supplier_name, support_contract_end, support_phone, support_email, escalation_notes,
             firmware_version, install_date, warranty_end, eol_date, last_serviced, criticality,
             deck, compartment, rack_location, access_notes, credential_ref,
             status, notes, position_x, position_y, on_canvas, sort_order,
             datto_uid, datto_linked_at, created_at, updated_at
      from yacht_it_systems, since where updated_at > since.t) x), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id, map_id, from_system_id, to_system_id, link_type, label, notes, from_uplink,
             created_at, updated_at
      from yacht_it_links, since where updated_at > since.t) x), '[]'::jsonb),
    'deletions', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select table_name, row_id, map_id, deleted_at
      from yacht_it_deletions, since where deleted_at > since.t) x), '[]'::jsonb)
  );
$$;

-- Apply a change feed. Set-based and order-independent within one call. Rows
-- that cannot be placed are skipped and counted, never raised: one bad row must
-- not stall the whole sync.
create or replace function public.yacht_it_sync_apply(p_payload jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  n_deleted int := 0; n_maps int := 0; n_zones int := 0; n_systems int := 0;
  n_links int := 0; n_uplinks int := 0; n int;
  v_received jsonb; v_rejected jsonb;
  v_dels jsonb := coalesce(p_payload->'deletions', '[]'::jsonb);
begin
  perform set_config('yacht_it.syncing', 'on', true);

  v_received := jsonb_build_object(
    'maps', jsonb_array_length(coalesce(p_payload->'maps', '[]'::jsonb)),
    'zones', jsonb_array_length(coalesce(p_payload->'zones', '[]'::jsonb)),
    'systems', jsonb_array_length(coalesce(p_payload->'systems', '[]'::jsonb)),
    'links', jsonb_array_length(coalesce(p_payload->'links', '[]'::jsonb)),
    'deletions', jsonb_array_length(v_dels));

  -- Deletions always win. Tombstone first, carrying the other side's timestamp.
  insert into yacht_it_deletions (table_name, row_id, map_id, deleted_at)
  select d.table_name, d.row_id, d.map_id, coalesce(d.deleted_at, now())
  from jsonb_to_recordset(v_dels) as d(table_name text, row_id uuid, map_id uuid, deleted_at timestamptz)
  where d.table_name in ('yacht_it_maps', 'yacht_it_zones', 'yacht_it_systems', 'yacht_it_links')
    and d.row_id is not null
  on conflict (table_name, row_id) do nothing;

  delete from yacht_it_links where id in (select (e->>'row_id')::uuid from jsonb_array_elements(v_dels) e where e->>'table_name' = 'yacht_it_links');
  get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from yacht_it_systems where id in (select (e->>'row_id')::uuid from jsonb_array_elements(v_dels) e where e->>'table_name' = 'yacht_it_systems');
  get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from yacht_it_zones where id in (select (e->>'row_id')::uuid from jsonb_array_elements(v_dels) e where e->>'table_name' = 'yacht_it_zones');
  get diagnostics n = row_count; n_deleted := n_deleted + n;
  delete from yacht_it_maps where id in (select (e->>'row_id')::uuid from jsonb_array_elements(v_dels) e where e->>'table_name' = 'yacht_it_maps');
  get diagnostics n = row_count; n_deleted := n_deleted + n;

  -- Maps
  insert into yacht_it_maps (id, name, imo, builder, flag, length_m, notes, created_at, updated_at)
  select m.id, coalesce(m.name, 'Untitled vessel'), m.imo, m.builder, m.flag, m.length_m, m.notes,
         coalesce(m.created_at, now()), coalesce(m.updated_at, now())
  from jsonb_populate_recordset(null::yacht_it_maps, coalesce(p_payload->'maps', '[]'::jsonb)) m
  where m.id is not null
    and not exists (select 1 from yacht_it_deletions d where d.table_name = 'yacht_it_maps' and d.row_id = m.id)
  on conflict (id) do update set
    name = excluded.name, imo = excluded.imo, builder = excluded.builder, flag = excluded.flag,
    length_m = excluded.length_m, notes = excluded.notes, updated_at = excluded.updated_at
  where yacht_it_maps.updated_at < excluded.updated_at;
  get diagnostics n_maps = row_count;

  -- Zones
  insert into yacht_it_zones (id, map_id, name, deck, position_x, position_y, width, height,
                              colour, sort_order, created_at, updated_at)
  select z.id, z.map_id, coalesce(z.name, 'Zone'), z.deck,
         coalesce(z.position_x, 0), coalesce(z.position_y, 0),
         coalesce(z.width, 520), coalesce(z.height, 320), z.colour, coalesce(z.sort_order, 0),
         coalesce(z.created_at, now()), coalesce(z.updated_at, now())
  from jsonb_populate_recordset(null::yacht_it_zones, coalesce(p_payload->'zones', '[]'::jsonb)) z
  where z.id is not null
    and exists (select 1 from yacht_it_maps m where m.id = z.map_id)
    and not exists (select 1 from yacht_it_deletions d where d.table_name = 'yacht_it_zones' and d.row_id = z.id)
  on conflict (id) do update set
    map_id = excluded.map_id, name = excluded.name, deck = excluded.deck,
    position_x = excluded.position_x, position_y = excluded.position_y,
    width = excluded.width, height = excluded.height, colour = excluded.colour,
    sort_order = excluded.sort_order, updated_at = excluded.updated_at
  where yacht_it_zones.updated_at < excluded.updated_at;
  get diagnostics n_zones = row_count;

  -- Systems, pass 1: everything but the uplink (a self-reference whose target
  -- may arrive in this same payload).
  insert into yacht_it_systems (
    id, map_id, zone_id, discipline, name, manufacturer, model, role_description,
    hostname, ip_address, subnet, vlan, mac, uplink_system_id, switch_port,
    supplier_name, support_contract_end, support_phone, support_email, escalation_notes,
    firmware_version, install_date, warranty_end, eol_date, last_serviced, criticality,
    deck, compartment, rack_location, access_notes, credential_ref,
    status, notes, position_x, position_y, on_canvas, sort_order,
    datto_uid, datto_linked_at, created_at, updated_at)
  select s.id, s.map_id,
         case when exists (select 1 from yacht_it_zones z where z.id = s.zone_id) then s.zone_id end,
         s.discipline, coalesce(s.name, 'New system'), s.manufacturer, s.model, s.role_description,
         s.hostname, s.ip_address, s.subnet, s.vlan, s.mac, null, s.switch_port,
         s.supplier_name, s.support_contract_end, s.support_phone, s.support_email, s.escalation_notes,
         s.firmware_version, s.install_date, s.warranty_end, s.eol_date, s.last_serviced, s.criticality,
         s.deck, s.compartment, s.rack_location, s.access_notes, s.credential_ref,
         s.status, s.notes, coalesce(s.position_x, 0), coalesce(s.position_y, 0),
         coalesce(s.on_canvas, true), coalesce(s.sort_order, 0),
         s.datto_uid, s.datto_linked_at, coalesce(s.created_at, now()), coalesce(s.updated_at, now())
  from jsonb_populate_recordset(null::yacht_it_systems, coalesce(p_payload->'systems', '[]'::jsonb)) s
  where s.id is not null
    and exists (select 1 from yacht_it_maps m where m.id = s.map_id)
    and s.discipline in ('wan_comms', 'core_network', 'wireless', 'servers_storage',
                         'av_entertainment', 'lighting_knx', 'bridge_nav', 'security_cctv',
                         'telephony', 'bespoke_platform', 'power_ups', 'crew_it', 'other')
    and s.criticality in ('critical', 'high', 'medium', 'low')
    and s.status in ('operational', 'degraded', 'fault', 'planned', 'decommissioned')
    and not exists (select 1 from yacht_it_deletions d where d.table_name = 'yacht_it_systems' and d.row_id = s.id)
  on conflict (id) do update set
    map_id = excluded.map_id, zone_id = excluded.zone_id, discipline = excluded.discipline,
    name = excluded.name, manufacturer = excluded.manufacturer, model = excluded.model,
    role_description = excluded.role_description, hostname = excluded.hostname,
    ip_address = excluded.ip_address, subnet = excluded.subnet, vlan = excluded.vlan,
    mac = excluded.mac, switch_port = excluded.switch_port,
    supplier_name = excluded.supplier_name, support_contract_end = excluded.support_contract_end,
    support_phone = excluded.support_phone, support_email = excluded.support_email,
    escalation_notes = excluded.escalation_notes, firmware_version = excluded.firmware_version,
    install_date = excluded.install_date, warranty_end = excluded.warranty_end,
    eol_date = excluded.eol_date, last_serviced = excluded.last_serviced,
    criticality = excluded.criticality, deck = excluded.deck, compartment = excluded.compartment,
    rack_location = excluded.rack_location, access_notes = excluded.access_notes,
    credential_ref = excluded.credential_ref, status = excluded.status, notes = excluded.notes,
    position_x = excluded.position_x, position_y = excluded.position_y,
    on_canvas = excluded.on_canvas, sort_order = excluded.sort_order,
    datto_uid = excluded.datto_uid, datto_linked_at = excluded.datto_linked_at,
    updated_at = excluded.updated_at
  where yacht_it_systems.updated_at < excluded.updated_at;
  get diagnostics n_systems = row_count;

  -- Links
  insert into yacht_it_links (id, map_id, from_system_id, to_system_id, link_type, label, notes,
                              from_uplink, created_at, updated_at)
  select l.id, l.map_id, l.from_system_id, l.to_system_id, l.link_type, l.label, l.notes,
         coalesce(l.from_uplink, false), coalesce(l.created_at, now()), coalesce(l.updated_at, now())
  from jsonb_populate_recordset(null::yacht_it_links, coalesce(p_payload->'links', '[]'::jsonb)) l
  where l.id is not null
    and exists (select 1 from yacht_it_maps m where m.id = l.map_id)
    and exists (select 1 from yacht_it_systems s where s.id = l.from_system_id)
    and exists (select 1 from yacht_it_systems s where s.id = l.to_system_id)
    and l.link_type in ('ethernet', 'fibre', 'wireless', 'serial', 'hdmi', 'dante', 'knx_bus', 'power')
    and not exists (select 1 from yacht_it_deletions d where d.table_name = 'yacht_it_links' and d.row_id = l.id)
  on conflict (id) do update set
    map_id = excluded.map_id, from_system_id = excluded.from_system_id,
    to_system_id = excluded.to_system_id, link_type = excluded.link_type,
    label = excluded.label, notes = excluded.notes, from_uplink = excluded.from_uplink,
    updated_at = excluded.updated_at
  where yacht_it_links.updated_at < excluded.updated_at;
  get diagnostics n_links = row_count;

  -- Systems, pass 2: uplinks — only on rows now holding the incoming version,
  -- so an uplink changed more recently here is never overwritten.
  update yacht_it_systems s
  set uplink_system_id = case
        when exists (select 1 from yacht_it_systems t where t.id = i.uplink_system_id) then i.uplink_system_id end
  from jsonb_populate_recordset(null::yacht_it_systems, coalesce(p_payload->'systems', '[]'::jsonb)) i
  where s.id = i.id
    and s.updated_at = i.updated_at
    and s.uplink_system_id is distinct from (
      case when exists (select 1 from yacht_it_systems t where t.id = i.uplink_system_id) then i.uplink_system_id end);
  get diagnostics n_uplinks = row_count;

  -- Rows that can never be placed as sent (distinct from rows skipped because
  -- ours is newer, which is normal and not counted).
  v_rejected := jsonb_build_object(
    'systems', (select count(*) from jsonb_populate_recordset(null::yacht_it_systems, coalesce(p_payload->'systems', '[]'::jsonb)) s
                where s.discipline not in ('wan_comms', 'core_network', 'wireless', 'servers_storage',
                        'av_entertainment', 'lighting_knx', 'bridge_nav', 'security_cctv',
                        'telephony', 'bespoke_platform', 'power_ups', 'crew_it', 'other')
                   or s.criticality not in ('critical', 'high', 'medium', 'low')
                   or s.status not in ('operational', 'degraded', 'fault', 'planned', 'decommissioned')
                   or not exists (select 1 from yacht_it_maps m where m.id = s.map_id)),
    'links', (select count(*) from jsonb_populate_recordset(null::yacht_it_links, coalesce(p_payload->'links', '[]'::jsonb)) l
              where l.link_type not in ('ethernet', 'fibre', 'wireless', 'serial', 'hdmi', 'dante', 'knx_bus', 'power')
                 or not exists (select 1 from yacht_it_systems s where s.id = l.from_system_id)
                 or not exists (select 1 from yacht_it_systems s where s.id = l.to_system_id)));

  return jsonb_build_object(
    'received', v_received,
    'applied', jsonb_build_object('maps', n_maps, 'zones', n_zones, 'systems', n_systems,
                                  'links', n_links, 'uplinks', n_uplinks, 'deleted', n_deleted),
    'rejected', v_rejected);
end;
$$;

revoke all on function public.yacht_it_sync_changes(timestamptz) from public;
revoke all on function public.yacht_it_sync_apply(jsonb) from public;
grant execute on function public.yacht_it_sync_changes(timestamptz) to service_role;
grant execute on function public.yacht_it_sync_apply(jsonb) to service_role;

-- What users may see of the sync: a safe summary, never the config.
create or replace function public.yacht_it_sync_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.has_module_permission(auth.uid(), 'yacht_it', 'view') then (
    select jsonb_build_object(
      'last_run_at', s.last_run_at, 'last_ok_at', s.last_ok_at,
      'last_error', s.last_error, 'last_result', s.last_result,
      'enabled', (select c.enabled from yacht_it_sync_config c where c.id = 1))
    from yacht_it_sync_state s where s.id = 1) end;
$$;
revoke all on function public.yacht_it_sync_status() from public;
grant execute on function public.yacht_it_sync_status() to authenticated;
