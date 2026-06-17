-- Enable SharePoint write-back for crew sign-on/off events: the push engine needs
-- updated_at + sharepoint_item_id/synced_at (matching the other synced tables).
alter table public.crew_signon_events
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists sharepoint_item_id text,
  add column if not exists sharepoint_synced_at timestamptz;

drop trigger if exists crew_signon_events_set_updated_at on public.crew_signon_events;
create trigger crew_signon_events_set_updated_at before update on public.crew_signon_events
  for each row execute function public.set_updated_at();
