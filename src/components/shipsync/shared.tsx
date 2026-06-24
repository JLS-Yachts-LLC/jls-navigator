import { STATUS_META, type PackageStatus } from "@/lib/shipsync/model";

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
