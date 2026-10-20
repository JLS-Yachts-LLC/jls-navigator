/**
 * Zebra label printers, from the browser: list them, queue labels, wait for the result.
 *
 * Phones and PCs never talk to a printer. They put the label contents in print_jobs; the
 * connector on the office network collects the job, sends it to the printer and reports
 * back (see api.print-connector.ts). A printer counts as online when its connector has
 * reported on it in the last few minutes — it does that every minute while it runs.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Label } from "./zpl";

const sb = supabase as any;

export type LabelPrinter = {
  id: string;
  name: string;
  location: string | null;
  host: string | null;
  port: number;
  dpi: number;
  label_width_mm: number;
  label_height_mm: number;
  connector_id: string | null;
  active: boolean;
  status: string;
  status_detail: string | null;
  status_at: string | null;
};

export type JobOutcome = { status: "printed" } | { status: "failed"; error: string } | { status: "waiting" };

export const PRINTER_STATUS_TEXT: Record<string, string> = {
  unknown: "Not checked yet",
  ready: "Ready",
  paper_out: "Out of labels",
  ribbon_out: "Out of ribbon",
  head_open: "Print head open",
  paused: "Paused",
  unreachable: "Can't reach it",
  error: "Error",
};

const ONLINE_WINDOW_MS = 3 * 60_000;

/** The connector has reported on this printer recently. */
export const isOnline = (p: LabelPrinter) => !!p.status_at && Date.now() - new Date(p.status_at).getTime() < ONLINE_WINDOW_MS;

/** Online and saying it can print. */
export const isReady = (p: LabelPrinter) => isOnline(p) && p.status === "ready";

export function printerStateText(p: LabelPrinter): string {
  if (!p.host || !p.connector_id) return "Not set up";
  if (!isOnline(p)) return "Offline";
  return PRINTER_STATUS_TEXT[p.status] ?? p.status;
}

export async function listPrinters(opts: { all?: boolean } = {}): Promise<LabelPrinter[]> {
  let q = sb.from("label_printers").select("*").order("name");
  if (!opts.all) q = q.eq("active", true).not("host", "is", null).not("connector_id", "is", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as LabelPrinter[];
}

export async function queueLabels(printerId: string, labels: Label[], meta: { source?: string; ref?: string; copies?: number } = {}): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await sb.from("print_jobs").insert({
    printer_id: printerId,
    labels,
    copies: meta.copies ?? 1,
    source: meta.source ?? null,
    ref: meta.ref ?? null,
    requested_by: user?.id,
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

/** Wait for the connector to report on a job (it usually does within a few seconds). */
export async function waitForJob(id: string, timeoutMs = 30_000): Promise<JobOutcome> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1500));
    const { data } = await sb.from("print_jobs").select("status, error").eq("id", id).maybeSingle();
    if (data?.status === "printed") return { status: "printed" };
    if (data?.status === "failed" || data?.status === "cancelled") return { status: "failed", error: data.error ?? "The job was cancelled" };
  }
  return { status: "waiting" };
}

// The printer this phone or PC sends to without asking. Kept on the device: the receiving
// desk's phone and the storage phone each remember their own.
const DEFAULT_KEY = "polaris-default-label-printer";

export function getDefaultPrinterId(): string | null {
  try { return localStorage.getItem(DEFAULT_KEY); } catch { return null; }
}

export function setDefaultPrinterId(id: string | null): void {
  try { if (id) localStorage.setItem(DEFAULT_KEY, id); else localStorage.removeItem(DEFAULT_KEY); } catch { /* private window: just isn't remembered */ }
}
