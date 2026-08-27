/**
 * Per-user module access — GET / PUT /api/admin/user-modules?user_id=…
 *
 * A staff member's DEPARTMENT sets their default modules (department_permissions).
 * These rows are the per-person override, and they win even when LOWER than the
 * department default — that is what makes narrower, bespoke access possible
 * (see deriveClaims in lib/auth/claims.ts).
 *
 * GET  → every module, with the department default and any override, so the UI
 *        can show "inherited from Crew Care" vs "set for this person".
 * PUT  → { user_id, levels: { <module_slug>: level | null } }
 *        level null / '' removes the override and falls back to the department.
 */
import { createClient } from '@supabase/supabase-js'
import { requireAdminAccess } from '@/lib/admin/access'
import { logAuditEvent } from '@/lib/admin/audit'

const LEVELS = ['view', 'create', 'edit', 'approve', 'finance', 'admin'] as const
type Level = (typeof LEVELS)[number]

function getAdmin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** can_edit implies create implies view — mirrors departmentLevel() in claims.ts. */
function deptLevel(r: { can_view?: boolean; can_create?: boolean; can_edit?: boolean }): Level | null {
  if (r.can_edit) return 'edit'
  if (r.can_create) return 'create'
  if (r.can_view) return 'view'
  return null
}

export async function adminUserModulesHandler(request: Request): Promise<Response> {
  const session = await requireAdminAccess(request)
  if (!session.ok) return session.response

  const url = new URL(request.url)
  const sb = getAdmin()

  if (request.method === 'GET') {
    const userId = url.searchParams.get('user_id') ?? ''
    if (!userId) return json({ error: 'user_id is required' }, 400)

    const { data: profile } = await sb
      .from('user_profiles').select('email, department').eq('user_id', userId).maybeSingle()

    const [{ data: modules }, { data: overrides }, { data: deptPerms }] = await Promise.all([
      sb.from('modules').select('module_id, name, display_name').eq('active', true).order('display_name'),
      sb.from('user_module_access').select('module_id, permission_level, active').eq('user_id', userId),
      profile?.department
        ? sb.from('department_permissions')
            .select('module_slug, can_view, can_create, can_edit').eq('department', profile.department)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const byId = new Map((overrides ?? []).map((o: any) => [o.module_id, o.active === false ? 'none' : o.permission_level]))
    const byDept = new Map((deptPerms ?? []).map((d: any) => [d.module_slug, deptLevel(d)]))

    return json({
      department: profile?.department ?? null,
      email: profile?.email ?? null,
      modules: (modules ?? []).map((m: any) => ({
        module_id: m.module_id,
        slug: m.name,
        label: m.display_name,
        inherited: byDept.get(m.name) ?? null,
        override: byId.get(m.module_id) ?? null,
      })),
    })
  }

  if (request.method === 'PUT') {
    const body = await request.json().catch(() => null) as
      { user_id?: string; levels?: Record<string, string | null> } | null
    const userId = body?.user_id ?? ''
    const levels = body?.levels ?? {}
    if (!userId) return json({ error: 'user_id is required' }, 400)

    const { data: modules } = await sb.from('modules').select('module_id, name').eq('active', true)
    const idBySlug = new Map((modules ?? []).map((m: any) => [m.name, m.module_id]))

    const changed: string[] = []
    for (const [slug, raw] of Object.entries(levels)) {
      const moduleId = idBySlug.get(slug)
      if (!moduleId) continue
      const level = raw && LEVELS.includes(raw as Level) ? (raw as Level) : null

      // 'none' is an explicit DENY — stored as an inactive row so it revokes
      // the department default rather than falling back to it.
      if (raw === 'none') {
        const { error } = await sb.from('user_module_access').upsert({
          user_id: userId, module_id: moduleId, permission_level: 'view',
          granted_by: session.user.id, granted_at: new Date().toISOString(), active: false,
        }, { onConflict: 'user_id,module_id' })
        if (error) return json({ error: error.message }, 500)
        changed.push(`${slug}=denied`)
        continue
      }

      if (!level) {
        // Clearing an override hands the module back to the department default.
        const { error } = await sb.from('user_module_access')
          .delete().eq('user_id', userId).eq('module_id', moduleId)
        if (error) return json({ error: error.message }, 500)
        changed.push(`${slug}=inherit`)
        continue
      }
      const { error } = await sb.from('user_module_access').upsert({
        user_id: userId, module_id: moduleId, permission_level: level,
        granted_by: session.user.id, granted_at: new Date().toISOString(), active: true,
      }, { onConflict: 'user_id,module_id' })
      if (error) return json({ error: error.message }, 500)
      changed.push(`${slug}=${level}`)
    }

    const { data: target } = await sb.from('user_profiles').select('email').eq('user_id', userId).maybeSingle()
    await logAuditEvent({
      event_type: 'PERM',
      actor_id: session.user.id,
      actor_email: session.user.email,
      actor_role: session.user.role,
      target_type: 'user',
      target_id: userId,
      target_label: target?.email ?? userId,
      detail: changed.length ? `Module access changed: ${changed.join(', ')}` : 'Module access unchanged',
      ip_address: request.headers.get('x-forwarded-for'),
      result: 'success',
    })

    return json({ success: true, changed: changed.length })
  }

  return json({ error: 'Method not allowed' }, 405)
}
