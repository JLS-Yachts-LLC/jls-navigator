-- Projects for Yacht IT Solutions.
--
-- Mirrors the New Horizon-IT Service Desk's projects model so the two read the
-- same way: a project belongs to a vessel, carries a status through its life,
-- holds its own task list, and collects the tickets raised against it.
--
-- Named it_* to sit with the rest of the Yacht IT module and to stay clear of
-- `orbit_projects`, which is the unrelated Operations one.
--
-- A vessel is either from the main fleet (`yacht_id`) or the IT registry
-- (`it_yacht_id`), exactly as it_tickets does it — the Service Desk already
-- resolves a name from whichever is set.

create table if not exists public.it_projects (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  description text,
  status      text        not null default 'planning'
                check (status in ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
  yacht_id    uuid references public.yachts (id)    on delete set null,
  it_yacht_id uuid references public.it_yachts (id) on delete set null,
  start_date  date,
  end_date    date,
  owner_id    uuid references auth.users (id) on delete set null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists it_projects_status_idx  on public.it_projects (status);
create index if not exists it_projects_updated_idx on public.it_projects (updated_at desc);

create table if not exists public.it_project_tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid        not null references public.it_projects (id) on delete cascade,
  title       text        not null,
  description text,
  status      text        not null default 'todo'
                check (status in ('todo', 'in_progress', 'blocked', 'done')),
  priority    text        not null default 'normal'
                check (priority in ('low', 'normal', 'high', 'urgent')),
  due_date    date,
  assignee_id uuid references auth.users (id) on delete set null,
  sort_order  integer     not null default 0,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists it_project_tasks_project_idx on public.it_project_tasks (project_id, sort_order);

-- Tickets raised for a project. Nullable: most tickets belong to no project.
alter table public.it_tickets
  add column if not exists project_id uuid references public.it_projects (id) on delete set null;

create index if not exists it_tickets_project_idx on public.it_tickets (project_id);

alter table public.it_projects      enable row level security;
alter table public.it_project_tasks enable row level security;

-- Same access as the rest of the Yacht IT module: staff only, and explicitly
-- never a portal captain.
drop policy if exists "auth all it_projects" on public.it_projects;
create policy "auth all it_projects" on public.it_projects
  for all using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists portal_captain_block on public.it_projects;
create policy portal_captain_block on public.it_projects
  for all to authenticated
  using (not is_portal_captain()) with check (not is_portal_captain());

drop policy if exists "auth all it_project_tasks" on public.it_project_tasks;
create policy "auth all it_project_tasks" on public.it_project_tasks
  for all using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

drop policy if exists portal_captain_block on public.it_project_tasks;
create policy portal_captain_block on public.it_project_tasks
  for all to authenticated
  using (not is_portal_captain()) with check (not is_portal_captain());
