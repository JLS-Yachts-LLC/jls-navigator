-- Each person's own sidebar Favourites: pages pinned to the top of the left menu,
-- in the order they chose. item_key is the nav item's screen key (NAV_GROUPS in
-- polaris-ui/shell.tsx), so a favourite references an existing menu item rather
-- than copying its link; the app only shows it while the normal menu would.
-- Private to the owner.
create table if not exists public.user_sidebar_favourites (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null check (char_length(item_key) between 1 and 100),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

alter table public.user_sidebar_favourites enable row level security;
drop policy if exists "own favourites read" on public.user_sidebar_favourites;
create policy "own favourites read" on public.user_sidebar_favourites for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "own favourites insert" on public.user_sidebar_favourites;
create policy "own favourites insert" on public.user_sidebar_favourites for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "own favourites update" on public.user_sidebar_favourites;
create policy "own favourites update" on public.user_sidebar_favourites for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "own favourites delete" on public.user_sidebar_favourites;
create policy "own favourites delete" on public.user_sidebar_favourites for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.user_sidebar_favourites from anon;
grant select, insert, update, delete on public.user_sidebar_favourites to authenticated;

-- Save the whole list in its new order in one go (pin, unpin and reorder all
-- send the full list), so a half-saved reorder can't leave two items in one spot.
-- Runs as the caller, so RLS applies.
create or replace function public.set_my_sidebar_favourites(p_keys text[])
returns void language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if coalesce(array_length(p_keys, 1), 0) > 100 then raise exception 'too many favourites'; end if;
  delete from user_sidebar_favourites
    where user_id = auth.uid() and not (item_key = any (coalesce(p_keys, '{}')));
  insert into user_sidebar_favourites (user_id, item_key, position)
    select distinct on (k) auth.uid(), k, (o - 1)::int
    from unnest(coalesce(p_keys, '{}')) with ordinality as t(k, o)
    order by k, o
  on conflict (user_id, item_key) do update set position = excluded.position;
end;
$$;
revoke execute on function public.set_my_sidebar_favourites(text[]) from public, anon;
grant execute on function public.set_my_sidebar_favourites(text[]) to authenticated;
