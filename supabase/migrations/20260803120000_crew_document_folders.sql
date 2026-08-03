-- Crew Documents: Polaris-side folders + SharePoint mirror bookkeeping.
--
-- The Documents card on a crew profile lists two kinds of file: real
-- crew_documents rows and passport files that live as columns on
-- crew_passports (document_url / cover_url / headshot_url / seamans_book_url).
-- To let staff file BOTH kinds into folders without reshaping crew_passports,
-- placement is keyed by a synthetic `doc_key`:
--   'doc:<crew_documents.id>'            — a real document row
--   'passport:<crew_passports.id>:<col>' — a passport file column
--
-- crew_document_sharepoint_links records what Polaris has actually pushed to
-- SharePoint, so the "also in SharePoint" badge is authoritative rather than
-- guessed from file names (Polaris storage names rarely match SharePoint's).

create table if not exists public.crew_document_folders (
  id uuid primary key default gen_random_uuid(),
  crew_member_id uuid not null references public.crew_members(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (crew_member_id, name)
);

create table if not exists public.crew_document_placements (
  crew_member_id uuid not null references public.crew_members(id) on delete cascade,
  doc_key text not null,
  folder_id uuid references public.crew_document_folders(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (crew_member_id, doc_key)
);

create table if not exists public.crew_document_sharepoint_links (
  crew_member_id uuid not null references public.crew_members(id) on delete cascade,
  doc_key text not null,
  sp_item_id text,
  sp_name text,
  web_url text,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid,
  primary key (crew_member_id, doc_key)
);

create index if not exists crew_document_folders_crew_idx on public.crew_document_folders (crew_member_id);
create index if not exists crew_document_placements_folder_idx on public.crew_document_placements (folder_id);

-- RLS mirrors crew_documents: any authenticated staff user, never a portal captain.
alter table public.crew_document_folders enable row level security;
alter table public.crew_document_placements enable row level security;
alter table public.crew_document_sharepoint_links enable row level security;

do $$
declare t text;
begin
  foreach t in array array['crew_document_folders', 'crew_document_placements', 'crew_document_sharepoint_links']
  loop
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format(
      'create policy authenticated_all on public.%I for all
         using ((select auth.role()) = ''authenticated'')
         with check ((select auth.role()) = ''authenticated'')', t);
    execute format('drop policy if exists portal_captain_block on public.%I', t);
    execute format(
      'create policy portal_captain_block on public.%I for all to authenticated
         using (not is_portal_captain()) with check (not is_portal_captain())', t);
  end loop;
end $$;
