-- ============================================================
-- Migration 042 — platform_config key/value store   Ticket #171
-- Fees are never hardcoded in the app; they read from here.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_config (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  description text,
  updated_by  uuid REFERENCES auth.users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_config (key, value, description) VALUES
  ('uae_visa_supporting_letter_aed', '50.00', 'UAE visa supporting letter fee in AED'),
  ('uae_visa_supporting_letter_usd', '14.00', 'UAE visa supporting letter fee in USD')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_config_admin ON public.platform_config;
CREATE POLICY platform_config_admin ON public.platform_config FOR ALL
  USING (public.has_role((select auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS platform_config_read ON public.platform_config;
CREATE POLICY platform_config_read ON public.platform_config FOR SELECT
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_module_access uma
      JOIN public.modules m ON m.module_id = uma.module_id
      WHERE uma.user_id = (select auth.uid())
        AND m.name = 'crew_immigration' AND uma.active
    )
  );
