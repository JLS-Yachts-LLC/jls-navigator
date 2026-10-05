-- Templates with an image, video or document header, and buttons.
-- Media lives in a private bucket; the server hands it to Meta (upload handle
-- for review, media id for sending), so nothing needs a public link.

alter table public.wa_templates
  add column if not exists header_format text not null default 'TEXT'
    check (header_format in ('TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT')),
  add column if not exists header_media_path text,
  add column if not exists header_media_mime text,
  add column if not exists header_media_name text,
  add column if not exists buttons jsonb not null default '[]'::jsonb
    check (jsonb_typeof(buttons) = 'array' and jsonb_array_length(buttons) <= 10),
  -- Meta's media id for the header file, reused for sends until it expires (30 days).
  add column if not exists header_media_id text,
  add column if not exists header_media_uploaded_at timestamptz;

alter table public.wa_campaigns
  add column if not exists button_values jsonb not null default '[]'::jsonb,
  add column if not exists header_media_path text,
  add column if not exists header_media_mime text,
  add column if not exists header_media_id text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('whatsapp-media', 'whatsapp-media', false, 16777216,
        array['image/jpeg', 'image/png', 'video/mp4', 'video/3gpp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "whatsapp media read" on storage.objects;
create policy "whatsapp media read" on storage.objects for select to authenticated
  using (bucket_id = 'whatsapp-media'
         and (select public.has_module_permission(auth.uid(), 'communications', 'view'))
         and not (select public.is_portal_captain()));
drop policy if exists "whatsapp media write" on storage.objects;
create policy "whatsapp media write" on storage.objects for insert to authenticated
  with check (bucket_id = 'whatsapp-media'
              and (select public.has_module_permission(auth.uid(), 'communications', 'edit'))
              and not (select public.is_portal_captain()));
