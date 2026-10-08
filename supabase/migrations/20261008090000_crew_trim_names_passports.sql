-- SD-0048 — tidy crew names and passport numbers wherever they come from.
--
-- The June SharePoint import stored " TARAS", " KOROBEYCHENKO " and passport
-- " 766812112" with stray spaces. That is one reason the same person ended up
-- with two profiles: an exact comparison of "766812112" with " 766812112" fails.
-- The sync now matches on normalised keys, but the stored values kept the spaces
-- and every other screen compares them as stored.
--
-- One rule at the database, so every route in (SharePoint sync, visa wizard,
-- profile edits, imports) is covered: trim names and collapse inner runs of
-- spaces; trim passport numbers. full_name is rebuilt from the tidied parts, as
-- before. Existing rows are tidied once at the end (that save also pushes the
-- tidied values back to SharePoint through the normal two-way sync).

create or replace function public.polaris_sync_crew_full_name()
returns trigger language plpgsql set search_path to '' as $function$
begin
  NEW.first_name  := regexp_replace(trim(NEW.first_name), '\s+', ' ', 'g');
  NEW.last_name   := regexp_replace(trim(NEW.last_name), '\s+', ' ', 'g');
  NEW.middle_name := nullif(regexp_replace(trim(NEW.middle_name), '\s+', ' ', 'g'), '');
  NEW.passport_number := nullif(trim(NEW.passport_number), '');
  NEW.full_name := trim(
    coalesce(NEW.first_name, '') || ' ' ||
    coalesce(NEW.middle_name || ' ', '') ||
    coalesce(NEW.last_name, '')
  );
  return NEW;
end;
$function$;

-- Fire on the passport number too (it used to fire on the name columns only).
drop trigger if exists trg_crew_full_name on public.crew_members;
create trigger trg_crew_full_name
  before insert or update of first_name, middle_name, last_name, passport_number on public.crew_members
  for each row execute function public.polaris_sync_crew_full_name();

create or replace function public.polaris_trim_passport_number()
returns trigger language plpgsql set search_path to '' as $function$
begin
  NEW.passport_number := trim(NEW.passport_number);
  return NEW;
end;
$function$;

drop trigger if exists trg_crew_passports_trim on public.crew_passports;
create trigger trg_crew_passports_trim
  before insert or update of passport_number on public.crew_passports
  for each row execute function public.polaris_trim_passport_number();

-- Tidy what is already there (the triggers do the work on this save).
update public.crew_members set first_name = first_name, passport_number = passport_number
 where first_name <> regexp_replace(trim(first_name), '\s+', ' ', 'g')
    or last_name  <> regexp_replace(trim(last_name), '\s+', ' ', 'g')
    or coalesce(middle_name, '') <> coalesce(nullif(regexp_replace(trim(middle_name), '\s+', ' ', 'g'), ''), '')
    or passport_number <> trim(passport_number)
    or passport_number = '';

update public.crew_passports set passport_number = passport_number
 where passport_number <> trim(passport_number);
