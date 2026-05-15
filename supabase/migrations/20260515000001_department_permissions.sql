create table if not exists public.department_permissions (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  module text not null,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(department, module)
);

alter table public.department_permissions enable row level security;

create policy "Authenticated users can view department permissions"
  on public.department_permissions for select
  using (auth.role() = 'authenticated');

create policy "Admins can manage department permissions"
  on public.department_permissions for all
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  );
