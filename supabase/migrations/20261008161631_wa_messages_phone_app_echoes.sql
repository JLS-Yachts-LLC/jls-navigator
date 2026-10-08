-- Replies typed in the WhatsApp Business app on the office phone (the number is
-- in coexistence mode). Meta sends them to the webhook as smb_message_echoes;
-- they're stored as replies so the Inbox thread shows both sides of the chat.
-- A photo or file sent that way is kept on Meta's side and fetched by media_id.
alter table public.wa_messages
  add column if not exists from_phone boolean not null default false,
  add column if not exists media_id text;

comment on column public.wa_messages.from_phone is 'Sent from the WhatsApp Business app on the phone (smb_message_echoes), not from Polaris.';
comment on column public.wa_messages.media_id is 'Meta media id for a file sent from the phone app; Polaris-sent files use media_path instead.';
