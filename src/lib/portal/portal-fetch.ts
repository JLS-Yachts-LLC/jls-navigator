/**
 * Fetch a /api/portal/* endpoint as the signed-in user.
 *
 * Sends the Supabase access token, and — when the page was opened as an admin
 * preview (/portal?previewCaptain=<captain_account_id>, from "View as") — the
 * `X-Portal-Preview` header, so the server resolves the PREVIEWED account's
 * vessel instead of refusing the admin for having no client account. The server
 * only honours that header for staff admins (see portal-auth.server.ts).
 */
import { supabase } from "@/integrations/supabase/client";

export function portalPreviewId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("previewCaptain");
}

/** The yacht on screen, for logins linked to several (sent as X-Portal-Yacht). */
let currentYacht: string | null = null;
export function setPortalYacht(yachtId: string | null) { currentYacht = yachtId; }

export async function portalFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  const previewId = portalPreviewId();
  if (previewId) headers.set("X-Portal-Preview", previewId);
  else if (currentYacht) headers.set("X-Portal-Yacht", currentYacht);
  return fetch(path, { ...init, headers });
}
