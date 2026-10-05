/**
 * Orbit 2 — Dashboard.
 *
 * Two halves, as the specification splits them:
 *
 *   Upper  Operational Analytics — the Project Distribution donut, overall
 *          task completion, and Client Project Status per boat
 *   Lower  Calendar / Team Management — one timeline over the Project List,
 *          Bunkering and Managed Boats alike, and the same work grouped by who
 *          is carrying it
 *
 * Every figure is counted from records entered in this module. Nothing is seeded
 * or illustrative: with nothing entered the page reads zero and says so, because
 * a dashboard that invents numbers is worse than an empty one.
 */
import { useEffect, useMemo, useState } from "react";
import { errorMessage } from "@/lib/error-message";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  Loader2, Download, CalendarDays, Users, ChevronLeft, ChevronRight, X, TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  type Orbit2Project, type Orbit2Noc, type Orbit2Boat, type Orbit2BoatTask,
  type Orbit2ScheduleEntry, type CalendarItem, type Assignment, type MonthCell,
  distribution, byClient, completion, calendarItems, calendarDays,
  teamLoad, monthGrid, busiestMonth, fmtSchedule, minutesToHhmm, datesBetween,
  assignments, peopleOnDay,
} from "./orbit2-data";
import { FieldAppButton } from "./orbit2-field-link";
import { colorFor, COMPLETE_COLOR, PENDING_COLOR, ORBIT2_TEAM } from "./orbit2-constants";
import { TeamPicker } from "./orbit2-fields";

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
  /** The day opened from the Team Management month — for everyone, or for `person`. */
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [batchScheduling, setBatchScheduling] = useState(false);

  const dist = useMemo(() => distribution(projects, noc), [projects, noc]);
  const clients = useMemo(() => byClient(projects), [projects]);
  const done = useMemo(() => completion(projects), [projects]);
  const items = useMemo(() => calendarItems(projects, boatTasks, boats), [projects, boatTasks, boats]);
  const days = useMemo(() => calendarDays(items), [items]);
  const team = useMemo(() => teamLoad(projects, boatTasks), [projects, boatTasks]);

  // Team Management reads every dated job, timed or not — see Assignment.
  const work = useMemo(() => assignments(projects, boatTasks, boats), [projects, boatTasks, boats]);

  // Open on the month the work is actually in, until someone navigates away.
  const cal = month ?? busiestMonth(items);
  const grid = useMemo(
    () => monthGrid(work, schedule, cal.year, cal.month, person),
    [work, schedule, cal.year, cal.month, person],
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
        <div className="flex flex-wrap items-center gap-2">
        <FieldAppButton />
        <button onClick={exportToExcel} disabled={!projects.length}
          className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[15px] font-medium hover:bg-accent disabled:opacity-50">
          <Download className="h-4 w-4" /> Export to Excel
        </button>
        </div>
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

        <Card title="Client project status">
          {clients.length === 0 ? <Blank>Nothing logged yet</Blank> : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={clients} margin={{ top: 4, right: 8, left: -22, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  {/* Angled, because boat names are long and would otherwise be
                      dropped by the axis rather than shortened. */}
                  <XAxis dataKey="client" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="complete" stackId="c" name="Complete" fill={COMPLETE_COLOR} />
                  <Bar dataKey="pending" stackId="c" name="Pending" fill={PENDING_COLOR} radius={[4, 4, 0, 0]} />
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
              onStepMonth={stepMonth} onOpenDay={setOpenDay}
              onBatchSchedule={() => setBatchScheduling(true)}
            />
          )}
      </div>

      {openDay && (
        <DayDialog
          date={openDay}
          person={person}
          work={work.filter((w) => w.date === openDay && (!person || w.team.includes(person)))}
          schedule={schedule.filter((e) => e.entry_date === openDay)}
          projects={projects}
          boatTasks={boatTasks}
          onClose={() => setOpenDay(null)}
          onSaved={reload}
        />
      )}

      {batchScheduling && (
        <BatchScheduleDialog
          work={work}
          schedule={schedule}
          onClose={() => setBatchScheduling(false)}
          onSaved={async () => { setBatchScheduling(false); await reload(); }}
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
                      {it.label}
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

/**
 * How each person's day reads on the month, and in the legend. One table so a
 * colour means the same thing in the cell, the chip, the legend and the day view.
 */
const DAY_TONE = {
  conflict: "bg-red-500/20 text-red-500 ring-1 ring-red-500/60",
  assigned: "bg-emerald-500/15 text-emerald-500",
  shift: "bg-primary/15 text-primary",
  leave: "bg-amber-500/20 text-amber-500",
  off: "bg-muted text-muted-foreground",
} as const;

const toneFor = (d: { kind: "shift" | "off" | "leave" | null; jobs: number; conflict: boolean }) =>
  d.conflict ? DAY_TONE.conflict
    : d.jobs > 0 ? DAY_TONE.assigned
    : d.kind ? DAY_TONE[d.kind]
    : DAY_TONE.off;

function TeamPane({
  team, grid, cal, person, setPerson, onStepMonth, onOpenDay, onBatchSchedule,
}: {
  team: { person: string; total: number; complete: number }[];
  grid: MonthCell[][];
  cal: { year: number; month: number };
  person: string | null;
  setPerson: (p: string | null) => void;
  onStepMonth: (d: number) => void;
  onOpenDay: (date: string) => void;
  onBatchSchedule: () => void;
}) {
  // Everyone on the roster appears, carrying work or not — a name with zero
  // beside it is the point of the table.
  const rows = useMemo(() => {
    const byName = new Map(team.map((r) => [r.person, r]));
    const roster = ORBIT2_TEAM.map((p) => byName.get(p) ?? { person: p, total: 0, complete: 0 });
    const extras = team.filter((r) => !(ORBIT2_TEAM as readonly string[]).includes(r.person));
    return [...roster, ...extras];
  }, [team]);

  // Clashes in the month on screen — surfaced above the grid, because a red
  // chip in one cell of thirty is easy to scroll past.
  const clashes = useMemo(() => {
    let n = 0;
    for (const week of grid) for (const c of week) if (c.inMonth) n += peopleOnDay(c).filter((d) => d.conflict).length;
    return n;
  }, [grid]);

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
            ? <>Showing <span className="font-medium text-foreground">{person}</span> only — click the name again to clear.</>
            : "Click a name to see only that person's month."}
          {" "}Click any day for its full detail.
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
          <div className="flex items-center gap-2">
            <button onClick={onBatchSchedule}
              className="rounded-md border border-border px-2.5 py-1 text-[14px] font-medium hover:bg-accent">
              Batch leave / off
            </button>
            <button onClick={() => onStepMonth(1)} title="Next month"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/50 px-3 py-1.5 text-[14px] text-muted-foreground">
          <ColorSwatch swatch={DAY_TONE.assigned}>Active tasks</ColorSwatch>
          <ColorSwatch swatch={DAY_TONE.shift}>Shift</ColorSwatch>
          <ColorSwatch swatch={DAY_TONE.leave}>Leave</ColorSwatch>
          <ColorSwatch swatch={DAY_TONE.off}>Off</ColorSwatch>
          <ColorSwatch swatch={DAY_TONE.conflict}>Assigned while off / on leave</ColorSwatch>
          {clashes > 0 && (
            <span className="ml-auto flex items-center gap-1 font-semibold text-red-500">
              <TriangleAlert className="h-4 w-4" /> {clashes} clash{clashes === 1 ? "" : "es"} this month
            </span>
          )}
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
                {week.map((cellDay) => (
                  <td key={cellDay.date}
                    onClick={() => cellDay.inMonth && onOpenDay(cellDay.date)}
                    title={cellDay.inMonth ? "Open this day" : undefined}
                    className={cn("h-[82px] border-r border-border/40 align-top last:border-r-0",
                      cellDay.inMonth ? "cursor-pointer hover:bg-accent/40" : "bg-muted/10")}>
                    <div className={cn("px-1.5 pt-1 text-right text-[14px]",
                      cellDay.inMonth ? "text-muted-foreground" : "text-muted-foreground/30")}>
                      {cellDay.day}
                    </div>
                    {cellDay.inMonth && (person
                      ? <PersonCell cell={cellDay} />
                      : <OverviewCell cell={cellDay} />)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The unfiltered month: one colour-coded chip per person with anything that day.
 * Names, not counts — the question is WHO is off, and a count cannot answer it.
 * With eight on the roster that is at most eight short chips, which wrap.
 */
function OverviewCell({ cell }: { cell: MonthCell }) {
  const people = peopleOnDay(cell);
  if (!people.length) return null;
  return (
    <div className="flex flex-wrap gap-1 px-1.5 pb-1.5">
      {people.map((d) => (
        <span key={d.person}
          title={`${d.person} — ${describe(d)}${d.note ? ` · ${d.note}` : ""}`}
          className={cn("rounded px-1 text-[14px] font-medium leading-5", toneFor(d))}>
          {d.conflict && "⚠ "}{d.person}
        </span>
      ))}
    </div>
  );
}

/** One person's month: what they're rostered as, and the service of each job. */
function PersonCell({ cell }: { cell: MonthCell }) {
  const [d] = peopleOnDay(cell);
  if (!d) return null;
  // One badge per service — two jobs in the same service that day read as one line.
  const services = [...new Set(cell.work.map((w) => w.label))];
  return (
    <div className="space-y-0.5 px-1.5 pb-1">
      {d.kind && (
        <div className={cn("truncate rounded px-1 text-[14px] font-medium",
          d.conflict ? DAY_TONE.conflict : DAY_TONE[d.kind])}>
          {d.conflict && "⚠ "}{SCHEDULE_LABEL[d.kind]}
        </div>
      )}
      {services.slice(0, 3).map((s) => (
        <div key={s} title={s} className={cn("truncate rounded px-1 text-[14px] font-medium", DAY_TONE.assigned)}>
          {s}
        </div>
      ))}
      {services.length > 3 && <div className="text-[14px] text-muted-foreground">+{services.length - 3} more</div>}
    </div>
  );
}

function describe(d: { kind: "shift" | "off" | "leave" | null; jobs: number; conflict: boolean }): string {
  const jobs = d.jobs ? `${d.jobs} task${d.jobs === 1 ? "" : "s"}` : "";
  const kind = d.kind ? SCHEDULE_LABEL[d.kind] : "";
  if (d.conflict) return `${jobs} assigned, but marked ${kind.toLowerCase()}`;
  return [kind, jobs].filter(Boolean).join(" · ");
}

const SCHEDULE_LABEL: Record<string, string> = { shift: "Shift", off: "Off", leave: "Leave" };
const KINDS = ["shift", "off", "leave"] as const;
type Kind = (typeof KINDS)[number];

// ── One day ─────────────────────────────────────────────────────────────────

/**
 * Everything about one day: every task in full, and each person's roster entry.
 *
 * Opens for everyone from the unfiltered month, or for one person when a name is
 * selected — the spec's "clicking a date reveals the comprehensive details of all
 * tasks assigned to that individual". Tasks come first because that is what a
 * date click is asking; the roster controls follow.
 */
function DayDialog({
  date, person, work, schedule, projects, boatTasks, onClose, onSaved,
}: {
  date: string;
  person: string | null;
  work: Assignment[];
  schedule: Orbit2ScheduleEntry[];
  projects: Orbit2Project[];
  boatTasks: Orbit2BoatTask[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState(() => (person ? schedule.find((e) => e.person === person)?.note ?? "" : ""));

  useEffect(() => {
    function esc(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const crew = person ? [person] : [...ORBIT2_TEAM];
  const entryFor = (p: string) => schedule.find((e) => e.person === p) ?? null;
  const jobsFor = (p: string) => work.filter((w) => w.team.includes(p)).length;
  const sorted = [...work].sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));

  /** Set, change or clear one person's entry for this day. */
  async function setKind(p: string, kind: Kind | null) {
    setBusy(p);
    try {
      const existing = entryFor(p);
      if (kind === null) {
        if (existing) {
          const { error } = await sb.from("orbit2_team_schedule").delete().eq("id", existing.id);
          if (error) throw error;
        }
      } else {
        // One entry per person per day — upsert on the pair. In the everyone view
        // the note is kept as it was; only the single-person view edits it.
        const { error } = await sb.from("orbit2_team_schedule").upsert(
          {
            person: p, entry_date: date, kind,
            note: person ? note.trim() || null : existing?.note ?? null,
            created_by: user?.id ?? null,
          },
          { onConflict: "person,entry_date" },
        );
        if (error) throw error;
      }
      await onSaved();
    } catch (e) {
      toast.error(errorMessage(e, "Could not save"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div>
            <h3 className="font-display text-[22px] font-semibold tracking-tight">
              {new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </h3>
            <p className="text-[14px] text-muted-foreground">
              {person ? person : "Everyone"} · {work.length} task{work.length === 1 ? "" : "s"}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-auto px-5 py-4">
          {/* Tasks — in full */}
          <section>
            <div className="mb-2 text-[15px] font-semibold">Tasks</div>
            {sorted.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[14px] text-muted-foreground">
                No tasks {person ? `for ${person} ` : ""}on this day.
              </p>
            ) : (
              <ul className="space-y-2">
                {sorted.map((w) => (
                  <TaskDetailCard key={`${w.source}-${w.id}`} w={w}
                    project={w.source === "boat" ? null : projects.find((p) => p.id === w.id) ?? null}
                    boatTask={w.source === "boat" ? boatTasks.find((t) => t.id === w.id) ?? null : null}
                    offCrew={w.team.filter((p) => { const k = entryFor(p)?.kind; return k === "off" || k === "leave"; })} />
                ))}
              </ul>
            )}
          </section>

          {/* Roster for the day */}
          <section>
            <div className="mb-2 text-[15px] font-semibold">{person ? "Shift, off or leave" : "Crew"}</div>
            <ul className="divide-y divide-border/40 rounded-md border border-border">
              {crew.map((p) => {
                const current = entryFor(p)?.kind ?? null;
                const jobs = jobsFor(p);
                const clash = jobs > 0 && (current === "off" || current === "leave");
                return (
                  <li key={p} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="flex items-center gap-2 text-[15px] font-medium">
                      {p}
                      {jobs > 0 && (
                        <span className={cn("rounded px-1.5 text-[14px]", clash ? DAY_TONE.conflict : DAY_TONE.assigned)}>
                          {clash && "⚠ "}{jobs} task{jobs === 1 ? "" : "s"}
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      {busy === p && <Loader2 className="mr-1 h-4 w-4 animate-spin text-muted-foreground" />}
                      {([null, ...KINDS] as (Kind | null)[]).map((k) => (
                        <button key={k ?? "none"} disabled={busy !== null}
                          onClick={() => void setKind(p, k)}
                          className={cn("rounded-md border px-2.5 py-1 text-[14px] font-medium transition disabled:opacity-50",
                            current === k
                              ? (k ? cn(DAY_TONE[k], "border-transparent") : "border-primary/60 text-foreground")
                              : "border-border text-muted-foreground hover:bg-accent")}>
                          {k ? SCHEDULE_LABEL[k] : "—"}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            {person && (
              <label className="mt-3 block">
                <span className="mb-1 block text-[14px] font-medium text-muted-foreground">Note (saved with the entry)</span>
                <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
                  value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Night shift, annual leave" />
              </label>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** A task, with everything the office recorded against it. */
function TaskDetailCard({
  w, project, boatTask, offCrew,
}: {
  w: Assignment;
  project: Orbit2Project | null;
  boatTask: Orbit2BoatTask | null;
  /** Crew on this job who are marked off or on leave that day. */
  offCrew: string[];
}) {
  const time = w.time ? w.time.slice(0, 5) : "No time set";
  const duration = project?.etc_minutes ?? boatTask?.est_minutes ?? null;
  const rows: [string, string | null | undefined][] = project
    ? [
        ["Location", project.location],
        ["Requestor", project.requestor_name],
        project.record_type === "bunkering"
          ? ["Product", [project.product_grade, project.quantity != null ? `${project.quantity} ${project.quantity_unit ?? ""}`.trim() : null].filter(Boolean).join(" · ")]
          : ["Task", project.specific_task],
        ["Supplier", project.supplier],
      ]
    : [
        ["Job", boatTask?.description],
        ["Technician", boatTask?.technician],
      ];
  return (
    <li className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">
            <span className="text-primary">{w.ref}</span> · {w.title}
          </div>
          <div className="text-[14px] text-muted-foreground">
            {w.label} · {time}{duration != null ? ` · ETC ${minutesToHhmm(duration)}` : ""}
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[14px] font-medium">{w.status}</span>
      </div>
      <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="min-w-0 text-[14px]">
            <dt className="inline text-muted-foreground">{k}: </dt>
            <dd className="inline whitespace-pre-wrap">{v}</dd>
          </div>
        ))}
        <div className="text-[14px] sm:col-span-2">
          <dt className="inline text-muted-foreground">Team: </dt>
          <dd className="inline">{w.team.length ? w.team.join(", ") : "Nobody assigned"}</dd>
        </div>
      </dl>
      {offCrew.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[14px] font-medium text-red-500">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {offCrew.join(", ")} {offCrew.length === 1 ? "is" : "are"} off or on leave this day.
        </p>
      )}
    </li>
  );
}

// ── Batch ───────────────────────────────────────────────────────────────────

/**
 * Batch-processing for calendar entries: file leave or off days — or clear
 * them — for one or more crew in a single action.
 *
 * Two ways to choose the days, as asked: a continuous Start–End range (a month of
 * annual leave), or individual dates picked on a calendar (every Friday, a few
 * scattered days). Before saving it says what it is about to do: how many days
 * will be written, how many existing entries replaced, and any jobs those crew
 * already hold on those dates — leave filed over an assigned job is the mistake
 * this screen is most likely to make.
 */
function BatchScheduleDialog({
  work, schedule, onClose, onSaved,
}: {
  work: Assignment[];
  schedule: Orbit2ScheduleEntry[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [team, setTeam] = useState<string[]>([]);
  const [action, setAction] = useState<"leave" | "off" | "clear">("leave");
  const [mode, setMode] = useState<"range" | "pick">("range");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function esc(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const dates = mode === "range"
    ? (start && end && start <= end ? datesBetween(start, end) : [])
    : [...picked].sort();
  const dateSet = new Set(dates);

  // What this will do, before it does it.
  const replacing = schedule.filter((e) => team.includes(e.person) && dateSet.has(e.entry_date));
  const clashing = action === "clear" ? [] : work.filter((w) => dateSet.has(w.date) && w.team.some((p) => team.includes(p)));
  const clashPeople = [...new Set(clashing.flatMap((w) => w.team.filter((p) => team.includes(p))))];

  async function save() {
    if (team.length === 0) { toast.error("Choose at least one crew member."); return; }
    if (dates.length === 0) { toast.error(mode === "range" ? "Choose a start and end date." : "Pick at least one date."); return; }
    setBusy(true);
    try {
      if (action === "clear") {
        const { error } = await sb.from("orbit2_team_schedule").delete()
          .in("person", team).in("entry_date", dates);
        if (error) throw error;
        toast.success(`Cleared ${replacing.length} entr${replacing.length === 1 ? "y" : "ies"}`);
      } else {
        const rows = team.flatMap((person) =>
          dates.map((entry_date) => ({ person, entry_date, kind: action, note: note.trim() || null, created_by: user?.id ?? null })));
        const { error } = await sb.from("orbit2_team_schedule").upsert(rows, { onConflict: "person,entry_date" });
        if (error) throw error;
        toast.success(`${SCHEDULE_LABEL[action]} recorded for ${team.length} crew member${team.length === 1 ? "" : "s"} over ${dates.length} day${dates.length === 1 ? "" : "s"}`);
      }
      await onSaved();
    } catch (e) {
      toast.error(errorMessage(e, "Could not save"));
      setBusy(false);
    }
  }

  const seg = (on: boolean) => cn("flex-1 rounded-md border px-3 py-2 text-[15px] font-medium transition",
    on ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-accent");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <h3 className="font-display text-[22px] font-semibold tracking-tight">Batch leave / off</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          <div>
            <span className="mb-1 block text-[14px] font-medium text-muted-foreground">Crew</span>
            <TeamPicker value={team} onChange={setTeam} />
          </div>

          <div>
            <span className="mb-1 block text-[14px] font-medium text-muted-foreground">Record as</span>
            <div className="flex gap-2">
              <button onClick={() => setAction("leave")} className={seg(action === "leave")}>Leave</button>
              <button onClick={() => setAction("off")} className={seg(action === "off")}>Off</button>
              <button onClick={() => setAction("clear")} className={seg(action === "clear")}>Clear entries</button>
            </div>
          </div>

          <div>
            <span className="mb-1 block text-[14px] font-medium text-muted-foreground">Dates</span>
            <div className="mb-2 flex gap-2">
              <button onClick={() => setMode("range")} className={seg(mode === "range")}>Start – End date</button>
              <button onClick={() => setMode("pick")} className={seg(mode === "pick")}>Pick dates</button>
            </div>
            {mode === "range" ? (
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block">
                  <span className="mb-1 block text-[14px] text-muted-foreground">Start date</span>
                  <input type="date" className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
                    value={start} onChange={(e) => setStart(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[14px] text-muted-foreground">End date</span>
                  <input type="date" className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
                    value={end} onChange={(e) => setEnd(e.target.value)} min={start || undefined} />
                </label>
              </div>
            ) : (
              <DatePicker picked={picked} onChange={setPicked} />
            )}
          </div>

          {action !== "clear" && (
            <label className="block">
              <span className="mb-1 block text-[14px] font-medium text-muted-foreground">Note (optional)</span>
              <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
                value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Annual leave" />
            </label>
          )}

          {/* What will happen */}
          {dates.length > 0 && team.length > 0 && (
            <div className="space-y-1 rounded-md border border-border bg-muted/15 px-3 py-2.5 text-[14px]">
              <p>
                {action === "clear"
                  ? <>Removes <span className="font-semibold">{replacing.length}</span> existing entr{replacing.length === 1 ? "y" : "ies"} across {dates.length} day{dates.length === 1 ? "" : "s"}.</>
                  : <><span className="font-semibold">{dates.length}</span> day{dates.length === 1 ? "" : "s"} × <span className="font-semibold">{team.length}</span> crew = {dates.length * team.length} entries
                      {replacing.length > 0 && <> · replaces <span className="font-semibold">{replacing.length}</span> already recorded</>}.</>}
              </p>
              {clashPeople.length > 0 && (
                <p className="flex items-start gap-1.5 font-medium text-red-500">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  {clashPeople.join(", ")} {clashPeople.length === 1 ? "has" : "have"} {clashing.length} job{clashing.length === 1 ? "" : "s"} on
                  these dates. They will show as clashes until the jobs are reassigned.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border/60 px-5 py-3">
          <button onClick={onClose} disabled={busy}
            className="rounded-md border border-border px-3 py-2 text-[15px] hover:bg-accent">Cancel</button>
          <button onClick={() => void save()} disabled={busy || dates.length === 0 || team.length === 0 || (action === "clear" && replacing.length === 0)}
            className={cn("flex items-center gap-1.5 rounded-md px-4 py-2 text-[15px] font-medium hover:opacity-90 disabled:opacity-50",
              action === "clear" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground")}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {action === "clear" ? "Clear" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A month you can click days on, for picking scattered dates. */
function DatePicker({ picked, onChange }: { picked: string[]; onChange: (d: string[]) => void }) {
  const today = new Date();
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const set = new Set(picked);
  const first = new Date(Date.UTC(view.year, view.month, 1));
  const lead = first.getUTCDay();
  const daysIn = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysIn }, (_, i) => new Date(Date.UTC(view.year, view.month, i + 1)).toISOString().slice(0, 10)),
  ];
  const step = (d: number) => {
    const n = new Date(Date.UTC(view.year, view.month + d, 1));
    setView({ year: n.getUTCFullYear(), month: n.getUTCMonth() });
  };
  const toggle = (iso: string) => onChange(set.has(iso) ? picked.filter((p) => p !== iso) : [...picked, iso]);

  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center justify-between border-b border-border/60 px-2 py-1.5">
        <button onClick={() => step(-1)} className="rounded p-1 text-muted-foreground hover:bg-accent"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-[14px] font-semibold">
          {first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
        </span>
        <button onClick={() => step(1)} className="rounded p-1 text-muted-foreground hover:bg-accent"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 p-2 text-center text-[14px]">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="text-muted-foreground">{d}</div>)}
        {cells.map((iso, i) => iso ? (
          <button key={iso} onClick={() => toggle(iso)}
            className={cn("rounded py-1 tabular-nums transition",
              set.has(iso) ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-accent")}>
            {Number(iso.slice(8))}
          </button>
        ) : <div key={`b${i}`} />)}
      </div>
      <div className="flex items-center justify-between border-t border-border/60 px-3 py-1.5 text-[14px] text-muted-foreground">
        <span>{picked.length} date{picked.length === 1 ? "" : "s"} picked{picked.length ? " — across any months" : ""}</span>
        {picked.length > 0 && (
          <button onClick={() => onChange([])} className="font-medium text-primary hover:underline">Clear</button>
        )}
      </div>
    </div>
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 text-[14px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function ColorSwatch({ swatch, children }: { swatch: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-sm", swatch)} />
      {children}
    </span>
  );
}

function Blank({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[240px] items-center justify-center px-6 text-center text-[15px] text-muted-foreground">
      {children}
    </div>
  );
}
