ALTER TABLE shipsync_delivery_notes
  ADD COLUMN IF NOT EXISTS proximity_notified_at timestamptz;

COMMENT ON COLUMN shipsync_delivery_notes.proximity_notified_at IS
  'Set once the "arriving in ~5 minutes" email has been sent for this note — prevents re-sending on every 5-min cron tick while the van stays in range.';
