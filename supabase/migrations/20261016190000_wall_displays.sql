-- Port Operations wall — TV screens paired to Polaris.
--
-- A screen browses to /wall, is handed a secret key (kept in its own browser so
-- it remembers itself) and shows a short pairing code. A member of staff enters
-- that code in Polaris (Operations → Wall Displays) to pair it. Only the sha256
-- of the key is stored here.
--
-- Closed to anon AND authenticated: portal captains and guests are
-- "authenticated" too, so every read/write goes through /api/wall/* with the
-- service role (the display key, or a staff requireAccess check, authorises it).

create table if not exists public.wall_displays (
  id                uuid primary key default gen_random_uuid(),
  name              text,
  key_hash          text not null unique,
  status            text not null default 'pending' check (status in ('pending', 'paired')),
  pair_code         text unique,
  pair_code_expires_at timestamptz,
  settings          jsonb not null default '{}'::jsonb,
  paired_by         uuid references auth.users(id) on delete set null,
  paired_at         timestamptz,
  last_seen_at      timestamptz,
  user_agent        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists wall_displays_status_idx on public.wall_displays (status, created_at);

alter table public.wall_displays enable row level security;
revoke all on public.wall_displays from anon, authenticated;

insert into public.feature_flags (key, name, stage)
values ('wall-displays', 'Wall Displays (Port Operations TV)', 'live')
on conflict (key) do nothing;
