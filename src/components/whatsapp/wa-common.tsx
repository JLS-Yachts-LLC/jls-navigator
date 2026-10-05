/**
 * Shared pieces for Communications → WhatsApp: row types, the authenticated
 * fetch to /api/whatsapp/*, and the status chips every tab uses.
 */
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CONSENT_LABEL } from "@/lib/whatsapp/shared";

export const db = () => supabase as any;

export interface WaContact {
  id: string;
  name: string;
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
