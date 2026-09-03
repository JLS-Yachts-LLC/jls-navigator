/**
 * Client side of POST /api/permits/email.
 *
 * The server owns the wording (it applies the stored template for the permit
 * type), issues the secure document link and writes the vessel activity log, so
 * every permit dialog sends the same way and a preview is the real message
 * rather than an approximation of it.
 */
import { supabase } from "@/integrations/supabase/client";

export interface PermitEmailResult {
  to: string;
  subject: string;
  label: string;
  /** True when the permit document went as a secure, expiring link. */
  secureLink: boolean;
  linkExpiresAt: string | null;
}

export interface PermitEmailPreview {
  subject: string;
  html: string;
  to: string;
  vesselName: string;
}

async function call(permitId: string, preview: boolean): Promise<any> {
  const { data: { session } } = await (supabase as any).auth.getSession();
  const res = await fetch("/api/permits/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ permitId, preview }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body;
}

/** Send the permit to its client contact. */
export const sendPermitEmail = (permitId: string): Promise<PermitEmailResult> => call(permitId, false);

/** Render what would be sent, without sending it. */
export const previewPermitEmail = (permitId: string): Promise<PermitEmailPreview> => call(permitId, true);
