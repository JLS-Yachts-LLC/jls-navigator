-- ============================================================
-- Polaris — JLS Yacht Training Institute, mirroring the 4 Monday.com
-- boards the school actually runs on:
--   Instructors        https://jlsyachts.monday.com/boards/5083658513
--   Student_Contacts    https://jlsyachts.monday.com/boards/5083658992
--   Courses             https://jlsyachts.monday.com/boards/5083657645
--   Class                https://jlsyachts.monday.com/boards/5084032924
-- Distinct from training_records/training_certifications (generic
-- crew-cert tracking, unrelated to the school's own instructor/student/
-- course/class roster) — both stay, this adds four new tables.
-- ============================================================

-- ── 1. Instructors ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_instructors (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name               TEXT NOT NULL,
  eid_expiry              DATE,
  passport_expiry         DATE,
  labour_card_expiry      DATE,
  residence_visa_expiry   DATE,
  driving_license_expiry  DATE,
  seamen_card_expiry      DATE,
  class_name              TEXT,   -- linked Class item name(s) — Monday's own "Class" board_relation column
  schedule                TEXT,   -- mirrored Timeline text from the linked Class
  extra                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Students (Student_Contacts) ───────────────────────────
CREATE TABLE IF NOT EXISTS training_students (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           TEXT NOT NULL,
  mobile              TEXT,
  email               TEXT,
  birthday            DATE,
  address             TEXT,
  payment_status      TEXT,   -- Partial / Paid / Pending — Monday's own labels, kept free-text
  payment_amount      NUMERIC,
  class_name          TEXT,
  instructor_name     TEXT,   -- mirrored from the linked Class's Instructor
  schedule            TEXT,   -- mirrored Timeline text from the linked Class
  enrollment_status   TEXT,   -- Cancelled / New Student / Enrolled / Completed
  sequence_number     INT,
  monday_group        TEXT,   -- the Monday group the item sits in ("2025" / "2026" / …) — mirrors, not hardcodes, the school's own year groups
  extra               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Courses ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_courses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  price_aed    NUMERIC,
  duration     TEXT,   -- "1 Day", "2.5 Days", … — Monday's own status labels, kept free-text
  client_type  TEXT,   -- "Adult", "Kids 8 -11", "Min 2 Students", "1:1 Personal Training"
  timings      TEXT,
  extra        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. Classes (the scheduled batches/sessions) ──────────────
CREATE TABLE IF NOT EXISTS training_classes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  instructor_name  TEXT,
  status           TEXT,   -- In Progress / Complete / On Hold / Pending Approval
  course_name      TEXT,
  timeline_start   DATE,
  timeline_end     DATE,
  student_names    TEXT,   -- linked Student_Contacts item name(s), comma-joined
  extra            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 5. updated_at triggers ────────────────────────────────────
-- CREATE OR REPLACE, not a bare reference to 20260626000001's function: that
-- migration defines the same helper but isn't guaranteed to have actually run
-- against every environment, so this stays self-contained rather than
-- silently depending on it.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_training_instructors_updated_at ON training_instructors;
CREATE TRIGGER set_training_instructors_updated_at
  BEFORE UPDATE ON training_instructors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_training_students_updated_at ON training_students;
CREATE TRIGGER set_training_students_updated_at
  BEFORE UPDATE ON training_students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_training_courses_updated_at ON training_courses;
CREATE TRIGGER set_training_courses_updated_at
  BEFORE UPDATE ON training_courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_training_classes_updated_at ON training_classes;
CREATE TRIGGER set_training_classes_updated_at
  BEFORE UPDATE ON training_classes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 6. RLS — authenticated read/write, same posture as training_records/training_certifications ──
ALTER TABLE training_instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_students    ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_courses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_classes     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_instructors_select" ON training_instructors FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "training_instructors_insert" ON training_instructors FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "training_instructors_update" ON training_instructors FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "training_instructors_delete" ON training_instructors FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "training_students_select" ON training_students FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "training_students_insert" ON training_students FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "training_students_update" ON training_students FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "training_students_delete" ON training_students FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "training_courses_select" ON training_courses FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "training_courses_insert" ON training_courses FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "training_courses_update" ON training_courses FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "training_courses_delete" ON training_courses FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "training_classes_select" ON training_classes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "training_classes_insert" ON training_classes FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "training_classes_update" ON training_classes FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "training_classes_delete" ON training_classes FOR DELETE USING (auth.role() = 'authenticated');

-- ── 7. Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_training_instructors_monday_item ON training_instructors ((extra->>'monday_item_id'));
CREATE INDEX IF NOT EXISTS idx_training_students_monday_item    ON training_students    ((extra->>'monday_item_id'));
CREATE INDEX IF NOT EXISTS idx_training_courses_monday_item     ON training_courses     ((extra->>'monday_item_id'));
CREATE INDEX IF NOT EXISTS idx_training_classes_monday_item     ON training_classes     ((extra->>'monday_item_id'));

CREATE INDEX IF NOT EXISTS idx_training_instructors_full_name ON training_instructors (full_name);
CREATE INDEX IF NOT EXISTS idx_training_students_full_name    ON training_students (full_name);
CREATE INDEX IF NOT EXISTS idx_training_students_group        ON training_students (monday_group);
CREATE INDEX IF NOT EXISTS idx_training_classes_status        ON training_classes (status);
