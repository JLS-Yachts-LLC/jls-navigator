-- App Developer tab (Yacht IT Solutions): a simple task board for tracking
-- Polaris development work — create tasks, assign them to team members, drag
-- through the same lifecycle the New Horizon-IT service desk uses.
create table if not exists public.app_dev_tasks (
  id               uuid primary key default gen_random_uuid(),
  number           integer generated always as identity,
  title            text not null,
  description      text,
  type             text not null default 'feat'
                     check (type in ('fix','feat','refactor','docs','chore','new_build')),
  status           text not null default 'pending_scheduling'
                     check (status in ('on_hold','pending_scheduling','scheduled','in_progress','complete')),
  assignee_user_id uuid references auth.users(id) on delete set null,
  scheduled_date   date,
  sort_order       integer not null default 0,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists app_dev_tasks_status_idx   on public.app_dev_tasks (status);
create index if not exists app_dev_tasks_assignee_idx on public.app_dev_tasks (assignee_user_id);

create trigger trg_app_dev_tasks_updated_at
  before update on public.app_dev_tasks
  for each row execute function public.set_updated_at();

alter table public.app_dev_tasks enable row level security;

-- Internal staff tool: any authenticated staff member can manage tasks;
-- portal captains (client logins) are blocked outright.
create policy app_dev_tasks_staff on public.app_dev_tasks
  for all to authenticated
  using (not is_portal_captain()) with check (not is_portal_captain());
