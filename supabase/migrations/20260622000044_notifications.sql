-- ============================================================
-- Migration 044 — In-platform notifications   Ticket #173
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL,
  urgency     text NOT NULL CHECK (urgency IN ('info','warning','danger')),
  title       text NOT NULL,
  body        text NOT NULL,
  action_url  text,
  read_at     timestamptz,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_read_own_notifications ON public.notifications;
CREATE POLICY user_read_own_notifications ON public.notifications FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS user_update_own_notifications ON public.notifications;
CREATE POLICY user_update_own_notifications ON public.notifications FOR UPDATE
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS system_insert_notifications ON public.notifications;
CREATE POLICY system_insert_notifications ON public.notifications FOR INSERT
  WITH CHECK ((select auth.role()) = 'authenticated');
