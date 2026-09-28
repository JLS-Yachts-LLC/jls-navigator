-- updated_at is preserved on rows the sync applies (else every synced row looks
-- freshly edited here and ping-pongs forever); deletions leave a tombstone so a
-- deleted row is never re-created from the other side.

create or replace function public.yacht_it_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('yacht_it.syncing', true), '') = 'on' then
    return new;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.yacht_it_deletions (
  id bigserial primary key,
  table_name text not null check (table_name in (
    'yacht_it_maps', 'yacht_it_zones', 'yacht_it_systems', 'yacht_it_links')),
  row_id uuid not null,
  map_id uuid,
  deleted_at timestamptz not null default now(),
  unique (table_name, row_id)
);
create index if not exists idx_yacht_it_deletions_at on public.yacht_it_deletions (deleted_at);
comment on table public.yacht_it_deletions is
  'Tombstones for the New Horizon two-way sync. A row here is never re-created by the sync, whichever side still has it.';

-- SECURITY DEFINER because the tombstone table is service-only and a trigger
-- runs as whoever deleted the row.
create or replace function public.yacht_it_record_deletion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v jsonb := to_jsonb(old);
begin
  if coalesce(current_setting('yacht_it.syncing', true), '') = 'on' then
    return old;
  end if;
  insert into public.yacht_it_deletions (table_name, row_id, map_id)
  values (tg_table_name, (v->>'id')::uuid, coalesce((v->>'map_id')::uuid, (v->>'id')::uuid))
  on conflict (table_name, row_id) do nothing;
  return old;
end;
$$;
revoke all on function public.yacht_it_record_deletion() from public;

do $$
declare t text;
begin
  foreach t in array array['yacht_it_maps', 'yacht_it_zones', 'yacht_it_systems', 'yacht_it_links'] loop
    execute format('drop trigger if exists %1$s_updated_at on public.%1$s', t);
    execute format('create trigger %1$s_updated_at before update on public.%1$s
       for each row execute function public.yacht_it_touch_updated_at()', t);
    execute format('drop trigger if exists %1$s_tombstone on public.%1$s', t);
    execute format('create trigger %1$s_tombstone after delete on public.%1$s
       for each row execute function public.yacht_it_record_deletion()', t);
  end loop;
end;
$$;

create table if not exists public.yacht_it_sync_state (
  id smallint primary key default 1 check (id = 1),
  last_pull_at timestamptz,
  last_push_at timestamptz,
  last_full_at timestamptz,
  last_run_at timestamptz,
  last_ok_at timestamptz,
  last_result jsonb,
  last_error text
);
insert into public.yacht_it_sync_state (id) values (1) on conflict (id) do nothing;

-- The secret is generated here and never leaves in the clear: New Horizon is
-- only ever given its SHA-256.
create table if not exists public.yacht_it_sync_config (
  id smallint primary key default 1 check (id = 1),
  remote_url text not null default 'https://servicedesk.newhorizon-it.co.uk',
  shared_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.yacht_it_sync_config (id) values (1) on conflict (id) do nothing;
