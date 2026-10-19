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
 * key is stored, so a database read can't be replayed as a screen. Pairing
 * itself is shared with the Training room tablet (lib/display-pairing.server.ts);
 * everything here is scoped to kind 'port_ops'.
 */
import { requireAccess } from "@/lib/auth/requireAccess.server";
import { buildWallBoard, buildWallVesselDetail } from "@/lib/wall-board.server";
import { isInteractive, normaliseWallSettings } from "@/lib/wall-types";
import {
  listDisplays, pairDisplay, pairingJson as json, registerDisplay, resolveDisplay, unpairDisplay, updateDisplay, validId,
} from "@/lib/display-pairing.server";

export async function wallDisplayHandler(request: Request): Promise<Response> {
  if (request.method === "POST") return registerDisplay(request, "port_ops");
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const d = await resolveDisplay(request, "x-wall-key", "port_ops");
  if (d instanceof Response) return d;

  const settings = normaliseWallSettings(d.settings);

  // Tap-for-details: only on screens set to interactive, only for vessels on the board.
  const vessel = new URL(request.url).searchParams.get("vessel");
  if (vessel !== null) {
    if (!isInteractive(settings)) return json({ error: "Details are switched off on this screen" }, 403);
    if (!validId(vessel)) return json({ error: "Unknown vessel" }, 400);
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

  if (request.method === "GET") {
    try {
      return json({ displays: await listDisplays("port_ops", normaliseWallSettings) });
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }
  }

  let body: any = {};
  try { body = await request.json(); } catch { return json({ error: "Invalid request body" }, 400); }

  if (request.method === "POST") {
    const name = String(body.name ?? "").trim().slice(0, 80);
    if (!name) return json({ error: "Give the screen a name, e.g. “Port Ops office TV”." }, 400);
    const r = await pairDisplay("port_ops", body.code, name, normaliseWallSettings(body.settings), access.claims.userId);
    if ("error" in r) return json({ error: r.error }, r.status);
    return json({ ok: true, id: r.id });
  }

  const id = String(body.id ?? "");
  if (!validId(id)) return json({ error: "Unknown screen" }, 400);

  try {
    if (request.method === "PATCH") {
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) {
        const name = String(body.name ?? "").trim().slice(0, 80);
        if (!name) return json({ error: "The name can't be empty" }, 400);
        patch.name = name;
      }
      if (body.settings !== undefined) patch.settings = normaliseWallSettings(body.settings);
      await updateDisplay("port_ops", id, patch);
      return json({ ok: true });
    }
    if (request.method === "DELETE") {
      await unpairDisplay("port_ops", id);
      return json({ ok: true });
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  return json({ error: "Method not allowed" }, 405);
}
