-- ============================================================
-- Migration 038 — Visa expiry flag system   Ticket #167
--
-- Reconciliation notes:
--   * spec used vessel_id/vessels(id) -> live DB uses yacht_id/yachts(id)
--   * spec used crew_member_id -> live DB uses crew_id (crew_members.id)
--   * spec RLS referenced user_module_permissions -> live DB uses
--     user_module_access JOIN modules (name = 'crew_immigration')
--   * visa_applications already has a legacy `visa_expiry` (date) column; we add
--     the explicit visa_issue_date / visa_expiry_date the flag engine reads.
-- ============================================================

ALTER TABLE public.visa_applications
  ADD COLUMN IF NOT EXISTS visa_issue_date   date,
  ADD COLUMN IF NOT EXISTS visa_expiry_date  date,
  ADD COLUMN IF NOT EXISTS visa_renewed      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renewed_visa_ref  uuid REFERENCES public.visa_applications(id),
  ADD COLUMN IF NOT EXISTS expiry_flags_sent jsonb NOT NULL DEFAULT '{}';
-- expiry_flags_sent shape: {"30_day": "<iso>"|null, "10_working": ..., "5_working": ...}

CREATE TABLE IF NOT EXISTS public.visa_expiry_flags (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visa_application_id uuid NOT NULL REFERENCES public.visa_applications(id) ON DELETE CASCADE,
  crew_id             uuid NOT NULL REFERENCES public.crew_members(id),
  yacht_id            uuid REFERENCES public.yachts(id),
  flag_type           text NOT NULL CHECK (flag_type IN ('30_day','10_working_day','5_working_day')),
  expiry_date         date NOT NULL,
  flagged_at          timestamptz NOT NULL DEFAULT now(),
  suppressed          boolean NOT NULL DEFAULT false,
  suppression_reason  text,
  notified_users      uuid[] NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expiry_flags_application
  ON public.visa_expiry_flags (visa_application_id);
CREATE INDEX IF NOT EXISTS idx_expiry_flags_expiry_date
  ON public.visa_expiry_flags (expiry_date) WHERE suppressed = false;

ALTER TABLE public.visa_expiry_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crew_agency_read_flags ON public.visa_expiry_flags;
CREATE POLICY crew_agency_read_flags ON public.visa_expiry_flags FOR SELECT
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_module_access uma
      JOIN public.modules m ON m.module_id = uma.module_id
      WHERE uma.user_id = (select auth.uid())
        AND m.name = 'crew_immigration' AND uma.active
    )
  );

-- Inserts come from the scheduled job (service role bypasses RLS); this policy
-- additionally permits authenticated inserts for completeness.
DROP POLICY IF EXISTS system_insert_flags ON public.visa_expiry_flags;
CREATE POLICY system_insert_flags ON public.visa_expiry_flags FOR INSERT
  WITH CHECK ((select auth.role()) = 'authenticated');
