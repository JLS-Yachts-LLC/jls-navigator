-- Import/Transit shipments always get an Item ID.
--
-- "Item ID should either be automated or removed if it is not required."
-- It was half automated: next_shipsync_item_id() exists and fires when a
-- shipment is created on the Import board, but packages arriving from the Power
-- App via the SharePoint Packages sync got nothing -- 192 of 605 Import/Transit
-- rows had a blank Item ID, every one of them scanned rather than typed.
--
-- Three things here.
--
-- 1. The format did not match Monday's. Monday issues six digits
--    (SHP26-000415); the generator issued four (SHP26-0005), so app-created
--    shipments looked nothing like the rest of the board.
--
-- 2. The sequence sat at 4 while Monday had already reached 415, so the next
--    few generated ids would have read as far older shipments than they are.
--    It is advanced past the highest number actually in use.
--
-- 3. A trigger fills the id in, rather than each caller remembering to. That
--    covers the SharePoint sync, the Import board and anything added later,
--    from one place. It only ever fills a blank -- Monday supplies its own on
--    all 410 of its rows, and those are left exactly as they are.
--
-- The three existing four-digit ids (SHP26-0002/3/4) are deliberately NOT
-- renumbered: their six-digit equivalents are already taken by Monday
-- shipments, so "fixing" them would collide.
--
-- Idempotent: create or replace throughout, drop trigger if exists, and the
-- backfill only touches rows whose Item ID is still blank.

-- 1. Match Monday's six-digit format.
create or replace function public.next_shipsync_item_id()
returns text
language sql
security definer
set search_path to 'public'
as $function$
  select 'SHP' || to_char(now(), 'YY') || '-' || lpad(nextval('public.shipsync_item_id_seq')::text, 6, '0');
$function$;

-- 2. Continue the series rather than replaying numbers Monday has already used.
select setval(
  'public.shipsync_item_id_seq',
  greatest(
    (select last_value from public.shipsync_item_id_seq),
    coalesce((
      select max((regexp_replace(extra->'monday'->>'Item ID', '^SHP[0-9]{2}-', ''))::bigint)
      from public.shipsync_packages
      where extra->'monday'->>'Item ID' ~ '^SHP[0-9]{2}-[0-9]+$'
    ), 0)
  )
);

-- 3. Fill in a missing Item ID on any Import/Transit shipment.
create or replace function public.assign_shipsync_item_id()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_monday jsonb;
begin
  if new.local_import in ('Import', 'Transit')
     and coalesce(new.extra->'monday'->>'Item ID', '') = '' then
    -- extra.monday is normally the verbatim Monday row; guard in case it is
    -- absent or (defensively) not an object, so the merge below cannot fail.
    v_monday := case when jsonb_typeof(new.extra->'monday') = 'object'
                     then new.extra->'monday' else '{}'::jsonb end;
    new.extra := coalesce(new.extra, '{}'::jsonb)
      || jsonb_build_object('monday', v_monday || jsonb_build_object('Item ID', public.next_shipsync_item_id()));
  end if;
  return new;
end $function$;

drop trigger if exists shipsync_packages_assign_item_id on public.shipsync_packages;
create trigger shipsync_packages_assign_item_id
before insert or update on public.shipsync_packages
for each row execute function public.assign_shipsync_item_id();

-- 4. Backfill the shipments already sitting there without one. The no-op write
--    is enough -- the trigger above supplies the id.
update public.shipsync_packages
   set extra = coalesce(extra, '{}'::jsonb)
 where local_import in ('Import', 'Transit')
   and coalesce(extra->'monday'->>'Item ID', '') = '';
