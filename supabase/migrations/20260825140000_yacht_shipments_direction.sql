-- Re-add direction (import/export) so the Yacht Shipments board can split
-- into an "Import" tab and an "Export" tab.
alter table yacht_shipments
  add column if not exists direction text not null default 'import'
  check (direction in ('import', 'export'));

-- Export uses its own, shorter status pipeline (New Request / In Progress /
-- Completed) instead of Import's five-stage one, so the constraint has to
-- allow both sets of values ('in_progress' is shared by both).
alter table yacht_shipments drop constraint if exists yacht_shipments_status_check;
alter table yacht_shipments
  add constraint yacht_shipments_status_check
    check (status in ('new_lead', 'in_progress', 'on_hold', 'done', 'cancelled', 'new_request', 'completed'));
