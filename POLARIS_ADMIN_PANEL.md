# POLARIS_ADMIN_PANEL.md
# Admin Panel — Users, Roles, RBAC Matrix & Audit Log
# Option A: Embedded in sidebar — amber-accented section, visible to global_admin only
# Drop alongside CLAUDE.md, POLARIS_ACCESS_CONTROL.md, POLARIS_VISA_MODULE.md
#
# Authors: Mike Fetton / Matt Tighe
# Version: 1.0 — June 2026
# Tickets: #133 (admin panel UI), #134 (audit log), #128–#132 (access control prereqs)

---

## CRITICAL BUILD ORDER

The admin panel depends on the access control layer. Do NOT build this until
migrations 010–014 from `POLARIS_ACCESS_CONTROL.md` are complete and deployed.

Prerequisites:
- ✅ Migration 010 — organisations, locations, vessels tables
- ✅ Migration 011 — roles, user_roles, permission_rules tables  
- ✅ Migration 012 — modules, module_permissions tables
- ✅ Migration 013 — audit_log table
- ✅ Migration 014 — MFA enforcement + JWT custom claims
- ✅ `requireAccess()` middleware wired into all API routes
- ✅ `logAuditEvent()` called from middleware and all mutation routes

---

## 1. Overview

The admin panel is embedded in the main Polaris sidebar as a collapsible
amber-accented section. It renders ONLY for users whose JWT contains
`role: 'global_admin'` or `role: 'org_admin'`. All other roles see nothing —
the section does not render at all, not even as a disabled/greyed state.

### Sidebar placement (Option A)

```
[ POLARIS logo — home button ]
[ Vessel selector ]

OVERVIEW
  Leo
  Vessel Overview
  My Fleet (Live)
  Crew
  Crew & Immigration ▾
  Logistics
  Operations
  Maintenance
  Finance

──────────────────────────────  ← divider
                                   ← renders only if is_admin
┌─ ADMIN  [amber border box] ─┐
│  Admin Panel                │
│  Users & Roles              │
│  Organisations              │
│  Permissions                │
│  Audit Log                  │
└─────────────────────────────┘

[ Avatar · email · settings · logout ]
```

### Routes

```
/admin                     → redirects to /admin/users
/admin/users               → Users & Roles page (this spec)
/admin/organisations       → Organisations page (separate spec)
/admin/permissions         → RBAC matrix page (this spec)
/admin/audit               → Audit log page (this spec)
```

All `/admin/*` routes are server-side protected. `requireAccess()` must
validate `global_admin` or `org_admin` before rendering anything.

---

## 2. Database Schema

All tables are already created in migrations 010–014. This section
documents the tables the admin panel reads and writes.

### 2.1 Tables used

```sql
-- From migration 011
user_roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role          text NOT NULL,          -- see roles enum below
  org_id        uuid REFERENCES organisations(id),
  vessel_id     uuid REFERENCES vessels(id),
  location_id   uuid REFERENCES locations(id),
  granted_by    uuid REFERENCES auth.users(id),
  granted_at    timestamptz DEFAULT now(),
  expires_at    timestamptz,            -- null = no expiry
  is_active     boolean DEFAULT true
)

-- From migration 011
permission_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role          text NOT NULL,
  resource      text NOT NULL,          -- e.g. 'visa', 'crew', 'finance'
  action        text NOT NULL,          -- 'view' | 'create' | 'edit' | 'approve' | 'delete'
  scope         text NOT NULL,          -- 'global' | 'org' | 'vessel' | 'own'
  conditions    jsonb                   -- optional extra conditions
)

-- From migration 013
audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    text NOT NULL,          -- see event types enum below
  actor_id      uuid REFERENCES auth.users(id),
  actor_email   text NOT NULL,          -- denormalised for log permanence
  actor_role    text NOT NULL,          -- role at time of event
  target_type   text,                   -- 'user' | 'vessel' | 'visa' | 'crew' etc.
  target_id     uuid,
  target_label  text,                   -- human-readable target name
  detail        text NOT NULL,          -- plain English description of what happened
  ip_address    inet,
  user_agent    text,
  result        text NOT NULL,          -- 'success' | 'blocked' | 'pending' | 'failed'
  created_at    timestamptz DEFAULT now()
)
```

### 2.2 Roles enum

```ts
export type PolarisRole =
  | 'global_admin'      // JLS staff — full platform access
  | 'org_admin'         // Manages users within their own org only
  | 'jls_staff'         // Internal operations team
  | 'vessel_owner'      // Owner or family office — scoped to their vessel(s)
  | 'captain'           // Scoped to their vessel
  | 'crew'              // Own profile only
  | 'supplier'          // Own org records + invoices
  | 'port_agent'        // Scoped to their marina/port location
  | 'training_user'     // Training institute module only
  | 'placement_user';   // Crew placement module only
```

### 2.3 Audit event types enum

```ts
export type AuditEventType =
  | 'AUTH'      // Login, logout, MFA events, failed attempts
  | 'PERM'      // Role changes, permission grants/revokes
  | 'DATA'      // Record create/edit/delete (visa, crew, vessel etc.)
  | 'EXPORT'    // Any data export — CSV, PDF, manifest
  | 'SEC'       // Security events — lockouts, suspicious activity
  | 'ADMIN'     // Admin panel actions
  | 'SYSTEM';   // Automated jobs — compliance checks, reminders
```

### 2.4 RLS policies for admin tables

```sql
-- user_roles: only global_admin can read all rows; org_admin sees own org only
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "global_admin_all_user_roles" ON user_roles
  FOR ALL USING (
    (auth.jwt() ->> 'role') = 'global_admin'
  );

CREATE POLICY "org_admin_own_org_user_roles" ON user_roles
  FOR SELECT USING (
    (auth.jwt() ->> 'role') = 'org_admin'
    AND org_id = (auth.jwt() ->> 'org_id')::uuid
  );

-- audit_log: global_admin reads all; org_admin reads own org only; no user writes directly
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "global_admin_all_audit" ON audit_log
  FOR SELECT USING (
    (auth.jwt() ->> 'role') = 'global_admin'
  );

CREATE POLICY "org_admin_own_audit" ON audit_log
  FOR SELECT USING (
    (auth.jwt() ->> 'role') = 'org_admin'
    AND actor_id IN (
      SELECT user_id FROM user_roles
      WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );

-- audit_log INSERT via service_role only (logAuditEvent uses service client)
CREATE POLICY "service_role_insert_audit" ON audit_log
  FOR INSERT WITH CHECK (true);  -- enforced at service layer, not row level
```

---

## 3. API Routes

All routes live under `app/api/admin/`. Every route must call
`requireAccess()` at the top before any logic.

```
GET  /api/admin/users                → paginated user list with roles
GET  /api/admin/users/[id]           → single user detail
POST /api/admin/users/invite         → invite new user (send Supabase magic link)
PATCH /api/admin/users/[id]/role     → update user role
PATCH /api/admin/users/[id]/suspend  → suspend / unsuspend user
DELETE /api/admin/users/[id]         → soft delete (set is_active = false)

GET  /api/admin/permissions          → full RBAC matrix for all roles
PATCH /api/admin/permissions         → update a specific permission rule

GET  /api/admin/audit                → paginated audit log with filters
GET  /api/admin/audit/export         → CSV export of filtered audit log
```

### 3.1 requireAccess helper (already in lib/auth/access.ts)

```ts
// Every admin API route must start with this
import { requireAccess } from '@/lib/auth/access';

export async function GET(request: Request) {
  const session = await requireAccess(request, ['global_admin', 'org_admin']);
  if (!session.ok) return session.response; // 401 or 403
  
  // ... rest of handler
}
```

### 3.2 logAuditEvent helper (already in lib/auth/audit.ts)

```ts
// Call after every state-changing admin action
import { logAuditEvent } from '@/lib/auth/audit';

await logAuditEvent({
  event_type: 'PERM',
  actor_id:   session.user.id,
  actor_email: session.user.email,
  actor_role:  session.user.role,
  target_type: 'user',
  target_id:   targetUserId,
  target_label: targetEmail,
  detail:      `Role updated: ${targetEmail} → ${newRole} (was: ${oldRole})`,
  ip_address:  request.headers.get('x-forwarded-for'),
  result:      'success',
});
```

### 3.3 User list route

```ts
// app/api/admin/users/route.ts
export async function GET(request: Request) {
  const session = await requireAccess(request, ['global_admin', 'org_admin']);
  if (!session.ok) return session.response;

  const { searchParams } = new URL(request.url);
  const page     = parseInt(searchParams.get('page') ?? '1');
  const pageSize = parseInt(searchParams.get('pageSize') ?? '25');
  const search   = searchParams.get('search') ?? '';
  const role     = searchParams.get('role') ?? '';

  // org_admin scope filter
  const scopeFilter = session.user.role === 'org_admin'
    ? `AND ur.org_id = '${session.user.org_id}'`
    : '';

  const { data, error, count } = await supabaseAdmin
    .from('user_roles')
    .select(`
      *,
      user:auth.users!user_id(id, email, last_sign_in_at, created_at),
      mfa_factors:auth.mfa_factors!user_id(id, factor_type, status)
    `, { count: 'exact' })
    .eq('is_active', true)
    .ilike('user.email', search ? `%${search}%` : '%')
    .eq(role ? 'role' : 'is_active', role || true)
    .order('granted_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  return Response.json({ users: data, total: count, page, pageSize });
}
```

### 3.4 Invite user route

```ts
// app/api/admin/users/invite/route.ts
export async function POST(request: Request) {
  const session = await requireAccess(request, ['global_admin', 'org_admin']);
  if (!session.ok) return session.response;

  const { email, role, org_id, vessel_id, location_id } = await request.json();

  // Validate org_admin cannot grant roles above their own level
  if (session.user.role === 'org_admin') {
    const allowedRoles: PolarisRole[] = ['captain', 'crew', 'supplier', 'port_agent'];
    if (!allowedRoles.includes(role)) {
      return Response.json({ error: 'Insufficient permission to grant this role' }, { status: 403 });
    }
  }

  // Send Supabase invite
  const { data: inviteData, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { role, org_id, vessel_id, location_id },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/mfa-setup`,
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });

  // Write user_role row immediately (pending MFA enrolment)
  await supabaseAdmin.from('user_roles').insert({
    user_id: inviteData.user.id,
    role, org_id, vessel_id, location_id,
    granted_by: session.user.id,
    is_active: false,  // activated only after MFA enrolment
  });

  await logAuditEvent({
    event_type: 'PERM',
    actor_id: session.user.id,
    actor_email: session.user.email,
    actor_role: session.user.role,
    target_type: 'user',
    target_label: email,
    detail: `User invited: ${email} — role: ${role}`,
    ip_address: request.headers.get('x-forwarded-for'),
    result: 'pending',
  });

  return Response.json({ success: true });
}
```

### 3.5 Audit log route with filters

```ts
// app/api/admin/audit/route.ts
export async function GET(request: Request) {
  const session = await requireAccess(request, ['global_admin', 'org_admin']);
  if (!session.ok) return session.response;

  const { searchParams } = new URL(request.url);
  const page       = parseInt(searchParams.get('page') ?? '1');
  const pageSize   = parseInt(searchParams.get('pageSize') ?? '50');
  const eventType  = searchParams.get('event_type') ?? '';
  const result     = searchParams.get('result') ?? '';
  const actorEmail = searchParams.get('actor') ?? '';
  const dateFrom   = searchParams.get('from') ?? '';
  const dateTo     = searchParams.get('to') ?? '';

  let query = supabaseAdmin
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (eventType)  query = query.eq('event_type', eventType);
  if (result)     query = query.eq('result', result);
  if (actorEmail) query = query.ilike('actor_email', `%${actorEmail}%`);
  if (dateFrom)   query = query.gte('created_at', dateFrom);
  if (dateTo)     query = query.lte('created_at', dateTo);

  // org_admin scope — only see events from users in their org
  if (session.user.role === 'org_admin') {
    const { data: orgUsers } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .eq('org_id', session.user.org_id);
    const userIds = orgUsers?.map(u => u.user_id) ?? [];
    query = query.in('actor_id', userIds);
  }

  const { data, error, count } = await query;
  return Response.json({ events: data, total: count, page, pageSize });
}
```

---

## 4. React Components

### 4.1 File structure

```
components/
├── admin/
│   ├── AdminShell.tsx            # Layout wrapper — topbar + section heading
│   ├── AdminSidebarSection.tsx   # Amber-accented sidebar block (Option A)
│   ├── users/
│   │   ├── UserTable.tsx         # Paginated user list with role badges
│   │   ├── UserRow.tsx           # Single row — avatar, email, role, MFA, actions
│   │   ├── InviteUserModal.tsx   # Invite form — email, role, scope selectors
│   │   ├── EditRoleModal.tsx     # Change role / scope for existing user
│   │   └── RoleBadge.tsx         # Colour-coded role pill
│   ├── rbac/
│   │   ├── RBACMatrix.tsx        # Full permissions grid
│   │   ├── PermissionCell.tsx    # ✓ / — / scoped cell with tooltip
│   │   └── EditPermissionModal.tsx  # Edit a single permission rule
│   └── audit/
│       ├── AuditTable.tsx        # Paginated audit log table
│       ├── AuditRow.tsx          # Single event row
│       ├── AuditFilters.tsx      # Event type, date range, actor filters
│       ├── EventTypeBadge.tsx    # AUTH / PERM / DATA / SEC / EXPORT badges
│       └── AuditExportButton.tsx # Triggers CSV export
```

### 4.2 AdminSidebarSection.tsx

```tsx
// components/admin/AdminSidebarSection.tsx
// Renders in the sidebar ONLY for global_admin and org_admin.
// Uses amber accent to visually separate from operational nav.

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/auth/useSession';
import {
  ShieldLock, UsersGroup, Building,
  LockAccess, ListSearch
} from '@tabler/icons-react';

const ADMIN_NAV = [
  { href: '/admin',              label: 'Admin Panel',    icon: ShieldLock  },
  { href: '/admin/users',        label: 'Users & Roles',  icon: UsersGroup  },
  { href: '/admin/organisations',label: 'Organisations',  icon: Building    },
  { href: '/admin/permissions',  label: 'Permissions',    icon: LockAccess  },
  { href: '/admin/audit',        label: 'Audit Log',      icon: ListSearch  },
];

export function AdminSidebarSection() {
  const { user } = useSession();
  const pathname = usePathname();

  // Only render for admin roles — no placeholder, no disabled state
  if (!['global_admin', 'org_admin'].includes(user?.role ?? '')) return null;

  return (
    <div className="mx-2 my-1.5 rounded-lg border border-amber-500/20
                    bg-amber-500/[0.07] overflow-hidden">
      {ADMIN_NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== '/admin' && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px]
                        transition-colors
                        ${active
                          ? 'bg-amber-500/15 text-amber-400 font-semibold'
                          : 'text-amber-500 hover:bg-amber-500/10'
                        }`}
          >
            <Icon size={13} />
            {label}
            {label === 'Admin Panel' && (
              <span className="ml-auto text-[9px] font-bold tracking-wider
                               bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
                {user?.role === 'global_admin' ? 'GLOBAL' : 'ORG'}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
```

### 4.3 RoleBadge.tsx

```tsx
// components/admin/users/RoleBadge.tsx
const ROLE_STYLES: Record<string, string> = {
  global_admin:   'bg-orange-500/15 text-orange-400',
  org_admin:      'bg-orange-400/12 text-orange-300',
  jls_staff:      'bg-cyan-500/12 text-cyan-400',
  vessel_owner:   'bg-emerald-500/12 text-emerald-400',
  captain:        'bg-sky-500/12 text-sky-400',
  crew:           'bg-slate-500/20 text-slate-400',
  supplier:       'bg-amber-500/12 text-amber-400',
  port_agent:     'bg-indigo-500/12 text-indigo-400',
  training_user:  'bg-purple-500/12 text-purple-400',
  placement_user: 'bg-pink-500/12 text-pink-400',
};

export function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px]
                      font-bold tracking-wide ${ROLE_STYLES[role] ?? 'bg-gray-500/20 text-gray-400'}`}>
      {role.replace(/_/g, ' ')}
    </span>
  );
}
```

### 4.4 UserTable.tsx (abbreviated)

```tsx
// components/admin/users/UserTable.tsx
'use client';
import { useState } from 'react';
import { RoleBadge } from './RoleBadge';
import { InviteUserModal } from './InviteUserModal';

export function UserTable({ users, total, onRefresh }: UserTableProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-3">
        <input
          placeholder="Search by email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-[#0f1d2e] border border-white/10 rounded-md
                     px-3 py-1.5 text-xs text-white placeholder:text-white/30"
        />
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="bg-[#0f1d2e] border border-white/10 rounded-md
                     px-3 py-1.5 text-xs text-white"
        >
          <option value="">All roles</option>
          <option value="global_admin">Global Admin</option>
          <option value="jls_staff">JLS Staff</option>
          <option value="captain">Captain</option>
          <option value="vessel_owner">Vessel Owner</option>
          <option value="supplier">Supplier</option>
          <option value="port_agent">Port Agent</option>
        </select>
        <button
          onClick={() => setInviteOpen(true)}
          className="bg-cyan-500/10 border border-cyan-500/25 text-cyan-400
                     text-xs px-3 py-1.5 rounded-md hover:bg-cyan-500/20 transition-colors"
        >
          + Invite user
        </button>
      </div>

      {/* Table */}
      <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr className="bg-[#0f1d2e] text-white/40 text-[9px] font-semibold tracking-wider">
            <th className="text-left px-3 py-2 w-48">User</th>
            <th className="text-left px-3 py-2 w-28">Role</th>
            <th className="text-left px-3 py-2 w-32">Scope</th>
            <th className="text-left px-3 py-2 w-20">Status</th>
            <th className="text-center px-3 py-2 w-12">MFA</th>
            <th className="text-left px-3 py-2 w-20">Last seen</th>
            <th className="text-left px-3 py-2 w-14">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <UserRow key={user.id} user={user} onRefresh={onRefresh} />
          ))}
        </tbody>
      </table>

      {inviteOpen && (
        <InviteUserModal
          onClose={() => setInviteOpen(false)}
          onSuccess={onRefresh}
        />
      )}
    </div>
  );
}
```

### 4.5 RBACMatrix.tsx (abbreviated)

```tsx
// components/admin/rbac/RBACMatrix.tsx
// Renders the permissions grid. Cells are either:
//   ✓  (green)   — full access at this role
//   —  (grey)    — no access
//   scoped label (amber) — access limited by scope (own vessel, own org etc.)

const ROLES   = ['global_admin','jls_staff','vessel_owner','captain','crew','supplier','port_agent'];
const ACTIONS = ['view','create','edit','approve','finance','manage_users','admin_panel','audit_log','leo_briefings'];

export function RBACMatrix({ rules }: { rules: PermissionRule[] }) {
  // Build lookup: rules[role][action] = scope | 'full' | 'none'
  const lookup = buildLookup(rules);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr className="bg-[#0f1d2e]">
            <th className="text-left px-3 py-2 text-white/40 text-[9px] tracking-wider w-28">
              Permission
            </th>
            {ROLES.map(role => (
              <th key={role} className="text-center px-2 py-2 text-[9px] text-white/40 tracking-wider">
                {role.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ACTIONS.map(action => (
            <tr key={action} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
              <td className="px-3 py-2 text-white/80 font-medium">
                {action.replace(/_/g, ' ')}
              </td>
              {ROLES.map(role => (
                <PermissionCell
                  key={`${role}-${action}`}
                  scope={lookup[role]?.[action] ?? 'none'}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### 4.6 AuditTable.tsx (abbreviated)

```tsx
// components/admin/audit/AuditTable.tsx
export function AuditTable({ events, total, filters, onFilterChange }: AuditTableProps) {
  return (
    <div>
      <AuditFilters filters={filters} onChange={onFilterChange} />
      <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr className="bg-[#0f1d2e] text-white/40 text-[9px] font-semibold tracking-wider">
            <th className="text-left px-3 py-2 w-28">Timestamp</th>
            <th className="text-left px-3 py-2 w-16">Type</th>
            <th className="text-left px-3 py-2 w-36">Actor</th>
            <th className="text-left px-3 py-2">Detail</th>
            <th className="text-left px-3 py-2 w-24">IP address</th>
            <th className="text-left px-3 py-2 w-16">Result</th>
          </tr>
        </thead>
        <tbody>
          {events.map(event => (
            <AuditRow key={event.id} event={event} />
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between px-3 py-2 border-t border-white/[0.05]">
        <span className="text-[10px] text-white/30">{total} events</span>
        <AuditExportButton filters={filters} />
      </div>
    </div>
  );
}
```

### 4.7 EventTypeBadge.tsx

```tsx
// components/admin/audit/EventTypeBadge.tsx
const EVENT_STYLES: Record<string, string> = {
  AUTH:   'bg-cyan-500/12 text-cyan-400',
  PERM:   'bg-orange-500/15 text-orange-400',
  DATA:   'bg-emerald-500/12 text-emerald-400',
  SEC:    'bg-red-500/12 text-red-400',
  EXPORT: 'bg-amber-500/12 text-amber-400',
  ADMIN:  'bg-purple-500/12 text-purple-400',
  SYSTEM: 'bg-slate-500/15 text-slate-400',
};

export function EventTypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px]
                      font-bold ${EVENT_STYLES[type] ?? EVENT_STYLES.SYSTEM}`}>
      {type}
    </span>
  );
}
```

---

## 5. Page Components (Next.js App Router)

### 5.1 Admin shell layout

```tsx
// app/admin/layout.tsx
import { requireAccess } from '@/lib/auth/access';
import { AdminSidebarSection } from '@/components/admin/AdminSidebarSection';
import { redirect } from 'next/navigation';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAccess(null, ['global_admin', 'org_admin']);
  if (!session.ok) redirect('/auth/login?reason=unauthorized');

  return (
    <div className="flex h-screen overflow-hidden bg-[#111827]">
      {/* The main Sidebar component already renders AdminSidebarSection
          conditionally — no extra sidebar needed here */}
      <main className="flex-1 overflow-auto">
        {/* Admin topbar */}
        <div className="bg-[#0D1520] border-b border-white/[0.06]
                        px-5 py-2.5 flex items-center gap-3">
          <span className="text-amber-500 text-base">⬡</span>
          <span className="text-sm font-semibold text-white">Admin Panel</span>
          <span className="bg-amber-500/15 text-amber-400 text-[9px]
                           font-bold px-2 py-0.5 rounded-full tracking-wider">
            {session.user.role === 'global_admin' ? 'GLOBAL ADMIN' : 'ORG ADMIN'}
          </span>
          <div className="ml-auto flex gap-2">
            <button className="text-xs border border-white/10 rounded-md
                               px-3 py-1.5 text-white/60 hover:bg-white/5 transition-colors">
              Export audit
            </button>
            <button className="text-xs bg-cyan-500/10 border border-cyan-500/25
                               text-cyan-400 rounded-md px-3 py-1.5 hover:bg-cyan-500/20 transition-colors">
              + Invite user
            </button>
          </div>
        </div>
        <div className="p-5">{children}</div>
      </main>
    </div>
  );
}
```

### 5.2 Users page

```tsx
// app/admin/users/page.tsx
import { AdminStatsBar } from '@/components/admin/AdminStatsBar';
import { UserTable } from '@/components/admin/users/UserTable';
import { RBACMatrix } from '@/components/admin/rbac/RBACMatrix';

export default async function AdminUsersPage() {
  const [usersRes, permissionsRes] = await Promise.all([
    fetch('/api/admin/users?pageSize=25'),
    fetch('/api/admin/permissions'),
  ]);
  const { users, total } = await usersRes.json();
  const { rules } = await permissionsRes.json();

  return (
    <div className="space-y-5">
      <AdminStatsBar />

      <section>
        <SectionHeading title="RBAC permissions matrix" action="Edit roles" />
        <div className="bg-[#1a2437] rounded-lg overflow-hidden">
          <RBACMatrix rules={rules} />
        </div>
      </section>

      <section>
        <SectionHeading title="Users & roles" action="Invite" />
        <div className="bg-[#1a2437] rounded-lg overflow-hidden">
          <UserTable users={users} total={total} />
        </div>
      </section>
    </div>
  );
}
```

### 5.3 Audit log page

```tsx
// app/admin/audit/page.tsx
import { AuditTable } from '@/components/admin/audit/AuditTable';

export default async function AuditLogPage({ searchParams }: { searchParams: any }) {
  const params = new URLSearchParams(searchParams).toString();
  const { events, total } = await fetch(`/api/admin/audit?${params}`).then(r => r.json());

  return (
    <div>
      <SectionHeading title="Audit log" action="Export CSV" />
      <div className="bg-[#1a2437] rounded-lg overflow-hidden">
        <AuditTable events={events} total={total} filters={searchParams} />
      </div>
    </div>
  );
}
```

---

## 6. Invite Flow & MFA Enforcement

When a user is invited, the flow is:

```
Admin sends invite
  → Supabase magic link email to new user
  → User clicks link → lands on /auth/mfa-setup
  → User scans TOTP QR code (Google Authenticator / Authy)
  → User enters 6-digit code to verify
  → MFA enrolled → user_roles.is_active set to true
  → JWT custom claims refreshed with role + scope
  → User redirected to getLandingPath(role) — their home screen
```

```ts
// app/auth/mfa-setup/page.tsx (key logic)
async function completeMFASetup(totpCode: string) {
  // 1. Verify TOTP
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId, challengeId, code: totpCode
  });
  if (error) throw error;

  // 2. Activate user_role row
  await supabase
    .from('user_roles')
    .update({ is_active: true })
    .eq('user_id', session.user.id);

  // 3. Log the event
  await logAuditEvent({ event_type: 'AUTH', detail: 'MFA enrolled — account activated' });

  // 4. Route to their landing page
  const path = getLandingPath(session.user.role);
  router.push(path);
}
```

---

## 7. Stats Bar Component

Shown at the top of the admin panel — four metric cards.

```tsx
// components/admin/AdminStatsBar.tsx
export async function AdminStatsBar() {
  const [usersCount, activeSessions, mfaCount, auditToday] = await Promise.all([
    supabaseAdmin.from('user_roles').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabaseAdmin.from('user_roles').select('id', { count: 'exact', head: true })
      .gt('last_seen_at', new Date(Date.now() - 30 * 60000).toISOString()),
    supabaseAdmin.from('user_roles').select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      // join auth.mfa_factors — only count users with verified factor
      ,
    supabaseAdmin.from('audit_log').select('id', { count: 'exact', head: true })
      .gte('created_at', new Date().toISOString().slice(0, 10)),
  ]);

  const stats = [
    { label: 'Total users',        value: usersCount.count ?? 0,  color: 'text-cyan-400' },
    { label: 'Active sessions',    value: activeSessions.count ?? 0, color: 'text-white' },
    { label: 'MFA enrolled',       value: mfaCount.count ?? 0,    color: 'text-white' },
    { label: 'Audit events today', value: auditToday.count ?? 0,  color: 'text-amber-400' },
  ];

  return (
    <div className="grid grid-cols-4 gap-2.5">
      {stats.map(({ label, value, color }) => (
        <div key={label} className="bg-[#1a2437] rounded-lg p-3">
          <div className="text-[10px] text-white/35 mb-1">{label}</div>
          <div className={`text-2xl font-bold ${color}`}>{value}</div>
        </div>
      ))}
    </div>
  );
}
```

---

## 8. Open Tickets for Matt

| Ticket | Assignee   | Priority | Description                                                        |
|--------|------------|----------|--------------------------------------------------------------------|
| #133   | Matt Tighe | HIGH     | Admin panel UI — all three sections (this spec)                    |
| #133a  | Matt Tighe | HIGH     | AdminSidebarSection — amber block, role-gated, Option A placement  |
| #133b  | Matt Tighe | HIGH     | Users & Roles page — table, invite modal, edit role modal          |
| #133c  | Matt Tighe | HIGH     | RBAC matrix page — grid, permission cells, edit modal              |
| #133d  | Matt Tighe | HIGH     | Audit log page — table, filters, CSV export                        |
| #134   | Matt Tighe | HIGH     | logAuditEvent() — wire into ALL existing API routes retroactively  |
| #137   | Matt Tighe | MED      | AdminStatsBar — live counts from Supabase                          |
| #138   | Matt Tighe | MED      | InviteUserModal — scope selectors per role type                    |
| #139   | Matt Tighe | MED      | MFA status column — join auth.mfa_factors in user list query       |
| #140   | Matt Tighe | MED      | Audit export — CSV download with active filters applied            |
| #141   | Matt Tighe | LOW      | Suspend / unsuspend user — soft delete + audit event               |

---

## 9. Key Rules for Claude Code

1. **Admin section is invisible to non-admins.** `AdminSidebarSection` returns `null` for all non-admin roles. No disabled state, no placeholder. It simply does not exist.

2. **Every admin API route calls `requireAccess()` first.** No exceptions. Not a single route under `/api/admin/` may proceed without a verified admin session.

3. **org_admin is scoped.** An `org_admin` user can only see and manage users within their own `org_id`. They cannot elevate themselves or grant roles above their own level.

4. **Every mutation writes an audit event.** Invite, role change, suspend, permission edit — each calls `logAuditEvent()` before returning a response. If the audit write fails, the mutation should still complete but the failure must be logged to server error tracking.

5. **MFA is enforced before `is_active = true`.** A user invited via the admin panel cannot access the platform until they complete MFA enrolment at `/auth/mfa-setup`. Their `user_roles.is_active` stays `false` until that step completes.

6. **Amber = admin context.** The amber colour (`#E8A020`) is used exclusively for Leo (AI) and admin UI. Never use it for operational platform elements.

7. **The RBAC matrix is read from `permission_rules`.** It is not hardcoded in the component. `RBACMatrix` fetches live data from `/api/admin/permissions`. Editing a permission in the UI writes to `permission_rules` and takes effect on the next JWT refresh.

8. **Audit log is append-only.** No route or component may UPDATE or DELETE rows from `audit_log`. The table has no UPDATE or DELETE RLS policy. Even `global_admin` cannot modify audit entries.

9. **IP addresses are always logged.** Every audit event must capture `x-forwarded-for` from the request headers. This is non-negotiable for compliance.

10. **The Polaris logo in the sidebar is a home button.** Wrap the logo mark in `<Link href="/">` in the main Sidebar component. Clicking it navigates to the user's role-appropriate home page via `getLandingPath()`.

---

*Polaris Admin Panel — Internal · Confidential · v1.0 — June 2026*
*Authors: Mike Fetton / Matt Tighe — JLS Yachts LLC*
