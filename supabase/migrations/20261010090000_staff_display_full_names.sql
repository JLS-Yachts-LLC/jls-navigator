-- Staff pickers show full, properly capitalised names.
--
-- profiles.display_name is what every staff picker reads (Service Desk assignee,
-- WhatsApp inbox, Dev Settings) because any signed-in staff member may read it;
-- user_profiles is admin/own-row only. It was seeded from the email local part
-- ("h.ackermann"), so the pickers showed usernames.
--
-- 1. Backfill: each staff login's full name, taken from Manage Users
--    (user_profiles.display_name) or, where that was only an initial or a
--    username, from the HR record (staff_profiles.full_name). Shared mailboxes
--    keep a readable mailbox name. Both tables get the same name.
-- 2. Keep in step: renaming someone in Manage Users updates profiles too.

with names(local, full_name) as (values
  ('a.bhatti', 'Anish Bhatti'),
  ('accounts', 'Accounts'),
  ('accounts.ycmc', 'Accounts YCMC'),
  ('chrisvandenbergh', 'Chris Van Den Bergh'),
  ('dev', 'New Horizon Dev'),
  ('f.ashraf', 'Funan Ashraf'),
  ('g.vidad', 'Geraldine Vidad'),
  ('h.ackermann', 'Hilary Ackermann'),
  ('info.auh', 'Regie Doromal'),
  ('itsupport', 'IT Support'),
  ('j.gonzaga', 'Jovian Gonzaga'),
  ('j.lopez', 'Jonathan Lopez'),
  ('k.stanley', 'Keith Stanley'),
  ('kasam', 'Kasam'),
  ('l.aclan', 'Lovelein Aclan'),
  ('l.crasta', 'Lovin Crasta'),
  ('l.damens', 'Leneve Damens'),
  ('l.sarte', 'L. Sarte'),
  ('m.abonal', 'Marciane Abonal'),
  ('m.demesa', 'Maddie De Mesa'),
  ('m.mudaseer', 'Mohamed Mudaseer'),
  ('md', 'Mike Fetton'),
  ('r.ebreo', 'Rubilyn Ebreo'),
  ('r.fatwani', 'Rehman Fatwani'),
  ('r.saycon', 'Rusty Saycon'),
  ('support', 'New Horizon Support'),
  ('t.doroteo', 'Tejee Doroteo'),
  ('training', 'Angela Joyce Marquez')
)
update public.profiles p
   set display_name = n.full_name
  from names n
 where p.display_name = n.local;

update public.user_profiles up
   set display_name = p.display_name, updated_at = now()
  from public.profiles p
 where p.id = up.user_id
   and p.display_name is distinct from up.display_name
   and up.display_name in ('f.ashraf', 'G. Vidad', 'L. Aclan', 'M. Abonal', 'm.mudaseer', 't.doroteo', 'MD');

-- Renaming someone in Manage Users (user_profiles.display_name) carries over to
-- the name the pickers read.
create or replace function public.user_profiles_sync_display_name()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.display_name is not null and btrim(new.display_name) <> '' then
    update public.profiles set display_name = btrim(new.display_name)
     where id = new.user_id and display_name is distinct from btrim(new.display_name);
  end if;
  return new;
end;
$$;
revoke execute on function public.user_profiles_sync_display_name() from public, anon, authenticated;

drop trigger if exists user_profiles_sync_display_name on public.user_profiles;
create trigger user_profiles_sync_display_name
  after insert or update of display_name on public.user_profiles
  for each row execute function public.user_profiles_sync_display_name();
