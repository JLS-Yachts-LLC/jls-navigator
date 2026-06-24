-- Tracks the last ShipSync → SharePoint outbound push (Integrations panel).
CREATE TABLE IF NOT EXISTS public.shipsync_sync_state (
  id int PRIMARY KEY DEFAULT 1,
  last_push_at timestamptz, pushed int NOT NULL DEFAULT 0, errors int NOT NULL DEFAULT 0,
  detail text, updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipsync_sync_state_singleton CHECK (id = 1)
);
INSERT INTO public.shipsync_sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.shipsync_sync_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shipsync_sync_state_read ON public.shipsync_sync_state;
CREATE POLICY shipsync_sync_state_read ON public.shipsync_sync_state FOR SELECT USING (auth.role() = 'authenticated');
