-- Reliable QuickBooks webhook processing.
--
-- Previously a per-document failure made the webhook return 500 so Intuit would
-- re-deliver — but repeated 5xx responses put Intuit's delivery into backoff and
-- events stopped arriving entirely. The receiver now ACKs every valid event with
-- 200 immediately and owns its retries: the raw payload is stored here and any
-- event that fails processing is re-run by the 5-minute cron sweeper.
alter table public.qb_webhook_events add column if not exists raw text;

create index if not exists qb_webhook_events_pending_idx
  on public.qb_webhook_events (received_at)
  where not forwarded;
