-- ═════════════════════════════════════════════════════════════════════════
-- POLARIS MIGRATION — Telephone Number Beta Completion
-- Ticket: assign next  Migration: 055
-- ═════════════════════════════════════════════════════════════════════════
--
-- Context: migration 025 already added phone_country_code, phone_number,
-- and a generated phone_full column on crew_members (per the original
-- POLARIS_PHONE_FIELD.md spec). This migration is additive — it does NOT
-- redefine those columns. It adds:
--
--   1. A defensive check that 025 has actually run (fails loudly if not)
--   2. country_dial_codes — canonical dial code + flag + validation rules,
--      configurable without a deploy (mirrors the country_language_map
--      pattern from migration 054)
--   3. Default-source tracking columns (mirrors native language pattern)
--   4. A selection log for analytics/troubleshooting
--   5. The mobile_verified status column flagged as "future" in 025 —
--      promoted here since it's now needed for full validation context
--
-- ═════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 0. SAFETY CHECK — fail loudly if migration 025 was never applied
-- ─────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'crew_members' and column_name = 'phone_country_code'
  ) then
    raise exception 'Migration 025 (phone_country_code/phone_number/phone_full) has not been applied. Run it before this migration.';
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────
-- 1. COUNTRY_DIAL_CODES — configurable dial code + flag + validation rules
-- ─────────────────────────────────────────────────────────────────────────
--
-- Mirrors country_language_map (migration 054) — editable via Admin or
-- direct SQL, no deploy required to add a country or change validation
-- rules for an existing one.

create table if not exists country_dial_codes (
  id              uuid primary key default gen_random_uuid(),
  country_code    text not null unique,          -- ISO 3166-1 alpha-2, e.g. 'AE', 'GB', 'US'
  dial_code        text not null,                  -- e.g. '+971', '+44', '+1'
  flag_emoji        text,                           -- e.g. '🇦🇪' — rendered directly, no image asset needed
  country_name      text not null,                  -- 'United Arab Emirates'
  -- Validation rules — local number length WITHOUT the dial code, e.g. UAE mobile is 9 digits (50xxxxxxx)
  min_length        int not null,
  max_length        int not null,
  -- Optional regex for stricter validation than length alone (e.g. UAE mobile must start with 5)
  local_format_regex text,
  is_popular         boolean not null default false,  -- shown pinned at top of dropdown
  sort_order         int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table country_dial_codes is
  'Configurable dial code, flag, and validation rule set per country. Editable via Admin panel or direct SQL — no deploy required to add a country or adjust validation length/regex.';

create index if not exists idx_dial_codes_popular on country_dial_codes (is_popular, sort_order);

-- Seed — covers UAE (default), GCC neighbours, and common crew nationalities.
-- Matt/admin can extend via SQL or future admin UI without a deploy.
insert into country_dial_codes (country_code, dial_code, flag_emoji, country_name, min_length, max_length, local_format_regex, is_popular, sort_order) values
  ('AE', '+971', '🇦🇪', 'United Arab Emirates', 9, 9, '^5[0-9]{8}$', true, 1),
  ('GB', '+44',  '🇬🇧', 'United Kingdom',        10, 10, '^7[0-9]{9}$', true, 2),
  ('US', '+1',   '🇺🇸', 'United States',          10, 10, null, true, 3),
  ('PH', '+63',  '🇵🇭', 'Philippines',            10, 10, '^9[0-9]{9}$', true, 4),
  ('IN', '+91',  '🇮🇳', 'India',                  10, 10, '^[6-9][0-9]{9}$', true, 5),
  ('ID', '+62',  '🇮🇩', 'Indonesia',               9, 12, null, true, 6),
  ('RU', '+7',   '🇷🇺', 'Russia',                 10, 10, null, true, 7),
  ('UA', '+380', '🇺🇦', 'Ukraine',                 9, 9, null, true, 8),
  ('FR', '+33',  '🇫🇷', 'France',                  9, 9, '^[67][0-9]{8}$', true, 9),
  ('ZA', '+27',  '🇿🇦', 'South Africa',            9, 9, null, true, 10),
  ('DE', '+49',  '🇩🇪', 'Germany',                10, 11, null, false, 0),
  ('IT', '+39',  '🇮🇹', 'Italy',                   9, 10, null, false, 0),
  ('ES', '+34',  '🇪🇸', 'Spain',                   9, 9, null, false, 0),
  ('PT', '+351', '🇵🇹', 'Portugal',                9, 9, null, false, 0),
  ('NL', '+31',  '🇳🇱', 'Netherlands',             9, 9, null, false, 0),
  ('AU', '+61',  '🇦🇺', 'Australia',               9, 9, null, false, 0),
  ('CA', '+1',   '🇨🇦', 'Canada',                 10, 10, null, false, 0),
  ('TH', '+66',  '🇹🇭', 'Thailand',                9, 9, null, false, 0),
  ('VN', '+84',  '🇻🇳', 'Vietnam',                 9, 10, null, false, 0),
  ('TR', '+90',  '🇹🇷', 'Turkey',                 10, 10, null, false, 0),
  ('SA', '+966', '🇸🇦', 'Saudi Arabia',            9, 9, '^5[0-9]{8}$', false, 0),
  ('QA', '+974', '🇶🇦', 'Qatar',                   8, 8, null, false, 0),
  ('KW', '+965', '🇰🇼', 'Kuwait',                  8, 8, null, false, 0),
  ('BH', '+973', '🇧🇭', 'Bahrain',                 8, 8, null, false, 0),
  ('OM', '+968', '🇴🇲', 'Oman',                    8, 8, null, false, 0)
on conflict (country_code) do nothing;


-- ─────────────────────────────────────────────────────────────────────────
-- 2. DEFAULT-SOURCE TRACKING — mirrors the native-language pattern
-- ─────────────────────────────────────────────────────────────────────────

alter table crew_members
  add column if not exists phone_default_source text
    check (phone_default_source in ('nationality', 'vessel_location', 'org_location', 'last_used', 'manual', null)),
  add column if not exists phone_default_source_updated_at timestamptz;

comment on column crew_members.phone_default_source is
  'Which mechanism produced the CURRENTLY STORED country code — nationality / vessel_location / org_location / last_used / manual. "manual" means the user explicitly changed the suggested country code themselves.';

-- Mobile verification status — promoted from "future enhancement" in migration 025
-- to active now, since the validation layer benefits from knowing verification state.
alter table crew_members
  add column if not exists mobile_verified_status text
    not null default 'unverified'
    check (mobile_verified_status in ('unverified', 'otp_verified', 'whatsapp_verified'));

comment on column crew_members.mobile_verified_status is
  'Mobile number verification state. Promoted from migration 025 future-enhancement placeholder. OTP/WhatsApp verification flows are out of scope for this ticket — column exists now so validation logic can reference it without a further migration.';


-- ─────────────────────────────────────────────────────────────────────────
-- 3. GUEST PREFERENCES — last-used country code for unauthenticated users
-- ─────────────────────────────────────────────────────────────────────────
--
-- Same guest_token cookie pattern as the native language feature
-- (migration 054) — reused rather than duplicated logic.

create table if not exists guest_phone_country_prefs (
  guest_token   text primary key,
  country_code  text not null references country_dial_codes(country_code),
  source        text not null check (source in ('nationality', 'vessel_location', 'org_location', 'last_used', 'manual')),
  updated_at    timestamptz not null default now()
);

comment on table guest_phone_country_prefs is
  'Persists last-used country code preference for unauthenticated/guest users, keyed by the shared polaris_guest_lang_token cookie (same token used by the native language feature). Merged into crew_members on signup.';

create index if not exists idx_guest_phone_prefs_updated_at on guest_phone_country_prefs (updated_at);


-- ─────────────────────────────────────────────────────────────────────────
-- 4. SELECTION LOG — analytics / troubleshooting
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists phone_country_selection_log (
  id                    uuid primary key default gen_random_uuid(),
  crew_member_id        uuid references crew_members(id) on delete set null,
  guest_token           text,
  resolved_source        text not null check (
                            resolved_source in ('nationality', 'vessel_location', 'org_location', 'last_used', 'none', 'manual_override')
                          ),
  resolved_country_code  text references country_dial_codes(country_code),
  nationality_used        text,     -- country used if source = nationality
  vessel_location_used    text,     -- vessel's current/home port country, if source = vessel_location
  was_overridden          boolean not null default false,
  final_country_code      text references country_dial_codes(country_code),
  validation_passed       boolean,  -- did the final number pass length/regex validation at save time
  created_at              timestamptz not null default now()
);

comment on table phone_country_selection_log is
  'Records every country-code default resolution and any manual override, mirroring the native_language_selection_log pattern. Lets Mike/Matt answer "why did this default to X" and measure override rates per tier.';

create index if not exists idx_phone_log_crew     on phone_country_selection_log (crew_member_id);
create index if not exists idx_phone_log_source   on phone_country_selection_log (resolved_source);
create index if not exists idx_phone_log_created  on phone_country_selection_log (created_at);


-- ─────────────────────────────────────────────────────────────────────────
-- 5. RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table guest_phone_country_prefs enable row level security;
alter table phone_country_selection_log enable row level security;

create policy guest_phone_prefs_service_only
  on guest_phone_country_prefs
  for all
  using (false)
  with check (false);
-- All access via /api/phone/* routes using the service role key, same as
-- the native-language guest table.

create policy phone_log_service_insert
  on phone_country_selection_log
  for insert
  with check (false);
-- Server-side inserts only.


-- ─────────────────────────────────────────────────────────────────────────
-- Verification queries
-- ─────────────────────────────────────────────────────────────────────────
--
-- select * from country_dial_codes where is_popular order by sort_order;
-- select * from country_dial_codes where country_code = 'AE';
--   ↳ confirm dial_code = '+971', local_format_regex matches '5XXXXXXXX'
-- select count(*) from country_dial_codes;
--   ↳ should be 25 after seed
