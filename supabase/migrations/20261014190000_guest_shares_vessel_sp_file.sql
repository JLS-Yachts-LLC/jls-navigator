-- Guest sharing: a single SharePoint-only vessel file can be shared as it is,
-- without importing it into Polaris first (which fails for files whose name
-- gives no usable type, e.g. "….octet-stream" email attachments).
--   yacht_sp_file  resource_id = yachts.id, resource_part = SharePoint item id
alter table public.guest_shares drop constraint if exists guest_shares_resource_type_check;
alter table public.guest_shares add constraint guest_shares_resource_type_check
  check (resource_type in (
    'training_folder', 'training_document',
    'yacht_all', 'yacht_folder', 'yacht_document', 'yacht_sp_file',
    'crew_all', 'crew_folder', 'crew_document', 'crew_passport_file', 'crew_sp_file'
  ));
