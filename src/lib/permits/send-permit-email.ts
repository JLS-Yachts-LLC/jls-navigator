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
  /** How this client asked to receive documents. */
  delivery: "secure_link" | "portal";
  /** True when the permit document went as a secure, expiring link. */
  secureLink: boolean;
  linkExpiresAt: string | null;
  /** How many extra files went as attachments. */
  attachments?: number;
}

/** What to tell the sender about how the document actually travelled. */
export function deliveryNote(r: PermitEmailResult, noun = "document"): string {
  if (r.delivery === "portal") {
    return `The ${noun} is waiting in the client's portal — no link was emailed, as they requested.`;
  }
  if (r.secureLink) {
    return `The ${noun} went as a secure link, and it's logged against the vessel.`;
  }
  return "Logged against the vessel.";
}

export interface PermitEmailPreview {
  subject: string;
  html: string;
  to: string;
  vesselName: string;
  delivery: "secure_link" | "portal";
  /** Whether the permit has a document on file to link to. */
  hasDocument: boolean;
}

/** Largest file the server will attach (a Graph limit for a single-request attachment). */
export const MAX_PERMIT_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const MAX_PERMIT_ATTACHMENTS = 10;

/** A File's bytes as plain base64 (no `data:` prefix), as the server expects. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(new Error(`Could not read "${file.name}"`));
    r.readAsDataURL(file);
  });
}

async function call(permitId: string, preview: boolean, files: File[] = []): Promise<any> {
  const { data: { session } } = await (supabase as any).auth.getSession();
  const attachments = await Promise.all(files.map(async (f) => ({
    filename: f.name,
    contentType: f.type || "application/octet-stream",
    contentBase64: await toBase64(f),
  })));
  const res = await fetch("/api/permits/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ permitId, preview, ...(attachments.length ? { attachments } : {}) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body;
}

/** Send the permit to its client contact, with any extra files attached. */
export const sendPermitEmail = (permitId: string, files: File[] = []): Promise<PermitEmailResult> =>
  call(permitId, false, files);

/** Render what would be sent, without sending it. */
export const previewPermitEmail = (permitId: string): Promise<PermitEmailPreview> => call(permitId, true);
