/**
 * Orbit 2 — loading tasks, and turning them into what the dashboard draws.
 *
 * Kept apart from the rendering so each figure on the page can be read as a
 * definition: what counts as complete, how hours are derived, which vessels
 * appear. The dashboard shows only what has been entered — no seeded or example
 * data — so an empty Orbit 2 shows zeros rather than something invented.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";

export type Orbit2Task = {
  id: string;
  title: string;
  category: string;
  yacht_id: string | null;
  status: "pending" | "complete";
  task_date: string | null;
  start_time: string | null;
  end_time: string | null;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
};

export type Yacht = { id: string; vessel_name: string };

/** "14:30:00" → 14.5. Null when the time is missing or unreadable. */
export function hourOf(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]) + Number(m[2]) / 60;
  return h >= 0 && h <= 24 ? h : null;
}

/**
 * How long a task takes. Only a task with BOTH a start and an end contributes —
 * guessing a duration would put invented hours into the donut.
 */
export function durationHours(t: Pick<Orbit2Task, "start_time" | "end_time">): number {
  const s = hourOf(t.start_time);
  const e = hourOf(t.end_time);
  if (s === null || e === null || e <= s) return 0;
  return e - s;
}

export function useOrbit2() {
  const [tasks, setTasks] = useState<Orbit2Task[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [t, y] = await Promise.all([
      // Paged, so the dashboard keeps counting past the 1000-row response cap.
      fetchAllRows(() => (supabase as any).from("orbit2_tasks").select("*").order("task_date", { ascending: true })),
      fetchAllRows(() => (supabase as any).from("yachts").select("id, vessel_name").order("vessel_name")),
    ]);
    setTasks((t.data ?? []) as Orbit2Task[]);
    setYachts((y.data ?? []) as Yacht[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  return { tasks, yachts, loading, reload: load };
}

/** Hours per service category, largest first — the donut. */
export function byCategory(tasks: Orbit2Task[]) {
  const totals = new Map<string, { hours: number; count: number }>();
  for (const t of tasks) {
    const cur = totals.get(t.category) ?? { hours: 0, count: 0 };
    cur.hours += durationHours(t);
    cur.count += 1;
    totals.set(t.category, cur);
  }
  return [...totals.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.hours - a.hours || b.count - a.count);
}

/** Complete against everything entered — the Task Complete bar. */
export function completion(tasks: Orbit2Task[]) {
  const total = tasks.length;
  const complete = tasks.filter((t) => t.status === "complete").length;
  return { total, complete, pending: total - complete, pct: total ? Math.round((complete / total) * 100) : 0 };
}

/**
 * Complete and pending per vessel — Client Project Status.
 *
 * Only vessels that actually have tasks appear; an axis of every yacht in the
 * fleet with nothing on it would say less, not more. Busiest first.
 */
export function byVessel(tasks: Orbit2Task[], yachts: Yacht[]) {
  const name = (id: string | null) => yachts.find((y) => y.id === id)?.vessel_name ?? "Unassigned";
  const rows = new Map<string, { vessel: string; complete: number; pending: number }>();
  for (const t of tasks) {
    const key = t.yacht_id ?? "unassigned";
    const row = rows.get(key) ?? { vessel: name(t.yacht_id), complete: 0, pending: 0 };
    if (t.status === "complete") row.complete += 1; else row.pending += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => (b.complete + b.pending) - (a.complete + a.pending));
}

/** Who has what, and how much of it is done — Team Management. */
export function byAssignee(tasks: Orbit2Task[]) {
  const rows = new Map<string, { person: string; total: number; complete: number; hours: number }>();
  for (const t of tasks) {
    const person = t.assigned_to?.trim() || "Unassigned";
    const row = rows.get(person) ?? { person, total: 0, complete: 0, hours: 0 };
    row.total += 1;
    if (t.status === "complete") row.complete += 1;
    row.hours += durationHours(t);
    rows.set(person, row);
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || a.person.localeCompare(b.person));
}

/** Tasks that can be placed on the calendar, grouped by day. */
export function scheduled(tasks: Orbit2Task[]) {
  const days = new Map<string, Orbit2Task[]>();
  for (const t of tasks) {
    if (!t.task_date || hourOf(t.start_time) === null) continue;
    const list = days.get(t.task_date) ?? [];
    list.push(t);
    days.set(t.task_date, list);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      items: items.sort((x, y) => (hourOf(x.start_time)! - hourOf(y.start_time)!)),
    }));
}

/** Every date between the first and last scheduled day, so gaps still show. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  // A runaway range would lock the browser up drawing rows nobody asked for.
  for (let i = 0; d <= end && i < 400; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
