/**
 * Tasks & backlog (On board) — the crew's own task board.
 *
 *   Board    five columns (Backlog → To do → In progress → Waiting → Done);
 *            drag a card to move it (on a phone, open it and pick the column)
 *   Backlog  the triage list: what's next and what's parked, by priority
 *
 * A card has a priority, department, who it's with, a due date, labels, a
 * checklist, attachments and a comment thread that also records moves and
 * assignments. Reads `onboard_tasks` through RLS (vessel-scoped, also works in
 * staff preview); writes go through /api/portal/tasks.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, CalendarClock, CheckSquare, Columns3, Hourglass, ListTodo, Loader2, MessageSquare,
  Plus, Search, Send, Trash2, X,
} from "lucide-react";
import { AddButton, AttachedFiles, SectionCard, SectionHeader, SectionLoading, fmtDate } from "./section-ui";
import {
  PRIORITY_RANK, TASK_PRIORITIES, TASK_PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_HINT, TASK_STATUS_LABEL,
  isOverdue, sortBetween, type OnboardTask, type TaskChecklistItem, type TaskPriority, type TaskStatus,
} from "@/lib/portal/tasks";

const db = supabase as any;

const DEPARTMENTS: Array<[string, string]> = [
  ["deck", "Deck"], ["engine", "Engineering"], ["interior", "Interior"], ["galley", "Galley"],
  ["bar", "Bar"], ["safety", "Safety"], ["other", "Other"],
];
const deptLabel = (d: string | null) => DEPARTMENTS.find(([k]) => k === d)?.[1] ?? null;

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  urgent: "bg-red-500/15 text-red-300 border-red-500/30",
  high: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  normal: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  low: "bg-slate-500/15 text-slate-300 border-slate-500/25",
};
const COLUMN_ACCENT: Record<TaskStatus, string> = {
  backlog: "bg-slate-400", todo: "bg-sky-400", in_progress: "bg-primary", waiting: "bg-amber-400", done: "bg-emerald-400",
};

type Crew = { id: string; name: string };
type Comment = { id: string; kind: "comment" | "event"; author_name: string | null; body: string; created_at: string };

/** Call /api/portal/tasks; throws the server's message on failure. */
async function tasksRequest(init: RequestInit & { id?: string; action?: string } = {}) {
  const qs = new URLSearchParams();
  if (init.id) qs.set("id", init.id);
  if (init.action) qs.set("action", init.action);
  const q = qs.toString();
  const res = await portalFetch(`/api/portal/tasks${q ? `?${q}` : ""}`, {
    ...init,
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong — please try again.");
  return body;
}

const initials = (name: string | null) =>
  (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

const today = () => new Date().toISOString().slice(0, 10);
const DONE_RECENT_DAYS = 14;

export function TasksSection({ yachtId, canEdit }: { yachtId: string; canEdit: boolean }) {
  const [tasks, setTasks] = useState<OnboardTask[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [crew, setCrew] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"board" | "backlog">("board");
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("all");
  const [who, setWho] = useState("all");
  const [showAllDone, setShowAllDone] = useState(false);
  const [open, setOpen] = useState<OnboardTask | { new: TaskStatus } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ status: TaskStatus; beforeId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, c, cm] = await Promise.all([
      db.from("onboard_tasks").select("*").eq("yacht_id", yachtId).order("sort_order", { ascending: true }),
      db.from("crew_members").select("id, full_name, first_name, last_name, status").eq("yacht_id", yachtId).order("last_name"),
      db.from("onboard_task_comments").select("task_id").eq("yacht_id", yachtId).eq("kind", "comment").limit(5000),
    ]);
    setTasks((t.data ?? []) as OnboardTask[]);
    setCrew(((c.data ?? []) as any[])
      .filter((m) => !m.status || ["active", "on_leave"].includes(m.status))
      .map((m) => ({ id: m.id, name: m.full_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || "Crew" })));
    const counts: Record<string, number> = {};
    for (const r of (cm.data ?? []) as any[]) counts[r.task_id] = (counts[r.task_id] ?? 0) + 1;
    setCommentCounts(counts);
    setLoading(false);
  }, [yachtId]);
  useEffect(() => { void load(); }, [load]);

  // Keep the open card in step with the list after a save.
  const openTask = open && "id" in open ? tasks.find((t) => t.id === open.id) ?? open : open;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (dept !== "all" && t.department !== dept) return false;
      if (who === "unassigned" ? !!t.assignee_name : who !== "all" && t.assignee_name !== who) return false;
      if (!q) return true;
      return [t.reference, t.title, t.description, t.assignee_name, t.waiting_on, ...(t.labels ?? [])]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [tasks, search, dept, who]);

  const doneCutoff = new Date(Date.now() - DONE_RECENT_DAYS * 86400000).toISOString();
  const column = (status: TaskStatus) => {
    const list = filtered.filter((t) => t.status === status);
    if (status !== "done") return list.sort((a, b) => a.sort_order - b.sort_order);
    return list
      .filter((t) => showAllDone || !t.completed_at || t.completed_at >= doneCutoff)
      .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  };
  const hiddenDone = filtered.filter((t) => t.status === "done" && t.completed_at && t.completed_at < doneCutoff).length;

  const assignees = useMemo(() => [...new Set(tasks.map((t) => t.assignee_name).filter(Boolean) as string[])].sort(), [tasks]);
  const overdue = tasks.filter((t) => isOverdue(t)).length;
  const active = tasks.filter((t) => t.status === "todo" || t.status === "in_progress").length;

  /** Move a card to a column, before another card (or to the end). */
  const move = async (id: string, status: TaskStatus, beforeId: string | null) => {
    const card = tasks.find((t) => t.id === id);
    if (!card) return;
    const list = tasks.filter((t) => t.status === status && t.id !== id).sort((a, b) => a.sort_order - b.sort_order);
    const idx = beforeId ? Math.max(0, list.findIndex((t) => t.id === beforeId)) : list.length;
    const sort_order = sortBetween(list[idx - 1]?.sort_order, list[idx]?.sort_order);
    if (card.status === status && card.sort_order === sort_order) return;
    const now = new Date().toISOString();
    setTasks((all) => all.map((t) => t.id === id ? {
      ...t, status, sort_order,
      completed_at: status === "done" ? (t.status === "done" ? t.completed_at : now) : null,
    } : t));
    try {
      await tasksRequest({ method: "POST", id, action: "move", body: JSON.stringify({ status, sort_order }) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move that card.");
      void load();
    }
  };

  const quickAdd = async (status: TaskStatus, title: string) => {
    const t = title.trim();
    if (!t) return;
    try {
      await tasksRequest({ method: "POST", body: JSON.stringify({ title: t, status }) });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add that card."); }
  };

  const patch = async (id: string, fields: Partial<OnboardTask>) => {
    setTasks((all) => all.map((t) => t.id === id ? { ...t, ...fields } : t));
    try { await tasksRequest({ method: "PATCH", id, body: JSON.stringify(fields) }); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save."); void load(); }
  };

  if (loading) return <SectionLoading />;

  const onDrop = (status: TaskStatus) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = dragId ?? e.dataTransfer.getData("text/plain");
    const at = dropAt?.status === status ? dropAt.beforeId : null;
    setDragId(null); setDropAt(null);
    if (id) void move(id, status, at);
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Tasks & backlog"
        subtitle={`${active} in hand${overdue ? ` · ${overdue} overdue` : ""} · ${tasks.filter((t) => t.status === "backlog").length} in the backlog`}
        action={canEdit && <AddButton onClick={() => setOpen({ new: view === "backlog" ? "backlog" : "todo" })}>New task</AddButton>}
      />

      {/* View + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-border p-1 text-sm">
          {([["board", "Board", Columns3], ["backlog", "Backlog", ListTodo]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setView(k)}
                    className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition",
                      view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks, labels, people…"
                 className="w-full rounded-xl border border-border bg-background/50 py-2 pl-8 pr-3 text-sm outline-none focus:border-primary/60" />
        </div>
        <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department"
                className="rounded-xl border border-border bg-background/50 px-3 py-2 text-sm outline-none">
          <option value="all">All departments</option>
          {DEPARTMENTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Assigned to"
                className="rounded-xl border border-border bg-background/50 px-3 py-2 text-sm outline-none">
          <option value="all">Everyone</option>
          <option value="unassigned">Unassigned</option>
          {assignees.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}

      {view === "board" ? (
        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
          {TASK_STATUSES.map((status) => {
            const cards = column(status);
            const over = dropAt?.status === status;
            return (
              <div key={status}
                   onDragOver={(e) => { if (!canEdit || !dragId) return; e.preventDefault(); if (!over) setDropAt({ status, beforeId: null }); }}
                   onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropAt((d) => d?.status === status ? null : d); }}
                   onDrop={onDrop(status)}
                   className={cn("flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col rounded-2xl border bg-card/40 sm:w-[280px]",
                     over && dragId ? "border-primary/50 bg-primary/5" : "border-border")}>
                <div className="px-3 pb-2 pt-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", COLUMN_ACCENT[status])} />
                    <span className="text-sm font-semibold">{TASK_STATUS_LABEL[status]}</span>
                    <span className="ml-auto rounded-full bg-background/60 px-2 text-[11px] tabular-nums text-muted-foreground">{cards.length}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{TASK_STATUS_HINT[status]}</div>
                </div>
                <div className="flex min-h-[80px] flex-1 flex-col gap-2 px-2 pb-2">
                  {cards.map((t) => (
                    <div key={t.id}
                         onDragOver={(e) => {
                           if (!canEdit || !dragId) return;
                           e.preventDefault(); e.stopPropagation();
                           const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                           const after = e.clientY > r.top + r.height / 2;
                           const i = cards.findIndex((c) => c.id === t.id);
                           setDropAt({ status, beforeId: after ? cards[i + 1]?.id ?? null : t.id });
                         }}>
                      {over && dragId && dropAt?.beforeId === t.id && dragId !== t.id && <div className="mb-2 h-0.5 rounded bg-primary" />}
                      <TaskCard t={t} comments={commentCounts[t.id] ?? 0} dragging={dragId === t.id}
                                draggable={canEdit}
                                onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; setDragId(t.id); }}
                                onDragEnd={() => { setDragId(null); setDropAt(null); }}
                                onOpen={() => setOpen(t)} />
                    </div>
                  ))}
                  {over && dragId && dropAt?.beforeId === null && <div className="h-0.5 rounded bg-primary" />}
                  {status === "done" && hiddenDone > 0 && (
                    <button type="button" onClick={() => setShowAllDone((v) => !v)} className="py-1 text-[11px] text-muted-foreground hover:text-foreground">
                      {showAllDone ? `Hide cards done over ${DONE_RECENT_DAYS} days ago` : `+ ${hiddenDone} done over ${DONE_RECENT_DAYS} days ago`}
                    </button>
                  )}
                  {canEdit && status !== "done" && <QuickAdd onAdd={(title) => quickAdd(status, title)} />}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <BacklogView tasks={filtered} canEdit={canEdit} comments={commentCounts}
                     onOpen={(t) => setOpen(t)} onMove={(t, s) => void move(t.id, s, null)}
                     onPriority={(t, p) => void patch(t.id, { priority: p })}
                     onQuickAdd={(title) => quickAdd("backlog", title)} />
      )}

      {openTask && (
        <TaskDialog
          task={"id" in openTask ? openTask : null}
          defaultStatus={"new" in openTask ? openTask.new : "todo"}
          crew={crew} canEdit={canEdit}
          onClose={() => setOpen(null)}
          onChanged={() => void load()}
          onCreated={async (id) => { await load(); setOpen({ id } as OnboardTask); }}
        />
      )}
    </div>
  );
}

function QuickAdd({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-background/50 hover:text-foreground">
        <Plus className="h-3.5 w-3.5" /> Add a card
      </button>
    );
  }
  const submit = async () => {
    if (!title.trim()) { setOpen(false); return; }
    setBusy(true); await onAdd(title); setBusy(false); setTitle("");
  };
  return (
    <div className="rounded-xl border border-primary/40 bg-background/60 p-2">
      <textarea autoFocus value={title} onChange={(e) => setTitle(e.target.value)} rows={2} maxLength={200}
                placeholder="What needs doing?"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); }
                  if (e.key === "Escape") { setOpen(false); setTitle(""); }
                }}
                className="w-full resize-none bg-transparent text-sm outline-none" />
      <div className="mt-1 flex items-center gap-2">
        <button type="button" disabled={busy} onClick={() => void submit()}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
        </button>
        <button type="button" onClick={() => { setOpen(false); setTitle(""); }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
    </div>
  );
}

function TaskCard({ t, comments, onOpen, draggable, dragging, onDragStart, onDragEnd }: {
  t: OnboardTask; comments: number; onOpen: () => void; draggable: boolean; dragging: boolean;
  onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void;
}) {
  const late = isOverdue(t);
  const list = t.checklist ?? [];
  const ticked = list.filter((i) => i.done).length;
  return (
    <button type="button" onClick={onOpen} draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}
            className={cn("w-full rounded-xl border border-border bg-card p-3 text-left shadow-sm transition hover:border-primary/40",
              draggable && "cursor-grab active:cursor-grabbing", dragging && "opacity-40",
              t.priority === "urgent" && t.status !== "done" && "border-l-2 border-l-red-400")}>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="font-mono">{t.reference}</span>
        {deptLabel(t.department) && <span>· {deptLabel(t.department)}</span>}
        {(t.priority === "urgent" || t.priority === "high") && t.status !== "done" && (
          <span className={cn("ml-auto rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase", PRIORITY_STYLE[t.priority])}>
            {TASK_PRIORITY_LABEL[t.priority]}
          </span>
        )}
      </div>
      <div className={cn("mt-1 text-sm font-medium leading-snug", t.status === "done" && "text-muted-foreground line-through decoration-muted-foreground/40")}>{t.title}</div>
      {t.status === "waiting" && t.waiting_on && (
        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-300"><Hourglass className="h-3 w-3" /> {t.waiting_on}</div>
      )}
      {t.labels?.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {t.labels.slice(0, 4).map((l) => <span key={l} className="rounded-md bg-background/70 px-1.5 py-px text-[10px] text-muted-foreground">{l}</span>)}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2.5 text-[11px] text-muted-foreground">
        {t.due_date && (
          <span className={cn("inline-flex items-center gap-1", late && "font-semibold text-red-300")}>
            {late ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
            {new Date(`${t.due_date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
        )}
        {list.length > 0 && (
          <span className={cn("inline-flex items-center gap-1", ticked === list.length && "text-emerald-400")}>
            <CheckSquare className="h-3 w-3" /> {ticked}/{list.length}
          </span>
        )}
        {comments > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {comments}</span>}
        {t.assignee_name && (
          <span title={t.assignee_name}
                className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
            {initials(t.assignee_name)}
          </span>
        )}
      </div>
    </button>
  );
}

/** Backlog — what's next (To do) and what's parked (Backlog), urgent first. */
function BacklogView({ tasks, canEdit, comments, onOpen, onMove, onPriority, onQuickAdd }: {
  tasks: OnboardTask[]; canEdit: boolean; comments: Record<string, number>;
  onOpen: (t: OnboardTask) => void; onMove: (t: OnboardTask, s: TaskStatus) => void;
  onPriority: (t: OnboardTask, p: TaskPriority) => void; onQuickAdd: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const byPriority = (a: OnboardTask, b: OnboardTask) =>
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.sort_order - b.sort_order;
  const groups: Array<[TaskStatus, string]> = [["todo", "Next up"], ["backlog", "Backlog"]];

  const add = async () => {
    if (!title.trim()) return;
    setBusy(true); await onQuickAdd(title); setTitle(""); setBusy(false);
  };

  return (
    <div className="space-y-5">
      {canEdit && (
        <form onSubmit={(e) => { e.preventDefault(); void add(); }} className="flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Add to the backlog — an idea, a snag, a job for later…"
                 className="flex-1 rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
          <button type="submit" disabled={busy || !title.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </button>
        </form>
      )}
      {groups.map(([status, label]) => {
        const rows = tasks.filter((t) => t.status === status).sort(byPriority);
        return (
          <div key={status} className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full", COLUMN_ACCENT[status])} /> {label}
              <span className="text-xs font-normal">({rows.length})</span>
            </h2>
            {rows.length === 0 ? (
              <SectionCard className="px-4 py-6 text-center text-sm text-muted-foreground">
                {status === "todo" ? "Nothing queued — pull something up from the backlog." : "The backlog is empty."}
              </SectionCard>
            ) : (
              <SectionCard className="divide-y divide-border/60 overflow-hidden">
                {rows.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                    {canEdit ? (
                      <select value={t.priority} onChange={(e) => onPriority(t, e.target.value as TaskPriority)} aria-label="Priority"
                              className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase outline-none", PRIORITY_STYLE[t.priority])}>
                        {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>)}
                      </select>
                    ) : (
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", PRIORITY_STYLE[t.priority])}>{TASK_PRIORITY_LABEL[t.priority]}</span>
                    )}
                    <button type="button" onClick={() => onOpen(t)} className="min-w-0 flex-1 text-left">
                      <span className="text-sm font-medium hover:underline">{t.title}</span>
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">{t.reference}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {[deptLabel(t.department), t.assignee_name, t.due_date && `due ${fmtDate(t.due_date)}`,
                          (t.checklist?.length ?? 0) > 0 && `${t.checklist.filter((i) => i.done).length}/${t.checklist.length} ticked`,
                          comments[t.id] && `${comments[t.id]} comment${comments[t.id] === 1 ? "" : "s"}`]
                          .filter(Boolean).join(" · ") || "—"}
                      </span>
                    </button>
                    {isOverdue(t) && <span className="text-[11px] font-semibold text-red-300">Overdue</span>}
                    {canEdit && (
                      <div className="flex gap-1">
                        {status === "backlog" ? (
                          <button type="button" onClick={() => onMove(t, "todo")}
                                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition hover:border-primary/50">Next up ›</button>
                        ) : (
                          <>
                            <button type="button" onClick={() => onMove(t, "backlog")}
                                    className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition hover:text-foreground">‹ Park</button>
                            <button type="button" onClick={() => onMove(t, "in_progress")}
                                    className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition hover:border-primary/50">Start ›</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </SectionCard>
            )}
          </div>
        );
      })}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-sm outline-none transition focus:border-primary/60 disabled:opacity-60";

/** Open / add one card. A new card is created on Save, then stays open for comments and files. */
function TaskDialog({ task, defaultStatus, crew, canEdit, onClose, onChanged, onCreated }: {
  task: OnboardTask | null; defaultStatus: TaskStatus; crew: Crew[]; canEdit: boolean;
  onClose: () => void; onChanged: () => void; onCreated: (id: string) => Promise<void>;
}) {
  const fromTask = (t: OnboardTask | null) => ({
    title: t?.title ?? "",
    description: t?.description ?? "",
    status: (t?.status ?? defaultStatus) as TaskStatus,
    priority: (t?.priority ?? "normal") as TaskPriority,
    department: t?.department ?? "",
    due_date: t?.due_date ?? "",
    waiting_on: t?.waiting_on ?? "",
    labels: (t?.labels ?? []).join(", "),
    assignee: t?.assignee_crew_id ? `crew:${t.assignee_crew_id}` : t?.assignee_name ? "other" : "",
    assignee_other: t?.assignee_crew_id ? "" : t?.assignee_name ?? "",
  });
  const [form, setForm] = useState(() => fromTask(task));
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>(task?.checklist ?? []);
  const [newItem, setNewItem] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  // Reset when a different card is opened (or the new card has just been created).
  useEffect(() => { setForm(fromTask(task)); setChecklist(task?.checklist ?? []); }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadComments = useCallback(async () => {
    if (!task?.id) return;
    const { data } = await db.from("onboard_task_comments").select("id, kind, author_name, body, created_at")
      .eq("task_id", task.id).order("created_at", { ascending: true });
    setComments(data ?? []);
  }, [task?.id]);
  useEffect(() => { void loadComments(); }, [loadComments]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const body = () => {
    const assignee = form.assignee.startsWith("crew:")
      ? { assignee_crew_id: form.assignee.slice(5) }
      : { assignee_crew_id: null, assignee_name: form.assignee === "other" ? form.assignee_other.trim() || null : null };
    return {
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status,
      priority: form.priority,
      department: form.department || null,
      due_date: form.due_date || null,
      waiting_on: form.status === "waiting" ? form.waiting_on.trim() || null : null,
      labels: form.labels.split(",").map((l) => l.trim()).filter(Boolean),
      ...assignee,
    };
  };

  const dirty = !task || JSON.stringify(form) !== JSON.stringify(fromTask(task));

  const save = async () => {
    if (!form.title.trim()) { setError("Give the task a title."); return; }
    setBusy(true); setError(null);
    try {
      if (!task) {
        const res = await tasksRequest({ method: "POST", body: JSON.stringify({ ...body(), checklist }) });
        await onCreated(res.id);
      } else {
        await tasksRequest({ method: "PATCH", id: task.id, body: JSON.stringify(body()) });
        onChanged(); void loadComments();
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(false); }
  };

  /** Checklist changes on a saved card are stored straight away. */
  const saveChecklist = async (next: TaskChecklistItem[]) => {
    setChecklist(next);
    if (!task) return;
    try { await tasksRequest({ method: "PATCH", id: task.id, body: JSON.stringify({ checklist: next }) }); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save the checklist."); }
  };

  const addItem = () => {
    const t = newItem.trim();
    if (!t) return;
    void saveChecklist([...checklist, { id: `i${Date.now().toString(36)}`, text: t, done: false }]);
    setNewItem("");
  };

  const sendComment = async () => {
    if (!task || !reply.trim()) return;
    setSending(true);
    try {
      await tasksRequest({ method: "POST", id: task.id, action: "comment", body: JSON.stringify({ body: reply }) });
      setReply(""); await loadComments(); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send."); }
    finally { setSending(false); }
  };

  const remove = async () => {
    if (!task || !confirm(`Delete ${task.reference} "${task.title}"? This can't be undone.`)) return;
    setBusy(true);
    try { await tasksRequest({ method: "DELETE", id: task.id }); onChanged(); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not delete."); setBusy(false); }
  };

  const ro = !canEdit;
  const ticked = checklist.filter((i) => i.done).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground">
              {task ? <><span className="font-mono">{task.reference}</span> · added {fmtDate(task.created_at)}{task.created_by_name ? ` by ${task.created_by_name}` : ""}</> : "New task"}
              {task?.completed_at && <> · done {fmtDate(task.completed_at)}{task.completed_by_name ? ` by ${task.completed_by_name}` : ""}</>}
            </div>
            <input value={form.title} onChange={set("title")} disabled={ro} maxLength={200} placeholder="What needs doing?" autoFocus={!task}
                   className="mt-1 w-full bg-transparent text-lg font-bold outline-none placeholder:text-muted-foreground/50" />
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Column">
            <select className={inputCls} value={form.status} onChange={set("status")} disabled={ro}>
              {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className={inputCls} value={form.priority} onChange={set("priority")} disabled={ro}>
              {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>)}
            </select>
          </Field>
          <Field label="Department">
            <select className={inputCls} value={form.department} onChange={set("department")} disabled={ro}>
              <option value="">—</option>
              {DEPARTMENTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Assigned to">
            <select className={inputCls} value={form.assignee} onChange={set("assignee")} disabled={ro}>
              <option value="">Unassigned</option>
              {crew.map((c) => <option key={c.id} value={`crew:${c.id}`}>{c.name}</option>)}
              <option value="other">Someone else…</option>
            </select>
          </Field>
          {form.assignee === "other" && (
            <Field label="Who">
              <input className={inputCls} value={form.assignee_other} onChange={set("assignee_other")} disabled={ro} maxLength={120} placeholder="e.g. Deck team, contractor" />
            </Field>
          )}
          <Field label="Due">
            <input type="date" className={inputCls} value={form.due_date} onChange={set("due_date")} disabled={ro} />
          </Field>
          {form.status === "waiting" && (
            <Field label="Waiting on" wide>
              <input className={inputCls} value={form.waiting_on} onChange={set("waiting_on")} disabled={ro} maxLength={160} placeholder="e.g. Parts from JLS, Captain's OK" />
            </Field>
          )}
          <Field label="Labels (comma separated)" wide>
            <input className={inputCls} value={form.labels} onChange={set("labels")} disabled={ro} placeholder="e.g. Guest areas, Yard period, Snag" />
          </Field>
          <Field label="Details" full>
            <textarea className={cn(inputCls, "min-h-[90px]")} value={form.description} onChange={set("description")} disabled={ro} maxLength={6000}
                      placeholder="What's involved, where, anything the next person should know…" />
          </Field>
        </div>

        {/* Checklist */}
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <CheckSquare className="h-3.5 w-3.5" /> Checklist {checklist.length > 0 && <span className="font-normal normal-case">· {ticked}/{checklist.length}</span>}
          </div>
          {checklist.length > 0 && (
            <div className="mb-2 h-1 overflow-hidden rounded-full bg-background/60">
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${(ticked / checklist.length) * 100}%` }} />
            </div>
          )}
          <div className="space-y-1">
            {checklist.map((i) => (
              <div key={i.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-background/40">
                <input type="checkbox" checked={i.done} disabled={ro} className="h-4 w-4 accent-[hsl(var(--primary))]"
                       onChange={() => void saveChecklist(checklist.map((x) => x.id === i.id ? { ...x, done: !x.done } : x))} />
                <span className={cn("flex-1 text-sm", i.done && "text-muted-foreground line-through")}>{i.text}</span>
                {!ro && (
                  <button type="button" aria-label="Remove item" onClick={() => void saveChecklist(checklist.filter((x) => x.id !== i.id))}
                          className="opacity-0 transition group-hover:opacity-100"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
                )}
              </div>
            ))}
          </div>
          {!ro && (
            <div className="mt-1 flex gap-2">
              <input value={newItem} onChange={(e) => setNewItem(e.target.value)} maxLength={200} placeholder="Add an item"
                     onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
                     className={cn(inputCls, "py-1.5")} />
              <button type="button" onClick={addItem} className="rounded-xl border border-border px-3 text-xs font-medium hover:border-primary/50">Add</button>
            </div>
          )}
        </div>

        {task && (
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Photos & files</div>
            <AttachedFiles refTable="onboard_tasks" refId={task.id} target="task_file" canEdit={canEdit}
                           accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" label="Attach" />
          </div>
        )}

        {error && <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}

        {canEdit && (
          <div className="mt-5 flex gap-2">
            {task && (
              <button type="button" onClick={() => void remove()} disabled={busy}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition hover:border-red-500/40 hover:text-red-300 disabled:opacity-50">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
            <button type="button" onClick={() => void save()} disabled={busy || !dirty || !form.title.trim()}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {task ? (dirty ? "Save changes" : "Saved") : "Add task"}
            </button>
          </div>
        )}

        {/* Comments + history */}
        {task && (
          <div className="mt-6 border-t border-border pt-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" /> Comments & history
            </div>
            <div className="space-y-2.5">
              {comments.length === 0 && <div className="text-xs text-muted-foreground">No comments yet.</div>}
              {comments.map((c) => c.kind === "event" ? (
                <div key={c.id} className="text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/70">{c.author_name ?? "Someone"}</span> {c.body} · {new Date(c.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              ) : (
                <div key={c.id} className="flex gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">{initials(c.author_name)}</span>
                  <div className="min-w-0 flex-1 rounded-xl bg-background/50 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{c.author_name ?? "Someone"}</span> · {new Date(c.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</div>
                  </div>
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="mt-3 flex gap-2">
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={4000} placeholder="Write a comment…"
                          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void sendComment(); } }}
                          className={cn(inputCls, "resize-none")} />
                <button type="button" onClick={() => void sendComment()} disabled={sending || !reply.trim()} aria-label="Send comment"
                        className="flex w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, wide, full }: { label: string; children: React.ReactNode; wide?: boolean; full?: boolean }) {
  return (
    <div className={cn(full ? "col-span-2 sm:col-span-3" : wide ? "col-span-2" : "col-span-1")}>
      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
