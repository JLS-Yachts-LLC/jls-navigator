-- WhatsApp Inbox / Polaris Chats: push new messages to the browser instead of
-- waiting for the 15-second poll. wa_conversations changes on every message in
-- or out (triggers), wa_messages on every delivery / read tick. Realtime applies
-- each subscriber's row-level security, so people still only see their numbers.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wa_conversations') then
    alter publication supabase_realtime add table public.wa_conversations;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wa_messages') then
    alter publication supabase_realtime add table public.wa_messages;
  end if;
end $$;
