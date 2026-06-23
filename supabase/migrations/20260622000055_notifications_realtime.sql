-- ============================================================
-- Migration 055 — enable realtime on notifications (for the bell)
-- ============================================================
-- (The notifications table itself is migration 044.) Adding it to the realtime
-- publication lets the NotificationBell receive live inserts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END $$;
