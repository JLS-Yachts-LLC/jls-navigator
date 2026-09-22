/**
 * Orbit 2 — Dashboard.
 *
 * Two halves, as the specification splits them:
 *
 *   Upper  Operational Analytics — the KPI cards, the Project Distribution
 *          donut and the Client Engagement Monthly Trend
 *   Lower  Calendar / Team Management — one timeline over the Project List,
 *          Bunkering and Managed Boats alike, and the same work grouped by who
 *          is carrying it
 *
 * Every figure is counted from records entered in this module. Nothing is seeded
 * or illustrative: with nothing entered the page reads zero and says so, because
 * a dashboard that invents numbers is worse than an empty one.
 */
import { useEffect, useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  Loader2, Download, CalendarDays, Users, ChevronLeft, ChevronRight,
  FileCheck2, FileClock, Ship, Wrench, TriangleAlert, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  type Orbit2Project, type Orbit2Noc, type Orbit2Boat, type Orbit2BoatTask,
  type Orbit2ScheduleEntry, type CalendarItem,
  distribution, monthlyTrend, kpis, completion, calendarItems, calendarDays,
  teamLoad, monthGrid, busiestMonth, fmtSchedule, minutesToHhmm,
} from "./orbit2-data";
import { colorFor, COMPLETE_COLOR, PENDING_COLOR, ORBIT2_TEAM } from "./orbit2-constants";

const sb = supabase as any;

/** The calendar covers the whole day — marine work does not keep office hours. */
const DAY_START = 0;
const DAY_END = 24;
const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

export function Orbit2Dashboard({
  projects, noc, boats, boatTasks, schedule, loading, reload, onCreateAt,
}: {
  projects: Orbit2Project[];
  noc: Orbit2Noc[];
  boats: Orbit2Boat[];
  boatTasks: Orbit2BoatTask[];
  schedule: Orbit2ScheduleEntry[];
  loading: boolean;
  reload: () => Promise<void> | void;
  /** Quick Task Initialization — a blank calendar slot starts a new project. */
  onCreateAt: (date: string, time: string) => void;
}) {
  const [pane, setPane] = useState<"calendar" | "team">("calendar");
  const [month, setMonth] = useState<{ year: number; month: number } | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<{ person: string; date: string } | null>(null);

  const dist = useMemo(() => distribution(projects, noc), [projects, noc]);
  const trend = useMemo(() => monthlyTrend(projects, noc), [projects, noc]);
  const k = useMemo(() => kpis(projects, boats, boatTasks), [projects, boats, boatTasks]);
  const done = useMemo(() => completion(projects), [projects]);
  const items = useMemo(() => calendarItems(projects, boatTasks, boats), [projects, boatTasks, boats]);
  const days = useMemo(() => calendarDays(items), [items]);
  const team = useMemo(() => teamLoad(projects, boatTasks), [projects, boatTasks]);

  // Open on the month the work is actually in, until someone navigates away.
  const cal = month ?? busiestMonth(items);
  const grid = useMemo(
    () => monthGrid(items, schedule, cal.year, cal.month, person),
    [items, schedule, cal.year, cal.month, person],
  );
  function stepMonth(delta: number) {
    const d = new Date(Date.UTC(cal.year, cal.month + delta, 1));
    setMonth({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  }

  function exportToExcel() {
    const head = ["Task ID", "Type", "Boat/Client", "Status", "Category", "Specific Task",
      "Requestor", "Schedule", "Location", "ETC", "Assign Team", "Supplier",
      "JLS Quote", "Invoice", "Product Grade", "Quantity", "Completed"];
    const rows = projects.map((p) => [
      p.task_id, p.record_type === "bunkering" ? "Bunkering" : "Project", p.client_name ?? "",
      p.status, p.service_category, p.specific_task ?? "", p.requestor_name ?? "",
      fmtSchedule(p.schedule_date, p.schedule_time), p.location ?? "", minutesToHhmm(p.etc_minutes),
      (p.assigned_team ?? []).join(" / "), p.supplier ?? "", p.jls_quote ?? "", p.invoice_number ?? "",
      p.product_grade ?? "", p.quantity != null ? `${p.quantity} ${p.quantity_unit ?? ""}`.trim() : "",
      p.work_completed_at ? new Date(p.work_completed_at).toLocaleString("en-GB") : "",
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `orbit2-projects-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const nothingYet = projects.length === 0 && noc.length === 0 && boats.length === 0;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-muted-foreground">
          {nothingYet
            ? "Nothing logged yet — every figure below fills in as records are added."
            : `${projects.length} project record${projects.length === 1 ? "" : "s"} · ${noc.length} NOC · ${boats.length} managed boat${boats.length === 1 ? "" : "s"}`}
        </p>
        <button onClick={exportToExcel} disabled={!projects.length}
          className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[15px] font-medium hover:bg-accent disabled:opacity-50">
          <Download className="h-4 w-4" /> Export to Excel
        </button>
      </div>

      {/* ── High-Level KPIs ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Approved Quotes" value={k.approvedQuotes} icon={FileCheck2} tone="#4CAF80" />
        <Kpi label="Pending Quotes" value={k.pendingQuotes} icon={FileClock} tone="#E8C020" />
        <Kpi label="Managed Vessels" value={k.managedVessels} icon={Ship} tone="#7C8FE8" />
        <Kpi label="Active Planned Maintenance" value={k.activeMaintenance} icon={Wrench} tone="#00C4CC" />
        <Kpi label="Active Defects & Repairs" value={k.activeDefects} icon={TriangleAlert} tone="#E87050" />
      </div>

      {/* ── Operational analytics ── */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px_minmax(0,1.3fr)]">
        <Card title="Project distribution">
          {dist.length === 0 ? <Blank>Nothing logged yet</Blank> : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dist} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86} paddingAngle={2}
                    label={(d: any) => `${d.name} ${d.pct}%`} labelLine={false} style={{ fontSize: 11 }}>
                    {dist.map((d) => <Cell key={d.name} fill={colorFor(d.name)} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => [`${v} active`, n]} contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Task complete">
          <div className="flex h-[240px] flex-col items-center justify-center gap-4">
            <div className="w-full">
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted/50">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${done.pct}%`, background: `linear-gradient(90deg, ${PENDING_COLOR}, ${COMPLETE_COLOR})` }} />
              </div>
              <div className="mt-2 text-right text-[15px] font-semibold">{done.pct}%</div>
            </div>
            <div className="font-display text-[22px] font-bold text-primary">Task Complete</div>
            <p className="text-center text-[14px] text-muted-foreground">
              {done.complete} of {done.total} complete{done.pending ? ` · ${done.pending} open` : ""}
            </p>
          </div>
        </Card>

        <Card title="Client engagement — monthly trend">
          {trend.length === 0 ? <Blank>Nothing logged yet</Blank> : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 4, right: 8, left: -22, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} height={34} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="service" stackId="m" name="Service Category" fill={colorFor("Vessel Services")} />
                  <Bar dataKey="bunkering" stackId="m" name="Bunkering" fill={colorFor("Bunkering")} />
                  <Bar dataKey="noc" stackId="m" name="EHS NOC" fill={colorFor("EHS NOC")} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* ── Calendar / Team Management ── */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-1 border-b border-border/60 px-4 py-2.5">
          {([["calendar", "Calendar", CalendarDays], ["team", "Team Management", Users]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setPane(key)}
              className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[15px] font-semibold transition",
                pane === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {pane === "calendar"
          ? <CalendarPane days={days} onCreateAt={onCreateAt} />
          : (
            <TeamPane
              team={team} grid={grid} cal={cal} person={person} setPerson={setPerson}
              onStepMonth={stepMonth} onSchedule={(p, d) => setScheduling({ person: p, date: d })}
            />
          )}
      </div>

      {scheduling && (
        <ScheduleDialog
          person={scheduling.person}
          date={scheduling.date}
          existing={schedule.find((e) => e.person === scheduling.person && e.entry_date === scheduling.date) ?? null}
          onClose={() => setScheduling(null)}
          onSaved={async () => { setScheduling(null); await reload(); }}
        />
      )}
    </div>
  );
}

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 13,
} as const;

// ── Calendar ────────────────────────────────────────────────────────────────

/**
 * The timeline. One row per day, blocks positioned by percentage across a 0–24
 * axis, because a job rarely starts on the hour and a cell-per-hour grid would
 * round it to one.
 *
 * Clicking empty space starts a new project at that date and hour — the spec's
 * Quick Task Initialization. Clicking a block is deliberately inert: a stray
 * click on the calendar should not open someone else's record for editing.
 */
function CalendarPane({
  days, onCreateAt,
}: { days: { date: string; items: CalendarItem[] }[]; onCreateAt: (date: string, time: string) => void }) {
  if (days.length === 0) {
    return (
      <Blank>
        Nothing scheduled yet — records appear here once they have a date and a start time.
      </Blank>
    );
  }

  /** Which hour was clicked, from where the pointer landed in the row. */
  function slotFrom(e: React.MouseEvent<HTMLElement>): string {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 0.999);
    const hour = Math.floor(DAY_START + frac * (DAY_END - DAY_START));
    return `${String(hour).padStart(2, "0")}:00`;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-[14px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-56 border-b border-r border-border bg-card px-3 py-2 text-left font-semibold text-muted-foreground">
              Date
            </th>
            {HOURS.map((h) => (
              <th key={h} className="min-w-[40px] border-b border-r border-border/40 bg-card px-1 py-2 text-[14px] font-medium text-muted-foreground">
                {h}:00
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map(({ date, items }) => (
            <tr key={date}>
              <td className="sticky left-0 z-10 w-56 whitespace-nowrap border-b border-r border-border bg-card px-3 py-1.5 text-muted-foreground">
                {fmtDay(date)}
              </td>
              <td colSpan={HOURS.length} className="relative cursor-copy border-b border-border/40 p-0"
                style={{ height: 32 }}
                title="Click an empty slot to start a new project here"
                onClick={(e) => onCreateAt(date, slotFrom(e))}>
                <div className="absolute inset-0 flex">
                  {HOURS.map((h) => <div key={h} className="flex-1 border-r border-border/25" />)}
                </div>
                {items.map((it) => {
                  const left = ((it.hour - DAY_START) / (DAY_END - DAY_START)) * 100;
                  const width = Math.max(
                    ((Math.min(it.hour + it.durationHours, DAY_END) - it.hour) / (DAY_END - DAY_START)) * 100, 1.5);
                  return (
                    <div key={`${it.source}-${it.id}`}
                      onClick={(e) => e.stopPropagation()}
                      title={`${it.ref} · ${it.title} · ${it.bucket} · ${it.status}${it.team.length ? ` · ${it.team.join(", ")}` : ""}`}
                      className="absolute top-1 bottom-1 cursor-default overflow-hidden rounded px-1.5 text-[14px] font-medium leading-[24px] text-black/80"
                      style={{ left: `${left}%`, width: `${width}%`, background: colorFor(it.bucket) }}>
                      {it.bucket}
                    </div>
                  );
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Team Management ─────────────────────────────────────────────────────────

function TeamPane({
  team, grid, cal, person, setPerson, onStepMonth, onSchedule,
}: {
  team: { person: string; total: number; complete: number }[];
  grid: ReturnType<typeof monthGrid>;
  cal: { year: number; month: number };
  person: string | null;
  setPerson: (p: string | null) => void;
  onStepMonth: (d: number) => void;
  onSchedule: (person: string, date: string) => void;
}) {
  // Everyone on the roster appears, carrying work or not — a name with zero
  // beside it is the point of the table.
  const rows = useMemo(() => {
    const byName = new Map(team.map((r) => [r.person, r]));
    const roster = ORBIT2_TEAM.map((p) => byName.get(p) ?? { person: p, total: 0, complete: 0 });
    const extras = team.filter((r) => !(ORBIT2_TEAM as readonly string[]).includes(r.person));
    return [...roster, ...extras];
  }, [team]);

  return (
    <div className="grid gap-5 p-5 lg:grid-cols-[minmax(240px,320px)_1fr]">
      <div className="self-start overflow-hidden rounded-lg border border-border">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Operation</th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Total Task Assigned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((r) => (
              <tr key={r.person}
                onClick={() => setPerson(person === r.person ? null : r.person)}
                className={cn("cursor-pointer transition",
                  person === r.person ? "bg-primary/15" : "hover:bg-muted/20")}>
                <td className={cn("px-3 py-2 font-medium", person === r.person && "text-primary")}>{r.person}</td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-border/50 px-3 py-2 text-[14px] text-muted-foreground">
          {person
            ? <>Showing <span className="font-medium text-foreground">{person}</span> only — click the name again to clear. Click a day to set a shift, off or leave.</>
            : "Click a name to see only that person's month."}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-2">
          <button onClick={() => onStepMonth(-1)} title="Previous month"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[15px] font-semibold uppercase tracking-wide">
            {new Date(Date.UTC(cal.year, cal.month, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
          </span>
          <button onClick={() => onStepMonth(1)} title="Next month"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <table className="w-full table-fixed text-[14px]">
          <thead>
            <tr className="border-b border-border/60">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <th key={d} className="border-r border-border/40 px-2 py-1.5 font-medium text-muted-foreground last:border-r-0">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((week, i) => (
              <tr key={i} className="border-b border-border/40 last:border-b-0">
                {week.map((cellDay) => {
                  // Only a chosen person can have a shift recorded against a day —
                  // "who is off" has no meaning without a who.
                  const canSchedule = Boolean(person) && cellDay.inMonth;
                  const people = [...new Set(cellDay.work.map((w) => w.person))];
                  return (
                    <td key={cellDay.date}
                      onClick={() => canSchedule && onSchedule(person!, cellDay.date)}
                      title={canSchedule ? `Set ${person}'s shift, off or leave for this day` : undefined}
                      className={cn("h-[82px] border-r border-border/40 align-top last:border-r-0",
                        !cellDay.inMonth && "bg-muted/10",
                        canSchedule && "cursor-pointer hover:bg-accent/40")}>
                      <div className={cn("px-1.5 pt-1 text-right text-[14px]",
                        cellDay.inMonth ? "text-muted-foreground" : "text-muted-foreground/30")}>
                        {cellDay.day}
                      </div>
                      <div className="space-y-0.5 px-1.5 pb-1">
                        {cellDay.schedule.map((e) => (
                          <div key={e.id} title={e.note ?? undefined}
                            className={cn("truncate rounded px-1 text-[14px] font-medium",
                              e.kind === "off" ? "bg-muted text-muted-foreground"
                                : e.kind === "leave" ? "bg-amber-500/20 text-amber-600"
                                : "bg-primary/15 text-primary")}>
                            {person ? SCHEDULE_LABEL[e.kind] : `${e.person} ${SCHEDULE_LABEL[e.kind]}`}
                          </div>
                        ))}
                        {people.slice(0, 3).map((p) => (
                          <div key={p} className="truncate text-[14px] text-foreground/85" title={p}>{p}</div>
                        ))}
                        {people.length > 3 && (
                          <div className="text-[14px] text-muted-foreground">+{people.length - 3} more</div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SCHEDULE_LABEL: Record<string, string> = { shift: "Shift", off: "Off", leave: "Leave" };

/** Direct Schedule Inputs — one person, one day: shift, off, or leave. */
function ScheduleDialog({
  person, date, existing, onClose, onSaved,
}: {
  person: string;
  date: string;
  existing: Orbit2ScheduleEntry | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [kind, setKind] = useState<"shift" | "off" | "leave">(existing?.kind ?? "shift");
  const [note, setNote] = useState(existing?.note ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function esc(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  async function save() {
    setBusy(true);
    try {
      // One entry per person per day — upsert on that pair rather than stacking
      // contradictory rows against the same date.
      const { error } = await sb.from("orbit2_team_schedule").upsert(
        { person, entry_date: date, kind, note: note.trim() || null, created_by: user?.id ?? null },
        { onConflict: "person,entry_date" },
      );
      if (error) throw error;
      toast.success(`${person} — ${SCHEDULE_LABEL[kind]} recorded`);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  }

  async function clear() {
    if (!existing) { onClose(); return; }
    setBusy(true);
    try {
      const { error } = await sb.from("orbit2_team_schedule").delete().eq("id", existing.id);
      if (error) throw error;
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not clear");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-[22px] font-semibold tracking-tight">{person}</h3>
            <p className="text-[14px] text-muted-foreground">
              {new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          {(["shift", "off", "leave"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)}
              className={cn("flex-1 rounded-md border px-3 py-2 text-[15px] font-medium transition",
                kind === k ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-accent")}>
              {SCHEDULE_LABEL[k]}
            </button>
          ))}
        </div>

        <label className="mb-4 block">
          <span className="mb-1 block text-[14px] font-medium text-muted-foreground">Note (optional)</span>
          <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
            value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Night shift, annual leave" />
        </label>

        <div className="flex justify-between gap-2">
          <button onClick={() => void clear()} disabled={busy || !existing}
            className="rounded-md border border-border px-3 py-2 text-[15px] hover:bg-accent disabled:opacity-40">
            Clear
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy}
              className="rounded-md border border-border px-3 py-2 text-[15px] hover:bg-accent">Cancel</button>
            <button onClick={() => void save()} disabled={busy}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[15px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────

function Kpi({
  label, value, icon: Icon, tone,
}: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[14px] font-medium leading-snug text-muted-foreground">{label}</span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${tone}1F`, color: tone }}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 font-display text-[28px] font-bold leading-none tabular-nums">{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 text-[14px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Blank({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[240px] items-center justify-center px-6 text-center text-[15px] text-muted-foreground">
      {children}
    </div>
  );
}
