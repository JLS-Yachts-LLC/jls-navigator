-- Real spreadsheet import surfaced two schema gaps:
-- 1) Client/Internal items can be checked out directly (not just Package
--    Content rows) with a checked-out date, who it went to, and an actual
--    return date.
-- 2) A shelf can legitimately have no weight limit (blank in the source
--    spreadsheet) rather than always requiring one.

ALTER TABLE warehouse_shelves ALTER COLUMN max_weight_kg DROP NOT NULL;

ALTER TABLE warehouse_client_items
  ADD COLUMN checked_out_date date,
  ADD COLUMN checked_out_to text,
  ADD COLUMN actual_return_date date;
ALTER TABLE warehouse_client_items DROP CONSTRAINT warehouse_client_items_status_check;
ALTER TABLE warehouse_client_items ADD CONSTRAINT warehouse_client_items_status_check
  CHECK (status in ('Stored','Checked Out','Returned','Disposed','Completed'));

ALTER TABLE warehouse_internal_items
  ADD COLUMN checked_out_date date,
  ADD COLUMN checked_out_to text,
  ADD COLUMN actual_return_date date;
ALTER TABLE warehouse_internal_items DROP CONSTRAINT warehouse_internal_items_status_check;
ALTER TABLE warehouse_internal_items ADD CONSTRAINT warehouse_internal_items_status_check
  CHECK (status in ('Stored','Checked Out','Returned','Disposed','Completed'));
