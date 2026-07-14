/**
 * PMS section for the "My Yacht" portal — planned-maintenance tasks + equipment register.
 * Reads `pms_tasks` / `pms_equipment` (yacht-scoped). BUILT BUT NOT YET WIRED.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Wrench, Gauge, ClipboardList } from "lucide-react";
import { SectionCard, SectionHeader, SectionLoading, SectionEmpty, StatusBadge, fmtDate, daysUntil } from "./section-ui";

const db = supabase as any;

type PmsTask = {
  id: string; equipment_id: string | null; title: string; description: string | null;
  interval_kind: string | null; interval_value: number | null; interval_unit: string | null;
  last_done_date: string | null; last_done_hours: number | null;
  next_due_date: string | null; next_due_hours: number | null; status: string; assigned_to: string | null;
};
type PmsEquipment = {
  id: string; name: string; category: string | null; maker: string | null; model: string | null;
  location: string | null; running_hours: number | null;
};

const TASK_TONE: Record<string, "green" | "amber" | "red" | "sky" | "slate"> = {
  done: "green", upcoming: "sky", due: "amber", overdue: "red",
};

export function PmsSection({ yachtId }: { yachtId: string }) {
  const [tasks, setTasks] = useState<PmsTask[]>([]);
  const [equipment, setEquipment] = useState<PmsEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"tasks" | "equipment">("tasks");

  useEffect(() => {
    Promise.all([
      db.from("pms_tasks")
        .select("id, equipment_id, title, description, interval_kind, interval_value, interval_unit, last_done_date, last_done_hours, next_due_date, next_due_hours, status, assigned_to")
        .eq("yacht_id", yachtId).order("next_due_date", { ascending: true, nullsFirst: false }),
      db.from("pms_equipment")
        .select("id, name, category, maker, model, location, running_hours")
        .eq("yacht_id", yachtId).order("name"),
    ]).then(([t, e]: any[]) => { setTasks(t.data ?? []); setEquipment(e.data ?? []); setLoading(false); });
  }, [yachtId]);

  if (loading) return <SectionLoading />;

  const equipName = (id: string | null) => equipment.find((e) => e.id === id)?.name;
  const interval = (t: PmsTask) =>
    t.interval_value && t.interval_unit ? `Every ${t.interval_value} ${t.interval_unit}` : null;

  const overdue = tasks.filter((t) => t.status === "overdue").length;
  const due = tasks.filter((t) => t.status === "due").length;

  return (
    <div className="space-y-4">
      <SectionHeader title="Planned Maintenance (PMS)" subtitle="Your vessel's maintenance schedule and equipment register." />

      {(overdue > 0 || due > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <SectionCard className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Overdue</div><div className={cn("mt-1 text-lg font-bold", overdue ? "text-red-400" : "")}>{overdue}</div></SectionCard>
          <SectionCard className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Due soon</div><div className={cn("mt-1 text-lg font-bold", due ? "text-amber-400" : "")}>{due}</div></SectionCard>
        </div>
      )}

      <div className="inline-flex rounded-xl border border-border p-1 text-sm">
        {(["tasks", "equipment"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
                  className={cn("rounded-lg px-4 py-1.5 font-medium capitalize transition", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {v}
          </button>
        ))}
      </div>

      {view === "tasks" && (
        tasks.length === 0 ? <SectionEmpty icon={ClipboardList} message="No maintenance tasks scheduled yet." /> : (
          <div className="space-y-2">
            {tasks.map((t) => {
              const d = daysUntil(t.next_due_date);
              return (
                <SectionCard key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.title}</span>
                      <StatusBadge label={t.status} tone={TASK_TONE[t.status] ?? "slate"} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {equipName(t.equipment_id) ? `${equipName(t.equipment_id)} · ` : ""}{interval(t) ?? ""}
                      {t.assigned_to ? ` · ${t.assigned_to}` : ""}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    {t.next_due_hours != null ? (
                      <span className="text-muted-foreground">Due at {t.next_due_hours} h</span>
                    ) : t.next_due_date ? (
                      <span className={cn(d != null && d < 0 ? "text-red-400" : d != null && d <= 14 ? "text-amber-400" : "text-muted-foreground")}>
                        Due {fmtDate(t.next_due_date)}{d != null ? (d < 0 ? ` · ${Math.abs(d)}d overdue` : ` · in ${d}d`) : ""}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </div>
                </SectionCard>
              );
            })}
          </div>
        )
      )}

      {view === "equipment" && (
        equipment.length === 0 ? <SectionEmpty icon={Wrench} message="No equipment on the register yet." /> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {equipment.map((e) => (
              <SectionCard key={e.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{e.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{[e.maker, e.model].filter(Boolean).join(" ") || e.category || "—"}</div>
                  </div>
                  {e.running_hours != null && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Gauge className="h-3.5 w-3.5" /> {e.running_hours} h</span>
                  )}
                </div>
                {e.location && <div className="mt-2 text-[11px] text-muted-foreground/80">{e.location}</div>}
              </SectionCard>
            ))}
          </div>
        )
      )}
    </div>
  );
}
