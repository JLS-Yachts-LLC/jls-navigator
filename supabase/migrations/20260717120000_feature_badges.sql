-- Feature Release badges: admins tag a nav item (by its shell `screen` key) with a
-- lifecycle badge (beta / in_development / active) that renders as a small pill on
-- the left sidebar. Managed under Settings → Feature Release.
create table if not exists public.feature_badges (
  screen     text primary key,
  badge      text not null default 'none' check (badge in ('none','beta','in_development','active')),
  updated_at timestamptz not null default now()
);

alter table public.feature_badges enable row level security;

-- Everyone signed in can READ (so the sidebar shows the badges); only staff write.
drop policy if exists read_all on public.feature_badges;
create policy read_all on public.feature_badges for select to authenticated using (true);
drop policy if exists staff_write on public.feature_badges;
create policy staff_write on public.feature_badges for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
