-- Crew Academy — course catalogue and enrolment requests.
--
-- Crew can browse the courses available to their vessel (those marked "Show in
-- the crew catalogue") and ask to be enrolled. A training manager on board
-- (canManageAcademy: Captain, officers, Chief Engineer, Purser, Chief
-- Stewardess) approves — which enrols them — or declines. One open request per
-- person per course. Server-only table, like every academy table.
alter table public.academy_courses
  add column if not exists catalogue boolean not null default true;

create table if not exists public.academy_enrolment_requests (
  id               uuid primary key default gen_random_uuid(),
  yacht_id         uuid not null references public.yachts(id) on delete cascade,
  learner_id       uuid not null references public.academy_learners(id) on delete cascade,
  course_id        uuid not null references public.academy_courses(id) on delete cascade,
  note             text,
  status           text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  decided_by       uuid,
  decided_by_name  text,
  decided_at       timestamptz,
  decision_note    text,
  enrolment_id     uuid references public.academy_enrolments(id) on delete set null,
  created_at       timestamptz not null default now()
);
create unique index if not exists academy_enrolment_requests_open_key
  on public.academy_enrolment_requests (learner_id, course_id) where status = 'pending';
create index if not exists academy_enrolment_requests_yacht_idx on public.academy_enrolment_requests (yacht_id, status, created_at desc);

alter table public.academy_enrolment_requests enable row level security;
drop policy if exists portal_captain_denied on public.academy_enrolment_requests;
create policy portal_captain_denied on public.academy_enrolment_requests as restrictive for all to authenticated
  using ((select not public.is_portal_captain())) with check ((select not public.is_portal_captain()));
