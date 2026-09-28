/**
 * Orbit 2 — loading the operations records, and turning them into what the
 * dashboard draws.
 *
 * Kept apart from the rendering so each figure on the page can be read as a
 * definition: what counts as an active project, which month a job lands in, who
 * is on shift. Everything is counted from records entered on these pages — with
 * nothing entered the dashboard reads zero rather than inventing a number.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  CLOSED_STATUSES, ORBIT2_CATEGORIES, type Orbit2RecordType,
} from "./orbit2-constants";

// ── Row types ───────────────────────────────────────────────────────────────

export type Orbit2Project = {
  id: string;
  record_type: Orbit2RecordType;
  task_id: string;
  client_name: string | null;
  requestor_name: string | null;
  email: string | null;
  whatsapp: string | null;
  status: string;
  service_category: string;
  specific_task: string | null;
  schedule_date: string | null;
  schedule_time: string | null;
  location: string | null;
  assigned_team: string[];
  jls_quote: string | null;
  invoice_number: string | null;
  supplier: string | null;
  etc_minutes: number | null;
  product_grade: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  work_completed_at: string | null;
  client_notified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Orbit2Note = {
  id: string;
  /** Exactly one of these two is set — a note belongs to a project record or a boat job. */
  project_id: string | null;
  boat_task_id: string | null;
  kind: "remark" | "team_comment";
  author: string;
  body: string;
  created_at: string;
  /** Set the moment an admin corrects an entry — the log still shows it happened. */
  edited_at: string | null;
};

export type Orbit2File = {
  id: string;
  /** Exactly one of these two is set — a file belongs to a project record or a boat job. */
  project_id: string | null;
  boat_task_id: string | null;
  slot: "supplier_quote" | "invoice" | "document" | "image" | "service_report" | "certificate" | "final_invoice";
  file_name: string;
  storage_ref: string;
  created_at: string;
};

export type Orbit2NocStatus = "To be Invoiced" | "Invoiced";

export type Orbit2Noc = {
  id: string;
  ref_id: string;
  client_name: string | null;
  noc_type: string | null;
  requested_by: string | null;
  receipt_date: string | null;
  permit_date: string | null;
  noc_document: string | null;
  noc_invoice: string | null;
  status: Orbit2NocStatus;
  invoice_number: string | null;
  created_at: string;
};

export type Orbit2Boat = {
  id: string;
  name: string;
  client_name: string | null;
  boat_type: string | null;
  notes: string | null;
  active: boolean;
  // ── Vessel spec ──
  hull_number: string | null;
  hull_material: string | null;
  year_of_build: number | null;
  max_beam_m: number | null;
  max_length_m: number | null;
  max_passengers: number | null;
  mmsi: string | null;
  image_ref: string | null;
  /** Set when this boat's spec fields were inherited from Vessel Overview. */
  inherited_yacht_id: string | null;
  // ── Compliance — DMA / FMA / RYA ──
  dma_last_inspection: string | null;
  dma_report_ref: string | null;
  fma_last_inspection: string | null;
  fma_report_ref: string | null;
  rya_last_inspection: string | null;
  rya_report_ref: string | null;
};

export const BOAT_DOC_CATEGORIES = [
  "vessel_invoice", "builders_certificate", "customs_clearance", "marine_insurance",
  "vhf_radio_licensing", "marine_vessel_license", "berth_agreement",
  "liferaft_certificate", "fire_extinguisher_certificate", "other",
  "dma_checklist", "fma_checklist", "rya_checklist",
] as const;
export type Orbit2BoatDocCategory = (typeof BOAT_DOC_CATEGORIES)[number];

export const BOAT_DOC_CATEGORY_LABEL: Record<Orbit2BoatDocCategory, string> = {
  vessel_invoice: "Vessel Invoice / Bill of Sale",
  builders_certificate: "Builder's Certificate",
  customs_clearance: "Customs Clearance Certificate",
  marine_insurance: "Marine Insurance Policy",
  vhf_radio_licensing: "VHF Radio Licensing",
  marine_vessel_license: "Marine Vessel License",
  berth_agreement: "Berth Agreement",
  liferaft_certificate: "Liferaft Certificates",
  fire_extinguisher_certificate: "Fire extinguishers",
  other: "Other Documents",
  dma_checklist: "DMA Checklist",
  fma_checklist: "FMA Checklist",
  rya_checklist: "RYA Checklist",
};

export type Orbit2BoatDocument = {
  id: string;
  boat_id: string;
  category: Orbit2BoatDocCategory;
  file_name: string;
  storage_ref: string;
  created_at: string;
};

export const INVENTORY_UNITS = ["Box", "Set", "Pcs", "CM", "KG", "Meter"] as const;
export type Orbit2InventoryUnit = (typeof INVENTORY_UNITS)[number];

export type Orbit2BoatInventoryItem = {
  id: string;
  boat_id: string;
  item: string;
  qty: number | null;
  unit: Orbit2InventoryUnit | null;
  condition: string | null;
  expiry_date: string | null;
  on_board: boolean;
  remarks: string | null;
  image_ref: string | null;
  created_at: string;
  updated_at: string;
};

export type Orbit2BoatTask = {
  id: string;
  boat_id: string;
  kind: "maintenance" | "defect";
  /** Auto-generated MVT26-XXXX — the spec's Job Number. */
  job_no: string | null;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  schedule_date: string | null;
  schedule_time: string | null;
  assigned_team: string[];
  /** Duration, in minutes — Estimated Time Required, entered as hh:mm. */
  est_minutes: number | null;
  technician: string | null;
  remarks: string | null;
};

export type Orbit2ScheduleEntry = {
  id: string;
  person: string;
  entry_date: string;
  kind: "shift" | "off" | "leave";
  note: string | null;
};

/** The bucket Orbit 2 attachments live in (shared with the original Orbit module). */
export const ORBIT2_BUCKET = "orbit-documents";

// ── Loading ─────────────────────────────────────────────────────────────────

const sb = supabase as any;
/** Paged, so counts keep going past PostgREST's 1000-row response cap. */
const all = <T,>(build: () => any) => fetchAllRows<T>(build);

/** Everything Orbit 2 holds — the dashboard needs all of it at once. */
export function useOrbit2() {
  const [projects, setProjects] = useState<Orbit2Project[]>([]);
  const [noc, setNoc] = useState<Orbit2Noc[]>([]);
  const [boats, setBoats] = useState<Orbit2Boat[]>([]);
  const [boatTasks, setBoatTasks] = useState<Orbit2BoatTask[]>([]);
  const [boatDocuments, setBoatDocuments] = useState<Orbit2BoatDocument[]>([]);
  const [boatInventory, setBoatInventory] = useState<Orbit2BoatInventoryItem[]>([]);
  const [schedule, setSchedule] = useState<Orbit2ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // In parallel: seven independent tables, and the page cannot draw until it
    // has all of them, so waiting on them one at a time would just be slower.
    const [p, n, b, bt, bd, bi, s] = await Promise.all([
      all<Orbit2Project>(() => sb.from("orbit2_projects").select("*").order("created_at", { ascending: false })),
      all<Orbit2Noc>(() => sb.from("orbit2_noc_records").select("*").order("created_at", { ascending: false })),
      all<Orbit2Boat>(() => sb.from("orbit2_boats").select("*").order("name")),
      all<Orbit2BoatTask>(() => sb.from("orbit2_boat_tasks").select("*").order("created_at", { ascending: false })),
      all<Orbit2BoatDocument>(() => sb.from("orbit2_boat_documents").select("*").order("created_at", { ascending: false })),
      all<Orbit2BoatInventoryItem>(() => sb.from("orbit2_boat_inventory").select("*").order("item")),
      all<Orbit2ScheduleEntry>(() => sb.from("orbit2_team_schedule").select("*").order("entry_date")),
    ]);
    setProjects((p.data ?? []) as Orbit2Project[]);
    setNoc((n.data ?? []) as Orbit2Noc[]);
    setBoats((b.data ?? []) as Orbit2Boat[]);
    setBoatTasks((bt.data ?? []) as Orbit2BoatTask[]);
    setBoatDocuments((bd.data ?? []) as Orbit2BoatDocument[]);
    setBoatInventory((bi.data ?? []) as Orbit2BoatInventoryItem[]);
    setSchedule((s.data ?? []) as Orbit2ScheduleEntry[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  return {
    projects, noc, boats, boatTasks, boatDocuments, boatInventory, schedule, loading, reload: load,
  };
}

// ── Small conversions ───────────────────────────────────────────────────────

/** "14:30:00" → 14.5. Null when the time is missing or unreadable. */
export function hourOf(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]) + Number(m[2]) / 60;
  return h >= 0 && h <= 24 ? h : null;
}

/** ETC is a duration: 150 minutes ↔ "02:30". */
export function minutesToHhmm(min: number | null | undefined): string {
  if (min == null) return "";
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function hhmmToMinutes(v: string): number | null {
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(v.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** MMM/DD/YYYY – Day – HH:MM, the format the spec asks schedules to read in. */
export function fmtSchedule(date: string | null, time: string | null): string {
  if (!date) return "—";
  const d = new Date(`${date}T00:00:00`);
  const md = d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).replace(/,/g, "");
  const [mon, day, year] = md.split(" ");
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${mon}/${day}/${year} – ${weekday}${time ? ` – ${time.slice(0, 5)}` : ""}`;
}

// ── Grouping used by the dashboard ──────────────────────────────────────────

/**
 * Which slice of the donut a record belongs to.
 *
 * Bunkering and EHS NOC are their own headings regardless of any category text,
 * because they are separate registries rather than services on the Project List.
 */
export function bucketOf(p: Pick<Orbit2Project, "record_type" | "service_category">): string {
  return p.record_type === "bunkering" ? "Bunkering" : p.service_category;
}

/** Open work — everything not Complete or Cancelled. */
export const isActive = (p: { status: string }) => !CLOSED_STATUSES.includes(p.status);

/**
 * Project Distribution — the share of active work each service is carrying.
 *
 * NOC records have no status, so every one of them counts: a permit on file is
 * work the team has taken on.
 */
export function distribution(projects: Orbit2Project[], noc: Orbit2Noc[]) {
  const counts = new Map<string, number>();
  for (const p of projects) {
    if (!isActive(p)) continue;
    const k = bucketOf(p);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  if (noc.length) counts.set("EHS NOC", noc.length);

  const total = [...counts.values()].reduce((s, v) => s + v, 0);
  // Known services first in their declared order, then anything unexpected, so
  // the slice colours stay put as records are added.
  const order = [...ORBIT2_CATEGORIES, "Bunkering", "EHS NOC"] as string[];
  return [...counts.entries()]
    .sort((a, b) => {
      const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map(([name, value]) => ({ name, value, pct: total ? Math.round((value / total) * 100) : 0 }));
}

/**
 * Client Project Status — complete against pending, one bar per boat or client.
 *
 * Only clients that actually have records appear; an axis carrying every boat
 * the company has ever quoted, most of them empty, would say less rather than
 * more. Busiest first, and capped, because a long tail of one-job clients turns
 * the axis into a smear.
 *
 * Cancelled work is left out entirely: it is neither complete nor pending, and
 * counting it as either would misreport the same bar in opposite directions.
 */
export function byClient(projects: Orbit2Project[], limit = 12) {
  const rows = new Map<string, { client: string; complete: number; pending: number }>();
  for (const p of projects) {
    if (p.status === 'Cancelled') continue;
    const name = (p.client_name ?? '').trim() || 'Unnamed';
    // Keyed case-insensitively so one boat typed two ways still draws one bar.
    const key = name.toLowerCase();
    const row = rows.get(key) ?? { client: name, complete: 0, pending: 0 };
    if (p.status === 'Complete') row.complete += 1; else row.pending += 1;
    rows.set(key, row);
  }
  return [...rows.values()]
    .sort((a, b) => (b.complete + b.pending) - (a.complete + a.pending) || a.client.localeCompare(b.client))
    .slice(0, limit);
}

/** Complete against everything logged — the Task Complete bar. */
export function completion(projects: Orbit2Project[]) {
  const total = projects.length;
  const complete = projects.filter((p) => p.status === "Complete").length;
  return { total, complete, pending: total - complete, pct: total ? Math.round((complete / total) * 100) : 0 };
}

// ── Calendar ────────────────────────────────────────────────────────────────

/** A scheduled thing, whatever registry it came from. */
export type CalendarItem = {
  id: string;
  ref: string;
  title: string;
  bucket: string;
  status: string;
  date: string;
  hour: number;
  durationHours: number;
  team: string[];
  source: "project" | "bunkering" | "boat";
};

/**
 * Everything with a date and a start time, from the Project List, Bunkering and
 * Managed Boats alike — the spec's one calendar over all three.
 *
 * A job with no ETC is drawn as one hour: it has to occupy something, and an
 * hour is the smallest block that stays readable at this scale.
 */
export function calendarItems(projects: Orbit2Project[], boatTasks: Orbit2BoatTask[], boats: Orbit2Boat[]): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const p of projects) {
    const h = hourOf(p.schedule_time);
    if (!p.schedule_date || h === null) continue;
    out.push({
      id: p.id,
      ref: p.task_id,
      title: p.client_name ?? p.task_id,
      bucket: bucketOf(p),
      status: p.status,
      date: p.schedule_date,
      hour: h,
      durationHours: p.etc_minutes ? p.etc_minutes / 60 : 1,
      team: p.assigned_team ?? [],
      source: p.record_type === "bunkering" ? "bunkering" : "project",
    });
  }
  const boatName = (id: string) => boats.find((b) => b.id === id)?.name ?? "Managed boat";
  for (const t of boatTasks) {
    const h = hourOf(t.schedule_time);
    if (!t.schedule_date || h === null) continue;
    out.push({
      id: t.id,
      ref: t.kind === "defect" ? "Defect" : "Maintenance",
      title: `${boatName(t.boat_id)} — ${t.title}`,
      bucket: "Vessel Equipment",
      status: t.status,
      date: t.schedule_date,
      hour: h,
      durationHours: 1,
      team: t.assigned_team ?? [],
      source: "boat",
    });
  }
  return out;
}

/** Calendar rows, one per day, with gaps kept so a quiet week reads as quiet. */
export function calendarDays(items: CalendarItem[]) {
  if (!items.length) return [];
  const byDate = new Map<string, CalendarItem[]>();
  for (const it of items) {
    const list = byDate.get(it.date) ?? [];
    list.push(it);
    byDate.set(it.date, list);
  }
  const dates = [...byDate.keys()].sort();
  const out: { date: string; items: CalendarItem[] }[] = [];
  const cur = new Date(`${dates[0]}T00:00:00Z`);
  const end = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
  // A runaway range would lock the browser up drawing rows nobody asked for.
  for (let i = 0; cur <= end && i < 400; i++) {
    const iso = cur.toISOString().slice(0, 10);
    out.push({ date: iso, items: (byDate.get(iso) ?? []).sort((a, b) => a.hour - b.hour) });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// ── Team Management ─────────────────────────────────────────────────────────

/** Who holds how much — the Operation / Total Task Assigned table. */
export function teamLoad(projects: Orbit2Project[], boatTasks: Orbit2BoatTask[]) {
  const rows = new Map<string, { person: string; total: number; complete: number }>();
  const add = (person: string, done: boolean) => {
    const row = rows.get(person) ?? { person, total: 0, complete: 0 };
    row.total += 1;
    if (done) row.complete += 1;
    rows.set(person, row);
  };
  for (const p of projects) for (const person of p.assigned_team ?? []) add(person, p.status === "Complete");
  for (const t of boatTasks) for (const person of t.assigned_team ?? []) add(person, t.status === "Complete");
  return [...rows.values()].sort((a, b) => b.total - a.total || a.person.localeCompare(b.person));
}

export type MonthCell = {
  date: string;
  day: number;
  inMonth: boolean;
  /** Who is working that day, and on what. */
  work: { person: string; label: string }[];
  /** Shift / off / leave entries recorded against that day. */
  schedule: Orbit2ScheduleEntry[];
};

/**
 * The Team Management month grid.
 *
 * Whole weeks (Sunday to Saturday) so the grid is always rectangular, with days
 * outside the month marked rather than dropped. `person` filters the whole grid
 * down to one individual — the spec's click-a-name behaviour.
 */
export function monthGrid(
  items: CalendarItem[],
  schedule: Orbit2ScheduleEntry[],
  year: number,
  month: number,
  person?: string | null,
): MonthCell[][] {
  const workByDate = new Map<string, { person: string; label: string }[]>();
  for (const it of items) {
    for (const p of it.team) {
      if (person && p !== person) continue;
      const list = workByDate.get(it.date) ?? [];
      list.push({ person: p, label: it.bucket });
      workByDate.set(it.date, list);
    }
  }
  const schedByDate = new Map<string, Orbit2ScheduleEntry[]>();
  for (const e of schedule) {
    if (person && e.person !== person) continue;
    const list = schedByDate.get(e.entry_date) ?? [];
    list.push(e);
    schedByDate.set(e.entry_date, list);
  }

  const first = new Date(Date.UTC(year, month, 1));
  const cur = new Date(first);
  cur.setUTCDate(1 - first.getUTCDay()); // back to the Sunday on or before the 1st

  const weeks: MonthCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: MonthCell[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = cur.toISOString().slice(0, 10);
      week.push({
        date: iso,
        day: cur.getUTCDate(),
        inMonth: cur.getUTCMonth() === month,
        work: workByDate.get(iso) ?? [],
        schedule: schedByDate.get(iso) ?? [],
      });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    weeks.push(week);
    // A month never needs a sixth week once the next one has started.
    if (cur.getUTCMonth() !== month && w >= 4) break;
  }
  return weeks;
}

/** Every date from `start` to `end` inclusive, for a batch leave/off entry. */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const endD = new Date(`${end}T00:00:00Z`);
  // A year is more range than anyone files leave in one go — the cap is just to
  // keep a typo'd end date from generating an unbounded batch.
  for (let i = 0; cur <= endD && i < 366; i++) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** The month to open on: where the work is, falling back to today. */
export function busiestMonth(items: CalendarItem[]): { year: number; month: number } {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.date.slice(0, 7), (counts.get(it.date.slice(0, 7)) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; }
  const [y, m] = top[0].split("-").map(Number);
  return { year: y, month: m - 1 };
}

// ── Typeahead ───────────────────────────────────────────────────────────────

/**
 * Past entries for a free-text field, so the same client is not typed three
 * different ways. Case-insensitive, first spelling wins.
 */
export function suggestionsFor(values: (string | null | undefined)[], extra: string[] = []): string[] {
  const seen = new Map<string, string>();
  for (const v of [...values, ...extra]) {
    const s = (v ?? "").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (!seen.has(key)) seen.set(key, s);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** The suggestion list for a partly-typed value, best matches first. */
export function matchSuggestions(all: string[], typed: string, limit = 8): string[] {
  const q = typed.trim().toLowerCase();
  if (!q) return all.slice(0, limit);
  const starts = all.filter((s) => s.toLowerCase().startsWith(q));
  const contains = all.filter((s) => !s.toLowerCase().startsWith(q) && s.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/** Does this exactly match something already on file? Drives the duplicate hint. */
export const isExisting = (all: string[], typed: string) =>
  all.some((s) => s.toLowerCase() === typed.trim().toLowerCase());

