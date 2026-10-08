-- A task raised from an inventory item (repair or replace it) remembers which item.
alter table public.onboard_tasks
  add column if not exists inventory_item_id uuid references public.onboard_inventory_items(id) on delete set null;
create index if not exists onboard_tasks_inventory_item_idx on public.onboard_tasks (inventory_item_id) where inventory_item_id is not null;
