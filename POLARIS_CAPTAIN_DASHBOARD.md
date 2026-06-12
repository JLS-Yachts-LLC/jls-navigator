# POLARIS_CAPTAIN_DASHBOARD.md
# Captain's Dashboard — Full Specification
# Ticket: #139 (captain dashboard), #165 (vessel documents: tariff + appointment letter)
#
# Authors: Mike Fetton / Matt Tighe
# Version: 1.0 — June 2026
#
# Drop alongside CLAUDE.md, POLARIS_ACCESS_CONTROL.md, POLARIS_ADMIN_PANEL.md

---

## CRITICAL BUILD ORDER

This dashboard depends on the access control layer from POLARIS_ACCESS_CONTROL.md.

Prerequisites:
- ✅ Migrations 001–005 — core platform tables
- ✅ Migrations 010–014 — access control, roles, audit log
- ✅ `requireAccess()` wired into all API routes
- ✅ `logAuditEvent()` wired into all mutation routes
- ✅ Vessel-scoped RLS on crew, visa, seaport tables

---

## 1. Overview

The captain's dashboard is a vessel-scoped workspace. Everything the captain
sees — crew, visas, accounts, permits, logistics, IT — is filtered to the
single vessel they are assigned to via `user_vessel_access`.

A captain can view and act on vessel data. They cannot see other vessels.
They cannot access financial data for other vessels. They cannot see
platform-wide admin data.

**Access rule:** `requireAccess(request, ['captain'])` on every route.
Vessel scope is derived from `session.user.vessel_id` (JWT claim).

### Route

```
/captain                   → Captain's dashboard home (this spec)
/captain/crew              → Full crew roster + visa status
/captain/visas             → Visa applications for this vessel
/captain/seaport           → Seaport sign-on / sign-off requests
/captain/accounts          → SOA + invoices + quotes
/captain/documents         → Vessel documents (tariff, appointment letter, clearances)
/captain/permits           → Permits expiry tracker + new requests
/captain/gate-passes       → Gate pass requests
/captain/bunkering         → Bunkering requests + history
/captain/shipsync          → ShipSync shipments for this vessel
/captain/waypoint          → Waypoint invoices + quotations
/captain/it-support        → Yacht IT tickets + system status
```

---

## 2. Database Tables Used

### Existing tables (no new migrations needed for MVP)

| Table | Scope filter | What captain reads |
|---|---|---|
| `crew_members` | via `vessel_crew.vessel_id` | All crew linked to vessel |
| `crew_passports` | via crew_id | Passport + expiry per crew |
| `visa_applications` | `vessel_id = captain.vessel_id` | All visa apps for vessel |
| `compliance_alerts` | via crew/application on vessel | Unresolved visa alerts |
| `seaport_requests` | `vessel_id = captain.vessel_id` | Sign-on/off requests |
| `seaport_arrivals` | via request_id | Arrival crew rows |
| `seaport_departures` | via request_id | Departure crew rows |

### New tables — Migration 015

```sql
-- Vessel documents (tariff, appointment letter, clearances)
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
  version_year    int not null,           -- e.g. 2026
  port            text,                  -- for clearances
  valid_from      date,
  valid_to        date,
  status          text not null default 'draft'
                  check (status in ('draft','pending_signature','signed','expired','superseded')),
  file_url        text,                  -- Supabase Storage URL
  signed_by_captain   text,             -- name at time of signing
  signed_by_agent     text,
  signed_at       timestamptz,
  uploaded_by     uuid references auth.users(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table vessel_documents enable row level security;

-- Captain reads documents for their vessel only
create policy "captain_vessel_docs" on vessel_documents
  for select using (
    vessel_id = (auth.jwt() ->> 'vessel_id')::uuid
  );

-- JLS staff can insert / update
create policy "staff_manage_vessel_docs" on vessel_documents
  for all using (
    (auth.jwt() ->> 'role') in ('global_admin', 'jls_staff')
  );
```

### New tables — Migration 016

```sql
-- Operations requests (permits, gate passes, bunkering)
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
                    'draft', 'submitted', 'acknowledged', 'approved',
                    'rejected', 'completed', 'cancelled'
                  )),
  priority        text not null default 'normal'
                  check (priority in ('urgent', 'normal', 'low')),
  requested_by    uuid references auth.users(id),
  assigned_to     uuid references auth.users(id),
  due_date        date,
  notes           text,
  metadata        jsonb default '{}',    -- type-specific fields (quantity, grade, etc.)
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table operations_requests enable row level security;

create policy "captain_ops_requests" on operations_requests
  for select using (
    vessel_id = (auth.jwt() ->> 'vessel_id')::uuid
  );

create policy "captain_insert_ops_requests" on operations_requests
  for insert with check (
    vessel_id = (auth.jwt() ->> 'vessel_id')::uuid
    and (auth.jwt() ->> 'role') = 'captain'
  );

create policy "staff_all_ops_requests" on operations_requests
  for all using (
    (auth.jwt() ->> 'role') in ('global_admin', 'jls_staff')
  );
```

---

## 3. API Routes

All routes under `/api/captain/*`. Every route starts with:
```ts
const session = await requireAccess(request, ['captain'])
if (!session.ok) return session.response
const vesselId = session.user.vessel_id  // from JWT claim
```

### 3.1 Dashboard summary (parallel fetch)

```
GET /api/captain/dashboard
```

Returns everything the home page needs in one call. Run all fetches in
parallel with `Promise.all`. Target: < 400ms.

```ts
const [crew, visaAlerts, seaportPending, soa, documents, shipments, opsRequests, itTickets] =
  await Promise.all([
    sb.from('vessel_crew')
      .select('*, crew_members(*), crew_passports(*)')
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

    // SOA: outstanding invoices — join to finance module when available
    // For now returns from operations_requests with financial metadata
    sb.from('operations_requests')
      .select('*')
      .eq('vessel_id', vesselId)
      .not('metadata->invoice_amount', 'is', null)
      .in('status', ['submitted', 'acknowledged'])
      .order('created_at', { ascending: true }),

    sb.from('vessel_documents')
      .select('*')
      .eq('vessel_id', vesselId)
      .order('version_year', { ascending: false }),

    // ShipSync — when integrated, replace with real table
    // Placeholder: operations_requests of type 'other' with shipping metadata
    sb.from('operations_requests')
      .select('*')
      .eq('vessel_id', vesselId)
      .eq('request_type', 'other')
      .not('metadata->tracking_number', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5),

    sb.from('operations_requests')
      .select('*')
      .eq('vessel_id', vesselId)
      .in('request_type', ['permit', 'gate_pass', 'bunkering'])
      .in('status', ['draft', 'submitted', 'acknowledged'])
      .order('priority', { ascending: true })
      .order('due_date', { ascending: true }),

    // IT support tickets — placeholder until IT module table exists
    sb.from('platform_alerts')
      .select('*')
      .eq('scope', 'vessel')
      .eq('user_target', vesselId)
      .eq('resolved', false)
      .limit(5),
  ])
```

### 3.2 Submit operations request

```
POST /api/captain/requests
```

Body: `{ request_type, title, description, priority, due_date, metadata }`

- Validates `request_type` is in allowed enum
- Inserts to `operations_requests` with `vessel_id` from JWT
- Calls `logAuditEvent({ event_type: 'DATA', detail: 'Operations request submitted: ...' })`
- Returns `{ request_id, status: 'submitted' }`

### 3.3 Vessel documents

```
GET  /api/captain/documents              → all documents for this vessel
GET  /api/captain/documents/:docId       → single document + signed URL for PDF
```

The signed URL is generated server-side via Supabase Storage:
```ts
const { data: signedUrl } = await sb.storage
  .from('vessel-documents')
  .createSignedUrl(doc.file_url, 3600)  // 1 hour expiry
```

Logs `logAuditEvent({ event_type: 'EXPORT', detail: 'Vessel document viewed: ...' })`
every time a signed URL is generated.

---

## 4. Dashboard Layout

### 4.1 Shell

Captain dashboard uses `PolarisShell` (topbar + sidebar + main).
Sidebar shows only modules the captain has access to — no admin section,
no financial management, no platform-wide settings.

```tsx
// src/routes/_app.captain.tsx
// beforeLoad: check role === 'captain', redirect to /dashboard if not
// component: CaptainLayout — renders PolarisShell with captain sidebar config
```

### 4.2 Sidebar nav for captain

```
[ POLARIS logo ]
[ Vessel chip — vessel name + flag + LOA ]

VESSEL OVERVIEW
  Dashboard (home)

CREW & IMMIGRATION
  Crew Onboard
  Visa Applications       [badge: critical count]
  Seaport Sign-on / off

ACCOUNTS
  Statement of Account    [badge: overdue count]
  Vessel Documents

OPERATIONS
  Permits                 [badge: expiring < 30d]
  Gate Passes
  Bunkering

LOGISTICS
  ShipSync
  Waypoint                [badge: pending approval]

SUPPORT
  Yacht IT Support

[ User chip — Captain name · vessel name ]
```

### 4.3 Topbar

```
Left:  "Captain's Dashboard — M/Y [vessel name]"
       "[day date] · [time] [timezone] · [current port or 'At Sea']"

Right: Status pills (dynamic):
       - [In Port — {port}] cyan     if vessel has active clearance
       - [At Sea]           steel    if no active port clearance
       - [N Visa Alerts]    red      if compliance_alerts critical > 0
       - [Action Required]  amber    if operations_requests urgent > 0
```

### 4.4 Stat strip (6 cards)

| Card | Value | Source | Colour |
|---|---|---|---|
| Crew Onboard | count | vessel_crew active | cyan |
| Visa Alerts | count | compliance_alerts critical+warn | red if >0, green if 0 |
| Expiring Permits | count | operations_requests permit expiring <30d | amber if >0 |
| SOA Balance | $ total | operations_requests with invoice_amount | red if >0 |
| Shipments | count in transit | ShipSync / ops_requests shipping | default |
| IT Tickets | count open | platform_alerts / IT table | amber if >0 |

---

## 5. Module Sub-Pages

### 5.1 Crew Onboard (`/captain/crew`)

- Table: all active crew on vessel
- Columns: avatar initials · full name · rank/position · nationality flag · visa status pill · passport expiry · sign-on date · actions
- Visa status pill:
  - `Expires < 7d` → red pill
  - `Expires 7–30d` → amber pill
  - `Visa OK` → green pill
  - `No visa` → red pill
- Row click → crew detail drawer (passport details, visa history, seaport events)
- "+ Sign-on Request" button → opens seaport request form pre-filled for this vessel

### 5.2 Visa Applications (`/captain/visas`)

- Reads: `visa_applications` scoped to `vessel_id`
- Shows: all applications grouped by status
- Captain can VIEW all applications for their vessel
- Captain CANNOT submit new visa applications (that is crew_manager / jls_staff)
- Captain CAN see compliance alerts and the "Contact our Port & Agency Team" CTA
- Displays `ComplianceAlertBanner` for any critical alerts

### 5.3 Seaport Sign-on / Sign-off (`/captain/seaport`)

- Reads: `seaport_requests` scoped to `vessel_id`
- Captain can SUBMIT new sign-on / sign-off requests
- Shows: active requests with SLA timer, completed requests history
- Status flow visible: `draft → submitted → acknowledged → in_progress → completed → report_sent`
- SLA timer shows elapsed time and colour-codes based on SLA breach

### 5.4 Statement of Account (`/captain/accounts`)

- Read-only view of invoices and SOA for this vessel
- Captain can VIEW outstanding invoices and payment history
- Captain can APPROVE quotations (Waypoint purchase orders)
- Captain CANNOT make payments or edit invoices (Finance module)
- Sections:
  - Outstanding invoices (with overdue highlighting)
  - Pending quotations awaiting approval
  - Recent payments
  - Download SOA button → calls `/api/captain/accounts/soa/export` → logs EXPORT audit event

### 5.5 Vessel Documents (`/captain/documents`)

This is a key section — captain must be able to access legal/commercial documents at any time.

Four document types always shown (even if not yet uploaded — shows "Pending" card):

**1. Signed Agency Tariff**
- Current year tariff between vessel/owner and JLS
- Shows: valid period, regions covered, rate schedule broken into sections
- Includes signature block (captain + agent)
- Versioned by year — prior years archived and accessible
- Download button generates a signed Supabase Storage URL

**2. Agency Appointment Letter**
- Formal letter appointing JLS as exclusive port agent
- Shows: appointing party, agent details, jurisdictions, services covered
- Both owner/management and captain signatures
- Versioned by year
- Download button

**3. Port Clearance — Inward**
- Most recent inward clearance for current port
- Status: Active (still in port) or Expired (vessel departed)
- Reference number + clearing authority

**4. Port Clearance — Outward / General Declaration**
- Outward clearance or Gen Dec awaiting signature
- If status is `pending_signature` → shows prominent "Sign Gen Dec" CTA in amber
- This links to eSign module (when built) or shows PDF download for manual signing

Additional documents (uploaded ad hoc by JLS staff):
- ISM certificate, radio licence, MARPOL plan, flag state certificates
- These appear as additional cards below the four core documents

**Document card UI:**
```
┌─ [doc icon with folded corner] ──────────────────────┐
│  [Document title]                                     │
│  Issued: [date]     Valid until: [date]               │
│  Signed by: [names]                                   │
│  [status pill: Signed / Pending / Expired]            │
├───────────────────────────────────────────────────────┤
│  📄 View document →              [Download PDF]       │
└───────────────────────────────────────────────────────┘
```

### 5.6 Permits (`/captain/permits`)

- Reads: `operations_requests` where `request_type = 'permit'`
- Also reads: vessel cert expiry data (when cert table exists — stub for now)
- Table: permit name · issuing authority · expiry date · days remaining · status
- Days remaining colour:
  - < 14 days → red
  - 14–30 days → amber
  - > 30 days → green
- "+ Request Renewal" button → creates `operations_requests` of type `permit`
- Alerts panel: permits expiring in next 30 days

### 5.7 Gate Passes (`/captain/gate-passes`)

- Reads: `operations_requests` where `request_type = 'gate_pass'`
- Captain submits requests for: vehicle access · contractor access · delivery · guest
- Form fields: pass type · visitor name/company · date/time · purpose · notes
- Status flow: `draft → submitted → approved → completed`
- Port authority approves — status updated by JLS staff

### 5.8 Bunkering (`/captain/bunkering`)

- Reads: `operations_requests` where `request_type = 'bunkering'`
- Form fields: grade (MGO/MDO/HFO/LNG) · quantity (MT) · preferred supplier · port · date/time · notes
- Detail card for pending stems: grade · quantity · supplier · estimated cost · confirmation status
- Status: `draft → submitted → confirmed → in_progress → completed`
- "Confirm Stem" action: captain confirms the supplier and quantity before delivery
- History: all past bunkering operations for this vessel

### 5.9 ShipSync (`/captain/shipsync`)

- Read-only view of shipments tagged to this vessel
- Progress bar per shipment (% transit complete, derived from status)
- Statuses: `ordered → dispatched → in_transit → customs → out_for_delivery → delivered`
- Customs status highlighted in amber (may require captain's documentation)
- Links to ShipSync module for full detail (when module is built)

### 5.10 Waypoint (`/captain/waypoint`)

- Reads invoices and quotations tagged to this vessel
- Sections:
  - Pending approval: quotations where `status = 'pending_captain_approval'`
  - "Approve" / "Reject" actions on quotations → `logAuditEvent(DATA, 'Quote approved/rejected')`
  - Outstanding invoices
  - Delivered orders
- Captain can approve or reject purchase orders up to the vessel's approved limit
  (limit stored in vessel metadata — default $5,000 per order)

### 5.11 Yacht IT Support (`/captain/it-support`)

- Two panels:
  1. **Open Tickets** — raise new ticket, view in-progress, view resolved
  2. **Systems Status** — live status of onboard systems (VSAT, CCTV, bridge nav, crew Wi-Fi, PMS)
- New ticket form: system name · severity (critical/high/low) · description · contact preference
- Ticket submitted to IT support team via platform alert + email notification
- Systems status is read from `platform_alerts` with `scope = 'vessel'` until IT module is built

---

## 6. Leo Briefing — Captain Context

When the captain logs in, Leo's briefing is vessel-scoped. The system prompt
extension for captain role:

```
CAPTAIN CONTEXT:
Vessel: {vessel_name} ({flag_state}, {loa}m)
Current location: {port or 'At Sea'}
Crew onboard: {count} of {max_complement}
Next port: {next_port or 'Not set'}
Departure: {departure_date or 'Not scheduled'}

TONE FOR CAPTAIN BRIEFINGS:
- Address as "Captain [surname]" — never first name only
- Direct, operational language — like a first officer handover
- Maximum 3 sentences of prose before bullet items
- Lead with the single most time-critical item
- Never use exclamation marks
- Never mention financial figures in the prose briefing
  (the captain sees the SOA separately — Leo does not summarise money)
- Visa alerts: always name the crew member and exact days remaining
- Seaport alerts: name the vessel and time elapsed, not the request ID
```

---

## 7. Vessel Document Rules

These rules are absolute. Do not work around them.

1. **Tariff is read-only for the captain.** Captain can view and download. Only JLS staff can upload or replace.
2. **Appointment letter is read-only for the captain.** Same rule as tariff.
3. **Both documents are versioned by year.** Prior years must remain accessible (archived, not deleted).
4. **Download generates a time-limited signed URL (1 hour).** Never expose the raw Storage path.
5. **Every document download is audit-logged** with `event_type: 'EXPORT'`, `target_label: doc title + version`.
6. **If a tariff or appointment letter has not been uploaded yet, show a "Pending" card** — never a 404 or empty state.
7. **The "Pending" card shows a contact CTA**: "Contact our Port & Agency Team to request this document."
8. **The tariff rate schedule is displayed in-platform** (not just as a PDF download) — captain should be able to read rates without downloading.
9. **The appointment letter body text is displayed in-platform** — captain should be able to show it to a port authority on screen.
10. **Signed tariff must display both signature blocks** — captain's name + date, agent's name + date — with a visual "verified" indicator if the document was digitally signed.

---

## 8. Tariff Data Model

The tariff is stored as structured data (not just a PDF) so it can be
rendered in-platform. The PDF is generated from this data.

```ts
interface TariffDocument {
  doc_id:       string
  vessel_id:    string
  version_year: number
  valid_from:   string   // ISO date
  valid_to:     string   // ISO date
  currency:     string   // default 'USD'
  regions:      string[] // ['UAE', 'Oman', 'KSA', 'Qatar']
  sections:     TariffSection[]
  signatures:   {
    captain:    { name: string; date: string; verified: boolean }
    agent:      { name: string; date: string; verified: boolean }
  }
  notes:        string
  status:       'draft' | 'pending_signature' | 'signed' | 'expired'
}

interface TariffSection {
  title:    string   // e.g. 'Port Agency', 'Crew Visas & Immigration'
  items:    TariffLineItem[]
}

interface TariffLineItem {
  service:     string   // e.g. 'Port Agency Fee — Standard call'
  description: string   // sub-text detail
  rate:        number
  unit:        string   // 'per call', 'per crew', 'per day', etc.
}
```

Store this in the `metadata` column of `vessel_documents` as JSONB.
The `file_url` column stores the PDF version in Supabase Storage.

---

## 9. Appointment Letter Data Model

```ts
interface AppointmentLetter {
  doc_id:         string
  vessel_id:      string
  version_year:   number
  ref:            string   // e.g. 'APT-2026-SER-001'
  issued_date:    string
  valid_from:     string
  valid_to:       string
  appointing_party: {
    name:    string   // owner company name
    rep:     string   // signatory name
    title:   string
  }
  master: {
    name:  string
    title: string
  }
  agent: {
    name:     string   // 'JLS Yachts LLC'
    location: string   // 'Dubai, UAE'
    licence:  string
  }
  jurisdictions: string[]   // ['UAE', 'Oman', 'KSA', 'Qatar']
  services:      string[]   // list of authorised service types
  signatures: {
    owner_rep: { name: string; date: string; verified: boolean }
    master:    { name: string; date: string; verified: boolean }
  }
  body_text: string   // full letter body (rendered in-platform)
  status:    'draft' | 'pending_signature' | 'signed' | 'expired'
}
```

Stored in the `metadata` column of `vessel_documents` as JSONB.

---

## 10. Open Tickets

| Ticket | Assignee   | Priority | Description |
|--------|------------|----------|-------------|
| #139   | Matt Tighe | HIGH     | Captain dashboard — vessel ops overview with Leo panel |
| #150   | Matt Tighe | HIGH     | Captain crew & visa sub-page |
| #151   | Matt Tighe | HIGH     | Captain seaport sign-on/off sub-page |
| #152   | Matt Tighe | HIGH     | Captain accounts & SOA sub-page (read-only + quote approval) |
| #153   | Matt Tighe | HIGH     | Captain vessel documents sub-page (tariff + appointment letter) |
| #154   | Matt Tighe | HIGH     | Migration 015 — vessel_documents table |
| #155   | Matt Tighe | HIGH     | Migration 016 — operations_requests table |
| #156   | Matt Tighe | MED      | Captain permits sub-page |
| #157   | Matt Tighe | MED      | Captain gate passes sub-page |
| #158   | Matt Tighe | MED      | Captain bunkering sub-page |
| #159   | Matt Tighe | MED      | Captain ShipSync sub-page (read-only) |
| #160   | Matt Tighe | MED      | Captain Waypoint sub-page (view + approve quotes) |
| #161   | Matt Tighe | MED      | Captain Yacht IT sub-page |
| #162   | Matt Tighe | MED      | Leo system prompt extension — captain role context |
| #163   | Matt Tighe | LOW      | Tariff structured data model + in-platform renderer |
| #164   | Matt Tighe | LOW      | Appointment letter in-platform renderer |
| #165   | Matt Tighe | LOW      | Signed tariff + appointment letter document cards in vessel docs |

---

## 11. Key Rules for Claude Code

1. **Every captain route calls `requireAccess(request, ['captain'])`** — no unprotected routes.
2. **Vessel scope is always from JWT** — never trust a vessel_id from the request body.
3. **Documents are read-only for the captain** — no PUT/PATCH/DELETE on vessel_documents via captain routes.
4. **Every document download generates a signed URL** — never expose raw Storage paths.
5. **Every document view is audit-logged** with EXPORT event type.
6. **Tariff and appointment letter are rendered in-platform** — not just PDF links.
7. **"Pending" state for missing documents** — show a card with contact CTA, never an empty state.
8. **SOA is read-only** — captain can view and download but not edit.
9. **Quote approval is the only financial mutation** — approve/reject only, no amount editing.
10. **Leo briefings for captain are vessel-scoped** — never include fleet-wide data.
11. **Never use "Superyacht Middle East" in any captain-facing UI** — always "our Port & Agency Team".
12. **Seaport sign-on/off rule** — UAE visa must be approved before seaport sign-on request can be submitted. The UI enforces this.
13. **All colours from `lib/tokens.ts`** — no hardcoded hex values.

---

*Polaris Captain Dashboard — Internal · Confidential · v1.0 — June 2026*
*Authors: Mike Fetton / Matt Tighe — JLS Yachts LLC*
