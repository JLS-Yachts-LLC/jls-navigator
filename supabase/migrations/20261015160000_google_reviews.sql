-- Communications → Reviews ───────────────────────────────────────────────────
--
-- Google reviews for each JLS brand (JLS Yacht Training Institute, JLS Yachts,
-- Superyacht ME), read and answered from Polaris through the Google Business
-- Profile API.
--
--   • One Google connection (an account that manages every brand's Business
--     Profile) — its tokens are server-only.
--   • Each brand is linked to one Business Profile location.
--   • Reviews are pulled every 15 minutes; replies are only ever posted by a
--     person pressing Post (they are public), and every post/edit/removal is
--     logged.
--
-- Access: the `reviews` module (view = read every brand, edit = reply on every
-- brand), or a per-brand grant in review_brand_members for someone who should
-- only see their own brand (e.g. the Training team).

insert into public.modules (name, display_name, active, icon)
values ('reviews', 'Reviews', true, 'star')
on conflict (name) do nothing;

-- ── Google connection (server-only) ─────────────────────────────────────────

create table if not exists public.google_business_connection (
  id int primary key default 1 check (id = 1),
  google_email text,
  refresh_token text not null,
  access_token text,
  access_expires_at timestamptz,
  scope text,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_error text,
  last_error_at timestamptz
);
alter table public.google_business_connection enable row level security;
revoke all on public.google_business_connection from anon, authenticated;

-- ── Brands ──────────────────────────────────────────────────────────────────

create table if not exists public.review_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort int not null default 0,
  active boolean not null default true,
  -- The Business Profile location, e.g. accounts/123 + locations/456.
  google_account text,
  google_location text unique,
  location_title text,
  location_address text,
  place_id text,
  maps_url text,
  new_review_url text,
  -- Google's own figures from the last sync.
  average_rating numeric(3, 2),
  total_reviews int,
  last_synced_at timestamptz,
  last_sync_error text,
  -- True once the first full pull has been done (no alerts for the back catalogue).
  backfilled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.review_brands (name, sort) values
  ('JLS Yacht Training Institute', 1),
  ('JLS Yachts', 2),
  ('Superyacht ME', 3)
on conflict (name) do nothing;

-- ── Per-brand access (optional, on top of the module) ───────────────────────

create table if not exists public.review_brand_members (
  brand_id uuid not null references public.review_brands(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_reply boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (brand_id, user_id)
);

/** 'reply' | 'view' | null — what the current user may do on a brand. */
create or replace function public.review_brand_level(p_brand_id uuid)
returns text
language sql stable security definer
set search_path to 'public'
as $$
  select case
    when public.is_portal_captain() then null
    when public.has_module_permission(auth.uid(), 'reviews', 'edit') then 'reply'
    when exists (select 1 from public.review_brand_members m
                 where m.brand_id = p_brand_id and m.user_id = auth.uid() and m.can_reply) then 'reply'
    when public.has_module_permission(auth.uid(), 'reviews', 'view') then 'view'
    when exists (select 1 from public.review_brand_members m
                 where m.brand_id = p_brand_id and m.user_id = auth.uid()) then 'view'
  end
$$;
revoke execute on function public.review_brand_level(uuid) from public, anon;
grant execute on function public.review_brand_level(uuid) to authenticated;

-- ── Reviews ─────────────────────────────────────────────────────────────────

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.review_brands(id) on delete cascade,
  google_review_id text not null unique,
  reviewer_name text,
  reviewer_photo_url text,
  reviewer_anonymous boolean not null default false,
  star_rating int check (star_rating between 1 and 5),
  comment text,
  created_on_google timestamptz,
  updated_on_google timestamptz,
  reply_text text,
  reply_updated_at timestamptz,
  -- Who answered from Polaris (null when the reply was written on Google itself).
  replied_by uuid references auth.users(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  -- No longer returned by Google (the reviewer deleted it, or Google removed it).
  removed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists reviews_brand_time_idx on public.reviews (brand_id, created_on_google desc);
create index if not exists reviews_unanswered_idx on public.reviews (brand_id) where reply_text is null and removed_at is null;

-- ── Reply log (append-only) ─────────────────────────────────────────────────

create table if not exists public.review_reply_log (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('post', 'edit', 'remove')),
  text text,
  ok boolean not null,
  error text,
  created_at timestamptz not null default now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Staff read what review_brand_level allows; every write goes through the
-- server (service role), which talks to Google first.

alter table public.review_brands enable row level security;
alter table public.review_brand_members enable row level security;
alter table public.reviews enable row level security;
alter table public.review_reply_log enable row level security;

drop policy if exists "reviews brand read" on public.review_brands;
create policy "reviews brand read" on public.review_brands for select to authenticated
  using ((select public.review_brand_level(id)) is not null);

drop policy if exists "reviews read" on public.reviews;
create policy "reviews read" on public.reviews for select to authenticated
  using ((select public.review_brand_level(brand_id)) is not null);

drop policy if exists "reviews log read" on public.review_reply_log;
create policy "reviews log read" on public.review_reply_log for select to authenticated
  using (exists (select 1 from public.reviews r where r.id = review_id
                 and (select public.review_brand_level(r.brand_id)) is not null));

-- Members: managed by Reviews editors; people can see their own grants.
drop policy if exists "reviews members read" on public.review_brand_members;
create policy "reviews members read" on public.review_brand_members for select to authenticated
  using (user_id = auth.uid()
         or ((select public.has_module_permission(auth.uid(), 'reviews', 'edit')) and not (select public.is_portal_captain())));
drop policy if exists "reviews members write" on public.review_brand_members;
create policy "reviews members write" on public.review_brand_members for all to authenticated
  using ((select public.has_module_permission(auth.uid(), 'reviews', 'edit')) and not (select public.is_portal_captain()))
  with check ((select public.has_module_permission(auth.uid(), 'reviews', 'edit')) and not (select public.is_portal_captain()));

revoke insert, update, delete on public.review_brands from anon, authenticated;
revoke insert, update, delete on public.reviews from anon, authenticated;
revoke insert, update, delete on public.review_reply_log from anon, authenticated;
revoke all on public.review_brands, public.reviews, public.review_reply_log, public.review_brand_members from anon;

drop trigger if exists review_brands_updated_at on public.review_brands;
create trigger review_brands_updated_at before update on public.review_brands
  for each row execute function public.set_updated_at();
drop trigger if exists reviews_updated_at on public.reviews;
create trigger reviews_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();
