// Guard for maintenance / cron-style HTTP endpoints (SharePoint webhook
// maintenance operations, /api/visa/monitor, …) — they are for us, not the
// public. A caller needs a global admin's session token
// (`Authorization: Bearer <jwt>`) or, for scripted callers, the `x-cron-secret`
// header matching CRON_SECRET. With no CRON_SECRET set, only the admin token
// works (fails closed). The scheduled handler calls the underlying jobs
// directly and never comes through here.

// Constant-time string compare, so the shared secret can't be guessed byte by byte.
export function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

// Returns null when the request may proceed, or the 401/403 response to send.
export async function requireMaintenanceAccess(request: Request): Promise<Response | null> {
  const cronSecret = process.env.CRON_SECRET
  const provided = request.headers.get('x-cron-secret')
  if (cronSecret && provided && secretMatches(provided, cronSecret)) return null
  const { requireAdminAccess } = await import('./access')
  const session = await requireAdminAccess(request, ['global_admin'])
  return session.ok ? null : session.response
}
