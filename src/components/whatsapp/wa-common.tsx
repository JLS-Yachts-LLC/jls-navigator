/**
 * Shared pieces for Communications → WhatsApp: row types, the authenticated
 * fetch to /api/whatsapp/*, and the status chips every tab uses.
 */
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CONSENT_LABEL, type HeaderFormat, type WaButton } from "@/lib/whatsapp/shared";

export const db = () => supabase as any;

export const MEDIA_BUCKET = "whatsapp-media";

/** Store a header file; returns its path in the private bucket. */
export async function uploadWaMedia(file: File, folder: "templates" | "sends"): Promise<string> {
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
  const path = `${folder}/${crypto.randomUUID()}/${safe}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** A short-lived link to show a stored header file in the browser. */
export async function waMediaUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export interface WaContact {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_e164: string | null;
  phone_confirmed: boolean;
  yacht_id: string | null;
  source: "manual" | "vessel" | "agency_contact";
  source_id: string | null;
  consent_status: "none" | "invited" | "opted_in" | "opted_out";
  consent_updates: boolean;
  consent_marketing: boolean;
  consent_at: string | null;
  opted_out_at: string | null;
  notes: string | null;
  created_at: string;
  yacht?: { vessel_name: string | null } | null;
}

export interface WaTemplate {
  id: string;
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY";
  header_format: HeaderFormat;
  header_media_path: string | null;
  header_media_mime: string | null;
  header_media_name: string | null;
  buttons: WaButton[];
  header_text: string | null;
  body_text: string;
  footer_text: string | null;
  sample_values: string[];
  status: "draft" | "pending" | "approved" | "rejected" | "paused" | "disabled";
  meta_template_id: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  updated_at: string;
}

export interface WaList {
  id: string;
  name: string;
  description: string | null;
  kind: "broadcast" | "group";
  archived: boolean;
  created_at: string;
}

/** POST/GET to the WhatsApp API with the signed-in session. Throws the server's message. */
export async function waApi<T = any>(path: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`/api/whatsapp/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error ?? `Request failed (${res.status})`);
  return out as T;
}

/** Fetch a file through the API (it needs the session header, so no plain <img src>). */
export async function waBlobUrl(path: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`/api/whatsapp/${path}`, {
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
  if (!res.ok) {
    const out = await res.json().catch(() => ({}));
    throw new Error(out?.error ?? `Request failed (${res.status})`);
  }
  return URL.createObjectURL(await res.blob());
}

const tone = {
  green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  red: "bg-red-500/15 text-red-600 dark:text-red-400",
  blue: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  grey: "bg-muted text-muted-foreground",
} as const;

export function Chip({ children, t = "grey", title }: { children: React.ReactNode; t?: keyof typeof tone; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", tone[t])}>
      {children}
    </span>
  );
}

export function ConsentChip({ c }: { c: Pick<WaContact, "consent_status" | "consent_updates" | "consent_marketing"> }) {
  const t = c.consent_status === "opted_in" ? "green" : c.consent_status === "opted_out" ? "red"
    : c.consent_status === "invited" ? "blue" : "grey";
  const kinds = c.consent_status === "opted_in"
    ? [c.consent_updates ? "updates" : null, c.consent_marketing ? "offers" : null].filter(Boolean).join(" + ")
    : "";
  return <Chip t={t}>{CONSENT_LABEL[c.consent_status]}{kinds ? ` · ${kinds}` : ""}</Chip>;
}

export function TemplateStatusChip({ s }: { s: WaTemplate["status"] }) {
  const t = s === "approved" ? "green" : s === "rejected" || s === "disabled" ? "red"
    : s === "pending" ? "blue" : s === "paused" ? "amber" : "grey";
  const label = { draft: "Draft", pending: "In review", approved: "Approved", rejected: "Rejected", paused: "Paused", disabled: "Disabled" }[s];
  return <Chip t={t}>{label}</Chip>;
}

export function MessageStatusChip({ s }: { s: string }) {
  const t = s === "read" || s === "delivered" ? "green" : s === "sent" ? "blue"
    : s === "failed" ? "red" : s === "skipped" ? "amber" : "grey";
  return <Chip t={t}>{s.charAt(0).toUpperCase() + s.slice(1)}</Chip>;
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}

// ─── Numbers ("lines") ────────────────────────────────────────────────────────

/** A WhatsApp number Polaris speaks for (see lib/whatsapp/lines.server.ts). */
export interface WaLine {
  id: string;
  label: string;
  phone_number_id: string | null;
  waba_id: string | null;
  display_phone: string | null;
  verified_name: string | null;
  is_default: boolean;
  status: "pending" | "connected" | "disconnected";
  coexistence: boolean;
  auto_replies_enabled: boolean;
  human_pause_hours: number;
  onboarded_at: string | null;
  contacts_sync_requested_at: string | null;
  contacts_sync_error: string | null;
  history_sync_requested_at: string | null;
  history_sync_error: string | null;
  history_progress: number | null;
  history_declined: boolean;
  disconnected_at: string | null;
  disconnect_reason: string | null;
}
export type LineLevel = "view" | "send";
export type MyLine = WaLine & { level: LineLevel };

/**
 * The numbers the signed-in person can use, and how: "view" reads that number's
 * conversations, "send" also replies. The database decides (wa_my_lines), the
 * same rule the server and row-level security apply.
 */
export async function loadMyLines(): Promise<MyLine[]> {
  const [{ data: mine }, { data: lines }] = await Promise.all([
    db().rpc("wa_my_lines"),
    db().from("wa_lines").select("*").order("is_default", { ascending: false }).order("created_at"),
  ]);
  const level = new Map<string, LineLevel>(((mine ?? []) as any[]).map((r) => [r.line_id, r.level]));
  return ((lines ?? []) as WaLine[]).filter((l) => level.has(l.id)).map((l) => ({ ...l, level: level.get(l.id)! }));
}

export const lineName = (l: Pick<WaLine, "label" | "display_phone"> | null | undefined) =>
  l ? (l.display_phone ? `${l.label} · ${l.display_phone}` : l.label) : "";
