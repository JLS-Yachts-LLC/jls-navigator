/**
 * JLS Training — what the training room tablet is fed, and its sign-ins.
 *
 * Runs with the service role, so THIS file is the confidentiality fence: the
 * board holds course names, dates, times, the course list and a COUNT of
 * sign-ins per session. Never a student's name, mobile, payment or booking.
 * The calendar rows the team types with students' names are filtered out by
 * isCalendarEvent() (lib/training-kiosk.ts, unit-tested).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CALENDAR_DAYS, TRAINING_BRAND, addDays, buildCalendar, categoryLabel, courseKeys, dubaiToday, firstName,
  isSessionEvent, matchStudent, nameKey, type CalendarRow, type KioskCourse, type SignInResult, type StudentRow,
  type TrainingKioskBoard, type TrainingKioskSettings, type AttendanceRow,
} from "@/lib/training-kiosk";

const db = () => supabaseAdmin as any;

async function loadCourses(): Promise<{ courses: KioskCourse[]; keys: Set<string> }> {
  const { data } = await db().from("training_courses").select("name, duration, timings, client_type").order("name");
  const rows = (data ?? []) as { name: string | null; duration: string | null; timings: string | null; client_type: string | null }[];
  return {
    // Prices left off on purpose (Training team, 19 Oct 2026).
    courses: rows.filter((r) => r.name?.trim()).map((r) => ({
      name: r.name!.trim().replace(/:$/, ""), duration: r.duration, timings: r.timings, clientType: r.client_type,
    })),
    keys: courseKeys(rows.map((r) => r.name)),
  };
}

async function reviewLink(settings: TrainingKioskSettings): Promise<string | null> {
  if (settings.reviewUrl) return settings.reviewUrl;
  // Once Google Business Profile is connected (Communications → Reviews) the link arrives by itself.
  const { data } = await db().from("review_brands").select("new_review_url").eq("name", TRAINING_BRAND).maybeSingle();
  const url = data?.new_review_url as string | null | undefined;
  return url && url.startsWith("https://") ? url : null;
}

export async function buildKioskBoard(settings: TrainingKioskSettings): Promise<TrainingKioskBoard> {
  const today = dubaiToday();
  const until = addDays(today, CALENDAR_DAYS - 1);
  const [{ courses, keys }, { data: events }, reviewUrl] = await Promise.all([
    loadCourses(),
    db().from("training_calendar_events").select("id, event_date, title, time_of_day, category")
      .gte("event_date", today).lte("event_date", until).order("event_date"),
    reviewLink(settings),
  ]);
  const rows = (events ?? []) as CalendarRow[];

  const todays = rows.filter((r) => r.event_date === today && r.title?.trim() && isSessionEvent(r, keys));
  const counts = new Map<string, number>();
  if (todays.length) {
    const { data: att } = await db().from("training_attendance").select("calendar_event_id")
      .in("calendar_event_id", todays.map((r) => r.id)).is("voided_at", null);
    for (const a of att ?? []) counts.set(a.calendar_event_id, (counts.get(a.calendar_event_id) ?? 0) + 1);
  }

  return {
    generatedAt: new Date().toISOString(),
    today,
    sessions: todays
      .map((r) => ({ id: r.id, title: r.title!.trim(), time: r.time_of_day?.trim() || null, category: categoryLabel(r.category), signedIn: counts.get(r.id) ?? 0 }))
      .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")),
    calendar: buildCalendar(rows, keys, today, until),
    courses,
    reviewUrl,
  };
}

async function loadStudents(): Promise<StudentRow[]> {
  const { data } = await db().from("training_students").select("id, full_name, mobile, enrollment_status").limit(5000);
  return (data ?? []) as StudentRow[];
}

/** A sign-in from the tablet. Only for today's sessions; the same person twice = "already signed in". */
export async function kioskSignIn(displayId: string, eventId: string, name: string, mobile: string): Promise<SignInResult> {
  const today = dubaiToday();
  const { data: ev } = await db().from("training_calendar_events")
    .select("id, event_date, title, time_of_day, category").eq("id", eventId).maybeSingle();
  const { keys } = await loadCourses();
  if (!ev || ev.event_date !== today || !ev.title?.trim() || !isSessionEvent(ev, keys)) {
    return { ok: false, error: "That session isn't running today — please ask your instructor." };
  }

  // A shared tablet can be poked at; a class is a handful of people.
  const { count } = await db().from("training_attendance").select("id", { count: "exact", head: true })
    .eq("display_id", displayId).gt("signed_in_at", new Date(Date.now() - 10 * 60_000).toISOString());
  if ((count ?? 0) >= 60) return { ok: false, error: "Too many sign-ins in a few minutes — please ask your instructor." };

  const key = nameKey(name);
  const session = ev.title.trim();
  const { data: existing } = await db().from("training_attendance").select("id")
    .eq("calendar_event_id", ev.id).eq("name_key", key).is("voided_at", null).limit(1);
  if (existing?.length) return { ok: true, already: true, firstName: firstName(name), session };

  const match = matchStudent(name, mobile, await loadStudents());
  const { error } = await db().from("training_attendance").insert({
    session_date: ev.event_date, calendar_event_id: ev.id, session_title: session,
    session_time: ev.time_of_day?.trim() || null, session_category: categoryLabel(ev.category),
    full_name: name, name_key: key, mobile,
    student_id: match?.id ?? null, match_method: match?.method ?? null,
    source: "kiosk", display_id: displayId,
  });
  if (error) {
    if (error.code === "23505") return { ok: true, already: true, firstName: firstName(name), session };
    return { ok: false, error: "Couldn't save that — please try again." };
  }
  return { ok: true, already: false, firstName: firstName(name), session };
}

// ── Staff (Training Institute → Attendance) ──────────────────────────────────

export async function listAttendance(from: string, to: string): Promise<AttendanceRow[]> {
  const { data, error } = await db().from("training_attendance")
    .select("id, session_date, calendar_event_id, session_title, session_time, session_category, full_name, mobile, student_id, match_method, source, display_id, signed_in_at, voided_at, void_reason")
    .gte("session_date", from).lte("session_date", to)
    .order("session_date", { ascending: false }).order("signed_in_at", { ascending: true }).limit(5000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  const studentIds = [...new Set(rows.map((r) => r.student_id).filter(Boolean))];
  const displayIds = [...new Set(rows.map((r) => r.display_id).filter(Boolean))];
  const [{ data: studs }, { data: disps }] = await Promise.all([
    studentIds.length ? db().from("training_students").select("id, full_name").in("id", studentIds) : Promise.resolve({ data: [] }),
    displayIds.length ? db().from("wall_displays").select("id, name").in("id", displayIds) : Promise.resolve({ data: [] }),
  ]);
  const sName = new Map<string, string>((studs ?? []).map((s: any) => [s.id, s.full_name]));
  const dName = new Map<string, string>((disps ?? []).map((d: any) => [d.id, d.name]));
  return rows.map(({ display_id, ...r }) => ({
    ...r,
    student_name: r.student_id ? sName.get(r.student_id) ?? null : null,
    display_name: display_id ? dName.get(display_id) ?? null : null,
  }));
}

/** Staff add someone who didn't (or couldn't) use the tablet. */
export async function addAttendance(input: {
  eventId: string; name: string; mobile: string | null; studentId: string | null; userId: string;
}): Promise<{ error: string } | { id: string }> {
  const { data: ev } = await db().from("training_calendar_events")
    .select("id, event_date, title, time_of_day, category").eq("id", input.eventId).maybeSingle();
  if (!ev || !ev.title?.trim()) return { error: "That calendar entry no longer exists." };
  const { data, error } = await db().from("training_attendance").insert({
    session_date: ev.event_date, calendar_event_id: ev.id, session_title: ev.title.trim(),
    session_time: ev.time_of_day?.trim() || null, session_category: categoryLabel(ev.category),
    full_name: input.name, name_key: nameKey(input.name), mobile: input.mobile,
    student_id: input.studentId, match_method: input.studentId ? "staff" : null,
    source: "staff", recorded_by: input.userId,
  }).select("id").single();
  if (error) return { error: error.code === "23505" ? `${input.name} is already signed in to that session.` : error.message };
  return { id: data.id };
}

/** Link to a student / unlink, or cancel / restore a sign-in. */
export async function updateAttendance(id: string, patch: {
  studentId?: string | null; voided?: boolean; reason?: string | null; userId: string;
}): Promise<{ error: string } | { ok: true }> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.studentId !== undefined) {
    row.student_id = patch.studentId;
    row.match_method = patch.studentId ? "staff" : null;
  }
  if (patch.voided !== undefined) {
    row.voided_at = patch.voided ? new Date().toISOString() : null;
    row.voided_by = patch.voided ? patch.userId : null;
    row.void_reason = patch.voided ? (patch.reason ?? null) : null;
  }
  const { error } = await db().from("training_attendance").update(row).eq("id", id);
  if (error) return { error: error.code === "23505" ? "That person is already signed in to this session again — cancel the other sign-in first." : error.message };
  return { ok: true };
}
