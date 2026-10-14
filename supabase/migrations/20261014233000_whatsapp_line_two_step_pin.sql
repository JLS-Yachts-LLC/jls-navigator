-- A number moved fully onto the Cloud API (not shared with the WhatsApp Business
-- app) must be REGISTERED after it is verified, with a six-digit two-step PIN that
-- Meta asks for again if it is ever re-registered. Polaris picks the PIN and keeps
-- it here — server-only, like the token. A line that uses the Worker's System
-- User token has no token of its own, so access_token becomes optional.
alter table public.wa_line_tokens alter column access_token drop not null;
alter table public.wa_line_tokens add column if not exists two_step_pin text;
