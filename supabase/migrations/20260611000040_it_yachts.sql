-- Yacht IT Solutions: a separate registry of IT-managed yachts (not all of which
-- live in the main fleet `yachts` table).
CREATE TABLE IF NOT EXISTS it_yachts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vessel_type text,
  flag text,
  imo text,
  owner text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE it_yachts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all it_yachts" ON it_yachts FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
