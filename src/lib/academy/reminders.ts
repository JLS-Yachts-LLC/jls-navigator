/**
 * Which reminders an enrolment is due (pure — tested in __tests__/reminders.test.ts).
 *
 *   enrolled     given to them within the last 7 days (older ones are never announced late)
 *   due_soon     due today or within the next 3 days
 *   overdue-N    N = 0 the day after the due date, then 1, 2, 3 a week apart each
 *
 * Only unfinished courses (not_started / in_progress / failed). academy_reminders
 * has one row per (enrolment, kind), so each fires at most once.
 */
export type ReminderEnrolment = { status: string; created_at: string; due_date: string | null };

const DAY = 86_400_000;
const dayNumber = (iso: string) => Math.floor(Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso) / DAY);

export function reminderKinds(e: ReminderEnrolment, now = new Date()): string[] {
  if (!["not_started", "in_progress", "failed"].includes(e.status)) return [];
  const today = Math.floor(now.getTime() / DAY);
  const kinds: string[] = [];
  if (today - dayNumber(e.created_at) <= 7) kinds.push("enrolled");
  if (e.due_date) {
    const until = dayNumber(e.due_date) - today;
    if (until >= 0 && until <= 3) kinds.push("due_soon");
    if (until < 0) kinds.push(`overdue-${Math.min(3, Math.floor((-until - 1) / 7))}`);
  }
  return kinds;
}
