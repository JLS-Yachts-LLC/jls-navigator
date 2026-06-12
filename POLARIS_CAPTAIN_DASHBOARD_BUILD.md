# POLARIS_CAPTAIN_DASHBOARD_BUILD.md
# Claude Code Build Instructions — Captain Dashboard
# Tickets: #139, #150–#165
#
# HOW TO USE:
# Read CLAUDE.md → POLARIS_ACCESS_CONTROL.md → POLARIS_CAPTAIN_DASHBOARD.md
# then follow this file phase by phase. Complete each phase fully before
# starting the next. Do not skip phases.
#
# Authors: Mike Fetton / Matt Tighe
# Version: 1.0 — June 2026

---

## PHASE 1 — Database Migrations

Run these in Supabase SQL editor IN ORDER before writing any code.

### Migration 015 — vessel_documents

```sql
create table vessel_documents (
  doc_id          uuid primary key default gen_random_uuid(),
  vessel_id       uuid not null references vessels(vessel_id) on delete cascade,
  doc_type        text not null check (doc_type in (
                    'signed_tariff',
                    'agency_appointment',
                    'port_clearance_inward',
                    'port_clearance_outward',
                    'general_declaration',
                    'other'
                  )),
  title           text not null,
  version_year    int not null,
  port            text,
  valid_from      date,
  valid_to        date,
  status          text not null default 'draft'
                  check (status in ('draft','pending_signature','signed','expired','superseded')),
  file_url        text,
  metadata        jsonb default '{}',
  signed_by_captain   text,
  signed_by_agent     text,
  signed_at       timestamptz,
  uploaded_by     uuid references auth.users(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table vessel_documents enable row level security;

create policy "captain_vessel_docs" on vessel_documents
  for select using (
    vessel_id = (auth.jwt() ->> 'vessel_id')::uuid
  );

create policy "staff_manage_vessel_docs" on vessel_documents
  for all using (
    (auth.jwt() ->> 'role') in ('global_admin', 'jls_staff')
  );
```

### Migration 016 — operations_requests

```sql
create table operations_requests (
  request_id      uuid primary key default gen_random_uuid(),
  vessel_id       uuid not null references vessels(vessel_id) on delete cascade,
  request_type    text not null check (request_type in (
                    'permit', 'gate_pass', 'bunkering', 'port_clearance', 'other'
                  )),
  title           text not null,
  description     text,
  status          text not null default 'draft'
                  check (status in (
                    'draft','submitted','acknowledged','approved',
                    'rejected','completed','cancelled'
                  )),
  priority        text not null default 'normal'
                  check (priority in ('urgent','normal','low')),
  requested_by    uuid references auth.users(id),
  assigned_to     uuid references auth.users(id),
  due_date        date,
  notes           text,
  metadata        jsonb default '{}',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table operations_requests enable row level security;

create policy "captain_ops_select" on operations_requests
  for select using (
    vessel_id = (auth.jwt() ->> 'vessel_id')::uuid
  );

create policy "captain_ops_insert" on operations_requests
  for insert with check (
    vessel_id = (auth.jwt() ->> 'vessel_id')::uuid
    and (auth.jwt() ->> 'role') = 'captain'
  );

create policy "staff_all_ops_requests" on operations_requests
  for all using (
    (auth.jwt() ->> 'role') in ('global_admin', 'jls_staff')
  );
```

**After running migrations:** verify both tables appear in the Supabase
table editor with RLS enabled before proceeding to Phase 2.

---

## PHASE 2 — Types

Create `src/lib/captain/types.ts`:

```ts
export interface VesselDocument {
  doc_id:           string
  vessel_id:        string
  doc_type:         'signed_tariff' | 'agency_appointment' | 'port_clearance_inward'
                  | 'port_clearance_outward' | 'general_declaration' | 'other'
  title:            string
  version_year:     number
  port:             string | null
  valid_from:       string | null
  valid_to:         string | null
  status:           'draft' | 'pending_signature' | 'signed' | 'expired' | 'superseded'
  file_url:         string | null
  metadata:         TariffDocumentData | AppointmentLetterData | Record<string, unknown>
  signed_by_captain: string | null
  signed_by_agent:   string | null
  signed_at:         string | null
  created_at:        string
  updated_at:        string
}

export interface TariffSection {
  title: string
  items: Array<{ service: string; description: string; rate: number; unit: string }>
}

export interface TariffDocumentData {
  currency:   string
  regions:    string[]
  sections:   TariffSection[]
  notes:      string
}

export interface AppointmentLetterData {
  ref:              string
  issued_date:      string
  appointing_party: { name: string; rep: string; title: string }
  agent:            { name: string; location: string; licence: string }
  jurisdictions:    string[]
  services:         string[]
  body_text:        string
}

export interface OperationsRequest {
  request_id:   string
  vessel_id:    string
  request_type: 'permit' | 'gate_pass' | 'bunkering' | 'port_clearance' | 'other'
  title:        string
  description:  string | null
  status:       'draft' | 'submitted' | 'acknowledged' | 'approved' | 'rejected' | 'completed' | 'cancelled'
  priority:     'urgent' | 'normal' | 'low'
  due_date:     string | null
  notes:        string | null
  metadata:     Record<string, unknown>
  created_at:   string
  updated_at:   string
}

export interface CaptainDashboardData {
  vessel:         { vessel_id: string; vessel_name: string; flag_state: string; imo_number: string }
  crew:           VesselCrewMember[]
  visaAlerts:     ComplianceAlertWithCrew[]
  seaportPending: SeaportRequestWithSLA[]
  documents:      VesselDocument[]
  opsRequests:    OperationsRequest[]
}

export interface CaptainAlertItem {
  id:       string
  severity: 'critical' | 'warn' | 'info'
  message:  string
  action:   string | null
  route:    string | null
}
```

---

## PHASE 3 — Alert Utility

Create `src/lib/captain/alerts.ts`:

```ts
import type { CaptainDashboardData, CaptainAlertItem } from './types'

export function getDashboardAlerts(data: CaptainDashboardData): CaptainAlertItem[] {
  const alerts: CaptainAlertItem[] = []
  const today = new Date()

  // Visa alerts — critical first
  for (const a of data.visaAlerts) {
    alerts.push({
      id:       a.alert_id,
      severity: a.severity as 'critical' | 'warn',
      message:  a.message,
      action:   'Contact our Port & Agency Team',
      route:    '/captain/visas',
    })
  }

  // Documents awaiting captain signature
  for (const doc of data.documents) {
    if (doc.status === 'pending_signature') {
      alerts.push({
        id:       doc.doc_id,
        severity: 'warn',
        message:  `${doc.title} requires your signature`,
        action:   'Sign document',
        route:    '/captain/documents',
      })
    }
  }

  // Urgent operations requests
  for (const req of data.opsRequests) {
    if (req.priority === 'urgent' && req.status === 'submitted') {
      alerts.push({
        id:       req.request_id,
        severity: 'warn',
        message:  `${req.title} — awaiting acknowledgement`,
        action:   null,
        route:    `/captain/${req.request_type === 'gate_pass' ? 'gate-passes' : req.request_type + 's'}`,
      })
    }
  }

  // Sort: critical first, then warn, then info
  return alerts.sort((a, b) => {
    const order = { critical: 0, warn: 1, info: 2 }
    return order[a.severity] - order[b.severity]
  })
}
```

---

## PHASE 4 — API Routes

### 4.1 `src/routes/api.captain.dashboard.ts`

```ts
import { createAPIFileRoute } from '@tanstack/react-start/api'
import { createClient } from '@supabase/supabase-js'
import { requireAdminAccess } from '@/lib/admin/access'

// NOTE: use requireAccess(['captain']) when migrations 010-014 are deployed.
// For dev phase, the route validates session only.

export const APIRoute = createAPIFileRoute('/api/captain/dashboard')({
  GET: async ({ request }) => {
    const authHeader = request.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) return new Response('Unauthorized', { status: 401 })

    const sb = createClient(
      import.meta.env.VITE_SUPABASE_URL!,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )

    const { data: { user } } = await sb.auth.getUser()
    if (!user) return new Response('Unauthorized', { status: 401 })

    // Get vessel_id from JWT claims or user metadata
    const vesselId = user.app_metadata?.vessel_id ?? user.user_metadata?.vessel_id
    if (!vesselId) return new Response(JSON.stringify({ error: 'No vessel assigned' }), {
      status: 403, headers: { 'Content-Type': 'application/json' }
    })

    const [
      crewRes,
      visaAlertsRes,
      seaportRes,
      docsRes,
      opsRes,
    ] = await Promise.all([
      sb.from('vessel_crew')
        .select('*, crew_members(*, crew_passports(*))')
        .eq('vessel_id', vesselId)
        .eq('active', true),

      sb.from('compliance_alerts')
        .select('*, crew_members(full_name)')
        .eq('resolved', false)
        .in('severity', ['warn', 'critical'])
        .order('due_date', { ascending: true })
        .limit(5),

      sb.from('seaport_requests')
        .select('*, seaport_sla(*)')
        .eq('vessel_id', vesselId)
        .in('status', ['submitted', 'acknowledged', 'in_progress'])
        .order('created_at', { ascending: true })
        .limit(3),

      sb.from('vessel_documents')
        .select('*')
        .eq('vessel_id', vesselId)
        .order('version_year', { ascending: false }),

      sb.from('operations_requests')
        .select('*')
        .eq('vessel_id', vesselId)
        .not('status', 'in', '("completed","cancelled")')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    return new Response(JSON.stringify({
      vesselId,
      crew:           crewRes.data    ?? [],
      visaAlerts:     visaAlertsRes.data ?? [],
      seaportPending: seaportRes.data ?? [],
      documents:      docsRes.data    ?? [],
      opsRequests:    opsRes.data     ?? [],
    }), { headers: { 'Content-Type': 'application/json' } })
  }
})
```

### 4.2 `src/routes/api.captain.documents.$docId.ts`

```ts
import { createAPIFileRoute } from '@tanstack/react-start/api'
import { createClient } from '@supabase/supabase-js'
import { logAuditEvent } from '@/lib/admin/audit'

export const APIRoute = createAPIFileRoute('/api/captain/documents/$docId')({
  GET: async ({ request, params }) => {
    const authHeader = request.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const sb = createClient(
      import.meta.env.VITE_SUPABASE_URL!,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return new Response('Unauthorized', { status: 401 })

    const { data: doc, error } = await sb
      .from('vessel_documents')
      .select('*')
      .eq('doc_id', params.docId)
      .single()

    if (error || !doc) return new Response('Not found', { status: 404 })

    // Generate 1-hour signed URL
    let signedUrl: string | null = null
    if (doc.file_url) {
      const sbAdmin = createClient(
        import.meta.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      )
      const { data } = await sbAdmin.storage
        .from('vessel-documents')
        .createSignedUrl(doc.file_url, 3600)
      signedUrl = data?.signedUrl ?? null
    }

    // Audit every document view
    await logAuditEvent({
      event_type:   'EXPORT',
      actor_id:     user.id,
      actor_email:  user.email ?? '',
      actor_role:   user.app_metadata?.role ?? 'captain',
      target_type:  'vessel_document',
      target_id:    doc.doc_id,
      target_label: `${doc.title} (${doc.version_year})`,
      detail:       `Captain viewed vessel document: ${doc.title}`,
      ip_address:   request.headers.get('x-forwarded-for'),
      result:       'success',
    })

    return new Response(JSON.stringify({ doc, signedUrl }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
```

### 4.3 `src/routes/api.captain.requests.ts`

```ts
import { createAPIFileRoute } from '@tanstack/react-start/api'
import { createClient } from '@supabase/supabase-js'
import { logAuditEvent } from '@/lib/admin/audit'

export const APIRoute = createAPIFileRoute('/api/captain/requests')({
  POST: async ({ request }) => {
    const authHeader = request.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const sb = createClient(
      import.meta.env.VITE_SUPABASE_URL!,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return new Response('Unauthorized', { status: 401 })

    const vesselId = user.app_metadata?.vessel_id ?? user.user_metadata?.vessel_id
    if (!vesselId) return new Response(JSON.stringify({ error: 'No vessel assigned' }), {
      status: 403, headers: { 'Content-Type': 'application/json' }
    })

    const body = await request.json() as {
      request_type: string
      title:        string
      description?: string
      priority?:    string
      due_date?:    string
      notes?:       string
      metadata?:    Record<string, unknown>
    }

    const ALLOWED_TYPES = ['permit', 'gate_pass', 'bunkering', 'port_clearance', 'other']
    if (!ALLOWED_TYPES.includes(body.request_type)) {
      return new Response(JSON.stringify({ error: 'Invalid request_type' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      })
    }

    const { data, error } = await sb.from('operations_requests').insert({
      vessel_id:    vesselId,
      request_type: body.request_type,
      title:        body.title,
      description:  body.description ?? null,
      priority:     body.priority ?? 'normal',
      due_date:     body.due_date ?? null,
      notes:        body.notes ?? null,
      metadata:     body.metadata ?? {},
      requested_by: user.id,
      status:       'submitted',
    }).select().single()

    if (error) return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })

    await logAuditEvent({
      event_type:   'DATA',
      actor_id:     user.id,
      actor_email:  user.email ?? '',
      actor_role:   user.app_metadata?.role ?? 'captain',
      target_type:  'operations_request',
      target_id:    data.request_id,
      target_label: body.title,
      detail:       `Operations request submitted: ${body.request_type} — ${body.title}`,
      ip_address:   request.headers.get('x-forwarded-for'),
      result:       'success',
    })

    return new Response(JSON.stringify({ request_id: data.request_id, status: 'submitted' }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
```

---

## PHASE 5 — Components

Build in this order. Each component is self-contained and testable.

### 5.1 `src/components/captain/VesselChip.tsx`
Shows vessel name, flag, and LOA in the sidebar. Reads from auth context.
- Vessel name: bold, `#00C4CC`
- Flag emoji + country + dimensions: `#4A7090`, 9px

### 5.2 `src/components/captain/CaptainStatStrip.tsx`
Six stat cards in a row. Takes `data: CaptainDashboardData` as prop.
Derives counts from the data — no additional fetch.
Card colours per `lib/tokens.ts` — see Section 4.4 of POLARIS_CAPTAIN_DASHBOARD.md.

### 5.3 `src/components/captain/AlertsPanel.tsx`
Takes `alerts: CaptainAlertItem[]` from `getDashboardAlerts()`.
Renders nothing if `alerts.length === 0`.
Renders a clean panel with severity icon, message, and optional action link.
Critical alerts: `#E87050` border. Warn: `#E8A020` border.

### 5.4 `src/components/captain/VoyageCard.tsx`
Shows current port → next port route.
Reads from vessel metadata (stub: hardcode to show layout).
ETA and departure time in a cyan info box.

### 5.5 `src/components/captain/DepartureChecklist.tsx`
Reads from `operations_requests` of type `port_clearance` + `seaport_requests`.
Derives checklist items from statuses.
Completed items: green check. Active item: cyan number. Pending: grey.

### 5.6 `src/components/captain/documents/DocumentCard.tsx`
Single document card. Props: `doc: VesselDocument | null`, `docType`, `pendingMessage`.
If `doc === null` → renders "Pending" card with contact CTA.
If `doc.status === 'pending_signature'` → renders amber "Awaiting signature" state.
If `doc.status === 'signed'` → renders green "Signed" state with download button.
Download button calls `/api/captain/documents/:docId` to get signed URL.

### 5.7 `src/components/captain/documents/TariffViewer.tsx`
Renders the tariff rate schedule in-platform from `doc.metadata` JSON.
Sections with cyan section headings.
Line items as a table: service name · description · rate · unit.
Notes footer in italic.
Signature block at bottom — two columns, green verified tick.

### 5.8 `src/components/captain/documents/AppointmentLetterViewer.tsx`
Renders the appointment letter body in-platform from `doc.metadata` JSON.
Letter header: vessel name + issuing date on right.
Subject line: underlined.
Body text: `Inter` font, `#7A9DB8`, 11px.
Signature block: two columns (owner rep + master).
Appointment details panel: jurisdictions, services covered, agent contact.

---

## PHASE 6 — Route Files

Create these route files. Each imports the relevant component and calls
`/api/captain/dashboard` (or the specific API) for its data.

```
src/routes/_app.captain.tsx              # Layout + beforeLoad role check
src/routes/_app.captain.index.tsx        # Home dashboard (stat strip + Leo + voyage + checklist + alerts)
src/routes/_app.captain.crew.tsx         # Crew roster + visa status table
src/routes/_app.captain.visas.tsx        # Visa applications view
src/routes/_app.captain.seaport.tsx      # Seaport sign-on/off requests
src/routes/_app.captain.accounts.tsx     # SOA + invoices + quote approval
src/routes/_app.captain.documents.tsx    # Vessel documents (4 core docs + others)
src/routes/_app.captain.permits.tsx      # Permits expiry + renewal requests
src/routes/_app.captain.gate-passes.tsx  # Gate pass requests
src/routes/_app.captain.bunkering.tsx    # Bunkering requests
src/routes/_app.captain.shipsync.tsx     # ShipSync shipment tracking
src/routes/_app.captain.waypoint.tsx     # Waypoint invoices + quote approval
src/routes/_app.captain.it-support.tsx  # IT tickets + systems status
```

### `_app.captain.tsx` beforeLoad

```ts
beforeLoad: async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw redirect({ to: '/auth' })

  // In dev mode, any authenticated session can access captain dashboard
  if (import.meta.env.DEV) return

  const role = session.user.app_metadata?.role
  if (role !== 'captain') throw redirect({ to: '/dashboard' })
}
```

---

## PHASE 7 — Leo System Prompt Extension

In `src/routes/api.leo.briefing.ts` (or wherever the Leo briefing system
prompt is built), add a captain-specific section when `role === 'captain'`:

```ts
function buildCaptainContext(data: CaptainDashboardData): string {
  const vessel = data.vessel
  const criticalVisas = data.visaAlerts.filter(a => a.severity === 'critical')
  const pendingDocs   = data.documents.filter(d => d.status === 'pending_signature')

  return `
CAPTAIN WORKSPACE CONTEXT:
Vessel: ${vessel.vessel_name} (${vessel.flag_state}, IMO ${vessel.imo_number})
Crew onboard: ${data.crew.length}
Active visa alerts: ${data.visaAlerts.length} (${criticalVisas.length} critical)
Pending seaport requests: ${data.seaportPending.length}
Documents awaiting signature: ${pendingDocs.map(d => d.title).join(', ') || 'none'}
Open operations requests: ${data.opsRequests.filter(r => r.status === 'submitted').length}

CAPTAIN BRIEFING RULES:
- Address as "Captain [surname]" — never first name only
- Lead with the single most time-critical item
- Maximum 3 sentences of prose
- Name the crew member and exact days remaining for any visa alert
- Name the document title for any pending signature
- Never include financial figures in the prose briefing
- Never use exclamation marks
- Refer to the agent always as "our Port & Agency Team"
`
}
```

---

## PHASE 8 — Sidebar Wiring

In `src/components/app-sidebar.tsx`, add the captain navigation section.
Render only when `role === 'captain'` (or in dev mode).

The captain sidebar section follows the structure in Section 4.2 of
`POLARIS_CAPTAIN_DASHBOARD.md`. Use the same nav item pattern as existing
sidebar sections — `sb-item`, `sb-dot`, `sb-badge` class names.

---

## PHASE 9 — Verification Checklist

Do not mark any ticket as done until all relevant checks pass.

**Access control**
- [ ] `/api/captain/*` returns 401 when called without a token
- [ ] `/api/captain/*` returns 403 when called with a non-captain token
- [ ] Captain assigned to vessel A cannot fetch data for vessel B
      (test: call `/api/captain/dashboard` with vessel_A JWT, manually set
       vessel_id=vessel_B in query → should get vessel_A data or 403)

**Vessel documents**
- [ ] Tariff document renders in-platform (not just PDF link)
- [ ] Appointment letter renders in-platform
- [ ] Download generates a signed URL (check it has an expiry in the URL)
- [ ] Download is logged in `audit_log` with `event_type = 'EXPORT'`
- [ ] Missing document shows "Pending" card with CTA — not empty/404
- [ ] `version_year` filter correctly shows current year as active, prior as archived

**Operations requests**
- [ ] POST to `/api/captain/requests` inserts to `operations_requests`
- [ ] Invalid `request_type` returns 400
- [ ] `vessel_id` in inserted row matches JWT claim, not request body
- [ ] Audit log row created for every submitted request

**Leo briefing**
- [ ] Captain briefing includes vessel name
- [ ] Visa alert names the crew member and exact days
- [ ] No financial figures in prose briefing
- [ ] Briefing is under 200 words

**UI**
- [ ] Stat strip counts match data (check with known seed data)
- [ ] Red/amber/green pill colours match `lib/tokens.ts` values
- [ ] No hardcoded hex values in any captain component
- [ ] "Superyacht Middle East" does not appear anywhere in captain-facing UI

---

## PHASE 10 — Seed Data (for dev testing)

After migrations are run, insert test data in Supabase to verify the UI:

```sql
-- Insert a test vessel
insert into vessels (vessel_id, vessel_name, flag_state, imo_number)
values ('00000000-0000-0000-0000-000000000001', 'M/Y Seraphina', 'Cayman Islands', '9801234');

-- Insert a signed tariff document
insert into vessel_documents (
  vessel_id, doc_type, title, version_year, valid_from, valid_to, status,
  signed_by_captain, signed_by_agent, signed_at,
  metadata
) values (
  '00000000-0000-0000-0000-000000000001',
  'signed_tariff',
  'Signed Agency Tariff 2026',
  2026,
  '2026-01-01',
  '2026-12-31',
  'signed',
  'Capt. James Harrison',
  'M. Peeters — JLS Yachts LLC',
  '2026-01-03T09:00:00Z',
  '{
    "currency": "USD",
    "regions": ["UAE", "Oman", "KSA", "Qatar"],
    "sections": [
      {
        "title": "Port Agency",
        "items": [
          {"service": "Port Agency Fee — Standard call", "description": "Includes PA, port authority liaison, documentation", "rate": 2800, "unit": "per call"},
          {"service": "Extended stay", "description": "Per 24h after first 48h", "rate": 350, "unit": "per day"},
          {"service": "Emergency / weekend call-out", "description": "Outside business hours", "rate": 500, "unit": "flat fee"}
        ]
      },
      {
        "title": "Crew Visas & Immigration",
        "items": [
          {"service": "UAE Crew Visa — new application", "description": "Includes govt. fee + service fee", "rate": 420, "unit": "per crew"},
          {"service": "UAE Crew Visa — renewal", "description": "Existing crew, same vessel", "rate": 380, "unit": "per crew"},
          {"service": "Seaport immigration handling", "description": "Sign-on / sign-off per request", "rate": 180, "unit": "per request"}
        ]
      }
    ],
    "notes": "All rates exclusive of UAE VAT (5%). Government fees charged at cost."
  }'
);

-- Insert the agency appointment letter
insert into vessel_documents (
  vessel_id, doc_type, title, version_year, valid_from, valid_to, status,
  signed_by_captain, signed_by_agent, signed_at,
  metadata
) values (
  '00000000-0000-0000-0000-000000000001',
  'agency_appointment',
  'Agency Appointment Letter 2026',
  2026,
  '2026-01-01',
  '2026-12-31',
  'signed',
  'Capt. James Harrison',
  'M. Peeters — JLS Yachts LLC',
  '2026-01-03T09:00:00Z',
  '{
    "ref": "APT-2026-SER-001",
    "issued_date": "2026-01-01",
    "appointing_party": {"name": "Seraphina Maritime Holdings Ltd.", "rep": "C. Whitfield", "title": "Director"},
    "agent": {"name": "JLS Yachts LLC", "location": "Dubai, UAE", "licence": "123456"},
    "jurisdictions": ["UAE", "Oman", "KSA", "Qatar"],
    "services": ["Port clearance & PA", "Crew immigration & visas", "Bunkering coordination", "Provisioning & logistics", "Gate passes & sundries"],
    "body_text": "We, Seraphina Maritime Holdings Ltd., as owners of the above-named vessel, hereby formally appoint JLS Yachts LLC, registered in the United Arab Emirates (Lic. No. 123456), trading as our Port & Agency Team, as the exclusive port agent and agency services provider for the vessel M/Y Seraphina for the duration stated above. This appointment authorises JLS Yachts LLC to act on behalf of the vessel and her owners in all matters relating to port clearance, crew immigration, visa processing, bunkering, provisioning coordination, logistics, and all associated port agency activities within the jurisdictions of the United Arab Emirates, Sultanate of Oman, Kingdom of Saudi Arabia, and State of Qatar. All port authorities, government departments, marinas, and service providers are requested to extend full co-operation to our appointed agents."
  }'
);
```

---

*Polaris Captain Dashboard Build Instructions — Internal · Confidential · v1.0 — June 2026*
*Authors: Mike Fetton / Matt Tighe — JLS Yachts LLC*
