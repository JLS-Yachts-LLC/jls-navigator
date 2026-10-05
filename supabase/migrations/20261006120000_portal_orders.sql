-- Client Portal — itemised orders to JLS (Agency with JLS).
--
-- Any vessel can order from JLS line by line — provisioning, bunkering,
-- uniform, spares, chandlery — without the On board module. An order raises a
-- Client Request with the lines written out (so it lands in triage and the
-- client and team talk on its thread); the lines are also kept structured here
-- so they can be matched to the quotation later. Status is the request's.
--
-- Same isolation as the portal's other tables: staff manage everything; a
-- portal login reads its own vessel's orders from an MFA-verified session and
-- never writes directly — /api/portal/orders writes with the service role.

create sequence if not exists public.portal_order_ref_seq;

create table if not exists public.portal_orders (
  id uuid primary key default gen_random_uuid(),
  yacht_id uuid not null references public.yachts(id) on delete cascade,
  reference text not null unique default ('ORD-' || lpad(nextval('public.portal_order_ref_seq')::text, 4, '0')),
  category text not null check (category in ('provisioning', 'bunkering', 'uniform', 'spares', 'chandlery', 'other')),
  title text not null,
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  needed_by date,
  deliver_to text,
  notes text,
  ordered_by uuid references auth.users(id) on delete set null,
  ordered_by_name text,
  captain_request_id uuid references public.captain_requests(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists portal_orders_yacht_idx on public.portal_orders (yacht_id, created_at desc);

alter table public.portal_orders enable row level security;
drop policy if exists staff_manage on public.portal_orders;
create policy staff_manage on public.portal_orders for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists captain_select on public.portal_orders;
create policy captain_select on public.portal_orders for select to authenticated
  using (public.is_portal_captain() and public.portal_aal2() and yacht_id in (select public.captain_yacht_ids()));
drop policy if exists portal_captain_block_insert on public.portal_orders;
create policy portal_captain_block_insert on public.portal_orders as restrictive for insert to authenticated
  with check (not public.is_portal_captain());
drop policy if exists portal_captain_block_update on public.portal_orders;
create policy portal_captain_block_update on public.portal_orders as restrictive for update to authenticated
  using (not public.is_portal_captain());
drop policy if exists portal_captain_block_delete on public.portal_orders;
create policy portal_captain_block_delete on public.portal_orders as restrictive for delete to authenticated
  using (not public.is_portal_captain());
