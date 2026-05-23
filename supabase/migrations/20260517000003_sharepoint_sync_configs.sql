-- Multi-sync: one row per SharePoint list that syncs to an app table.
-- Credentials stay in integration_settings; this table holds per-list config.

create table if not exists public.sharepoint_sync_configs (
  id                uuid        primary key default gen_random_uuid(),
  name              text        not null,
  list_name         text        not null,
  sync_target       text        not null default 'yachts',
  field_mapping     jsonb       not null default '{}',
  enabled           boolean     not null default true,
  delta_token       text,
  last_synced_at    timestamptz,
  last_sync_synced  integer,
  last_sync_errors  integer,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.sharepoint_sync_configs enable row level security;

create policy "Authenticated users can manage sharepoint_sync_configs"
  on public.sharepoint_sync_configs for all
  using (auth.role() = 'authenticated');

create trigger sharepoint_sync_configs_updated_at
  before update on public.sharepoint_sync_configs
  for each row execute function public.set_updated_at();

-- Migrate existing single-sync config (if any) into the new table.
do $$
declare
  _cfg jsonb;
begin
  select config into _cfg
  from public.integration_settings
  where integration_name = 'sharepoint'
  limit 1;

  if _cfg is not null and _cfg->>'list_name' is not null then
    insert into public.sharepoint_sync_configs
      (name, list_name, sync_target, field_mapping, delta_token)
    values (
      coalesce(_cfg->>'list_name', 'Migrated Sync'),
      _cfg->>'list_name',
      coalesce(_cfg->>'sync_target', 'yachts'),
      coalesce(_cfg->'field_mapping', '{}'),
      _cfg->>'delta_token'
    )
    on conflict do nothing;
  end if;
end;
$$;
