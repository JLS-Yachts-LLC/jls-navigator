/**
 * Shared building blocks for the "My Yacht" portal sections (Charter / PMS / ISM).
 * Kept in step with the portal's Card/typography so a section drops straight in.
 * These components are BUILT BUT NOT YET WIRED into the portal sidebar.
 */
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function SectionCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card/80 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.5)]", className)}>
      {children}
    </div>
  );
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="text-lg font-bold">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function SectionLoading() {
  return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
}

export function SectionEmpty({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <SectionCard className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <Icon className="mb-3 h-7 w-7 text-muted-foreground/40" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </SectionCard>
  );
}

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

type Tone = "green" | "amber" | "red" | "sky" | "slate";
const TONE: Record<Tone, string> = {
  green: "bg-emerald-500/15 text-emerald-400",
  amber: "bg-amber-500/15 text-amber-400",
  red: "bg-red-500/15 text-red-400",
  sky: "bg-sky-500/15 text-sky-400",
  slate: "bg-slate-500/15 text-slate-300",
};
export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", TONE[tone])}>{label}</span>;
}

/** Days until a date (negative = past). */
export const daysUntil = (d: string | null | undefined): number | null =>
  d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;
