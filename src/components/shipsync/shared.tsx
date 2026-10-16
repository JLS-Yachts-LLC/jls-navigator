import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";
import { Loader2, UploadCloud, Table as TableIcon, BarChart3, ChevronLeft, ChevronRight, FileText, Plus, X, MoreHorizontal, type LucideIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SignedAnchor } from "@/components/ui/signed-file";
import { Checkbox } from "@/components/ui/checkbox";
import { BarChart, Bar, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STATUS_META, type PackageStatus, type ShipSyncPackage } from "@/lib/shipsync/model";
import { PERIODS, bucketRange, bucketKey, timeSeries, type Period } from "@/lib/shipsync/chart-buckets";

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

/**
 * Pill-shaped stage tabs with a count — In the office 12, Assigned 0, Delivered 1,261. The selected one is gold; the others are
 * quiet outlines. Pills are for states and filters; buttons and inputs stay rounded rectangles.
 */
export function PillTabs<T extends string>({ tabs, value, onChange }: {
  tabs: { key: T; label: string; count?: number; hint?: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div role="tablist" className="flex flex-wrap items-center gap-2">
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <button key={t.key} type="button" role="tab" aria-selected={on} title={t.hint} onClick={() => onChange(t.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[13.5px] font-medium transition-colors duration-150",
              on ? "border-primary bg-primary font-semibold text-primary-foreground shadow-sm ring-2 ring-primary/25"
                : "border-border bg-card/60 text-foreground/80 hover:border-primary/40 hover:bg-card hover:text-foreground",
            )}>
            {t.label}
            {t.count != null && (
              <span className={cn("rounded-full px-2 py-px text-[11.5px] font-semibold tabular-nums", on ? "bg-black/15" : "bg-white/10 text-muted-foreground")}>
                {t.count.toLocaleString()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A small neutral pill for a value that is a "thing" — a client, a shipment type, a delivery note number. */
export function Chip({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex max-w-full items-center truncate rounded-full border border-border bg-white/[0.05] px-2.5 py-0.5 text-[12px] font-medium text-foreground/90", className)}>
      {children}
    </span>
  );
}

/** A courier as a pill with its initial — recognisable at a glance without needing every brand's logo. */
export function CourierChip({ name }: { name: string | null | undefined }) {
  const n = (name ?? "").trim();
  if (!n) return <span className="text-muted-foreground/40">—</span>;
  return (
    <span title={n} className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-white/[0.05] py-0.5 pl-0.5 pr-2.5 text-[12px] text-foreground/90">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-[11px] font-semibold uppercase">{n[0]}</span>
      <span className="truncate">{n}</span>
    </span>
  );
}

/** What to show instead of an empty table: say what is (not) here and what to do about it. */
export function EmptyState({ icon: Icon, title, hint, action }: { icon: LucideIcon; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white/[0.04]">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="text-[15px] font-medium">{title}</div>
      {hint && <p className="max-w-sm text-[13px] text-muted-foreground">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** "Showing 1–25 of 312 packages" with previous / next and a short run of page numbers. */
export function Pagination({ page, pages, onPage, from, to, total, noun }: {
  page: number; pages: number; onPage: (p: number) => void; from: number; to: number; total: number; noun: string;
}) {
  const first = Math.max(1, Math.min(page - 2, pages - 4));
  const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => first + i);
  const btn = "flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-[13px] tabular-nums transition-colors duration-150";
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-1 pt-3 text-[13px] text-muted-foreground">
      <span>{total === 0 ? `No ${noun}` : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} ${noun}`}</span>
      {pages > 1 && (
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}
            className={cn(btn, "border-border hover:border-primary/40 disabled:opacity-40 disabled:hover:border-border")}><ChevronLeft className="h-4 w-4" /></button>
          {nums.map((n) => (
            <button key={n} type="button" onClick={() => onPage(n)} aria-current={n === page}
              className={cn(btn, n === page ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border hover:border-primary/40 hover:text-foreground")}>{n}</button>
          ))}
          <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}
            className={cn(btn, "border-border hover:border-primary/40 disabled:opacity-40 disabled:hover:border-border")}><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

/** The "All time" filter: how far back a shipment's received date may be. */
export const WHEN_OPTIONS = [
  { key: "all", label: "All time" }, { key: "7", label: "Last 7 days" }, { key: "30", label: "Last 30 days" }, { key: "90", label: "Last 90 days" },
] as const;
export type When = (typeof WHEN_OPTIONS)[number]["key"];

export function matchesWhen(p: { received_at: string | null }, when: When, now = Date.now()): boolean {
  if (when === "all") return true;
  if (!p.received_at) return false;
  const t = new Date(p.received_at).getTime();
  return !Number.isNaN(t) && t >= now - Number(when) * 86_400_000;
}

/** The distinct clients in a set of shipments, sorted — for the client filter. */
export function clientsOf(rows: { boat_name: string | null }[]): string[] {
  return Array.from(new Set(rows.map((p) => p.boat_name?.trim()).filter((n): n is string => !!n))).sort((a, b) => a.localeCompare(b));
}

const filterSelectCls = "h-9 rounded-full border border-border bg-card/60 px-3.5 text-[13px] text-foreground/90 outline-none transition-colors duration-150 hover:border-primary/40 focus-visible:border-primary";

/** "All time" and "All clients" as rounded pills — the same two filters on Local Packages, Import and Export. */
export function ShipmentFilters({ when, onWhen, client, onClient, clients }: {
  when: When; onWhen: (w: When) => void; client: string; onClient: (c: string) => void; clients: string[];
}) {
  return (
    <>
      <select value={when} onChange={(e) => onWhen(e.target.value as When)} aria-label="Received" className={filterSelectCls}>
        {WHEN_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      <select value={client} onChange={(e) => onClient(e.target.value)} aria-label="Client" className={cn(filterSelectCls, "max-w-[12rem]")}>
        <option value="">All clients</option>
        {clients.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </>
  );
}

/** Press "/" anywhere on the page (not while typing in a field) to jump to the search box. */
export function useSearchShortcut(ref: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      ref.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref]);
}

/**
 * A row's attached files as ONE small chip ("3 files") that opens a short list to open or remove them and to add more.
 * Wrapped file chips used to make some rows two or three lines tall; this keeps every row one line.
 */
export function FilesCell({ files, onAdd, onRemove, addLabel = "Add files" }: {
  files: { name: string; url: string }[]; onAdd: () => void; onRemove: (index: number) => void; addLabel?: string;
}) {
  if (files.length === 0) {
    return (
      <button type="button" onClick={onAdd}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors duration-150 hover:border-primary hover:text-primary">
        <Plus className="h-3 w-3" /> {addLabel}
      </button>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-white/[0.05] px-2.5 py-0.5 text-[11.5px] font-medium text-primary transition-colors duration-150 hover:border-primary/50">
          <FileText className="h-3 w-3" /> {files.length} file{files.length === 1 ? "" : "s"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-0.5 p-1.5">
        {files.map((d, i) => (
          <div key={`${d.url}-${i}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
            <SignedAnchor stored={d.url} title={d.name} className="flex min-w-0 flex-1 items-center gap-2 truncate text-[13px] text-primary">
              <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{d.name}</span>
            </SignedAnchor>
            <button type="button" onClick={() => onRemove(i)} title="Remove file"
              className="shrink-0 rounded p-1 text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button type="button" onClick={onAdd}
          className="mt-1 flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5 text-[13px] text-muted-foreground transition-colors duration-150 hover:border-primary hover:text-primary">
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </button>
      </PopoverContent>
    </Popover>
  );
}

/** Placeholder rows while a board loads — the page keeps its shape instead of showing a lone spinner. */
export function TableSkeleton({ rows = 9 }: { rows?: number }) {
  return (
    <div className="flex h-full min-w-0 flex-col px-6 py-3" aria-busy="true" aria-label="Loading">
      <div className="mb-3 flex gap-2">
        {[88, 76, 96].map((w, i) => <div key={i} className="h-8 animate-pulse rounded-full bg-white/[0.06]" style={{ width: w + 40 }} />)}
      </div>
      <div className="mb-3 flex gap-2">
        <div className="h-9 w-72 animate-pulse rounded-md bg-white/[0.06]" />
        <div className="h-9 w-28 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="h-9 w-32 animate-pulse rounded-full bg-white/[0.06]" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/60 px-4 py-3.5 last:border-b-0">
            <div className="h-4 w-4 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3.5 w-32 animate-pulse rounded bg-white/[0.08]" />
            <div className="h-5 w-24 animate-pulse rounded-full bg-white/[0.06]" />
            <div className="h-3.5 w-20 animate-pulse rounded bg-white/[0.06]" />
            <div className="h-3.5 flex-1 animate-pulse rounded bg-white/[0.04]" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-white/[0.06]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The "…" at the end of a row: its actions in one menu instead of a hidden icon. Quiet until the row is hovered or focused. */
export function RowMenu({ items, label = "Row actions" }: {
  items: { label: string; icon?: LucideIcon; onSelect: () => void; danger?: boolean }[]; label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={label}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-50 transition duration-150 hover:bg-white/10 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:bg-white/10 data-[state=open]:opacity-100">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {items.map((it) => (
          <DropdownMenuItem key={it.label} onSelect={it.onSelect}
            className={cn("gap-2 text-[13px]", it.danger && "text-destructive focus:text-destructive")}>
            {it.icon && <it.icon className="h-3.5 w-3.5" />} {it.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { semanticTone, type SemanticTone } from "@/lib/shipsync/status-tone";
import { semanticTone, type SemanticTone } from "@/lib/shipsync/status-tone";

const SEMANTIC_HEX: Record<SemanticTone, string> = { amber: "#d99a1f", blue: "#3b8fd9", green: "#1fa97a", red: "#d9534f", grey: "#6b7280" };
const SEMANTIC_BORDER: Record<SemanticTone, string> = {
  amber: "border-amber-500", blue: "border-sky-500", green: "border-emerald-500", red: "border-red-500", grey: "border-slate-500",
};

/** A status label as a hex colour for its pill or chart bar. */
export const semanticStatusColor = (label: string): string => SEMANTIC_HEX[semanticTone(label)];

/** A board group's left bar: the open groups (Import, Export, Incoming) read as waiting; the rest by their name. */
export function semanticGroupBorder(title: string): string {
  const t = title.trim().toLowerCase();
  if (/^(import|export|incoming)$/.test(t)) return SEMANTIC_BORDER.amber;
  return SEMANTIC_BORDER[semanticTone(title)];
}

const COLUMN_LINES_KEY = "shipsync.columnLines";

/**
 * Whether the tables draw a line between columns — a personal preference kept in this browser (on by default, as the older
 * screens had them). Storage can be blocked, so reading and writing never throw.
 */
export function useColumnLines(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem(COLUMN_LINES_KEY) !== "0"; } catch { return true; }
  });
  const set = (v: boolean) => {
    setOn(v);
    try { localStorage.setItem(COLUMN_LINES_KEY, v ? "1" : "0"); } catch { /* the choice just won't be remembered */ }
  };
  return [on, set];
}

/** The tick box in each board's toolbar that shows or hides the lines between columns. */
export function ColumnLinesToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded-full border border-border bg-card/60 px-3.5 text-[13px] text-foreground/90 transition-colors duration-150 hover:border-primary/40"
      title="Show or hide the lines between the columns">
      <Checkbox checked={on} onCheckedChange={(v) => onChange(v === true)} aria-label="Column lines" />
      Column lines
    </label>
  );
}

export interface StatusDatum { label: string; count: number; color: string }

const TOOLTIP_STYLE = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };
const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" };

/** Distinct hex colours for per-vessel bars/segments — order matters (rank 0
 *  gets colour 0), so the same vessel keeps the same colour across the top-
 *  vessels bar and the monthly stacked bar below it. */
const VESSEL_PALETTE = [
  "#C9A227", "#6C8EBF", "#4A9C94", "#8B7FB8", "#C07C6A", "#7C8AA5",
  "#8A9A5B", "#B79F6B", "#5E7FA8", "#9A8C98",
];
const OTHER_COLOR = "#5C6678";

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

function TimeStackedCard({
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
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: "var(--border)" }} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
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
 *  quantity over time stacked by vessel), built from the same rows and
 *  status/colour vocabulary the board's table already uses. `rows` should be
 *  the board's current (search-)filtered set, same data the table shows.
 *
 *  Period (daily / weekly / monthly) and Client choose what the numbers, the
 *  vessel bars and the time chart show; the status pie is always the whole
 *  board. */
export function ShipSyncChartsPanel({
  rows, statusData, title,
}: {
  rows: ShipSyncPackage[];
  statusData: StatusDatum[];
  title: string;
}) {
  const [period, setPeriod] = useState<Period>("monthly");
  const [client, setClient] = useState("all");
  const now = useMemo(() => new Date(), []);

  const clients = useMemo(
    () => Array.from(new Set(rows.map((p) => p.boat_name?.trim()).filter((n): n is string => !!n))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  // A client picked earlier can vanish when the board is searched or reloaded: fall back to everyone rather than chart nothing.
  const chosen = client !== "all" && clients.includes(client) ? client : "all";

  const inWindow = useMemo(() => {
    const keys = new Set(bucketRange(period, now));
    return rows.filter((p) => {
      if (!p.received_at) return false;
      const d = new Date(p.received_at);
      return !Number.isNaN(d.getTime()) && keys.has(bucketKey(period, d));
    });
  }, [rows, period, now]);
  const scoped = useMemo(
    () => (chosen === "all" ? inWindow : inWindow.filter((p) => (p.boat_name?.trim() || "Unassigned") === chosen)),
    [inWindow, chosen],
  );

  const vessels = useMemo(() => topVessels(scoped), [scoped]);
  const series = useMemo(() => timeSeries(scoped, period, now, vessels.map((v) => v.name)), [scoped, period, now, vessels]);
  const windowText = PERIODS.find((x) => x.key === period)!.window;
  const label = PERIODS.find((x) => x.key === period)!.label.toLowerCase();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5" role="group" aria-label="Period">
          {PERIODS.map((x) => (
            <button key={x.key} type="button" onClick={() => setPeriod(x.key)}
              className={cn("rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                period === x.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {x.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          Client
          <select value={chosen} onChange={(e) => setClient(e.target.value)}
            className="h-8 max-w-[14rem] rounded-md border border-border bg-background px-2 text-[12px] text-foreground">
            <option value="all">All clients</option>
            {clients.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <span className="text-[12px] text-muted-foreground">Showing the {windowText}, by date received — {chosen === "all" ? "all clients" : chosen}.</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatusPieCard data={statusData} title={`${title} by status (whole board)`} />
        <NumbersCard rows={scoped} />
        {chosen === "all" && <TopVesselsCard data={vessels} title={`${title} by vessel (qty, ${windowText})`} />}
        <TimeStackedCard data={series} vessels={vessels} title={`${title} — ${label}${chosen === "all" ? "" : `, ${chosen}`}`} />
      </div>
    </div>
  );
}

/**
 * One self-contained bar graph of shipments over time: Daily / Weekly / Monthly buttons and its own Client dropdown, stacked by
 * client when "All clients" is chosen. Used four times on the ShipSync Dashboard (Import, Transit, Local, Export). `rows` are
 * everything that belongs in the graph; the date a shipment counts on is the date it was received (Export: requested).
 */
export function PeriodBarChart({ title, rows, hint }: { title: string; rows: ShipSyncPackage[]; hint?: string }) {
  const [period, setPeriod] = useState<Period>("weekly");
  const [client, setClient] = useState("all");
  const now = useMemo(() => new Date(), []);

  const clients = useMemo(
    () => Array.from(new Set(rows.map((p) => p.boat_name?.trim()).filter((n): n is string => !!n))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const chosen = client !== "all" && clients.includes(client) ? client : "all";

  const scoped = useMemo(() => {
    const keys = new Set(bucketRange(period, now));
    return rows.filter((p) => {
      if (!p.received_at) return false;
      const d = new Date(p.received_at);
      if (Number.isNaN(d.getTime()) || !keys.has(bucketKey(period, d))) return false;
      return chosen === "all" || (p.boat_name?.trim() || "Unassigned") === chosen;
    });
  }, [rows, period, now, chosen]);

  const vessels = useMemo(() => topVessels(scoped, 6), [scoped]);
  const series = useMemo(() => timeSeries(scoped, period, now, vessels.map((v) => v.name)), [scoped, period, now, vessels]);
  const windowText = PERIODS.find((x) => x.key === period)!.window;
  const pieces = sumQty(scoped);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[12px] text-muted-foreground">
            {pieces.toLocaleString()} piece{pieces === 1 ? "" : "s"} in {scoped.length.toLocaleString()} shipment{scoped.length === 1 ? "" : "s"} · {windowText}
          </div>
        </div>
        <div className="inline-flex items-center rounded-lg border border-border bg-muted/30 p-0.5" role="group" aria-label={`${title} period`}>
          {PERIODS.map((x) => (
            <button key={x.key} type="button" onClick={() => setPeriod(x.key)}
              className={cn("rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                period === x.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
        <span>Client</span>
        <select value={chosen} onChange={(e) => setClient(e.target.value)} aria-label={`${title} client`}
          className="h-7 max-w-[13rem] rounded-md border border-border bg-background px-2 text-[12px] text-foreground">
          <option value="all">All clients</option>
          {clients.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {hint && <span className="ml-auto hidden text-[11px] sm:inline">{hint}</span>}
      </div>

      {scoped.length === 0 ? (
        <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">Nothing in this period{chosen === "all" ? "" : ` for ${chosen}`}.</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={series} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: "var(--border)" }} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis allowDecimals={false} width={32} tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={TOOLTIP_STYLE} />
              {vessels.map((v) => <Bar key={v.name} dataKey={v.name} stackId="qty" fill={v.color} maxBarSize={36} />)}
            </BarChart>
          </ResponsiveContainer>
          {chosen === "all" && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {vessels.map((v) => (
                <div key={v.name} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: v.color }} /> {v.name}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Column titles from `mondayRow`/`mondayColumnOrder` not already covered by a
 *  tab's own base columns — so real Monday data never goes missing, and nothing
 *  gets shown that isn't a genuine Monday column. */
/**
 * Download rows as a CSV that Excel opens cleanly — a UTF-8 BOM so accented
 * names survive, CRLF line endings, and every value quoted.
 *
 * A leading =, +, - or @ is prefixed with an apostrophe: spreadsheets treat
 * those as the start of a formula, which is both wrong and the standard CSV
 * injection route.
 *
 * Excel will still helpfully reformat a long all-digit reference (an AWB, say)
 * into scientific notation on open. Nothing in a .csv can stop that — a real
 * .xlsx would be needed.
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
): void {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

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
