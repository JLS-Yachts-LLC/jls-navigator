-- Client Portal · On board (Management module) — stock and requisitions.
--
--   onboard_stock_items        what the vessel keeps on board, by department, with
--                              a minimum level and a par level to reorder up to
--   onboard_requisitions       a request raised on board for things the vessel
--                              needs: draft → submitted → approved → sent to JLS
--                              (becomes a captain_requests row) → received
--   onboard_requisition_items  the lines on a requisition, optionally tied to a
--                              stock item so receiving it tops the stock up
--
-- Same isolation as the other On board tables: staff manage everything; a portal
-- login reads only its own vessel's rows from an MFA-verified session and never
-- writes directly — writes go through /api/portal/stock and
-- /api/portal/requisitions with the service role, hard-filtered to the vessel.

create table if not exists public.onboard_stock_items (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  name text not null,
  department text not null default 'galley'
    check (department in ('galley', 'interior', 'bar', 'deck', 'engine', 'safety', 'other')),
  category text,
  location text,
  unit text,
  quantity numeric not null default 0 check (quantity >= 0),
  min_quantity numeric check (min_quantity >= 0),
  par_quantity numeric check (par_quantity >= 0),
  supplier_ref text,
  notes text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists onboard_stock_items_yacht_idx on public.onboard_stock_items (yacht_id, department);

create sequence if not exists public.onboard_requisition_ref_seq;

create table if not exists public.onboard_requisitions (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  reference text not null unique default ('REQ-' || lpad(nextval('public.onboard_requisition_ref_seq')::text, 4, '0')),
  title text not null,
  department text not null default 'galley'
    check (department in ('galley', 'interior', 'bar', 'deck', 'engine', 'safety', 'other')),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'sent', 'received', 'cancelled')),
  needed_by date,
  notes text,
  raised_by_name text,
  submitted_at timestamptz,
  approved_by_name text,
  approved_at timestamptz,
  sent_by_name text,
  sent_at timestamptz,
  captain_request_id uuid references public.captain_requests(id) on delete set null,
  received_by_name text,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists onboard_requisitions_yacht_idx on public.onboard_requisitions (yacht_id, status);

create table if not exists public.onboard_requisition_items (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references public.onboard_requisitions(id) on delete cascade,
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  stock_item_id uuid references public.onboard_stock_items(id) on delete set null,
  description text not null,
  quantity numeric not null check (quantity > 0),
  unit text,
  notes text,
  received_quantity numeric check (received_quantity >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists onboard_requisition_items_req_idx on public.onboard_requisition_items (requisition_id);

drop trigger if exists onboard_stock_items_updated on public.onboard_stock_items;
create trigger onboard_stock_items_updated before update on public.onboard_stock_items
  for each row execute function public.set_updated_at();
drop trigger if exists onboard_requisitions_updated on public.onboard_requisitions;
create trigger onboard_requisitions_updated before update on public.onboard_requisitions
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['onboard_stock_items', 'onboard_requisitions', 'onboard_requisition_items'] loop
    execute format('alter table public.%I enable row level security', t);

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
