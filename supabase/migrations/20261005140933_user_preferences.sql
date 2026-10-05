-- Each person's own interface settings (sidebar sections folded, menu pinned, …),
-- so they follow them to any browser or device. Private to the owner.
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb check (jsonb_typeof(prefs) = 'object' and pg_column_size(prefs) < 32768),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;
drop policy if exists "own preferences read" on public.user_preferences;
create policy "own preferences read" on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "own preferences insert" on public.user_preferences;
create policy "own preferences insert" on public.user_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "own preferences update" on public.user_preferences;
create policy "own preferences update" on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.user_preferences from anon;
revoke delete on public.user_preferences from authenticated;
grant select, insert, update on public.user_preferences to authenticated;

-- Set one setting without overwriting the others (two parts of the app can
-- save different settings at the same moment). Runs as the caller, so RLS applies.
create or replace function public.set_my_preference(p_key text, p_value jsonb)
returns void language sql security invoker set search_path = public as $$
  insert into user_preferences (user_id, prefs, updated_at)
  values (auth.uid(), jsonb_build_object(p_key, p_value), now())
  on conflict (user_id) do update
    set prefs = user_preferences.prefs || jsonb_build_object(p_key, p_value), updated_at = now();
$$;
revoke execute on function public.set_my_preference(text, jsonb) from public, anon;
grant execute on function public.set_my_preference(text, jsonb) to authenticated;
