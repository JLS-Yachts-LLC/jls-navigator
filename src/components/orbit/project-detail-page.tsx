import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Route } from "@/routes/_app.orbit.$projectId";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft, Plus, Pencil, Trash2, Loader2, Ship, CalendarDays,
  AlertTriangle, CheckSquare, Circle, Clock, ChevronRight, Orbit,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProjectStatus = "active" | "on_hold" | "completed" | "cancelled";
type TaskStatus = "todo" | "in_progress" | "review" | "done";
type Priority = "low" | "medium" | "high" | "urgent";

type Project = {
  id: string;
  name: string;
  description: string | null;
  yacht_id: string | null;
  status: ProjectStatus;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  yacht?: { vessel_name: string } | null;
};

type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  assignee_id: string | null;
  due_date: string | null;
  sort_order: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TASK_COLS: { key: TaskStatus; label: string; color: string; icon: React.ReactNode }[] = [
  { key: "todo",        label: "To Do",       color: "border-slate-500/30 bg-slate-500/5",   icon: <Circle className="h-3.5 w-3.5 text-slate-400" /> },
  { key: "in_progress", label: "In Progress", color: "border-amber-500/30 bg-amber-500/5",   icon: <Clock className="h-3.5 w-3.5 text-amber-400" /> },
  { key: "review",      label: "Review",      color: "border-blue-500/30 bg-blue-500/5",     icon: <ChevronRight className="h-3.5 w-3.5 text-blue-400" /> },
  { key: "done",        label: "Done",        color: "border-emerald-500/30 bg-emerald-500/5", icon: <CheckSquare className="h-3.5 w-3.5 text-emerald-400" /> },
];

const PRIORITY_COLOR: Record<Priority, string> = {
  low: "border-slate-500/30 text-slate-400",
  medium: "border-blue-500/30 text-blue-400",
  high: "border-amber-500/30 text-amber-400",
  urgent: "border-red-500/30 text-red-400",
};
const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
const STATUS_LABEL: Record<ProjectStatus, string> = { active: "Active", on_hold: "On Hold", completed: "Completed", cancelled: "Cancelled" };
const STATUS_COLOR: Record<ProjectStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  on_hold: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  completed: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const EMPTY_TASK_FORM = { title: "", description: "", status: "todo" as TaskStatus, priority: "medium" as Priority, due_date: "" };
const EMPTY_PROJ_FORM = { name: "", description: "", status: "active" as ProjectStatus, priority: "medium" as Priority, start_date: "", due_date: "" };

// ─── Small helpers ────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function isOverdue(d: string | null) {
  if (!d) return false;
  return new Date(d) < new Date();
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const overdue = isOverdue(task.due_date);
  return (
    <div
      onClick={onClick}
      className="rounded-lg border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer p-3 space-y-2"
    >
      <p className="text-sm font-medium leading-snug">{task.title}</p>
      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${PRIORITY_COLOR[task.priority]}`}>
          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />{PRIORITY_LABEL[task.priority]}
        </span>
        {task.due_date && (
          <span className={`flex items-center gap-0.5 text-[10px] ${overdue ? "text-red-400" : "text-muted-foreground"}`}>
            <CalendarDays className="h-2.5 w-2.5" />{fmtDate(task.due_date)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({
  col, tasks, onAddTask, onTaskClick,
}: {
  col: typeof TASK_COLS[number];
  tasks: Task[];
  onAddTask: (status: TaskStatus) => void;
  onTaskClick: (task: Task) => void;
}) {
  return (
    <div className={`flex flex-col rounded-xl border ${col.color} min-w-[260px] w-full`}>
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-inherit">
        <div className="flex items-center gap-2">
          {col.icon}
          <span className="text-sm font-semibold">{col.label}</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(col.key)}
          className="rounded p-0.5 hover:bg-muted/60 transition"
          title={`Add task to ${col.label}`}
        >
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Tasks */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[120px] max-h-[calc(100vh-340px)]">
        {tasks.map(t => (
          <TaskCard key={t.id} task={t} onClick={() => onTaskClick(t)} />
        ))}
        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-16 text-xs text-muted-foreground opacity-60 select-none">
            Drop tasks here
          </div>
        )}
      </div>

      {/* Add button at bottom */}
      <button
        onClick={() => onAddTask(col.key)}
        className="flex items-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition rounded-b-xl border-t border-inherit"
      >
        <Plus className="h-3.5 w-3.5" /> Add task
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Task dialog
  const [taskOpen, setTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM);
  const [taskBusy, setTaskBusy] = useState(false);

  // Project edit dialog
  const [projOpen, setProjOpen] = useState(false);
  const [projForm, setProjForm] = useState(EMPTY_PROJ_FORM);
  const [projBusy, setProjBusy] = useState(false);

  useEffect(() => { void loadAll(); }, [projectId]);

  async function loadAll() {
    setLoading(true);
    const [projRes, tasksRes] = await Promise.all([
      (supabase as any).from("orbit_projects").select("*, yacht:yachts(vessel_name)").eq("id", projectId).maybeSingle(),
      fetchAllRows(() => (supabase as any).from("orbit_tasks").select("*").eq("project_id", projectId).order("sort_order").order("created_at")),
    ]);
    if (projRes.error || !projRes.data) {
      toast.error("Project not found");
      navigate({ to: "/orbit" });
      return;
    }
    setProject(projRes.data as Project);
    setTasks(tasksRes.data as Task[] ?? []);
    setLoading(false);
  }

  // ── Task handlers ──

  function openNewTask(status: TaskStatus) {
    setEditingTask(null);
    setTaskForm({ ...EMPTY_TASK_FORM, status });
    setTaskOpen(true);
  }

  function openEditTask(task: Task) {
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      priority: task.priority,
      due_date: task.due_date ?? "",
    });
    setTaskOpen(true);
  }

  async function handleSaveTask() {
    if (!taskForm.title.trim()) { toast.error("Task title is required"); return; }
    setTaskBusy(true);
    try {
      const payload = {
        title: taskForm.title.trim(),
        description: taskForm.description || null,
        status: taskForm.status,
        priority: taskForm.priority,
        due_date: taskForm.due_date || null,
        project_id: projectId,
        updated_at: new Date().toISOString(),
      };
      if (editingTask) {
        const { error } = await (supabase as any).from("orbit_tasks").update(payload).eq("id", editingTask.id);
        if (error) throw error;
        toast.success("Task updated");
      } else {
        const maxOrder = tasks.filter(t => t.status === taskForm.status).length;
        const { error } = await (supabase as any).from("orbit_tasks").insert([{ ...payload, sort_order: maxOrder }]);
        if (error) throw error;
        toast.success("Task created");
      }
      setTaskOpen(false);
      await loadAll();
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setTaskBusy(false); }
  }

  async function handleDeleteTask() {
    if (!editingTask) return;
    if (!confirm("Delete this task?")) return;
    const { error } = await (supabase as any).from("orbit_tasks").delete().eq("id", editingTask.id);
    if (error) toast.error(error.message);
    else { toast.success("Task deleted"); setTaskOpen(false); await loadAll(); }
  }

  async function handleMoveTask(task: Task, status: TaskStatus) {
    await (supabase as any).from("orbit_tasks").update({ status, updated_at: new Date().toISOString() }).eq("id", task.id);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status } : t));
  }

  // ── Project edit handlers ──

  function openEditProject() {
    if (!project) return;
    setProjForm({
      name: project.name,
      description: project.description ?? "",
      status: project.status,
      priority: project.priority,
      start_date: project.start_date ?? "",
      due_date: project.due_date ?? "",
    });
    setProjOpen(true);
  }

  async function handleSaveProject() {
    if (!projForm.name.trim()) { toast.error("Project name is required"); return; }
    setProjBusy(true);
    try {
      const { error } = await (supabase as any).from("orbit_projects").update({
        name: projForm.name.trim(),
        description: projForm.description || null,
        status: projForm.status,
        priority: projForm.priority,
        start_date: projForm.start_date || null,
        due_date: projForm.due_date || null,
        updated_at: new Date().toISOString(),
      }).eq("id", projectId);
      if (error) throw error;
      toast.success("Project updated");
      setProjOpen(false);
      await loadAll();
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setProjBusy(false); }
  }

  async function handleDeleteProject() {
    if (!project) return;
    if (!confirm(`Delete "${project.name}"? This will remove all tasks permanently.`)) return;
    const { error } = await (supabase as any).from("orbit_projects").delete().eq("id", projectId);
    if (error) toast.error(error.message);
    else { toast.success("Project deleted"); navigate({ to: "/orbit" }); }
  }

  // ── Derived ──

  const tasksByStatus = (status: TaskStatus) => tasks.filter(t => t.status === status);
  const total = tasks.length;
  const done = tasks.filter(t => t.status === "done").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/40 px-6 py-4 space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/orbit" })}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="h-4 w-4" /> Orbit
          </button>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm font-medium truncate">{project.name}</span>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-xl font-bold">{project.name}</h1>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLOR[project.status]}`}>
                {STATUS_LABEL[project.status]}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_COLOR[project.priority]}`}>
                <AlertTriangle className="h-2.5 w-2.5" />{PRIORITY_LABEL[project.priority]}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1.5 flex-wrap">
              {project.yacht && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Ship className="h-3.5 w-3.5" />
                  <span>{project.yacht.vessel_name}</span>
                </div>
              )}
              {project.due_date && (
                <div className={`flex items-center gap-1.5 text-sm ${isOverdue(project.due_date) && project.status !== "completed" ? "text-red-400" : "text-muted-foreground"}`}>
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span>Due {fmtDate(project.due_date)}</span>
                </div>
              )}
              {project.description && (
                <p className="text-sm text-muted-foreground">{project.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Progress pill */}
            {total > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
                <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{done}/{total} done</span>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={openEditProject} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDeleteProject} className="gap-1.5 text-destructive/70 hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" onClick={() => openNewTask("todo")} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Task
            </Button>
          </div>
        </div>
      </header>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 h-full" style={{ minWidth: `${TASK_COLS.length * 280}px` }}>
          {TASK_COLS.map(col => (
            <div key={col.key} className="flex-1">
              <KanbanColumn
                col={col}
                tasks={tasksByStatus(col.key)}
                onAddTask={openNewTask}
                onTaskClick={openEditTask}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Task Dialog */}
      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Edit Task" : "New Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input
                value={taskForm.title}
                onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Describe the task…"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={taskForm.description}
                onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Any additional details…"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={taskForm.status} onValueChange={v => setTaskForm(f => ({ ...f, status: v as TaskStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_COLS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={taskForm.priority} onValueChange={v => setTaskForm(f => ({ ...f, priority: v as Priority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["low", "medium", "high", "urgent"] as Priority[]).map(p => (
                      <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={taskForm.due_date}
                  onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))}
                />
              </div>
            </div>

            {/* Quick move buttons when editing */}
            {editingTask && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Quick move to</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {TASK_COLS.filter(c => c.key !== editingTask.status).map(c => (
                    <button
                      key={c.key}
                      onClick={() => { handleMoveTask(editingTask, c.key); setTaskOpen(false); }}
                      className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted transition"
                    >
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between pt-4 border-t border-border mt-2">
            <div>
              {editingTask && (
                <Button variant="ghost" size="sm" onClick={handleDeleteTask} className="text-destructive/70 hover:text-destructive gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setTaskOpen(false)} disabled={taskBusy}>Cancel</Button>
              <Button onClick={handleSaveTask} disabled={taskBusy} className="gap-1.5">
                {taskBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingTask ? "Save" : "Create Task"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Project Edit Dialog */}
      <Dialog open={projOpen} onOpenChange={setProjOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Project Name <span className="text-destructive">*</span></Label>
              <Input value={projForm.name} onChange={e => setProjForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={3} value={projForm.description} onChange={e => setProjForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={projForm.status} onValueChange={v => setProjForm(f => ({ ...f, status: v as ProjectStatus }))}>
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
                <Select value={projForm.priority} onValueChange={v => setProjForm(f => ({ ...f, priority: v as Priority }))}>
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
                <Input type="date" value={projForm.start_date} onChange={e => setProjForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={projForm.due_date} onChange={e => setProjForm(f => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-border mt-2">
            <Button variant="outline" onClick={() => setProjOpen(false)} disabled={projBusy}>Cancel</Button>
            <Button onClick={handleSaveProject} disabled={projBusy} className="gap-1.5">
              {projBusy && <Loader2 className="h-4 w-4 animate-spin" />} Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
