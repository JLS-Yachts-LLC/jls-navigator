-- WhatsApp → Responses: answers staff set by hand.
--
-- An invite's answers come from WhatsApp itself — the button a client taps (or
-- a reply quoting the invite) is matched to the message it answers. When a
-- client answers some other way — a phone call, a free-text "see you there",
-- a word at the marina — staff record it here, and it takes precedence over
-- whatever came through WhatsApp. One answer per contact per invite template;
-- `answer` is the button text it stands for (e.g. "I'll be there").

create table if not exists public.wa_rsvp_answers (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.wa_templates(id) on delete cascade,
  contact_id uuid not null references public.wa_contacts(id) on delete cascade,
  answer text not null check (length(answer) between 1 and 60),
  note text check (note is null or length(note) <= 500),
  set_by uuid references auth.users(id) on delete set null,
  set_by_name text,
  set_at timestamptz not null default now(),
  unique (template_id, contact_id)
);

alter table public.wa_rsvp_answers enable row level security;
drop policy if exists "communications view" on public.wa_rsvp_answers;
create policy "communications view" on public.wa_rsvp_answers for select to authenticated
  using ((select public.has_module_permission(auth.uid(), 'communications', 'view')) and not (select public.is_portal_captain()));
drop policy if exists "communications insert" on public.wa_rsvp_answers;
create policy "communications insert" on public.wa_rsvp_answers for insert to authenticated
  with check ((select public.has_module_permission(auth.uid(), 'communications', 'edit')) and not (select public.is_portal_captain()));
drop policy if exists "communications update" on public.wa_rsvp_answers;
create policy "communications update" on public.wa_rsvp_answers for update to authenticated
  using ((select public.has_module_permission(auth.uid(), 'communications', 'edit')) and not (select public.is_portal_captain()))
  with check ((select public.has_module_permission(auth.uid(), 'communications', 'edit')) and not (select public.is_portal_captain()));
drop policy if exists "communications delete" on public.wa_rsvp_answers;
create policy "communications delete" on public.wa_rsvp_answers for delete to authenticated
  using ((select public.has_module_permission(auth.uid(), 'communications', 'edit')) and not (select public.is_portal_captain()));
