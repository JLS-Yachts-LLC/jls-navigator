-- Orbit field app: who has attended and finished a job, per crew member.
--
-- Client request, 29 Sep 2026. A job can be assigned to several crew. Each
-- one attends and finishes on their own phone, and the job only becomes
-- "Complete - Team" once everyone assigned has pressed Done — until then the
-- first finisher sees "Waiting Companion". This table is that per-person
-- record; the job's own status stays the single office-facing state.
create table if not exists public.orbit2_attendance (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references public.orbit2_projects(id) on delete cascade,
  boat_task_id  uuid references public.orbit2_boat_tasks(id) on delete cascade,
  person        text not null,                 -- roster first name, as in assigned_team
  attended_at   timestamptz not null default now(),
  done_at       timestamptz,
  user_id       uuid references auth.users(id),
  constraint orbit2_attendance_one_parent check ((project_id is null) <> (boat_task_id is null))
);
-- One row per person per job (NULLS NOT DISTINCT so the unused parent column
-- does not make every row unique).
alter table public.orbit2_attendance drop constraint if exists orbit2_attendance_one_per_person;
alter table public.orbit2_attendance add constraint orbit2_attendance_one_per_person
  unique nulls not distinct (project_id, boat_task_id, person);

alter table public.orbit2_attendance enable row level security;
drop policy if exists authenticated_all on public.orbit2_attendance;
create policy authenticated_all on public.orbit2_attendance for all to authenticated
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');
drop policy if exists portal_captain_block on public.orbit2_attendance;
create policy portal_captain_block on public.orbit2_attendance for all to authenticated
  using ((select not public.is_portal_captain()))
  with check ((select not public.is_portal_captain()));
