/**
 * Pairing a screen to Polaris with a code — shared by the Port Operations wall
 * (/wall) and the Training room tablet (/training-kiosk). Both live in
 * wall_displays, told apart by `kind`; every query here is scoped to one kind,
 * so a wall's key never opens the tablet's data or the other way round.
 *
 * A screen registers and is handed a secret key (only its sha256 is stored) and
 * a 6-character code, renewed every 30 minutes. Staff enter the code in Polaris
 * to pair it. wall_displays is closed to anon and authenticated; callers use
 * the service role.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DisplayKind = "port_ops" | "training";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
const CODE_TTL_MS = 30 * 60_000;

export const pairingJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function randomHex(bytes: number) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomCode() {
  const a = crypto.getRandomValues(new Uint8Array(6));
  return [...a].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
export async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const validKey = (k: string) => /^[a-f0-9]{64}$/.test(k);
export const cleanCode = (c: unknown) => String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const validId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);

const db = () => supabaseAdmin as any;

/** A fresh code that isn't on another waiting screen (unique index backs this up). */
async function issueCode(id: string) {
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    const { error } = await db().from("wall_displays").update({ pair_code: code, pair_code_expires_at: expiresAt, updated_at: new Date().toISOString() }).eq("id", id);
    if (!error) return { code, expiresAt };
  }
  throw new Error("Could not issue a pairing code");
}

/** POST from a new screen → { key, code, expiresAt }. */
export async function registerDisplay(request: Request, kind: DisplayKind): Promise<Response> {
  // Screens that were never paired are cleared after a day; a burst of
  // registrations (someone scripting this public endpoint) is refused.
  await db().from("wall_displays").delete().eq("status", "pending").lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
  const { count } = await db().from("wall_displays").select("id", { count: "exact", head: true })
    .eq("status", "pending").gt("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
  if ((count ?? 0) > 30) return pairingJson({ error: "Too many screens waiting to be paired — try again shortly." }, 429);

  const key = randomHex(32);
  const { data: row, error } = await db().from("wall_displays")
    .insert({ key_hash: await sha256(key), status: "pending", kind, user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300) })
    .select("id").single();
  if (error || !row) return pairingJson({ error: "Could not register this screen" }, 500);
  const { code, expiresAt } = await issueCode(row.id);
  return pairingJson({ key, code, expiresAt });
}

export interface PairedDisplay { id: string; name: string | null; settings: unknown }

/**
 * The screen behind a key header. Returns a Response to send straight back when
 * it isn't paired (unknown key → 401 'unknown', waiting → its code), or the
 * paired screen. Also stamps "last seen", at most once a minute.
 */
export async function resolveDisplay(request: Request, header: string, kind: DisplayKind): Promise<Response | PairedDisplay> {
  const key = (request.headers.get(header) ?? "").trim().toLowerCase();
  if (!validKey(key)) return pairingJson({ state: "unknown" }, 401);
  const { data: d } = await db().from("wall_displays")
    .select("id, name, status, pair_code, pair_code_expires_at, settings, last_seen_at")
    .eq("key_hash", await sha256(key)).eq("kind", kind).maybeSingle();
  if (!d) return pairingJson({ state: "unknown" }, 401);

  if (d.status !== "paired") {
    if (!d.pair_code || !d.pair_code_expires_at || new Date(d.pair_code_expires_at).getTime() < Date.now()) {
      const fresh = await issueCode(d.id);
      return pairingJson({ state: "pending", ...fresh });
    }
    return pairingJson({ state: "pending", code: d.pair_code, expiresAt: d.pair_code_expires_at });
  }

  if (!d.last_seen_at || Date.now() - new Date(d.last_seen_at).getTime() > 60_000) {
    await db().from("wall_displays").update({ last_seen_at: new Date().toISOString(), user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300) }).eq("id", d.id);
  }
  return { id: d.id, name: d.name, settings: d.settings };
}

/** Staff list: every paired screen of this kind, with who paired it. */
export async function listDisplays(kind: DisplayKind, normalise: (s: unknown) => unknown) {
  const { data, error } = await db().from("wall_displays")
    .select("id, name, status, settings, paired_by, paired_at, last_seen_at, user_agent, created_at")
    .eq("status", "paired").eq("kind", kind).order("paired_at", { ascending: false });
  if (error) throw new Error(error.message);
  const ids = [...new Set((data ?? []).map((r: any) => r.paired_by).filter(Boolean))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await db().from("user_profiles").select("user_id, display_name").in("user_id", ids);
    for (const p of profs ?? []) names.set(p.user_id, p.display_name);
  }
  return (data ?? []).map((r: any) => ({
    ...r, settings: normalise(r.settings), paired_by_name: r.paired_by ? names.get(r.paired_by) ?? null : null,
  }));
}

/** Staff pair the screen showing `code`. Returns an error message, or the screen's id. */
export async function pairDisplay(kind: DisplayKind, codeRaw: unknown, name: string, settings: unknown, userId: string):
  Promise<{ error: string; status: number } | { id: string }> {
  const code = cleanCode(codeRaw);
  if (code.length !== 6) return { error: "Enter the 6-character code shown on the screen.", status: 400 };
  const { data: d } = await db().from("wall_displays").select("id, pair_code_expires_at")
    .eq("pair_code", code).eq("status", "pending").eq("kind", kind).maybeSingle();
  if (!d || !d.pair_code_expires_at || new Date(d.pair_code_expires_at).getTime() < Date.now()) {
    return { error: "That code isn't showing on any screen (codes change every 30 minutes) — check the screen and try again.", status: 404 };
  }
  const now = new Date().toISOString();
  const { error } = await db().from("wall_displays").update({
    status: "paired", name, settings,
    paired_by: userId, paired_at: now, last_seen_at: null,
    pair_code: null, pair_code_expires_at: null, updated_at: now,
  }).eq("id", d.id);
  if (error) return { error: error.message, status: 500 };
  return { id: d.id };
}

export async function updateDisplay(kind: DisplayKind, id: string, patch: Record<string, unknown>) {
  const { error } = await db().from("wall_displays").update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "paired").eq("kind", kind);
  if (error) throw new Error(error.message);
}

/** Unpair: the screen gets 'unknown', forgets its key and shows a new code. */
export async function unpairDisplay(kind: DisplayKind, id: string) {
  const { error } = await db().from("wall_displays").delete().eq("id", id).eq("kind", kind);
  if (error) throw new Error(error.message);
}
