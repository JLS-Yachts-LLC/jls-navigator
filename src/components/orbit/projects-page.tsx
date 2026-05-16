import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Orbit, Plus, Pencil, Trash2, Loader2, Ship, CalendarDays,
  ChevronRight, CheckSquare, Clock, AlertTriangle, Circle,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProjectStatus = "active" | "on_hold" | "completed" | "cancelled";
type Priority = "low" | "medium" | "high" | "urgent";

type Yacht = { id: string; vessel_name: string };

type Project = {
  id: string;
  name: string;
  description: string | null;
  yacht_id: string | null;
  status: ProjectStatus;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  yacht?: { vessel_name: string } | null;
  task_counts?: { todo: number; in_progress: number; review: number; done: number };
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Active", on_hold: "On Hold", completed: "Completed", cancelled: "Cancelled",
};
const STATUS_COLOR: Record<ProjectStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  on_hold: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  completed: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};
const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low", medium: "Medium", high: "High", urgent: "Urgent",
};
const PRIORITY_COLOR: Record<Priority, string> = {
  low: "text-slate-400",
  medium: "text-blue-400",
  high: "text-amber-400",
  urgent: "text-red-400",
};

const EMPTY_FORM = {
  name: "",
  description: "",
  yacht_id: "__none",
  status: "active" as ProjectStatus,
  priority: "medium" as Priority,
  start_date: "",
  due_date: "",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isOverdue(due: string | null, status: ProjectStatus) {
  if (!due || status === "completed" || status === "cancelled") return false;
  return new Date(due) < new Date();
}

// ─── Badges ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLOR[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function PriorityIcon({ priority }: { priority: Priority }) {
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${PRIORITY_COLOR[priority]}`}>
      <AlertTriangle className="h-3 w-3" />{PRIORITY_LABEL[priority]}
    </span>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project, onEdit, onDelete,
}: {
  project: Project;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
}) {
  const navigate = useNavigate();
  const counts = project.task_counts ?? { todo: 0, in_progress: 0, review: 0, done: 0 };
  const total = counts.todo + counts.in_progress + counts.review + counts.done;
  const pct = total > 0 ? Math.round((counts.done / total) * 100) : 0;
  const overdue = isOverdue(project.due_date, project.status);

  return (
    <div
      className="group relative rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-md transition-all cursor-pointer flex flex-col"
      onClick={() => navigate({ to: "/orbit/$projectId", params: { projectId: project.id } })}
    >
      {/* Card body */}
      <div className="p-5 flex-1">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm leading-snug truncate">{project.name}</h3>
            {project.yacht && (
              <div className="flex items-center gap-1 mt-0.5">
                <Ship className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground truncate">{project.yacht.vessel_name}</span>
              </div>
            )}
          </div>
          <StatusBadge status={project.status} />
        </div>

        {project.description && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3">
            {project.description}
          </p>
        )}

        <PriorityIcon priority={project.priority} />

        {/* Task progress */}
        {total > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{counts.done} of {total} tasks done</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex gap-2 text-[10px] text-muted-foreground">
              {counts.todo > 0 && <span className="flex items-center gap-0.5"><Circle className="h-2.5 w-2.5" />{counts.todo} to do</span>}
              {counts.in_progress > 0 && <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5 text-amber-400" />{counts.in_progress} in progress</span>}
              {counts.review > 0 && <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5 text-blue-400" />{counts.review} review</span>}
              {counts.done > 0 && <span className="flex items-center gap-0.5"><CheckSquare className="h-2.5 w-2.5 text-emerald-400" />{counts.done} done</span>}
            </div>
          </div>
        )}
        {total === 0 && (
          <p className="mt-3 text-[10px] text-muted-foreground italic">No tasks yet</p>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-5 py-3 flex items-center justify-between">
        {project.due_date ? (
          <div className={`flex items-center gap-1 text-xs ${overdue ? "text-red-400" : "text-muted-foreground"}`}>
            <CalendarDays className="h-3 w-3" />
            {overdue ? "Overdue · " : ""}{fmtDate(project.due_date)}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No due date</span>
        )}

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={e => { e.stopPropagation(); onEdit(project); }}
            className="rounded p-1 hover:bg-muted transition"
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(project); }}
            className="rounded p-1 hover:bg-destructive/10 transition"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive/70" />
          </button>
          <ChevronRight className="h-4 w-4 text-muted-foreground ml-1" />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | ProjectStatus>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [projRes, yachtRes] = await Promise.all([
      (supabase as any)
        .from("orbit_projects")
        .select("*, yacht:yachts(vessel_name)")
        .order("created_at", { ascending: false }),
      (supabase as any)
        .from("yachts")
        .select("id, vessel_name")
        .order("vessel_name"),
    ]);
    if (projRes.error) { toast.error(projRes.error.message); setLoading(false); return; }
    if (!yachtRes.error) setYachts(yachtRes.data as Yacht[]);

    // Load task counts per project
    const projects: Project[] = projRes.data as Project[];
    const ids = projects.map((p: Project) => p.id);
    if (ids.length > 0) {
      const { data: tasks } = await (supabase as any)
        .from("orbit_tasks")
        .select("project_id, status")
        .in("project_id", ids);

      if (tasks) {
        const countMap: Record<string, Project["task_counts"]> = {};
        for (const t of tasks as { project_id: string; status: string }[]) {
          if (!countMap[t.project_id]) countMap[t.project_id] = { todo: 0, in_progress: 0, review: 0, done: 0 };
          const c = countMap[t.project_id]!;
          if (t.status === "todo") c.todo++;
          else if (t.status === "in_progress") c.in_progress++;
          else if (t.status === "review") c.review++;
          else if (t.status === "done") c.done++;
        }
        for (const p of projects) p.task_counts = countMap[p.id] ?? { todo: 0, in_progress: 0, review: 0, done: 0 };
      }
    }
    setProjects(projects);
    setLoading(false);
  }

  const filtered = useMemo(
    () => statusFilter === "all" ? projects : projects.filter(p => p.status === statusFilter),
    [projects, statusFilter],
  );

  function openNew() { setEditing(null); setForm(EMPTY_FORM); setOpen(true); }
  function openEdit(p: Project) {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? "",
      yacht_id: p.yacht_id ?? "__none",
      status: p.status,
      priority: p.priority,
      start_date: p.start_date ?? "",
      due_date: p.due_date ?? "",
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Project name is required"); return; }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description || null,
        yacht_id: form.yacht_id === "__none" ? null : form.yacht_id,
        status: form.status,
        priority: form.priority,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await (supabase as any).from("orbit_projects").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Project updated");
      } else {
        const { error } = await (supabase as any).from("orbit_projects").insert([payload]);
        if (error) throw error;
        toast.success("Project created");
      }
      setOpen(false);
      await loadAll();
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  async function handleDelete(p: Project) {
    if (!confirm(`Delete "${p.name}"? This will also delete all tasks.`)) return;
    const { error } = await (supabase as any).from("orbit_projects").delete().eq("id", p.id);
    if (error) toast.error(error.message);
    else { toast.success("Project deleted"); await loadAll(); }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-card/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <Orbit className="h-5 w-5 text-primary" />
          <h1 className="font-display text-xl font-semibold">Orbit</h1>
          <div className="flex items-center gap-1 ml-2">
            {(["all", "active", "on_hold", "completed", "cancelled"] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${statusFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {f === "all" ? "All" : STATUS_LABEL[f as ProjectStatus]}
              </button>
            ))}
          </div>
        </div>
        <Button onClick={openNew} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Orbit className="h-10 w-10 opacity-30" />
            <p className="text-sm">{statusFilter === "all" ? "No projects yet. Create your first project." : `No ${STATUS_LABEL[statusFilter as ProjectStatus].toLowerCase()} projects.`}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filtered.map(p => (
              <ProjectCard key={p.id} project={p} onEdit={openEdit} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      {/* New / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Project" : "New Project"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Project Name <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Refit — MV Horizon"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Client Yacht</Label>
              <Select value={form.yacht_id} onValueChange={v => setForm(f => ({ ...f, yacht_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select yacht…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— No client —</SelectItem>
                  {yachts.map(y => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief overview of the project scope…"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as ProjectStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["active", "on_hold", "completed", "cancelled"] as ProjectStatus[]).map(s => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as Priority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["low", "medium", "high", "urgent"] as Priority[]).map(p => (
                      <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-border mt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleSave} disabled={busy} className="gap-1.5">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save Changes" : "Create Project"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
