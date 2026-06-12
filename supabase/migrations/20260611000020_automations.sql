-- Automations registry: a home for scheduled/event/webhook automations
-- (Worker crons today; n8n workflows ported to edge functions over time).
CREATE TABLE IF NOT EXISTS automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  trigger_type text NOT NULL DEFAULT 'schedule',   -- schedule | webhook | event | manual
  schedule text,
  cron text,
  source text DEFAULT 'worker-cron',                -- worker-cron | edge-function | n8n
  endpoint text,
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_status text,
  last_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_key text NOT NULL REFERENCES automations(key) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text,
  detail text
);
CREATE INDEX IF NOT EXISTS automation_runs_key_idx ON automation_runs(automation_key, started_at DESC);

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all automations" ON automations FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth all automation_runs" ON automation_runs FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

INSERT INTO automations (key, name, description, category, trigger_type, schedule, cron, source) VALUES
  ('sharepoint-inbound',  'SharePoint → App sync',        'Pulls changes from SharePoint lists into the app (one list per tick, rotating).', 'SharePoint', 'schedule', 'Every 15 minutes', '*/15 * * * *', 'worker-cron'),
  ('sharepoint-pushback', 'App → SharePoint push-back',   'Pushes in-app record edits back out to SharePoint lists.',                         'SharePoint', 'schedule', 'Hourly',           '0 * * * *',    'worker-cron'),
  ('ais-positions',       'AIS vessel positions',         'Collects live vessel positions from AISStream and writes them to yachts.',         'Tracking',   'schedule', '4x/hour',          '5,20,35,50 * * * *', 'worker-cron'),
  ('mygps-fleet',         'myGPS fleet positions',        'Syncs live vehicle positions onto crew vehicles.',                                 'Tracking',   'schedule', 'Every 15 minutes', '*/15 * * * *', 'worker-cron'),
  ('vesselfinder',        'VesselFinder positions',       'Syncs live VesselFinder AIS positions onto yachts.',                                'Tracking',   'schedule', 'Every 15 minutes', '*/15 * * * *', 'worker-cron'),
  ('visa-compliance',     'Visa compliance monitor',      'Daily passport/visa/document compliance checks, raising alerts.',                   'Compliance', 'schedule', 'Daily 07:00 UTC',  '0 7 * * *',    'worker-cron'),
  ('expiry-alerts',       'Permit expiry alerts',         'Emails alerts for permits/documents expiring soon.',                                'Compliance', 'schedule', 'Daily 08:00 UTC',  '0 8 * * *',    'worker-cron'),
  ('visa-excel-writeback','Visa -> Excel write-back',     'Mirrors visa application changes into the SharePoint Excel trackers.',              'Visa',       'event',    'On visa save',     NULL,           'worker-cron')
ON CONFLICT (key) DO NOTHING;
