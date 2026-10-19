/**
 * JLS Training — the training room tablet (/training-kiosk), paired like a wall screen.
 *
 *   /api/training-kiosk/display   (the tablet — no login; its secret key is the authorisation)
 *     POST                          → registers a new tablet: { key, code, expiresAt }
 *     GET   X-Kiosk-Key: <key>      → { state: 'pending', code } until staff pair it,
 *                                     then { state: 'paired', name, settings, board };
 *                                     { state: 'unknown' } (401) once it's unpaired
 *   /api/training-kiosk/sign-in   POST X-Kiosk-Key { eventId, name, mobile } → SignInResult
 *
 *   /api/training-kiosk/admin     (staff — Bearer token, training module; edit to change)
 *     GET / POST { code, name, settings? } / PATCH { id, name?, settings? } / DELETE { id }
 *   /api/training-kiosk/attendance (staff — training view to read, edit to change)
 *     GET   ?from=yyyy-mm-dd&to=yyyy-mm-dd  → { rows }
 *     POST  { eventId, name, mobile?, studentId? }       → adds a sign-in by hand
 *     PATCH { id, studentId?, voided?, reason? }        → link a student / cancel / restore
 *
 * The tablet's screens live in wall_displays (kind 'training'); attendance in
 * training_attendance. Both are closed to anon and authenticated.
 */
import { requireAccess } from "@/lib/auth/requireAccess.server";
import {
  listDisplays, pairDisplay, pairingJson as json, registerDisplay, resolveDisplay, unpairDisplay, updateDisplay, validId,
} from "@/lib/display-pairing.server";
import { normaliseKioskSettings, tidyName, validateSignIn } from "@/lib/training-kiosk";
import { addAttendance, buildKioskBoard, kioskSignIn, listAttendance, updateAttendance } from "@/lib/training-kiosk.server";

const KEY_HEADER = "x-kiosk-key";
const isYmd = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

async function readBody(request: Request): Promise<any | null> {
  try { return await request.json(); } catch { return null; }
}

export async function kioskDisplayHandler(request: Request): Promise<Response> {
  if (request.method === "POST") return registerDisplay(request, "training");
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const d = await resolveDisplay(request, KEY_HEADER, "training");
  if (d instanceof Response) return d;
  const settings = normaliseKioskSettings(d.settings);
  const board = await buildKioskBoard(settings);
  return json({ state: "paired", name: d.name ?? "Training tablet", settings, board });
}

export async function kioskSignInHandler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const d = await resolveDisplay(request, KEY_HEADER, "training");
  if (d instanceof Response) return json({ ok: false, error: "This tablet isn't paired any more." }, 401);
  const body = await readBody(request);
  if (!body || !validId(body.eventId)) return json({ ok: false, error: "Pick your session first." }, 400);
  const v = validateSignIn(body);
  if ("error" in v) return json({ ok: false, error: v.error }, 400);
  const r = await kioskSignIn(d.id, body.eventId, v.name, v.mobile);
  return json(r, r.ok ? 200 : 400);
}

export async function kioskAdminHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "training", level: request.method === "GET" ? "view" : "edit" });
  if (!access.ok) return access.response;

  try {
    if (request.method === "GET") return json({ displays: await listDisplays("training", normaliseKioskSettings) });

    const body = await readBody(request);
    if (!body) return json({ error: "Invalid request body" }, 400);

    if (request.method === "POST") {
      const name = String(body.name ?? "").trim().slice(0, 80);
      if (!name) return json({ error: "Give the tablet a name, e.g. “Training room tablet”." }, 400);
      const r = await pairDisplay("training", body.code, name, normaliseKioskSettings(body.settings), access.claims.userId);
      if ("error" in r) return json({ error: r.error }, r.status);
      return json({ ok: true, id: r.id });
    }

    if (!validId(body.id)) return json({ error: "Unknown tablet" }, 400);
    if (request.method === "PATCH") {
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) {
        const name = String(body.name ?? "").trim().slice(0, 80);
        if (!name) return json({ error: "The name can't be empty" }, 400);
        patch.name = name;
      }
      if (body.settings !== undefined) patch.settings = normaliseKioskSettings(body.settings);
      await updateDisplay("training", body.id, patch);
      return json({ ok: true });
    }
    if (request.method === "DELETE") {
      await unpairDisplay("training", body.id);
      return json({ ok: true });
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

export async function kioskAttendanceHandler(request: Request): Promise<Response> {
  const access = await requireAccess(request, { module: "training", level: request.method === "GET" ? "view" : "edit" });
  if (!access.ok) return access.response;

  try {
    if (request.method === "GET") {
      const u = new URL(request.url);
      const from = u.searchParams.get("from");
      const to = u.searchParams.get("to");
      if (!isYmd(from) || !isYmd(to) || from > to) return json({ error: "Choose a date range" }, 400);
      return json({ rows: await listAttendance(from, to) });
    }

    const body = await readBody(request);
    if (!body) return json({ error: "Invalid request body" }, 400);
    const studentId = body.studentId === null ? null : validId(body.studentId) ? body.studentId : undefined;

    if (request.method === "POST") {
      if (!validId(body.eventId)) return json({ error: "Choose the session" }, 400);
      const name = tidyName(body.name);
      if (name.length < 2) return json({ error: "Type the student's name" }, 400);
      const mobile = String(body.mobile ?? "").trim().slice(0, 30) || null;
      const r = await addAttendance({ eventId: body.eventId, name, mobile, studentId: studentId ?? null, userId: access.claims.userId });
      if ("error" in r) return json({ error: r.error }, 400);
      return json({ ok: true, id: r.id });
    }

    if (request.method === "PATCH") {
      if (!validId(body.id)) return json({ error: "Unknown sign-in" }, 400);
      const r = await updateAttendance(body.id, {
        ...(studentId !== undefined ? { studentId } : {}),
        ...(typeof body.voided === "boolean" ? { voided: body.voided } : {}),
        reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 200) || null : null,
        userId: access.claims.userId,
      });
      if ("error" in r) return json({ error: r.error }, 400);
      return json({ ok: true });
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}
