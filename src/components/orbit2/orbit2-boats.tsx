/**
 * Orbit 2 — Managed Boats.
 *
 * The specification names this module and defines three dashboard KPIs against
 * it — Managed Vessels, Active Planned Maintenance, Active Defects & Repairs —
 * but does not draw its screen. What is here is the smallest thing those figures
 * can honestly be counted from: the boats under management, and two registers
 * against each of them. It is built to be replaced once the screen is specified.
 *
 *   Left   the boats, with an at-a-glance count of what is open on each
 *   Right  the selected boat's Planned Maintenance and Defects & Repairs
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Ship, Trash2, Wrench, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ACTIVE_BOAT_STATUSES, BOAT_TASK_STATUSES } from "./orbit2-constants";
import type { Orbit2Boat, Orbit2BoatTask } from "./orbit2-data";
import { Field, inputCls, TeamPicker } from "./orbit2-fields";

const sb = supabase as any;

export function Orbit2Boats({
  boats, boatTasks, loading, reload,
}: {
  boats: Orbit2Boat[];
  boatTasks: Orbit2BoatTask[];
  loading: boolean;
  reload: () => Promise<void> | void;
}) {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingBoat, setAddingBoat] = useState(false);
  const [boatName, setBoatName] = useState("");
  const [boatClient, setBoatClient] = useState("");
  const [boatType, setBoatType] = useState("");

  const selected = boats.find((b) => b.id === selectedId) ?? null;

  // Open the first boat once there is one, so the right pane is never blank for
  // no reason.
  useEffect(() => {
    if (!selectedId && boats.length) setSelectedId(boats[0].id);
  }, [boats, selectedId]);

  const openCounts = useMemo(() => {
    const m = new Map<string, { maintenance: number; defect: number }>();
    for (const t of boatTasks) {
      if (!ACTIVE_BOAT_STATUSES.includes(t.status)) continue;
      const c = m.get(t.boat_id) ?? { maintenance: 0, defect: 0 };
      c[t.kind === "defect" ? "defect" : "maintenance"] += 1;
      m.set(t.boat_id, c);
    }
    return m;
  }, [boatTasks]);

  async function addBoat() {
    const name = boatName.trim();
    if (!name) { toast.error("The boat needs a name."); return; }
    const { data, error } = await sb.from("orbit2_boats").insert({
      name, client_name: boatClient.trim() || null, boat_type: boatType.trim() || null,
      created_by: user?.id ?? null,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    toast.success(`${name} added`);
    setBoatName(""); setBoatClient(""); setBoatType(""); setAddingBoat(false);
    await reload();
    setSelectedId(data.id);
  }

  async function removeBoat(b: Orbit2Boat) {
    if (!confirm(`Remove ${b.name}? Its maintenance and defect records go with it.`)) return;
    const { error } = await sb.from("orbit2_boats").delete().eq("id", b.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${b.name} removed`);
    if (selectedId === b.id) setSelectedId(null);
    await reload();
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(260px,340px)_1fr]">
      {/* ── The boats ── */}
      <div className="min-h-0 overflow-auto border-r border-border/50">
        <div className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-2.5">
          <span className="text-[15px] font-semibold">
            Managed boats {boats.length > 0 && <span className="text-muted-foreground">({boats.length})</span>}
          </span>
          <button onClick={() => setAddingBoat((v) => !v)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[15px] font-medium text-primary hover:bg-primary/10">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>

        {addingBoat && (
          <div className="space-y-2.5 border-b border-border/50 bg-muted/15 p-4">
            <Field label="Boat name">
              <input className={inputCls} value={boatName} onChange={(e) => setBoatName(e.target.value)} autoFocus />
            </Field>
            <Field label="Client">
              <input className={inputCls} value={boatClient} onChange={(e) => setBoatClient(e.target.value)} />
            </Field>
            <Field label="Type">
              <input className={inputCls} value={boatType} onChange={(e) => setBoatType(e.target.value)}
                placeholder="e.g. Tender, RIB, Limo" />
            </Field>
            <div className="flex justify-end gap-2">
              <button onClick={() => setAddingBoat(false)}
                className="rounded-md border border-border px-3 py-1.5 text-[15px] hover:bg-accent">Cancel</button>
              <button onClick={() => void addBoat()}
                className="rounded-md bg-primary px-3 py-1.5 text-[15px] font-medium text-primary-foreground hover:opacity-90">Add boat</button>
            </div>
          </div>
        )}

        {boats.length === 0 ? (
          <p className="px-4 py-8 text-center text-[15px] text-muted-foreground">
            No boats under management yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {boats.map((b) => {
              const c = openCounts.get(b.id) ?? { maintenance: 0, defect: 0 };
              return (
                <li key={b.id}>
                  <button onClick={() => setSelectedId(b.id)}
                    className={cn("flex w-full items-start gap-2.5 px-4 py-3 text-left transition",
                      selectedId === b.id ? "bg-primary/10" : "hover:bg-muted/30")}>
                    <Ship className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">{b.name}</span>
                      <span className="block truncate text-[14px] text-muted-foreground">
                        {[b.client_name, b.boat_type].filter(Boolean).join(" · ") || "—"}
                      </span>
                      {(c.maintenance > 0 || c.defect > 0) && (
                        <span className="mt-1 flex gap-2 text-[14px]">
                          {c.maintenance > 0 && <span className="text-amber-500">{c.maintenance} maintenance</span>}
                          {c.defect > 0 && <span className="text-orange-500">{c.defect} defect{c.defect === 1 ? "" : "s"}</span>}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── The selected boat's registers ── */}
      <div className="min-h-0 overflow-auto">
        {!selected ? (
          <div className="flex h-full items-center justify-center px-8 text-center text-[15px] text-muted-foreground">
            Add a boat to start logging maintenance and defects against it.
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-[22px] font-semibold tracking-tight">{selected.name}</h2>
                <p className="text-[14px] text-muted-foreground">
                  {[selected.client_name, selected.boat_type].filter(Boolean).join(" · ") || "No client or type recorded"}
                </p>
              </div>
              <button onClick={() => void removeBoat(selected)} title={`Remove ${selected.name}`}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <Register kind="maintenance" title="Planned Maintenance" icon={Wrench}
              boat={selected} tasks={boatTasks} reload={reload} />
            <Register kind="defect" title="Defects & Repairs" icon={TriangleAlert}
              boat={selected} tasks={boatTasks} reload={reload} />
          </div>
        )}
      </div>
    </div>
  );
}

/** One register — planned maintenance, or defects and repairs. */
function Register({
  kind, title, icon: Icon, boat, tasks, reload,
}: {
  kind: "maintenance" | "defect";
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  boat: Orbit2Boat;
  tasks: Orbit2BoatTask[];
  reload: () => Promise<void> | void;
}) {
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ title: string; date: string; time: string; team: string[] }>(
    { title: "", date: "", time: "", team: [] },
  );

  const rows = tasks.filter((t) => t.boat_id === boat.id && t.kind === kind);
  const open = rows.filter((t) => ACTIVE_BOAT_STATUSES.includes(t.status)).length;

  async function add() {
    if (!form.title.trim()) { toast.error("Give it a title."); return; }
    const { error } = await sb.from("orbit2_boat_tasks").insert({
      boat_id: boat.id, kind, title: form.title.trim(),
      schedule_date: form.date || null, schedule_time: form.time || null,
      assigned_team: form.team, created_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    setForm({ title: "", date: "", time: "", team: [] });
    setAdding(false);
    await reload();
  }

  async function update(t: Orbit2BoatTask, patch: Record<string, unknown>) {
    const { error } = await sb.from("orbit2_boat_tasks").update(patch).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    await reload();
  }

  async function remove(t: Orbit2BoatTask) {
    const { error } = await sb.from("orbit2_boat_tasks").delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    await reload();
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-[15px] font-semibold">{title}</span>
          {open > 0 && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[14px] font-medium text-primary">{open} active</span>
          )}
        </div>
        <button onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[15px] font-medium text-primary hover:bg-primary/10">
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {adding && (
        <div className="space-y-2.5 border-b border-border/50 bg-muted/15 p-4">
          <Field label={kind === "defect" ? "Defect" : "Task"}>
            <input className={inputCls} value={form.title} autoFocus
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </Field>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Scheduled date">
              <input className={inputCls} type="date" value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </Field>
            <Field label="Start time" hint="Needed for it to appear on the calendar">
              <input className={inputCls} type="time" value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
            </Field>
          </div>
          <Field label="Assign Team">
            <TeamPicker value={form.team} onChange={(v) => setForm((f) => ({ ...f, team: v }))} />
          </Field>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdding(false)}
              className="rounded-md border border-border px-3 py-1.5 text-[15px] hover:bg-accent">Cancel</button>
            <button onClick={() => void add()}
              className="rounded-md bg-primary px-3 py-1.5 text-[15px] font-medium text-primary-foreground hover:opacity-90">Add</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[15px] text-muted-foreground">Nothing logged.</p>
      ) : (
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-border/60">
              {["Item", "Status", "Scheduled", "Team", ""].map((c) => (
                <th key={c} className="px-3 py-2 text-left font-semibold text-muted-foreground">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-muted/20">
                <td className="px-3 py-2">{t.title}</td>
                <td className="px-3 py-2">
                  <select className="rounded border border-border bg-background px-2 py-1 text-[14px]"
                    value={t.status} onChange={(e) => void update(t, { status: e.target.value })}>
                    {BOAT_TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {t.schedule_date
                    ? `${new Date(`${t.schedule_date}T00:00:00`).toLocaleDateString("en-GB")}${t.schedule_time ? ` ${t.schedule_time.slice(0, 5)}` : ""}`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{(t.assigned_team ?? []).join(", ") || "—"}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => void remove(t)} title="Delete"
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
