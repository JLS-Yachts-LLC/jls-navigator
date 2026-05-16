import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-CA1Re7tQ.js";
import { s as supabase, t as toast, a as useNavigate } from "./router-BiLVVNgM.js";
import { B as Button } from "./button-DUPLVSck.js";
import { I as Input } from "./input-Dk9i5um_.js";
import { L as Label } from "./label-Djzk5h6G.js";
import { L as LoaderCircle, S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem, T as Textarea } from "./select-DQSrubKo.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle } from "./dialog-CTytXxG7.js";
import { O as Orbit } from "./orbit-8dZxjWqU.js";
import { P as Plus } from "./Combination-CuzF6V9F.js";
import { S as Ship } from "./ship-Cmot2XyX.js";
import { C as Circle } from "./circle-pREtpVN2.js";
import { C as Clock, T as TriangleAlert } from "./triangle-alert-B1zm6KET.js";
import { S as SquareCheckBig, C as CalendarDays } from "./square-check-big-Cc2myerC.js";
import { P as Pencil, T as Trash2 } from "./x-C5JCqeJc.js";
import { C as ChevronRight } from "./chevron-right-BSlo-G8W.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./createLucideIcon-BkiIOXMm.js";
import "./chevron-down-fMwAeKn0.js";
import "./index-BYBvOuqV.js";
const STATUS_LABEL = {
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled"
};
const STATUS_COLOR = {
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  on_hold: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  completed: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  cancelled: "bg-muted text-muted-foreground border-border"
};
const PRIORITY_LABEL = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent"
};
const PRIORITY_COLOR = {
  low: "text-slate-400",
  medium: "text-blue-400",
  high: "text-amber-400",
  urgent: "text-red-400"
};
const EMPTY_FORM = {
  name: "",
  description: "",
  yacht_id: "__none",
  status: "active",
  priority: "medium",
  start_date: "",
  due_date: ""
};
function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function isOverdue(due, status) {
  if (!due || status === "completed" || status === "cancelled") return false;
  return new Date(due) < /* @__PURE__ */ new Date();
}
function StatusBadge({ status }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLOR[status]}`, children: STATUS_LABEL[status] });
}
function PriorityIcon({ priority }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `flex items-center gap-1 text-xs font-medium ${PRIORITY_COLOR[priority]}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "h-3 w-3" }),
    PRIORITY_LABEL[priority]
  ] });
}
function ProjectCard({
  project,
  onEdit,
  onDelete
}) {
  const navigate = useNavigate();
  const counts = project.task_counts ?? { todo: 0, in_progress: 0, review: 0, done: 0 };
  const total = counts.todo + counts.in_progress + counts.review + counts.done;
  const pct = total > 0 ? Math.round(counts.done / total * 100) : 0;
  const overdue = isOverdue(project.due_date, project.status);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "group relative rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-md transition-all cursor-pointer flex flex-col",
      onClick: () => navigate({ to: "/orbit/$projectId", params: { projectId: project.id } }),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-5 flex-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-2 mb-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold text-sm leading-snug truncate", children: project.name }),
              project.yacht && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 mt-0.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Ship, { className: "h-3 w-3 text-muted-foreground shrink-0" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground truncate", children: project.yacht.vessel_name })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: project.status })
          ] }),
          project.description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3", children: project.description }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(PriorityIcon, { priority: project.priority }),
          total > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between text-[10px] text-muted-foreground", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                counts.done,
                " of ",
                total,
                " tasks done"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                pct,
                "%"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 w-full rounded-full bg-muted overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                className: "h-full rounded-full bg-emerald-500 transition-all",
                style: { width: `${pct}%` }
              }
            ) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2 text-[10px] text-muted-foreground", children: [
              counts.todo > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-0.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Circle, { className: "h-2.5 w-2.5" }),
                counts.todo,
                " to do"
              ] }),
              counts.in_progress > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-0.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "h-2.5 w-2.5 text-amber-400" }),
                counts.in_progress,
                " in progress"
              ] }),
              counts.review > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-0.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "h-2.5 w-2.5 text-blue-400" }),
                counts.review,
                " review"
              ] }),
              counts.done > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-0.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SquareCheckBig, { className: "h-2.5 w-2.5 text-emerald-400" }),
                counts.done,
                " done"
              ] })
            ] })
          ] }),
          total === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-[10px] text-muted-foreground italic", children: "No tasks yet" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-border px-5 py-3 flex items-center justify-between", children: [
          project.due_date ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex items-center gap-1 text-xs ${overdue ? "text-red-400" : "text-muted-foreground"}`, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarDays, { className: "h-3 w-3" }),
            overdue ? "Overdue · " : "",
            fmtDate(project.due_date)
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-muted-foreground", children: "No due date" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: (e) => {
                  e.stopPropagation();
                  onEdit(project);
                },
                className: "rounded p-1 hover:bg-muted transition",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5 text-muted-foreground" })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: (e) => {
                  e.stopPropagation();
                  onDelete(project);
                },
                className: "rounded p-1 hover:bg-destructive/10 transition",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5 text-destructive/70" })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "h-4 w-4 text-muted-foreground ml-1" })
          ] })
        ] })
      ]
    }
  );
}
function ProjectsPage() {
  const [projects, setProjects] = reactExports.useState([]);
  const [yachts, setYachts] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [statusFilter, setStatusFilter] = reactExports.useState("all");
  const [open, setOpen] = reactExports.useState(false);
  const [editing, setEditing] = reactExports.useState(null);
  const [form, setForm] = reactExports.useState(EMPTY_FORM);
  const [busy, setBusy] = reactExports.useState(false);
  reactExports.useEffect(() => {
    void loadAll();
  }, []);
  async function loadAll() {
    setLoading(true);
    const [projRes, yachtRes] = await Promise.all([
      supabase.from("orbit_projects").select("*, yacht:yachts(vessel_name)").order("created_at", { ascending: false }),
      supabase.from("yachts").select("id, vessel_name").order("vessel_name")
    ]);
    if (projRes.error) {
      toast.error(projRes.error.message);
      setLoading(false);
      return;
    }
    if (!yachtRes.error) setYachts(yachtRes.data);
    const projects2 = projRes.data;
    const ids = projects2.map((p) => p.id);
    if (ids.length > 0) {
      const { data: tasks } = await supabase.from("orbit_tasks").select("project_id, status").in("project_id", ids);
      if (tasks) {
        const countMap = {};
        for (const t of tasks) {
          if (!countMap[t.project_id]) countMap[t.project_id] = { todo: 0, in_progress: 0, review: 0, done: 0 };
          const c = countMap[t.project_id];
          if (t.status === "todo") c.todo++;
          else if (t.status === "in_progress") c.in_progress++;
          else if (t.status === "review") c.review++;
          else if (t.status === "done") c.done++;
        }
        for (const p of projects2) p.task_counts = countMap[p.id] ?? { todo: 0, in_progress: 0, review: 0, done: 0 };
      }
    }
    setProjects(projects2);
    setLoading(false);
  }
  const filtered = reactExports.useMemo(
    () => statusFilter === "all" ? projects : projects.filter((p) => p.status === statusFilter),
    [projects, statusFilter]
  );
  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }
  function openEdit(p) {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? "",
      yacht_id: p.yacht_id ?? "__none",
      status: p.status,
      priority: p.priority,
      start_date: p.start_date ?? "",
      due_date: p.due_date ?? ""
    });
    setOpen(true);
  }
  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Project name is required");
      return;
    }
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
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (editing) {
        const { error } = await supabase.from("orbit_projects").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Project updated");
      } else {
        const { error } = await supabase.from("orbit_projects").insert([payload]);
        if (error) throw error;
        toast.success("Project created");
      }
      setOpen(false);
      await loadAll();
    } catch (e) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function handleDelete(p) {
    if (!confirm(`Delete "${p.name}"? This will also delete all tasks.`)) return;
    const { error } = await supabase.from("orbit_projects").delete().eq("id", p.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Project deleted");
      await loadAll();
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b border-border bg-card/40 px-6 py-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Orbit, { className: "h-5 w-5 text-primary" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-xl font-semibold", children: "Orbit" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-1 ml-2", children: ["all", "active", "on_hold", "completed", "cancelled"].map((f) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setStatusFilter(f),
            className: `rounded-md px-3 py-1 text-xs font-medium transition ${statusFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`,
            children: f === "all" ? "All" : STATUS_LABEL[f]
          },
          f
        )) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: openNew, size: "sm", className: "gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4" }),
        " New Project"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-6", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-40 items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-5 w-5 animate-spin text-muted-foreground" }) }) : filtered.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Orbit, { className: "h-10 w-10 opacity-30" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: statusFilter === "all" ? "No projects yet. Create your first project." : `No ${STATUS_LABEL[statusFilter].toLowerCase()} projects.` })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4", children: filtered.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(ProjectCard, { project: p, onEdit: openEdit, onDelete: handleDelete }, p.id)) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open, onOpenChange: setOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-lg", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(DialogTitle, { children: editing ? "Edit Project" : "New Project" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 pt-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { children: [
            "Project Name ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-destructive", children: "*" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              value: form.name,
              onChange: (e) => setForm((f) => ({ ...f, name: e.target.value })),
              placeholder: "e.g. Refit — MV Horizon",
              autoFocus: true
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Client Yacht" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.yacht_id, onValueChange: (v) => setForm((f) => ({ ...f, yacht_id: v })), children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select yacht…" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— No client —" }),
              yachts.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: y.id, children: y.vessel_name }, y.id))
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Description" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Textarea,
            {
              rows: 3,
              value: form.description,
              onChange: (e) => setForm((f) => ({ ...f, description: e.target.value })),
              placeholder: "Brief overview of the project scope…"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Status" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.status, onValueChange: (v) => setForm((f) => ({ ...f, status: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: ["active", "on_hold", "completed", "cancelled"].map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: s, children: STATUS_LABEL[s] }, s)) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Priority" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.priority, onValueChange: (v) => setForm((f) => ({ ...f, priority: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: ["low", "medium", "high", "urgent"].map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: p, children: PRIORITY_LABEL[p] }, p)) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Start Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "date", value: form.start_date, onChange: (e) => setForm((f) => ({ ...f, start_date: e.target.value })) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Due Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "date", value: form.due_date, onChange: (e) => setForm((f) => ({ ...f, due_date: e.target.value })) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 pt-4 border-t border-border mt-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => setOpen(false), disabled: busy, children: "Cancel" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: handleSave, disabled: busy, className: "gap-1.5", children: [
          busy && /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }),
          editing ? "Save Changes" : "Create Project"
        ] })
      ] })
    ] }) })
  ] });
}
const SplitComponent = ProjectsPage;
export {
  SplitComponent as component
};
