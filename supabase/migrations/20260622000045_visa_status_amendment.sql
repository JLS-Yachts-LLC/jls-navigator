-- ============================================================
-- Migration 045 — allow 'amendment_required' visa status
--
-- The visa_applications.status CHECK constraint (Lovable-era base table) does
-- not include 'amendment_required', which the back-office workflow needs
-- (in_review -> amendment_required -> in_review). This safely replaces whatever
-- status CHECK exists with the full set. Additive to the allowed values only.
-- ============================================================

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.visa_applications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.visa_applications DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.visa_applications
  ADD CONSTRAINT visa_applications_status_check CHECK (status IN (
    'draft','pending_docs','submitted','in_review',
    'approved','rejected','cancelled','expired','amendment_required'
  ));
