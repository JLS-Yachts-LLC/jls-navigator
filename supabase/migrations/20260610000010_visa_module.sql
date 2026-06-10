-- ============================================================
-- Polaris — Visa Module Migration
-- Extends existing crew_members + visa_applications tables;
-- creates new tables per spec v1.0
-- ============================================================

-- ── 1. Extend crew_members ────────────────────────────────
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS full_name        TEXT;
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS date_of_birth    DATE;
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS multiple_passports BOOLEAN DEFAULT false;

-- Back-fill full_name from first_name + last_name
UPDATE crew_members
   SET full_name = TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,''))
 WHERE full_name IS NULL;

-- Keep full_name in sync when first/last name change
CREATE OR REPLACE FUNCTION polaris_sync_crew_full_name()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.full_name := TRIM(COALESCE(NEW.first_name,'') || ' ' || COALESCE(NEW.last_name,''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_full_name ON crew_members;
CREATE TRIGGER trg_crew_full_name
  BEFORE INSERT OR UPDATE OF first_name, last_name ON crew_members
  FOR EACH ROW EXECUTE FUNCTION polaris_sync_crew_full_name();

-- Unique match key (full_name + date_of_birth) — partial so NULLs don't conflict
CREATE UNIQUE INDEX IF NOT EXISTS crew_members_name_dob_idx
  ON crew_members (full_name, date_of_birth)
  WHERE full_name IS NOT NULL AND date_of_birth IS NOT NULL;

-- ── 2. crew_passports ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS crew_passports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id          UUID NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  nationality      TEXT NOT NULL,
  passport_number  TEXT NOT NULL,
  issue_date       DATE NOT NULL,
  expiry_date      DATE NOT NULL,
  issuing_country  TEXT NOT NULL,
  is_primary       BOOLEAN DEFAULT false,
  document_url     TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crew_passports_crew_id_idx ON crew_passports (crew_id);

-- Migrate existing passport data from crew_members
INSERT INTO crew_passports (crew_id, nationality, passport_number,
                            issue_date, expiry_date, issuing_country, is_primary)
SELECT id,
       COALESCE(nationality, 'XX'),
       COALESCE(passport_number, 'UNKNOWN'),
       CURRENT_DATE - INTERVAL '5 years',     -- placeholder: not stored previously
       COALESCE(passport_expiry_date, CURRENT_DATE + INTERVAL '5 years'),
       COALESCE(nationality, 'XX'),
       true
  FROM crew_members
 WHERE passport_number IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM crew_passports cp WHERE cp.crew_id = crew_members.id
   );

-- ── 3. Extend visa_applications ───────────────────────────
ALTER TABLE visa_applications ADD COLUMN IF NOT EXISTS country_code      TEXT DEFAULT 'AE';
ALTER TABLE visa_applications ADD COLUMN IF NOT EXISTS passport_id        UUID REFERENCES crew_passports(id);
ALTER TABLE visa_applications ADD COLUMN IF NOT EXISTS visa_expiry        DATE;
ALTER TABLE visa_applications ADD COLUMN IF NOT EXISTS visa_number        TEXT;
ALTER TABLE visa_applications ADD COLUMN IF NOT EXISTS visa_document_url  TEXT;

-- Normalise status values to match spec CHECK constraint
-- Existing: draft|submitted|in_review|processing|approved|rejected|completed
-- Spec adds: pending_docs, cancelled, expired  (removes: in_review, processing, completed)
-- We keep the column as TEXT — no breaking enum change; add new values only
UPDATE visa_applications SET status = 'pending_docs' WHERE status = 'in_review';
UPDATE visa_applications SET status = 'submitted'    WHERE status = 'processing';
UPDATE visa_applications SET status = 'approved'     WHERE status = 'completed';

-- ── 4. visa_application_fields ────────────────────────────
CREATE TABLE IF NOT EXISTS visa_application_fields (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   UUID NOT NULL REFERENCES visa_applications(id) ON DELETE CASCADE,
  field_key        TEXT NOT NULL,
  field_value      TEXT,
  document_url     TEXT
);

CREATE INDEX IF NOT EXISTS vaf_application_id_idx ON visa_application_fields (application_id);

-- ── 5. compliance_alerts ──────────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id          UUID REFERENCES crew_members(id),
  passport_id      UUID REFERENCES crew_passports(id),
  application_id   UUID REFERENCES visa_applications(id),
  alert_type       TEXT NOT NULL CHECK (alert_type IN (
                     'passport_expiry','visa_expiry',
                     'missing_document','compliance_block'
                   )),
  message          TEXT NOT NULL,
  severity         TEXT NOT NULL CHECK (severity IN ('info','warn','critical')),
  due_date         DATE,
  resolved         BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compliance_alerts_crew_idx ON compliance_alerts (crew_id) WHERE NOT resolved;
CREATE INDEX IF NOT EXISTS compliance_alerts_severity_idx ON compliance_alerts (severity) WHERE NOT resolved;

-- ── 6. offices ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  country_code TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── 7. office_vessel_access ───────────────────────────────
CREATE TABLE IF NOT EXISTS office_vessel_access (
  office_id    UUID REFERENCES offices(id) ON DELETE CASCADE,
  vessel_id    UUID REFERENCES yachts(id)  ON DELETE CASCADE,
  granted_by   UUID REFERENCES auth.users(id),
  granted_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (office_id, vessel_id)
);

-- ── 8. office_members ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS office_members (
  office_id  UUID REFERENCES offices(id)      ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id)   ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('admin','operator','read_only')),
  PRIMARY KEY (office_id, user_id)
);

-- ── 9. Row-Level Security ─────────────────────────────────
ALTER TABLE crew_passports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE visa_application_fields  ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_alerts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE offices                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_vessel_access     ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_members           ENABLE ROW LEVEL SECURITY;

-- crew_passports: visible to authenticated users who can see the crew member
-- (delegated to the crew_members policy chain; simplified for now)
DROP POLICY IF EXISTS "crew_passports_auth" ON crew_passports;
CREATE POLICY "crew_passports_auth" ON crew_passports
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "vaf_auth" ON visa_application_fields;
CREATE POLICY "vaf_auth" ON visa_application_fields
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "compliance_alerts_auth" ON compliance_alerts;
CREATE POLICY "compliance_alerts_auth" ON compliance_alerts
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "offices_auth" ON offices;
CREATE POLICY "offices_auth" ON offices
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "ova_auth" ON office_vessel_access;
CREATE POLICY "ova_auth" ON office_vessel_access
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "om_auth" ON office_members;
CREATE POLICY "om_auth" ON office_members
  FOR ALL USING (auth.role() = 'authenticated');
