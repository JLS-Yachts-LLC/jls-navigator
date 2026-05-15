
-- Set search_path explicitly on all functions
alter function public.set_updated_at() set search_path = public;
alter function public.handle_new_user() set search_path = public;

-- Revoke public/anon execute on security definer functions
revoke execute on function public.has_role(uuid, app_role) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- has_role is still callable from RLS policies (uses definer perms)
grant execute on function public.has_role(uuid, app_role) to authenticated;

-- Restrict bucket listing - drop broad select policy and require auth
drop policy if exists "Vessel images public read" on storage.objects;
create policy "Vessel images authenticated list"
  on storage.objects for select to authenticated using (bucket_id = 'vessel-images');
-- Public still gets direct URL access via the public bucket flag
