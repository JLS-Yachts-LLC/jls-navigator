import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, UploadCloud, Table as TableIcon, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
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

/** Bar chart of counts per status/group, coloured to match each label's own
 *  badge colour — the board's "Chart" view. Skips zero-count labels, same as
 *  Monday's own chart (an all-zero board renders an empty-state instead). */
export function StatusBarChart({
  data, title,
}: {
  data: { label: string; count: number; color: string }[];
  title: string;
}) {
  const bars = data.filter((d) => d.count > 0);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 text-sm font-semibold">{title}</div>
      {bars.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Nothing to chart yet.</div>
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={bars} margin={{ top: 8, right: 8, left: 0, bottom: 64 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              interval={0} angle={-35} textAnchor="end" height={80} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
            <YAxis allowDecimals={false} width={32} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "var(--muted)" }}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56}>
              {bars.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
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
