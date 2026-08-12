/**
 * POLARIS — requireAccess() server guard.  Ticket #132.
 *
 * Generalises requireAdminAccess (src/lib/admin/access.ts) so ANY API route can
 * assert "valid session" and, optionally, "has module X at level Y" before
 * running. Resolves claims server-side from the #128 access tables (since the
 * JWT-claims Edge Function is disabled), with a developer-email fallback during
 * rollout so existing internal users aren't locked out.
 *
 * Usage in a route handler:
 *   const access = await requireAccess(request, { module: 'finance', level: 'finance' })
 *   if (!access.ok) return access.response
 *   // access.claims is available here
 */

import { createClient } from "@supabase/supabase-js";
import { DEVELOPER_EMAILS } from "@/lib/leo-access";
import { PERMISSION_ORDER, GLOBAL_ADMIN_ROLES, type PermissionLevel } from "@/lib/auth/claims";

export interface AccessClaims {
  userId: string;
  email: string;
  roleName: string | null;
  orgId: string | null;
  isGlobalAdmin: boolean;
  moduleLevels: Record<string, PermissionLevel>;
}

export type AccessOk = { ok: true; claims: AccessClaims };
export type AccessDenied = { ok: false; response: Response };
export type AccessResult = AccessOk | AccessDenied;

function deny(status: number, message: string): AccessDenied {
  return {
    ok: false,
    response: new Response(JSON.stringify({ error: message }), {
      status, headers: { "Content-Type": "application/json" },
    }),
  };
}

function admin() {
  return createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}

export interface RequireAccessOptions {
  /** Module the route belongs to (e.g. 'finance', 'crew_immigration'). */
  module?: string;
  /** Minimum permission level required on that module. Default 'view'. */
  level?: PermissionLevel;
  /** If true, only global-tier admins pass (ignores module checks). */
  adminOnly?: boolean;
}

const permissionMet = (have: PermissionLevel | undefined, required: PermissionLevel) =>
  !!have && PERMISSION_ORDER.indexOf(have) >= PERMISSION_ORDER.indexOf(required);

export async function requireAccess(
  request: Request,
  opts: RequireAccessOptions = {},
): Promise<AccessResult> {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return deny(401, "Unauthorized");
  const token = auth.slice(7);

  const sb = admin();
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return deny(401, "Invalid token");

  const email = (user.email ?? "").toLowerCase();

  // Resolve claims from user_profiles (+ module access).
  const { data: profile } = await sb
    .from("user_profiles")
    .select("org_id, department, roles:role_id(name)")
    .eq("user_id", user.id)
    .maybeSingle();

  let roleName = (profile as any)?.roles?.name as string | null ?? null;
  let isGlobalAdmin = !!roleName && (GLOBAL_ADMIN_ROLES as readonly string[]).includes(roleName);

  // Rollout fallback: developer allow-list → treat as global admin.
  if (!profile && DEVELOPER_EMAILS.includes(email)) {
    roleName = "developer";
    isGlobalAdmin = true;
  }

  // Effective access = department default, then the user's own grants on top as
  // overrides. Must match deriveClaims() in lib/auth/claims.ts exactly, or the
  // client would show something the server then refuses (or the reverse).
  const moduleLevels: Record<string, PermissionLevel> = {};
  if (profile) {
    const department = (profile as any)?.department as string | null;
    const [deptRes, modRes] = await Promise.all([
      department
        ? sb.from("department_permissions")
            .select("module_slug, can_view, can_create, can_edit")
            .eq("department", department)
        : Promise.resolve({ data: [] as any[] }),
      sb.from("user_module_access")
        .select("permission_level, active, modules:module_id(name)")
        .eq("user_id", user.id),
    ]);
    for (const d of (deptRes.data ?? []) as any[]) {
      if (!d.module_slug) continue;
      const level: PermissionLevel | null =
        d.can_edit ? "edit" : d.can_create ? "create" : d.can_view ? "view" : null;
      if (level) moduleLevels[d.module_slug] = level;
    }
    for (const m of (modRes.data ?? []) as any[]) {
      if (m.modules?.name && m.active !== false) moduleLevels[m.modules.name] = m.permission_level;
    }
  }

  const claims: AccessClaims = {
    userId: user.id, email, roleName,
    orgId: (profile as any)?.org_id ?? null,
    isGlobalAdmin, moduleLevels,
  };

  if (opts.adminOnly && !isGlobalAdmin) return deny(403, "Forbidden — admin only");

  if (opts.module && !isGlobalAdmin) {
    const required = opts.level ?? "view";
    if (!permissionMet(moduleLevels[opts.module], required)) {
      return deny(403, `Forbidden — requires ${required} on ${opts.module}`);
    }
  }

  return { ok: true, claims };
}
