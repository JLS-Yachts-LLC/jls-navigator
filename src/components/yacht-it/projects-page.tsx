/**
 * Projects — Yacht IT Solutions.
 *
 * The same shape as the New Horizon-IT Service Desk's projects: a card per
 * project showing its vessel, status, task and ticket counts and due date, split
 * into Active and Completed. Opening one shows its detail — dates, owner, its
 * task list, and the Service Desk tickets raised against it.
 *
 * A project's vessel comes from either fleet register, matching the Service Desk:
 * `fleet:<id>` for a yacht in the main fleet, `it:<id>` for one in the IT registry.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FolderKanban, Plus, Loader2, ArrowLeft, Trash2, Check, Ticket as TicketIcon,
} from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;

type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled";
type TaskStatus = "todo" | "in_progress" | "blocked" | "done";

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  yacht_id: string | null;
  it_yacht_id: string | null;
  start_date: string | null;
  end_date: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  task_count?: number;
  ticket_count?: number;
};

type Task = {
  id: string; project_id: string; title: string; status: TaskStatus;
  due_date: string | null; assignee_id: string | null; sort_order: number;
};

type Yacht = { id: string; vessel_name: string };
type Person = { user_id: string; display_name: string | null };

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Planning", active: "Active", on_hold: "On hold",
  completed: "Completed", cancelled: "Cancelled",
};
const STATUS_TONE: Record<ProjectStatus, string> = {
  planning: "bg-muted text-muted-foreground border-border",
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  on_hold: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  completed: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};
const ACTIVE_STATUSES: ProjectStatus[] = ["planning", "active", "on_hold"];
const DONE_STATUSES: ProjectStatus[] = ["completed", "cancelled"];

const TASK_LABEL: Record<TaskStatus, string> = {
  todo: "To do", in_progress: "In progress", blocked: "Blocked", done: "Done",
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [itYachts, setItYachts] = useState<Yacht[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"active" | "completed">("active");
  const [openNew, setOpenNew] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, y, iy, pr] = await Promise.all([
      db.from("it_projects").select("*").order("updated_at", { ascending: false }),
      db.from("yachts").select("id, vessel_name").order("vessel_name"),
      db.from("it_yachts").select("id, name").order("name"),
      db.from("user_profiles").select("user_id, display_name").eq("active", true).order("display_name"),
    ]);

    const rows = (p.data ?? []) as Project[];
    const ids = rows.map((r) => r.id);
    const taskCount: Record<string, number> = {};
    const ticketCount: Record<string, number> = {};
    if (ids.length) {
      const [t, k] = await Promise.all([
        db.from("it_project_tasks").select("project_id").in("project_id", ids),
        db.from("it_tickets").select("project_id").in("project_id", ids),
      ]);
      for (const r of (t.data ?? []) as { project_id: string }[]) taskCount[r.project_id] = (taskCount[r.project_id] ?? 0) + 1;
      for (const r of (k.data ?? []) as { project_id: string }[]) ticketCount[r.project_id] = (ticketCount[r.project_id] ?? 0) + 1;
    }

    setProjects(rows.map((r) => ({ ...r, task_count: taskCount[r.id] ?? 0, ticket_count: ticketCount[r.id] ?? 0 })));
    setYachts((y.data ?? []) as Yacht[]);
    setItYachts(((iy.data ?? []) as any[]).map((r) => ({ id: r.id, vessel_name: r.name })));
    setPeople((pr.data ?? []) as Person[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** A project's vessel comes from whichever register holds it. */
  const vesselName = useCallback((p: Project) =>
    p.yacht_id ? (yachts.find((y) => y.id === p.yacht_id)?.vessel_name ?? "—")
    : p.it_yacht_id ? (itYachts.find((y) => y.id === p.it_yacht_id)?.vessel_name ?? "—")
    : "—", [yachts, itYachts]);

  const personName = useCallback((id: string | null) =>
    id ? (people.find((p) => p.user_id === id)?.display_name ?? "—") : "—", [people]);

  const visible = useMemo(() => {
    const wanted = view === "completed" ? DONE_STATUSES : ACTIVE_STATUSES;
    return projects.filter((p) => wanted.includes(p.status));
  }, [projects, view]);

  const open = openId ? projects.find((p) => p.id === openId) ?? null : null;
  if (open) {
    return (
      <ProjectDetail
        project={open}
        vessel={vesselName(open)}
        people={people}
        personName={personName}
        onBack={() => setOpenId(null)}
        onChanged={load}
      />
    );
  }

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
            Yacht IT Solutions
          </div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight">
            {view === "completed" ? "Completed Projects" : "Active Projects"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
            {(["active", "completed"] as const).map((v) => (
              <button
                key={v} onClick={() => setView(v)}
                className={cn("rounded-md px-3 py-1.5 font-medium capitalize transition",
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {v}
              </button>
            ))}
          </div>
          <Button size="sm" className="h-9 gap-1.5" onClick={() => setOpenNew(true)}>
            <Plus className="h-3.5 w-3.5" /> New project
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <FolderKanban className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <div className="text-sm font-semibold">
            {view === "completed" ? "No completed projects yet" : "No active projects yet"}
          </div>
          {view === "active" && (
            <p className="mt-1 text-xs text-muted-foreground">
              Group related work — a refit, a rollout, an onboarding — and the tickets raised against it.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <button
              key={p.id} onClick={() => setOpenId(p.id)}
              className="rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground">
                  <FolderKanban className="h-4 w-4" />
                </div>
                <span className={cn("rounded border px-1.5 py-0.5 text-[10px]", STATUS_TONE[p.status])}>
                  {STATUS_LABEL[p.status]}
                </span>
              </div>
              <div className="mt-3">
                <div className="text-[11px] text-muted-foreground">{vesselName(p)}</div>
                <div className="truncate text-sm font-semibold tracking-tight">{p.name}</div>
                {p.description && (
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>{p.task_count} task{p.task_count === 1 ? "" : "s"}</span>
                <span>·</span>
                <span>{p.ticket_count} ticket{p.ticket_count === 1 ? "" : "s"}</span>
                {p.end_date && (<><span>·</span><span>Due {fmtDate(p.end_date)}</span></>)}
                {p.owner_id && (<><span>·</span><span className="truncate">{personName(p.owner_id)}</span></>)}
              </div>
            </button>
          ))}
        </div>
      )}

      {openNew && (
        <NewProjectDialog
          yachts={yachts} itYachts={itYachts} people={people} userId={user?.id}
          onClose={() => setOpenNew(false)}
          onCreated={async (id) => { setOpenNew(false); await load(); setOpenId(id); }}
        />
      )}
    </div>
  );
}

// ── New project ───────────────────────────────────────────────────────────────

function NewProjectDialog({ yachts, itYachts, people, userId, onClose, onCreated }: {
  yachts: Yacht[]; itYachts: Yacht[]; people: Person[]; userId: string | undefined;
  onClose: () => void; onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vessel, setVessel] = useState("__none");
  const [owner, setOwner] = useState("__none");
  const [status, setStatus] = useState<ProjectStatus>("planning");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error("Give the project a name"); return; }
    setBusy(true);
    try {
      const { data, error } = await db.from("it_projects").insert([{
        name: name.trim(),
        description: description.trim() || null,
        status,
        yacht_id: vessel.startsWith("fleet:") ? vessel.slice(6) : null,
        it_yacht_id: vessel.startsWith("it:") ? vessel.slice(3) : null,
        start_date: start || null,
        end_date: end || null,
        owner_id: owner === "__none" ? null : owner,
        created_by: userId ?? null,
      }]).select("id").single();
      if (error) throw new Error(error.message);
      toast.success("Project created");
      onCreated((data as { id: string }).id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bridge network refit" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vessel</Label>
              <Select value={vessel} onValueChange={setVessel}>
                <SelectTrigger><SelectValue placeholder="Select vessel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {yachts.map((y) => <SelectItem key={`f${y.id}`} value={`fleet:${y.id}`}>{y.vessel_name}</SelectItem>)}
                  {itYachts.map((y) => <SelectItem key={`i${y.id}`} value={`it:${y.id}`}>{y.vessel_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Owner</Label>
              <Select value={owner} onValueChange={setOwner}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Unassigned —</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.display_name ?? "—"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Detail ────────────────────────────────────────────────────────────────────

type LinkedTicket = { id: string; ticket_no: string; subject: string; status: string; priority: string };

function ProjectDetail({ project, vessel, people, personName, onBack, onChanged }: {
  project: Project; vessel: string; people: Person[];
  personName: (id: string | null) => string;
  onBack: () => void; onChanged: () => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tickets, setTickets] = useState<LinkedTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTask, setNewTask] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [t, k] = await Promise.all([
      db.from("it_project_tasks").select("*").eq("project_id", project.id)
        .order("sort_order").order("created_at"),
      db.from("it_tickets").select("id, ticket_no, subject, status, priority")
        .eq("project_id", project.id).order("created_at", { ascending: false }),
    ]);
    setTasks((t.data ?? []) as Task[]);
    setTickets((k.data ?? []) as LinkedTicket[]);
    setLoading(false);
  }, [project.id]);

  useEffect(() => { void load(); }, [load]);

  async function patchProject(patch: Record<string, any>) {
    const { error } = await db.from("it_projects")
      .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", project.id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  }

  async function addTask() {
    const title = newTask.trim();
    if (!title) return;
    setBusy(true);
    const { error } = await db.from("it_project_tasks").insert([{
      project_id: project.id, title, sort_order: tasks.length,
    }]);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setNewTask("");
    await load();
    onChanged();
  }

  async function toggleTask(t: Task) {
    const next: TaskStatus = t.status === "done" ? "todo" : "done";
    const { error } = await db.from("it_project_tasks")
      .update({ status: next, updated_at: new Date().toISOString() }).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    await load();
  }

  async function removeTask(t: Task) {
    const { error } = await db.from("it_project_tasks").delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    await load();
    onChanged();
  }

  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="p-5">
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> All projects
      </button>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground">{vessel}</div>
            <h1 className="font-display text-xl font-bold tracking-tight">{project.name}</h1>
            {project.description && (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{project.description}</p>
            )}
          </div>
          <Select value={project.status} onValueChange={(v) => void patchProject({ status: v })}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div><dt className="text-[11px] text-muted-foreground">Start</dt><dd>{fmtDate(project.start_date)}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">Due</dt><dd>{fmtDate(project.end_date)}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">Owner</dt><dd>{personName(project.owner_id)}</dd></div>
          <div><dt className="text-[11px] text-muted-foreground">Tasks</dt><dd>{done}/{tasks.length} done</dd></div>
        </dl>
      </div>

      {loading ? (
        <div className="grid place-items-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Tasks</h2>
            <div className="flex gap-2">
              <Input
                value={newTask} onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void addTask(); }}
                placeholder="Add a task and press Enter" className="h-8 text-xs"
              />
              <Button size="sm" className="h-8" onClick={() => void addTask()} disabled={busy || !newTask.trim()}>
                Add
              </Button>
            </div>
            {tasks.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">No tasks yet.</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5">
                    <button
                      onClick={() => void toggleTask(t)} title={TASK_LABEL[t.status]}
                      className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border",
                        t.status === "done" ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" : "border-border")}
                    >
                      {t.status === "done" && <Check className="h-3 w-3" />}
                    </button>
                    <span className={cn("min-w-0 flex-1 truncate text-xs",
                      t.status === "done" && "text-muted-foreground line-through")}>
                      {t.title}
                    </span>
                    {t.due_date && <span className="shrink-0 text-[10.5px] text-muted-foreground">{fmtDate(t.due_date)}</span>}
                    <button onClick={() => void removeTask(t)} title="Remove task"
                      className="shrink-0 text-muted-foreground transition hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Service Desk tickets</h2>
            {tickets.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No tickets are linked to this project yet. Set a ticket's project on the Service Desk tab.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {tickets.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5">
                    <TicketIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="shrink-0 font-mono text-[11px] text-primary">{t.ticket_no}</span>
                    <span className="min-w-0 flex-1 truncate text-xs">{t.subject}</span>
                    <span className="shrink-0 text-[10.5px] capitalize text-muted-foreground">{t.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default ProjectsPage;
