-- Let a staff member belong to more than one department.
--
-- Department decides which modules someone sees by default (via
-- department_permissions), and it was a single text column on user_profiles — so
-- anyone who genuinely works across two areas had to be given bespoke per-user
-- module grants instead, which then stop tracking the department as its
-- permissions change.
--
-- `user_departments` is now the source of truth, following the same join-table
-- shape as user_module_access and user_vessel_access. `user_profiles.department`
-- is KEPT and maintained by trigger as the primary department (lowest
-- sort_order, then alphabetical), because the Manage Users list, the module
-- dialog and the invite flow all read it — this way nothing has to change to
-- keep working, and there is still exactly one place the truth lives.

create table if not exists public.user_departments (
  user_id    uuid not null references auth.users (id) on delete cascade,
  department text not null references public.staff_departments (slug) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, department)
);

create index if not exists user_departments_dept_idx on public.user_departments (department);

alter table public.user_departments enable row level security;

-- Same shape as the other access tables: a person may read their own rows (the
-- claims derivation runs as the signed-in user), staff may read all, and writes
-- go through the admin API with the service role.
drop policy if exists user_departments_self_read on public.user_departments;
create policy user_departments_self_read
  on public.user_departments for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.user_profiles up where up.user_id = auth.uid()));

-- Carry the existing single department across so nobody's access changes today.
insert into public.user_departments (user_id, department)
select up.user_id, up.department
from public.user_profiles up
join public.staff_departments sd on sd.slug = up.department
where up.department is not null
on conflict (user_id, department) do nothing;

/**
 * Keep user_profiles.department pointing at the primary department, so the
 * existing readers stay correct without knowing about the join table.
 */
create or replace function public.sync_primary_department()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.user_id, old.user_id);
begin
  update public.user_profiles up
  set department = (
    select ud.department
    from public.user_departments ud
    join public.staff_departments sd on sd.slug = ud.department
    where ud.user_id = target
    order by sd.sort_order nulls last, ud.department
    limit 1
  )
  where up.user_id = target;
  return null;
end $$;

drop trigger if exists user_departments_sync_primary on public.user_departments;
create trigger user_departments_sync_primary
  after insert or delete on public.user_departments
  for each row execute function public.sync_primary_department();
