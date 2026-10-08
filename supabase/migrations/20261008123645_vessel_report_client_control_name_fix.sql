-- The live database first received 20261008123626 with the staff name read
-- from user_profiles.full_name, which doesn't exist (it's display_name) — every
-- staff edit would have failed. This replaced both trigger functions with the
-- display_name versions; the repo copy of 20261008123626 already carries them,
-- so on a fresh database this is a no-op re-statement.
create or replace function public.vessel_report_subscriptions_touch() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if auth.uid() is not null then
    select coalesce(nullif(display_name, ''), email) into v_name from public.user_profiles where user_id = auth.uid();
    new.changed_by_kind := 'staff';
    new.changed_by_name := v_name;
    new.changed_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.vessel_report_subscriptions_touch() from public, anon, authenticated;
