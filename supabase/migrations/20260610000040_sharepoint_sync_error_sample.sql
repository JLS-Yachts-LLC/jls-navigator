-- Store a sample of the actual per-row error messages from the last sync run,
-- so SharePoint sync failures can be diagnosed without trawling Worker logs.
alter table public.sharepoint_sync_configs
  add column if not exists last_sync_error_sample jsonb;
