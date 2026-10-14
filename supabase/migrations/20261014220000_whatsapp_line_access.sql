-- ════════════════════════════════════════════════════════════════════════════
-- WhatsApp: who can use which number.
--
-- Each line (number) has members, set in WhatsApp → Setup → Numbers:
--   view  — read that number's conversations (and see new messages arrive)
--   send  — also reply, send templates, assign and close its chats
--
-- Effective access to a line (wa_line_level):
--   · global admins: send, on every line;
--   · a member: their level;
--   · the OFFICE line only: the Communications permission still counts as before
--     (edit → send, view → view), so nobody who uses it today is locked out.
--     Every other line is members-only.
--
-- The conversation, inbound and outbound message tables are now readable per
-- line instead of to everyone with Communications view. Contacts, templates and
-- quick replies become readable to a line's members too, so a Training-only
-- user's Inbox works without the Communications permission.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.wa_line_members (
  line_id  uuid not null references public.wa_lines(id) on delete cascade,
  user_id  uuid not null,
  level    text not null check (level in ('view', 'send')),
  added_by uuid,
  added_at timestamptz not null default now(),
  primary key (line_id, user_id)
);
create index if not exists wa_line_members_user_idx on public.wa_line_members (user_id);

create or replace function public.wa_line_level(p_user uuid, p_line uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  member text;
  office boolean;
begin
  if p_user is null or p_line is null then return 'none'; end if;
  -- Portal captains and guests are never staff.
  if exists (select 1 from captain_accounts where user_id = p_user and active)
     or exists (select 1 from guest_accounts where user_id = p_user and active) then
    return 'none';
  end if;
  if public.is_polaris_global_admin(p_user) then return 'send'; end if;
  select level into member from wa_line_members where line_id = p_line and user_id = p_user;
  if member = 'send' then return 'send'; end if;
  select is_default into office from wa_lines where id = p_line;
  if coalesce(office, false) then
    if public.has_module_permission(p_user, 'communications', 'edit') then return 'send'; end if;
    if public.has_module_permission(p_user, 'communications', 'view') then return 'view'; end if;
  end if;
  return coalesce(member, 'none');
end;
$$;
revoke execute on function public.wa_line_level(uuid, uuid) from public, anon;
grant execute on function public.wa_line_level(uuid, uuid) to authenticated;

-- Can this person use ANY WhatsApp number? (Menu + quick replies.)
create or replace function public.wa_has_line_access(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from wa_lines l where public.wa_line_level(p_user, l.id) <> 'none')
$$;
revoke execute on function public.wa_has_line_access(uuid) from public, anon;
grant execute on function public.wa_has_line_access(uuid) to authenticated;

-- ── Message tables: per line ─────────────────────────────────────────────────
drop policy if exists "communications view" on public.wa_conversations;
drop policy if exists "line view" on public.wa_conversations;
create policy "line view" on public.wa_conversations for select to authenticated
  using ((select public.wa_line_level(auth.uid(), line_id)) <> 'none');
drop policy if exists "communications update" on public.wa_conversations;
drop policy if exists "line send" on public.wa_conversations;
create policy "line send" on public.wa_conversations for update to authenticated
  using ((select public.wa_line_level(auth.uid(), line_id)) = 'send')
  with check ((select public.wa_line_level(auth.uid(), line_id)) = 'send');

drop policy if exists "communications view" on public.wa_inbound;
drop policy if exists "line view" on public.wa_inbound;
create policy "line view" on public.wa_inbound for select to authenticated
  using ((select public.wa_line_level(auth.uid(), line_id)) <> 'none');

drop policy if exists "communications view" on public.wa_messages;
drop policy if exists "line view" on public.wa_messages;
create policy "line view" on public.wa_messages for select to authenticated
  using ((select public.wa_line_level(auth.uid(), line_id)) <> 'none');

-- ── What a line's Inbox needs to show ────────────────────────────────────────
drop policy if exists "line members read their contacts" on public.wa_contacts;
create policy "line members read their contacts" on public.wa_contacts for select to authenticated
  using (exists (
    select 1 from public.wa_conversations c
     where c.contact_id = wa_contacts.id
       and (select public.wa_line_level(auth.uid(), c.line_id)) <> 'none'
  ));

drop policy if exists "line members read their templates" on public.wa_templates;
create policy "line members read their templates" on public.wa_templates for select to authenticated
  using ((select public.wa_line_level(auth.uid(), line_id)) <> 'none');

drop policy if exists "line members use quick replies" on public.wa_quick_replies;
create policy "line members use quick replies" on public.wa_quick_replies for select to authenticated
  using ((select public.wa_has_line_access(auth.uid())));

-- Lines: visible to anyone who can use one of them, or who has Communications.
drop policy if exists "communications view" on public.wa_lines;
drop policy if exists "line view" on public.wa_lines;
create policy "line view" on public.wa_lines for select to authenticated
  using (
    (select public.wa_line_level(auth.uid(), id)) <> 'none'
    or (select public.has_module_permission(auth.uid(), 'communications', 'view'))
  );

-- Members: your own rows; everything for Communications admins (who manage them).
-- Writes go through /api/whatsapp/lines/members (service role, audited).
alter table public.wa_line_members enable row level security;
drop policy if exists "see members" on public.wa_line_members;
create policy "see members" on public.wa_line_members for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_module_permission(auth.uid(), 'communications', 'admin')));
revoke insert, update, delete on public.wa_line_members from anon, authenticated;
revoke all on public.wa_line_members from anon;

-- The signed-in person's numbers and level on each — what the Inbox and the menu use.
create or replace function public.wa_my_lines()
returns table (line_id uuid, level text) language sql stable security definer set search_path = public as $$
  select l.id, public.wa_line_level(auth.uid(), l.id)
    from wa_lines l
   where public.wa_line_level(auth.uid(), l.id) <> 'none'
$$;
revoke execute on function public.wa_my_lines() from public, anon;
grant execute on function public.wa_my_lines() to authenticated;
