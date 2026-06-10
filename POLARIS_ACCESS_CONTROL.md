# POLARIS_ACCESS_CONTROL.md
# Identity, Access Control & Stakeholder Routing Architecture
# This is the foundational layer. Build this before any operational module.
# Drop alongside CLAUDE.md, POLARIS_VISA_MODULE.md, POLARIS_SEAPORT_IMMIGRATION.md

---

## CRITICAL BUILD ORDER

This file defines the platform foundation. Nothing else works correctly without it.

Build in this exact sequence — do not skip ahead:

```
1.  User login + MFA
2.  Organisation setup
3.  Vessel setup
4.  Location setup
5.  Role setup
6.  Module setup
7.  Permission rules engine
8.  User landing page routing
9.  Admin panel
10. Audit log
```

Only after all 10 are complete should operational modules (Visa, Seaport, Leo) be wired in.

---

## 1. Platform Scale Targets

Design the schema and architecture to support this scale from day one.
Do not build for a smaller scope and plan to migrate later.

```ts
export const PLATFORM_SCALE = {
  yachts:         350,
  locations:      11,      // regional offices
  crewMembers:    4500,
  departments:    'multiple per organisation',
  externalStakeholders: [
    'captains', 'owners', 'family offices',
    'crew placement users', 'training users', 'agency users',
    'suppliers',
  ],
};
```

---

## 2. Access Hierarchy

Seven levels, top to bottom. A user at any level inherits the scope of
all levels below their assignment. Access is granted by need, not by default.

```
GLOBAL ADMIN
    │  Full system access — all organisations, modules, users, data
    │
REGIONAL ADMIN
    │  Access to assigned regions and all entities within that region
    │
ORGANISATION
    │  Access to organisation settings, users, and assigned entities
    │
VESSEL
    │  Access limited to assigned vessels and related data
    │
DEPARTMENT
    │  Access to department functions and assigned records only
    │
MODULE
    │  Access to specific modules and features only
    │
USER
       Individual access based on role and permissions
```

### Hierarchy rules
- A user is assigned at one or more levels simultaneously
- Higher levels do not automatically grant lower-level detail — financial data
  requires an explicit `finance` permission regardless of hierarchy level
- The most restrictive applicable rule always wins
- No user inherits access they have not been explicitly granted

---

## 3. Database Schema — Identity & Access

### Migration 010 — Organisations

```sql
CREATE TABLE organisations (
  org_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN (
                  'jls_internal','vessel_management','owner','family_office',
                  'supplier','training','crew_placement','agency','client'
                )),
  country_code  TEXT,
  active        BOOLEAN DEFAULT true,
  branding      JSONB,            -- { logoUrl, primaryColor, displayName }
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE locations (
  location_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES organisations(org_id),
  name          TEXT NOT NULL,    -- e.g. "UAE Office", "Saudi Arabia Office"
  country_code  TEXT NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'Asia/Dubai',
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

### Migration 011 — Roles & Modules

```sql
CREATE TABLE roles (
  role_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,     -- e.g. 'global_admin', 'captain', 'crew_member'
  display_name  TEXT NOT NULL,     -- e.g. 'Global Admin', 'Captain', 'Crew Member'
  scope         TEXT NOT NULL CHECK (scope IN (
                  'global','regional','organisation','vessel',
                  'department','module','crew'
                )),
  is_system     BOOLEAN DEFAULT false   -- system roles cannot be deleted
);

-- Seed system roles (insert on migration, not modifiable)
INSERT INTO roles (name, display_name, scope, is_system) VALUES
  ('global_admin',      'Global Admin',         'global',       true),
  ('regional_admin',    'Regional Admin',        'regional',     true),
  ('org_admin',         'Organisation Admin',    'organisation', true),
  ('vessel_admin',      'Vessel Admin',          'vessel',       true),
  ('dept_admin',        'Department Admin',      'department',   true),
  ('module_admin',      'Module Admin',          'module',       true),
  ('client_admin',      'Client Admin',          'organisation', true),
  ('supplier_admin',    'Supplier Admin',        'organisation', true),
  ('platform_owner',    'Platform Owner',        'global',       true),
  ('developer',         'Developer',             'global',       true),
  ('captain',           'Captain',               'vessel',       true),
  ('senior_crew',       'Senior Crew',           'vessel',       true),
  ('crew_member',       'Crew Member',           'vessel',       true),
  ('crew_manager',      'Crew Manager',          'vessel',       true),
  ('technical_mgr',     'Technical Manager',     'vessel',       true),
  ('owner',             'Owner',                 'vessel',       true),
  ('family_office',     'Family Office',         'organisation', true),
  ('supplier',          'Supplier',              'organisation', true),
  ('finance_user',      'Finance User',          'module',       true),
  ('training_user',     'Training User',         'module',       true),
  ('crew_placement',    'Crew Placement User',   'module',       true),
  ('agency_user',       'Agency User',           'module',       true),
  ('read_only',         'Read Only',             'module',       true);

CREATE TABLE modules (
  module_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  active        BOOLEAN DEFAULT true,
  icon          TEXT                    -- Tabler icon name e.g. 'ti-anchor'
);

-- Seed platform modules
INSERT INTO modules (name, display_name, icon) VALUES
  ('leo',              'Leo Intelligence',         'ti-robot'),
  ('crew_immigration', 'Crew & Immigration',       'ti-passport'),
  ('seaport',          'Seaport Immigration',      'ti-ship'),
  ('orbit',            'ORBIT — Operations',       'ti-sailboat'),
  ('shipsync',         'ShipSync — Logistics',     'ti-package'),
  ('waypoint',         'Waypoint — Chandlery',     'ti-shopping-cart'),
  ('provisioning',     'Superyacht Provisioning',  'ti-basket'),
  ('training',         'JLS Yacht Training',       'ti-certificate'),
  ('crew_placement',   'Crew Placement',           'ti-users'),
  ('finance',          'Finance',                  'ti-currency-dollar'),
  ('transport',        'Transport & Fleet',        'ti-car'),
  ('compass_card',     'Compass Card',             'ti-credit-card'),
  ('yacht_it',         'Yacht IT Solutions',       'ti-device-laptop'),
  ('agency',           'Agency & Destinations',    'ti-map-pin'),
  ('admin',            'Administration',           'ti-settings');
```

### Migration 012 — User Profiles (expanded)

```sql
-- Drop and recreate user_profiles with full access control fields
-- (replaces the simpler version in Migration 001)
CREATE TABLE user_profiles (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name   TEXT NOT NULL,
  email          TEXT NOT NULL,
  role_id        UUID NOT NULL REFERENCES roles(role_id),
  org_id         UUID REFERENCES organisations(org_id),
  location_id    UUID REFERENCES locations(location_id),
  avatar_url     TEXT,
  last_login     TIMESTAMPTZ,
  timezone       TEXT DEFAULT 'Asia/Dubai',
  mfa_enabled    BOOLEAN DEFAULT false,
  active         BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- Users can be assigned to multiple vessels
CREATE TABLE user_vessel_access (
  user_id    UUID REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  vessel_id  UUID REFERENCES vessels(vessel_id)     ON DELETE CASCADE,
  role_id    UUID REFERENCES roles(role_id),         -- role on this specific vessel
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ DEFAULT now(),
  active     BOOLEAN DEFAULT true,
  PRIMARY KEY (user_id, vessel_id)
);

-- Users can be assigned to multiple modules with permission levels
CREATE TABLE user_module_access (
  user_id          UUID REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  module_id        UUID REFERENCES modules(module_id)     ON DELETE CASCADE,
  permission_level TEXT NOT NULL CHECK (permission_level IN (
                     'view','create','edit','approve','finance','admin'
                   )),
  granted_by       UUID REFERENCES auth.users(id),
  granted_at       TIMESTAMPTZ DEFAULT now(),
  active           BOOLEAN DEFAULT true,
  PRIMARY KEY (user_id, module_id)
);

-- Users can be assigned to multiple locations
CREATE TABLE user_location_access (
  user_id     UUID REFERENCES user_profiles(user_id)   ON DELETE CASCADE,
  location_id UUID REFERENCES locations(location_id)   ON DELETE CASCADE,
  granted_by  UUID REFERENCES auth.users(id),
  granted_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, location_id)
);
```

### Migration 013 — Permission Rules Engine

```sql
-- Fine-grained permission overrides per user per data type
CREATE TABLE permission_rules (
  rule_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,      -- 'vessel_data','financial','crew_records','documents', etc.
  resource_id   UUID,               -- NULL = applies to all of this type
  can_view      BOOLEAN DEFAULT false,
  can_create    BOOLEAN DEFAULT false,
  can_edit      BOOLEAN DEFAULT false,
  can_approve   BOOLEAN DEFAULT false,
  can_finance   BOOLEAN DEFAULT false,
  granted_by    UUID REFERENCES auth.users(id),
  granted_at    TIMESTAMPTZ DEFAULT now(),
  expires_at    TIMESTAMPTZ           -- optional: time-limited access
);
```

### Migration 014 — Audit Log

```sql
CREATE TABLE audit_log (
  log_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES user_profiles(user_id),
  event_type    TEXT NOT NULL CHECK (event_type IN (
                  'login','logout','login_failed','mfa_challenge',
                  'permission_change','data_access','data_create',
                  'data_edit','data_delete','module_access',
                  'admin_action','export','report_generated'
                )),
  module        TEXT,               -- which module the event occurred in
  resource_type TEXT,               -- what was accessed
  resource_id   UUID,               -- which record
  ip_address    TEXT,
  user_agent    TEXT,
  metadata      JSONB,              -- any additional context
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX audit_log_user_idx    ON audit_log(user_id);
CREATE INDEX audit_log_created_idx ON audit_log(created_at DESC);
CREATE INDEX audit_log_type_idx    ON audit_log(event_type);
```

### Row-level security

```sql
ALTER TABLE organisations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_vessel_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_location_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          ENABLE ROW LEVEL SECURITY;

-- Users can see their own profile
CREATE POLICY "own_profile" ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Global and regional admins can see all profiles in their scope
-- (implemented via custom claims on JWT — see section 5)

-- Audit log: users see only their own entries; admins see all
CREATE POLICY "own_audit" ON audit_log FOR SELECT
  USING (user_id = auth.uid());
```

---

## 4. Permission Levels

Six discrete levels. Applied per module, per vessel, per location, or per data type.

```ts
export const PERMISSION_LEVELS = {
  view:    { label: 'View',    description: 'View and read data only' },
  create:  { label: 'Create',  description: 'Create new records' },
  edit:    { label: 'Edit',    description: 'Edit existing records' },
  approve: { label: 'Approve', description: 'Approve and validate records' },
  finance: { label: 'Finance', description: 'Access financial data' },
  admin:   { label: 'Admin',   description: 'Manage settings, users, and access' },
} as const;

// Permission levels are cumulative — 'edit' implies 'create' and 'view'
export const PERMISSION_ORDER = ['view','create','edit','approve','finance','admin'];
export const hasPermission = (userLevel: string, required: string) =>
  PERMISSION_ORDER.indexOf(userLevel) >= PERMISSION_ORDER.indexOf(required);
```

### Data access matrix by role

| Role              | Own Vessel Data | Other Vessel Data | Financial Data | Admin Functions |
|-------------------|:--------------:|:-----------------:|:--------------:|:---------------:|
| Captain           | ✅             | ❌                | ❌             | ❌              |
| Owner/Family Off. | ✅             | ✅ (own fleet)    | ✅             | ❌              |
| Crew Member       | ✅ (own only)  | ❌                | ❌             | ❌              |
| Regional Admin    | ✅             | ✅ (region only)  | ❌             | ❌              |
| Supplier          | ✅ (assigned)  | ❌                | ✅ (own POs)   | ❌              |
| Global Admin      | ✅             | ✅                | ✅             | ✅              |
| Platform Owner    | ✅             | ✅                | ✅             | ✅              |
| Finance User      | ❌             | ❌                | ✅             | ❌              |

---

## 5. Authentication (`app/api/auth/`)

### MFA requirement

MFA is mandatory for all users. Supabase Auth with TOTP (Time-based OTP).

```ts
// lib/auth/mfa.ts
export async function enforceMFA(userId: string): Promise<boolean> {
  const { data } = await supabase.auth.mfa.listFactors();
  const hasTOTP = data?.totp?.some(f => f.status === 'verified');
  if (!hasTOTP) {
    // Redirect to MFA setup — do not allow platform access until enrolled
    redirect('/auth/mfa-setup');
  }
  return true;
}
```

### JWT custom claims

On every login, write role, org, location, and permission summary into the
Supabase JWT custom claims. This enables RLS policies to reference them
without additional DB calls.

```ts
// supabase/functions/on-auth-user-created/index.ts
// Also called on every login via auth hook

export async function setUserClaims(userId: string) {
  const profile = await getUserProfile(userId);
  const vessels = await getUserVessels(userId);
  const modules = await getUserModules(userId);

  await supabase.auth.admin.updateUserById(userId, {
    app_metadata: {
      role:           profile.role_id,
      role_name:      profile.role.name,
      org_id:         profile.org_id,
      location_id:    profile.location_id,
      vessel_ids:     vessels.map(v => v.vessel_id),
      module_names:   modules.map(m => m.module.name),
      is_global_admin: ['global_admin','platform_owner','developer']
                        .includes(profile.role.name),
    }
  });
}
```

### Session management

```ts
// middleware.ts — runs on every request
export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient({ request });
  const { data: { session } } = await supabase.auth.getSession();

  // No session → redirect to login
  if (!session) return NextResponse.redirect(new URL('/login', request.url));

  // Write audit log entry for module access
  await logAuditEvent(session.user.id, 'module_access', {
    path: request.nextUrl.pathname,
    ip:   request.ip,
  });

  // Route to correct landing page based on role
  const landingPath = getLandingPath(session.user);
  if (request.nextUrl.pathname === '/dashboard' && landingPath !== '/dashboard') {
    return NextResponse.redirect(new URL(landingPath, request.url));
  }

  return response;
}
```

---

## 6. Landing Page Routing

Each stakeholder type lands on a different page after login.
Never route every user to the same dashboard.

```ts
// lib/auth/routing.ts

export function getLandingPath(user: UserWithClaims): string {
  const role = user.app_metadata?.role_name;
  const modules = user.app_metadata?.module_names ?? [];

  // Global / platform admins
  if (['global_admin','platform_owner','developer'].includes(role)) {
    return '/dashboard';                          // full platform dashboard
  }

  // Regional admins → their location dashboard
  if (role === 'regional_admin') {
    return `/dashboard/location/${user.app_metadata.location_id}`;
  }

  // Captains → their vessel dashboard
  if (role === 'captain' || role === 'vessel_admin') {
    const primaryVessel = user.app_metadata.vessel_ids?.[0];
    return primaryVessel
      ? `/dashboard/vessel/${primaryVessel}`
      : '/dashboard/vessel/unassigned';
  }

  // Crew members → crew portal
  if (role === 'crew_member' || role === 'senior_crew') {
    return '/portal/crew';
  }

  // Owners / family offices → client portal
  if (role === 'owner' || role === 'family_office') {
    return '/portal/owner';
  }

  // Suppliers → supplier portal
  if (role === 'supplier') {
    return '/portal/supplier';
  }

  // Module-specific single-access users
  if (modules.includes('training') && modules.length === 1) {
    return '/portal/training';
  }
  if (modules.includes('crew_placement') && modules.length === 1) {
    return '/portal/crew-placement';
  }
  if (modules.includes('finance') && modules.length === 1) {
    return '/portal/finance';
  }
  if (modules.includes('agency') && modules.length === 1) {
    return '/portal/agency';
  }

  // Crew manager / technical manager → vessel operations
  if (['crew_manager','technical_mgr'].includes(role)) {
    const primaryVessel = user.app_metadata.vessel_ids?.[0];
    return primaryVessel
      ? `/dashboard/vessel/${primaryVessel}`
      : '/dashboard';
  }

  // Fallback
  return '/dashboard';
}
```

---

## 7. Stakeholder Landing Pages

Build each of these as a distinct page. They share components but render
different content based on the authenticated user's context.

### 7.1 Vessel Landing Page
`app/dashboard/vessel/[vesselId]/page.tsx`

For: captains, senior crew, vessel managers, owners (vessel view), approved vessel users.

```ts
const VESSEL_DASHBOARD_MODULES = [
  { id: 'overview',       label: 'Vessel Overview',       permission: 'view'    },
  { id: 'open_requests',  label: 'Open Requests',         permission: 'view'    },
  { id: 'crew_visa',      label: 'Crew Visa Status',      permission: 'view'    },
  { id: 'clearance',      label: 'Clearance Status',      permission: 'view'    },
  { id: 'documents',      label: 'Documents',             permission: 'view'    },
  { id: 'invoices',       label: 'Invoices',              permission: 'finance' },
  { id: 'statement',      label: 'Statement of Account',  permission: 'finance' },
  { id: 'deliveries',     label: 'Deliveries',            permission: 'view'    },
  { id: 'transport',      label: 'Transport Bookings',    permission: 'view'    },
  { id: 'training',       label: 'Training Records',      permission: 'view'    },
  { id: 'ship_spares',    label: 'Ship Spares in Transit', permission: 'view'   },
  { id: 'provisioning',   label: 'Provisioning Requests', permission: 'view'   },
  { id: 'seaport',        label: 'Seaport Immigration',   permission: 'create'  },
  { id: 'alerts',         label: 'Operational Alerts',    permission: 'view'    },
];
// Each tile only renders if the user has the required permission for that vessel
```

### 7.2 Location Landing Page
`app/dashboard/location/[locationId]/page.tsx`

For: JLS regional office users (UAE, Saudi Arabia, Maldives, Oman, etc.)

```ts
const LOCATION_DASHBOARD_MODULES = [
  { id: 'active_yachts',   label: 'Active Yachts in Location' },
  { id: 'port_calls',      label: 'Port Calls' },
  { id: 'clearance',       label: 'Clearance Requests' },
  { id: 'crew_movements',  label: 'Crew Movements' },
  { id: 'logistics',       label: 'Logistics Jobs' },
  { id: 'tasks',           label: 'Pending Tasks' },
  { id: 'suppliers',       label: 'Local Suppliers' },
  { id: 'invoices',        label: 'Local Invoices' },
  { id: 'updates',         label: 'Local Operational Updates' },
];
```

### 7.3 Crew Portal
`app/portal/crew/page.tsx`

For: crew members linked to a vessel or organisation.

```ts
const CREW_PORTAL_MODULES = [
  { id: 'profile',         label: 'Personal Profile' },
  { id: 'visa_status',     label: 'Visa Status' },
  { id: 'passport_expiry', label: 'Passport Expiry' },
  { id: 'certificates',    label: 'Training Certificates' },
  { id: 'courses',         label: 'Course Bookings' },
  { id: 'placement',       label: 'Crew Placement Opportunities' },
  { id: 'daywork',         label: 'Daywork Bookings' },
  { id: 'gate_pass',       label: 'Gate Pass Status' },
  { id: 'notifications',   label: 'Notifications' },
];
```

### 7.4 Owner / Client Portal
`app/portal/owner/page.tsx`

For: vessel owners, family offices, client representatives, managers.

```ts
const OWNER_PORTAL_MODULES = [
  { id: 'vessel_summary',  label: 'Vessel Summary' },
  { id: 'statement',       label: 'Statement of Account',     permission: 'finance' },
  { id: 'invoices',        label: 'Invoices',                 permission: 'finance' },
  { id: 'quotations',      label: 'Approved Quotations',      permission: 'approve' },
  { id: 'service_history', label: 'Service History' },
  { id: 'live_requests',   label: 'Live Requests' },
  { id: 'reports',         label: 'Reports' },
  { id: 'documents',       label: 'Document Access' },
];
// Financial tiles only render if user has finance permission
```

### 7.5 Supplier Portal
`app/portal/supplier/page.tsx`

For: approved suppliers and service partners.

```ts
const SUPPLIER_PORTAL_MODULES = [
  { id: 'assigned_jobs',   label: 'Assigned Jobs' },
  { id: 'purchase_orders', label: 'Purchase Orders' },
  { id: 'deliveries',      label: 'Delivery Instructions' },
  { id: 'invoice_submit',  label: 'Invoice Submission' },
  { id: 'job_status',      label: 'Job Status Updates' },
];
// Supplier sees only records assigned to them — enforced by RLS
```

### 7.6 Module-Specific Portals

Single-purpose landing pages for users with access to only one module.

```
/portal/training         → JLS Yacht Training Institute
/portal/crew-placement   → Crew Placement module
/portal/finance          → Finance module
/portal/agency           → Agency & Destination Services
/portal/compass-card     → Compass Card
/portal/shipsync         → ShipSync logistics
```

---

## 8. Access Control Middleware (`lib/auth/access.ts`)

Every page and API route must call this before rendering or executing.

```ts
export async function requireAccess(
  userId: string,
  resource: {
    module?:     string;
    vesselId?:   string;
    locationId?: string;
    permission?: keyof typeof PERMISSION_LEVELS;
  }
): Promise<void> {
  const claims = await getUserClaims(userId);

  // Global admins always pass
  if (claims.is_global_admin) return;

  // Module check
  if (resource.module) {
    const hasModule = claims.module_names?.includes(resource.module);
    if (!hasModule) throw new AccessDeniedError(`No access to module: ${resource.module}`);
  }

  // Vessel check
  if (resource.vesselId) {
    const hasVessel = claims.vessel_ids?.includes(resource.vesselId);
    if (!hasVessel) throw new AccessDeniedError(`No access to vessel: ${resource.vesselId}`);
  }

  // Location check
  if (resource.locationId) {
    const hasLocation = await checkLocationAccess(userId, resource.locationId);
    if (!hasLocation) throw new AccessDeniedError(`No access to location: ${resource.locationId}`);
  }

  // Permission level check
  if (resource.permission) {
    const userLevel = await getUserPermissionLevel(userId, resource.module!);
    if (!hasPermission(userLevel, resource.permission)) {
      throw new AccessDeniedError(`Permission '${resource.permission}' required`);
    }
  }
}

export class AccessDeniedError extends Error {
  status = 403;
  constructor(message: string) { super(message); }
}
```

### Usage pattern — every API route and page must follow this

```ts
// Example: app/api/visa/requests/route.ts
export async function POST(req: Request) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  await requireAccess(user.id, {
    module:     'crew_immigration',
    permission: 'create',
  });

  // ... rest of handler
}

// Example: app/dashboard/vessel/[vesselId]/page.tsx
export default async function VesselPage({ params }) {
  const { data: { user } } = await supabase.auth.getUser();

  await requireAccess(user.id, {
    module:    'crew_immigration',
    vesselId:  params.vesselId,
    permission: 'view',
  });

  // ... render page
}
```

---

## 9. Admin Panel (`app/dashboard/admin/`)

The admin panel is accessible only to users with `admin` permission
on the `admin` module. Global and regional admins see it by default.

### Admin panel structure

```
app/dashboard/admin/
  page.tsx                    # Admin overview — user stats, recent activity
  users/
    page.tsx                  # User list — search, filter by role/org/vessel
    new/
      page.tsx                # Create new user
    [userId]/
      page.tsx                # Edit user — role, org, vessels, modules, permissions
  organisations/
    page.tsx                  # Organisation list
    [orgId]/
      page.tsx                # Edit organisation — users, vessels, branding
  vessels/
    page.tsx                  # Vessel list + assignment management
  locations/
    page.tsx                  # Location list + regional access
  modules/
    page.tsx                  # Module enable/disable per user or org
  permissions/
    page.tsx                  # Permission rule overview + editor
  audit/
    page.tsx                  # Audit log — searchable, filterable, exportable
  roles/
    page.tsx                  # Role definitions (system roles read-only)
```

### Admin capabilities by admin type

```ts
export const ADMIN_CAPABILITIES = {
  global_admin: {
    canManage: ['all'],
    canSeeAuditLog: true,
    canChangeRoles: true,
    canSuspendUsers: true,
    canDeleteUsers: true,
  },
  regional_admin: {
    canManage: ['users_in_region','vessels_in_region','locations_in_region'],
    canSeeAuditLog: 'region_only',
    canChangeRoles: false,
    canSuspendUsers: true,
    canDeleteUsers: false,
  },
  org_admin: {
    canManage: ['users_in_org','vessels_in_org'],
    canSeeAuditLog: 'org_only',
    canChangeRoles: false,
    canSuspendUsers: true,
    canDeleteUsers: false,
  },
  vessel_admin: {
    canManage: ['users_on_vessel'],
    canSeeAuditLog: 'vessel_only',
    canChangeRoles: false,
    canSuspendUsers: false,
    canDeleteUsers: false,
  },
  client_admin: {
    canManage: ['users_in_client_org'],
    canSeeAuditLog: false,
    canChangeRoles: false,
    canSuspendUsers: true,
    canDeleteUsers: false,
  },
  supplier_admin: {
    canManage: ['users_in_supplier_org'],
    canSeeAuditLog: false,
    canChangeRoles: false,
    canSuspendUsers: true,
    canDeleteUsers: false,
  },
};
```

---

## 10. Audit Logging (`lib/auth/audit.ts`)

Every meaningful action must be logged. No exceptions.

```ts
export async function logAuditEvent(
  userId: string,
  eventType: AuditEventType,
  metadata?: Record<string, unknown>
) {
  await supabase.from('audit_log').insert({
    user_id:       userId,
    event_type:    eventType,
    module:        metadata?.module   ?? null,
    resource_type: metadata?.resource ?? null,
    resource_id:   metadata?.id       ?? null,
    ip_address:    metadata?.ip       ?? null,
    user_agent:    metadata?.ua       ?? null,
    metadata:      metadata           ?? null,
  });
}

// Call this from:
// - middleware.ts        → login, logout, module_access
// - every API POST/PUT  → data_create, data_edit
// - every API DELETE    → data_delete
// - admin panel actions → admin_action, permission_change
// - report generation   → report_generated
// - document downloads  → data_access
```

---

## 11. Branding & White-Label Support

Each stakeholder landing page can carry context-specific branding.
All pages remain within Polaris — branding is a display layer only.

```ts
// lib/auth/branding.ts
export async function getPageBranding(context: {
  orgId?: string;
  locationId?: string;
  portalType?: string;
}): Promise<PageBranding> {
  if (context.orgId) {
    const org = await getOrganisation(context.orgId);
    if (org.branding) return org.branding;
  }

  // Default Polaris branding
  return {
    logoUrl:      null,
    displayName:  'Polaris',
    primaryColor: '#00C4CC',    // signal cyan
    accentColor:  '#E8A020',    // Leo amber
  };
}
```

Branding is applied to the page header and login screen only.
Navigation, components, and data remain standard Polaris.

Location-specific examples:
- Saudi office → can carry Saudi office branding on their landing page
- Training portal → can carry JLS Yacht Training Institute branding
- Crew placement → can carry Crew Placement branding
- All other pages → standard Polaris brand

---

## 12. Security Requirements

All of the following must be implemented. None are optional.

```ts
export const SECURITY_REQUIREMENTS = {
  authentication: {
    mfa:                  true,    // TOTP — mandatory for all users
    sso:                  true,    // Single Sign-On support
    sessionManagement:    true,    // auto-expire inactive sessions
    deviceVerification:   true,    // flag new device logins
  },
  dataSecurity: {
    encryptedAtRest:      true,    // Supabase handles this
    encryptedInTransit:   true,    // HTTPS only
    secureDocStorage:     true,    // Supabase Storage with signed URLs
    regularSecurityScans: true,
    vulnerabilityMonitor: true,
  },
  infrastructure: {
    regionalRedundancy:   true,
    automatedBackups:     true,
    disasterRecovery:     true,
    highAvailability:     true,
  },
  governance: {
    fullAuditTrail:       true,    // every action logged
    loginHistory:         true,
    permissionChangeLog:  true,
    leastPrivilegeAccess: true,    // access granted by need, not by default
  },
};
```

---

## 13. Leo Integration — Access-Aware Briefings

Leo's briefing must respect the authenticated user's access scope.
Leo never surfaces data the user is not authorised to see.

```ts
// Add to buildSystemPrompt() in app/api/leo/briefing/route.ts

ACCESS CONTEXT:
The authenticated user has role: ${context.user.role}
They have access to vessels: ${context.user.vessel_ids?.join(', ') ?? 'none assigned'}
They have access to modules: ${context.user.module_names?.join(', ') ?? 'standard'}
They are located at: ${context.user.location_id ?? 'not assigned'}

SCOPE RULE — CRITICAL:
Only reference data within the user's access scope.
Never mention vessels, locations, or data the user cannot see.
A crew member should only hear about their own visa and training status.
A captain should only hear about their assigned vessel.
A regional admin should only hear about their region.
A global admin or platform owner may see the full picture.
```

---

## 14. Migration Run Order

Run all migrations in this exact sequence:

```
001_core.sql              → user_profiles (basic), tasks, changelog, alerts, metrics
002_visa_core.sql         → crew_members, passports, vessels, applications, alerts
003_visa_offices.sql      → offices, office_vessel_access, office_members
004_seaport_events.sql    → seaport_events (visa compliance)
005_seaport_requests.sql  → seaport_requests, arrivals, departures, sla
010_organisations.sql     → organisations, locations
011_roles_modules.sql     → roles (with seed data), modules (with seed data)
012_user_profiles_v2.sql  → expanded user_profiles, user_vessel_access,
                             user_module_access, user_location_access
013_permission_rules.sql  → permission_rules
014_audit_log.sql         → audit_log
```

**Note:** Migration 012 expands `user_profiles`. If the basic version from
Migration 001 is already in place, write 012 as an ALTER TABLE series, not
a CREATE TABLE. The columns added are: `email`, `role_id`, `org_id`,
`location_id`, `mfa_enabled`, `active`, `updated_at`.

---

## 15. Key Rules for Claude Code — This File

1. **Build the access layer before any operational module UI.** No exceptions.
2. **Every API route calls `requireAccess()`** before executing. No unprotected routes.
3. **Every page checks access before rendering.** Return 403 or redirect to login if denied.
4. **MFA is mandatory.** If a user has no verified TOTP factor, redirect to `/auth/mfa-setup`. Do not allow platform access.
5. **JWT custom claims carry role, org, vessel list, and module list.** Refresh claims on every login and on any permission change.
6. **Landing page routing is role-driven.** Never route all users to `/dashboard`. Use `getLandingPath()`.
7. **Every action is audit logged.** Call `logAuditEvent()` from middleware, all API routes, and the admin panel.
8. **Least privilege by default.** New users have no access until explicitly granted.
9. **Branding is display-only.** It never changes data visibility or access rules.
10. **Leo respects access scope.** Leo's briefing context is filtered to the user's permitted data only.
11. **Admin types are scoped.** A vessel admin cannot manage users outside their vessel. A regional admin cannot manage outside their region.
12. **Roles seed data is fixed.** System roles (`is_system = true`) cannot be edited or deleted through the UI.
13. **RLS is the last line of defence.** Even if middleware or API access checks pass incorrectly, RLS at the database level prevents data leakage.
14. **Scale targets are non-negotiable.** Schema must support 350 vessels, 4,500 crew, and 11 locations from day one. Do not build for a smaller scope.

---

*Polaris — Access Control & Identity Architecture v1.0 — June 2026 — Confidential*
*Adapted from: Aquila One Login, Access Control & Stakeholder Landing Pages — First Draft*
