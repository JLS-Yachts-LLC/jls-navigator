-- Orbit 2 — Managed Boats: the Expenses tab (client request, 12 Oct 2026).
--
-- Every cost spent on a managed boat, so the owner can see exactly what was
-- spent and why: the area of the boat (Engine Room / Interior / Exterior /
-- Bridge), the part, the date, the cost, what it was for, and optionally the
-- Job Ref (orbit2_boat_tasks.job_no) it belongs to. Receipts and other
-- documents attach to the expense in orbit2_boat_expense_files.

create table if not exists public.orbit2_boat_expenses (
  id            uuid primary key default gen_random_uuid(),
  boat_id       uuid not null references public.orbit2_boats(id) on delete cascade,
  category      text not null check (category in ('Engine Room', 'Interior', 'Exterior', 'Bridge')),
  part_type     text,
  expense_date  date not null default current_date,
  cost          numeric(12, 2) not null check (cost >= 0),
  currency      text not null default 'AED',
  details       text,
  -- The job it was spent on. A deleted job leaves the expense in place, unlinked.
  boat_task_id  uuid references public.orbit2_boat_tasks(id) on delete set null,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists orbit2_boat_expenses_boat_idx on public.orbit2_boat_expenses (boat_id, expense_date desc);
create index if not exists orbit2_boat_expenses_task_idx on public.orbit2_boat_expenses (boat_task_id);

create table if not exists public.orbit2_boat_expense_files (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references public.orbit2_boat_expenses(id) on delete cascade,
  file_name    text not null,
  storage_ref  text not null,
  uploaded_by  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index if not exists orbit2_boat_expense_files_expense_idx on public.orbit2_boat_expense_files (expense_id);

create or replace function public.orbit2_touch_boat_expense()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  new.updated_at := now();
  return new;
end $fn$;
revoke all on function public.orbit2_touch_boat_expense() from public, anon, authenticated;

drop trigger if exists orbit2_boat_expenses_bu on public.orbit2_boat_expenses;
create trigger orbit2_boat_expenses_bu before update on public.orbit2_boat_expenses
  for each row execute function public.orbit2_touch_boat_expense();

-- ── RLS — same shape as every other Orbit 2 table ───────────────────────────
alter table public.orbit2_boat_expenses enable row level security;
alter table public.orbit2_boat_expense_files enable row level security;

do $policies$
declare t text;
begin
  foreach t in array array['orbit2_boat_expenses', 'orbit2_boat_expense_files'] loop
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format(
      'create policy authenticated_all on public.%I for all to authenticated '
      || 'using ((select auth.role()) = ''authenticated'') '
      || 'with check ((select auth.role()) = ''authenticated'')', t);

    execute format('drop policy if exists portal_captain_block on public.%I', t);
    execute format(
      'create policy portal_captain_block on public.%I as restrictive for all to authenticated '
      || 'using ((select not public.is_portal_captain())) '
      || 'with check ((select not public.is_portal_captain()))', t);
  end loop;
end $policies$;
