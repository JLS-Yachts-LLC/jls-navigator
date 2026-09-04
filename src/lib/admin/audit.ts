import { createClient } from '@supabase/supabase-js'
import type { LogAuditEventParams } from './types'

function getAdmin() {
  const url = process.env.SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) throw new Error('Supabase admin credentials missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Only a real uuid may go in resource_id — target_id is often an email. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The admin code speaks in short codes; `audit_log.event_type` has a check
 * constraint listing the specific, lower-case vocabulary the data-change
 * triggers already write. Translate rather than widen the constraint: two
 * vocabularies for the same column is what made this column untrustworthy in
 * the first place.
 *
 * A value that is already one of the table's own terms passes straight through.
 */
const EVENT_TYPE_MAP: Record<string, string> = {
  AUTH:   'login',
  PERM:   'permission_change',
  DATA:   'data_edit',
  EXPORT: 'export',
  SEC:    'admin_action',
  ADMIN:  'admin_action',
}
const ALLOWED_EVENT_TYPES = new Set([
  'login', 'logout', 'login_failed', 'mfa_challenge', 'permission_change',
  'data_access', 'data_create', 'data_edit', 'data_delete', 'module_access',
  'admin_action', 'export', 'report_generated',
])

function toEventType(code: string): string {
  if (ALLOWED_EVENT_TYPES.has(code)) return code
  return EVENT_TYPE_MAP[code] ?? 'admin_action'
}

/**
 * Record an administrative action.
 *
 * `actor_id` maps onto `user_id`, which is how the data-change triggers identify
 * who acted — so "everything this person did" is one query across both producers.
 *
 * A failure is logged loudly rather than swallowed: this used to insert columns
 * the table did not have, and because the error went nowhere, every invite, role
 * change and permission grant was silently unrecorded for months.
 */
export async function logAuditEvent(params: LogAuditEventParams): Promise<void> {
  try {
    const sb = getAdmin()
    const { error } = await sb.from('audit_log').insert({
      event_type:   toEventType(params.event_type),
      module:       params.module ?? 'admin',
      user_id:      params.actor_id ?? null,
      actor_email:  params.actor_email,
      actor_role:   params.actor_role,
      target_type:  params.target_type ?? null,
      resource_type: params.target_type ?? null,
      resource_id:  params.target_id && UUID_RE.test(params.target_id) ? params.target_id : null,
      target_label: params.target_label ?? null,
      detail:       params.detail,
      ip_address:   params.ip_address ?? null,
      user_agent:   params.user_agent ?? null,
      result:       params.result,
    })
    if (error) {
      console.error('[audit] audit_log insert rejected — an admin action went unrecorded:', error.message, {
        event_type: params.event_type, detail: params.detail,
      })
    }
  } catch (err) {
    console.error('[audit] logAuditEvent failed — an admin action went unrecorded:', err)
  }
}
