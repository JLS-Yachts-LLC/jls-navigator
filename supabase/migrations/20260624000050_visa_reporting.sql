-- ============================================================================
-- Migration 050–052 (consolidated) — Visa Reporting module
-- Tickets #193–#195 · POLARIS Visa Reporting spec
-- ----------------------------------------------------------------------------
-- Adapted to THIS codebase (the spec was written against a generic schema):
--   • vessels                 -> yachts
--   • crew_vessel_assignments -> crew_members.yacht_id (no assignment table)
--   • polaris_audit_log       -> audit_log (event_type/module/resource_*)
--   • Supabase Edge Functions -> TanStack server routes + Cloudflare cron
--   • Resend                  -> AWS SES (existing provider)
--   • pg_cron                 -> Cloudflare Worker scheduled() (wrangler cron)
-- SOSO is already live here (crew_signon_events), so crew-movement counts are
-- computed from real data rather than left NULL.
-- ============================================================================

-- ── 1. Yacht comms preferences ──────────────────────────────────────────────
ALTER TABLE public.yachts
  ADD COLUMN IF NOT EXISTS visa_report_email            text,
  ADD COLUMN IF NOT EXISTS send_visa_reports            boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vessel_whatsapp              text,
  ADD COLUMN IF NOT EXISTS send_visa_via_whatsapp       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_crew_email_delivery    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_crew_whatsapp_delivery boolean DEFAULT false; -- LOCKED — future

-- ── 2. Visa dispatch tracking on applications ───────────────────────────────
ALTER TABLE public.visa_applications
  ADD COLUMN IF NOT EXISTS visa_dispatched          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS visa_dispatched_at       timestamptz,
  ADD COLUMN IF NOT EXISTS visa_dispatched_channels jsonb;

-- ── 3. Report log (one row per generate) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visa_report_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yacht_id        uuid NOT NULL REFERENCES public.yachts(id) ON DELETE CASCADE,
  report_date     date NOT NULL DEFAULT CURRENT_DATE,
  sent_to_email   text,
  crew_count      int,
  active_count    int,
  expiring_count  int,
  expired_count   int,
  no_visa_count   int,
  sign_on_count   int,
  sign_off_count  int,
  generated_by    uuid REFERENCES auth.users(id),
  generated_at    timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  manifest_source text NOT NULL DEFAULT 'crew_assignments'
                  CHECK (manifest_source IN ('crew_assignments','soso_roster')),
  -- snapshot_data is WRITE-ONCE: it is set by generate_vessel_visa_report() and
  -- must never be updated. Historical reports are immutable point-in-time records.
  snapshot_data   jsonb,
  status          text NOT NULL DEFAULT 'generated'
                  CHECK (status IN ('generated','sent','failed','skipped'))
);
COMMENT ON COLUMN public.visa_report_log.snapshot_data IS
  'Write-once point-in-time crew/visa snapshot. Never UPDATE after insert.';

CREATE INDEX IF NOT EXISTS idx_visa_report_log_yacht
  ON public.visa_report_log (yacht_id, generated_at DESC);

-- ── 4. Email / WhatsApp send log (one report may be sent many times) ────────
CREATE TABLE IF NOT EXISTS public.visa_email_send_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_log_id uuid REFERENCES public.visa_report_log(id) ON DELETE CASCADE,
  yacht_id      uuid NOT NULL REFERENCES public.yachts(id) ON DELETE CASCADE,
  sent_to       text NOT NULL,
  channel       text CHECK (channel IN ('vessel_email','vessel_whatsapp','crew_email','crew_whatsapp')),
  sent_at       timestamptz DEFAULT now(),
  provider_id   text,   -- SES message id / n8n execution id
  status        text CHECK (status IN ('sent','failed','bounced')),
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_visa_email_send_log_report
  ON public.visa_email_send_log (report_log_id);
CREATE INDEX IF NOT EXISTS idx_visa_email_send_log_yacht
  ON public.visa_email_send_log (yacht_id, sent_at DESC);

-- ── 5. SOSO integration hook — the ONLY crew-manifest source in this module ──
-- All visa-reporting queries read crew through this view. When SOSO ships a
-- current-roster table, swap the body to read from it (see commented variant)
-- and nothing downstream changes.
-- security_invoker: the view enforces the querying user's RLS on crew_members,
-- not the view creator's (Supabase advisory 0010).
CREATE OR REPLACE VIEW public.vessel_active_crew WITH (security_invoker = on) AS
  SELECT
    cm.yacht_id                  AS yacht_id,
    cm.id                        AS crew_member_id,
    cm.full_name                 AS full_name,
    cm.nationality               AS nationality,
    'crew_assignments'::text     AS source
  FROM public.crew_members cm
  WHERE cm.yacht_id IS NOT NULL
    AND coalesce(lower(cm.status), 'active') NOT IN ('cancelled','sign off','signed off');

-- SOSO SWAP (run when a current-roster table exists — not now):
-- CREATE OR REPLACE VIEW public.vessel_active_crew AS
--   SELECT vessel_id AS yacht_id, crew_member_id, full_name, nationality,
--          'soso_roster'::text AS source
--   FROM public.soso_signed_on
--   WHERE signed_off_at IS NULL;

-- ── 6. Report generation function ───────────────────────────────────────────
-- SECURITY DEFINER: writes report + audit rows. Vessel-scoped by construction —
-- every query is filtered by p_yacht_id, so a report can only ever contain one
-- vessel's crew (spec rule #6). Movement counts come from live SOSO events.
CREATE OR REPLACE FUNCTION public.generate_vessel_visa_report(
  p_yacht_id uuid,
  p_user_id  uuid
) RETURNS uuid AS $$
DECLARE
  v_report_id uuid;
  v_snapshot  jsonb;
  v_active    int := 0;
  v_expiring  int := 0;
  v_expired   int := 0;
  v_no_visa   int := 0;
  v_sign_ons  int := 0;
  v_sign_offs int := 0;
  -- Expiry warning window. Single source of truth in SQL; mirrored by
  -- EXPIRY_WARNING_DAYS in src/lib/visa-reporting/statusHelpers.ts.
  v_warn_days int := 30;
BEGIN
  -- Build the crew/visa snapshot through the SOSO hook view.
  SELECT jsonb_agg(jsonb_build_object(
    'crew_member_id', vac.crew_member_id,
    'name',           vac.full_name,
    'nationality',    vac.nationality,
    'visa_type',      va.visa_type,
    'expiry_date',    va.visa_expiry,
    'status', CASE
      WHEN va.visa_expiry IS NULL                                THEN 'no_visa'
      WHEN va.visa_expiry < CURRENT_DATE                         THEN 'expired'
      WHEN va.visa_expiry < CURRENT_DATE + v_warn_days           THEN 'expiring_soon'
      ELSE 'active'
    END,
    'days_remaining', (va.visa_expiry - CURRENT_DATE),
    'days_overdue',   CASE WHEN va.visa_expiry < CURRENT_DATE
                           THEN (CURRENT_DATE - va.visa_expiry) ELSE NULL END
  ) ORDER BY vac.full_name) INTO v_snapshot
  FROM public.vessel_active_crew vac
  LEFT JOIN LATERAL (
    -- Most recent approved visa per crew member (one row).
    SELECT va.visa_type, va.visa_expiry
    FROM public.visa_applications va
    WHERE va.crew_member_id = vac.crew_member_id
      AND va.status = 'approved'
    ORDER BY va.visa_expiry DESC NULLS LAST
    LIMIT 1
  ) va ON true
  WHERE vac.yacht_id = p_yacht_id;

  v_snapshot := coalesce(v_snapshot, '[]'::jsonb);

  SELECT
    count(*) FILTER (WHERE s->>'status' = 'active'),
    count(*) FILTER (WHERE s->>'status' = 'expiring_soon'),
    count(*) FILTER (WHERE s->>'status' = 'expired'),
    count(*) FILTER (WHERE s->>'status' = 'no_visa')
  INTO v_active, v_expiring, v_expired, v_no_visa
  FROM jsonb_array_elements(v_snapshot) s;

  -- Live SOSO crew-movement counts for the trailing 7 days (real data; 0 until
  -- events are recorded). event_type is free-text here, so match tolerantly.
  SELECT
    count(*) FILTER (WHERE replace(lower(event_type),' ','_') = 'sign_on'),
    count(*) FILTER (WHERE replace(lower(event_type),' ','_') = 'sign_off')
  INTO v_sign_ons, v_sign_offs
  FROM public.crew_signon_events
  WHERE yacht_id = p_yacht_id
    AND event_date >= CURRENT_DATE - 7;

  INSERT INTO public.visa_report_log (
    yacht_id, report_date, sent_to_email,
    crew_count, active_count, expiring_count, expired_count, no_visa_count,
    sign_on_count, sign_off_count,
    generated_by, manifest_source, snapshot_data, status
  )
  SELECT
    p_yacht_id, CURRENT_DATE, y.visa_report_email,
    v_active + v_expiring + v_expired + v_no_visa,
    v_active, v_expiring, v_expired, v_no_visa,
    v_sign_ons, v_sign_offs,
    p_user_id, 'crew_assignments', v_snapshot, 'generated'
  FROM public.yachts y
  WHERE y.id = p_yacht_id
  RETURNING id INTO v_report_id;

  -- audit_log.event_type is a fixed enum; 'report_generated' is the closest
  -- allowed value. The specific action lives in metadata.action.
  INSERT INTO public.audit_log (user_id, event_type, module, resource_type, resource_id, metadata)
  VALUES (
    p_user_id, 'report_generated', 'crew_visas', 'yacht', p_yacht_id,
    jsonb_build_object(
      'action',     'visa_report_generated',
      'report_id',  v_report_id,
      'crew_count', v_active + v_expiring + v_expired + v_no_visa,
      'expired',    v_expired,
      'expiring',   v_expiring
    )
  );

  RETURN v_report_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 7. RLS ──────────────────────────────────────────────────────────────────
-- This platform derives access claims in-app (the JWT-claims function is
-- disabled), so there is no role claim in the JWT to gate on. Reads are allowed
-- to authenticated users (module access is enforced at the route layer via
-- requireAccess); all WRITES happen via the service role (server routes) or the
-- SECURITY DEFINER function above, so no INSERT/UPDATE policies are granted —
-- which also keeps snapshot_data write-once for ordinary clients.
ALTER TABLE public.visa_report_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visa_email_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS read_visa_report_log ON public.visa_report_log;
CREATE POLICY read_visa_report_log ON public.visa_report_log
  FOR SELECT USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS read_visa_email_send_log ON public.visa_email_send_log;
CREATE POLICY read_visa_email_send_log ON public.visa_email_send_log
  FOR SELECT USING ((select auth.role()) = 'authenticated');

-- Server-side only: the API route calls this with the service role after
-- requireAccess() gating. Direct PostgREST RPC by anon/authenticated is revoked
-- so module-level access control can't be bypassed (Supabase advisory 0028/0029).
REVOKE EXECUTE ON FUNCTION public.generate_vessel_visa_report(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.generate_vessel_visa_report(uuid, uuid) TO service_role;
