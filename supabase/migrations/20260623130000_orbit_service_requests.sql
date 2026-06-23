-- ============================================================
-- Migration — ORBIT service-request hub (requests, quotations, activity log)
-- ============================================================
-- See POLARIS_ORBIT_MODULE.md. vessel_id→yacht_id, suppliers kept as free text for
-- now. Activity log is append-only (auto-logged on create + status change).
CREATE TABLE IF NOT EXISTS public.orbit_service_requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yacht_id             uuid REFERENCES public.yachts(id) ON DELETE SET NULL,
  requested_by         uuid,
  category             text NOT NULL,
  request_type         text,
  title                text NOT NULL,
  description          text,
  urgency              text NOT NULL DEFAULT 'medium' CHECK (urgency IN ('critical','high','medium','low')),
  status               text NOT NULL DEFAULT 'submitted' CHECK (status IN
                         ('draft','submitted','awaiting_quotation','awaiting_approval','approved','scheduled','in_progress','completed','cancelled')),
  assigned_coordinator uuid,
  assigned_supplier    text,
  marina               text,
  scheduled_date       timestamptz,
  completed_at         timestamptz,
  details              jsonb NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orbit_sr_status ON public.orbit_service_requests (status);
CREATE INDEX IF NOT EXISTS idx_orbit_sr_yacht ON public.orbit_service_requests (yacht_id);

CREATE TABLE IF NOT EXISTS public.orbit_quotations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES public.orbit_service_requests(id) ON DELETE CASCADE,
  supplier     text, amount numeric, currency text NOT NULL DEFAULT 'AED',
  valid_until  date, notes text,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  submitted_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, reviewed_by uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orbit_quotes_request ON public.orbit_quotations (request_id);

CREATE TABLE IF NOT EXISTS public.orbit_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.orbit_service_requests(id) ON DELETE CASCADE,
  actor_id uuid, action text NOT NULL, notes text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orbit_activity_request ON public.orbit_activity_log (request_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.orbit_log_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO orbit_activity_log (request_id, actor_id, action, notes) VALUES (NEW.id, NEW.requested_by, 'created', NEW.title);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO orbit_activity_log (request_id, actor_id, action, notes) VALUES (NEW.id, NEW.assigned_coordinator, 'status_changed', OLD.status || ' → ' || NEW.status);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_orbit_log_activity ON public.orbit_service_requests;
CREATE TRIGGER trg_orbit_log_activity AFTER INSERT OR UPDATE ON public.orbit_service_requests
  FOR EACH ROW EXECUTE FUNCTION public.orbit_log_activity();

ALTER TABLE public.orbit_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orbit_sr_all ON public.orbit_service_requests;
CREATE POLICY orbit_sr_all ON public.orbit_service_requests FOR ALL USING ((select auth.role())='authenticated') WITH CHECK ((select auth.role())='authenticated');
DROP POLICY IF EXISTS orbit_q_all ON public.orbit_quotations;
CREATE POLICY orbit_q_all ON public.orbit_quotations FOR ALL USING ((select auth.role())='authenticated') WITH CHECK ((select auth.role())='authenticated');
DROP POLICY IF EXISTS orbit_act_read ON public.orbit_activity_log;
CREATE POLICY orbit_act_read ON public.orbit_activity_log FOR SELECT USING ((select auth.role())='authenticated');
DROP POLICY IF EXISTS orbit_act_insert ON public.orbit_activity_log;
CREATE POLICY orbit_act_insert ON public.orbit_activity_log FOR INSERT WITH CHECK ((select auth.role())='authenticated');
