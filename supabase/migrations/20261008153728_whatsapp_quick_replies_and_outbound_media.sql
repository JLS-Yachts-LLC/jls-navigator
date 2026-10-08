-- Saved quick replies for the WhatsApp Inbox: picked (or typed "/") into the
-- reply box, personal fields ({{first_name}}, {{vessel}}…) filled per contact.
-- Anyone on Communications can use them; edit level adds, changes, removes.
create table if not exists public.wa_quick_replies (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 60),
  body text not null check (length(trim(body)) between 1 and 4096),
  use_count integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.wa_quick_replies enable row level security;
drop policy if exists "communications view" on public.wa_quick_replies;
create policy "communications view" on public.wa_quick_replies for select to authenticated
  using (public.has_module_permission((select auth.uid()), 'communications', 'view'));
drop policy if exists "communications add" on public.wa_quick_replies;
create policy "communications add" on public.wa_quick_replies for insert to authenticated
  with check (public.has_module_permission((select auth.uid()), 'communications', 'edit'));
drop policy if exists "communications change" on public.wa_quick_replies;
create policy "communications change" on public.wa_quick_replies for update to authenticated
  using (public.has_module_permission((select auth.uid()), 'communications', 'edit'))
  with check (public.has_module_permission((select auth.uid()), 'communications', 'edit'));
drop policy if exists "communications remove" on public.wa_quick_replies;
create policy "communications remove" on public.wa_quick_replies for delete to authenticated
  using (public.has_module_permission((select auth.uid()), 'communications', 'edit'));
revoke all on public.wa_quick_replies from anon;
grant select, insert, update, delete on public.wa_quick_replies to authenticated;

create or replace function public.wa_quick_replies_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists wa_quick_replies_touch on public.wa_quick_replies;
create trigger wa_quick_replies_touch before update on public.wa_quick_replies
  for each row execute function public.wa_quick_replies_touch();

-- A few to start from; edit or delete freely.
insert into public.wa_quick_replies (title, body, created_by)
select * from (values
  ('Thanks — on it', 'Thanks {{first_name}}, we''ve got this and we''re on it. We''ll come back to you shortly.', null::uuid),
  ('Need passport copy', 'Hi {{first_name}}, could you send us a clear photo of the passport photo page, please? Make sure all four corners are visible.', null::uuid),
  ('Visa submitted', 'Hi {{first_name}}, the visa application has been submitted. We''ll let you know as soon as it''s approved.', null::uuid),
  ('Out of hours', 'Thanks {{first_name}} — the office is closed right now. We''ll pick this up first thing tomorrow morning (Dubai time).', null::uuid)
) v(title, body, created_by)
where not exists (select 1 from public.wa_quick_replies);

-- Files sent from the Inbox (photos, PDFs, video, audio) — a copy is kept in the
-- private whatsapp-media bucket so the thread can show it again.
alter table public.wa_messages
  add column if not exists media_type text check (media_type in ('image', 'document', 'video', 'audio')),
  add column if not exists media_path text,
  add column if not exists media_mime text,
  add column if not exists media_name text;
