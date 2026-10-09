-- Warehouse - Out: make releasing a check-out strict and complete.
--
-- complete_warehouse_checkout (20261003100000) applied each line without re-checking it:
--   * a line for more than is now stored was silently clamped to zero;
--   * a line whose item had meanwhile been disposed / checked out / deleted did nothing;
--   * an empty check-out could be "released";
--   * a parcel that had been moved into the warehouse from Check-Out (shipsync_packages with
--     extra.warehouse_ref) stayed "Warehouse" and could still be routed after it had left.
-- Now every line must still be good or the WHOLE release is refused (nothing changes), and the
-- parcels a released package was made from leave with it: Delivered for a JLS run, Collected
-- otherwise. Replaces the function only — no table changes.

create or replace function public.complete_warehouse_checkout(p_id uuid) returns void
language plpgsql set search_path = public as $$
declare
  co public.warehouse_checkouts%rowtype;
  it record;
  item public.warehouse_client_items%rowtype;
  content public.warehouse_package_contents%rowtype;
  n int := 0;
begin
  select * into co from public.warehouse_checkouts where id = p_id for update;
  if not found then raise exception 'Check-out not found'; end if;
  if co.status = 'released' then raise exception 'Check-out % has already been released', co.number; end if;
  if co.status = 'cancelled' then raise exception 'Check-out % was cancelled', co.number; end if;

  for it in select * from public.warehouse_checkout_items where checkout_id = p_id order by created_at, id loop
    n := n + 1;
    if it.kind = 'package' then
      select * into item from public.warehouse_client_items where id = it.client_item_id for update;
      if not found then raise exception 'Package % is no longer in the warehouse records', it.ref_no; end if;
      if item.status <> 'Stored' then raise exception 'Package % is no longer in storage (it is %)', it.ref_no, item.status; end if;

      update public.warehouse_client_items set status = 'Completed' where id = item.id;
      update public.warehouse_package_contents set status = 'Checked Out' where ref_no = it.ref_no and status = 'Stored';

      -- the parcels this package was made from (Check-Out > Move to Storage) leave with it
      update public.shipsync_packages
         set status = case when co.mode = 'jls' then 'delivered' else 'collected' end,
             delivered_at = now(),
             receiver_full_name = coalesce(co.receiver_name, receiver_full_name),
             receiver_designation = coalesce(co.receiver_position, receiver_designation),
             receiver_email = coalesce(co.receiver_email, receiver_email)
       where extra->>'warehouse_ref' = it.ref_no and status = 'in_storage';
    else
      select * into content from public.warehouse_package_contents where id = it.content_id for update;
      if not found then raise exception 'Item % is no longer in the warehouse records', coalesce(it.item_id, it.ref_no); end if;
      if content.status <> 'Stored' then raise exception 'Item % is no longer in storage (it is %)', content.item_id, content.status; end if;
      if coalesce(it.qty_out, 0) <= 0 then raise exception 'Item % has no quantity to take out', content.item_id; end if;
      if content.quantity < it.qty_out then
        raise exception 'Only % of item % is left in storage, but % was to be taken out', content.quantity, content.item_id, it.qty_out;
      end if;

      update public.warehouse_package_contents
         set quantity = quantity - it.qty_out,
             status = case when quantity - it.qty_out <= 0 then 'Checked Out' else status end
       where id = content.id;
    end if;
  end loop;

  if n = 0 then raise exception 'Check-out % has nothing on it to release', co.number; end if;

  update public.warehouse_checkouts set status = 'released', released_at = now() where id = p_id;
end;
$$;
revoke execute on function public.complete_warehouse_checkout(uuid) from anon;
