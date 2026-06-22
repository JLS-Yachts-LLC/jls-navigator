export type PolarisRole =
  | 'global_admin'
  | 'org_admin'
  | 'jls_staff'
  | 'vessel_owner'
  | 'captain'
  | 'crew'
  | 'supplier'
  | 'port_agent'
  | 'training_user'
  | 'placement_user'

export type AuditEventType =
  | 'AUTH'
  | 'PERM'
  | 'DATA'
  | 'EXPORT'
  | 'SEC'
  | 'ADMIN'
  | 'SYSTEM'

export type AuditResult = 'success' | 'blocked' | 'pending' | 'failed'

export interface UserRole {
  id: string
  user_id: string
  role: string          // a roles.name value (e.g. "global_admin", "crew_member")
  org_id: string | null
  vessel_id: string | null
  location_id: string | null
  granted_by: string | null
  granted_at: string
  expires_at: string | null
  is_active: boolean
  /** Derived server-side: invited (never signed in), active, or suspended. */
  status?: 'invited' | 'active' | 'suspended'
  // joined
  user?: {
    id: string
    email: string
    last_sign_in_at: string | null
    created_at: string
  }
  mfa_factors?: Array<{
    id: string
    factor_type: string
    status: string
  }>
}

/** A role from the `roles` catalog — drives the admin UI dropdowns. */
export interface RoleOption {
  name: string
  display_name: string
  scope: string
}

export interface PermissionRule {
  id: string
  role: PolarisRole
  resource: string
  action: string
  scope: string
  conditions: Record<string, unknown> | null
}

export interface AuditEvent {
  id: string
  event_type: AuditEventType
  actor_id: string | null
  actor_email: string
  actor_role: string
  target_type: string | null
  target_id: string | null
  target_label: string | null
  detail: string
  ip_address: string | null
  user_agent: string | null
  result: AuditResult
  created_at: string
}

export interface LogAuditEventParams {
  event_type: AuditEventType
  actor_id: string
  actor_email: string
  actor_role: string
  target_type?: string
  target_id?: string
  target_label?: string
  detail: string
  ip_address?: string | null
  user_agent?: string | null
  result: AuditResult
}
