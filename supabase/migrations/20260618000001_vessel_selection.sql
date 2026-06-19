-- Migration 020: Vessel affiliation on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS primary_vessel_id UUID REFERENCES yachts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vessel_selection_mode VARCHAR(20) NOT NULL DEFAULT 'auto'
    CHECK (vessel_selection_mode IN ('auto', 'dropdown', 'backoffice'));

-- Migration 021: Vessel usage history (intelligent sort order)
CREATE TABLE IF NOT EXISTS vessel_usage_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vessel_id     UUID NOT NULL REFERENCES yachts(id) ON DELETE CASCADE,
  record_type   VARCHAR(50) NOT NULL,
  record_id     UUID,
  used_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vessel_usage_user    ON vessel_usage_history(user_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_vessel_usage_vessel  ON vessel_usage_history(vessel_id);

-- Migration 022: Pinned vessels per user
CREATE TABLE IF NOT EXISTS user_pinned_vessels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vessel_id  UUID NOT NULL REFERENCES yachts(id) ON DELETE CASCADE,
  pinned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, vessel_id)
);

-- Migration 023: Vessel selection audit log (append-only)
CREATE TABLE IF NOT EXISTS vessel_selection_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID,
  user_id         UUID NOT NULL REFERENCES profiles(id),
  record_type     VARCHAR(50) NOT NULL,
  record_id       UUID,
  previous_vessel UUID REFERENCES yachts(id),
  selected_vessel UUID NOT NULL REFERENCES yachts(id),
  selection_mode  VARCHAR(30) NOT NULL
    CHECK (selection_mode IN ('auto_locked', 'auto_suggested', 'manual', 'backoffice_suggested')),
  changed_by      UUID REFERENCES profiles(id),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vsa_record ON vessel_selection_audit(record_id);
CREATE INDEX IF NOT EXISTS idx_vsa_user   ON vessel_selection_audit(user_id, changed_at DESC);

-- RLS
ALTER TABLE vessel_usage_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_pinned_vessels   ENABLE ROW LEVEL SECURITY;
ALTER TABLE vessel_selection_audit ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage history
CREATE POLICY "own_usage_history"
  ON vessel_usage_history FOR SELECT
  USING (auth.uid() = user_id);

-- Users can read and manage their own pinned vessels
CREATE POLICY "own_pinned_vessels_select"
  ON user_pinned_vessels FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "own_pinned_vessels_insert"
  ON user_pinned_vessels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_pinned_vessels_delete"
  ON user_pinned_vessels FOR DELETE
  USING (auth.uid() = user_id);

-- Audit log: users can read their own entries; admins read all (via service role)
CREATE POLICY "own_vessel_audit"
  ON vessel_selection_audit FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = changed_by);
