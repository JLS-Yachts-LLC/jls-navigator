-- ============================================================
-- Migration 040 — Visa admin action log   Ticket #169
-- Operational record of every admin action on a visa application.
-- Separate from the platform audit_log.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.visa_admin_actions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visa_application_id uuid NOT NULL REFERENCES public.visa_applications(id) ON DELETE CASCADE,
  performed_by        uuid NOT NULL REFERENCES auth.users(id),
  action_type         text NOT NULL CHECK (action_type IN (
    'status_change','document_reviewed','amendment_requested','note_added',
    'report_generated','report_shared','flag_acknowledged','renewal_recorded'
  )),
  previous_status     text,
  new_status          text,
  note                text,
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visa_admin_actions_application
  ON public.visa_admin_actions (visa_application_id, created_at DESC);

ALTER TABLE public.visa_admin_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crew_agency_read_admin_actions ON public.visa_admin_actions;
CREATE POLICY crew_agency_read_admin_actions ON public.visa_admin_actions FOR SELECT
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_module_access uma
      JOIN public.modules m ON m.module_id = uma.module_id
      WHERE uma.user_id = (select auth.uid())
        AND m.name = 'crew_immigration' AND uma.active
    )
  );

DROP POLICY IF EXISTS crew_agency_insert_admin_actions ON public.visa_admin_actions;
CREATE POLICY crew_agency_insert_admin_actions ON public.visa_admin_actions FOR INSERT
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_module_access uma
      JOIN public.modules m ON m.module_id = uma.module_id
      WHERE uma.user_id = (select auth.uid())
        AND m.name = 'crew_immigration' AND uma.active
    )
  );
