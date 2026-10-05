-- Portal modules are simply on or off for a vessel — no trial period (decided
-- 2026-10-05; a trial can be added back later if it earns its place).
alter table public.yacht_portal_modules drop column if exists trial_ends_at;
