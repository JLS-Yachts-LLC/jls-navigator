# POLARIS_PLATFORM_UX.md
# Login Experience, Dynamic Landing Pages & Full Ecosystem
# Source: Polaris platform concept — adapted from Aquila One first draft
# Drop alongside all other spec files in the project root

---

## IMPORTANT — Name & Brand Corrections from Source Material

The source image references "Aquila One". All references are now:
- **Aquila One** → **Polaris** (the platform)
- **Aquila AI** → **Leo** (the AI agent inside Polaris)
- "The Operating System Behind Yacht Operations" → retained as platform descriptor
- All UI must use Polaris brand tokens from `CLAUDE.md` section 3

Scale targets from image (updated):
- 11+ locations
- 350+ yachts
- 2,500+ crew
- Connected stakeholders: Owners, Family Offices, Captains, Crew,
  Yacht Managers, Agents, Suppliers, Marinas, Authorities, Partners

---

## 1. Login Experience

### Route: `app/auth/login/page.tsx`

The login page has two distinct elements: the branding panel (left) and
the login form with workspace selector (right).

### 1.1 Left panel — Branding

```tsx
// components/auth/LoginBrandPanel.tsx
export function LoginBrandPanel() {
  return (
    <div style={{
      background: '#080D14',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '48px 40px',
      minHeight: '100vh',
    }}>
      {/* Logo */}
      <div>
        <PolarisLogoMark size={48} />
        <div style={{ fontFamily: 'Space Grotesk', fontSize: 28,
                       fontWeight: 700, color: '#E8EDF5',
                       letterSpacing: '-0.02em', marginTop: 12 }}>
          POLARIS
        </div>
        <div style={{ fontSize: 13, color: '#3A5570', marginTop: 6,
                       fontFamily: 'Inter' }}>
          The Operating System Behind Yacht Operations
        </div>
      </div>

      {/* Hero image — superyacht aerial */}
      <div style={{ flex: 1, margin: '32px 0', borderRadius: 8,
                     overflow: 'hidden', minHeight: 280,
                     background: '#0D1520' }}>
        {/* bg-cover superyacht aerial image */}
      </div>

      {/* Security badges — bottom */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
                     gap: 12 }}>
        {[
          { icon: 'ti-shield-lock',  label: 'Enterprise Security',   sub: 'Bank-level encryption' },
          { icon: 'ti-device-mobile', label: 'MFA Enabled',          sub: 'Multi-factor authentication' },
          { icon: 'ti-clipboard-list', label: 'Audit Logging',       sub: 'Full activity tracking' },
          { icon: 'ti-globe',         label: 'Regional Redundancy',  sub: 'High availability' },
        ].map(({ icon, label, sub }) => (
          <div key={label} style={{ display: 'flex', gap: 10,
                                     alignItems: 'flex-start' }}>
            <i className={`ti ${icon}`} style={{ fontSize: 16,
               color: '#00C4CC', marginTop: 2 }} aria-hidden="true" />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600,
                             color: '#E8EDF5', fontFamily: 'Space Grotesk' }}>
                {label}
              </div>
              <div style={{ fontSize: 10, color: '#3A5570' }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 1.2 Right panel — Login form with workspace selector

```tsx
// components/auth/LoginForm.tsx

// WORKSPACE GROUPS — shown in the selector after email is recognised
// These are pulled dynamically from the user's org/vessel/module assignments
export const WORKSPACE_GROUPS = {
  ORGANISATIONS: [
    { id: 'jls_uae',     label: 'JLS Dubai, United Arab Emirates' },
    { id: 'jls_ksa',     label: 'JLS Arabia, Saudi Arabia' },
    { id: 'jls_maldives', label: 'JLS Maldives, Maldives' },
    // ... dynamically populated from user's location_access
  ],
  VESSELS: [
    // Dynamically populated from user's vessel_access
    // e.g. { id: 'vessel_uuid', label: 'MY Madam Gu' }
    // e.g. { id: 'vessel_uuid', label: 'MY Ocean Victory' }
    // e.g. { id: 'vessel_uuid', label: 'MY Quantum Blue' }
  ],
  MODULES: [
    { id: 'superyacht_me',  label: 'Superyacht Middle East',  sub: 'Agency & Destination Services' },
    { id: 'shipsync',       label: 'ShipSync',                sub: 'Ship Spares' },
    { id: 'waypoint',       label: 'Waypoint',                sub: 'Chandlery & Procurement' },
    { id: 'crew_portal',    label: 'Crew Portal',             sub: 'Crew Access' },
    { id: 'crew_placement', label: 'Crew Placement',          sub: 'Placements & Daywork' },
    { id: 'training',       label: 'JLS Yacht Training Institute', sub: 'Training & Certification' },
  ],
};

// Login form layout
// 1. "Welcome back — Sign in to your account"
// 2. Username or email field
// 3. Password field (with show/hide toggle)
// 4. Remember me checkbox + Forgot password link
// 5. Sign In button
// 6. Divider: "or"
// 7. Sign in with SSO button
// 8. "Need help? Contact IT Support" link at bottom
// 9. AFTER successful auth + workspace selection → route via getLandingPath()
```

### 1.3 Workspace selector

Shown after the user authenticates but before routing to their dashboard.
Only shown if the user has access to more than one workspace.
If the user has only one workspace, skip this step and route directly.

```tsx
// components/auth/WorkspaceSelector.tsx

// Groups displayed in order:
// 1. ORGANISATIONS (regional offices) — if user has location access
// 2. VESSELS — if user has vessel access (show vessel name + class if available)
// 3. MODULE ACCESS — module-specific portals the user can enter

// Each option shows:
// - Icon (location pin for orgs, ship for vessels, module icon for modules)
// - Primary label (org name / vessel name / module name)
// - Secondary label (city/country for orgs, vessel type for vessels, description for modules)
// - Chevron →

// "Select Organisation / Workspace" is the section heading
// User clicks one → that context is stored in session → route to landing page
```

---

## 2. Dynamic Landing Pages

**Core principle:** One login. Intelligent routing. Role-based dashboards.
Leo delivers the briefing. The dashboard surfaces the relevant data.

Build each landing page as a standalone page. They share the
`LeoPanel` component and the Polaris shell, but render entirely
different content panels based on the authenticated user's context.

---

### 2.1 Captain Dashboard
`app/dashboard/vessel/[vesselId]/captain/page.tsx`
Label: "Captain Dashboard — Vessel Operations Overview"

```tsx
const CAPTAIN_DASHBOARD_PANELS = [
  // Row 1 — vessel overview strip
  { id: 'vessel_header',  type: 'vessel_banner',   span: 'full' },

  // Row 2 — metric cards
  { id: 'crew_count',     type: 'metric',  label: 'Crew',        icon: 'ti-users' },
  { id: 'open_tasks',     type: 'metric',  label: 'Open Tasks',  icon: 'ti-checkbox' },
  { id: 'compliance',     type: 'metric',  label: 'Compliance',  icon: 'ti-shield-check',
                           sub: 'items requiring attention' },
  { id: 'deliveries',     type: 'metric',  label: 'Deliveries',  icon: 'ti-package' },

  // Row 3 — operational panels
  { id: 'ship_spares',    type: 'list',   label: 'Ship Spares',     module: 'shipsync' },
  { id: 'compliance_list',type: 'list',   label: 'Compliance',      module: 'crew_immigration' },
  { id: 'visa_reports',   type: 'list',   label: 'Visa Reports',    module: 'crew_immigration' },

  // Row 4 — activity
  { id: 'recent_activity',type: 'feed',   label: 'Recent Activity', span: 'full' },
  // Examples shown in image:
  // "Anchoring completed in Dubai"
  // "Crew change in progress in Abu Dhabi"
  // "ISM Doc change — pending"
];
```

### 2.2 Owner Dashboard
`app/portal/owner/page.tsx`
Label: "Owner Dashboard — Financial & Performance Overview"

```tsx
const OWNER_DASHBOARD_PANELS = [
  // Row 1 — financial summary (finance permission required for all items)
  { id: 'ytd_spend',      type: 'metric',  label: 'Financial Summary (YTD)',
                           format: 'currency', permission: 'finance' },
  { id: 'open_requests',  type: 'metric',  label: 'Open Requests' },
  { id: 'upcoming_costs', type: 'metric',  label: 'Upcoming Costs',
                           permission: 'finance' },
  { id: 'vessel_reports', type: 'metric',  label: 'Vessel Reports' },

  // Row 2 — financial detail (finance permission required)
  { id: 'open_requests_list', type: 'list', label: 'Open Requests' },
  { id: 'upcoming_costs_list',type: 'list', label: 'Upcoming Costs', permission: 'finance' },
  { id: 'vessel_reports_list',type: 'list', label: 'Vessel Reports' },

  // Row 3 — invoice & SOA
  { id: 'latest_invoice', type: 'card',   label: 'Latest Invoice',
                           permission: 'finance' },
  { id: 'statement',      type: 'card',   label: 'Statement of Account',
                           permission: 'finance' },
];

// Financial panel values shown in concept image (for mock/seed data):
// YTD: USD 1,245,750 (+12.3% vs last year)
// Latest Invoice: USD 85,450 — Due [date] — Pending
```

### 2.3 Crew Dashboard
`app/portal/crew/page.tsx`
Label: "Crew Dashboard — Personal & Development Hub"

```tsx
const CREW_DASHBOARD_PANELS = [
  // Row 1 — personal summary
  { id: 'crew_profile',   type: 'profile_card',  span: 'full' },
  // Shows: avatar, name, vessel name, role

  // Row 2 — status cards
  { id: 'visa_status',    type: 'status_card',  label: 'Visa Status',
    // e.g. UAE — Valid — Exp: [date] — Issued by: JLS Resident Visa
    module: 'crew_immigration' },
  { id: 'training_records', type: 'metric',     label: 'Training Records',
    value: 12, sub: 'Certificates' },
  { id: 'next_course',    type: 'status_card',  label: 'Next Course',
    // e.g. ENG1 — Due [date]
    module: 'training' },

  // Row 3 — certificates expiring soon
  { id: 'cert_expiry',    type: 'list',         label: 'Certificates Expiring Soon',
    // e.g. STCW Basic Safety — 11 May 2024
    //      Proficiency in Survival Craft — 21 Jun 2024
    //      Medical/First Aid — [date]
    module: 'training' },
];
```

### 2.4 Saudi Office Dashboard
`app/dashboard/location/[locationId]/page.tsx`
Label: "Saudi Office Dashboard — Regional Operations Overview"

```tsx
const LOCATION_DASHBOARD_PANELS = [
  // Row 1 — regional metrics
  { id: 'active_port_calls', type: 'metric', label: 'Active Port Calls' },
  { id: 'clearances',        type: 'metric', label: 'Clearances',
    sub: 'pending', severity: 'warn' },
  { id: 'logistics_jobs',    type: 'metric', label: 'Logistics Jobs',
    sub: 'in progress' },

  // Row 2 — operational panels
  { id: 'local_team_tasks',  type: 'task_list', label: 'Local Team Tasks',
    // Task types shown in concept: Port Call, Vessel Overview, Crew Movement
    // Status: Open / In Progress / Done
  },

  // Row 3 — vessel list for location
  { id: 'vessels_in_location', type: 'vessel_list', label: 'Vessels in Location' },
];
```

### 2.5 ShipSync Dashboard
`app/portal/shipsync/page.tsx`
Label: "ShipSync Dashboard — Logistics & Ship Spares Overview"

```tsx
const SHIPSYNC_DASHBOARD_PANELS = [
  // Row 1 — spares metrics
  { id: 'spares_in_transit', type: 'metric', label: 'Ship Spares in Transit' },
  { id: 'customs_clearance', type: 'metric', label: 'Customs Clearance',
    sub: 'items in progress' },
  { id: 'deliveries',        type: 'metric', label: 'Deliveries' },

  // Row 2 — detail lists
  { id: 'spares_list',       type: 'list',   label: 'Ship Spares',
    // Columns: Item, Vessel, Status, Origin, ETA
    // Statuses: In Transit / Customs / Delivered
  },
  { id: 'customs_list',      type: 'list',   label: 'Customs Items' },

  // Row 3 — generators / fuel & consumables note from concept
  { id: 'fuel_consumables',  type: 'list',   label: 'Fuel & Consumables' },
  { id: 'engine_parts',      type: 'list',   label: 'Engine Parts' },
];
```

### 2.6 Training Dashboard
`app/portal/training/page.tsx`
Label: "Training Dashboard — Learning & Certification Overview"

```tsx
const TRAINING_DASHBOARD_PANELS = [
  // Row 1 — summary metrics
  { id: 'my_courses',     type: 'metric', label: 'My Courses' },
  { id: 'completed',      type: 'metric', label: 'Completed',
    sub: 'this year' },
  { id: 'certificates',   type: 'metric', label: 'Certificates' },

  // Row 2 — upcoming courses
  { id: 'upcoming_courses', type: 'list', label: 'Upcoming Courses',
    // Examples from concept:
    // Advanced Fire Fighting — 12 May 2024
    // Yacht Deck Operations — 29 May 2024
    // Security Awareness    — [date]
  },
];
```

---

## 3. Intelligent Routing Logic

This is the engine that makes "one login, correct dashboard" work.
Builds on `getLandingPath()` from `POLARIS_ACCESS_CONTROL.md` section 6.

```ts
// lib/auth/routing.ts — extend with workspace context

export interface WorkspaceContext {
  type:       'organisation' | 'vessel' | 'module';
  id:         string;
  label:      string;
}

// After workspace selection, store in session and use for routing
export function getWorkspaceLandingPath(
  user: UserWithClaims,
  workspace: WorkspaceContext
): string {
  switch (workspace.type) {
    case 'organisation':
      return `/dashboard/location/${workspace.id}`;
    case 'vessel':
      return `/dashboard/vessel/${workspace.id}/${getDashboardType(user.role_name)}`;
    case 'module':
      return getModulePath(workspace.id);
  }
}

function getDashboardType(role: string): string {
  const map: Record<string, string> = {
    captain:      'captain',
    senior_crew:  'captain',
    crew_member:  'crew',
    owner:        'owner',
    family_office:'owner',
    crew_manager: 'operations',
    technical_mgr:'technical',
  };
  return map[role] ?? 'overview';
}

function getModulePath(moduleId: string): string {
  const map: Record<string, string> = {
    superyacht_me:  '/portal/agency',
    shipsync:       '/portal/shipsync',
    waypoint:       '/portal/waypoint',
    crew_portal:    '/portal/crew',
    crew_placement: '/portal/crew-placement',
    training:       '/portal/training',
    finance:        '/portal/finance',
  };
  return map[moduleId] ?? '/dashboard';
}
```

### Routing diagram

```
User logs in
     ↓
Auth confirmed + MFA verified
     ↓
Load user claims (role, orgs, vessels, modules)
     ↓
Single workspace? ──YES──→ Route directly to landing page
     ↓ NO
Show workspace selector
     ↓
User selects workspace
     ↓
Store workspace context in session
     ↓
Route to correct landing page
     ↓
Leo briefing begins (context-aware to workspace + role)
```

---

## 4. The Polaris Ecosystem — Module Map

All modules from the concept image, renamed and mapped to Polaris.

```ts
// lib/platform/ecosystem.ts

export const POLARIS_MODULES = [
  // Core platform
  {
    id:          'leo',
    name:        'Leo',
    category:    'core',
    description: 'AI Intelligence — The intelligence behind Polaris',
    icon:        'ti-robot',
    accentColor: '#E8A020',
  },

  // Operations cluster
  {
    id:          'orbit',
    name:        'ORBIT',
    category:    'operations',
    description: 'Operations & Small Boat Management',
    icon:        'ti-sailboat',
    accentColor: '#00C4CC',
  },
  {
    id:          'transport',
    name:        'Transport & Fleet',
    category:    'operations',
    description: 'Vessel deliveries, logistics, transport',
    icon:        'ti-car',
    accentColor: '#00C4CC',
  },
  {
    id:          'yacht_it',
    name:        'Yacht IT Solutions',
    category:    'operations',
    description: 'IT support, cyber security, connectivity, networks',
    icon:        'ti-device-laptop',
    accentColor: '#00C4CC',
  },

  // Agency & Destinations cluster
  {
    id:          'agency',
    name:        'Superyacht Middle East',
    category:    'agency',
    description: 'Agency + port calls + clearances + berthing + fuel + local support',
    icon:        'ti-map-pin',
    accentColor: '#00C4CC',
  },

  // Logistics cluster
  {
    id:          'shipsync',
    name:        'ShipSync',
    category:    'logistics',
    description: 'Ship spares + logistics + customs + storage',
    icon:        'ti-package',
    accentColor: '#00C4CC',
  },
  {
    id:          'waypoint',
    name:        'Waypoint',
    category:    'logistics',
    description: 'Chandlery + procurement + suppliers',
    icon:        'ti-shopping-cart',
    accentColor: '#00C4CC',
  },
  {
    id:          'provisioning',
    name:        'Superyacht Provisioning',
    category:    'logistics',
    description: 'Provisions + interiors + pantry + events + special orders',
    icon:        'ti-basket',
    accentColor: '#00C4CC',
  },

  // Crew cluster
  {
    id:          'crew_immigration',
    name:        'Crew & Immigration',
    category:    'crew',
    description: 'Visas + passports + gate passes + crew movements',
    icon:        'ti-passport',
    accentColor: '#E8A020',
  },
  {
    id:          'crew_placement',
    name:        'Crew Placement',
    category:    'crew',
    description: 'Placements + daywork + crew solutions',
    icon:        'ti-users',
    accentColor: '#E8A020',
  },
  {
    id:          'training',
    name:        'JLS Yacht Training Institute',
    category:    'crew',
    description: 'Training + certification + development',
    icon:        'ti-certificate',
    accentColor: '#E8A020',
  },

  // Finance
  {
    id:          'finance',
    name:        'Finance',
    category:    'finance',
    description: 'Invoices + SOA + payments + QuickBooks integration',
    icon:        'ti-currency-dollar',
    accentColor: '#00C4CC',
  },

  // Other
  {
    id:          'compass_card',
    name:        'Compass Card',
    category:    'other',
    description: 'Crew benefit card',
    icon:        'ti-credit-card',
    accentColor: '#00C4CC',
  },
];
```

### Connected stakeholders

```ts
export const CONNECTED_STAKEHOLDERS = [
  { id: 'owners',         label: 'Owners',         icon: 'ti-user-circle'   },
  { id: 'family_offices', label: 'Family Offices',  icon: 'ti-building'      },
  { id: 'captains',       label: 'Captains',        icon: 'ti-steering-wheel'},
  { id: 'crew',           label: 'Crew',            icon: 'ti-users'         },
  { id: 'yacht_managers', label: 'Yacht Managers',  icon: 'ti-briefcase'     },
  { id: 'agents',         label: 'Agents',          icon: 'ti-map-pin'       },
  { id: 'suppliers',      label: 'Suppliers',       icon: 'ti-package'       },
  { id: 'marinas',        label: 'Marinas',         icon: 'ti-anchor'        },
  { id: 'authorities',    label: 'Authorities',     icon: 'ti-building-bank' },
  { id: 'partners',       label: 'Partners',        icon: 'ti-handshake'     },
];
```

---

## 5. Security & Permissions Architecture UI

The architecture diagram from the image maps directly to the existing
`POLARIS_ACCESS_CONTROL.md`. Build these UI components to represent it.

### 5.1 Permission level UI

```tsx
// components/admin/PermissionBadge.tsx
// Six levels: VIEW · CREATE · EDIT · APPROVE · FINANCE · ADMIN
// Displayed as pill badges with colour coding:
// VIEW    → steel (#3A5570) background
// CREATE  → ocean (#1E4060) background
// EDIT    → signal (#00C4CC) background
// APPROVE → success (#4CAF80) background
// FINANCE → leoAmber (#E8A020) background
// ADMIN   → warn (#E87020) background
```

### 5.2 Role-based access control table — Admin UI

Show in the admin panel as a matrix. Pulled from `permission_rules`:

```
           OWNER   CAPTAIN   CREW   SUPPLIER   JLS STAFF
View         ✓        ✓       ✓        ✓          ✓
Create       ✓        ✓       —        ✓          ✓
Edit         ✓        ✓      Own       Own        ✓
Approve      —        —       —        —          ✓
Finance     ✓(own)    —       —       Own         ✓
Admin        —        —       —        —          ✓
```

### 5.3 Security layers badges

Shown on the login page and in the platform settings. Seven fixed badges:

```ts
export const SECURITY_LAYERS = [
  { id: 'mfa',        label: 'Multi-Factor Authentication', icon: 'ti-device-mobile'  },
  { id: 'encryption', label: 'Data Encryption',             icon: 'ti-lock'           },
  { id: 'audit',      label: 'Audit Logging',               icon: 'ti-clipboard-list' },
  { id: 'rbac',       label: 'Permission Controls',         icon: 'ti-shield-check'   },
  { id: 'redundancy', label: 'Regional Redundancy',         icon: 'ti-globe'          },
  { id: 'backups',    label: 'Automated Backups',           icon: 'ti-database'       },
  { id: 'recovery',   label: 'Disaster Recovery',           icon: 'ti-refresh-alert'  },
];
```

---

## 6. Leo Integration — Workspace-Aware Briefings

Leo's briefing changes based on the workspace the user has selected.
This is an extension of the existing `buildSystemPrompt()` in
`app/api/leo/briefing/route.ts`.

```ts
// Add workspace context to the Leo API call body
// POST /api/leo/briefing
// Body: { workspaceType: 'vessel' | 'organisation' | 'module', workspaceId: string }

// Add to buildSystemPrompt():

WORKSPACE CONTEXT:
The user has selected workspace: ${context.workspace.type} — ${context.workspace.label}

WORKSPACE-SPECIFIC BRIEFING RULES:
- If workspace is a VESSEL: focus briefing on that vessel's operations, crew, compliance, requests.
- If workspace is an ORGANISATION/LOCATION: focus on regional ops, active vessels in location, pending clearances, local tasks.
- If workspace is a MODULE (e.g. ShipSync): focus on that module's active items, pending jobs, alerts.
- Never reference data outside the selected workspace unless the user is global_admin.
- Address the user by their role in this workspace context, not their global role.
```

---

## 7. Platform Shell (`components/ui/PolarisShell.tsx`)

The persistent shell wraps every dashboard and portal page.
It is never shown on the login page or workspace selector.

```tsx
interface PolarisShellProps {
  user:      UserWithClaims;
  workspace: WorkspaceContext;
  children:  React.ReactNode;
}

// Shell contains:
// 1. TopBar — Polaris logo + dot, breadcrumb, workspace name, user pill, notifications
// 2. Sidebar — module navigation (only modules the user has access to)
// 3. Main content area — children
// 4. Leo panel — always visible at top of main content area on first load

// TopBar layout:
// [● POLARIS] [breadcrumb] .............. [🔔 badge] [user avatar + name + role]

// Sidebar navigation items — filtered by user.module_names:
const SIDEBAR_ITEMS = [
  { module: null,          path: '/dashboard',     label: 'Dashboard',    icon: 'ti-home'             },
  { module: 'leo',         path: '/dashboard/leo', label: 'Leo',          icon: 'ti-robot'            },
  { module: 'crew_immigration', path: '/dashboard/visa', label: 'Crew & Immigration', icon: 'ti-passport' },
  { module: 'seaport',     path: '/dashboard/visa/seaport', label: 'Seaport',   icon: 'ti-ship'      },
  { module: 'orbit',       path: '/dashboard/orbit',     label: 'ORBIT',       icon: 'ti-sailboat'  },
  { module: 'shipsync',    path: '/portal/shipsync',     label: 'ShipSync',    icon: 'ti-package'   },
  { module: 'waypoint',    path: '/portal/waypoint',     label: 'Waypoint',    icon: 'ti-shopping-cart' },
  { module: 'provisioning',path: '/portal/provisioning', label: 'Provisioning',icon: 'ti-basket'    },
  { module: 'training',    path: '/portal/training',     label: 'Training',    icon: 'ti-certificate'},
  { module: 'crew_placement', path: '/portal/crew-placement', label: 'Crew Placement', icon: 'ti-users' },
  { module: 'finance',     path: '/portal/finance',      label: 'Finance',     icon: 'ti-currency-dollar' },
  { module: 'transport',   path: '/portal/transport',    label: 'Transport',   icon: 'ti-car'       },
  { module: 'compass_card',path: '/portal/compass-card', label: 'Compass Card',icon: 'ti-credit-card'},
  { module: 'yacht_it',    path: '/portal/yacht-it',     label: 'Yacht IT',    icon: 'ti-device-laptop' },
  { module: 'agency',      path: '/portal/agency',       label: 'Agency',      icon: 'ti-map-pin'   },
  { module: 'admin',       path: '/dashboard/admin',     label: 'Admin',       icon: 'ti-settings'  },
];
// Filter: only show items where user has access to that module
// Admin item only shows for admin-level users
```

---

## 8. File Structure — Full Platform

This extends and consolidates the project structure from `CLAUDE.md`.

```
app/
├── auth/
│   ├── login/page.tsx                  # Login + workspace selector
│   └── mfa-setup/page.tsx             # MFA enrolment
├── dashboard/
│   ├── page.tsx                        # Global admin / platform owner dashboard
│   ├── admin/                          # Admin panel (see POLARIS_ACCESS_CONTROL.md)
│   ├── location/
│   │   └── [locationId]/page.tsx       # Location / regional office dashboard
│   ├── vessel/
│   │   └── [vesselId]/
│   │       ├── captain/page.tsx        # Captain dashboard
│   │       ├── operations/page.tsx     # Crew manager / operations dashboard
│   │       ├── technical/page.tsx      # Technical manager dashboard
│   │       └── overview/page.tsx       # General vessel overview
│   ├── visa/                           # Visa module (POLARIS_VISA_MODULE.md)
│   └── operations/seaport/             # Seaport team queue (POLARIS_SEAPORT_IMMIGRATION.md)
├── portal/
│   ├── owner/page.tsx                  # Owner / family office portal
│   ├── crew/page.tsx                   # Crew member portal
│   ├── supplier/page.tsx               # Supplier portal
│   ├── training/page.tsx               # Training Institute portal
│   ├── crew-placement/page.tsx         # Crew placement portal
│   ├── finance/page.tsx                # Finance portal
│   ├── agency/page.tsx                 # Agency portal
│   ├── shipsync/page.tsx               # ShipSync portal
│   ├── waypoint/page.tsx               # Waypoint portal
│   ├── provisioning/page.tsx           # Provisioning portal
│   ├── transport/page.tsx              # Transport portal
│   ├── compass-card/page.tsx           # Compass Card portal
│   └── yacht-it/page.tsx               # Yacht IT portal
└── api/
    ├── auth/                           # Auth hooks, MFA, claims
    ├── leo/briefing/route.ts           # Leo briefing (workspace-aware)
    ├── visa/                           # Visa APIs
    └── seaport/                        # Seaport APIs

components/
├── auth/
│   ├── LoginBrandPanel.tsx
│   ├── LoginForm.tsx
│   └── WorkspaceSelector.tsx
├── ui/
│   ├── PolarisShell.tsx                # Persistent shell wrapper
│   ├── TopBar.tsx
│   ├── Sidebar.tsx
│   └── MetricCard.tsx                  # Reusable metric tile
├── leo/                                # Leo components (CLAUDE.md)
├── visa/                               # Visa components (POLARIS_VISA_MODULE.md)
└── seaport/                            # Seaport components (POLARIS_SEAPORT_IMMIGRATION.md)

lib/
├── auth/
│   ├── routing.ts                      # getLandingPath + getWorkspaceLandingPath
│   ├── access.ts                       # requireAccess()
│   ├── audit.ts                        # logAuditEvent()
│   ├── mfa.ts                          # MFA enforcement
│   ├── branding.ts                     # getPageBranding()
│   └── claims.ts                       # JWT claims management
├── platform/
│   └── ecosystem.ts                    # POLARIS_MODULES + CONNECTED_STAKEHOLDERS
├── leo/                                # Leo lib (CLAUDE.md)
├── visa/                               # Visa lib (POLARIS_VISA_MODULE.md)
└── seaport/                            # Seaport lib (POLARIS_SEAPORT_IMMIGRATION.md)
```

---

## 9. Key Rules for Claude Code — This File

1. **Login page shows workspace selector** after auth if the user has >1 workspace.
   Single-workspace users skip it and route directly.
2. **Every landing page includes `LeoPanel`** at the top — Leo speaks first on
   every login regardless of which dashboard the user lands on.
3. **Leo's briefing is workspace-scoped** — pass `workspaceType` and `workspaceId`
   to the briefing API so Leo only references relevant data.
4. **Sidebar items are filtered** — render only modules the user has access to.
   Never show a navigation item for a module the user cannot enter.
5. **The platform shell (`PolarisShell`)** wraps every authenticated page.
   Never build a dashboard without it.
6. **All module names from the ecosystem map are final** — ORBIT, ShipSync,
   Waypoint, Superyacht Provisioning, JLS Yacht Training Institute, Crew Placement,
   Compass Card. Do not rename them.
7. **"Superyacht Middle East" is the module name** for agency services.
   In user-facing UI referring to the team, still use "our Port & Agency Team".
8. **Financial tiles are always permission-gated** — never render a financial
   panel without checking `finance` permission first.
9. **Workspace context is stored in the session** after selection and used
   throughout the session for Leo context and data scoping.
10. **The login page never uses the Polaris platform shell** — it is a
    standalone page with its own two-column layout.

---

## 10. Open Tickets — This File

| Ticket | Assigned   | Priority | Description |
|--------|------------|----------|-------------|
| #137   | Matt Tighe | CRITICAL | Login page — two-panel layout, workspace selector |
| #138   | Matt Tighe | CRITICAL | Workspace routing engine — getLandingPath + getWorkspaceLandingPath |
| #139   | Matt Tighe | HIGH     | Captain dashboard — vessel ops overview with Leo panel |
| #140   | Matt Tighe | HIGH     | Owner portal — financial & performance overview (finance permission gating) |
| #141   | Matt Tighe | HIGH     | Crew portal — personal & development hub |
| #142   | Matt Tighe | HIGH     | Location dashboard — regional ops overview |
| #143   | Matt Tighe | HIGH     | Polaris shell — sidebar with filtered module nav |
| #144   | Matt Tighe | MED      | ShipSync portal — spares & logistics dashboard |
| #145   | Matt Tighe | MED      | Training portal — courses & certification dashboard |
| #146   | Matt Tighe | MED      | Ecosystem module map — lib/platform/ecosystem.ts |

---

*Polaris — Platform UX, Login & Ecosystem Spec v1.0 — June 2026 — Confidential*
*Adapted from: Aquila One Login Experience & Dynamic Landing Pages — First Draft*
