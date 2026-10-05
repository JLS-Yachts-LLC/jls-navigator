/**
 * Jobs & maintenance (On board) — planned-maintenance jobs and the equipment
 * register. Reads `pms_tasks` / `pms_equipment` through RLS (vessel-scoped);
 * writes go through /api/portal/onboard. A job's status is worked out live from
 * its next due date or running hours (lib/portal/onboard), not the stored column.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CheckCircle2, ClipboardList, Gauge, Loader2, Pencil, Wrench } from "lucide-react";
import { pmsStatus } from "@/lib/portal/onboard";
import {
  AddButton, RecordFormModal, SectionCard, SectionEmpty, SectionHeader, SectionLoading, StatusBadge,
  daysUntil, fmtDate, onboardRequest, type FormField,
} from "./section-ui";

const db = supabase as any;

type PmsTask = {
  id: string; equipment_id: string | null; title: string; description: string | null;
  interval_kind: string | null; interval_value: number | null; interval_unit: string | null;
  last_done_date: string | null; last_done_hours: number | null;
  next_due_date: string | null; next_due_hours: number | null; status: string; assigned_to: string | null; notes: string | null;
};
type PmsEquipment = {
  id: string; name: string; category: string | null; maker: string | null; model: string | null;
  serial_number: string | null; location: string | null; running_hours: number | null; notes: string | null;
};

const TASK_TONE: Record<string, "green" | "amber" | "red" | "sky" | "slate"> = {
  done: "green", upcoming: "sky", due: "amber", overdue: "red",
};
const TASK_LABEL: Record<string, string> = { done: "done", upcoming: "upcoming", due: "due soon", overdue: "overdue" };
const ORDER: Record<string, number> = { overdue: 0, due: 1, upcoming: 2, done: 3 };

const UNIT_OPTIONS = ["days", "weeks", "months", "years"].map((u) => ({ value: u, label: u }));

function taskFields(equipment: PmsEquipment[]): FormField[] {
  return [
    { key: "title", label: "Job", required: true, wide: true, placeholder: "e.g. Generator 2 — oil & filter change" },
    { key: "equipment_id", label: "Equipment", type: "select", wide: true,
      options: equipment.map((e) => ({ value: e.id, label: e.name })) },
    { key: "interval_kind", label: "Repeats by", type: "select", required: true,
      options: [{ value: "calendar", label: "Calendar" }, { value: "hours", label: "Running hours" }] },
    { key: "interval_value", label: "Every", type: "number", placeholder: "e.g. 6" },
    { key: "interval_unit", label: "Unit", type: "select", options: UNIT_OPTIONS, when: (f) => f.interval_kind !== "hours" },
    { key: "next_due_date", label: "Next due", type: "date", when: (f) => f.interval_kind !== "hours" },
    { key: "next_due_hours", label: "Next due at (hours)", type: "number", when: (f) => f.interval_kind === "hours" },
    { key: "assigned_to", label: "Assigned to", placeholder: "e.g. Chief Engineer" },
    { key: "description", label: "What's involved", type: "textarea" },
  ];
}

const EQUIPMENT_FIELDS: FormField[] = [
  { key: "name", label: "Name", required: true, wide: true, placeholder: "e.g. Generator 2" },
  { key: "category", label: "Category", placeholder: "e.g. Engine room" },
  { key: "location", label: "Location", placeholder: "e.g. Engine room, port side" },
  { key: "maker", label: "Maker", placeholder: "e.g. Kohler" },
  { key: "model", label: "Model" },
  { key: "serial_number", label: "Serial number" },
  { key: "running_hours", label: "Running hours", type: "number" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export function PmsSection({ yachtId, canEdit }: { yachtId: string; canEdit: boolean }) {
  const [tasks, setTasks] = useState<PmsTask[]>([]);
  const [equipment, setEquipment] = useState<PmsEquipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"jobs" | "equipment">("jobs");
  const [editingTask, setEditingTask] = useState<PmsTask | "new" | null>(null);
  const [editingEquip, setEditingEquip] = useState<PmsEquipment | "new" | null>(null);
  const [completing, setCompleting] = useState<PmsTask | null>(null);

  const load = useCallback(async () => {
    const [t, e]: any[] = await Promise.all([
      db.from("pms_tasks")
        .select("id, equipment_id, title, description, interval_kind, interval_value, interval_unit, last_done_date, last_done_hours, next_due_date, next_due_hours, status, assigned_to, notes")
        .eq("yacht_id", yachtId),
      db.from("pms_equipment")
        .select("id, name, category, maker, model, serial_number, location, running_hours, notes")
        .eq("yacht_id", yachtId).order("name"),
    ]);
    setTasks(t.data ?? []); setEquipment(e.data ?? []); setLoading(false);
  }, [yachtId]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <SectionLoading />;

  const equipOf = (id: string | null) => equipment.find((e) => e.id === id);
  const statusOf = (t: PmsTask) => (t.status === "done" ? "done" : pmsStatus(t, equipOf(t.equipment_id)?.running_hours));
  const sorted = [...tasks].sort((a, b) =>
    ORDER[statusOf(a)] - ORDER[statusOf(b)] || (a.next_due_date ?? "9999").localeCompare(b.next_due_date ?? "9999"));
  const interval = (t: PmsTask) =>
    !t.interval_value ? "One-off"
      : t.interval_kind === "hours" ? `Every ${t.interval_value} h` : `Every ${t.interval_value} ${t.interval_unit ?? ""}`;

  const overdue = tasks.filter((t) => statusOf(t) === "overdue").length;
  const due = tasks.filter((t) => statusOf(t) === "due").length;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Jobs & maintenance"
        subtitle="Your vessel's planned maintenance and equipment register. Only your crew see this."
        action={canEdit && (view === "jobs"
          ? <AddButton onClick={() => setEditingTask("new")}>Add job</AddButton>
          : <AddButton onClick={() => setEditingEquip("new")}>Add equipment</AddButton>)}
      />

      {tasks.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <SectionCard className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Overdue</div><div className={cn("mt-1 text-lg font-bold", overdue ? "text-red-400" : "")}>{overdue}</div></SectionCard>
          <SectionCard className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Due soon</div><div className={cn("mt-1 text-lg font-bold", due ? "text-amber-400" : "")}>{due}</div></SectionCard>
          <SectionCard className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Jobs</div><div className="mt-1 text-lg font-bold">{tasks.length}</div></SectionCard>
        </div>
      )}

      <div className="inline-flex rounded-xl border border-border p-1 text-sm">
        {(["jobs", "equipment"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
                  className={cn("rounded-lg px-4 py-1.5 font-medium capitalize transition", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {v}{v === "equipment" && equipment.length ? ` (${equipment.length})` : ""}
          </button>
        ))}
      </div>

      {view === "jobs" && (
        sorted.length === 0 ? (
          <SectionEmpty icon={ClipboardList} message={canEdit
            ? "No jobs yet. Add your equipment first, then the jobs that keep it running — each one tells you when it's next due."
            : "No maintenance jobs scheduled yet."} />
        ) : (
          <div className="space-y-2">
            {sorted.map((t) => {
              const st = statusOf(t);
              const eq = equipOf(t.equipment_id);
              const d = daysUntil(t.next_due_date);
              return (
                <SectionCard key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.title}</span>
                      <StatusBadge label={TASK_LABEL[st] ?? st} tone={TASK_TONE[st] ?? "slate"} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {[eq?.name, interval(t), t.assigned_to].filter(Boolean).join(" · ")}
                      {t.last_done_date && ` · last done ${fmtDate(t.last_done_date)}`}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    {st === "done" ? <span className="text-muted-foreground">Completed</span>
                      : t.interval_kind === "hours" && t.next_due_hours != null ? (
                        <span className={cn(st === "overdue" ? "text-red-400" : st === "due" ? "text-amber-400" : "text-muted-foreground")}>
                          Due at {t.next_due_hours} h{eq?.running_hours != null ? ` · now ${eq.running_hours} h` : ""}
                        </span>
                      ) : t.next_due_date ? (
                        <span className={cn(st === "overdue" ? "text-red-400" : st === "due" ? "text-amber-400" : "text-muted-foreground")}>
                          Due {fmtDate(t.next_due_date)}{d != null ? (d < 0 ? ` · ${Math.abs(d)}d overdue` : d === 0 ? " · today" : ` · in ${d}d`) : ""}
                        </span>
                      ) : <span className="text-muted-foreground">No due date</span>}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      {st !== "done" && (
                        <button type="button" onClick={() => setCompleting(t)}
                                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-medium text-muted-foreground transition hover:border-emerald-500/40 hover:text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Done
                        </button>
                      )}
                      <button type="button" onClick={() => setEditingTask(t)} aria-label={`Edit ${t.title}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background/60 hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </SectionCard>
              );
            })}
          </div>
        )
      )}

      {view === "equipment" && (
        equipment.length === 0 ? <SectionEmpty icon={Wrench} message={canEdit ? "No equipment yet — add the machinery you want to track." : "No equipment on the register yet."} /> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {equipment.map((e) => {
              const jobs = tasks.filter((t) => t.equipment_id === e.id);
              const late = jobs.filter((t) => statusOf(t) === "overdue").length;
              return (
                <SectionCard key={e.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold">{e.name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{[e.maker, e.model].filter(Boolean).join(" ") || e.category || "—"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {e.running_hours != null && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Gauge className="h-3.5 w-3.5" /> {e.running_hours} h</span>
                      )}
                      {canEdit && (
                        <button type="button" onClick={() => setEditingEquip(e)} aria-label={`Edit ${e.name}`}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background/60 hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground/80">
                    {e.location && <span>{e.location}</span>}
                    <span>{jobs.length} job{jobs.length === 1 ? "" : "s"}</span>
                    {late > 0 && <span className="text-red-400">{late} overdue</span>}
                  </div>
                </SectionCard>
              );
            })}
          </div>
        )
      )}

      {editingTask && (
        <RecordFormModal
          title={editingTask === "new" ? "Add job" : `Edit ${editingTask.title}`}
          kind="pms_task" fields={taskFields(equipment)}
          initial={editingTask === "new" ? { interval_kind: "calendar", interval_unit: "months" } as any : editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={() => { setEditingTask(null); void load(); }}
          onDelete={editingTask === "new" ? undefined : async () => {
            await onboardRequest("pms_task", { method: "DELETE", id: (editingTask as PmsTask).id });
            setEditingTask(null); void load();
          }}
          deleteLabel="Delete job"
        />
      )}
      {editingEquip && (
        <RecordFormModal
          title={editingEquip === "new" ? "Add equipment" : `Edit ${editingEquip.name}`}
          kind="pms_equipment" fields={EQUIPMENT_FIELDS}
          initial={editingEquip === "new" ? null : editingEquip}
          onClose={() => setEditingEquip(null)}
          onSaved={() => { setEditingEquip(null); void load(); }}
          onDelete={editingEquip === "new" ? undefined : async () => {
            await onboardRequest("pms_equipment", { method: "DELETE", id: (editingEquip as PmsEquipment).id });
            setEditingEquip(null); void load();
          }}
          deleteLabel="Delete equipment"
        />
      )}
      {completing && (
        <MarkDoneModal task={completing} equipment={equipOf(completing.equipment_id)}
                       onClose={() => setCompleting(null)} onDone={() => { setCompleting(null); void load(); }} />
      )}
    </div>
  );
}

/** Record a job as done; hour-based jobs ask for the meter reading. */
function MarkDoneModal({ task, equipment, onClose, onDone }: {
  task: PmsTask; equipment: PmsEquipment | undefined; onClose: () => void; onDone: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState(equipment?.running_hours != null ? String(equipment.running_hours) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byHours = task.interval_kind === "hours";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await onboardRequest("pms_task", { method: "POST", id: task.id, action: "done", body: JSON.stringify({ date, hours: hours || null }) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <h2 className="text-lg font-bold">Mark done</h2>
        <p className="mt-1 text-sm text-muted-foreground">{task.title}{equipment ? ` · ${equipment.name}` : ""}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="done-date" className="mb-1.5 block text-xs font-medium text-muted-foreground">Done on</label>
            <input id="done-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)}
                   className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="done-hours" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Running hours{byHours && <span className="text-primary"> *</span>}
            </label>
            <input id="done-hours" type="number" min={0} step="any" required={byHours} value={hours} onChange={(e) => setHours(e.target.value)}
                   className="w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {task.interval_value ? "The next due point moves on by the job's interval." : "A one-off job stays marked as done."}
          {equipment && " A higher meter reading also updates the equipment's running hours."}
        </p>
        {error && <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-border px-5 text-sm font-medium text-muted-foreground hover:text-foreground">Cancel</button>
          <button type="submit" disabled={busy || (byHours && !hours)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Mark done
          </button>
        </div>
      </form>
    </div>
  );
}
