-- ============================================================
-- Polaris — Training Module
-- POLARIS-TRAINING-001
-- ============================================================

-- ── 1. Training records (course enrolments) ─────────────────
CREATE TABLE IF NOT EXISTS training_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_name       TEXT NOT NULL,
  course          TEXT NOT NULL,
  provider        TEXT,
  status          TEXT NOT NULL DEFAULT 'enrolled'
                  CHECK (status IN ('enrolled', 'in_progress', 'completed', 'failed')),
  start_date      DATE,
  completion_date DATE,
  certificate_no  TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Certifications (with expiry tracking) ────────────────
CREATE TABLE IF NOT EXISTS training_certifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_name    TEXT NOT NULL,
  certificate  TEXT NOT NULL,
  cert_type    TEXT CHECK (cert_type IN ('stcw', 'medical', 'safety', 'flag', 'other')),
  issuing_body TEXT,
  issue_date   DATE,
  expiry_date  DATE,
  status       TEXT NOT NULL DEFAULT 'valid'
               CHECK (status IN ('valid', 'expiring', 'expired')),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Auto-update updated_at ───────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_training_records_updated_at ON training_records;
CREATE TRIGGER set_training_records_updated_at
  BEFORE UPDATE ON training_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_training_certifications_updated_at ON training_certifications;
CREATE TRIGGER set_training_certifications_updated_at
  BEFORE UPDATE ON training_certifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 4. RLS ───────────────────────────────────────────────────
ALTER TABLE training_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_certifications ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all; only staff/admin can insert/update/delete
-- (keep simple for now — tighten with role checks once RBAC is wired in)
CREATE POLICY "training_records_select"
  ON training_records FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "training_records_insert"
  ON training_records FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "training_records_update"
  ON training_records FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "training_records_delete"
  ON training_records FOR DELETE
  USING (auth.role() = 'authenticated');

CREATE POLICY "training_certifications_select"
  ON training_certifications FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "training_certifications_insert"
  ON training_certifications FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "training_certifications_update"
  ON training_certifications FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "training_certifications_delete"
  ON training_certifications FOR DELETE
  USING (auth.role() = 'authenticated');

-- ── 5. Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_training_records_crew_name
  ON training_records (crew_name);
CREATE INDEX IF NOT EXISTS idx_training_records_status
  ON training_records (status);

CREATE INDEX IF NOT EXISTS idx_training_certifications_crew_name
  ON training_certifications (crew_name);
CREATE INDEX IF NOT EXISTS idx_training_certifications_expiry
  ON training_certifications (expiry_date ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_training_certifications_status
  ON training_certifications (status);
