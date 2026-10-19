/**
 * JLS Training — the training room's tablet (/training-kiosk).
 *
 * Shapes the tablet receives from /api/training-kiosk/display, plus the pure
 * rules shared by the server and the pages (no database access here, so it's
 * unit-tested in __tests__/training-kiosk.test.ts):
 *
 *   - which Training Calendar entries are sessions a student can sign in to,
 *     and which show on the tablet's calendar. The calendar also holds entries
 *     the team types with students' first names ("Nausad, Ali, Arif") — those
 *     must never reach a shared tablet, so only course/exam (and closed-day)
 *     entries pass;
 *   - cleaning what a student types, and quietly matching it to a student record.
 *
 * Everything on the tablet is non-personal: course names, dates, times and a
 * count of sign-ins. Never a student's name, mobile or payment.
 */

export const TRAINING_BRAND = "JLS Yacht Training Institute";
export const KIOSK_TZ = "Asia/Dubai";
/** How far ahead the tablet's calendar looks. */
export const CALENDAR_DAYS = 42;

export interface TrainingKioskSettings {
  /** Google "Ask for reviews" link; falls back to the Reviews module's link once Google is connected. */
  reviewUrl?: string;
  /** Heading across the top of the tablet. */
  title?: string;
}

export interface KioskSession {
  id: string;
  title: string;
  time: string | null;
  category: string | null;
  /** How many people have signed in — a count only, never who. */
  signedIn: number;
}

export interface KioskCalendarEvent {
  id: string;
  title: string;
  time: string | null;
  category: string | null;
}

export interface KioskCalendarDay {
  date: string;
  events: KioskCalendarEvent[];
}

export interface KioskCourse {
  name: string;
  duration: string | null;
  timings: string | null;
  clientType: string | null;
}

export interface TrainingKioskBoard {
  generatedAt: string;
  today: string;
  sessions: KioskSession[];
  calendar: KioskCalendarDay[];
  courses: KioskCourse[];
  reviewUrl: string | null;
}

export type TrainingKioskResponse =
  | { state: "pending"; code: string; expiresAt: string }
  | { state: "paired"; name: string; settings: TrainingKioskSettings; board: TrainingKioskBoard }
  | { state: "unknown" };

export type SignInResult =
  | { ok: true; already: boolean; firstName: string; session: string }
  | { ok: false; error: string };

/** One sign-in, as Training staff see it (Training Institute → Attendance). */
export interface AttendanceRow {
  id: string;
  session_date: string;
  calendar_event_id: string | null;
  session_title: string;
  session_time: string | null;
  session_category: string | null;
  full_name: string;
  mobile: string | null;
  student_id: string | null;
  student_name: string | null;
  match_method: "mobile" | "name" | "staff" | null;
  source: "kiosk" | "staff";
  display_name: string | null;
  signed_in_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

export interface CalendarRow {
  id: string;
  event_date: string;
  title: string | null;
  time_of_day: string | null;
  category: string | null;
}

export interface StudentRow {
  id: string;
  full_name: string | null;
  mobile: string | null;
  enrollment_status: string | null;
}

// ── Settings ─────────────────────────────────────────────────────────────────

/** An https link, or null. Staff paste these in, and the tablet turns them into a QR code. */
export function cleanUrl(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || s.length > 500) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function normaliseKioskSettings(raw: unknown): TrainingKioskSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const reviewUrl = cleanUrl(s.reviewUrl);
  const title = typeof s.title === "string" ? s.title.trim().slice(0, 80) : "";
  return { ...(reviewUrl ? { reviewUrl } : {}), ...(title ? { title } : {}) };
}

// ── Names and mobiles ────────────────────────────────────────────────────────

/** What we store and show staff: the name as typed, tidied ("  ali   khan " → "ali khan"). */
export const tidyName = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

/** For matching: no accents, case, punctuation or extra spaces ("Zoë O'Neil" → "zoe oneil"). */
export function nameKey(s: unknown): string {
  return String(s ?? "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export const mobileDigits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/**
 * The part of a number that survives "+971 50…", "0097150…" and "050…":
 * the last 9 digits (a UAE mobile without its 0 / 971).
 */
export const mobileKey = (s: unknown) => mobileDigits(s).slice(-9);

/** First name for the "Thanks, Ali" screen — only ever shown back to the person who typed it. */
export const firstName = (s: unknown) => tidyName(s).split(" ")[0] ?? "";

export function validateSignIn(input: { name?: unknown; mobile?: unknown }): { name: string; mobile: string } | { error: string } {
  const name = tidyName(input.name);
  const letters = nameKey(name).replace(/\s/g, "");
  if (letters.length < 2) return { error: "Please type your full name." };
  const digits = mobileDigits(input.mobile);
  if (digits.length < 7 || digits.length > 15) return { error: "Please type your mobile number." };
  return { name, mobile: String(input.mobile ?? "").trim().slice(0, 30) };
}

/**
 * Link a sign-in to a student record, without ever telling the tablet.
 * Mobile first (one student with that number), then the full name (exactly one
 * student with that name). Cancelled students are skipped. Ambiguous = no match,
 * so staff link it by hand rather than it landing on the wrong person.
 */
export function matchStudent(
  name: string, mobile: string, students: StudentRow[],
): { id: string; method: "mobile" | "name" } | null {
  const live = students.filter((s) => (s.enrollment_status ?? "").toLowerCase() !== "cancelled");
  const mk = mobileKey(mobile);
  if (mk.length >= 7) {
    const hits = live.filter((s) => mobileKey(s.mobile) === mk);
    if (hits.length === 1) return { id: hits[0].id, method: "mobile" };
  }
  const nk = nameKey(name);
  if (nk) {
    const hits = live.filter((s) => nameKey(s.full_name) === nk);
    if (hits.length === 1) return { id: hits[0].id, method: "name" };
  }
  return null;
}

// ── Which calendar entries the tablet may show ───────────────────────────────

const SESSION_CATEGORIES = new Set(["class", "exam"]);
const COURSE_PREFIX = /^(rya|src|vhf|stcw|pwc|powerboat)\b/;

/** Course names as match keys ("SRC/VHF (Short …):" and "RYA PWC" alike). */
export const courseKeys = (names: (string | null)[]) => new Set(names.map(nameKey).filter(Boolean));

/** A course or exam a student can sign in to. Uncategorised entries pass only if they're plainly a course. */
export function isSessionEvent(ev: Pick<CalendarRow, "title" | "category">, courses: Set<string>): boolean {
  const cat = (ev.category ?? "").trim().toLowerCase();
  if (SESSION_CATEGORIES.has(cat)) return true;
  if (cat) return false; // Holiday / Meeting / Other — never a session
  const key = nameKey(ev.title);
  return !!key && (courses.has(key) || COURSE_PREFIX.test(key));
}

/** On the tablet's calendar: sessions, plus days the school is closed. Never meetings or name lists. */
export function isCalendarEvent(ev: Pick<CalendarRow, "title" | "category">, courses: Set<string>): boolean {
  return isSessionEvent(ev, courses) || (ev.category ?? "").trim().toLowerCase() === "holiday";
}

/** "Class" / "Exam" / "Closed" — the label the tablet shows (Holiday reads as Closed). */
export function categoryLabel(category: string | null): string | null {
  const c = (category ?? "").trim().toLowerCase();
  if (c === "class") return "Class";
  if (c === "exam") return "Exam";
  if (c === "holiday") return "Closed";
  return null;
}

/** Group the allowed entries by day, earliest first, each day in time order. */
export function buildCalendar(rows: CalendarRow[], courses: Set<string>, from: string, to: string): KioskCalendarDay[] {
  const byDay = new Map<string, KioskCalendarEvent[]>();
  for (const r of rows) {
    if (!r.event_date || r.event_date < from || r.event_date > to || !r.title?.trim()) continue;
    if (!isCalendarEvent(r, courses)) continue;
    const list = byDay.get(r.event_date) ?? [];
    list.push({ id: r.id, title: r.title.trim(), time: r.time_of_day?.trim() || null, category: categoryLabel(r.category) });
    byDay.set(r.event_date, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, events]) => ({ date, events: events.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")) }));
}

// ── Dates (always UAE time — the tablet's own clock zone may be anything) ────

export function dubaiToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: KIOSK_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
