# POLARIS_SEAPORT_IMMIGRATION.md
# Seaport Immigration — Sign On / Sign Off Request Module
# Source: JLS Yachts Weekly Seaport Immigration Request Form
# Drop this file into Claude Code alongside CLAUDE.md, POLARIS_VISA_MODULE.md, POLARIS_VISA_HANDBOOK.md

---

## IMPORTANT — Context

This module digitises the **JLS Yachts Weekly Seaport Immigration Sign On and Sign Off
Request Form**. Vessels submit crew arrival and departure requests through Polaris.
Our Port & Agency Team receives and executes them. The platform tracks the full lifecycle
from submission to completion and sends a final report back to the vessel.

Three things this module must do:
1. **Receive** — vessel submits a structured sign-on/off request via Polaris
2. **Track** — time from submission to execution is monitored (SLA tracking)
3. **Report** — a completion report is sent to the vessel when all crew are processed

---

## 1. Database Schema

### Migration 005 — Seaport immigration requests

```sql
-- One request per vessel per week (covers multiple crew arrivals + departures)
CREATE TABLE seaport_requests (
  request_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id      UUID NOT NULL REFERENCES vessels(vessel_id),
  submitted_by   UUID NOT NULL REFERENCES auth.users(id),
  request_date   DATE NOT NULL,                    -- date the form covers
  status         TEXT NOT NULL DEFAULT 'submitted'
                 CHECK (status IN (
                   'submitted',     -- vessel has sent the form
                   'acknowledged',  -- our team has seen it
                   'in_progress',   -- team is executing
                   'completed',     -- all crew processed
                   'report_sent'    -- completion report sent to vessel
                 )),
  acknowledged_by  UUID REFERENCES auth.users(id),
  acknowledged_at  TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  report_sent_at   TIMESTAMPTZ,
  report_url       TEXT,                           -- Supabase Storage URL of PDF report
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Individual crew rows — arrivals
CREATE TABLE seaport_arrivals (
  arrival_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID NOT NULL REFERENCES seaport_requests(request_id) ON DELETE CASCADE,
  crew_id          UUID REFERENCES crew_members(crew_id),  -- nullable: crew may not yet be in system
  crew_name        TEXT NOT NULL,
  flight_date      DATE,
  flight_time      TEXT,                           -- stored as HH:MM string
  flight_number    TEXT,
  sign_on          BOOLEAN DEFAULT true,           -- YES/NO from form
  pickup_required  BOOLEAN DEFAULT false,          -- YES/NO from form
  pickup_time      TEXT,                           -- requested pickup time HH:MM
  crew_contact     TEXT,                           -- mobile number
  -- Execution tracking
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN (
                     'pending',      -- not yet actioned
                     'in_progress',  -- being processed
                     'completed',    -- sign-on done at seaport
                     'no_show',      -- crew did not arrive
                     'cancelled'     -- removed from request
                   )),
  executed_at      TIMESTAMPTZ,                    -- when sign-on was completed
  executed_by      UUID REFERENCES auth.users(id),
  execution_notes  TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Individual crew rows — departures
CREATE TABLE seaport_departures (
  departure_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID NOT NULL REFERENCES seaport_requests(request_id) ON DELETE CASCADE,
  crew_id          UUID REFERENCES crew_members(crew_id),
  crew_name        TEXT NOT NULL,
  flight_date      DATE,
  flight_time      TEXT,
  flight_number    TEXT,
  sign_off         BOOLEAN DEFAULT true,           -- YES/NO from form
  pickup_required  BOOLEAN DEFAULT false,          -- YES/NO from form
  pickup_time      TEXT,
  crew_contact     TEXT,
  -- Execution tracking
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN (
                     'pending',
                     'in_progress',
                     'completed',
                     'no_show',
                     'cancelled'
                   )),
  executed_at      TIMESTAMPTZ,
  executed_by      UUID REFERENCES auth.users(id),
  execution_notes  TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- SLA tracking — one row per request, updated as events happen
CREATE TABLE seaport_sla (
  sla_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          UUID NOT NULL REFERENCES seaport_requests(request_id),
  submitted_at        TIMESTAMPTZ NOT NULL,
  acknowledged_at     TIMESTAMPTZ,
  first_execution_at  TIMESTAMPTZ,            -- first crew row marked completed
  fully_completed_at  TIMESTAMPTZ,            -- all crew rows completed
  report_sent_at      TIMESTAMPTZ,
  -- Computed durations (minutes)
  mins_to_acknowledge    INTEGER,             -- submitted → acknowledged
  mins_to_first_action   INTEGER,             -- submitted → first execution
  mins_to_completion     INTEGER,             -- submitted → all completed
  mins_to_report         INTEGER,             -- completed → report sent
  sla_breached           BOOLEAN DEFAULT false,
  sla_target_mins        INTEGER DEFAULT 240  -- default 4-hour SLA from submission
);
```

### Row-level security

```sql
ALTER TABLE seaport_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE seaport_arrivals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE seaport_departures ENABLE ROW LEVEL SECURITY;
ALTER TABLE seaport_sla        ENABLE ROW LEVEL SECURITY;

-- Vessels see only their own requests
CREATE POLICY "vessel_own_requests" ON seaport_requests FOR SELECT
  USING (
    vessel_id IN (
      SELECT vc.vessel_id FROM vessel_crew vc
      JOIN office_vessel_access ova ON ova.vessel_id = vc.vessel_id
      JOIN office_members om ON om.office_id = ova.office_id
      WHERE om.user_id = auth.uid()
    )
  );

-- Port & Agency Team (platform_owner role) sees all requests
-- platform_owner bypasses RLS via service role / custom claim
```

---

## 2. File Structure

```
app/
  dashboard/
    visa/
      seaport/
        page.tsx                          # Seaport requests list (vessel view)
        new/
          page.tsx                        # New request form
        [requestId]/
          page.tsx                        # Request detail + live status
          report/
            page.tsx                      # Completion report view

app/
  dashboard/
    operations/
      seaport/
        page.tsx                          # Port & Agency Team queue view (all vessels)
        [requestId]/
          page.tsx                        # Execution view — mark crew completed

app/
  api/
    seaport/
      requests/
        route.ts                          # POST — create new request
      [requestId]/
        acknowledge/
          route.ts                        # POST — team acknowledges receipt
        execute/
          route.ts                        # POST — mark individual crew completed
        complete/
          route.ts                        # POST — mark full request completed
        report/
          route.ts                        # POST — generate and send report

components/
  seaport/
    SeaportRequestForm.tsx                # Main form (arrivals + departures)
    ArrivalRow.tsx                        # Single arrival crew row
    DepartureRow.tsx                      # Single departure crew row
    RequestStatusBadge.tsx                # Status pill with colour
    SLATimer.tsx                          # Live countdown / elapsed time display
    ExecutionQueue.tsx                    # Team view — list of pending crew to process
    CompletionReport.tsx                  # Report component (rendered to PDF)

lib/
  seaport/
    slaTracking.ts                        # SLA compute functions
    reportGenerator.ts                    # Build completion report data
    notifications.ts                      # Alert team on new request; alert vessel on completion
```

---

## 3. Request Form — Field Specification

This exactly mirrors the JLS Weekly Seaport Immigration form.

### Form-level fields

```ts
interface SeaportRequestForm {
  vessel_id:    string;        // pre-filled from current vessel context
  request_date: string;        // ISO date — date the form covers
  notes?:       string;        // any additional instructions
}
```

### Arrival row fields (repeat up to 15 rows)

```ts
interface ArrivalRow {
  crew_name:       string;     // free text — crew member full name
  flight_date:     string;     // ISO date
  flight_time:     string;     // HH:MM
  flight_number:   string;     // e.g. EK204
  sign_on:         boolean;    // YES/NO checkbox
  pickup_required: boolean;    // YES/NO checkbox
  pickup_time:     string;     // HH:MM — only if pickup_required = true
  crew_contact:    string;     // mobile number
}
```

### Departure row fields (repeat up to 15 rows)

```ts
interface DepartureRow {
  crew_name:       string;
  flight_date:     string;
  flight_time:     string;
  flight_number:   string;
  sign_off:        boolean;    // YES/NO checkbox (label changes: Sign OFF not Sign On)
  pickup_required: boolean;
  pickup_time:     string;
  crew_contact:    string;
}
```

### UI behaviour

- Start with 3 empty rows for arrivals and 3 for departures.
- "Add row" button appends a new empty row. Maximum 15 per section.
- Empty rows are stripped before submission — do not submit blank rows.
- `crew_name` is required before a row can be submitted.
- If `sign_on` / `sign_off` = NO, grey out the row but keep it (crew may still need pickup).
- If `pickup_required` = NO, hide the `pickup_time` field for that row.
- `crew_name` should trigger a fuzzy search against `crew_members` — if a match is found,
  show a "Link to profile?" prompt. Linking populates `crew_id` on the DB row.
- The vessel name and date are shown prominently at the top of the form,
  matching the original paper form layout.

---

## 4. Vessel Page Integration

On the vessel detail page (`app/dashboard/vessel/[vesselId]/page.tsx`),
add a **Seaport Immigration** section below the crew list.

```tsx
// Section to add to vessel detail page

<SeaportImmigrationSection vesselId={vesselId} />
```

This section shows:

```
┌─────────────────────────────────────────────────────────┐
│ SEAPORT IMMIGRATION                         [+ New Request] │
├─────────────────────────────────────────────────────────┤
│ This week       2 arrivals · 1 departure    In progress  │
│ Last week       4 arrivals · 3 departures   Completed ✓  │
│ 14 Jun 2026     1 arrival                   Report sent  │
└─────────────────────────────────────────────────────────┘
```

The `[+ New Request]` button navigates to
`/dashboard/visa/seaport/new?vesselId={vesselId}`.

Each row links to the request detail page.

---

## 5. SLA Tracking (`lib/seaport/slaTracking.ts`)

Track four time intervals for every request. Compute and write to `seaport_sla`
whenever a status transition occurs.

```ts
export const SLA_TARGETS = {
  acknowledge_mins:   60,    // team must acknowledge within 1 hour of submission
  first_action_mins:  120,   // first crew row must be actioned within 2 hours
  completion_mins:    240,   // all crew must be processed within 4 hours
  report_mins:        60,    // report must be sent within 1 hour of completion
};

export function computeSLA(sla: SeaportSLA): SLAStatus {
  const now = Date.now();

  return {
    acknowledgeStatus: sla.acknowledged_at
      ? sla.mins_to_acknowledge! <= SLA_TARGETS.acknowledge_mins ? 'met' : 'breached'
      : minsElapsed(sla.submitted_at) > SLA_TARGETS.acknowledge_mins ? 'overdue' : 'pending',

    completionStatus: sla.fully_completed_at
      ? sla.mins_to_completion! <= SLA_TARGETS.completion_mins ? 'met' : 'breached'
      : minsElapsed(sla.submitted_at) > SLA_TARGETS.completion_mins ? 'overdue' : 'pending',

    reportStatus: sla.report_sent_at
      ? sla.mins_to_report! <= SLA_TARGETS.report_mins ? 'met' : 'breached'
      : sla.fully_completed_at && minsElapsed(sla.fully_completed_at) > SLA_TARGETS.report_mins
        ? 'overdue' : 'pending',
  };
}

function minsElapsed(from: string): number {
  return Math.round((Date.now() - new Date(from).getTime()) / 60000);
}

// Call this on every status transition
export async function updateSLA(requestId: string, event: SLAEvent) {
  const sla = await getSLA(requestId);
  const now = new Date().toISOString();

  const updates: Partial<SeaportSLA> = {};

  if (event === 'acknowledged' && !sla.acknowledged_at) {
    updates.acknowledged_at    = now;
    updates.mins_to_acknowledge = minsElapsed(sla.submitted_at);
  }
  if (event === 'first_execution' && !sla.first_execution_at) {
    updates.first_execution_at  = now;
    updates.mins_to_first_action = minsElapsed(sla.submitted_at);
  }
  if (event === 'completed' && !sla.fully_completed_at) {
    updates.fully_completed_at = now;
    updates.mins_to_completion  = minsElapsed(sla.submitted_at);
    updates.sla_breached        = minsElapsed(sla.submitted_at) > SLA_TARGETS.completion_mins;
  }
  if (event === 'report_sent' && !sla.report_sent_at) {
    updates.report_sent_at  = now;
    updates.mins_to_report  = minsElapsed(sla.fully_completed_at!);
  }

  await supabase.from('seaport_sla').update(updates).eq('request_id', requestId);
}
```

### SLATimer component

Display a live elapsed time on every open request. Updates every 30 seconds.

```tsx
// components/seaport/SLATimer.tsx

export function SLATimer({ submittedAt, targetMins, completedAt }: SLATimerProps) {
  const [elapsed, setElapsed] = useState(minsElapsed(submittedAt));

  useEffect(() => {
    if (completedAt) return;
    const interval = setInterval(() =>
      setElapsed(minsElapsed(submittedAt)), 30000);
    return () => clearInterval(interval);
  }, [submittedAt, completedAt]);

  const pct      = Math.min((elapsed / targetMins) * 100, 100);
  const breached = elapsed > targetMins;
  const color    = breached ? '#E87050' : elapsed > targetMins * 0.75 ? '#E8A020' : '#00C4CC';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 3, background: '#0F2030', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%',
                      background: color, borderRadius: 2,
                      transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: 10, color, fontFamily: 'Space Grotesk',
                     fontWeight: 600, whiteSpace: 'nowrap' }}>
        {completedAt
          ? `Done in ${minsElapsed(submittedAt)}m`
          : breached
            ? `${elapsed - targetMins}m overdue`
            : `${targetMins - elapsed}m remaining`}
      </span>
    </div>
  );
}
```

---

## 6. API Routes

### POST `/api/seaport/requests` — Create new request

```ts
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = await req.json();
  const { vessel_id, request_date, arrivals, departures, notes } = body;

  // 1. Create the request
  const { data: request } = await supabase
    .from('seaport_requests')
    .insert({ vessel_id, request_date, submitted_by: user.id, notes })
    .select().single();

  // 2. Insert arrival rows
  if (arrivals?.length) {
    const arrivalRows = arrivals
      .filter((a: ArrivalRow) => a.crew_name.trim())
      .map((a: ArrivalRow) => ({ ...a, request_id: request.request_id }));
    await supabase.from('seaport_arrivals').insert(arrivalRows);
  }

  // 3. Insert departure rows
  if (departures?.length) {
    const departureRows = departures
      .filter((d: DepartureRow) => d.crew_name.trim())
      .map((d: DepartureRow) => ({ ...d, request_id: request.request_id }));
    await supabase.from('seaport_departures').insert(departureRows);
  }

  // 4. Initialise SLA record
  await supabase.from('seaport_sla').insert({
    request_id:     request.request_id,
    submitted_at:   new Date().toISOString(),
    sla_target_mins: 240,
  });

  // 5. Notify Port & Agency Team
  await notifyTeamNewRequest(request.request_id, vessel_id);

  return Response.json({ request_id: request.request_id }, { status: 201 });
}
```

### POST `/api/seaport/[requestId]/acknowledge`

```ts
export async function POST(req: Request, { params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  await supabase.from('seaport_requests').update({
    status:          'acknowledged',
    acknowledged_by: user!.id,
    acknowledged_at: new Date().toISOString(),
  }).eq('request_id', params.requestId);

  await updateSLA(params.requestId, 'acknowledged');

  return Response.json({ ok: true });
}
```

### POST `/api/seaport/[requestId]/execute`

Marks a single crew arrival or departure row as completed.

```ts
export async function POST(req: Request, { params }) {
  const { row_type, row_id, execution_notes } = await req.json();
  // row_type: 'arrival' | 'departure'

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const table = row_type === 'arrival' ? 'seaport_arrivals' : 'seaport_departures';
  const idCol = row_type === 'arrival' ? 'arrival_id'  : 'departure_id';

  await supabase.from(table).update({
    status:          'completed',
    executed_at:     new Date().toISOString(),
    executed_by:     user!.id,
    execution_notes: execution_notes ?? null,
  }).eq(idCol, row_id);

  // Check if this is the first execution on this request
  const sla = await getSLA(params.requestId);
  if (!sla.first_execution_at) {
    await updateSLA(params.requestId, 'first_execution');
    await supabase.from('seaport_requests')
      .update({ status: 'in_progress' })
      .eq('request_id', params.requestId);
  }

  // Check if all rows are now completed — if so, auto-complete the request
  await checkAndCompleteRequest(params.requestId);

  return Response.json({ ok: true });
}
```

### POST `/api/seaport/[requestId]/complete`

Called manually or automatically when all rows are done.

```ts
export async function POST(req: Request, { params }) {
  const supabase = createClient();

  await supabase.from('seaport_requests').update({
    status:       'completed',
    completed_at: new Date().toISOString(),
  }).eq('request_id', params.requestId);

  await updateSLA(params.requestId, 'completed');

  // Notify vessel that all crew are processed
  await notifyVesselRequestComplete(params.requestId);

  return Response.json({ ok: true });
}
```

### POST `/api/seaport/[requestId]/report`

Generates the completion report PDF and sends to vessel.

```ts
export async function POST(req: Request, { params }) {
  const reportData = await buildReportData(params.requestId);
  const pdfBuffer  = await generatePDF(reportData);   // see section 8

  // Upload to Supabase Storage
  const { data: file } = await supabase.storage
    .from('seaport-reports')
    .upload(`${params.requestId}/completion-report.pdf`, pdfBuffer, {
      contentType: 'application/pdf',
    });

  const reportUrl = supabase.storage
    .from('seaport-reports')
    .getPublicUrl(file!.path).data.publicUrl;

  await supabase.from('seaport_requests').update({
    status:         'report_sent',
    report_sent_at: new Date().toISOString(),
    report_url:     reportUrl,
  }).eq('request_id', params.requestId);

  await updateSLA(params.requestId, 'report_sent');
  await sendReportToVessel(params.requestId, reportUrl);

  return Response.json({ report_url: reportUrl });
}
```

---

## 7. Notifications (`lib/seaport/notifications.ts`)

```ts
// New request → notify Port & Agency Team
export async function notifyTeamNewRequest(requestId: string, vesselId: string) {
  const vessel = await getVessel(vesselId);

  await supabase.from('platform_alerts').insert({
    scope:       'role',
    role_target: 'platform_owner',
    message:     `New seaport immigration request from ${vessel.vessel_name} — requires acknowledgement.`,
    severity:    'warn',
    expires_at:  addHours(new Date(), 24).toISOString(),
  });

  // Also write as a task for the Port & Agency Team
  await supabase.from('tasks').insert({
    title:       `Seaport sign-on/off request — ${vessel.vessel_name}`,
    priority:    'high',
    due_date:    new Date().toISOString().split('T')[0],
    company_tag: 'port_agency',
    status:      'open',
  });
}

// Request completed → notify vessel
export async function notifyVesselRequestComplete(requestId: string) {
  const request = await getRequest(requestId);
  const vessel  = await getVessel(request.vessel_id);

  await supabase.from('platform_alerts').insert({
    scope:       'user',
    user_target: request.submitted_by,
    message:     `Seaport immigration completed for ${vessel.vessel_name} — report is ready.`,
    severity:    'info',
    expires_at:  addDays(new Date(), 7).toISOString(),
  });
}
```

---

## 8. Completion Report (`lib/seaport/reportGenerator.ts`)

The report is sent to the vessel when all crew are processed. It mirrors
the original form but shows actual execution times and outcomes.

```ts
export interface SeaportReport {
  reportTitle:   string;         // "Seaport Immigration Completion Report"
  vesselName:    string;
  requestDate:   string;
  generatedAt:   string;
  generatedBy:   string;         // "Our Port & Agency Team"

  arrivals: {
    crewName:       string;
    flightDate:     string;
    flightTime:     string;
    flightNumber:   string;
    signOn:         boolean;
    pickupRequired: boolean;
    pickupTime:     string;
    status:         string;      // 'completed' | 'no_show' | 'cancelled'
    executedAt:     string;      // actual time sign-on was done
    executionNotes: string;
  }[];

  departures: {
    crewName:       string;
    flightDate:     string;
    flightTime:     string;
    flightNumber:   string;
    signOff:        boolean;
    pickupRequired: boolean;
    pickupTime:     string;
    status:         string;
    executedAt:     string;
    executionNotes: string;
  }[];

  sla: {
    submittedAt:       string;
    acknowledgedAt:    string;
    completedAt:       string;
    minsToAcknowledge: number;
    minsToCompletion:  number;
    slaTarget:         number;   // minutes
    slaMet:            boolean;
  };

  summary: string;               // e.g. "4 crew processed. 3 sign-ons, 1 sign-off. All completed within SLA."
}

export async function buildReportData(requestId: string): Promise<SeaportReport> {
  const [request, arrivals, departures, sla] = await Promise.all([
    getRequest(requestId),
    supabase.from('seaport_arrivals').select('*').eq('request_id', requestId),
    supabase.from('seaport_departures').select('*').eq('request_id', requestId),
    getSLA(requestId),
  ]);

  const vessel = await getVessel(request.vessel_id);

  const completedArrivals   = arrivals.data?.filter(a => a.status === 'completed').length ?? 0;
  const completedDepartures = departures.data?.filter(d => d.status === 'completed').length ?? 0;

  return {
    reportTitle:  'Seaport Immigration Completion Report',
    vesselName:   vessel.vessel_name,
    requestDate:  request.request_date,
    generatedAt:  new Date().toISOString(),
    generatedBy:  'Our Port & Agency Team',
    arrivals:     arrivals.data?.map(mapArrival) ?? [],
    departures:   departures.data?.map(mapDeparture) ?? [],
    sla: {
      submittedAt:       sla.submitted_at,
      acknowledgedAt:    sla.acknowledged_at,
      completedAt:       sla.fully_completed_at,
      minsToAcknowledge: sla.mins_to_acknowledge,
      minsToCompletion:  sla.mins_to_completion,
      slaTarget:         sla.sla_target_mins,
      slaMet:            !sla.sla_breached,
    },
    summary: `${completedArrivals + completedDepartures} crew processed. `
           + `${completedArrivals} sign-on${completedArrivals !== 1 ? 's' : ''}, `
           + `${completedDepartures} sign-off${completedDepartures !== 1 ? 's' : ''}. `
           + (!sla.sla_breached ? 'All completed within SLA.' : 'SLA target exceeded.'),
  };
}
```

### Report PDF Layout

The PDF is generated using the `pdf` skill. It contains:

1. **Header** — JLS Yachts logo area, report title, vessel name, date, generated timestamp
2. **Arrivals table** — mirrors original form columns + adds "Status" and "Executed At" columns
3. **Departures table** — same structure
4. **SLA Summary box** — submitted at, acknowledged at, completed at, duration, SLA met/breached
5. **Summary line** — plain English summary of what was done
6. **Footer** — "Generated by Our Port & Agency Team via Polaris"

---

## 9. Port & Agency Team Queue View

This is the operations view for the internal team at
`app/dashboard/operations/seaport/page.tsx`.

It shows all pending requests across all vessels, ordered by submission time
(oldest first — FIFO).

### Queue table columns

| Column | Content |
|--------|---------|
| Vessel | Vessel name + flag |
| Submitted | Relative time + submitter name |
| Arrivals | Count with pending/done indicator |
| Departures | Count with pending/done indicator |
| SLA | Live timer — green/amber/red |
| Status | Status badge |
| Action | "Acknowledge" button if not yet acked; "Execute" button to open detail |

### Execution detail view

At `app/dashboard/operations/seaport/[requestId]/page.tsx`:

- Shows vessel name + request date prominently at top
- Two sections: ARRIVALS and DEPARTURES
- Each crew row shows all fields from the form
- Each row has a "Mark Complete" button and a notes input
- As rows are completed, a green checkmark replaces the button
- Progress bar at top: "3 of 5 crew processed"
- SLATimer visible throughout
- "Mark All Complete" button at bottom (bulk action)
- Once all rows are done, "Generate & Send Report" button appears

---

## 10. Leo Integration

Add seaport request awareness to Leo's briefing context.

### Add to `fetchLeoContext()` in `lib/supabase/queries.ts`

```ts
// Add to the Promise.all in fetchLeoContext:
supabase
  .from('seaport_requests')
  .select('*, vessels(vessel_name), seaport_sla(*)')
  .in('status', ['submitted', 'acknowledged', 'in_progress'])
  .order('created_at', { ascending: true })
  .limit(5),
```

### Add to `assembleContext()` in `lib/leo/assembleContext.ts`

```ts
seaport_pending: (seaportRequests ?? []).map(r => ({
  vessel:      r.vessels?.vessel_name,
  submitted:   relativeTime(r.created_at),
  status:      r.status,
  sla_breached: r.seaport_sla?.[0]?.sla_breached ?? false,
  mins_elapsed: minsElapsed(r.created_at),
})),
```

### Add to Leo system prompt in `buildSystemPrompt()`

```
SEAPORT IMMIGRATION REQUESTS:
If seaport_pending contains items, surface the most time-sensitive one in the briefing.
SLA target is 4 hours from submission. Flag as critical if elapsed > 4 hours without completion.
Example: "M/Y Seraphina submitted a seaport sign-on request 3 hours ago — 5 crew pending, SLA expires in 1 hour."
One seaport item maximum in briefing. Only surface if status is 'submitted' or 'acknowledged' and time is pressing.
```

---

## 11. Key Rules for Claude Code

1. **Vessel submits, team executes** — vessels can create and view requests; only
   `platform_owner` role can acknowledge, execute, and complete.
2. **SLA is tracked automatically** — call `updateSLA()` on every status transition.
   Never skip this call.
3. **Auto-complete the request** when the last crew row is marked done — call
   `checkAndCompleteRequest()` after every `execute` API call.
4. **Report is generated and sent after completion** — do not send the report
   until all rows have a terminal status (`completed`, `no_show`, or `cancelled`).
5. **Empty rows are stripped before submission** — validate `crew_name` is non-empty
   before inserting any arrival or departure row.
6. **Crew name lookup is optional** — matching to `crew_members` is a convenience,
   not a requirement. Requests must work even if crew are not yet in the system.
7. **The form supports up to 15 rows per section** — matching the original paper form.
8. **SLATimer updates every 30 seconds** — not on every render. Use `setInterval`.
9. **The completion report is stored in Supabase Storage** under `seaport-reports/`.
10. **Never show "JLS Yachts" or "Superyacht Middle East" in user-facing copy** —
    always "Our Port & Agency Team".
11. **The vessel page seaport section** links directly to the new request form
    with `vesselId` pre-filled as a query param.
12. **Leo only surfaces seaport items when time-sensitive** — do not include
    completed or report-sent requests in the briefing context.

---

## 12. Status Flow

```
[Vessel submits]
       ↓
  'submitted'  ←── SLA timer starts
       ↓  (team acknowledges)
  'acknowledged'
       ↓  (first crew row marked complete)
  'in_progress'
       ↓  (all crew rows terminal)
  'completed'  ←── report generated
       ↓  (report sent to vessel)
  'report_sent'  ←── SLA timer stops
```

---

## 13. Integration with Existing Modules

| Existing module | Integration point |
|----------------|-------------------|
| `seaport_events` (Migration 004) | When a crew arrival row is marked `completed` with `sign_on = true`, also insert a row into `seaport_events` with `event_type = 'sign_on'` and `completed = true`. Same for departures → `sign_off`. This keeps the visa compliance record in sync. |
| `compliance_alerts` | If a seaport request SLA is breached, write a `compliance_block` alert for the vessel's crew manager. |
| Leo briefing | Pending requests with < 1 hour to SLA surface as critical in Leo's briefing. |
| Vessel detail page | The seaport section on the vessel page shows request history and links to new request form. |
| Tasks | A `tasks` row is created for the Port & Agency Team on each new request (section 7). |

---

*Polaris — Seaport Immigration Module Spec v1.0 — June 2026 — Confidential*
*Source: JLS Yachts Weekly Seaport Immigration Sign On and Sign Off Request Form*
