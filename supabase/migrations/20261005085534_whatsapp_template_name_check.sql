-- Postgres regexes cap repetition at 255, so '^[a-z0-9_]{1,512}$' failed on
-- every insert. Meta allows names up to 512 characters: check length separately.
alter table public.wa_templates drop constraint if exists wa_templates_name_check;
alter table public.wa_templates add constraint wa_templates_name_check
  check (name ~ '^[a-z0-9_]+$' and char_length(name) <= 512);
