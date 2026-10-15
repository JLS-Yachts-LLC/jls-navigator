-- Template version history: every change to a template's PDF or signing spots
-- gets a new version number and a row saying what changed, who and when.
-- Superseded PDFs are kept in storage so each version can still be opened.

alter table public.esign_templates
  add column if not exists version int not null default 1,
  add column if not exists version_note text;

create table if not exists public.esign_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.esign_templates(id) on delete cascade,
  version int not null,
  file_path text not null,
  file_name text,
  change_note text,
  changed_by uuid,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

alter table public.esign_template_versions enable row level security;

drop policy if exists "Staff read esign_template_versions" on public.esign_template_versions;
create policy "Staff read esign_template_versions" on public.esign_template_versions
  for select to authenticated
  using ((select auth.role()) = 'authenticated' and (select not is_portal_captain()));

-- Bump the version when the PDF or the signing spots change. The editor sets
-- version_note to say why; a note left over from the previous version (the
-- update didn't supply one) is dropped so it can't be recorded twice.
create or replace function public.esign_template_bump_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.file_path is distinct from old.file_path
     or new.signature_fields::text is distinct from old.signature_fields::text then
    new.version := old.version + 1;
    if new.version_note is not distinct from old.version_note then
      new.version_note := null;
    end if;
  else
    new.version := old.version;
  end if;
  return new;
end $$;

create or replace function public.esign_template_record_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.version is distinct from old.version then
    insert into public.esign_template_versions (template_id, version, file_path, file_name, change_note, changed_by)
    values (new.id, new.version, new.file_path, new.file_name,
            coalesce(nullif(trim(new.version_note), ''), case when tg_op = 'INSERT' then 'First uploaded' else 'Updated' end),
            coalesce(auth.uid(), new.created_by))
    on conflict (template_id, version) do nothing;
  end if;
  return null;
end $$;

revoke all on function public.esign_template_record_version() from public, anon, authenticated;

drop trigger if exists esign_templates_bump_version on public.esign_templates;
create trigger esign_templates_bump_version
  before update on public.esign_templates
  for each row execute function public.esign_template_bump_version();

drop trigger if exists esign_templates_record_version on public.esign_templates;
create trigger esign_templates_record_version
  after insert or update on public.esign_templates
  for each row execute function public.esign_template_record_version();

-- Existing templates start their history at version 1.
insert into public.esign_template_versions (template_id, version, file_path, file_name, change_note, changed_by, created_at)
select id, 1, file_path, file_name, 'First uploaded', created_by, created_at
from public.esign_templates
on conflict (template_id, version) do nothing;
