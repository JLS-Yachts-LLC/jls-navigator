-- ============================================================
-- Migration 043 — Document templates (JLS Crew Verification Letter)   Ticket #172
-- Placeholder body — MUST be replaced with the approved JLS template before
-- go-live (Phase 6 step 5).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.document_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key  text NOT NULL UNIQUE,
  template_name text NOT NULL,
  body_html     text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  version       int NOT NULL DEFAULT 1,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.document_templates (template_key, template_name, body_html)
VALUES (
  'jls_crew_verification_letter',
  'JLS Crew Verification Letter',
  '<p><strong>PLACEHOLDER — Replace this template before go-live.</strong></p>
   <p>This letter is to certify that {{crew_full_name}}, holding the position of
   {{crew_role}}, is a verified crew member aboard {{vessel_name}} ({{vessel_flag}})
   under the management of JLS Yachts LLC.</p>
   <p>Issued on {{letter_date}}.</p>
   <p>{{authorised_signatory}}</p>
   <p>JLS Yachts LLC, Dubai, UAE</p>'
)
ON CONFLICT (template_key) DO NOTHING;

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crew_agency_read_templates ON public.document_templates;
CREATE POLICY crew_agency_read_templates ON public.document_templates FOR SELECT
  USING (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_module_access uma
      JOIN public.modules m ON m.module_id = uma.module_id
      WHERE uma.user_id = (select auth.uid())
        AND m.name = 'crew_immigration' AND uma.active
    )
  );

DROP POLICY IF EXISTS global_admin_manage_templates ON public.document_templates;
CREATE POLICY global_admin_manage_templates ON public.document_templates FOR ALL
  USING (public.has_role((select auth.uid()), 'admin'::public.app_role))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role));
