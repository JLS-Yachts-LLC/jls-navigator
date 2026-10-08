-- client_logs only accepted 'error' and 'warn', so the client portal's start-up
-- timing reports (level 'info', deliberately not escalated as app errors) were
-- rejected and silently lost. Allow 'info'; escalation still only reads warn/error.
alter table public.client_logs drop constraint if exists client_logs_level_check;
alter table public.client_logs add constraint client_logs_level_check check (level = any (array['error', 'warn', 'info']));
