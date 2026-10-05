/**
 * Checklists (On board) — the vessel's own checklists, what's due, and the
 * record of each time one was gone through. A run copies the checklist's items
 * when it starts, so the record always shows what was actually checked.
 *
 * Reads go through RLS (vessel-scoped, also works in staff preview); writes go
 * through /api/portal/checklists.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";
import {
  ArrowDown, ArrowUp, BookOpen, Check, CheckCircle2, ClipboardCheck, History, Loader2, MessageSquare, Pencil, Play, Plus, Trash2, X,
} from "lucide-react";
import { STOCK_DEPARTMENTS } from "@/lib/portal/onboard";
import {
  CHECKLIST_FREQUENCIES, CHECKLIST_LIBRARY, checklistDue, frequencyLabel, newItemId, runProgress,
  type ChecklistItem, type ChecklistResult,
} from "@/lib/portal/checklists";
import { AddButton, SectionCard, SectionEmpty, SectionHeader, SectionLoading, StatusBadge, fmtDate } from "./section-ui";

const db = supabase as any;

type Template = {
  id: string; title: string; department: string; frequency: string; items: ChecklistItem[]; active: boolean;
};
type Run = {
  id: string; template_id: string | null; title: string; department: string; items: ChecklistItem[];
  results: Record<string, ChecklistResult>; status: "in_progress" | "completed"; notes: string | null;
  started_by_name: string | null; started_at: string; completed_by_name: string | null; completed_at: string | null;
};

const deptLabel = (d: string) => STOCK_DEPARTMENTS.find((x) => x.value === d)?.label ?? d;
const fmtWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

async function clRequest(params: Record<string, string>, init: RequestInit = {}) {
  const res = await portalFetch(`/api/portal/checklists?${new URLSearchParams(params)}`, {
    ...init,
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong — please try again.");
  return body;
}

export function ChecklistsSection({ yachtId, canEdit }: { yachtId: string; canEdit: boolean }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"today" | "history">("today");
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, r]: any[] = await Promise.all([
      db.from("onboard_checklist_templates").select("id, title, department, frequency, items, active").eq("yacht_id", yachtId).order("title"),
      db.from("onboard_checklist_runs").select("*").eq("yacht_id", yachtId).order("started_at", { ascending: false }).limit(200),
    ]);
    setTemplates(t.data ?? []); setRuns(r.data ?? []); setLoading(false);
  }, [yachtId]);
  useEffect(() => { void load(); }, [load]);

  const lastCompleted = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of runs) if (r.status === "completed" && r.template_id && r.completed_at && !m.has(r.template_id)) m.set(r.template_id, r.completed_at);
    return m;
  }, [runs]);

  if (loading) return <SectionLoading />;

  const active = templates.filter((t) => t.active);
  const inProgress = runs.filter((r) => r.status === "in_progress");
  const completed = runs.filter((r) => r.status === "completed");
  const due = active.filter((t) => checklistDue(t.frequency, lastCompleted.get(t.id) ?? null) && !inProgress.some((r) => r.template_id === t.id));
  const openRun = runs.find((r) => r.id === openRunId) ?? null;
  const usedLibrary = new Set(templates.map((t) => t.title));

  const start = async (t: Template) => {
    const existing = inProgress.find((r) => r.template_id === t.id);
    if (existing) { setOpenRunId(existing.id); return; }
    setStarting(t.id);
    try {
      const res = await clRequest({ kind: "run", template: t.id }, { method: "POST", body: "{}" });
      await load();
      setOpenRunId(res.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not start the checklist.");
    } finally {
      setStarting(null);
    }
  };

  const TemplateRow = ({ t }: { t: Template }) => {
    const last = lastCompleted.get(t.id) ?? null;
    const run = inProgress.find((r) => r.template_id === t.id);
    const isDue = due.includes(t);
    const p = run ? runProgress(run.items, run.results) : null;
    return (
      <SectionCard className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 p-4", isDue && "border-amber-500/30")}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{t.title}</span>
            {isDue && <StatusBadge label="due" tone="amber" />}
            {run && <StatusBadge label="in progress" tone="sky" />}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {deptLabel(t.department)} · {frequencyLabel(t.frequency)} · {t.items.length} item{t.items.length === 1 ? "" : "s"}
            {last ? ` · last done ${fmtWhen(last)}` : " · not done yet"}
            {p && ` · ${p.done}/${p.total} ticked`}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {canEdit && (
            <button type="button" onClick={() => setEditing(t)} aria-label={`Edit ${t.title}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background/60 hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {(canEdit || run) && (
            <button type="button" onClick={() => void start(t)} disabled={starting === t.id || (!canEdit && !run)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
              {starting === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} {run ? "Continue" : "Start"}
            </button>
          )}
        </div>
      </SectionCard>
    );
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Checklists"
        subtitle="Your vessel's own checklists, what's due, and a record of every time one was done."
        action={canEdit && (
          <div className="flex gap-2">
            <button type="button" onClick={() => setLibraryOpen(true)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground transition hover:text-foreground">
              <BookOpen className="h-4 w-4" /> Starter checklists
            </button>
            <AddButton onClick={() => setEditing("new")}>New checklist</AddButton>
          </div>
        )}
      />

      <div className="inline-flex rounded-xl border border-border p-1 text-sm">
        {([["today", "Checklists"], ["history", "History"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
                  className={cn("rounded-lg px-4 py-1.5 font-medium transition", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {label}{v === "history" && completed.length ? ` (${completed.length})` : ""}
          </button>
        ))}
      </div>

      {view === "today" && (
        active.length === 0 ? (
          <SectionEmpty icon={ClipboardCheck} message={canEdit
            ? "No checklists yet. Start from a starter checklist (departure, arrival, daily rounds…) and adapt it, or write your own."
            : "No checklists set up yet."} />
        ) : (
          <div className="space-y-5">
            {(due.length > 0 || inProgress.length > 0) && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-muted-foreground">Due now &amp; in progress</h2>
                {active.filter((t) => due.includes(t) || inProgress.some((r) => r.template_id === t.id)).map((t) => <TemplateRow key={t.id} t={t} />)}
              </div>
            )}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">All checklists</h2>
              {active.filter((t) => !due.includes(t) && !inProgress.some((r) => r.template_id === t.id)).map((t) => <TemplateRow key={t.id} t={t} />)}
            </div>
          </div>
        )
      )}

      {view === "history" && (
        completed.length === 0 ? <SectionEmpty icon={History} message="Nothing completed yet — each finished checklist is kept here." /> : (
          <div className="space-y-2">
            {completed.map((r) => {
              const p = runProgress(r.items, r.results);
              return (
                <button key={r.id} type="button" onClick={() => setOpenRunId(r.id)}
                        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-border bg-card/80 p-4 text-left transition hover:border-primary/50">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{r.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {fmtWhen(r.completed_at)}{r.completed_by_name ? ` · ${r.completed_by_name}` : ""} · {deptLabel(r.department)}
                    </div>
                  </div>
                  <span className={cn("text-xs font-semibold tabular-nums", p.done < p.total ? "text-amber-400" : "text-emerald-400")}>{p.done}/{p.total}</span>
                </button>
              );
            })}
          </div>
        )
      )}

      {editing && (
        <TemplateEditor template={editing === "new" ? null : editing}
                        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
      )}
      {libraryOpen && (
        <LibraryPicker used={usedLibrary} onClose={() => setLibraryOpen(false)} onAdded={() => { setLibraryOpen(false); void load(); }} />
      )}
      {openRun && (
        <RunScreen run={openRun} canEdit={canEdit} onClose={() => setOpenRunId(null)}
                   onChanged={(r) => setRuns((prev) => prev.map((x) => (x.id === r.id ? r : x)))}
                   onFinished={() => { setOpenRunId(null); void load(); }} />
      )}
    </div>
  );
}

// ── Template editor ─────────────────────────────────────────────────────────
const inputCls =
  "w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm outline-none transition focus:border-primary/60";

function TemplateEditor({ template, onClose, onSaved }: { template: Template | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(template?.title ?? "");
  const [department, setDepartment] = useState(template?.department ?? "deck");
  const [frequency, setFrequency] = useState(template?.frequency ?? "as_needed");
  const [items, setItems] = useState<ChecklistItem[]>(() => template?.items?.length ? template.items : [{ id: newItemId(), label: "", section: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setItem = (id: string, patch: Partial<ChecklistItem>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const move = (idx: number, dir: -1 | 1) => setItems((xs) => {
    const j = idx + dir;
    if (j < 0 || j >= xs.length) return xs;
    const next = [...xs]; [next[idx], next[j]] = [next[j], next[idx]]; return next;
  });
  const filled = items.filter((i) => i.label.trim());

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await clRequest(template ? { kind: "template", id: template.id } : { kind: "template" }, {
        method: template ? "PATCH" : "POST",
        body: JSON.stringify({ title, department, frequency, items: filled }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!template || !confirm(`Delete "${template.title}"? Completed records of it are kept.`)) return;
    setBusy(true);
    try { await clRequest({ kind: "template", id: template.id }, { method: "DELETE" }); onSaved(); } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete."); setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={save} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{template ? `Edit ${template.title}` : "New checklist"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label htmlFor="cl-title" className="mb-1.5 block text-xs font-medium text-muted-foreground">Title <span className="text-primary">*</span></label>
            <input id="cl-title" className={inputCls} required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pre-departure" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="cl-dept" className="mb-1.5 block text-xs font-medium text-muted-foreground">Department</label>
            <select id="cl-dept" className={inputCls} value={department} onChange={(e) => setDepartment(e.target.value)}>
              {STOCK_DEPARTMENTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="cl-freq" className="mb-1.5 block text-xs font-medium text-muted-foreground">How often</label>
            <select id="cl-freq" className={inputCls} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              {CHECKLIST_FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        </div>

        <h3 className="mt-5 text-sm font-semibold">Items</h3>
        <div className="mt-2 space-y-2">
          {items.map((it, idx) => (
            <div key={it.id} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-2">
              <input aria-label={`Section for item ${idx + 1}`} className={cn(inputCls, "px-2 text-xs")} maxLength={80} value={it.section ?? ""}
                     onChange={(e) => setItem(it.id, { section: e.target.value })} placeholder="Section" />
              <input aria-label={`Item ${idx + 1}`} className={inputCls} maxLength={300} value={it.label}
                     onChange={(e) => setItem(it.id, { label: e.target.value })} placeholder="What to check" />
              <div className="flex">
                <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label={`Move item ${idx + 1} up`}
                        className="flex h-9 w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => move(idx, 1)} disabled={idx === items.length - 1} aria-label={`Move item ${idx + 1} down`}
                        className="flex h-9 w-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => setItems((xs) => (xs.length > 1 ? xs.filter((x) => x.id !== it.id) : xs))} aria-label={`Remove item ${idx + 1}`}
                        className="flex h-9 w-8 items-center justify-center text-muted-foreground hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setItems((xs) => [...xs, { id: newItemId(), label: "", section: xs[xs.length - 1]?.section ?? "" }])}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
          <Plus className="h-3.5 w-3.5" /> Add an item
        </button>

        {error && <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        <div className="mt-5 flex gap-2">
          {template && (
            <button type="button" onClick={() => void remove()} disabled={busy}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition hover:border-red-500/40 hover:text-red-300">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
          <button type="submit" disabled={busy || !title.trim() || !filled.length}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {template ? "Save changes" : "Save checklist"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Starter library ─────────────────────────────────────────────────────────
function LibraryPicker({ used, onClose, onAdded }: { used: Set<string>; onClose: () => void; onAdded: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const add = async (key: string) => {
    setBusy(key); setError(null);
    try { await clRequest({ kind: "template" }, { method: "POST", body: JSON.stringify({ library: key }) }); onAdded(); } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add it."); setBusy(null);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Starter checklists</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Add one to your vessel, then edit it to match your own procedures.</p>
        <div className="mt-4 space-y-2">
          {CHECKLIST_LIBRARY.map((e) => {
            const added = used.has(e.title);
            return (
              <div key={e.key} className="flex items-center gap-3 rounded-xl border border-border bg-background/30 p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{e.title}</div>
                  <div className="text-xs text-muted-foreground">{deptLabel(e.department)} · {frequencyLabel(e.frequency)} · {e.items.length} items</div>
                </div>
                <button type="button" onClick={() => void add(e.key)} disabled={!!busy}
                        className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition disabled:opacity-50",
                          added ? "border border-border text-muted-foreground hover:text-foreground" : "bg-primary text-primary-foreground hover:brightness-110")}>
                  {busy === e.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} {added ? "Add again" : "Add"}
                </button>
              </div>
            );
          })}
        </div>
        {error && <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
      </div>
    </div>
  );
}

// ── Running a checklist ─────────────────────────────────────────────────────
function RunScreen({ run, canEdit, onClose, onChanged, onFinished }: {
  run: Run; canEdit: boolean; onClose: () => void; onChanged: (r: Run) => void; onFinished: () => void;
}) {
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [runNotes, setRunNotes] = useState(run.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = run.status === "in_progress" && canEdit;
  const p = runProgress(run.items, run.results);

  const sections = useMemo(() => {
    const out: Array<{ name: string; items: ChecklistItem[] }> = [];
    for (const it of run.items) {
      const name = it.section?.trim() || "";
      const last = out[out.length - 1];
      if (last && last.name === name) last.items.push(it); else out.push({ name, items: [it] });
    }
    return out;
  }, [run.items]);

  const patchItem = async (itemId: string, patch: { done?: boolean; note?: string | null }) => {
    // Show the tick straight away; the server's merged results replace it.
    const optimistic = { ...run.results, [itemId]: { ...(run.results[itemId] ?? { done: false }), ...patch } };
    onChanged({ ...run, results: optimistic });
    try {
      const res = await clRequest({ kind: "run", id: run.id }, { method: "PATCH", body: JSON.stringify({ item: itemId, ...patch }) });
      onChanged({ ...run, results: res.results ?? optimistic });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that tick.");
      onChanged(run);
    }
  };

  const complete = async () => {
    if (p.done < p.total && !confirm(`${p.total - p.done} item${p.total - p.done === 1 ? " isn't" : "s aren't"} ticked. Complete anyway?`)) return;
    setBusy(true); setError(null);
    try {
      if ((run.notes ?? "") !== runNotes) await clRequest({ kind: "run", id: run.id }, { method: "PATCH", body: JSON.stringify({ notes: runNotes }) });
      await clRequest({ kind: "run", id: run.id, action: "complete" }, { method: "POST", body: "{}" });
      onFinished();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete it."); setBusy(false);
    }
  };
  const discard = async () => {
    if (!confirm("Discard this run? Nothing ticked so far is kept.")) return;
    setBusy(true);
    try { await clRequest({ kind: "run", id: run.id }, { method: "DELETE" }); onFinished(); } catch (e) {
      setError(e instanceof Error ? e.message : "Could not discard it."); setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[96vh] w-full max-w-2xl flex-col rounded-t-3xl border border-border bg-card sm:rounded-3xl">
        <div className="border-b border-border/60 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold">{run.title}</h2>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {run.status === "completed"
                  ? `Completed ${fmtWhen(run.completed_at)}${run.completed_by_name ? ` by ${run.completed_by_name}` : ""}`
                  : `Started ${fmtWhen(run.started_at)}${run.started_by_name ? ` by ${run.started_by_name}` : ""}`}
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
            </div>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">{p.done}/{p.total}</span>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
          {sections.map((sec, si) => (
            <div key={`${sec.name}-${si}`}>
              {sec.name && <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{sec.name}</div>}
              <div className="space-y-1.5">
                {sec.items.map((it) => {
                  const r = run.results[it.id];
                  const done = !!r?.done;
                  return (
                    <div key={it.id} className={cn("rounded-xl border p-1", done ? "border-primary/30 bg-primary/5" : "border-border bg-background/30")}>
                      <div className="flex items-center gap-2">
                        <button type="button" role="checkbox" aria-checked={done} disabled={!live}
                                onClick={() => void patchItem(it.id, { done: !done })}
                                className="flex min-h-11 flex-1 items-center gap-3 rounded-lg px-2 text-left text-sm disabled:cursor-default">
                          <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition",
                            done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                            {done && <Check className="h-4 w-4" strokeWidth={3} />}
                          </span>
                          <span className={cn(done && "text-muted-foreground")}>{it.label}</span>
                        </button>
                        {(live || r?.note) && (
                          <button type="button" onClick={() => { setNoteOpen(noteOpen === it.id ? null : it.id); setNoteDraft(r?.note ?? ""); }}
                                  aria-label={`Note for ${it.label}`} disabled={!live && !r?.note}
                                  className={cn("flex h-9 w-9 items-center justify-center rounded-lg transition", r?.note ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
                            <MessageSquare className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {done && r?.by && <div className="px-11 pb-1 text-[10px] text-muted-foreground">{r.by}{r.at ? ` · ${fmtWhen(r.at)}` : ""}</div>}
                      {noteOpen === it.id && (
                        live ? (
                          <div className="flex gap-2 px-2 pb-2">
                            <input aria-label="Note" autoFocus className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary/60"
                                   maxLength={1000} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="What did you find?" />
                            <button type="button" onClick={() => { void patchItem(it.id, { note: noteDraft || null }); setNoteOpen(null); }}
                                    className="rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">Save</button>
                          </div>
                        ) : <div className="px-11 pb-2 text-sm text-muted-foreground">{r?.note}</div>
                      )}
                      {noteOpen !== it.id && r?.note && <div className="px-11 pb-2 text-xs text-muted-foreground">{r.note}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div>
            <label htmlFor="run-notes" className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</label>
            {live ? (
              <textarea id="run-notes" className={cn(inputCls, "min-h-[72px]")} maxLength={4000} value={runNotes}
                        onChange={(e) => setRunNotes(e.target.value)} placeholder="Anything to hand over or follow up" />
            ) : <p className="text-sm text-muted-foreground">{run.notes || "—"}</p>}
          </div>
          {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        </div>

        {live && (
          <div className="flex gap-2 border-t border-border/60 p-4 sm:p-5">
            <button type="button" onClick={() => void discard()} disabled={busy}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground">
              Discard
            </button>
            <button type="button" onClick={() => void complete()} disabled={busy}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Complete checklist
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
