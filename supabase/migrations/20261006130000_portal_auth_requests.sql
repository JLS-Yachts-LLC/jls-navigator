-- Client Portal — rate limit for the public "Forgot your password" endpoint.
--
-- /api/portal/forgot-password is unauthenticated by necessity, so each request
-- is recorded here and the endpoint refuses to send another link to the same
-- address (or from the same IP) too soon. Service role only: no policies, so no
-- browser session can read or write it.
create table if not exists public.portal_auth_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip_address text,
  kind text not null default 'recovery',
  sent boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists portal_auth_requests_email_idx on public.portal_auth_requests (email, created_at desc);
create index if not exists portal_auth_requests_ip_idx on public.portal_auth_requests (ip_address, created_at desc);
alter table public.portal_auth_requests enable row level security;
revoke all on public.portal_auth_requests from anon, authenticated;
