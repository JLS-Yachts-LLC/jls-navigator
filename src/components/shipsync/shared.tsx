import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, UploadCloud } from "lucide-react";
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
