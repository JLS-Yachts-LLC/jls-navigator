-- Link visa applications to their SharePoint source item for incremental sync matching.
alter table public.visa_applications add column if not exists sharepoint_item_id   text;
alter table public.visa_applications add column if not exists sharepoint_synced_at timestamptz;
create index if not exists visa_applications_sp_item_idx on public.visa_applications (sharepoint_item_id);
