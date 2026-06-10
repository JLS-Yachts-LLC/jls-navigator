# CLAUDE.md — Polaris / Leo Platform
> Claude Code reads this file automatically. Follow every instruction here precisely.
> Last updated: June 2026 — v1.5 (added Platform UX, Login & Ecosystem spec)

---

## 1. What We Are Building

**Polaris** is the operating system behind yacht operations.
**Leo** is the AI intelligence engine embedded inside Polaris.

Polaris is a multi-stakeholder, multi-vessel, multi-location platform. Every user
lands on a dashboard built specifically for who they are, which vessel or organisation
they are connected to, and which modules they are approved to access.

On every login, Leo immediately delivers a personalised, workspace-aware briefing.
Leo speaks first. The user does not need to ask anything.

**Platform scale:** 350+ yachts · 11+ locations · 2,500+ crew · 10 connected stakeholder types

**Operational modules:**
- **Leo** — AI briefing engine, Lean/6 Sigma signals, compliance and visa alerts
- **Crew & Immigration** — visa management across UAE, Oman, Maldives, KSA, Qatar, Bahrain, Egypt
- **Seaport Immigration** — sign-on/off request workflow with SLA tracking and reports
- **ORBIT** — operations & small boat management
- **ShipSync** — ship spares, logistics, customs, storage
- **Waypoint** — chandlery & procurement
- **Superyacht Provisioning** — provisions, interiors, events, special orders
- **JLS Yacht Training Institute** — training, certification, development
- **Crew Placement** — placements, daywork, crew solutions
- **Finance** — invoices, SOA, payments, QuickBooks integration
- **Transport & Fleet** — vessel deliveries, logistics
- **Compass Card** — crew benefit card
- **Yacht IT Solutions** — IT support, cyber security, connectivity
- **Agency (Superyacht Middle East)** — port calls, clearances, berthing, fuel, local support

All operational knowledge comes from **our Port & Agency Team**. Never use the company
trading name in user-facing UI — always "our Port & Agency Team".

Stack: **React · Supabase · Anthropic API (claude-sonnet-4-20250514)**

Companion spec files — drop all alongside this file in the project root:
- `POLARIS_ACCESS_CONTROL.md` — **READ FIRST** — identity, permissions, routing, audit layer
- `POLARIS_PLATFORM_UX.md` — login experience, landing pages, workspace routing, ecosystem map
- `POLARIS_VISA_MODULE.md` — visa module architecture, schema, 7-country config, logic
- `POLARIS_VISA_HANDBOOK.md` — UAE operational detail, process flows, handbook link
- `POLARIS_SEAPORT_IMMIGRATION.md` — seaport sign-on/off request form, SLA tracking, reports

---

## 2. Project Structure

```
/
├── app/
│   ├── api/
│   │   ├── leo/
│   │   │   └── briefing/
│   │   │       └── route.ts              # Anthropic streaming endpoint
│   │   └── visa/
│   │       ├── compliance/
│   │       │   └── route.ts              # POST — compliance check for an application
│   │       └── monitor/
│   │           └── route.ts              # POST — daily cron: compliance monitoring
│   ├── dashboard/
│   │   ├── page.tsx                      # Main dashboard (post-login)
│   │   └── visa/
│   │       ├── page.tsx                  # Visa dashboard — applications + alerts
│   │       ├── new/
│   │       │   └── page.tsx              # New application wizard entry point
│   │       ├── crew/
│   │       │   └── [crewId]/
│   │       │       └── page.tsx          # Crew profile + passports + application history
│   │       ├── info/
│   │       │   └── [countryCode]/
│   │       │       └── page.tsx          # Country visa info page (handbook link lives here)
│   │       └── offices/
│   │           └── page.tsx              # Admin: offices + vessel access
│   ├── portal/
│   │   ├── crew/
│   │   │   └── page.tsx              # Crew member portal
│   │   ├── owner/
│   │   │   └── page.tsx              # Owner / family office portal
│   │   ├── supplier/
│   │   │   └── page.tsx              # Supplier portal
│   │   ├── training/
│   │   │   └── page.tsx              # Training Institute portal
│   │   ├── crew-placement/
│   │   │   └── page.tsx              # Crew placement portal
│   │   ├── finance/
│   │   │   └── page.tsx              # Finance portal
│   │   ├── agency/
│   │   │   └── page.tsx              # Agency portal
│   │   ├── shipsync/
│   │   │   └── page.tsx              # ShipSync logistics portal
│   │   ├── waypoint/
│   │   │   └── page.tsx              # Waypoint chandlery portal
│   │   ├── provisioning/
│   │   │   └── page.tsx              # Provisioning portal
│   │   ├── transport/
│   │   │   └── page.tsx              # Transport & fleet portal
│   │   ├── compass-card/
│   │   │   └── page.tsx              # Compass Card portal
│   │   └── yacht-it/
│   │       └── page.tsx              # Yacht IT portal
│   ├── auth/
│   │   ├── login/
│   │   │   └── page.tsx              # Login page
│   │   └── mfa-setup/
│   │       └── page.tsx              # MFA enrolment (mandatory before access)
│   └── layout.tsx
├── middleware.ts                     # Auth + access check on every request
├── components/
│   ├── auth/
│   │   ├── LoginBrandPanel.tsx           # Login left panel — branding + security badges
│   │   ├── LoginForm.tsx                 # Login form — email, password, SSO
│   │   └── WorkspaceSelector.tsx         # Post-auth workspace chooser
│   ├── ui/
│   │   ├── PolarisShell.tsx              # Persistent shell — topbar + sidebar + main
│   │   ├── Sidebar.tsx                   # Module nav — filtered by user access
│   │   └── MetricCard.tsx                # Reusable metric tile for dashboards
│   ├── leo/
│   │   ├── LeoPanel.tsx                  # Streaming briefing panel
│   │   ├── InsightCards.tsx              # 3 post-briefing insight cards
│   │   └── LeoIcon.tsx                   # Geometric lion SVG mark
│   ├── dashboard/
│   │   ├── TaskPanel.tsx                 # Open tasks for current user
│   │   ├── DevChangelog.tsx              # Recent dev activity feed
│   │   └── UserContextSwitcher.tsx       # Dev/demo mode only
│   ├── visa/
│   │   ├── NewApplicationWizard.tsx      # 7-step application wizard
│   │   ├── StepCountrySelect.tsx         # Step 1 — country (default: UAE)
│   │   ├── StepCrewSearch.tsx            # Step 2 — find/create crew (match Name+DOB)
│   │   ├── StepPassportSelect.tsx        # Step 3 — choose passport for this application
│   │   ├── StepCountryFields.tsx         # Step 4 — dynamic fields from countryConfig
│   │   ├── StepDocumentUpload.tsx        # Step 5 — upload required documents
│   │   ├── StepComplianceCheck.tsx       # Step 6 — compliance gate before submit
│   │   ├── StepReviewSubmit.tsx          # Step 7 — review and submit
│   │   ├── VesselBanner.tsx              # Vessel identification strip (top of application)
│   │   ├── CrewProfileCard.tsx           # Reusable crew summary card
│   │   ├── PassportBadge.tsx             # Nationality flag + expiry display
│   │   ├── ComplianceAlertBanner.tsx     # Alert display with severity styling
│   │   ├── MultiPassportForm.tsx         # Add/edit multiple passports
│   │   └── HandbookLink.tsx              # Link to Port & Agency Team handbook
│   ├── seaport/
│   │   ├── SeaportRequestForm.tsx        # Main form — arrivals + departures sections
│   │   ├── ArrivalRow.tsx                # Single arrival crew row
│   │   ├── DepartureRow.tsx              # Single departure crew row
│   │   ├── RequestStatusBadge.tsx        # Status pill with colour coding
│   │   ├── SLATimer.tsx                  # Live elapsed/remaining time display
│   │   ├── ExecutionQueue.tsx            # Team queue view
│   │   └── CompletionReport.tsx          # Report component
│   └── ui/
│       └── TopBar.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── queries.ts                    # All data fetching functions
│   ├── leo/
│   │   ├── assembleContext.ts            # Builds JSON payload for Leo
│   │   └── computeMetrics.ts            # Lean / 6 Sigma calculations
│   ├── visa/
│   │   ├── countryConfig.ts             # COUNTRY_CONFIGS for all 7 countries
│   │   ├── crewMatching.ts              # findOrPromptCrewMatch (Name + DOB)
│   │   ├── complianceChecks.ts          # runComplianceChecks per country
│   │   ├── complianceMonitor.ts         # runDailyComplianceChecks (cron)
│   │   ├── uaeProcess.ts               # UAE 10-step process flow data
│   │   ├── uaeCompliance.ts            # UAE-specific compliance rules
│   │   ├── services.ts                 # Visa service catalogue
│   │   ├── helpText.ts                 # Contextual help strings (tooltips)
│   │   ├── contacts.ts                 # Port & Agency Team contact details
│   │   └── companyContext.ts           # Internal team context for Leo
│   ├── auth/
│   │   ├── mfa.ts                    # MFA enforcement
│   │   ├── routing.ts                # getLandingPath() per role
│   │   ├── access.ts                 # requireAccess() — all routes must call this
│   │   ├── audit.ts                  # logAuditEvent()
│   │   ├── branding.ts               # getPageBranding() per org/location
│   │   └── claims.ts                 # JWT custom claims management
│   ├── seaport/
│   │   ├── slaTracking.ts              # SLA compute + updateSLA()
│   │   ├── reportGenerator.ts          # Build completion report data
│   │   └── notifications.ts            # Notify team on new; notify vessel on complete
│   ├── platform/
│   │   └── ecosystem.ts                # POLARIS_MODULES + CONNECTED_STAKEHOLDERS
│   └── types.ts                        # Shared TypeScript types
├── schema/
│   └── migrations/
│       ├── 001_core.sql                 # user_profiles, tasks, changelog, alerts
│       ├── 002_visa_core.sql            # crew_members, passports, vessels, applications
│       ├── 003_visa_offices.sql         # offices, office_vessel_access, office_members
│       ├── 004_seaport_events.sql       # UAE visa seaport compliance events
│       └── 005_seaport_requests.sql     # Immigration request form, SLA, arrivals/departures
├── POLARIS_ACCESS_CONTROL.md           # Identity & access control spec — READ FIRST
├── POLARIS_PLATFORM_UX.md             # Login, landing pages, ecosystem — READ SECOND
├── POLARIS_SEAPORT_IMMIGRATION.md      # Seaport immigration module spec
├── CLAUDE.md                           # This file
├── POLARIS_VISA_MODULE.md              # Visa module full spec
├── POLARIS_VISA_HANDBOOK.md            # UAE handbook integration spec
└── .env.local                          # API keys — server only, never commit
```

---

## 3. Brand & Design Tokens

Always use these exact values. Never substitute.

```ts
// lib/tokens.ts
export const COLORS = {
  // Backgrounds
  void:      '#080D14',   // page background
  abyss:     '#0D1520',   // panel background
  deep:      '#0F2030',   // borders
  ocean:     '#1E4060',   // table headers, muted fills

  // Polaris accent
  signal:    '#00C4CC',   // primary interactive, Polaris highlights
  signalMid: '#00838A',   // secondary signal uses

  // Leo accent
  leoAmber:  '#E8A020',   // Leo UI, AI-origin content
  warn:      '#E87020',   // warnings, high priority
  error:     '#E87050',   // errors, rejected states

  // Status
  success:   '#4CAF80',   // approved, complete
  info:      '#7A9DB8',   // informational

  // Text
  frost:     '#E8EDF5',   // primary text
  muted:     '#4A7090',   // body text
  steel:     '#3A5570',   // labels, secondary text
} as const;

export const FONTS = {
  display: 'Space Grotesk',   // all headings, brand, labels, UI
  body:    'Inter',            // body copy, Leo briefing stream text only
  mono:    'Courier New',      // code references only
} as const;
```

**Typography rules:**
- `Space Grotesk` everywhere except Leo's streaming briefing text (use `Inter` there)
- No serif typefaces — ever
- Labels: 9–10px, uppercase, `letter-spacing: 0.18–0.22em`, `font-weight: 600`
- Body / stream: 13px, `line-height: 1.75`, `color: #C8D8E8`

**Priority dot colours (tasks):**
- High → `#E87050` (red-orange)
- Medium → `#E8A020` (Leo amber)
- Low → `#00C4CC` (signal cyan)

**Dev changelog badge colours:**
- `FEAT` → cyan (`#00C4CC`)
- `FIX` → amber (`#E8A020`)
- `PERF` → purple (`#9A70E8`)

**Visa compliance severity colours:**
- Critical (blocks submit) → `#E87050` on `#1A0A08` background
- Warn (acknowledge only) → `#E8A020` on `#1A1200` background
- Pass → `#4CAF80` on `#0A1F0A` background

---

## 4. Supabase Schema

Run migrations in order: 001 → 002 → 003 → 004.

### Migration 001 — Core platform tables

```sql
create table user_profiles (
  user_id        uuid primary key references auth.users(id),
  display_name   text not null,
  role           text not null check (role in (
                   'platform_owner','developer','captain',
                   'crew_manager','technical_mgr')),
  avatar_url     text,
  last_login     timestamptz,
  timezone       text default 'Asia/Dubai'
);

create table last_sessions (
  user_id         uuid primary key references user_profiles(user_id),
  session_summary text,
  last_active_at  timestamptz,
  key_actions     jsonb default '[]'
);

create table tasks (
  task_id      uuid primary key default gen_random_uuid(),
  assigned_to  uuid references user_profiles(user_id),
  title        text not null,
  priority     text not null check (priority in ('high','med','low')),
  due_date     date,
  status       text not null default 'open'
               check (status in ('open','in_progress','done','blocked')),
  company_tag  text,
  created_at   timestamptz default now()
);

create table dev_changelog (
  change_id   uuid primary key default gen_random_uuid(),
  author_id   uuid references user_profiles(user_id),
  author_name text not null,
  type        text not null check (type in ('feat','fix','perf')),
  description text not null,
  ticket_ref  text,
  created_at  timestamptz default now()
);

create table platform_alerts (
  alert_id     uuid primary key default gen_random_uuid(),
  scope        text not null check (scope in ('global','role','user')),
  role_target  text,
  user_target  uuid references user_profiles(user_id),
  message      text not null,
  severity     text not null check (severity in ('info','warn','critical')),
  created_at   timestamptz default now(),
  expires_at   timestamptz
);

create table process_metrics (
  metric_id                  uuid primary key default gen_random_uuid(),
  user_id                    uuid references user_profiles(user_id),
  wip_aging_days             numeric,
  tasks_on_schedule_pct      numeric,
  deploy_defect_rate         numeric,
  ticket_turnaround_avg_days numeric,
  open_task_count            int,
  computed_at                timestamptz default now()
);
```

### Migration 002 — Visa core tables

```sql
create table crew_members (
  crew_id            uuid primary key default gen_random_uuid(),
  full_name          text not null,
  date_of_birth      date not null,
  email              text,
  phone              text,
  position           text,
  multiple_passports boolean default false,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  constraint crew_unique unique (full_name, date_of_birth)
);

create table crew_passports (
  passport_id      uuid primary key default gen_random_uuid(),
  crew_id          uuid not null references crew_members(crew_id) on delete cascade,
  nationality      text not null,
  passport_number  text not null,
  issue_date       date not null,
  expiry_date      date not null,
  issuing_country  text not null,
  is_primary       boolean default false,
  document_url     text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create table vessels (
  vessel_id    uuid primary key default gen_random_uuid(),
  vessel_name  text not null,
  flag_state   text,
  imo_number   text,
  created_at   timestamptz default now()
);

create table vessel_crew (
  vessel_id  uuid references vessels(vessel_id) on delete cascade,
  crew_id    uuid references crew_members(crew_id) on delete cascade,
  role       text,
  joined_at  date,
  active     boolean default true,
  primary key (vessel_id, crew_id)
);

create table visa_applications (
  application_id    uuid primary key default gen_random_uuid(),
  crew_id           uuid not null references crew_members(crew_id),
  vessel_id         uuid references vessels(vessel_id),
  country_code      text not null,
  passport_id       uuid not null references crew_passports(passport_id),
  status            text not null default 'draft'
                    check (status in (
                      'draft','pending_docs','submitted','in_review',
                      'approved','rejected','cancelled','expired'
                    )),
  applied_at        timestamptz,
  approved_at       timestamptz,
  visa_expiry       date,
  visa_number       text,
  visa_document_url text,
  notes             text,
  submitted_by      uuid references auth.users(id),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table visa_application_fields (
  field_id       uuid primary key default gen_random_uuid(),
  application_id uuid not null references visa_applications(application_id) on delete cascade,
  field_key      text not null,
  field_value    text,
  document_url   text
);

create table compliance_alerts (
  alert_id       uuid primary key default gen_random_uuid(),
  crew_id        uuid references crew_members(crew_id),
  passport_id    uuid references crew_passports(passport_id),
  application_id uuid references visa_applications(application_id),
  alert_type     text not null check (alert_type in (
                   'passport_expiry','visa_expiry',
                   'missing_document','compliance_block'
                 )),
  message        text not null,
  severity       text not null check (severity in ('info','warn','critical')),
  due_date       date,
  resolved       boolean default false,
  created_at     timestamptz default now()
);
```

### Migration 003 — Satellite office access

```sql
create table offices (
  office_id    uuid primary key default gen_random_uuid(),
  name         text not null,
  country_code text,
  created_at   timestamptz default now()
);

create table office_vessel_access (
  office_id  uuid references offices(office_id) on delete cascade,
  vessel_id  uuid references vessels(vessel_id) on delete cascade,
  granted_by uuid references auth.users(id),
  granted_at timestamptz default now(),
  primary key (office_id, vessel_id)
);

create table office_members (
  office_id uuid references offices(office_id) on delete cascade,
  user_id   uuid references auth.users(id) on delete cascade,
  role      text not null check (role in ('admin','operator','read_only')),
  primary key (office_id, user_id)
);
```

### Migration 004 — UAE seaport events (visa compliance)

```sql
create table seaport_events (
  event_id       uuid primary key default gen_random_uuid(),
  crew_id        uuid not null references crew_members(crew_id),
  vessel_id      uuid references vessels(vessel_id),
  application_id uuid references visa_applications(application_id),
  event_type     text not null check (event_type in ('sign_on','sign_off')),
  port           text,
  event_date     date,
  completed      boolean default false,
  notes          text,
  created_at     timestamptz default now()
);
```

### Migration 005 — Seaport immigration requests

Full schema in `POLARIS_SEAPORT_IMMIGRATION.md` section 1. Summary:

```sql
-- seaport_requests  — one request per vessel per week, tracks lifecycle status
-- seaport_arrivals  — individual crew arrival rows (up to 15 per request)
-- seaport_departures — individual crew departure rows (up to 15 per request)
-- seaport_sla       — SLA timing: submitted → acknowledged → completed → report sent
-- Enable RLS on all four tables (see POLARIS_SEAPORT_IMMIGRATION.md for policies)
```

### Migrations 010–014 — Access Control & Identity (POLARIS_ACCESS_CONTROL.md)

Full schema in `POLARIS_ACCESS_CONTROL.md` section 3. Summary:

```sql
-- 010: organisations, locations
-- 011: roles (seeded), modules (seeded)
-- 012: user_profiles v2 (expanded with role_id, org_id, mfa_enabled),
--       user_vessel_access, user_module_access, user_location_access
-- 013: permission_rules (fine-grained per-user overrides)
-- 014: audit_log (all platform activity — indexed for performance)
-- Run AFTER 001–005. Migration 012 ALTERs user_profiles from 001.
```

### Row-level security — enable on all tables

```sql
alter table user_profiles         enable row level security;
alter table last_sessions          enable row level security;
alter table tasks                  enable row level security;
alter table dev_changelog          enable row level security;
alter table platform_alerts        enable row level security;
alter table process_metrics        enable row level security;
alter table crew_members           enable row level security;
alter table crew_passports         enable row level security;
alter table visa_applications      enable row level security;
alter table visa_application_fields enable row level security;
alter table compliance_alerts      enable row level security;
alter table office_vessel_access   enable row level security;
alter table seaport_events         enable row level security;

-- Core platform
create policy "own profile"   on user_profiles  for select using (auth.uid() = user_id);
create policy "own sessions"  on last_sessions   for select using (auth.uid() = user_id);
create policy "own tasks"     on tasks           for select using (auth.uid() = assigned_to);
create policy "own metrics"   on process_metrics for select using (auth.uid() = user_id);
create policy "all changelog" on dev_changelog   for select using (auth.role() = 'authenticated');
create policy "alerts"        on platform_alerts for select using (
  scope = 'global' or (scope = 'user' and user_target = auth.uid())
);

-- Visa: crew access scoped to office vessel assignments
create policy "crew_access" on crew_members for select using (
  exists (
    select 1 from vessel_crew vc
    join office_vessel_access ova on ova.vessel_id = vc.vessel_id
    join office_members om on om.office_id = ova.office_id
    where vc.crew_id = crew_members.crew_id
      and om.user_id = auth.uid()
  )
);
-- platform_owner bypasses RLS via Supabase custom claims / service role
```

---

## 5. Data Fetching (`lib/supabase/queries.ts`)

Fetch all Leo context in parallel on login. Target: **< 300ms total**.

```ts
export async function fetchLeoContext(userId: string) {
  const [profile, session, tasks, changelog, alerts, visaAlerts] =
    await Promise.all([
      supabase.from('user_profiles').select('*').eq('user_id', userId).single(),
      supabase.from('last_sessions').select('*').eq('user_id', userId).single(),
      supabase.from('tasks')
        .select('*').eq('assigned_to', userId).eq('status', 'open')
        .order('priority', { ascending: false })
        .order('due_date',  { ascending: true }),
      supabase.from('dev_changelog')
        .select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('platform_alerts')
        .select('*').or(`scope.eq.global,user_target.eq.${userId}`)
        .gt('expires_at', new Date().toISOString()),
      supabase.from('compliance_alerts')
        .select('*, crew_members(full_name), crew_passports(passport_number,expiry_date)')
        .eq('resolved', false)
        .in('severity', ['warn','critical'])
        .order('due_date', { ascending: true })
        .limit(5),
      supabase.from('seaport_requests')
        .select('*, vessels(vessel_name), seaport_sla(*)')
        .in('status', ['submitted','acknowledged','in_progress'])
        .order('created_at', { ascending: true })
        .limit(5),
    ]);

  return { profile, session, tasks, changelog, alerts, visaAlerts, seaportRequests };
}
```

---

## 6. Lean & 6 Sigma Metrics (`lib/leo/computeMetrics.ts`)

```ts
export function computeMetrics(tasks: Task[], changelog: ChangelogEntry[]) {
  const today       = new Date();
  const oldestTask  = tasks.reduce((a, b) =>
    new Date(a.updated_at) < new Date(b.updated_at) ? a : b, tasks[0]);

  const wipAgingDays = oldestTask
    ? Math.round((Date.now() - new Date(oldestTask.updated_at).getTime()) / 86400000)
    : 0;

  const onSchedule = tasks.filter(t =>
    !t.due_date || t.due_date >= today.toISOString().split('T')[0]
  ).length;

  const last7            = changelog.slice(0, 7);
  const deployDefectRate = last7.length
    ? parseFloat((last7.filter(c => c.type === 'fix').length / last7.length).toFixed(2))
    : 0;

  return {
    wipAgingDays,
    tasksOnSchedulePct:       tasks.length ? Math.round((onSchedule / tasks.length) * 100) : 100,
    deployDefectRate,
    ticketTurnaroundAvgDays:  2.3,   // TODO: compute from done_at when schema extended
    openTaskCount:            tasks.length,
  };
}
```

---

## 7. Context Assembly (`lib/leo/assembleContext.ts`)

```ts
export function assembleContext(data: LeoContextData): LeoContext {
  const { profile, session, tasks, changelog, alerts, visaAlerts, metrics } = data;

  const hour     = new Date().toLocaleString('en-GB', {
    timeZone: profile.timezone, hour: 'numeric', hour12: false
  });
  const greeting = parseInt(hour) < 12 ? 'morning'
                 : parseInt(hour) < 17 ? 'afternoon' : 'evening';

  return {
    user: {
      id:         profile.user_id,
      name:       profile.display_name,
      role:       profile.role,
      timezone:   profile.timezone,
      local_time: new Date().toLocaleString('en-GB', {
        timeZone: profile.timezone, hour: '2-digit', minute: '2-digit'
      }),
      greeting,
    },
    last_session: {
      summary:     session?.session_summary ?? 'No previous session recorded.',
      last_active: session?.last_active_at  ?? null,
    },
    open_tasks: (tasks ?? []).map(t => ({
      title:    t.title,
      priority: t.priority,
      due:      t.due_date ?? 'no deadline',
      company:  t.company_tag ?? null,
    })),
    dev_changelog: (changelog ?? []).slice(0, 5).map(c => ({
      author: c.author_name,
      type:   c.type,
      desc:   c.description,
      when:   relativeTime(c.created_at),
      ticket: c.ticket_ref ?? null,
    })),
    platform_alerts: (alerts ?? []).map(a => ({
      severity: a.severity,
      message:  a.message,
    })),
    visa_compliance: (visaAlerts ?? []).map(a => ({
      type:     a.alert_type,
      severity: a.severity,
      message:  a.message,
      due_date: a.due_date,
      crew:     a.crew_members?.full_name ?? null,
    })),
    seaport_pending: (seaportRequests ?? []).map(r => ({
      vessel:       r.vessels?.vessel_name,
      submitted:    relativeTime(r.created_at),
      status:       r.status,
      sla_breached: r.seaport_sla?.[0]?.sla_breached ?? false,
      mins_elapsed: Math.round((Date.now() - new Date(r.created_at).getTime()) / 60000),
    })),
    process_metrics: metrics,
  };
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60)   return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}
```

---

## 8. Leo API Route (`app/api/leo/briefing/route.ts`)

```ts
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { fetchLeoContext } from '@/lib/supabase/queries';
import { assembleContext } from '@/lib/leo/assembleContext';
import { computeMetrics } from '@/lib/leo/computeMetrics';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return new Response('Unauthorized', { status: 401 });

  const rawContext = await fetchLeoContext(user.id);
  const metrics    = computeMetrics(
    rawContext.tasks?.data    ?? [],
    rawContext.changelog?.data ?? []
  );
  const context    = assembleContext({ ...rawContext, metrics });
  const stream     = await anthropic.messages.stream({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system:     buildSystemPrompt(context),
    messages:   [{ role: 'user', content: 'Generate my login briefing now.' }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    }
  });

  return new Response(readable, {
    headers: {
      'Content-Type':     'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control':    'no-cache',
    }
  });
}
```

---

## 9. Leo System Prompt (`buildSystemPrompt`)

```ts
function buildSystemPrompt(context: LeoContext): string {
  return `
You are Leo — the active intelligence engine inside the Polaris yacht management platform.
You are not a chatbot. You are a proactive briefing officer who speaks first on every login.

CONTEXT:
${JSON.stringify(context, null, 2)}

BRIEFING STRUCTURE — follow this order exactly:

1. GREETING
   Address ${context.user.name} by name. Acknowledge the time of day (it is ${context.user.greeting}).
   One sentence only. Direct.

2. LAST INTERACTION
   Reference their last session specifically: ${context.last_session.summary}
   One or two sentences.

3. PENDING TASKS
   Highlight the highest-priority open items only. Name the task, the deadline, the urgency.
   Do not list everything. Surface the two or three that matter most right now.

4. PLATFORM UPDATES
   Note any relevant developer changes since their last session. Credit the developer by name.
   Only include changes relevant to this user's role (${context.user.role}).

5. OPERATIONAL INSIGHT
   Provide one insight derived from the process metrics.
   Apply Lean or 6 Sigma principles where relevant.
   Name the signal explicitly (e.g. "WIP aging", "DPMO", "cycle time deviation").
   Be specific and actionable. Not generic.

6. VISA & COMPLIANCE (only if visa_compliance contains items)
   If there are critical visa compliance alerts, surface the most urgent one.
   Name the crew member and the expiry date. Be specific.
   Example: "Ahmed Al Rashidi's UAE visa expires in 4 days — renewal has not been initiated."
   One alert maximum. Prioritise critical over warn.

7. SEAPORT IMMIGRATION (only if seaport_pending contains time-sensitive items)
   Surface only if a request has been waiting > 2 hours without completion, or SLA is breached.
   Name the vessel and time elapsed. One item maximum.
   Example: "M/Y Seraphina submitted a seaport sign-on request 3 hours ago — SLA expires in 1 hour."
   Never surface completed or report_sent requests.

UAE VISA PROCESS KNOWLEDGE:
- UAE crew visas MUST be pre-approved before crew arrives. Non-negotiable.
- Minimum processing time is 1–2 working days. Never promise same-day.
- On arrival: crew MUST complete seaport immigration sign-on.
- On departure: crew MUST complete seaport immigration sign-off before exiting UAE.
- For help, refer to "our Port & Agency Team" — never name the company.
- Contact: support@jlsyachts.com / +971 4 331 3555.

TONE:
Direct. Confident. Like a knowledgeable first officer delivering a handover brief.
Never say "I'm here to help" or "How can I assist you today."
Use plain language. Lean/6 Sigma terminology is acceptable when precise.

FORMAT:
Plain prose only. No markdown. No bullet points. No headers.
Target 120–180 words.

After the prose briefing — on a new line — output a JSON block wrapped in <insights> tags:
<insights>
{
  "lean":    "One sentence — the Lean signal and what to do about it.",
  "process": "One sentence — overall process health score or status.",
  "alert":   "One sentence — the single most urgent thing requiring attention."
}
</insights>

The <insights> block is parsed by the client and rendered separately. It must be valid JSON.
Do not mention the <insights> block in the prose briefing.
`.trim();
}
```

---

## 10. LeoPanel Component (`components/leo/LeoPanel.tsx`)

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';

type Insights = { lean: string; process: string; alert: string };

export function LeoPanel() {
  const [text, setText]         = useState('');
  const [status, setStatus]     = useState<'thinking'|'streaming'|'ready'>('thinking');
  const [insights, setInsights] = useState<Insights | null>(null);
  const bufferRef               = useRef('');

  useEffect(() => { streamBriefing(); }, []);

  async function streamBriefing() {
    setStatus('streaming');
    const res = await fetch('/api/leo/briefing', { method: 'POST' });
    if (!res.body) return;

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      bufferRef.current += decoder.decode(value, { stream: true });

      const insightStart = bufferRef.current.indexOf('<insights>');
      const visibleText  = insightStart === -1
        ? bufferRef.current
        : bufferRef.current.slice(0, insightStart);
      setText(visibleText);

      const insightEnd = bufferRef.current.indexOf('</insights>');
      if (insightStart !== -1 && insightEnd !== -1 && !insights) {
        const json = bufferRef.current.slice(insightStart + 10, insightEnd).trim();
        try { setInsights(JSON.parse(json)); } catch { /* retry next chunk */ }
      }
    }
    setStatus('ready');
  }

  return (
    <div style={{ background: '#0D1520', border: '1px solid #0F2030', borderRadius: 6 }}>
      <div style={{ background: '#0A1018', borderBottom: '1px solid #0F2030',
                    padding: '10px 16px', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LeoIconSVG />
          <span style={{ fontFamily: 'Space Grotesk', fontSize: 12, fontWeight: 700,
                         color: '#E8A020', letterSpacing: '0.15em' }}>LEO</span>
          <span style={{ fontSize: 10, color: '#3A3020' }}>Active intelligence</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 10, color: '#3A5570' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%',
                         background: '#00C4CC', display: 'inline-block',
                         animation: status !== 'ready' ? 'pulse 1s infinite' : 'none' }} />
          {status === 'thinking'  && 'Generating briefing…'}
          {status === 'streaming' && 'Streaming…'}
          {status === 'ready'     && 'Briefing ready'}
        </div>
      </div>

      <div style={{ padding: '14px 16px' }}>
        <p style={{ fontFamily: 'Inter', fontSize: 13, color: '#C8D8E8',
                    lineHeight: 1.75, margin: 0, whiteSpace: 'pre-wrap' }}>
          {text}
          {status === 'streaming' && (
            <span style={{ display: 'inline-block', width: 2, height: 13,
                           background: '#E8A020', marginLeft: 2, verticalAlign: 'middle',
                           animation: 'blink 0.7s infinite' }} />
          )}
        </p>

        {insights && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                        gap: 10, marginTop: 14 }}>
            {[
              { label: 'Lean signal',    key: 'lean',    color: '#E8A020' },
              { label: 'Process health', key: 'process', color: '#00C4CC' },
              { label: 'Attention',      key: 'alert',   color: '#E87020' },
            ].map(({ label, key, color }) => (
              <div key={key} style={{ background: '#080D14', border: '1px solid #0F2030',
                                      borderRadius: 5, padding: 12 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
                               textTransform: 'uppercase', color, marginBottom: 6,
                               fontFamily: 'Space Grotesk' }}>
                  {label}
                </div>
                <div style={{ fontSize: 11, color: '#5A7080', lineHeight: 1.55,
                               fontFamily: 'Inter' }}>
                  {insights[key as keyof Insights]}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 11. Visa Module — Key Rules

Full spec in `POLARIS_VISA_MODULE.md` and `POLARIS_VISA_HANDBOOK.md`.
These rules are non-negotiable and override any assumptions:

1. **Never duplicate crew** — always run `findOrPromptCrewMatch(name, dob)` before inserting.
2. **Match crew on `full_name + date_of_birth` only** — never on nationality alone.
3. **Always ask about multiple passports** on crew profile creation.
4. **Passport selection is per-application** — never auto-select silently.
5. **UAE is always the default country** on new application creation.
6. **Country fields are config-driven** — read from `COUNTRY_CONFIGS`, never hardcode.
7. **Blocking compliance failures disable the Submit button** — non-blocking show a warning.
8. **UAE visa must be approved before crew travels** — the UI must enforce this.
9. **Seaport sign-on/sign-off tasks auto-create** when a UAE visa moves to `approved`.
10. **Office users are vessel-scoped** — an office sees only crew on their assigned vessels.
11. **All documents go to Supabase Storage** — store the URL, never binary data in the DB.
12. **Handbook link appears only on the country info page** — `components/visa/HandbookLink.tsx`.
13. **Label the Port & Agency Team as "our Port & Agency Team"** — never the company name.
14. **Visa compliance alerts feed Leo** — unresolved critical alerts surface in the login briefing.

---

## 12. Environment Variables

```bash
# .env.local — never commit this file
ANTHROPIC_API_KEY=sk-ant-...          # server only — never expose to client
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...         # server only
```

---

## 13. Dev Mode — User Context Switcher

- Render only when `process.env.NODE_ENV === 'development'` OR
  `role === 'platform_owner'` AND URL contains `?devMode=true`.
- Switching triggers: re-fetch tasks, re-fetch metrics, new Leo briefing call.
- Must not render in production builds under any circumstances.

---

## 14. Key Rules for Claude Code

1. **Never call the Anthropic API from the client** — always route through `/api/leo/briefing`.
2. **Never expose `ANTHROPIC_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY`** to the client.
3. **Always stream Leo's response** — never wait for the full response before rendering.
4. **Parse `<insights>` on the client** — extract JSON after `</insights>` tag closes.
5. **All colours from `lib/tokens.ts`** — no hardcoded hex values anywhere else.
6. **Space Grotesk for all UI text** — Inter only for Leo's streaming prose.
7. **No serif fonts anywhere** — ever.
8. **RLS on all Supabase tables** — users never see data outside their scope.
9. **Fetch context in parallel** — `Promise.all`, never sequential awaits on login.
10. **`UserContextSwitcher` is dev/demo only** — gated behind env check + `devMode` param.
11. **Visa rules from section 11 above are absolute** — do not work around them.
12. **Run migrations in order** — 001 → 002 → 003 → 004 → 005 → 010 → 011 → 012 → 013 → 014.
13. **Seaport SLA is tracked on every status transition** — call `updateSLA()` without exception.
14. **Seaport report is only sent after all crew rows are terminal** — never send early.
15. **Seaport module integrates with Migration 004** — completing a sign-on/off row also writes to `seaport_events`.
16. **Every API route calls `requireAccess()`** — no unprotected routes under any circumstances.
17. **MFA is mandatory** — no user accesses the platform without a verified TOTP factor.
18. **Landing page routing is role-driven** — call `getLandingPath()`, never hardcode `/dashboard` for all users.
19. **Every action is audit logged** — call `logAuditEvent()` from middleware, all API routes, and admin panel.
20. **Access layer is built before operational module UI** — see `POLARIS_ACCESS_CONTROL.md` build order.
21. **Workspace selector is shown after auth** if user has >1 workspace — never skip it.
22. **Every authenticated page uses `PolarisShell`** — never build a dashboard without the shell wrapper.
23. **Sidebar filters by user's module access** — never show a nav item the user cannot enter.
24. **Leo briefing is workspace-scoped** — always pass `workspaceType` and `workspaceId` to the briefing API.
25. **Financial tiles are permission-gated** — never render without checking `finance` permission first.

---

## 15. Open Tickets (as of June 2026)

| Ticket | Assigned   | Priority | Description |
|--------|------------|----------|-------------|
| #118   | Matt Tighe | HIGH     | ISM cert expiry edge case — expiry on a weekend not handled in compliance module |
| #119   | Matt Tighe | HIGH     | Stress test `/api/leo/briefing` with 50 concurrent sessions |
| #120   | Matt Tighe | MED      | Supabase connection pool config — review for production load |
| #121   | Matt Tighe | MED      | Mobile viewport breakpoints — LeoPanel and insight cards below 768px |
| #122   | Matt Tighe | LOW      | Write CHANGELOG entry for v1.2 Leo briefing deploy |
| #123   | Matt Tighe | HIGH     | Build seaport immigration request form — POLARIS_SEAPORT_IMMIGRATION.md section 3 |
| #124   | Matt Tighe | HIGH     | Build Port & Agency Team queue view and execution detail — section 9 |
| #125   | Matt Tighe | MED      | SLA timer component and seaport_sla auto-update on status transitions |
| #126   | Matt Tighe | MED      | Completion report PDF generation and send to vessel |
| #127   | Matt Tighe | LOW      | Add seaport section to vessel detail page |
| #128   | Matt Tighe | CRITICAL | Migrations 010–014 — access control schema (POLARIS_ACCESS_CONTROL.md) |
| #129   | Matt Tighe | CRITICAL | MFA setup + enforcement — block platform access until enrolled |
| #130   | Matt Tighe | CRITICAL | JWT custom claims — role, org, vessel list, module list on every login |
| #131   | Matt Tighe | CRITICAL | Landing page routing — getLandingPath() per role, all portal pages |
| #132   | Matt Tighe | HIGH     | requireAccess() middleware — wrap all existing API routes |
| #133   | Matt Tighe | HIGH     | Admin panel — user management, vessel assignment, module permissions |
| #134   | Matt Tighe | HIGH     | Audit log — logAuditEvent() wired into middleware + all API routes |
| #135   | Matt Tighe | MED      | Branding layer — org/location context on stakeholder landing pages |
| #136   | Matt Tighe | MED      | Leo access-aware briefings — scope context in system prompt |
| #137   | Matt Tighe | CRITICAL | Login page — two-panel layout + workspace selector |
| #138   | Matt Tighe | CRITICAL | Workspace routing engine — getLandingPath + workspace context |
| #139   | Matt Tighe | HIGH     | Captain dashboard — vessel ops overview with Leo panel |
| #140   | Matt Tighe | HIGH     | Owner portal — financial & performance overview |
| #141   | Matt Tighe | HIGH     | Crew portal — personal & development hub |
| #142   | Matt Tighe | HIGH     | Location dashboard — regional ops overview |
| #143   | Matt Tighe | HIGH     | Polaris shell — sidebar with filtered module navigation |
| #144   | Matt Tighe | MED      | ShipSync, Training, Supplier portals |
| #145   | Matt Tighe | MED      | Ecosystem module map — lib/platform/ecosystem.ts |

---

*Polaris / Leo — Internal · Confidential · v1.5 — June 2026*
