import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, string> = {
  active: "pill-success",
  "in port": "pill-success",
  arriving: "pill-info",
  departed: "pill-muted",
  pending: "pill-warning",
  archived: "pill-muted",
  "in progress": "pill-info",
  done: "pill-success",
  paid: "pill-info",
  expired: "pill-danger",
  urgent: "pill-danger",
  high: "pill-warning",
};

export function StatusPill({ status, className }: { status?: string | null; className?: string }) {
  if (!status) return <span className="pill pill-muted">—</span>;
  const key = status.toLowerCase().trim();
  const variant = STATUS_MAP[key] ?? "pill-muted";
  return <span className={cn("pill", variant, className)}>{status}</span>;
}
