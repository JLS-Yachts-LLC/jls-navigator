-- ShipSync packages: external delivery-note number + attached documents,
-- to mirror the Monday "Local Shipment" board columns.

alter table public.shipsync_packages
  add column if not exists delivery_note_no text,
  add column if not exists documents jsonb;
