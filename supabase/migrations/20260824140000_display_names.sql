-- Staff pickers (App Developer, Agent, Manage Users…) showed "l.aclan"-style
-- usernames because user_profiles.display_name was seeded from the email
-- local-part at account creation. Real names live in profiles.first/last_name
-- (editable in Settings) — from now on saving a name there updates the
-- display name everywhere.
create or replace function public.sync_display_name_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare full_name text;
begin
  full_name := trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''));
  if full_name <> '' then
    update user_profiles set display_name = full_name, updated_at = now()
    where user_id = new.id and coalesce(display_name, '') is distinct from full_name;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_display_name on public.profiles;
create trigger trg_profiles_sync_display_name
  after insert or update of first_name, last_name on public.profiles
  for each row execute function public.sync_display_name_from_profile();
