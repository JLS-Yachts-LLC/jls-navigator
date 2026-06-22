-- ============================================================
-- Migration 050 — Sign On / Sign Off (SOSO): movement detail + crew timeline
-- ============================================================
-- crew_signon_events is the canonical crew-movement record. Extend it with the
-- flight / logistics fields from the JLS Weekly Seaport Immigration form, plus a
-- status lifecycle and a week_commencing key for weekly report grouping.

ALTER TABLE public.crew_signon_events
  ADD COLUMN IF NOT EXISTS status              text DEFAULT 'confirmed'
    CHECK (status IN ('pending','confirmed','completed','cancelled')),
  ADD COLUMN IF NOT EXISTS airline             text,
  ADD COLUMN IF NOT EXISTS flight_number       text,
  ADD COLUMN IF NOT EXISTS departure_airport   text,
  ADD COLUMN IF NOT EXISTS arrival_airport     text,
  ADD COLUMN IF NOT EXISTS departure_datetime  timestamptz,
  ADD COLUMN IF NOT EXISTS arrival_datetime    timestamptz,
  ADD COLUMN IF NOT EXISTS driver_assigned     uuid,
  ADD COLUMN IF NOT EXISTS pickup_required     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pickup_time         timestamptz,
  ADD COLUMN IF NOT EXISTS crew_contact_number text,
  ADD COLUMN IF NOT EXISTS week_commencing     date;

CREATE INDEX IF NOT EXISTS idx_signon_week_commencing
  ON public.crew_signon_events (week_commencing);
CREATE INDEX IF NOT EXISTS idx_signon_yacht_date
  ON public.crew_signon_events (yacht_id, event_date DESC);

-- ── Append-only crew timeline ───────────────────────────────────────────────
-- A single chronological audit trail per crew member. Visa, movement and permit
-- events all feed into this table. APPEND-ONLY: no UPDATE/DELETE policies exist,
-- so RLS blocks mutation for everyone except the service role.
CREATE TABLE IF NOT EXISTS public.crew_timeline_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_member_id uuid NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  yacht_id       uuid REFERENCES public.yachts(id) ON DELETE SET NULL,
  event_type     text NOT NULL CHECK (event_type IN (
                   'VISA_APPLICATION_SUBMITTED','VISA_APPROVED','VISA_REJECTED',
                   'UAE_ENTRY','SIGN_ON','SIGN_OFF','UAE_EXIT','VISA_CANCELLATION',
                   'PERMIT_ISSUED','PERMIT_EXPIRED')),
  event_datetime timestamptz NOT NULL,
  reference_id   uuid,
  reference_type text,
  notes          text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_crew_datetime
  ON public.crew_timeline_events (crew_member_id, event_datetime DESC);

ALTER TABLE public.crew_timeline_events ENABLE ROW LEVEL SECURITY;

-- Read for any authenticated user; insert by authenticated (system/server).
-- Deliberately NO update/delete policies — the trail is immutable.
DROP POLICY IF EXISTS read_timeline ON public.crew_timeline_events;
CREATE POLICY read_timeline ON public.crew_timeline_events FOR SELECT
  USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS insert_timeline ON public.crew_timeline_events;
CREATE POLICY insert_timeline ON public.crew_timeline_events FOR INSERT
  WITH CHECK ((select auth.role()) = 'authenticated');
