-- ============================================================
-- Migration 037 — UAE country config (single active country)   Ticket #166
--
-- Reconciliation notes (spec written against an assumed schema):
--   * spec keys the config on alpha-3 'UAE'. The LIVE schema uses alpha-2
--     country codes ('AE', 'OM', ...) in visa_applications.country_code and in
--     COUNTRY_CONFIGS. We therefore seed UAE as 'AE' so the row matches real
--     applications. Using 'UAE' would match nothing and no-op the expiry engine.
--   * other countries are seeded inactive so the table is the single source of
--     truth for which countries are live.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.visa_country_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code  text NOT NULL UNIQUE,          -- alpha-2, matches visa_applications.country_code
  country_name  text NOT NULL,
  is_active     boolean NOT NULL DEFAULT false,
  processing_days_min  int NOT NULL DEFAULT 5,
  processing_days_max  int NOT NULL DEFAULT 10,
  required_docs jsonb NOT NULL DEFAULT '[]',
  fee_config    jsonb NOT NULL DEFAULT '{}',
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- UAE row — the ONLY active country for this release (alpha-2 'AE')
INSERT INTO public.visa_country_config (
  country_code, country_name, is_active,
  processing_days_min, processing_days_max,
  required_docs, fee_config, notes
)
VALUES (
  'AE',
  'United Arab Emirates',
  true,
  5, 10,
  '[
    {"doc_type": "passport_bio_page",       "label": "Passport bio page",        "required": true},
    {"doc_type": "passport_external_cover", "label": "Passport external cover",  "required": true},
    {"doc_type": "seamans_book_or_letter",  "label": "Seaman''s Book or JLS Verification Letter", "required": true},
    {"doc_type": "headshot",                "label": "Crew headshot photograph", "required": true}
  ]',
  '{"supporting_letter_aed": "50.00", "supporting_letter_usd": "14.00"}',
  'UAE crewing visa — handled by our Port & Agency Team'
)
ON CONFLICT (country_code) DO UPDATE SET
  is_active           = EXCLUDED.is_active,
  processing_days_min = EXCLUDED.processing_days_min,
  processing_days_max = EXCLUDED.processing_days_max,
  required_docs       = EXCLUDED.required_docs,
  fee_config          = EXCLUDED.fee_config,
  updated_at          = now();

-- Remaining supported countries — seeded INACTIVE for this release.
INSERT INTO public.visa_country_config (country_code, country_name, is_active) VALUES
  ('OM', 'Oman',          false),
  ('MV', 'Maldives',      false),
  ('SA', 'Saudi Arabia',  false),
  ('QA', 'Qatar',         false),
  ('BH', 'Bahrain',       false),
  ('EG', 'Egypt',         false)
ON CONFLICT (country_code) DO NOTHING;

-- RLS: crew_immigration users (and global admins) may read; only admins write.
ALTER TABLE public.visa_country_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visa_country_config_read ON public.visa_country_config;
CREATE POLICY visa_country_config_read ON public.visa_country_config FOR SELECT
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_module_access uma
      JOIN public.modules m ON m.module_id = uma.module_id
      WHERE uma.user_id = (select auth.uid())
        AND m.name = 'crew_immigration' AND uma.active
    )
  );

DROP POLICY IF EXISTS visa_country_config_admin ON public.visa_country_config;
CREATE POLICY visa_country_config_admin ON public.visa_country_config FOR ALL
  USING (public.has_role((select auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role));
