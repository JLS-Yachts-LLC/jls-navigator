-- SD-0079 — Seaman's cards on the Navigation Licence.
--
-- The FMA issues a seaman's card to each crew member listed on a vessel's
-- navigation licence, and cancels it when they leave. The Abu Dhabi team sends
-- the client the issued cards, the cancelled cards, or both. Each card hangs off
-- its licence (a permits row of type navigation_license) and keeps two files:
-- the issued card and, once cancelled, the cancellation.
--
-- Staff only: portal captains never see this table (the cards reach the vessel
-- by email, as secure links).

create table if not exists public.navigation_license_seaman_cards (
  id                uuid primary key default gen_random_uuid(),
  permit_id         uuid not null references public.permits(id) on delete cascade,
  crew_name         text not null,
  card_number       text,
  nationality       text,
  position          text,
  status            text not null default 'issued' check (status in ('issued', 'cancelled')),
  issued_on         date,
  expiry_date       date,
  cancelled_on      date,
  -- "<bucket>/<path>" storage refs (see storageRef), never public URLs.
  document_url      text,
  cancellation_url  text,
  notes             text,
  email_sent_at     timestamptz,
  email_sent_by     uuid references auth.users(id) on delete set null,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists navigation_license_seaman_cards_permit_idx
  on public.navigation_license_seaman_cards (permit_id);

drop trigger if exists navigation_license_seaman_cards_updated_at on public.navigation_license_seaman_cards;
create trigger navigation_license_seaman_cards_updated_at
  before update on public.navigation_license_seaman_cards
  for each row execute function public.set_updated_at();

alter table public.navigation_license_seaman_cards enable row level security;

-- Same rights as the permits themselves (Agency module), minus portal captains.
drop policy if exists "Staff view seaman cards" on public.navigation_license_seaman_cards;
create policy "Staff view seaman cards" on public.navigation_license_seaman_cards
  for select to authenticated
  using (not public.is_portal_captain());

drop policy if exists "Agency creators insert seaman cards" on public.navigation_license_seaman_cards;
create policy "Agency creators insert seaman cards" on public.navigation_license_seaman_cards
  for insert to authenticated
  with check (
    not public.is_portal_captain()
    and (public.has_role((select auth.uid()), 'admin'::app_role)
         or public.has_module_permission((select auth.uid()), 'agency', 'create'))
  );

drop policy if exists "Agency editors update seaman cards" on public.navigation_license_seaman_cards;
create policy "Agency editors update seaman cards" on public.navigation_license_seaman_cards
  for update to authenticated
  using (
    not public.is_portal_captain()
    and ((select auth.uid()) = created_by
         or public.has_role((select auth.uid()), 'admin'::app_role)
         or public.has_module_permission((select auth.uid()), 'agency', 'edit'))
  );

drop policy if exists "Agency editors delete seaman cards" on public.navigation_license_seaman_cards;
create policy "Agency editors delete seaman cards" on public.navigation_license_seaman_cards
  for delete to authenticated
  using (
    not public.is_portal_captain()
    and ((select auth.uid()) = created_by
         or public.has_role((select auth.uid()), 'admin'::app_role)
         or public.has_module_permission((select auth.uid()), 'agency', 'edit'))
  );
