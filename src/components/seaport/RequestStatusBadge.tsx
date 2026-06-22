const STYLES: Record<string, string> = {
  submitted: "border-sky-500/30 bg-sky-500/15 text-sky-400",
  acknowledged: "border-violet-500/30 bg-violet-500/15 text-violet-400",
  in_progress: "border-amber-500/30 bg-amber-500/15 text-amber-400",
  completed: "border-emerald-500/30 bg-emerald-500/15 text-emerald-400",
  report_sent: "border-emerald-600/30 bg-emerald-600/15 text-emerald-300",
  pending: "border-border bg-muted text-muted-foreground",
  no_show: "border-red-500/30 bg-red-500/15 text-red-400",
  cancelled: "border-border bg-muted text-muted-foreground/70",
};
const LABELS: Record<string, string> = {
  submitted: "Submitted", acknowledged: "Acknowledged", in_progress: "In progress",
  completed: "Completed", report_sent: "Report sent",
  pending: "Pending", no_show: "No show", cancelled: "Cancelled",
};

export function RequestStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STYLES[status] ?? STYLES.pending}`}>
      {LABELS[status] ?? status}
    </span>
  );
}
