-- App -> SharePoint write-back: link columns so the push can PATCH the right SP item.
alter table public.permits      add column if not exists sharepoint_item_id   text;
alter table public.permits      add column if not exists sharepoint_synced_at timestamptz;
alter table public.small_boats  add column if not exists sharepoint_item_id   text;
alter table public.small_boats  add column if not exists sharepoint_synced_at timestamptz;
create index if not exists permits_sp_item_idx     on public.permits (sharepoint_item_id);
create index if not exists small_boats_sp_item_idx on public.small_boats (sharepoint_item_id);
