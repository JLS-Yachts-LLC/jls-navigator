/**
 * useAccess — React hook exposing the current user's POLARIS claims.
 *
 * Wraps deriveClaims() in react-query so the derived claims are cached per user
 * and shared across the app (sidebar, route guards, dashboards). This is the
 * client-side stand-in for JWT custom claims (#130) while Edge Functions are off.
 *
 * "View as" a staff member: while a global admin previews someone (top bar →
 * View as), the claims returned are THAT person's (from /api/admin/view-as), so
 * everything built on this hook — sidebar, module screens, tab limits — shows
 * what they see. `realIsGlobalAdmin` stays the signed-in admin's own status, for
 * the controls that must keep working mid-preview (the switcher and its Exit).
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useViewAsUser, type ViewAsUser } from "@/lib/view-as";
import {
  deriveClaims, ANON_CLAIMS, type PolarisClaims,
  canAccessModule, hasVesselAccess, getLandingPath, resolveLandingPath,
  type PermissionLevel,
} from "@/lib/auth/claims";

export interface UseAccessResult {
  claims: PolarisClaims;
  loading: boolean;
  isGlobalAdmin: boolean;
  canAccessModule: (moduleName: string, required?: PermissionLevel) => boolean;
  hasVesselAccess: (vesselId: string) => boolean;
  landingPath: string;
  refetch: () => void;
  /** The staff member being previewed ("View as"), or null. */
  previewing: ViewAsUser | null;
  /** The signed-in user's own admin status, unaffected by a preview. */
  realIsGlobalAdmin: boolean;
}

export function useAccess(): UseAccessResult {
  const { user, session, loading: authLoading } = useAuth();
  const viewAs = useViewAsUser();

  const { data: own = ANON_CLAIMS, isLoading, refetch } = useQuery({
    queryKey: ["polaris-claims", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: () => deriveClaims(supabase, user!),
  });

  // Only a global admin can preview; anyone else ignores a stray preview setting.
  const previewing = viewAs && own.isGlobalAdmin ? viewAs : null;
  const { data: previewClaims, isLoading: previewLoading } = useQuery({
    queryKey: ["polaris-claims-view-as", previewing?.id],
    enabled: !!previewing && !!session?.access_token,
    staleTime: 60_000,
    queryFn: async (): Promise<PolarisClaims> => {
      const res = await fetch(`/api/admin/view-as?user_id=${encodeURIComponent(previewing!.id)}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.claims) throw new Error(body?.error ?? "Could not load that person's access");
      return body.claims as PolarisClaims;
    },
  });

  const claims = previewing ? previewClaims ?? ANON_CLAIMS : own;
  return {
    claims,
    loading: authLoading || (!!user && isLoading) || (!!previewing && previewLoading),
    isGlobalAdmin: claims.isGlobalAdmin,
    canAccessModule: (m, required) => canAccessModule(claims, m, required),
    hasVesselAccess: (v) => hasVesselAccess(claims, v),
    landingPath: resolveLandingPath(claims),
    refetch,
    previewing,
    realIsGlobalAdmin: own.isGlobalAdmin,
  };
}

export { getLandingPath, resolveLandingPath };
export type { PolarisClaims, PermissionLevel };
