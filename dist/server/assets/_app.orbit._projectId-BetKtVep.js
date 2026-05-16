import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-D7ynLlqD.js";
import { c as Route, a as useNavigate, s as supabase, t as toast } from "./router-DOVXXrXT.js";
import { B as Button } from "./button-9fOcQ-L3.js";
import { I as Input } from "./input-eaXjLIH7.js";
import { L as Label } from "./label-Bh2-DMXP.js";
import { T as Textarea, S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem } from "./select-DUuu40QP.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle } from "./dialog-B00pcbfZ.js";
import { L as LoaderCircle } from "./loader-circle-B_mYZ8oF.js";
import { A as ArrowLeft } from "./arrow-left-CLvNDWps.js";
import { T as TriangleAlert } from "./triangle-alert-CY4U4urA.js";
import { S as Ship } from "./ship-BzL4VlfS.js";
import { C as CalendarDays, S as SquareCheckBig } from "./square-check-big-BSx32kNN.js";
import { P as Pencil } from "./pencil-Du1FrOwP.js";
import { T as Trash2 } from "./trash-2-CDDkZ-iL.js";
import { e as Plus } from "./Combination-Bn5qB9iH.js";
import { C as Circle } from "./circle-mZtg4CaV.js";
import { C as Clock } from "./clock-Cn9U5AJJ.js";
import { C as ChevronRight } from "./chevron-right-Jyswiac2.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./utils-Bz4m9VPB.js";
import "./chevron-down-G_oG5OlX.js";
import "./createLucideIcon-DK6ljyX0.js";
import "./index-DLh2Sz4e.js";
import "./x-QWn3cpFS.js";
const TASK_COLS = [
  { key: "todo", label: "To Do", color: "border-slate-500/30 bg-slate-500/5", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Circle, { className: "h-3.5 w-3.5 text-slate-400" }) },
  { key: "in_progress", label: "In Progress", color: "border-amber-500/30 bg-amber-500/5", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "h-3.5 w-3.5 text-amber-400" }) },
  { key: "review", label: "Review", color: "border-blue-500/30 bg-blue-500/5", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "h-3.5 w-3.5 text-blue-400" }) },
  { key: "done", label: "Done", color: "border-emerald-500/30 bg-emerald-500/5", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(SquareCheckBig, { className: "h-3.5 w-3.5 text-emerald-400" }) }
];
const PRIORITY_COLOR = {
  low: "border-slate-500/30 text-slate-400",
  medium: "border-blue-500/30 text-blue-400",
  high: "border-amber-500/30 text-amber-400",
  urgent: "border-red-500/30 text-red-400"
};
const PRIORITY_LABEL = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
const STATUS_LABEL = { active: "Active", on_hold: "On Hold", completed: "Completed", cancelled: "Cancelled" };
const STATUS_COLOR = {
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  on_hold: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  completed: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  cancelled: "bg-muted text-muted-foreground border-border"
};
const EMPTY_TASK_FORM = { title: "", description: "", status: "todo", priority: "medium", due_date: "" };
const EMPTY_PROJ_FORM = { name: "", description: "", status: "active", priority: "medium", start_date: "", due_date: "" };
function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function isOverdue(d) {
  if (!d) return false;
  return new Date(d) < /* @__PURE__ */ new Date();
}
function TaskCard({ task, onClick }) {
  const overdue = isOverdue(task.due_date);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      onClick,
      className: "rounded-lg border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer p-3 space-y-2",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium leading-snug", children: task.title }),
        task.description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground line-clamp-2", children: task.description }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${PRIORITY_COLOR[task.priority]}`, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "h-2.5 w-2.5 mr-0.5" }),
            PRIORITY_LABEL[task.priority]
          ] }),
          task.due_date && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `flex items-center gap-0.5 text-[10px] ${overdue ? "text-red-400" : "text-muted-foreground"}`, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarDays, { className: "h-2.5 w-2.5" }),
            fmtDate(task.due_date)
          ] })
        ] })
      ]
    }
  );
}
function KanbanColumn({
  col,
  tasks,
  onAddTask,
  onTaskClick
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex flex-col rounded-xl border ${col.color} min-w-[260px] w-full`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-inherit", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        col.icon,
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold", children: col.label }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground", children: tasks.length })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => onAddTask(col.key),
          className: "rounded p-0.5 hover:bg-muted/60 transition",
          title: `Add task to ${col.label}`,
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-3.5 w-3.5 text-muted-foreground" })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-y-auto p-3 space-y-2 min-h-[120px] max-h-[calc(100vh-340px)]", children: [
      tasks.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(TaskCard, { task: t, onClick: () => onTaskClick(t) }, t.id)),
      tasks.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-16 text-xs text-muted-foreground opacity-60 select-none", children: "Drop tasks here" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: () => onAddTask(col.key),
        className: "flex items-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition rounded-b-xl border-t border-inherit",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-3.5 w-3.5" }),
          " Add task"
        ]
      }
    )
  ] });
}
function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const [project, setProject] = reactExports.useState(null);
  const [tasks, setTasks] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [taskOpen, setTaskOpen] = reactExports.useState(false);
  const [editingTask, setEditingTask] = reactExports.useState(null);
  const [taskForm, setTaskForm] = reactExports.useState(EMPTY_TASK_FORM);
  const [taskBusy, setTaskBusy] = reactExports.useState(false);
  const [projOpen, setProjOpen] = reactExports.useState(false);
  const [projForm, setProjForm] = reactExports.useState(EMPTY_PROJ_FORM);
  const [projBusy, setProjBusy] = reactExports.useState(false);
  reactExports.useEffect(() => {
    void loadAll();
  }, [projectId]);
  async function loadAll() {
    setLoading(true);
    const [projRes, tasksRes] = await Promise.all([
      supabase.from("orbit_projects").select("*, yacht:yachts(vessel_name)").eq("id", projectId).maybeSingle(),
      supabase.from("orbit_tasks").select("*").eq("project_id", projectId).order("sort_order").order("created_at")
    ]);
    if (projRes.error || !projRes.data) {
      toast.error("Project not found");
      navigate({ to: "/orbit" });
      return;
    }
    setProject(projRes.data);
    setTasks(tasksRes.data ?? []);
    setLoading(false);
  }
  function openNewTask(status) {
    setEditingTask(null);
    setTaskForm({ ...EMPTY_TASK_FORM, status });
    setTaskOpen(true);
  }
  function openEditTask(task) {
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      priority: task.priority,
      due_date: task.due_date ?? ""
    });
    setTaskOpen(true);
  }
  async function handleSaveTask() {
    if (!taskForm.title.trim()) {
      toast.error("Task title is required");
      return;
    }
    setTaskBusy(true);
    try {
      const payload = {
        title: taskForm.title.trim(),
        description: taskForm.description || null,
        status: taskForm.status,
        priority: taskForm.priority,
        due_date: taskForm.due_date || null,
        project_id: projectId,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (editingTask) {
        const { error } = await supabase.from("orbit_tasks").update(payload).eq("id", editingTask.id);
        if (error) throw error;
        toast.success("Task updated");
      } else {
        const maxOrder = tasks.filter((t) => t.status === taskForm.status).length;
        const { error } = await supabase.from("orbit_tasks").insert([{ ...payload, sort_order: maxOrder }]);
        if (error) throw error;
        toast.success("Task created");
      }
      setTaskOpen(false);
      await loadAll();
    } catch (e) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setTaskBusy(false);
    }
  }
  async function handleDeleteTask() {
    if (!editingTask) return;
    if (!confirm("Delete this task?")) return;
    const { error } = await supabase.from("orbit_tasks").delete().eq("id", editingTask.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Task deleted");
      setTaskOpen(false);
      await loadAll();
    }
  }
  async function handleMoveTask(task, status) {
    await supabase.from("orbit_tasks").update({ status, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", task.id);
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status } : t));
  }
  function openEditProject() {
    if (!project) return;
    setProjForm({
      name: project.name,
      description: project.description ?? "",
      status: project.status,
      priority: project.priority,
      start_date: project.start_date ?? "",
      due_date: project.due_date ?? ""
    });
    setProjOpen(true);
  }
  async function handleSaveProject() {
    if (!projForm.name.trim()) {
      toast.error("Project name is required");
      return;
    }
    setProjBusy(true);
    try {
      const { error } = await supabase.from("orbit_projects").update({
        name: projForm.name.trim(),
        description: projForm.description || null,
        status: projForm.status,
        priority: projForm.priority,
        start_date: projForm.start_date || null,
        due_date: projForm.due_date || null,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("id", projectId);
      if (error) throw error;
      toast.success("Project updated");
      setProjOpen(false);
      await loadAll();
    } catch (e) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setProjBusy(false);
    }
  }
  async function handleDeleteProject() {
    if (!project) return;
    if (!confirm(`Delete "${project.name}"? This will remove all tasks permanently.`)) return;
    const { error } = await supabase.from("orbit_projects").delete().eq("id", projectId);
    if (error) toast.error(error.message);
    else {
      toast.success("Project deleted");
      navigate({ to: "/orbit" });
    }
  }
  const tasksByStatus = (status) => tasks.filter((t) => t.status === status);
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  if (loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-6 w-6 animate-spin text-muted-foreground" }) });
  }
  if (!project) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "border-b border-border bg-card/40 px-6 py-4 space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => navigate({ to: "/orbit" }),
            className: "flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "h-4 w-4" }),
              " Orbit"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground/40", children: "/" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium truncate", children: project.name })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-4 flex-wrap", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 flex-wrap", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-xl font-bold", children: project.name }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLOR[project.status]}`, children: STATUS_LABEL[project.status] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_COLOR[project.priority]}`, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "h-2.5 w-2.5" }),
              PRIORITY_LABEL[project.priority]
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 mt-1.5 flex-wrap", children: [
            project.yacht && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 text-sm text-muted-foreground", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Ship, { className: "h-3.5 w-3.5" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: project.yacht.vessel_name })
            ] }),
            project.due_date && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex items-center gap-1.5 text-sm ${isOverdue(project.due_date) && project.status !== "completed" ? "text-red-400" : "text-muted-foreground"}`, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarDays, { className: "h-3.5 w-3.5" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                "Due ",
                fmtDate(project.due_date)
              ] })
            ] }),
            project.description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground", children: project.description })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [
          total > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 w-20 rounded-full bg-muted overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full rounded-full bg-emerald-500 transition-all", style: { width: `${pct}%` } }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-muted-foreground whitespace-nowrap", children: [
              done,
              "/",
              total,
              " done"
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "outline", size: "sm", onClick: openEditProject, className: "gap-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5" }),
            " Edit"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", onClick: handleDeleteProject, className: "gap-1.5 text-destructive/70 hover:text-destructive", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { size: "sm", onClick: () => openNewTask("todo"), className: "gap-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4" }),
            " Add Task"
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-x-auto p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-4 h-full", style: { minWidth: `${TASK_COLS.length * 280}px` }, children: TASK_COLS.map((col) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      KanbanColumn,
      {
        col,
        tasks: tasksByStatus(col.key),
        onAddTask: openNewTask,
        onTaskClick: openEditTask
      }
    ) }, col.key)) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open: taskOpen, onOpenChange: setTaskOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-md", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTitle, { children: editingTask ? "Edit Task" : "New Task" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 pt-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { children: [
            "Title ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-destructive", children: "*" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              value: taskForm.title,
              onChange: (e) => setTaskForm((f) => ({ ...f, title: e.target.value })),
              placeholder: "Describe the task…",
              autoFocus: true
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Description" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Textarea,
            {
              rows: 3,
              value: taskForm.description,
              onChange: (e) => setTaskForm((f) => ({ ...f, description: e.target.value })),
              placeholder: "Any additional details…"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Status" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: taskForm.status, onValueChange: (v) => setTaskForm((f) => ({ ...f, status: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: TASK_COLS.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: c.key, children: c.label }, c.key)) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Priority" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: taskForm.priority, onValueChange: (v) => setTaskForm((f) => ({ ...f, priority: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: ["low", "medium", "high", "urgent"].map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: p, children: PRIORITY_LABEL[p] }, p)) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5 col-span-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Due Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: taskForm.due_date,
                onChange: (e) => setTaskForm((f) => ({ ...f, due_date: e.target.value }))
              }
            )
          ] })
        ] }),
        editingTask && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs text-muted-foreground", children: "Quick move to" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-1.5 flex-wrap", children: TASK_COLS.filter((c) => c.key !== editingTask.status).map((c) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => {
                handleMoveTask(editingTask, c.key);
                setTaskOpen(false);
              },
              className: "flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted transition",
              children: [
                c.icon,
                " ",
                c.label
              ]
            },
            c.key
          )) })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between pt-4 border-t border-border mt-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: editingTask && /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "ghost", size: "sm", onClick: handleDeleteTask, className: "text-destructive/70 hover:text-destructive gap-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5" }),
          " Delete"
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => setTaskOpen(false), disabled: taskBusy, children: "Cancel" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: handleSaveTask, disabled: taskBusy, className: "gap-1.5", children: [
            taskBusy && /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }),
            editingTask ? "Save" : "Create Task"
          ] })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open: projOpen, onOpenChange: setProjOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-md", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTitle, { children: "Edit Project" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 pt-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { children: [
            "Project Name ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-destructive", children: "*" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: projForm.name, onChange: (e) => setProjForm((f) => ({ ...f, name: e.target.value })) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Description" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Textarea, { rows: 3, value: projForm.description, onChange: (e) => setProjForm((f) => ({ ...f, description: e.target.value })) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Status" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: projForm.status, onValueChange: (v) => setProjForm((f) => ({ ...f, status: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: ["active", "on_hold", "completed", "cancelled"].map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: s, children: STATUS_LABEL[s] }, s)) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Priority" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: projForm.priority, onValueChange: (v) => setProjForm((f) => ({ ...f, priority: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: ["low", "medium", "high", "urgent"].map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: p, children: PRIORITY_LABEL[p] }, p)) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Start Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "date", value: projForm.start_date, onChange: (e) => setProjForm((f) => ({ ...f, start_date: e.target.value })) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Due Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "date", value: projForm.due_date, onChange: (e) => setProjForm((f) => ({ ...f, due_date: e.target.value })) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 pt-4 border-t border-border mt-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => setProjOpen(false), disabled: projBusy, children: "Cancel" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: handleSaveProject, disabled: projBusy, className: "gap-1.5", children: [
          projBusy && /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }),
          " Save Changes"
        ] })
      ] })
    ] }) })
  ] });
}
const SplitComponent = ProjectDetailPage;
export {
  SplitComponent as component
};
