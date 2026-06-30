-- ═════════════════════════════════════════════════════════════════════════
-- POLARIS MIGRATION — Intelligent Native Language Default
-- Ticket: #197 (assign next available)  Migration: 054
-- ═════════════════════════════════════════════════════════════════════════
--
-- Implements:
--   1. country_language_map — configurable, no-deploy country→language config
--   2. languages — canonical language list (ISO 639-1 codes)
--   3. user_profiles.last_native_language + source tracking
--   4. guest_native_language_prefs — fallback persistence for unauthenticated users
--   5. native_language_selection_log — analytics/troubleshooting trail
--
-- Run order: this file only. No dependent migrations.
-- ═════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. LANGUAGES — canonical list
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists languages (
  code        text primary key,             -- ISO 639-1, e.g. 'en', 'fr', 'tl'
  name        text not null,                -- 'English', 'French', 'Tagalog'
  native_name text,                         -- 'Français', 'Tagalog' — optional, for display
  is_popular  boolean not null default false, -- shown in "Popular Languages" section
  sort_order  int not null default 0,       -- manual ordering within popular section
  created_at  timestamptz not null default now()
);

comment on table languages is
  'Canonical language list. is_popular + sort_order control the Popular Languages section in the UI. Editable via admin — no deploy required.';

-- Seed common maritime crew languages — admin can extend via admin UI later
insert into languages (code, name, native_name, is_popular, sort_order) values
  ('en', 'English',    'English',    true,  1),
  ('tl', 'Tagalog',     'Tagalog',    true,  2),
  ('hi', 'Hindi',       'हिन्दी',      true,  3),
  ('id', 'Indonesian',  'Bahasa Indonesia', true, 4),
  ('ru', 'Russian',     'Русский',    true,  5),
  ('uk', 'Ukrainian',   'Українська', true,  6),
  ('fr', 'French',      'Français',   true,  7),
  ('es', 'Spanish',     'Español',    true,  8),
  ('de', 'German',      'Deutsch',    true,  9),
  ('it', 'Italian',     'Italiano',   true, 10),
  ('pt', 'Portuguese',  'Português',  false, 0),
  ('ar', 'Arabic',      'العربية',    false, 0),
  ('zh', 'Mandarin Chinese', '中文',   false, 0),
  ('ja', 'Japanese',    '日本語',     false, 0),
  ('ko', 'Korean',      '한국어',     false, 0),
  ('th', 'Thai',        'ไทย',        false, 0),
  ('vi', 'Vietnamese',  'Tiếng Việt', false, 0),
  ('pl', 'Polish',      'Polski',     false, 0),
  ('nl', 'Dutch',       'Nederlands', false, 0),
  ('sv', 'Swedish',     'Svenska',    false, 0),
  ('no', 'Norwegian',   'Norsk',      false, 0),
  ('da', 'Danish',      'Dansk',      false, 0),
  ('el', 'Greek',       'Ελληνικά',   false, 0),
  ('tr', 'Turkish',     'Türkçe',     false, 0),
  ('ro', 'Romanian',    'Română',     false, 0),
  ('hr', 'Croatian',    'Hrvatski',   false, 0),
  ('sr', 'Serbian',     'Српски',     false, 0)
on conflict (code) do nothing;


-- ─────────────────────────────────────────────────────────────────────────
-- 2. COUNTRY_LANGUAGE_MAP — configurable, no-deploy country → language(s)
-- ─────────────────────────────────────────────────────────────────────────
--
-- Supports countries with multiple official/common languages. Exactly one
-- row per (country_code, language_code) pair may be flagged is_primary.
-- The resolver always uses the row where is_primary = true.
--
-- This table is editable via the Admin panel (or direct SQL) — no code
-- deployment is required to add, remove, or re-prioritise mappings.

create table if not exists country_language_map (
  id            uuid primary key default gen_random_uuid(),
  country_code  text not null,              -- ISO 3166-1 alpha-2, e.g. 'PH', 'FR', 'CH'
  language_code text not null references languages(code) on delete restrict,
  is_primary    boolean not null default false,
  notes         text,                       -- e.g. 'Official + most widely spoken'
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists uq_country_language
  on country_language_map (country_code, language_code);

-- Enforce exactly one primary language per country at the database level.
-- A partial unique index does this cleanly in Postgres.
create unique index if not exists uq_country_primary_language
  on country_language_map (country_code)
  where is_primary = true;

comment on table country_language_map is
  'Configurable country-to-language mapping. Multiple rows per country allowed for countries with several official/common languages — exactly one row per country may have is_primary = true, and the resolver always uses that row. Editable via Admin panel, no deploy needed.';

-- Seed a representative set — covers common crew nationalities + multi-language cases.
insert into country_language_map (country_code, language_code, is_primary, notes) values
  -- Single-language-dominant examples
  ('PH', 'tl', true,  'Tagalog — most widely used national language'),
  ('PH', 'en', false, 'English — co-official, secondary'),
  ('IN', 'hi', true,  'Hindi — most widely spoken'),
  ('IN', 'en', false, 'English — co-official, secondary'),
  ('ID', 'id', true,  'Indonesian — sole official language'),
  ('RU', 'ru', true,  'Russian — sole official language'),
  ('UA', 'uk', true,  'Ukrainian — sole official language'),
  ('FR', 'fr', true,  'French — sole official language'),
  ('DE', 'de', true,  'German — sole official language'),
  ('IT', 'it', true,  'Italian — sole official language'),
  ('PT', 'pt', true,  'Portuguese — sole official language'),
  ('BR', 'pt', true,  'Portuguese — sole official language'),
  ('JP', 'ja', true,  'Japanese — sole official language'),
  ('KR', 'ko', true,  'Korean — sole official language'),
  ('TH', 'th', true,  'Thai — sole official language'),
  ('VN', 'vi', true,  'Vietnamese — sole official language'),
  ('PL', 'pl', true,  'Polish — sole official language'),
  ('NL', 'nl', true,  'Dutch — sole official language'),
  ('SE', 'sv', true,  'Swedish — sole official language'),
  ('NO', 'no', true,  'Norwegian — sole official language'),
  ('DK', 'da', true,  'Danish — sole official language'),
  ('GR', 'el', true,  'Greek — sole official language'),
  ('TR', 'tr', true,  'Turkish — sole official language'),
  ('RO', 'ro', true,  'Romanian — sole official language'),
  ('HR', 'hr', true,  'Croatian — sole official language'),
  ('RS', 'sr', true,  'Serbian — sole official language'),
  ('GB', 'en', true,  'English — sole official language'),
  ('US', 'en', true,  'English — de facto national language'),
  ('AU', 'en', true,  'English — sole official language'),

  -- Multi-language countries — primary chosen by most-common-spoken
  ('CH', 'de', true,  'German — most widely spoken (~62%)'),
  ('CH', 'fr', false, 'French — co-official'),
  ('CH', 'it', false, 'Italian — co-official'),
  ('BE', 'nl', true,  'Dutch — most widely spoken (~59%, Flemish)'),
  ('BE', 'fr', false, 'French — co-official'),
  ('CA', 'en', true,  'English — most widely spoken'),
  ('CA', 'fr', false, 'French — co-official, primarily Quebec'),
  ('ZA', 'en', true,  'English — primary business/admin language'),
  ('AE', 'ar', true,  'Arabic — official language'),
  ('AE', 'en', false, 'English — widely used, not official')
on conflict (country_code, language_code) do nothing;


-- ─────────────────────────────────────────────────────────────────────────
-- 3. USER PROFILES — last-used native language + source tracking
-- ─────────────────────────────────────────────────────────────────────────
--
-- Adds columns rather than a new table to avoid a join on every read.

alter table user_profiles
  add column if not exists last_native_language text references languages(code),
  add column if not exists last_native_language_source text
    check (last_native_language_source in ('passport', 'last_used', 'nationality', 'manual', null)),
  add column if not exists last_native_language_updated_at timestamptz;

comment on column user_profiles.last_native_language is
  'Most recently selected native language for this user. Used as priority-2 default per the resolver logic. Updated whenever the user saves a form with a native language value — manual selections always overwrite this.';

comment on column user_profiles.last_native_language_source is
  'Which mechanism produced the CURRENTLY STORED value — passport / last_used / nationality / manual. "manual" means the user explicitly picked it themselves, which takes precedence in future loads if non-null.';


-- ─────────────────────────────────────────────────────────────────────────
-- 4. GUEST PREFERENCES — fallback persistence for unauthenticated users
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists guest_native_language_prefs (
  guest_token   text primary key,            -- UUID generated client-side, stored in cookie
  language_code text not null references languages(code),
  source        text not null check (source in ('passport', 'last_used', 'nationality', 'manual')),
  updated_at    timestamptz not null default now()
);

comment on table guest_native_language_prefs is
  'Persists native language preference for unauthenticated/guest users, keyed by a client-generated guest_token cookie. Merged into user_profiles on signup/login via a one-time migration step.';

create index if not exists idx_guest_prefs_updated_at
  on guest_native_language_prefs (updated_at);


-- ─────────────────────────────────────────────────────────────────────────
-- 5. SELECTION LOG — analytics / troubleshooting trail
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists native_language_selection_log (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references user_profiles(id) on delete set null,
  guest_token          text,
  application_id       uuid,
  resolved_source      text not null check (
                         resolved_source in ('passport', 'last_used', 'nationality', 'none', 'manual_override')
                       ),
  resolved_language    text references languages(code),
  passport_country     text,
  nationality_country  text,
  was_overridden       boolean not null default false,
  final_language       text references languages(code),
  created_at           timestamptz not null default now()
);

comment on table native_language_selection_log is
  'Records every native-language default resolution and any manual override, for analytics and troubleshooting. resolved_source/resolved_language show what the system suggested; final_language shows what was actually saved if the user changed it.';

create index if not exists idx_lang_log_user    on native_language_selection_log (user_id);
create index if not exists idx_lang_log_app     on native_language_selection_log (application_id);
create index if not exists idx_lang_log_source  on native_language_selection_log (resolved_source);
create index if not exists idx_lang_log_created on native_language_selection_log (created_at);


-- ─────────────────────────────────────────────────────────────────────────
-- 6. RLS — row-level security
-- ─────────────────────────────────────────────────────────────────────────

alter table guest_native_language_prefs enable row level security;
alter table native_language_selection_log enable row level security;

-- Guests can only read/write their own pref row — accessed only through the
-- API layer via service role, never directly from the client.
create policy guest_prefs_service_only
  on guest_native_language_prefs
  for all
  using (false)
  with check (false);

create policy selection_log_user_read_own
  on native_language_selection_log
  for select
  using (auth.uid() = user_id);

create policy selection_log_service_insert
  on native_language_selection_log
  for insert
  with check (false);
-- NOTE: Inserts happen server-side only (service role).


-- ─────────────────────────────────────────────────────────────────────────
-- Verification queries (run manually after migration)
-- ─────────────────────────────────────────────────────────────────────────
--
-- select * from languages order by is_popular desc, sort_order;
-- select * from country_language_map where country_code = 'CH';  -- should show 3 rows, 1 primary
-- select country_code, count(*) from country_language_map where is_primary group by 1 having count(*) > 1;
--   ↳ should return ZERO rows (confirms unique-primary constraint is doing its job)
