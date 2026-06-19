/**
 * Persistent client-side error & warning logger.
 *
 * Sits on top of the in-memory action-log (which powers the bug-report widget)
 * and additionally PERSISTS errors and warnings to the `client_logs` table so
 * the Developer ▸ Error & Warning Log can surface faults before end users have
 * to report them manually.
 *
 * It captures:
 *   - window 'error' events (uncaught exceptions, failed resource loads)
 *   - unhandled promise rejections
 *   - console.error / console.warn calls (the original behaviour is preserved)
 *
 * Everything is best-effort: logging must NEVER throw or break the app, and
 * writes are deduped + throttled so a tight error loop can't flood the table.
 */

import { supabase } from "@/integrations/supabase/client";
import { getCapturedLog } from "@/lib/action-log";

type Level = "error" | "warn";

let installed = false;
let logUser: { id: string | null; email: string | null } = { id: null, email: null };

// Dedupe identical messages within a short window; cap total writes per session.
const DEDUPE_WINDOW_MS = 30_000;
const SESSION_CAP = 200;
const recent = new Map<string, number>();
let writes = 0;

/** Set once the auth user is known, so logs are attributable. */
export function setLogUser(user: { id?: string | null; email?: string | null } | null) {
  logUser = { id: user?.id ?? null, email: user?.email ?? null };
}

function fmtArg(a: unknown): string {
  if (a instanceof Error) return a.stack || `${a.name}: ${a.message}`;
  if (typeof a === "string") return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

// Noise we never want to persist (browser extensions, benign framework chatter).
function isNoise(message: string): boolean {
  if (!message) return true;
  return (
    message.includes("ResizeObserver loop") ||
    message.includes("Non-Error promise rejection captured") ||
    message.startsWith("Warning: ") && message.includes("DevTools")
  );
}

async function persist(level: Level, message: string, source?: string | null, stack?: string | null) {
  try {
    if (typeof window === "undefined") return;
    message = (message || "").trim();
    if (isNoise(message)) return;
    if (writes >= SESSION_CAP) return;

    const sig = `${level}|${message.slice(0, 200)}`;
    const now = Date.now();
    const last = recent.get(sig) ?? 0;
    if (now - last < DEDUPE_WINDOW_MS) return;
    recent.set(sig, now);
    writes += 1;

    const log = getCapturedLog();
    await (supabase as any).from("client_logs").insert({
      level,
      message: message.slice(0, 2000),
      source: source ? String(source).slice(0, 500) : null,
      stack: stack ? String(stack).slice(0, 6000) : null,
      url: log.url || null,
      user_agent: log.userAgent || null,
      breadcrumbs: log.actions.slice(-10),
      user_id: logUser.id,
      user_email: logUser.email,
    });
  } catch {
    /* never throw from logging */
  }
}

/** Install global capture once (browser only). Idempotent. */
export function installErrorLogging() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e: ErrorEvent) => {
    const where = e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : null;
    void persist("error", e.message || "Uncaught error", where, e.error?.stack ?? null);
  });

  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const r = e.reason;
    const msg = r instanceof Error ? r.message : String(r);
    void persist("error", `Unhandled rejection: ${msg}`, "unhandledrejection", r instanceof Error ? r.stack : null);
  });

  // Wrap console.error / console.warn, preserving original output.
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    origError(...args);
    void persist("error", args.map(fmtArg).join(" "));
  };
  const origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    void persist("warn", args.map(fmtArg).join(" "));
  };
}
