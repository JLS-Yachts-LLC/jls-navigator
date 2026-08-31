-- Sequential "Item ID" for ShipSync Import shipments created directly in the
-- app (New Shipment dialog / inline "Add shipment"). Rows synced FROM Monday
-- already carry their own Item ID (a real custom column on Monday's board,
-- e.g. "SHP26-0001") — this only fills the gap for locally-created rows,
-- which previously left the field blank. Same format so a locally-created
-- row doesn't look out of place next to synced ones — but this is our own
-- independent counter, not a mirror of Monday's internal one.
create sequence if not exists public.shipsync_item_id_seq start 1;

create or replace function public.next_shipsync_item_id()
  returns text language sql security definer set search_path = public as $$
  select 'SHP' || to_char(now(), 'YY') || '-' || lpad(nextval('public.shipsync_item_id_seq')::text, 4, '0');
$$;

-- Same anon-only revoke as next_shipsync_delivery_number (schema/migrations/068) —
-- authenticated staff can still call it, anon key cannot.
revoke execute on function public.next_shipsync_item_id() from anon;
