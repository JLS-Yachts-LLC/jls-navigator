-- A client's own Client Portal address: <slug>.polaris.jlsyachts.com.
-- The address is branding and convenience — what a captain can see is still
-- decided by captain_accounts + RLS, wherever they sign in. Each address also
-- has to be added as a Custom Domain on the Worker in Cloudflare.
create table if not exists public.portal_domains (
  slug text primary key
    check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'
           and slug not in ('www', 'mail', 'api', 'app', 'admin', 'portal', 'polaris', 'staff', 'auth', 'login',
                            'test', 'dev', 'staging', 'status', 'static', 'assets', 'cdn', 'help', 'support', 'jls', 'jlsyachts')),
  yacht_id uuid not null unique references public.yachts(id) on delete cascade,
  enabled boolean not null default false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists portal_domains_updated on public.portal_domains;
create trigger portal_domains_updated before update on public.portal_domains
  for each row execute function public.set_updated_at();

-- Server-only: read and written through the admin API and the Worker.
alter table public.portal_domains enable row level security;
revoke all on public.portal_domains from anon, authenticated;
