/**
 * App Developer — a task board for Polaris development work, copied from the
 * New Horizon-IT service desk's App Development module (same columns, same
 * task types), pared down to the essentials: create a task, assign it to a
 * team member, drag it across the board as it progresses.
 *
 * Native HTML5 drag-and-drop (no dnd-kit in this project); assignees come from
 * user_profiles so the list matches Manage Users.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Calendar, User, Loader2, X, Trash2, Pencil, ListTodo,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Types & constants (mirroring the New Horizon-IT module) ────────────────────

type TaskStatus = "on_hold" | "pending_scheduling" | "scheduled" | "in_progress" | "complete";
type TaskType = "fix" | "feat" | "refactor" | "docs" | "chore" | "new_build";

type Task = {
  id: string;
  number: number;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  assignee_user_id: string | null;
  scheduled_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type Staff = { userId: string; label: string };

const STATUSES: { key: TaskStatus; label: string; color: string; bg: string }[] = [
  { key: "on_hold",            label: "On Hold",            color: "text-muted-foreground", bg: "bg-muted/60" },
  { key: "pending_scheduling", label: "Pending Scheduling", color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { key: "scheduled",          label: "Scheduled",          color: "text-blue-400",   bg: "bg-blue-500/10" },
  { key: "in_progress",        label: "In Progress",        color: "text-green-400",  bg: "bg-green-500/10" },
  { key: "complete",           label: "Complete",           color: "text-emerald-400", bg: "bg-emerald-500/10" },
];

const TYPES: { key: TaskType; label: string; color: string }[] = [
  { key: "fix",       label: "Fix",       color: "bg-red-500/15 text-red-400" },
  { key: "feat",      label: "Feat",      color: "bg-green-500/15 text-green-400" },
  { key: "refactor",  label: "Refactor",  color: "bg-blue-500/15 text-blue-400" },
  { key: "docs",      label: "Docs",      color: "bg-yellow-500/15 text-yellow-400" },
  { key: "chore",     label: "Chore",     color: "bg-muted text-muted-foreground" },
  { key: "new_build", label: "New Build", color: "bg-violet-500/15 text-violet-400" },
];

const typeMeta = (t: TaskType) => TYPES.find((x) => x.key === t) ?? TYPES[1];
const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

function TypeBadge({ type }: { type: TaskType }) {
  const m = typeMeta(type);
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${m.color}`}>{m.label}</span>;
}

// ── Task editor (create + edit share one panel) ────────────────────────────────

type Draft = {
  title: string; description: string; type: TaskType; status: TaskStatus;
  assignee_user_id: string; scheduled_date: string;
};
const emptyDraft: Draft = {
  title: "", description: "", type: "feat", status: "pending_scheduling",
  assignee_user_id: "", scheduled_date: "",
};

function TaskEditor({
  initial, staff, saving, onSave, onCancel, onDelete,
}: {
  initial: Draft;
  staff: Staff[];
  saving: boolean;
  onSave: (d: Draft) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const inputCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground">Title</label>
        <Input value={d.title} autoFocus placeholder="What needs doing?"
          onChange={(e) => set("title", e.target.value)} />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Description</label>
        <textarea value={d.description} rows={3}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Type</label>
          <select value={d.type} className={inputCls} onChange={(e) => set("type", e.target.value as TaskType)}>
            {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Status</label>
          <select value={d.status} className={inputCls} onChange={(e) => set("status", e.target.value as TaskStatus)}>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Assignee</label>
          <select value={d.assignee_user_id} className={inputCls} onChange={(e) => set("assignee_user_id", e.target.value)}>
            <option value="">Unassigned</option>
            {staff.map((s) => <option key={s.userId} value={s.userId}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Scheduled date</label>
          <input type="date" value={d.scheduled_date} className={inputCls}
            onChange={(e) => set("scheduled_date", e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" disabled={saving || !d.title.trim()} onClick={() => onSave(d)}>
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        {onDelete && (
          <Button size="sm" variant="outline" className="ml-auto text-red-400 border-red-500/40 hover:bg-red-500/10"
            onClick={onDelete}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function AppDeveloperPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);

  const staffName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of staff) m[s.userId] = s.label;
    return m;
  }, [staff]);

  const load = useCallback(async () => {
    const db = supabase as any;
    const [{ data: t }, { data: u }] = await Promise.all([
      db.from("app_dev_tasks").select("*").order("sort_order").order("created_at"),
      db.from("user_profiles").select("user_id, display_name, email, active").order("display_name"),
    ]);
    setTasks((t ?? []) as Task[]);
    setStaff(((u ?? []) as any[])
      .filter((x) => x.active !== false)
      .map((x) => ({ userId: x.user_id, label: x.display_name?.trim() || x.email || "Unnamed user" })));
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(
    () => tasks.filter((t) => assigneeFilter === "all"
      || (assigneeFilter === "unassigned" ? !t.assignee_user_id : t.assignee_user_id === assigneeFilter)),
    [tasks, assigneeFilter],
  );
  const grouped = useMemo(() => {
    const m: Record<TaskStatus, Task[]> = {
      on_hold: [], pending_scheduling: [], scheduled: [], in_progress: [], complete: [],
    };
    for (const t of visible) m[t.status].push(t);
    return m;
  }, [visible]);

  async function saveNew(d: Draft) {
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("app_dev_tasks").insert([{
        title: d.title.trim(), description: d.description.trim() || null,
        type: d.type, status: d.status,
        assignee_user_id: d.assignee_user_id || null,
        scheduled_date: d.scheduled_date || null,
        created_by: user?.id ?? null,
      }]);
      if (error) throw error;
      setCreating(false);
      toast.success("Task created");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Could not create the task"); }
    finally { setSaving(false); }
  }

  async function saveEdit(id: string, d: Draft) {
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("app_dev_tasks").update({
        title: d.title.trim(), description: d.description.trim() || null,
        type: d.type, status: d.status,
        assignee_user_id: d.assignee_user_id || null,
        scheduled_date: d.scheduled_date || null,
      }).eq("id", id);
      if (error) throw error;
      setEditing(null);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Could not save the task"); }
    finally { setSaving(false); }
  }

  async function moveTask(id: string, status: TaskStatus) {
    const prev = tasks;
    setTasks((p) => p.map((t) => (t.id === id ? { ...t, status } : t)));
    const { error } = await (supabase as any).from("app_dev_tasks").update({ status }).eq("id", id);
    if (error) { setTasks(prev); toast.error(error.message); }
  }

  async function removeTask(t: Task) {
    const { error } = await (supabase as any).from("app_dev_tasks").delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    setDeleting(null); setEditing(null);
    toast.success(`Task #${t.number} deleted`);
    await load();
  }

  return (
    <div className="flex h-full flex-col p-4">
      {/* Header row */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ListTodo className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm font-semibold">App Developer</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {visible.length} task{visible.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs">
            <option value="all">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {staff.map((s) => <option key={s.userId} value={s.userId}>{s.label}</option>)}
          </select>
          <Button size="sm" className="h-8 gap-1.5" onClick={() => { setEditing(null); setCreating(true); }}>
            <Plus className="h-3.5 w-3.5" /> New Task
          </Button>
        </div>
      </div>

      {/* Create / edit panel */}
      {(creating || editing) && (
        <div className="mb-3 rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {editing ? <>Edit task <span className="font-mono text-xs text-muted-foreground">#{editing.number}</span></> : "New task"}
            </h3>
            <button onClick={() => { setCreating(false); setEditing(null); }}
              className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <TaskEditor
            key={editing?.id ?? "new"}
            staff={staff}
            saving={saving}
            initial={editing ? {
              title: editing.title, description: editing.description ?? "",
              type: editing.type, status: editing.status,
              assignee_user_id: editing.assignee_user_id ?? "",
              scheduled_date: editing.scheduled_date ?? "",
            } : emptyDraft}
            onSave={(d) => (editing ? void saveEdit(editing.id, d) : void saveNew(d))}
            onCancel={() => { setCreating(false); setEditing(null); }}
            onDelete={editing ? () => setDeleting(editing) : undefined}
          />
        </div>
      )}

      {/* Board */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading tasks…
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
          {STATUSES.map((col) => {
            const colTasks = grouped[col.key];
            return (
              <div key={col.key} className="flex w-64 flex-none flex-col gap-2"
                onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
                onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/task-id") || dragId;
                  setDragOverCol(null); setDragId(null);
                  if (id) void moveTask(id, col.key);
                }}>
                <div className={cn("flex shrink-0 items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold",
                  col.bg, col.color, dragOverCol === col.key && "ring-1 ring-primary/60")}>
                  <span>{col.label}</span>
                  <span className="tabular-nums opacity-70">{colTasks.length}</span>
                </div>
                <div className={cn("flex min-h-16 flex-col gap-2 overflow-y-auto rounded-lg p-0.5",
                  dragOverCol === col.key && "bg-primary/5")}>
                  {colTasks.map((t) => (
                    <div key={t.id} draggable
                      onDragStart={(e) => { setDragId(t.id); e.dataTransfer.setData("text/task-id", t.id); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => { setDragId(null); setDragOverCol(null); }}
                      onClick={() => { setCreating(false); setEditing(t); }}
                      className={cn(
                        "group cursor-pointer select-none space-y-1.5 rounded-lg border border-border bg-card p-3 transition-all hover:border-primary/40 hover:shadow-sm",
                        dragId === t.id && "opacity-40",
                      )}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium leading-snug">{t.title}</span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="font-mono text-[10px] text-muted-foreground/60">#{t.number}</span>
                          <TypeBadge type={t.type} />
                        </div>
                      </div>
                      {t.description && <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {t.scheduled_date && (
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {fmtDate(t.scheduled_date)}</span>
                        )}
                        {t.assignee_user_id && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" /> {staffName[t.assignee_user_id] ?? "Assigned"}
                          </span>
                        )}
                        <Pencil className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task #{deleting?.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.title}” will be permanently removed from the board.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => { if (deleting) void removeTask(deleting); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
