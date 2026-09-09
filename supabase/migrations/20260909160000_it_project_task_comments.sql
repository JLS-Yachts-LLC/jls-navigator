-- Comments on Yacht IT project tasks.
--
-- A task was a title and a tick box, so anything learned while doing it — who was
-- called, what the yard said, why it slipped — had nowhere to live except a
-- Service Desk ticket, which not every task has. This gives each task its own
-- short thread.
--
-- author_name is denormalised alongside author_id on purpose: the display name is
-- what a comment reads by, and it should still read correctly after a staff member
-- leaves and their auth user is removed (author_id then nulls out).
create table if not exists public.it_project_task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.it_project_tasks(id) on delete cascade,
  body        text not null,
  author_id   uuid references auth.users(id) on delete set null,
  author_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists it_project_task_comments_task_idx
  on public.it_project_task_comments (task_id, created_at);

alter table public.it_project_task_comments enable row level security;

-- Same shape as it_project_tasks: any staff member, never a portal captain.
-- The captain rule is RESTRICTIVE so it cannot be OR'd away by a later
-- permissive policy — see 20260909140000_portal_captain_default_deny.sql.
drop policy if exists "auth all it_project_task_comments" on public.it_project_task_comments;
create policy "auth all it_project_task_comments" on public.it_project_task_comments
  for all to authenticated
  using (true) with check (true);

drop policy if exists portal_captain_denied on public.it_project_task_comments;
create policy portal_captain_denied on public.it_project_task_comments
  as restrictive for all to authenticated
  using ((select not public.is_portal_captain()))
  with check ((select not public.is_portal_captain()));
