-- ============================================================
-- Polaris — JLS Yacht Training Institute calendar. Manually-entered dated
-- events (classes, exams, holidays, meetings, etc.) — no Monday.com sync,
-- unlike training_instructors/students/courses/classes.
-- ============================================================

CREATE TABLE IF NOT EXISTS training_calendar_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date   DATE NOT NULL,
  title        TEXT NOT NULL,
  time_of_day  TEXT,   -- free-text ("10:00", "All day") — no need for full timestamptz precision
  category     TEXT,   -- Class / Exam / Holiday / Meeting / Other — kept free-text, same convention as training_courses.duration etc.
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_training_calendar_events_updated_at ON training_calendar_events;
CREATE TRIGGER set_training_calendar_events_updated_at
  BEFORE UPDATE ON training_calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE training_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_calendar_events_select" ON training_calendar_events FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "training_calendar_events_insert" ON training_calendar_events FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "training_calendar_events_update" ON training_calendar_events FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "training_calendar_events_delete" ON training_calendar_events FOR DELETE USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_training_calendar_events_date ON training_calendar_events (event_date);
