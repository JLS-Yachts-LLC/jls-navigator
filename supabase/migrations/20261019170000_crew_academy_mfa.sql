-- Crew Academy — two-step sign-in for crew (Matt, 19 Oct 2026: "Enable MFA, via
-- email or QR code via authenticator app").
--
-- Two ways to pass the second step, the crew member's choice each time:
--   • Authenticator app (QR code) — Supabase's own TOTP factor; the session
--     becomes aal2, exactly like the Client Portal.
--   • Email code — Supabase has no email second factor, so /api/academy/mfa
--     sends a 6-digit code (stored here only as a hash, 10 minutes, 5 tries)
--     and, once it matches, records the sign-in session (the JWT session_id) as
--     verified. resolveLearner() accepts aal2 OR a live row in
--     academy_mfa_sessions for the token's session; every /api/academy request
--     checks it.
--
-- Both tables are server-only: no permissive policy, restrictive fence for
-- outside logins, like every academy table.
create table if not exists public.academy_mfa_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  used_at     timestamptz,
  ip_address  text,
  created_at  timestamptz not null default now()
);
create index if not exists academy_mfa_codes_user_idx on public.academy_mfa_codes (user_id, created_at desc);

create table if not exists public.academy_mfa_sessions (
  session_id  uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  method      text not null check (method in ('email')),
  verified_at timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists academy_mfa_sessions_user_idx on public.academy_mfa_sessions (user_id);

do $$
declare t text;
begin
  foreach t in array array['academy_mfa_codes', 'academy_mfa_sessions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists portal_captain_denied on public.%I', t);
    execute format($p$create policy portal_captain_denied on public.%I as restrictive for all to authenticated
      using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()))$p$, t);
  end loop;
end $$;
