-- ════════════════════════════════════════════════════════════════════════════
-- WhatsApp: being assigned a chat lets you work that chat.
--
-- A Training-only person (Angela) assigned an enquiry that came in on the office
-- number couldn't see it: access was per number only. Now the assignee of a
-- conversation can read and reply to THAT conversation — its messages, its
-- contact and its number's templates — on whichever number it's on, with no
-- access to the rest of that number. Reassign it and the access goes with it.
-- Replies still go from the number the client wrote to, so the office keeps the
-- whole thread.
--
-- Being assigned also rings the assignee's bell, with a link straight to the chat.
-- ════════════════════════════════════════════════════════════════════════════

-- Staff only: portal captains and guests are never given a chat.
create or replace function public.wa_is_staff(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null
     and not exists (select 1 from captain_accounts where user_id = p_user and active)
     and not exists (select 1 from guest_accounts where user_id = p_user and active)
$$;
revoke execute on function public.wa_is_staff(uuid) from public, anon;
grant execute on function public.wa_is_staff(uuid) to authenticated;

create index if not exists wa_conversations_assigned_idx on public.wa_conversations (assigned_to) where assigned_to is not null;

-- The signed-in person's assigned threads (number + contact). Read once per query
-- by the policies below, so row checks stay a hash lookup.
create or replace function public.wa_my_assigned_threads()
returns table (line_id uuid, contact_id uuid) language sql stable security definer set search_path = public as $$
  select c.line_id, c.contact_id from wa_conversations c
   where c.assigned_to = auth.uid() and public.wa_is_staff(auth.uid())
$$;
revoke execute on function public.wa_my_assigned_threads() from public, anon;
grant execute on function public.wa_my_assigned_threads() to authenticated;

-- Access to one thread: the number's level, raised to send for its assignee.
-- What the server checks before reading, replying or sending a file.
create or replace function public.wa_thread_level(p_user uuid, p_line uuid, p_contact uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  lvl text := public.wa_line_level(p_user, p_line);
begin
  if lvl = 'send' or p_contact is null then return lvl; end if;
  if public.wa_is_staff(p_user) and exists (
       select 1 from wa_conversations where line_id = p_line and contact_id = p_contact and assigned_to = p_user) then
    return 'send';
  end if;
  return lvl;
end;
$$;
revoke execute on function public.wa_thread_level(uuid, uuid, uuid) from public, anon;
grant execute on function public.wa_thread_level(uuid, uuid, uuid) to authenticated;

-- ── Conversations ────────────────────────────────────────────────────────────
drop policy if exists "line view" on public.wa_conversations;
create policy "line view" on public.wa_conversations for select to authenticated
  using ((select public.wa_line_level(auth.uid(), line_id)) <> 'none'
         or (assigned_to = (select auth.uid()) and (select public.wa_is_staff(auth.uid()))));
-- The assignee may close, reopen or hand the chat on (only status and assigned_to
-- are writable). Which rows is decided by USING; the new row only has to be staff's.
drop policy if exists "line send" on public.wa_conversations;
create policy "line send" on public.wa_conversations for update to authenticated
  using ((select public.wa_line_level(auth.uid(), line_id)) = 'send'
         or (assigned_to = (select auth.uid()) and (select public.wa_is_staff(auth.uid()))))
  with check ((select public.wa_is_staff(auth.uid())));

-- ── Messages ─────────────────────────────────────────────────────────────────
drop policy if exists "line view" on public.wa_inbound;
create policy "line view" on public.wa_inbound for select to authenticated
  using ((select public.wa_line_level(auth.uid(), line_id)) <> 'none'
         or (line_id, contact_id) in (select t.line_id, t.contact_id from public.wa_my_assigned_threads() t));

drop policy if exists "line view" on public.wa_messages;
create policy "line view" on public.wa_messages for select to authenticated
  using ((select public.wa_line_level(auth.uid(), line_id)) <> 'none'
         or (line_id, contact_id) in (select t.line_id, t.contact_id from public.wa_my_assigned_threads() t));

-- ── What the thread needs to show ────────────────────────────────────────────
drop policy if exists "assignees read their contacts" on public.wa_contacts;
create policy "assignees read their contacts" on public.wa_contacts for select to authenticated
  using (id in (select t.contact_id from public.wa_my_assigned_threads() t));

-- Templates of that number: outside the 24-hour window a reply has to be one.
drop policy if exists "assignees read their templates" on public.wa_templates;
create policy "assignees read their templates" on public.wa_templates for select to authenticated
  using (line_id in (select t.line_id from public.wa_my_assigned_threads() t));

drop policy if exists "line view" on public.wa_lines;
create policy "line view" on public.wa_lines for select to authenticated
  using (
    (select public.wa_line_level(auth.uid(), id)) <> 'none'
    or (select public.has_module_permission(auth.uid(), 'communications', 'view'))
    or id in (select t.line_id from public.wa_my_assigned_threads() t)
  );

-- Menu + quick replies: an assigned chat counts as using WhatsApp.
create or replace function public.wa_has_line_access(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from wa_lines l where public.wa_line_level(p_user, l.id) <> 'none')
      or (public.wa_is_staff(p_user) and exists (select 1 from wa_conversations where assigned_to = p_user))
$$;

-- The signed-in person's numbers. A number they can only reach through chats
-- assigned to them comes back as 'assigned': those chats, nothing else on it.
drop function if exists public.wa_my_lines();
create function public.wa_my_lines()
returns table (line_id uuid, level text) language sql stable security definer set search_path = public as $$
  select l.id,
         case when public.wa_line_level(auth.uid(), l.id) <> 'none' then public.wa_line_level(auth.uid(), l.id)
              else 'assigned' end
    from wa_lines l
   where public.wa_line_level(auth.uid(), l.id) <> 'none'
      or l.id in (select t.line_id from public.wa_my_assigned_threads() t)
$$;
revoke execute on function public.wa_my_lines() from public, anon;
grant execute on function public.wa_my_lines() to authenticated;

-- Everyone's level on one number, for the Assign dropdown: who would only reach
-- the chat because it's assigned to them. Only for people who can see that number's chats.
create or replace function public.wa_line_people(p_line uuid)
returns table (user_id uuid, level text) language sql stable security definer set search_path = public as $$
  select p.id, public.wa_line_level(p.id, p_line)
    from profiles p
   where public.wa_is_staff(p.id)
     and (public.wa_line_level(auth.uid(), p_line) <> 'none'
          or p_line in (select t.line_id from public.wa_my_assigned_threads() t))
$$;
revoke execute on function public.wa_line_people(uuid) from public, anon;
grant execute on function public.wa_line_people(uuid) to authenticated;

-- ── Bell for the assignee ────────────────────────────────────────────────────
create or replace function public.wa_conversations_assigned_bell()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
  line_label text;
begin
  if new.assigned_to is null or new.assigned_to is not distinct from old.assigned_to then return new; end if;
  -- Picking a chat up yourself needs no alert.
  if new.assigned_to = auth.uid() then return new; end if;
  begin
    select coalesce(nullif(trim(name), ''), phone_e164, 'a contact') into who from wa_contacts where id = new.contact_id;
    select label into line_label from wa_lines where id = new.line_id;
    insert into public.notifications (user_id, type, urgency, title, body, action_url, metadata)
    values (new.assigned_to, 'whatsapp_assigned', 'info',
            'WhatsApp chat assigned to you — ' || coalesce(who, 'a contact'),
            left(concat_ws(' · ',
              (select display_name from profiles where id = auth.uid()) || ' assigned it to you',
              'on ' || line_label,
              nullif(new.last_preview, '')), 500),
            '/polaris-redesign?screen=whatsapp&c=' || new.contact_id || '&l=' || new.line_id,
            jsonb_build_object('conversation_id', new.id, 'contact_id', new.contact_id, 'line_id', new.line_id));
  exception when others then
    raise warning 'whatsapp assigned bell failed: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists wa_conversations_assigned_bell on public.wa_conversations;
create trigger wa_conversations_assigned_bell after update of assigned_to on public.wa_conversations
  for each row execute function public.wa_conversations_assigned_bell();
