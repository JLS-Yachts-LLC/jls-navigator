-- Status becomes a free-typing spreadsheet-style cell (like every other
-- column on the board) instead of a fixed dropdown — the app matches typed
-- text against the current tab's group names case-insensitively to decide
-- which section a row lands in, so the check constraint just gets in the way.
alter table yacht_shipments drop constraint if exists yacht_shipments_status_check;
