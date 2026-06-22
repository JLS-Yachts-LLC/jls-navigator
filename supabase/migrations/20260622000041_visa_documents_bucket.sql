-- ============================================================
-- Migration 041 — visa-documents storage bucket + policies   Ticket #170
--
-- Reconciliation notes:
--   * The existing visa wizard uploads to the 'permit-documents' and
--     'crew-documents' buckets (see StepDocumentUpload.tsx, api.visa.supporting-docs).
--     This migration provisions the spec's dedicated private 'visa-documents'
--     bucket and restricts it to crew_immigration users. New uploads can be
--     pointed at this bucket; existing buckets are left untouched.
--   * spec RLS referenced user_module_permissions -> adapted to
--     user_module_access JOIN modules.
-- ============================================================

-- Create the private bucket (idempotent). 10MB limit, image/pdf only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'visa-documents', 'visa-documents', false, 10485760,
  ARRAY['image/jpeg','image/png','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS crew_agency_upload_visa_docs ON storage.objects;
CREATE POLICY crew_agency_upload_visa_docs ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'visa-documents'
    AND (
      public.has_role((select auth.uid()), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.user_module_access uma
        JOIN public.modules m ON m.module_id = uma.module_id
        WHERE uma.user_id = (select auth.uid())
          AND m.name = 'crew_immigration' AND uma.active
      )
    )
  );

DROP POLICY IF EXISTS crew_agency_read_visa_docs ON storage.objects;
CREATE POLICY crew_agency_read_visa_docs ON storage.objects FOR SELECT
  USING (
    bucket_id = 'visa-documents'
    AND (
      public.has_role((select auth.uid()), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.user_module_access uma
        JOIN public.modules m ON m.module_id = uma.module_id
        WHERE uma.user_id = (select auth.uid())
          AND m.name = 'crew_immigration' AND uma.active
      )
    )
  );

DROP POLICY IF EXISTS crew_agency_delete_visa_docs ON storage.objects;
CREATE POLICY crew_agency_delete_visa_docs ON storage.objects FOR DELETE
  USING (
    bucket_id = 'visa-documents'
    AND (
      public.has_role((select auth.uid()), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.user_module_access uma
        JOIN public.modules m ON m.module_id = uma.module_id
        WHERE uma.user_id = (select auth.uid())
          AND m.name = 'crew_immigration' AND uma.active
      )
    )
  );
