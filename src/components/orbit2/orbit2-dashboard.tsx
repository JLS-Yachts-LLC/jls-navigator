/**
 * Orbit 2 — Dashboard.
 *
 * Everything here is counted from the tasks entered on these pages. Nothing is
 * seeded or illustrative: with no tasks the page reads zero and says so, because
 * a dashboard that invents numbers is worse than an empty one.
 *
 *   Donut                 hours per service category
 *   Task Complete         complete against everything entered
 *   Client Project Status complete / pending per vessel
 *   Calendar              each task drawn against the hour it runs
 *   Team Management       the same tasks grouped by who holds them
 */
import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Plus, CalendarDays, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useOrbit2, byCategory, completion, byVessel, byAssignee, scheduled, dateRange,
  monthGrid, busiestMonth, hourOf, durationHours, type Orbit2Task,
} from "./orbit2-data";
import { colorFor, COMPLETE_COLOR, PENDING_COLOR } from "./orbit2-constants";

/** The working day the calendar covers. */
const DAY_START = 0;
const DAY_END = 24;
const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export function Orbit2Dashboard({ onAddTask }: { onAddTask?: () => void }) {
  const { tasks, yachts, loading } = useOrbit2();
  const [pane, setPane] = useState<"calendar" | "team">("calendar");
  /** Month shown on the Team Management calendar; null until the tasks decide it. */
  const [month, setMonth] = useState<{ year: number; month: number } | null>(null);

  const cats = useMemo(() => byCategory(tasks), [tasks]);
  const done = useMemo(() => completion(tasks), [tasks]);
  const vessels = useMemo(() => byVessel(tasks, yachts), [tasks, yachts]);
  const team = useMemo(() => byAssignee(tasks), [tasks]);
  const days = useMemo(() => scheduled(tasks), [tasks]);
  const totalHours = cats.reduce((s, c) => s + c.hours, 0);

  // Open on the month the work is actually in, until someone navigates away.
  const cal = month ?? busiestMonth(tasks);
  const grid = useMemo(() => monthGrid(tasks, cal.year, cal.month), [tasks, cal.year, cal.month]);
  function stepMonth(delta: number) {
    const d = new Date(Date.UTC(cal.year, cal.month + delta, 1));
    setMonth({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  }

  /** Every day between the first and last scheduled task, so gaps are visible. */
  const calendarDays = useMemo(() => {
    if (!days.length) return [];
    const all = dateRange(days[0].date, days[days.length - 1].date);
    const byDate = new Map(days.map((d) => [d.date, d.items]));
    return all.map((date) => ({ date, items: byDate.get(date) ?? [] }));
  }, [days]);

  function exportToExcel() {
    const name = (id: string | null) => yachts.find((y) => y.id === id)?.vessel_name ?? "";
    const head = ["Task", "Category", "Vessel", "Status", "Date", "Start", "End", "Hours", "Assigned to", "Notes"];
    const rows = tasks.map((t) => [
      t.title, t.category, name(t.yacht_id), t.status, t.task_date ?? "",
      t.start_time ?? "", t.end_time ?? "", durationHours(t).toFixed(2),
      t.assigned_to ?? "", t.notes ?? "",
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `orbit2-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {tasks.length === 0
            ? "No tasks yet — everything below fills in as tasks are added."
            : `${tasks.length} task${tasks.length === 1 ? "" : "s"} · ${totalHours.toFixed(1)} scheduled hours`}
        </p>
        <div className="flex items-center gap-2">
          {onAddTask && (
            <Button size="sm" onClick={onAddTask} className="h-9 gap-1.5"><Plus className="h-3.5 w-3.5" /> New task</Button>
          )}
          <Button size="sm" variant="outline" onClick={exportToExcel} disabled={!tasks.length} className="h-9 gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export to Excel
          </Button>
        </div>
      </div>

      {/* ── Top row: hours by category · task completion · per-vessel status ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Hours by service">
          {cats.length === 0 ? <Blank>No tasks yet</Blank> : (
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={cats} dataKey="hours" nameKey="category" innerRadius={52} outerRadius={84} paddingAngle={2}
                    label={(d: any) => `${d.category} ${d.hours.toFixed(0)}h`} labelLine={false}
                    style={{ fontSize: 10 }}>
                    {cats.map((c) => <Cell key={c.category} fill={colorFor(c.category)} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => [`${Number(v).toFixed(1)} hours`, n]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Task complete">
          <div className="flex h-[230px] flex-col items-center justify-center gap-4">
            <div className="w-full">
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted/50">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${done.pct}%`, background: `linear-gradient(90deg, ${PENDING_COLOR}, ${COMPLETE_COLOR})` }} />
              </div>
              <div className="mt-2 text-right text-sm font-semibold">{done.pct}%</div>
            </div>
            <div className="font-display text-xl font-bold text-primary">Task Complete</div>
            <p className="text-xs text-muted-foreground">
              {done.complete} of {done.total} complete{done.pending ? ` · ${done.pending} pending` : ""}
            </p>
          </div>
        </Card>

        <Card title="Client project status">
          {vessels.length === 0 ? <Blank>No tasks yet</Blank> : (
            <div className="h-[230px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vessels} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="vessel" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={46} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="complete" stackId="s" name="Complete" fill={COMPLETE_COLOR} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="pending" stackId="s" name="Pending" fill={PENDING_COLOR} radius={[4, 4, 0, 0]} />
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
              className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition",
                pane === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {pane === "calendar" ? (
          calendarDays.length === 0 ? (
            <Blank>Tasks appear here once they have a date and a start time.</Blank>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-[11px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 w-52 border-b border-r border-border bg-card px-3 py-2 text-left font-semibold text-muted-foreground">
                      Date
                    </th>
                    {HOURS.map((h) => (
                      <th key={h} className="min-w-[38px] border-b border-r border-border/40 bg-card px-1 py-2 font-medium text-muted-foreground">
                        {h}:00
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calendarDays.map(({ date, items }) => (
                    <tr key={date}>
                      <td className="sticky left-0 z-10 w-52 whitespace-nowrap border-b border-r border-border bg-card px-3 py-1.5 text-muted-foreground">
                        {fmtDay(date)}
                      </td>
                      {/* One cell spanning the whole day, with blocks positioned
                          by percentage — a task rarely starts on the hour, and a
                          cell-per-hour grid would round it to one. */}
                      <td colSpan={HOURS.length} className="relative border-b border-border/40 p-0" style={{ height: 30 }}>
                        <div className="absolute inset-0 flex">
                          {HOURS.map((h) => <div key={h} className="flex-1 border-r border-border/25" />)}
                        </div>
                        {items.map((t) => {
                          const s = hourOf(t.start_time)!;
                          const e = hourOf(t.end_time) ?? s + 1;
                          const left = ((s - DAY_START) / (DAY_END - DAY_START)) * 100;
                          const width = Math.max(((Math.min(e, DAY_END) - s) / (DAY_END - DAY_START)) * 100, 1.5);
                          return (
                            <div key={t.id}
                              title={`${t.title} — ${t.category}${t.start_time ? ` · ${t.start_time.slice(0, 5)}` : ""}${t.end_time ? `–${t.end_time.slice(0, 5)}` : ""}`}
                              className="absolute top-1 bottom-1 overflow-hidden rounded px-1.5 text-[10px] font-medium leading-[22px] text-black/80"
                              style={{ left: `${left}%`, width: `${width}%`, background: colorFor(t.category) }}>
                              {t.category}
                            </div>
                          );
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          team.length === 0 ? <Blank>No tasks yet</Blank> : (
            /* Who holds how much, beside a month showing who is on which day. */
            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(240px,320px)_1fr]">
              <div className="self-start overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Operation</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Total Task Assigned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {team.map((r) => (
                      <tr key={r.person} className="hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">{r.person}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-2">
                  <button onClick={() => stepMonth(-1)} title="Previous month"
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-semibold uppercase tracking-wide">
                    {new Date(Date.UTC(cal.year, cal.month, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
                  </span>
                  <button onClick={() => stepMonth(1)} title="Next month"
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <table className="w-full table-fixed text-[11px]">
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
                        {week.map((cell) => (
                          <td key={cell.date}
                            className={cn("h-[74px] border-r border-border/40 align-top last:border-r-0",
                              !cell.inMonth && "bg-muted/10")}>
                            <div className={cn("px-1.5 pt-1 text-right text-[10px]",
                              cell.inMonth ? "text-muted-foreground" : "text-muted-foreground/30")}>
                              {cell.day}
                            </div>
                            <div className="space-y-0.5 px-1.5 pb-1">
                              {cell.people.slice(0, 3).map((p) => (
                                <div key={p} className="truncate text-[10.5px] text-foreground/85" title={p}>{p}</div>
                              ))}
                              {cell.people.length > 3 && (
                                <div className="text-[10px] text-muted-foreground">+{cell.people.length - 3} more</div>
                              )}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Blank({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[230px] items-center justify-center px-6 text-center text-sm text-muted-foreground">{children}</div>;
}
