-- On board: a task board (backlog → to do → in progress → waiting → done) and an
-- inventory register of the vessel's equipment and assets.
--
--   onboard_tasks           one card on the crew's board: priority, department,
--                           who it's with, due date, labels and a checklist
--   onboard_task_comments   the conversation and history on a card
--   onboard_inventory_items what the vessel owns (not consumables — that's
--                           onboard_stock_items): where it is, its condition,
--                           make/model/serial, value and warranty, last checked
--
-- Same isolation as the other On board tables: staff manage everything; a portal
-- login reads only its own vessel's rows from an MFA-verified session and never
-- writes directly — writes go through /api/portal/tasks and /api/portal/onboard
-- with the service role, hard-filtered to the vessel.

create sequence if not exists public.onboard_task_ref_seq;

create table if not exists public.onboard_tasks (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  reference text not null unique default ('T-' || lpad(nextval('public.onboard_task_ref_seq')::text, 4, '0')),
  title text not null,
  description text,
  status text not null default 'backlog'
    check (status in ('backlog', 'todo', 'in_progress', 'waiting', 'done')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  department text
    check (department in ('galley', 'interior', 'bar', 'deck', 'engine', 'safety', 'other')),
  assignee_crew_id uuid references public.crew_members(id) on delete set null,
  assignee_name text,
  due_date date,
  waiting_on text,
  labels text[] not null default '{}',
  checklist jsonb not null default '[]'::jsonb,
  sort_order double precision not null default 0,
  created_by_name text,
  completed_at timestamptz,
  completed_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists onboard_tasks_yacht_idx on public.onboard_tasks (yacht_id, status, sort_order);

create table if not exists public.onboard_task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.onboard_tasks(id) on delete cascade,
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  kind text not null default 'comment' check (kind in ('comment', 'event')),
  author_name text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists onboard_task_comments_task_idx on public.onboard_task_comments (task_id, created_at);

create table if not exists public.onboard_inventory_items (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  name text not null,
  category text,
  department text not null default 'interior'
    check (department in ('galley', 'interior', 'bar', 'deck', 'engine', 'safety', 'other')),
  location text,
  quantity integer not null default 1 check (quantity >= 0),
  condition text not null default 'good'
    check (condition in ('new', 'good', 'fair', 'poor', 'damaged', 'missing')),
  make text,
  model text,
  serial_number text,
  supplier text,
  purchase_date date,
  purchase_price numeric check (purchase_price >= 0),
  currency text check (currency in ('EUR', 'USD', 'AED', 'GBP')),
  warranty_expiry date,
  last_checked date,
  last_checked_by_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists onboard_inventory_items_yacht_idx on public.onboard_inventory_items (yacht_id, department);

drop trigger if exists onboard_tasks_updated on public.onboard_tasks;
create trigger onboard_tasks_updated before update on public.onboard_tasks
  for each row execute function public.set_updated_at();
drop trigger if exists onboard_inventory_items_updated on public.onboard_inventory_items;
create trigger onboard_inventory_items_updated before update on public.onboard_inventory_items
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['onboard_tasks', 'onboard_task_comments', 'onboard_inventory_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);

    execute format('drop policy if exists staff_manage on public.%I', t);
    execute format($p$create policy staff_manage on public.%I for all to authenticated
      using (not public.is_portal_captain()) with check (not public.is_portal_captain())$p$, t);

    execute format('drop policy if exists captain_select on public.%I', t);
    execute format($p$create policy captain_select on public.%I for select to authenticated
      using (public.is_portal_captain() and public.portal_aal2() and yacht_id in (select public.captain_yacht_ids()))$p$, t);

    -- A portal login never writes here directly, whatever else changes.
    execute format('drop policy if exists portal_captain_block_insert on public.%I', t);
    execute format($p$create policy portal_captain_block_insert on public.%I as restrictive for insert to authenticated
      with check (not public.is_portal_captain())$p$, t);
    execute format('drop policy if exists portal_captain_block_update on public.%I', t);
    execute format($p$create policy portal_captain_block_update on public.%I as restrictive for update to authenticated
      using (not public.is_portal_captain())$p$, t);
    execute format('drop policy if exists portal_captain_block_delete on public.%I', t);
    execute format($p$create policy portal_captain_block_delete on public.%I as restrictive for delete to authenticated
      using (not public.is_portal_captain())$p$, t);
  end loop;
end $$;

-- Photos and files on task cards and inventory items.
alter table public.portal_files drop constraint if exists portal_files_ref_table_check;
alter table public.portal_files add constraint portal_files_ref_table_check check (ref_table = any (array[
  'onboard_checklist_runs', 'ism_drills', 'pms_tasks', 'onboard_handover_notes',
  'onboard_tasks', 'onboard_inventory_items'
]));
