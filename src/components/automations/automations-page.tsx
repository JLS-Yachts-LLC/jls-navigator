import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Zap, Clock, Webhook, MousePointerClick, Activity, Search, Loader2,
  CheckCircle2, XCircle, CircleDot, Calendar, ExternalLink, PlugZap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Automation = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string | null;
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

type RunRow = { automation_key: string; status: string; started_at: string };
type KeyStats = { runs: number; success: number; error: number; retry: number; hit: number; lastRun: string | null };

export function AutomationsPage() {
  const [items, setItems] = useState<Automation[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [{ data, error }, { data: runData }] = await Promise.all([
      fetchAllRows(() => (supabase as any).from("automations").select("*").order("category").order("name")),
      fetchAllRows(() => (supabase as any).from("automation_runs").select("automation_key, status, started_at").gte("started_at", since)),
    ]);
    if (error) toast.error(error.message);
    else setItems((data ?? []) as Automation[]);
    setRuns((runData ?? []) as RunRow[]);
    setLoading(false);
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

  const filtered = useMemo(() => items.filter(a => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [a.name, a.description, a.category, a.schedule].filter(Boolean).join(" ").toLowerCase().includes(s);
  }), [items, q]);

  const groups = useMemo(() => {
    const m = new Map<string, Automation[]>();
    for (const a of filtered) {
      const c = a.category ?? "Other";
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(a);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const stats = useMemo(() => {
    let runs = 0, errors = 0, retries = 0;
    for (const s of statsByKey.values()) { runs += s.runs; errors += s.error; retries += s.retry; }
    return { total: items.length, runs, errors, retries };
  }, [items, statsByKey]);

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
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search automations…" className="h-9 w-56 pl-8 text-sm" />
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
        {loading ? (
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
                      </div>
                      {/* Enable toggle */}
                      <button
                        onClick={() => toggle(a)}
                        disabled={busy === a.id}
                        title={a.enabled ? "Disable" : "Enable"}
                        className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", a.enabled ? "bg-primary" : "bg-muted")}
                      >
                        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", a.enabled ? "left-[18px]" : "left-0.5")} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
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
