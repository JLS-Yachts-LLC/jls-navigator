/**
 * Crew Academy offline — courses saved on the crew member's phone.
 *
 *   saveCourse()        course content + every file (videos, PDFs, pictures) into
 *                       Cache Storage, so the lessons open without signal
 *   loadCourse()        the saved copy, when the network doesn't answer
 *   offlineMedia()      a saved file as a local object URL (preferred even online:
 *                       it saves data at sea)
 *   queue() / flush()   progress made offline (lesson opened, video watched,
 *                       sign-off) waits here and is sent when signal returns
 *   applyLocally()      what that progress looks like meanwhile, so the player
 *                       moves on as if it had been saved
 *
 * Quizzes and exercises are NOT marked offline — their answers never leave the
 * server — so they wait for signal. Everything here belongs to one login: the
 * store is wiped on sign-out and whenever a different person signs in on the
 * same phone (claimDevice).
 */
import { findLesson, type BlockProgress, type CourseContent } from "@/lib/academy/content";

const CACHE = "academy-offline-v1";
const OWNER = "academy.offline.owner";
const HOME = "academy.offline.home";
const SAVED = "academy.offline.saved";
const OUTBOX = "academy.offline.outbox";

const courseKey = (enrolmentId: string) => `/__academy-offline/course/${enrolmentId}`;
const mediaKey = (enrolmentId: string, mediaId: string) => `/__academy-offline/media/${enrolmentId}/${mediaId}`;

const read = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* full or private mode */ } };

/** True for "no signal / server unreachable", false for a real answer from the server (e.g. 403). */
export const isOffline = (e: unknown) => !navigator.onLine || e instanceof TypeError || (e as any)?.status === undefined;

export const offlineSupported = () => typeof window !== "undefined" && "caches" in window;

/** One phone, one person: anything saved by someone else goes. */
export async function claimDevice(userId: string) {
  if (read<string | null>(OWNER, null) !== userId) {
    await clearOffline();
    write(OWNER, userId);
  }
}
export const deviceOwner = () => read<string | null>(OWNER, null);

export async function clearOffline() {
  try { await caches.delete(CACHE); } catch { /* not supported */ }
  for (const k of [OWNER, HOME, SAVED, OUTBOX]) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
}

export const saveHome = (home: unknown) => write(HOME, home);
export const loadHome = <T,>(): T | null => read<T | null>(HOME, null);

export type SavedCourse = { title: string; bytes: number; savedAt: string };
export const savedCourses = () => read<Record<string, SavedCourse>>(SAVED, {});

/** Save a course and its files. `fileUrl` returns a fresh signed link for one file. */
export async function saveCourse(enrolmentId: string, payload: any, fileUrl: (mediaId: string) => Promise<string | null>,
  onProgress?: (done: number, total: number) => void) {
  const cache = await caches.open(CACHE);
  const ids = Object.keys(payload.mediaSizes ?? {});
  let bytes = 0;
  for (let i = 0; i < ids.length; i++) {
    onProgress?.(i, ids.length);
    const url = await fileUrl(ids[i]);
    if (!url) throw new Error("A file couldn't be downloaded — try again with a better connection.");
    const res = await fetch(url);
    if (!res.ok) throw new Error("A file couldn't be downloaded — try again with a better connection.");
    const blob = await res.blob();
    bytes += blob.size;
    await cache.put(mediaKey(enrolmentId, ids[i]), new Response(blob, { headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/octet-stream" } }));
  }
  await cache.put(courseKey(enrolmentId), new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } }));
  onProgress?.(ids.length, ids.length);
  write(SAVED, { ...savedCourses(), [enrolmentId]: { title: payload.course?.title ?? "Course", bytes, savedAt: new Date().toISOString() } });
}

export async function loadCourse<T,>(enrolmentId: string): Promise<T | null> {
  if (!offlineSupported()) return null;
  const res = await (await caches.open(CACHE)).match(courseKey(enrolmentId));
  return res ? ((await res.json()) as T) : null;
}

/** Keep the saved copy's progress current after each online save. */
export async function updateSavedProgress(enrolmentId: string, progress: BlockProgress[], status?: string) {
  if (!savedCourses()[enrolmentId]) return;
  const payload = await loadCourse<any>(enrolmentId);
  if (!payload) return;
  payload.progress = progress;
  if (status) payload.enrolment = { ...payload.enrolment, status };
  await (await caches.open(CACHE)).put(courseKey(enrolmentId), new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } }));
}

export async function offlineMedia(enrolmentId: string, mediaId: string): Promise<string | null> {
  if (!offlineSupported() || !savedCourses()[enrolmentId]) return null;
  const res = await (await caches.open(CACHE)).match(mediaKey(enrolmentId, mediaId));
  return res ? URL.createObjectURL(await res.blob()) : null;
}

export async function removeCourse(enrolmentId: string) {
  const cache = await caches.open(CACHE);
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path === courseKey(enrolmentId) || path.startsWith(`/__academy-offline/media/${enrolmentId}/`)) await cache.delete(req);
  }
  const saved = savedCourses();
  delete saved[enrolmentId];
  write(SAVED, saved);
}

// ── Progress made offline ────────────────────────────────────────────────────
type Queued = { op: "viewed" | "video" | "acknowledge"; enrolment: string; [k: string]: unknown };
export const queued = () => read<Queued[]>(OUTBOX, []);
export const queue = (body: Queued) => write(OUTBOX, [...queued(), body]);

/** Send what was saved offline, oldest first. Stops at the first sign there is still no signal. */
export async function flush(post: (body: unknown) => Promise<unknown>): Promise<number> {
  let sent = 0;
  for (const body of queued()) {
    try {
      await post(body);
    } catch (e) {
      if (isOffline(e)) break;
      // The server said no (e.g. the course was taken off them) — drop it rather than retry forever.
    }
    write(OUTBOX, queued().slice(1));
    sent++;
  }
  return sent;
}

/** The progress the server would record for an offline action (passive blocks seen, video watched, signed). */
export function applyLocally(content: CourseContent, progress: BlockProgress[], body: Queued): BlockProgress[] {
  const now = new Date().toISOString();
  const byId = new Map(progress.map((p) => [p.block_id, { ...p }]));
  const touch = (id: string, patch: Partial<BlockProgress>) => byId.set(id, { ...(byId.get(id) ?? { block_id: id }), ...patch });
  if (body.op === "viewed") {
    for (const b of findLesson(content, String(body.lessonId))?.blocks ?? []) {
      const passive = b.type === "reading" || b.type === "image" || b.type === "document" || (b.type === "video" && !(b.mediaId && b.mustWatch));
      if (passive && !byId.get(b.id)?.viewed_at) touch(b.id, { viewed_at: now });
    }
  } else if (body.op === "video") {
    const id = String(body.blockId);
    touch(id, { viewed_at: byId.get(id)?.viewed_at ?? now, video_percent: Math.max(byId.get(id)?.video_percent ?? 0, Number(body.percent) || 0) });
  } else if (body.op === "acknowledge") {
    const id = String(body.blockId);
    if (!byId.get(id)?.completed_at) touch(id, { completed_at: now, viewed_at: byId.get(id)?.viewed_at ?? now });
  }
  return [...byId.values()];
}
