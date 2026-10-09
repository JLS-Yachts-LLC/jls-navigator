-- Warehouse - Out (Logistics mobile app): scheduled check-outs of stored goods.
--
-- A check-out is one delivery note (WH0001, WH0002 …) holding either whole stored
-- packages or lines taken out of a box's packing list (with a partial "Qty Out").
-- It leaves the warehouse one of three ways: JLS vehicle (date + driver +
-- destination), a third-party carrier, or collected by the client on site.
--
-- Nothing in the warehouse changes until the check-out is released. Releasing is
-- done by complete_warehouse_checkout() in ONE transaction — whole packages become
-- Completed, and packing-list lines have their Qty Out taken off what is stored —
-- so a dropped connection can never leave stock half-counted, and a second
-- release of the same note is refused.
--
-- Additive only: new tables, one sequence, two functions. Safe to run once.

create sequence if not exists public.warehouse_checkout_seq start 1;

create or replace function public.next_warehouse_checkout_number() returns text
language sql security definer set search_path = public as $$
  select 'WH' || lpad(nextval('public.warehouse_checkout_seq')::text, 4, '0');
$$;
revoke execute on function public.next_warehouse_checkout_number() from anon;

create table if not exists public.warehouse_checkouts (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  mode text not null default 'jls' check (mode in ('jls', 'third', 'client')),
  -- draft: saved but not arranged / not yet released
  -- assigned: JLS vehicle with a driver, waiting to go (shown as "Pending")
  -- released: the goods have left the warehouse
  status text not null default 'draft' check (status in ('draft', 'assigned', 'released', 'cancelled')),
  boat_name text,                         -- the client; null when the note spans several
  scheduled_date date,
  driver_id uuid references public.shipsync_drivers(id) on delete set null,
  destination text,
  carrier_driver_name text,               -- third party: the outside driver
  receiver_name text,
  receiver_position text,
  receiver_email text,
  photo_url text,
  signature_url text,
  released_at timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouse_checkout_items (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null references public.warehouse_checkouts(id) on delete cascade,
  -- package: a whole stored package   content: a line from its packing list
  kind text not null check (kind in ('package', 'content')),
  client_item_id uuid references public.warehouse_client_items(id) on delete set null,
  content_id uuid references public.warehouse_package_contents(id) on delete set null,
  ref_no text not null,
  item_id text,
  description text,
  client_name text,
  qty_out numeric,                        -- content lines only
  created_at timestamptz not null default now()
);

create index if not exists idx_warehouse_checkouts_status on public.warehouse_checkouts (status);
create index if not exists idx_warehouse_checkout_items_checkout on public.warehouse_checkout_items (checkout_id);
create index if not exists idx_warehouse_checkout_items_ref on public.warehouse_checkout_items (ref_no);
create index if not exists idx_warehouse_checkouts_driver on public.warehouse_checkouts (driver_id);
create index if not exists idx_warehouse_checkout_items_client_item on public.warehouse_checkout_items (client_item_id);
create index if not exists idx_warehouse_checkout_items_content on public.warehouse_checkout_items (content_id);

drop trigger if exists set_warehouse_checkouts_updated_at on public.warehouse_checkouts;
create trigger set_warehouse_checkouts_updated_at before update on public.warehouse_checkouts
  for each row execute function public.update_updated_at_column();

alter table public.warehouse_checkouts enable row level security;
alter table public.warehouse_checkout_items enable row level security;

drop policy if exists warehouse_checkouts_all on public.warehouse_checkouts;
create policy warehouse_checkouts_all on public.warehouse_checkouts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists warehouse_checkout_items_all on public.warehouse_checkout_items;
create policy warehouse_checkout_items_all on public.warehouse_checkout_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Same captain-portal lockdown every other staff table carries.
drop policy if exists portal_captain_block on public.warehouse_checkouts;
create policy portal_captain_block on public.warehouse_checkouts as restrictive for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());
drop policy if exists portal_captain_block on public.warehouse_checkout_items;
create policy portal_captain_block on public.warehouse_checkout_items as restrictive for all to authenticated
  using (not public.is_portal_captain()) with check (not public.is_portal_captain());

-- Release: apply the stock changes and close the note, atomically.
create or replace function public.complete_warehouse_checkout(p_id uuid) returns void
language plpgsql set search_path = public as $$
declare
  co public.warehouse_checkouts%rowtype;
  it record;
begin
  select * into co from public.warehouse_checkouts where id = p_id for update;
  if not found then raise exception 'Check-out not found'; end if;
  if co.status = 'released' then raise exception 'Check-out % has already been released', co.number; end if;
  if co.status = 'cancelled' then raise exception 'Check-out % was cancelled', co.number; end if;

  for it in select * from public.warehouse_checkout_items where checkout_id = p_id loop
    if it.kind = 'package' then
      update public.warehouse_client_items set status = 'Completed' where id = it.client_item_id;
      update public.warehouse_package_contents set status = 'Checked Out'
        where ref_no = it.ref_no and status = 'Stored';
    else
      update public.warehouse_package_contents
        set quantity = greatest(quantity - coalesce(it.qty_out, 0), 0),
            status = case when quantity - coalesce(it.qty_out, 0) <= 0 then 'Checked Out' else status end
        where id = it.content_id;
    end if;
  end loop;

  update public.warehouse_checkouts set status = 'released', released_at = now() where id = p_id;
end;
$$;
revoke execute on function public.complete_warehouse_checkout(uuid) from anon;
