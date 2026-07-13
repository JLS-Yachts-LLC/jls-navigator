-- Public bucket for Knowledge Base guide images (uploaded from the guide editor;
-- referenced as Markdown images in guide bodies). Applied live via MCP.
insert into storage.buckets (id, name, public) values ('guide-images', 'guide-images', true)
  on conflict (id) do nothing;

create policy "Guide images public read"
  on storage.objects for select using (bucket_id = 'guide-images');
create policy "Authenticated upload guide images"
  on storage.objects for insert to authenticated with check (bucket_id = 'guide-images');
create policy "Authenticated update guide images"
  on storage.objects for update to authenticated using (bucket_id = 'guide-images');
create policy "Authenticated delete guide images"
  on storage.objects for delete to authenticated using (bucket_id = 'guide-images');
