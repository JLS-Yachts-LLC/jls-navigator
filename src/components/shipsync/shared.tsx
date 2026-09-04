import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, UploadCloud, Table as TableIcon, BarChart3 } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STATUS_META, type PackageStatus, type ShipSyncPackage } from "@/lib/shipsync/model";

const TONE: Record<string, string> = {
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/20",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/20",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20",
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  red: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  muted: "bg-muted text-muted-foreground border-border",
};

/** Same tone vocabulary as TONE above, as real hex — for contexts (recharts
 *  bar fills) that can't take a Tailwind class. */
export const TONE_HEX: Record<string, string> = {
  sky: "#0ea5e9", violet: "#8b5cf6", amber: "#f59e0b", orange: "#f97316",
  emerald: "#10b981", red: "#ef4444", muted: "#6b7280",
};

export function StatusBadge({ status }: { status: PackageStatus | string }) {
  const meta = (STATUS_META as any)[status] as { label: string; tone: string } | undefined;
  const cls = TONE[meta?.tone ?? "muted"] ?? TONE.muted;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {meta?.label ?? status}
    </span>
  );
}

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
export const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

/** Most recent extra.imported_at across a set of packages (from a Monday sync), or null. */
export function lastSyncedAt(rows: ShipSyncPackage[]): string | null {
  let latest: string | null = null;
  for (const p of rows) {
    const at = (p.extra as any)?.imported_at as string | undefined;
    if (at && (!latest || at > latest)) latest = at;
  }
  return latest;
}

/** Format a timestamp as "just now" / "12m ago" / "3h ago" / a short date. */
export function rel(ts: string | null): string {
  if (!ts) return "never";
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** The complete raw Monday.com row for a package (verbatim, board column title → text). */
export function mondayRow(p: ShipSyncPackage): Record<string, string> {
  return ((p.extra as any)?.monday ?? {}) as Record<string, string>;
}
/** The Monday board's own column order, as discovered at sync time. */
export function mondayColumnOrder(p: ShipSyncPackage): string[] {
  return (((p.extra as any)?.monday_columns ?? []) as string[]).filter(Boolean);
}
/** Drag-and-drop (or browse) file picker, shown as a popup for attaching one
 *  or more documents to a row. Doesn't upload itself — hands the picked
 *  files to `onUpload` and stays open (spinner) until that resolves, then
 *  closes. Shared by Local Packages, Import and Export so all three "Files"
 *  columns behave identically. */
export function DocumentDropzoneDialog({
  open, onClose, onUpload, title = "Attach documents",
}: {
  open: boolean;
  onClose: () => void;
  onUpload: (files: File[]) => Promise<void>;
  title?: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    setBusy(true);
    try {
      await onUpload(files);
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFiles(e.dataTransfer.files); }}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-border",
          )}
        >
          {busy ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Uploading…</p>
            </>
          ) : (
            <>
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Drag and drop files here</p>
              <span className="text-xs text-muted-foreground/70">or</span>
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                Browse files
              </Button>
            </>
          )}
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Small segmented control switching a board between its table and its chart
 *  view — the same "Main table / Chart" split Monday.com boards show. */
export function TableChartToggle({ value, onChange }: { value: "table" | "chart"; onChange: (v: "table" | "chart") => void }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
      {([
        { v: "table" as const, label: "Table", Icon: TableIcon },
        { v: "chart" as const, label: "Chart", Icon: BarChart3 },
      ]).map(({ v, label, Icon }) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors",
            value === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}>
          <Icon className="h-3.5 w-3.5" /> {label}
        </button>
      ))}
    </div>
  );
}

export interface StatusDatum { label: string; count: number; color: string }

const TOOLTIP_STYLE = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };
const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" };

/** Distinct hex colours for per-vessel bars/segments — order matters (rank 0
 *  gets colour 0), so the same vessel keeps the same colour across the top-
 *  vessels bar and the monthly stacked bar below it. */
const VESSEL_PALETTE = [
  "#00c875", "#579bfc", "#fdab3d", "#e2445c", "#a25ddc", "#66ccff",
  "#ff642e", "#037f4c", "#cab641", "#9d50dd",
];
const OTHER_COLOR = "#6b7280";

function sumQty(rows: ShipSyncPackage[]): number {
  return rows.reduce((s, p) => s + (p.num_packages ?? 1), 0);
}

/** Top N vessels by total quantity, the rest folded into one "Other" bucket
 *  — same Pareto-style ranking as Monday's "Client Packages" chart. */
function topVessels(rows: ShipSyncPackage[], n = 8): { name: string; qty: number; color: string }[] {
  const totals = new Map<string, number>();
  for (const p of rows) {
    const name = p.boat_name?.trim() || "Unassigned";
    totals.set(name, (totals.get(name) ?? 0) + (p.num_packages ?? 1));
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, n).map(([name, qty], i) => ({ name, qty, color: VESSEL_PALETTE[i % VESSEL_PALETTE.length] }));
  const restQty = sorted.slice(n).reduce((s, [, q]) => s + q, 0);
  if (restQty > 0) top.push({ name: "Other", qty: restQty, color: OTHER_COLOR });
  return top;
}

const monthKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
};

/** Quantity per month, stacked by the same vessels `topVessels` ranked (plus
 *  "Other" if it picked one) — Monday's stacked monthly view. Rows without a
 *  received date don't have a month to sit in, so they're left out here
 *  (they still count in the other three widgets). */
function monthlyByVessel(rows: ShipSyncPackage[], vessels: { name: string }[]): Record<string, number | string>[] {
  const names = new Set(vessels.map((v) => v.name));
  const byMonth = new Map<string, Record<string, number>>();
  for (const p of rows) {
    if (!p.received_at) continue;
    const key = monthKey(p.received_at);
    const boat = p.boat_name?.trim() || "Unassigned";
    const bucket = names.has(boat) ? boat : "Other";
    if (!byMonth.has(key)) byMonth.set(key, {});
    const m = byMonth.get(key)!;
    m[bucket] = (m[bucket] ?? 0) + (p.num_packages ?? 1);
  }
  return [...byMonth.keys()].sort().map((key) => ({ month: monthLabel(key), ...byMonth.get(key)! }));
}

function ChartCard({ title, className, empty, children }: { title: string; className?: string; empty: boolean; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <div className="mb-3 text-sm font-semibold">{title}</div>
      {empty ? <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Nothing to chart yet.</div> : children}
    </div>
  );
}

function StatusPieCard({ data, title }: { data: StatusDatum[]; title: string }) {
  const slices = data.filter((d) => d.count > 0);
  const total = slices.reduce((s, d) => s + d.count, 0);
  return (
    <ChartCard title={title} empty={slices.length === 0}>
      <div className="flex flex-wrap items-center gap-6">
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie data={slices} dataKey="count" nameKey="label" outerRadius={85} stroke="var(--card)" strokeWidth={2}>
              {slices.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-[12px]">
          {slices.map((d) => (
            <div key={d.label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
              <span className="min-w-0 flex-1 truncate">{d.label}</span>
              <span className="tabular-nums text-muted-foreground">{((d.count / total) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}

function NumbersCard({ rows }: { rows: ShipSyncPackage[] }) {
  return (
    <ChartCard title="Numbers" empty={false} className="flex flex-col items-center justify-center text-center">
      <div className="font-display text-4xl font-bold tabular-nums">{sumQty(rows)}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        Total quantity across {rows.length} shipment{rows.length === 1 ? "" : "s"}
      </div>
    </ChartCard>
  );
}

function TopVesselsCard({ data, title }: { data: { name: string; qty: number; color: string }[]; title: string }) {
  return (
    <ChartCard title={title} empty={data.length === 0}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 56 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            interval={0} angle={-35} textAnchor="end" height={70} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
          <YAxis allowDecimals={false} width={32} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="qty" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function MonthlyStackedCard({
  data, vessels, title,
}: {
  data: Record<string, number | string>[];
  vessels: { name: string; color: string }[];
  title: string;
}) {
  return (
    <ChartCard title={title} empty={data.length === 0} className="lg:col-span-2">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="month" tick={AXIS_TICK} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
          <YAxis allowDecimals={false} width={32} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          {vessels.map((v) => <Bar key={v.name} dataKey={v.name} stackId="qty" fill={v.color} maxBarSize={56} />)}
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        {vessels.map((v) => (
          <div key={v.name} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: v.color }} /> {v.name}
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

/** A board's whole "Chart" view — the multi-widget layout Monday's own Chart
 *  tab shows (status breakdown, total quantity, top vessels by quantity, and
 *  quantity per month stacked by vessel), built from the same rows and
 *  status/colour vocabulary the board's table already uses. `rows` should be
 *  the board's current (search-)filtered set, same data the table shows. */
export function ShipSyncChartsPanel({
  rows, statusData, title,
}: {
  rows: ShipSyncPackage[];
  statusData: StatusDatum[];
  title: string;
}) {
  const vessels = useMemo(() => topVessels(rows), [rows]);
  const monthly = useMemo(() => monthlyByVessel(rows, vessels), [rows, vessels]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <StatusPieCard data={statusData} title={`${title} by status`} />
      <NumbersCard rows={rows} />
      <TopVesselsCard data={vessels} title={`${title} by vessel (qty)`} />
      <MonthlyStackedCard data={monthly} vessels={vessels} title={`${title} by month`} />
    </div>
  );
}

/** Column titles from `mondayRow`/`mondayColumnOrder` not already covered by a
 *  tab's own base columns — so real Monday data never goes missing, and nothing
 *  gets shown that isn't a genuine Monday column. */
export function extraMondayColumns(rows: ShipSyncPackage[], covered: string[]): string[] {
  const isCovered = (title: string) => {
    const t = title.toLowerCase();
    return covered.some((k) => t.includes(k));
  };
  const seen = new Set<string>();
  const ordered: string[] = [];
  const add = (title: string) => {
    if (!seen.has(title) && !isCovered(title)) { seen.add(title); ordered.push(title); }
  };
  for (const p of rows) mondayColumnOrder(p).forEach(add);
  for (const p of rows) Object.keys(mondayRow(p)).forEach(add);
  return ordered;
}

/**
 * Persists a board's column order (an array of stable column ids) to
 * localStorage, per browser/device, keyed by `storageKey`. Reconciled
 * against the current full id list — a column that's disappeared (e.g. a
 * Monday column dropped) is dropped from the saved order too, and a new one
 * is appended at the end rather than losing it.
 */
export function useColumnOrder(storageKey: string, ids: string[]): [string[], (next: string[]) => void] {
  const [order, setOrder] = useState<string[]>(() => {
    let saved: string[] = [];
    try { saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]"); } catch { /* ignore */ }
    const known = new Set(ids);
    const kept = saved.filter((id) => known.has(id));
    const missing = ids.filter((id) => !kept.includes(id));
    return [...kept, ...missing];
  });

  const idsKey = ids.join("|");
  useEffect(() => {
    setOrder((prev) => {
      const known = new Set(ids);
      const kept = prev.filter((id) => known.has(id));
      const missing = ids.filter((id) => !kept.includes(id));
      if (kept.length === prev.length && missing.length === 0) return prev;
      return [...kept, ...missing];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const update = useCallback((next: string[]) => {
    setOrder(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  }, [storageKey]);

  return [order, update];
}

function reorderColumns(order: string[], fromId: string, toId: string): string[] {
  const next = order.filter((id) => id !== fromId);
  const insertAt = next.indexOf(toId);
  next.splice(insertAt === -1 ? next.length : insertAt, 0, fromId);
  return next;
}

/**
 * Drag-to-reorder for a board's columns: picking one up and dragging over
 * another marks it as the drop target, and letting go there moves it — the
 * order itself only ever changes once, on drop, never on every pixel of
 * mouse movement. Callers should collapse the column being held (its header
 * AND every row's cell in that column) to a thin placeholder while
 * `draggingId` is set, so a board with hundreds of rows isn't re-rendering
 * full-width interactive cells for every column the drag passes over.
 */
export function useColumnDrag(order: string[], setOrder: (next: string[]) => void) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function headerDragProps(id: string) {
    return {
      draggable: true,
      onDragStart: (e: DragEvent) => { e.dataTransfer.effectAllowed = "move"; setDraggingId(id); },
      onDragEnd: () => { setDraggingId(null); setDragOverId(null); },
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        if (draggingId && draggingId !== id && dragOverId !== id) setDragOverId(id);
      },
      onDragLeave: () => { if (dragOverId === id) setDragOverId(null); },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        if (draggingId && draggingId !== id) setOrder(reorderColumns(order, draggingId, id));
        setDraggingId(null);
        setDragOverId(null);
      },
    };
  }

  return { draggingId, dragOverId, headerDragProps };
}
