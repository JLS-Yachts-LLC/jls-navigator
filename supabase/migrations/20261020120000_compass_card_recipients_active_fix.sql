-- Compass Card recipients: don't rely on user_profiles.active.
--
-- user_profiles.active is false for many staff who use Polaris every day, so it
-- silently dropped people from the alert lists. Leavers are locked out by a ban
-- on their login instead (see the leavers process), so exclude banned logins.
create or replace function public.compass_card_recipients(p_team text)
returns table (user_id uuid, display_name text, email text)
language sql stable security definer set search_path = public as $$
  with s as (
    select case when p_team = 'signups' then signup_recipient_ids else partner_recipient_ids end as ids
      from public.compass_card_settings where id = 1
  )
  select up.user_id, up.display_name, up.email
    from public.user_profiles up
    join auth.users au on au.id = up.user_id
    left join s on true
   where (au.banned_until is null or au.banned_until < now())
     and case when coalesce(cardinality(s.ids), 0) > 0
              then up.user_id = any (s.ids)
              else lower(replace(coalesce(up.department, ''), ' ', '_')) = 'crew_care' end
$$;
revoke all on function public.compass_card_recipients(text) from public, anon, authenticated;
grant execute on function public.compass_card_recipients(text) to service_role;
