-- Crew Academy reminders (Phase 5 of POLARIS_CREW_ACADEMY.md).
--
-- One row per reminder per enrolment, so each goes out at most once:
--   enrolled       a course was given to them (or a refresher started)
--   due_soon       due within 3 days and not finished
--   overdue-0..3   past the due date — once, then weekly for up to 4 weeks
--
-- Automatic messages to clients obey the vessel's switch (client_auto_messages,
-- Manage Users → Client Portal). A reminder raised while the vessel is off is
-- recorded as 'held' and never sent later — the Polaris rule since 9 Oct 2026.
-- Server-only table: no permissive policy, restrictive fence for outside logins.
create table if not exists public.academy_reminders (
  id            uuid primary key default gen_random_uuid(),
  enrolment_id  uuid not null references public.academy_enrolments(id) on delete cascade,
  kind          text not null,
  status        text not null check (status in ('sent', 'held', 'failed')),
  detail        text,
  created_at    timestamptz not null default now(),
  unique (enrolment_id, kind)
);
create index if not exists academy_reminders_created_idx on public.academy_reminders (created_at desc);

alter table public.academy_reminders enable row level security;
drop policy if exists portal_captain_denied on public.academy_reminders;
create policy portal_captain_denied on public.academy_reminders as restrictive for all to authenticated
  using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
