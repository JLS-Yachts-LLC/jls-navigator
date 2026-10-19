/**
 * Port Operations wall — pairing TV screens and feeding them.
 *
 *   /api/wall/display   (the screen — no login; its secret key is the authorisation)
 *     POST                      → registers a new screen: { key, code, expiresAt }
 *     GET   X-Wall-Key: <key>   → { state: 'pending', code } until a person pairs it,
 *                                 then { state: 'paired', name, settings, board };
 *                                 { state: 'unknown' } (401) once it's unpaired
 *     GET   ?vessel=<id>        → { vessel } — one board vessel's details (interactive screens only)
 *
 *   /api/wall/admin     (staff — Bearer token, agency module)
 *     GET                       → every paired / waiting screen
 *     POST   { code, name, settings? }  → pairs the screen showing that code
 *     PATCH  { id, name?, settings? }   → rename / choose panels
 *     DELETE { id }                     → unpairs it (the screen goes back to its code)
 *
 * wall_displays is closed to anon and authenticated; only the sha256 of each
 * key is stored, so a database read can't be replayed as a screen.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAccess } from "@/lib/auth/requireAccess.server";
import { buildWallBoard, buildWallVesselDetail } from "@/lib/wall-board.server";
import { isInteractive, normaliseWallSettings } from "@/lib/wall-types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
const CODE_TTL_MS = 30 * 60_000;

function randomHex(bytes: number) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomCode() {
  const a = crypto.getRandomValues(new Uint8Array(6));
  return [...a].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const validKey = (k: string) => /^[a-f0-9]{64}$/.test(k);
const cleanCode = (c: unknown) => String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** A fresh code that isn't on another waiting screen (unique index backs this up). */
async function issueCode(db: any, id: string) {
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    const { error } = await db.from("wall_displays").update({ pair_code: code, pair_code_expires_at: expiresAt, updated_at: new Date().toISOString() }).eq("id", id);
    if (!error) return { code, expiresAt };
  }
  throw new Error("Could not issue a pairing code");
}

export async function wallDisplayHandler(request: Request): Promise<Response> {
  const db = supabaseAdmin as any;

  if (request.method === "POST") {
    // Screens that were never paired are cleared after a day; a burst of
    // registrations (someone scripting this public endpoint) is refused.
    await db.from("wall_displays").delete().eq("status", "pending").lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
    const { count } = await db.from("wall_displays").select("id", { count: "exact", head: true })
      .eq("status", "pending").gt("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
    if ((count ?? 0) > 30) return json({ error: "Too many screens waiting to be paired — try again shortly." }, 429);

    const key = randomHex(32);
    const { data: row, error } = await db.from("wall_displays")
      .insert({ key_hash: await sha256(key), status: "pending", user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300) })
      .select("id").single();
    if (error || !row) return json({ error: "Could not register this screen" }, 500);
    const { code, expiresAt } = await issueCode(db, row.id);
    return json({ key, code, expiresAt });
  }

  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const key = (request.headers.get("x-wall-key") ?? "").trim().toLowerCase();
  if (!validKey(key)) return json({ state: "unknown" }, 401);
  const { data: d } = await db.from("wall_displays")
    .select("id, name, status, pair_code, pair_code_expires_at, settings, last_seen_at")
    .eq("key_hash", await sha256(key)).maybeSingle();
  if (!d) return json({ state: "unknown" }, 401);

  if (d.status !== "paired") {
    if (!d.pair_code || !d.pair_code_expires_at || new Date(d.pair_code_expires_at).getTime() < Date.now()) {
      const fresh = await issueCode(db, d.id);
      return json({ state: "pending", ...fresh });
    }
    return json({ state: "pending", code: d.pair_code, expiresAt: d.pair_code_expires_at });
  }

  // "Last seen" for the admin list — at most once a minute per screen.
  if (!d.last_seen_at || Date.now() - new Date(d.last_seen_at).getTime() > 60_000) {
    await db.from("wall_displays").update({ last_seen_at: new Date().toISOString(), user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300) }).eq("id", d.id);
  }

  const settings = normaliseWallSettings(d.settings);

  // Tap-for-details: only on screens set to interactive, only for vessels on the board.
  const vessel = new URL(request.url).searchParams.get("vessel");
  if (vessel !== null) {
    if (!isInteractive(settings)) return json({ error: "Details are switched off on this screen" }, 403);
    if (!/^[0-9a-f-]{36}$/i.test(vessel)) return json({ error: "Unknown vessel" }, 400);
    const detail = await buildWallVesselDetail(vessel);
    if (!detail) return json({ error: "That vessel isn't on the board" }, 404);
    return json({ vessel: detail });
  }

  const board = await buildWallBoard();
  return json({ state: "paired", name: d.name ?? "Wall display", settings, board });
}

export async function wallAdminHandler(request: Request): Promise<Response> {
  // Agency view is enough to pair, rename and unpair screens: setting up an
  // office TV isn't agency work, and the board never shows anything confidential.
  const access = await requireAccess(request, { module: "agency", level: "view" });
  if (!access.ok) return access.response;
  const db = supabaseAdmin as any;

  if (request.method === "GET") {
    const { data, error } = await db.from("wall_displays")
      .select("id, name, status, settings, paired_by, paired_at, last_seen_at, user_agent, created_at")
      .eq("status", "paired").order("paired_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    const ids = [...new Set((data ?? []).map((r: any) => r.paired_by).filter(Boolean))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await db.from("user_profiles").select("user_id, display_name").in("user_id", ids);
      for (const p of profs ?? []) names.set(p.user_id, p.display_name);
    }
    return json({
      displays: (data ?? []).map((r: any) => ({
        ...r, settings: normaliseWallSettings(r.settings), paired_by_name: r.paired_by ? names.get(r.paired_by) ?? null : null,
      })),
    });
  }

  let body: any = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request body" }, 400); }

  if (request.method === "POST") {
    const code = cleanCode(body.code);
    const name = String(body.name ?? "").trim().slice(0, 80);
    if (code.length !== 6) return json({ error: "Enter the 6-character code shown on the screen." }, 400);
    if (!name) return json({ error: "Give the screen a name, e.g. “Port Ops office TV”." }, 400);
    const { data: d } = await db.from("wall_displays").select("id, pair_code_expires_at")
      .eq("pair_code", code).eq("status", "pending").maybeSingle();
    if (!d || !d.pair_code_expires_at || new Date(d.pair_code_expires_at).getTime() < Date.now()) {
      return json({ error: "That code isn't showing on any screen (codes change every 30 minutes) — check the TV and try again." }, 404);
    }
    const now = new Date().toISOString();
    const { error } = await db.from("wall_displays").update({
      status: "paired", name, settings: normaliseWallSettings(body.settings),
      paired_by: access.claims.userId, paired_at: now, last_seen_at: null,
      pair_code: null, pair_code_expires_at: null, updated_at: now,
    }).eq("id", d.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, id: d.id });
  }

  const id = String(body.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Unknown screen" }, 400);

  if (request.method === "PATCH") {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) {
      const name = String(body.name ?? "").trim().slice(0, 80);
      if (!name) return json({ error: "The name can't be empty" }, 400);
      patch.name = name;
    }
    if (body.settings !== undefined) patch.settings = normaliseWallSettings(body.settings);
    const { error } = await db.from("wall_displays").update(patch).eq("id", id).eq("status", "paired");
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (request.method === "DELETE") {
    const { error } = await db.from("wall_displays").delete().eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}
