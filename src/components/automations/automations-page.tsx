import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Zap, Clock, Webhook, MousePointerClick, Activity, Search, Loader2,
  CheckCircle2, XCircle, CircleDot, Calendar, ExternalLink, PlugZap,
  ListOrdered, History, ChevronDown, Trash2, RotateCcw, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LightspeedSkuSyncPanel } from "@/components/lightspeed/sku-sync-panel";
import {
  getAutomationSteps, getAutomationRuns,
  type StepsResult, type RunsResult,
} from "@/lib/automations-hub.server";

type Automation = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string | null;
  department: string | null;
  trigger_type: "schedule" | "webhook" | "event" | "manual";
  schedule: string | null;
  cron: string | null;
  source: string | null;
  endpoint: string | null;
  enabled: boolean;
  config?: Record<string, any> | null;
  last_run_at: string | null;
  last_status: string | null;
  last_detail: string | null;
};

// Department mini tabs — fixed order; "All" first, Platform last.
const DEPARTMENTS = ["Finance", "Immigration", "Logistics", "Training", "Yacht IT Solutions", "Operations", "Lightspeed", "Platform"] as const;
// Sentinel dept value for the cross-automation Executions log tab.
const EXECUTIONS_TAB = "__executions";

const TRIGGER_META: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  schedule: { label: "Scheduled", icon: Clock,             color: "bg-blue-500/15 text-blue-400" },
  webhook:  { label: "Webhook",   icon: Webhook,           color: "bg-violet-500/15 text-violet-400" },
  event:    { label: "Event",     icon: Activity,          color: "bg-amber-500/15 text-amber-400" },
  manual:   { label: "Manual",    icon: MousePointerClick, color: "bg-slate-500/15 text-slate-400" },
};

const SOURCE_LABEL: Record<string, string> = {
  "worker-cron": "Worker", "edge-function": "Edge Function", "n8n": "n8n",
};

function fmtWhen(iso: string | null) {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

type RunRow = { automation_key: string; status: string; started_at: string; finished_at?: string | null; detail?: string | null };
type KeyStats = { runs: number; success: number; error: number; retry: number; hit: number; lastRun: string | null };

export function AutomationsPage() {
  const [items, setItems] = useState<Automation[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [dept, setDept] = useState<string>("All");
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { void load(); }, []);

  // Live view: silently re-pull automations + run log every minute so new
  // executions (webhooks, crons) appear without a manual reload.
  useEffect(() => {
    const t = setInterval(() => void load({ silent: true }), 60_000);
    return () => clearInterval(t);
  }, []);

  async function doDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await (supabase as any).from("automations").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    setItems(prev => prev.filter(x => x.id !== deleteTarget.id));
    toast.success(`Deleted "${deleteTarget.name}"`);
    setDeleteTarget(null);
  }

  async function load(opts: { silent?: boolean } = {}) {
    if (!opts.silent) setLoading(true);
    setRefreshing(true);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [{ data, error }, { data: runData }] = await Promise.all([
      fetchAllRows(() => (supabase as any).from("automations").select("*").order("category").order("name")),
      fetchAllRows(() => (supabase as any).from("automation_runs").select("automation_key, status, started_at, finished_at, detail").gte("started_at", since)),
    ]);
    if (error) { if (!opts.silent) toast.error(error.message); }
    else setItems((data ?? []) as Automation[]);
    setRuns((runData ?? []) as RunRow[]);
    setLoading(false);
    setRefreshing(false);
  }

  // Per-automation run metrics over the last 30 days (hits / success / errors / retries).
  const statsByKey = useMemo(() => {
    const m = new Map<string, KeyStats>();
    for (const r of runs) {
      const k = r.automation_key;
      const s = m.get(k) ?? { runs: 0, success: 0, error: 0, retry: 0, hit: 0, lastRun: null };
      s.runs++;
      if (r.status === "success") s.success++;
      else if (r.status === "error") s.error++;
      else if (r.status === "retry") s.retry++;
      else if (r.status === "hit") s.hit++;
      if (!s.lastRun || r.started_at > s.lastRun) s.lastRun = r.started_at;
      m.set(k, s);
    }
    return m;
  }, [runs]);

  async function toggle(a: Automation) {
    setBusy(a.id);
    const next = !a.enabled;
    setItems(prev => prev.map(x => x.id === a.id ? { ...x, enabled: next } : x));
    const { error } = await (supabase as any)
      .from("automations").update({ enabled: next, updated_at: new Date().toISOString() }).eq("id", a.id);
    if (error) { toast.error(error.message); setItems(prev => prev.map(x => x.id === a.id ? { ...x, enabled: a.enabled } : x)); }
    else toast.success(`${a.name} ${next ? "enabled" : "disabled"}`);
    setBusy(null);
  }

  const deptOf = (a: Automation) => a.department ?? "Platform";

  const deptCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of items) m.set(deptOf(a), (m.get(deptOf(a)) ?? 0) + 1);
    return m;
  }, [items]);

  const filtered = useMemo(() => items.filter(a => {
    if (dept !== "All" && dept !== EXECUTIONS_TAB && deptOf(a) !== dept) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [a.name, a.description, a.category, a.department, a.schedule].filter(Boolean).join(" ").toLowerCase().includes(s);
  }), [items, q, dept]);

  const groups = useMemo(() => {
    const m = new Map<string, Automation[]>();
    for (const a of filtered) {
      const c = a.category ?? "Other";
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(a);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // Figures reflect the active tab (and search) — "All" shows the platform totals.
  const stats = useMemo(() => {
    let runs = 0, errors = 0, retries = 0;
    for (const a of filtered) {
      const s = statsByKey.get(a.key);
      if (!s) continue;
      runs += s.runs; errors += s.error; retries += s.retry;
    }
    return { total: filtered.length, runs, errors, retries };
  }, [filtered, statsByKey]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Platform</div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" /> Automations
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search automations…" className="h-9 w-56 pl-8 text-sm" />
          </div>
          <button
            onClick={() => void load({ silent: true })}
            disabled={refreshing}
            title="Refresh now (auto-refreshes every minute)"
            className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Refresh
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 px-6 py-3 border-b border-border/40 bg-muted/10">
        {[
          { label: "Automations", value: stats.total, color: "text-foreground" },
          { label: "Runs (30d)", value: stats.runs, color: "text-blue-400" },
          { label: "Errors (30d)", value: stats.errors, color: stats.errors ? "text-red-400" : "text-muted-foreground" },
          { label: "Retries (30d)", value: stats.retries, color: stats.retries ? "text-amber-400" : "text-muted-foreground" },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-border bg-card/60 px-3 py-2">
            <div className={cn("text-lg font-bold", s.color)}>{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Department mini tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 bg-card/30 px-4">
        {["All", ...DEPARTMENTS].map((d) => (
          <button key={d} onClick={() => setDept(d)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
                    dept === d ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}>
            {d}
            <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {d === "All" ? items.length : (deptCounts.get(d) ?? 0)}
            </span>
          </button>
        ))}
        <button
          onClick={() => setDept(EXECUTIONS_TAB)}
          className={cn(
            "flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
            dept === EXECUTIONS_TAB ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          Executions
          {runs.filter(r => r.status === "error").length > 0 && (
            <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-red-400">
              {runs.filter(r => r.status === "error").length}
            </span>
          )}
        </button>
      </div>

      {/* n8n import notice */}
      <div className="mx-6 mt-4 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
        <PlugZap className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold text-amber-400">n8n workflows imported as references.</span> Items tagged <span className="font-mono">n8n</span> are live in n8n (pulled from the API) and link straight to their workflow.
          Items tagged <span className="font-mono">Worker</span> run natively in the platform. Porting the n8n workflows to native edge functions is done per-workflow as a follow-up (each needs its integration credentials — QuickBooks, Lightspeed, Monday, OneDrive).
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {dept === EXECUTIONS_TAB ? (
          <ExecutionsLog runs={runs} items={items} q={q} onReload={load} />
        ) : loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : groups.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-16">No automations match your search.</div>
        ) : groups.map(([category, autos]) => (
          <div key={category}>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">{category}</div>
            <div className="space-y-2">
              {autos.map(a => {
                const t = TRIGGER_META[a.trigger_type] ?? TRIGGER_META.manual;
                const TIcon = t.icon;
                const rs = statsByKey.get(a.key);
                return (
                  <div key={a.id} className={cn("rounded-xl border p-4 transition-colors", a.enabled ? "border-border/60 bg-card/60" : "border-border/40 bg-card/30 opacity-70")}>
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <TIcon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{a.name}</span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", t.color)}>{t.label}</span>
                          {a.source && <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">{SOURCE_LABEL[a.source] ?? a.source}</span>}
                        </div>
                        {a.description && <p className="text-xs text-muted-foreground mt-1">{a.description}</p>}
                        <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground/70">
                          {a.schedule && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{a.schedule}</span>}
                          <span className="inline-flex items-center gap-1">
                            {a.last_status === "success" ? <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                              : a.last_status === "error" ? <XCircle className="h-3 w-3 text-red-400" />
                              : <CircleDot className="h-3 w-3 text-muted-foreground/50" />}
                            Last run: {fmtWhen(a.last_run_at)}
                          </span>
                          {a.endpoint && <a href={a.endpoint} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><ExternalLink className="h-3 w-3" /> {a.source === "n8n" ? "Open in n8n" : "Run URL"}</a>}
                        </div>
                        {/* Per-automation configuration (e.g. email recipients) */}
                        {a.key === "weekly-fleet-finance" && <RecipientsEditor automation={a} onSaved={(cfg) => setItems(prev => prev.map(x => x.id === a.id ? { ...x, config: cfg } : x))} />}
                        {a.key === "qb-invoice-pdf" && <InvoicePdfTester />}
                        {a.key === "lightspeed-item-sync" && <LightspeedSkuSyncPanel />}
                        {/* Run metrics — last 30 days */}
                        {rs && rs.runs > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground" title="Total runs in the last 30 days">{rs.runs} run{rs.runs !== 1 ? "s" : ""}</span>
                            {rs.success > 0 && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500">{rs.success} ok</span>}
                            {rs.error > 0 && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-500">{rs.error} error{rs.error !== 1 ? "s" : ""}</span>}
                            {rs.retry > 0 && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">{rs.retry} retr{rs.retry !== 1 ? "ies" : "y"}</span>}
                            {rs.hit > 0 && <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-500">{rs.hit} hit{rs.hit !== 1 ? "s" : ""}</span>}
                          </div>
                        )}
                        {/* Step-by-step + full run log */}
                        <AutomationDetail automation={a} />
                      </div>
                      {/* Actions: enable toggle + delete */}
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => toggle(a)}
                          disabled={busy === a.id}
                          title={a.enabled ? "Disable" : "Enable"}
                          className={cn("relative h-5 w-9 rounded-full transition-colors", a.enabled ? "bg-primary" : "bg-muted")}
                        >
                          <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", a.enabled ? "left-[18px]" : "left-0.5")} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(a)}
                          title="Delete automation"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this automation?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> will be permanently removed from the Automations list.
              {deleteTarget?.source === "n8n"
                ? " This only removes the reference card here — it does not touch the workflow in n8n itself."
                : " Its underlying code isn't affected; a worker automation may re-appear the next time it runs."}
              {" "}This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void doDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Executions log — cross-automation run history for troubleshooting ─────────
function ExecutionsLog({
  runs, items, q, onReload,
}: {
  runs: RunRow[];
  items: Automation[];
  q: string;
  onReload: () => void;
}) {
  const [errorsOnly, setErrorsOnly] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  const byKey = useMemo(() => {
    const m = new Map<string, Automation>();
    for (const a of items) m.set(a.key, a);
    return m;
  }, [items]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...runs]
      .sort((a, b) => (a.started_at > b.started_at ? -1 : 1))
      .filter((r) => (!errorsOnly || r.status === "error"))
      .filter((r) => {
        if (!s) return true;
        const name = byKey.get(r.automation_key)?.name ?? r.automation_key;
        return `${name} ${r.detail ?? ""} ${r.automation_key}`.toLowerCase().includes(s);
      })
      .slice(0, 300);
  }, [runs, errorsOnly, q, byKey]);

  async function retry(r: RunRow) {
    const a = byKey.get(r.automation_key);
    if (!a?.endpoint || a.source === "n8n") return;
    const id = r.started_at + r.automation_key;
    setRetrying(id);
    try {
      const { data: { session } } = await (supabase as any).auth.getSession();
      const res = await fetch(a.endpoint, { method: "POST", headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`Re-ran ${a.name}`);
      setTimeout(onReload, 800);
    } catch (e: any) {
      toast.error(e?.message ?? "Retry failed");
    } finally {
      setRetrying(null);
    }
  }

  const dur = (r: RunRow) => {
    if (!r.finished_at) return "—";
    const ms = new Date(r.finished_at).getTime() - new Date(r.started_at).getTime();
    if (ms < 0) return "—";
    return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setErrorsOnly(true)}
            className={cn("rounded-full px-3 py-1 text-xs font-semibold transition", errorsOnly ? "bg-red-500/15 text-red-400" : "text-muted-foreground hover:bg-accent")}
          >Errors only</button>
          <button
            onClick={() => setErrorsOnly(false)}
            className={cn("rounded-full px-3 py-1 text-xs font-semibold transition", !errorsOnly ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent")}
          >All executions</button>
        </div>
        <button onClick={onReload} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {errorsOnly ? "No errors in the last 30 days 🎉" : "No executions recorded."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/20 text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">When</th>
                <th className="px-3 py-2 font-semibold">Automation</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Detail</th>
                <th className="px-3 py-2 font-semibold">Duration</th>
                <th className="px-3 py-2 font-semibold text-right">Retry</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const a = byKey.get(r.automation_key);
                const canRetry = !!a?.endpoint && a.source !== "n8n";
                const id = r.started_at + r.automation_key;
                return (
                  <tr key={i} className="border-t border-border/40 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-[12px] text-muted-foreground">{fmtWhen(r.started_at)}</td>
                    <td className="px-3 py-2 font-medium">{a?.name ?? r.automation_key}</td>
                    <td className="px-3 py-2">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        r.status === "success" ? "bg-emerald-500/15 text-emerald-400"
                          : r.status === "error" ? "bg-red-500/15 text-red-400"
                          : r.status === "retry" ? "bg-amber-500/15 text-amber-500"
                          : "bg-violet-500/15 text-violet-400")}>
                        {r.status === "success" ? <CheckCircle2 className="h-3 w-3" /> : r.status === "error" ? <XCircle className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
                        {r.status}
                      </span>
                    </td>
                    <td className="max-w-[520px] px-3 py-2 text-[12px] text-muted-foreground">
                      <span className={cn(r.status === "error" && "text-red-400/90")}>{r.detail || "—"}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-[12px] text-muted-foreground tabular-nums">{dur(r)}</td>
                    <td className="px-3 py-2 text-right">
                      {canRetry ? (
                        <button
                          onClick={() => void retry(r)}
                          disabled={retrying === id}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-foreground/80 hover:bg-accent disabled:opacity-50"
                        >
                          {retrying === id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Re-run
                        </button>
                      ) : a?.source === "n8n" && a.endpoint ? (
                        <a href={a.endpoint} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                          <ExternalLink className="h-3 w-3" /> n8n
                        </a>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/50" title="Event-driven — re-runs automatically on the next trigger">auto</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Recipients editor for automations that email a configured list (config.recipients).
function RecipientsEditor({ automation, onSaved }: { automation: Automation; onSaved: (cfg: Record<string, any>) => void }) {
  const initial = ((automation.config as any)?.recipients ?? []).join(", ");
  const [value, setValue] = useState<string>(initial);
  const [saving, setSaving] = useState(false);
  const dirty = value.trim() !== initial.trim();

  async function save() {
    const recipients = value.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => /.+@.+\..+/.test(s));
    setSaving(true);
    try {
      const cfg = { ...(automation.config ?? {}), recipients };
      const { error } = await (supabase as any).from("automations")
        .update({ config: cfg, updated_at: new Date().toISOString() }).eq("id", automation.id);
      if (error) throw error;
      setValue(recipients.join(", "));
      onSaved(cfg);
      toast.success(recipients.length ? `Recipients saved (${recipients.length})` : "Recipients cleared — the email won't send until some are set");
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Recipients</span>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. m.peeters@jlsyachts.com, accounts@jlsyachts.com"
        className="h-7 w-80 max-w-full text-xs"
      />
      {dirty && (
        <Button size="sm" onClick={save} disabled={saving} className="h-7 gap-1 text-xs">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />} Save
        </Button>
      )}
    </div>
  );
}

// ── Step-by-step view + full run log (expandable per automation) ──────────────
function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

const RUN_STATUS_CLS: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-400",
  error: "bg-red-500/15 text-red-400",
  crashed: "bg-red-500/15 text-red-400",
  failed: "bg-red-500/15 text-red-400",
  retry: "bg-amber-500/15 text-amber-400",
  waiting: "bg-blue-500/15 text-blue-400",
  running: "bg-blue-500/15 text-blue-400",
  hit: "bg-violet-500/15 text-violet-400",
};

function AutomationDetail({ automation }: { automation: Automation }) {
  const [open, setOpen] = useState<"steps" | "runs" | null>(null);
  const [steps, setSteps] = useState<StepsResult | null>(null);
  const [runLog, setRunLog] = useState<RunsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const show = useCallback(async (what: "steps" | "runs") => {
    if (open === what) { setOpen(null); return; }
    setOpen(what);
    setLoading(true);
    try {
      if (what === "steps" && !steps) setSteps(await (getAutomationSteps as any)({ data: { key: automation.key } }));
      if (what === "runs") setRunLog(await (getAutomationRuns as any)({ data: { key: automation.key } }));
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load");
    } finally { setLoading(false); }
  }, [open, steps, automation.key]);

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => void show("steps")}
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                              open === "steps" ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
          <ListOrdered className="h-3 w-3" /> Steps
          <ChevronDown className={cn("h-3 w-3 transition-transform", open === "steps" && "rotate-180")} />
        </button>
        <button onClick={() => void show("runs")}
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                              open === "runs" ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
          <History className="h-3 w-3" /> Run log
          <ChevronDown className={cn("h-3 w-3 transition-transform", open === "runs" && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="mt-2 rounded-lg border border-border/60 bg-background/40 p-3">
          {loading ? (
            <div className="flex h-16 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : open === "steps" ? (
            !steps || (!steps.ok && !steps.steps.length) ? (
              <p className="text-xs text-muted-foreground">{steps?.note ?? "No step data."}</p>
            ) : (
              <ol className="space-y-1.5">
                {steps.steps.map((s, i) => (
                  <li key={`${s.name}-${i}`} className="flex items-start gap-2.5 text-xs">
                    <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold tabular-nums text-primary" style={{ width: 18, height: 18 }}>
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="font-medium text-foreground/90">{s.name}</span>
                      {s.type && <span className="ml-1.5 rounded bg-muted/60 px-1 py-px text-[9px] font-mono text-muted-foreground">{s.type}</span>}
                      {s.note && <span className="block text-[11px] text-muted-foreground">{s.note}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )
          ) : (
            !runLog || (!runLog.ok && !runLog.runs.length) ? (
              <p className="text-xs text-muted-foreground">{runLog?.note ?? "No runs recorded."}</p>
            ) : runLog.runs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No runs recorded yet.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground/60">
                      <th className="pb-1.5 pr-3">Started</th>
                      <th className="pb-1.5 pr-3">Duration</th>
                      <th className="pb-1.5 pr-3">Status</th>
                      <th className="pb-1.5">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runLog.runs.map((r, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-foreground/80">{fmtWhen(r.started_at)}</td>
                        <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-foreground/70">{fmtDuration(r.duration_ms)}</td>
                        <td className="py-1.5 pr-3">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", RUN_STATUS_CLS[r.status] ?? "bg-muted/60 text-muted-foreground")}>
                            {r.status}
                          </span>
                        </td>
                        <td className="max-w-[380px] truncate py-1.5 text-muted-foreground" title={r.detail ?? ""}>{r.detail ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// Tester for the native QB Invoice PDF: preview the rendered document for any
// QuickBooks invoice id (no writes), or force a full generate-and-attach run.
function InvoicePdfTester() {
  const [id, setId] = useState("");
  const [busy, setBusy] = useState<"preview" | "attach" | null>(null);

  async function call(mode: "preview" | "attach") {
    if (!id.trim()) return;
    setBusy(mode);
    try {
      const { data: { session } } = await (supabase as any).auth.getSession();
      const token = session?.access_token ?? "";
      const url = `/api/qb/invoice-pdf?id=${encodeURIComponent(id.trim())}${mode === "attach" ? "&force=1" : ""}`;
      const res = await fetch(url, {
        method: mode === "preview" ? "GET" : "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (mode === "preview") {
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
        const blob = await res.blob();
        window.open(URL.createObjectURL(blob), "_blank");
      } else {
        const j = await res.json();
        if (!res.ok || !j.ok) throw new Error(j.detail ?? j.error ?? `HTTP ${res.status}`);
        toast.success(`${j.detail}${j.deletedOld ? ` — ${j.deletedOld} old attachment(s) replaced` : ""}`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally { setBusy(null); }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Test with invoice id</span>
      <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="QBO invoice id, e.g. 55610" className="h-7 w-48 text-xs" />
      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!id.trim() || !!busy} onClick={() => void call("preview")}>
        {busy === "preview" && <Loader2 className="h-3 w-3 animate-spin" />} Preview PDF
      </Button>
      <Button size="sm" className="h-7 gap-1 text-xs" disabled={!id.trim() || !!busy} onClick={() => void call("attach")}>
        {busy === "attach" && <Loader2 className="h-3 w-3 animate-spin" />} Generate & attach now
      </Button>
    </div>
  );
}

// Form-based runner for the Lightspeed → QuickBooks item-description sync: paste
// one or more SKUs, hit Run, and each is looked up in Lightspeed and
// created/updated in the retail QuickBooks company. Shows a per-SKU result list.
type LsSkuResult = { sku: string; action: "created" | "updated" | "not-found" | "error"; detail: string };
type LsSyncResult = { ok: boolean; processed: number; created: number; updated: number; notFound: number; errors: number; results: LsSkuResult[] };

const LS_ACTION_CLS: Record<string, string> = {
  created: "bg-emerald-500/15 text-emerald-500",
  updated: "bg-blue-500/15 text-blue-400",
  "not-found": "bg-amber-500/15 text-amber-500",
  error: "bg-red-500/15 text-red-500",
};

function LightspeedSyncForm() {
  const [skus, setSkus] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LsSyncResult | null>(null);

  async function run() {
    if (!skus.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const { data: { session } } = await (supabase as any).auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/lightspeed/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ skus }),
      });
      const j = await res.json();
      if (!res.ok && !j.results) throw new Error(j.error ?? `HTTP ${res.status}`);
      setResult(j as LsSyncResult);
      const j2 = j as LsSyncResult;
      if (j2.errors) toast.error(`${j2.created + j2.updated} done, ${j2.errors} error(s)`);
      else toast.success(`${j2.created} created, ${j2.updated} updated${j2.notFound ? `, ${j2.notFound} not found` : ""}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-2.5 rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        Update item & invoice descriptions — enter SKUs
      </div>
      <Textarea
        value={skus}
        onChange={(e) => setSkus(e.target.value)}
        placeholder={"One or more SKUs, separated by commas or new lines\ne.g. SY-10432, SY-10433"}
        rows={3}
        className="text-xs font-mono"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" className="h-7 gap-1 text-xs" disabled={!skus.trim() || busy} onClick={() => void run()}>
          {busy && <Loader2 className="h-3 w-3 animate-spin" />} Run sync
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Looks up each SKU in Lightspeed, then updates or creates the matching item in the retail QuickBooks company.
        </span>
      </div>
      {result && (
        <div className="mt-2.5 max-h-64 overflow-y-auto rounded-md border border-border/50">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground/60">
                <th className="px-2 py-1.5">SKU</th>
                <th className="px-2 py-1.5">Result</th>
                <th className="px-2 py-1.5">Detail</th>
              </tr>
            </thead>
            <tbody>
              {result.results.map((r, i) => (
                <tr key={`${r.sku}-${i}`} className="border-t border-border/40">
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-foreground/80">{r.sku}</td>
                  <td className="px-2 py-1.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", LS_ACTION_CLS[r.action] ?? "bg-muted/60 text-muted-foreground")}>
                      {r.action}
                    </span>
                  </td>
                  <td className="max-w-[360px] truncate px-2 py-1.5 text-muted-foreground" title={r.detail}>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
