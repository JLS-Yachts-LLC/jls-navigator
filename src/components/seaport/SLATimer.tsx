import { useEffect, useState } from "react";
import { minsElapsed } from "@/lib/seaport/sla";

/** Live SLA elapsed/remaining bar. POLARIS_SEAPORT_IMMIGRATION.md §5. */
export function SLATimer({
  submittedAt, targetMins = 240, completedAt,
}: { submittedAt: string; targetMins?: number; completedAt?: string | null }) {
  const [elapsed, setElapsed] = useState(() => minsElapsed(submittedAt));

  useEffect(() => {
    if (completedAt) { setElapsed(minsElapsed(submittedAt)); return; }
    setElapsed(minsElapsed(submittedAt));
    const id = setInterval(() => setElapsed(minsElapsed(submittedAt)), 30000);
    return () => clearInterval(id);
  }, [submittedAt, completedAt]);

  const shown = completedAt ? minsElapsed2(submittedAt, completedAt) : elapsed;
  const pct = Math.min((shown / targetMins) * 100, 100);
  const breached = shown > targetMins;
  const color = completedAt
    ? (breached ? "#E87050" : "#4CAF80")
    : breached ? "#E87050" : shown > targetMins * 0.75 ? "#E8A020" : "#00C4CC";

  const label = completedAt
    ? `Done in ${shown}m`
    : breached ? `${shown - targetMins}m overdue` : `${targetMins - shown}m left`;

  return (
    <div className="flex items-center gap-2">
      <div className="h-[3px] flex-1 rounded-full bg-muted">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="whitespace-nowrap font-display text-[10px] font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}

function minsElapsed2(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000);
}
