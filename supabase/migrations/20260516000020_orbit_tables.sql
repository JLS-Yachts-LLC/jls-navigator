-- Orbit: Projects (linked to Yachts as clients)
create table if not exists public.orbit_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  yacht_id uuid references public.yachts(id) on delete set null,
  status text not null default 'active',      -- active | on_hold | completed | cancelled
  priority text not null default 'medium',    -- low | medium | high | urgent
  start_date date,
  due_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orbit_projects enable row level security;
create policy "Authenticated users can manage orbit_projects"
  on public.orbit_projects for all using (auth.role() = 'authenticated');

-- Orbit: Tasks (belong to a project)
create table if not exists public.orbit_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.orbit_projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo',        -- todo | in_progress | review | done
  priority text not null default 'medium',    -- low | medium | high | urgent
  assignee_id uuid references auth.users(id) on delete set null,
  due_date date,
  sort_order integer default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orbit_tasks enable row level security;
create policy "Authenticated users can manage orbit_tasks"
  on public.orbit_tasks for all using (auth.role() = 'authenticated');
