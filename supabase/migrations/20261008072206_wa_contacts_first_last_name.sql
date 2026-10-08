-- WhatsApp contacts get a first and last name; `name` (what lists show and
-- what {{name}} fills) is kept as "First Last". A contact saved with only a
-- full name — imports, new WhatsApp senders, the CSV — is split automatically.
-- (wa_split_name / wa_name_case are refined in 20261008072254.)

alter table public.wa_contacts
  add column if not exists first_name text,
  add column if not exists last_name text;

-- Keep name, first_name and last_name consistent on every save.
create or replace function public.wa_contacts_names()
returns trigger language plpgsql set search_path = public as $$
declare
  full_name text := nullif(btrim(concat_ws(' ', nullif(btrim(new.first_name), ''), nullif(btrim(new.last_name), ''))), '');
  v_vessel text;
  sp record;
begin
  new.first_name := nullif(btrim(new.first_name), '');
  new.last_name := nullif(btrim(new.last_name), '');
  if tg_op = 'INSERT' then
    if full_name is not null then
      new.name := full_name;
    elsif coalesce(btrim(new.name), '') <> '' then
      if new.yacht_id is not null then select vessel_name into v_vessel from yachts where id = new.yacht_id; end if;
      sp := public.wa_split_name(new.name, v_vessel);
      new.first_name := sp.first_name;
      new.last_name := sp.last_name;
    end if;
  else
    if (new.first_name, new.last_name) is distinct from (old.first_name, old.last_name) then
      -- Edited first/last: the full name follows (unless both were cleared).
      if full_name is not null then new.name := full_name; end if;
    elsif new.name is distinct from old.name then
      -- The full name was changed some other way: split it again.
      if new.yacht_id is not null then select vessel_name into v_vessel from yachts where id = new.yacht_id; end if;
      sp := public.wa_split_name(new.name, v_vessel);
      new.first_name := sp.first_name;
      new.last_name := sp.last_name;
    end if;
  end if;
  return new;
end;
$$;
