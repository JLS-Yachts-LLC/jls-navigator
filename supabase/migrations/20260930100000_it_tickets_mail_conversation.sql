-- Service Desk: remember which email conversation raised a ticket.
--
-- 30 Sep 2026. An OmniAccess support thread ("[#444627] - MY Plvs Vltra - VSAT
-- Offline") raised three separate Polaris tickets in one morning — SD-0034,
-- SD-0035, SD-0038 — each mirrored to New Horizon, because the mail poller only
-- recognised our own [SD-xxxx] reference in the subject. Storing the Outlook
-- conversation id lets later mail in the same thread append to the ticket it
-- already has; the poller also falls back to matching the cleaned subject.
alter table public.it_tickets add column if not exists mail_conversation_id text;
create index if not exists it_tickets_mail_conversation_idx
  on public.it_tickets (mail_conversation_id) where mail_conversation_id is not null;
