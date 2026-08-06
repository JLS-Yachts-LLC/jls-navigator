-- profiles.first_name / last_name
--
-- Settings → Users has always offered a first-name / last-name editor, but the
-- columns were never created: reads came back as a query error and every save
-- failed, so only the composed display_name ever persisted. Add the two columns
-- the UI has been writing to all along, and seed them from display_name so
-- existing users show their name split correctly on first load.

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name  text;

-- Backfill: everything before the last space is the first name, the remainder the
-- surname. Single-word display names become the first name only.
update public.profiles
set first_name = nullif(split_part(display_name, ' ', 1), ''),
    last_name  = nullif(trim(substr(display_name, length(split_part(display_name, ' ', 1)) + 2)), '')
where display_name is not null and first_name is null and last_name is null;
