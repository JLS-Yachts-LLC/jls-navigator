-- SD-0021: record whether an issued visa actually reached its crew member's
-- SharePoint folder.
--
-- The quick-attach on the Immigration dashboard discarded filing errors, so a
-- visa could attach in Polaris, the crew folder be created in SharePoint, the
-- upload fail, and the only feedback be "Visa attached". Persisting the outcome
-- means a failure outlives the toast and unfiled visas can be found:
--
--   select id, given_name, surname, vessel_name, sharepoint_error
--     from visa_applications
--    where visa_document_url is not null and sharepoint_filed_at is null;

alter table public.visa_applications
  add column if not exists sharepoint_filed_at timestamptz,
  add column if not exists sharepoint_error    text;

comment on column public.visa_applications.sharepoint_error is
  'Why the last attempt to file the issued visa into the crew SharePoint folder failed (SD-0021). Null when filed or never attempted.';
