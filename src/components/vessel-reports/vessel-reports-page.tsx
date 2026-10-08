/**
 * Reports → Automated Reports — every client's scheduled email reports in one place.
 *
 *   All vessels   — every vessel against every report: set up, on/off, who it
 *                   goes to, whether the client manages it. Bulk opt-in.
 *   Activity      — every change (staff or client) and every send.
 *   Report types  — what each report contains, its default schedule.
 *
 * Everything is per vessel: nothing goes to a vessel that hasn't been opted in,
 * and each report has its own recipients. A report can be offered to the
 * client (client_can_manage), who can then switch it on/off and change its
 * recipients from the Client Portal (Email reports) — changes are marked as
 * theirs here. Settings live in vessel_report_subscriptions (RLS, staff); the
 * worker sends them (lib/vessel-reports/run.server).
 *
 * Access is Crew & Immigration: view to see everything, preview and send a test
 * to yourself; edit to opt vessels in or change anything, and to Send now. The
 * database (RLS) and /api/vessel-reports enforce the same.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarClock, Eye, FileDown, Loader2, Plus, Send, Ship, Trash2, X, FlaskConical, History,
  LayoutGrid, ListChecks, BookOpen, UserCheck, Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/lib/auth/useAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  VESSEL_REPORTS, REPORT_DAYS, describeReportSchedule, isEmail, reportLabel,
  type ReportKey, type ReportSchedule,
} from "@/lib/vessel-reports/catalogue";

const db = supabase as any;

type Yacht = { id: string; vessel_name: string };
type Sub = {
  id: string; yacht_id: string; report_key: ReportKey; enabled: boolean;
  recipients: string[]; cc: string[]; schedule: ReportSchedule;
  last_sent_at: string | null; last_status: string | null; last_error: string | null;
  client_can_manage: boolean; changed_by_kind: "staff" | "client" | null; changed_by_name: string | null; changed_at: string | null;
};
type Run = {
  id: string; yacht_id: string; report_key: string; trigger: string; status: string;
  recipients: string[]; summary: string | null; error: string | null; created_at: string;
};
type Event = {
  id: string; yacht_id: string; report_key: string; actor_kind: string; actor_name: string | null;
  action: string; detail: any; created_at: string;
};

const SUB_COLS = "id, yacht_id, report_key, enabled, recipients, cc, schedule, last_sent_at, last_status, last_error, client_can_manage, changed_by_kind, changed_by_name, changed_at";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" }) : "—";

const ACTION_LABEL: Record<string, string> = {
  opted_in: "opted the vessel in", removed: "removed it", switched_on: "switched it on", switched_off: "switched it off",
  recipients_changed: "changed who it goes to", schedule_changed: "changed the day/time",
  offered_to_client: "let the client manage it", withdrawn_from_client: "stopped the client managing it",
};

async function api(path: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session?.access_token ?? ""}`);
  return fetch(path, { ...init, headers });
}

type TabKey = "vessels" | "activity" | "types";
const TABS: Array<{ key: TabKey; label: string; icon: any }> = [
  { key: "vessels", label: "All vessels", icon: LayoutGrid },
  { key: "activity", label: "Activity", icon: History },
  { key: "types", label: "Report types", icon: BookOpen },
];

export function VesselReportsPage() {
  const { canAccessModule, loading: accessLoading } = useAccess();
  const canView = canAccessModule("crew_immigration", "view");
  const canEdit = canAccessModule("crew_immigration", "edit");
  const [tab, setTab] = useState<TabKey>("vessels");
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    const [y, s, r, e] = await Promise.all([
      db.from("yachts").select("id, vessel_name").eq("archive", false).order("vessel_name"),
      db.from("vessel_report_subscriptions").select(SUB_COLS),
      db.from("vessel_report_runs").select("id, yacht_id, report_key, trigger, status, recipients, summary, error, created_at").order("created_at", { ascending: false }).limit(100),
      db.from("vessel_report_events").select("id, yacht_id, report_key, actor_kind, actor_name, action, detail, created_at").order("created_at", { ascending: false }).limit(150),
    ]);
    setYachts(y.data ?? []); setSubs(s.data ?? []); setRuns(r.data ?? []); setEvents(e.data ?? []);
    setLoading(false);
  }
  useEffect(() => { if (canView) void load(); }, [canView]);

  const nameOf = useMemo(() => new Map(yachts.map((y) => [y.id, y.vessel_name])), [yachts]);
  const live = subs.filter((s) => s.enabled).length;
  const vesselsSetUp = new Set(subs.map((s) => s.yacht_id)).size;
  const clientManaged = subs.filter((s) => s.client_can_manage).length;

  if (accessLoading) return null;
  if (!canView) {
    return <div className="p-8 text-sm text-muted-foreground">Automated Reports needs access to Crew &amp; Immigration.</div>;
  }

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Automated Reports</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Reports emailed to each client on a schedule. Every vessel is opted in one report at a time, with its own
          recipients — nothing goes to a vessel that isn't set up and switched on here. Let the client manage a report and
          they can switch it on or off and change who receives it from their Client Portal.
          {!canEdit && " You have view-only access: you can preview reports and send yourself a test, but not change or send them."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border px-2.5 py-1">{vesselsSetUp} vessel{vesselsSetUp === 1 ? "" : "s"} set up</span>
        <span className={cn("rounded-full border px-2.5 py-1", live ? "border-emerald-500/40 text-emerald-400" : "border-border text-muted-foreground")}>{live} report{live === 1 ? "" : "s"} switched on</span>
        <span className="rounded-full border border-border px-2.5 py-1">{clientManaged} managed by the client</span>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" onClick={() => setTab(key)}
                  className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
                    tab === key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : tab === "vessels" ? (
        <VesselMatrix yachts={yachts} subs={subs} onOpen={setOpen} onChanged={load} canEdit={canEdit} />
      ) : tab === "activity" ? (
        <div className="space-y-5">
          <ChangeLog events={events} nameOf={nameOf} />
          <RecentRuns runs={runs} nameOf={nameOf} />
        </div>
      ) : (
        <ReportTypes subs={subs} />
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
          {open && (
            <VesselCard yachtId={open} vessel={nameOf.get(open) ?? "Vessel"} subs={subs.filter((s) => s.yacht_id === open)} onChanged={load} canEdit={canEdit} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── All vessels ─────────────────────────────────────────────────────────────

function cellOf(sub: Sub | undefined) {
  if (!sub) return { label: "Not set up", cls: "text-muted-foreground/70" };
  if (sub.enabled) return { label: "On", cls: "bg-emerald-500/15 text-emerald-400" };
  if (sub.changed_by_kind === "client") return { label: "Off by client", cls: "bg-amber-500/15 text-amber-400" };
  return { label: "Off", cls: "bg-muted text-muted-foreground" };
}

function VesselMatrix({ yachts, subs, onOpen, onChanged, canEdit }: {
  yachts: Yacht[]; subs: Sub[]; onOpen: (id: string) => void; onChanged: () => void; canEdit: boolean;
}) {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"setup" | "all">("setup");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const byVessel = useMemo(() => {
    const m = new Map<string, Map<string, Sub>>();
    for (const s of subs) { if (!m.has(s.yacht_id)) m.set(s.yacht_id, new Map()); m.get(s.yacht_id)!.set(s.report_key, s); }
    return m;
  }, [subs]);
  const rows = yachts.filter((y) => (scope === "all" || byVessel.has(y.id)) && (y.vessel_name ?? "").toLowerCase().includes(q.trim().toLowerCase()));
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function bulkOptIn(key: ReportKey) {
    const def = VESSEL_REPORTS.find((r) => r.key === key)!;
    const ids = [...selected].filter((id) => !byVessel.get(id)?.has(key));
    if (!ids.length) { toast.message(`Those vessels already have ${def.label}.`); return; }
    setBusy(true);
    const { error } = await db.from("vessel_report_subscriptions").insert(ids.map((id) => ({ yacht_id: id, report_key: key, schedule: def.defaultSchedule })));
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(`${def.label} set up for ${ids.length} vessel${ids.length === 1 ? "" : "s"} — switched off until you add recipients and turn it on.`); setSelected(new Set()); onChanged(); }
  }
  async function bulkClient(on: boolean) {
    const ids = subs.filter((s) => selected.has(s.yacht_id) && s.client_can_manage !== on).map((s) => s.id);
    if (!ids.length) { toast.message("Nothing to change for those vessels — set a report up first."); return; }
    setBusy(true);
    const { error } = await db.from("vessel_report_subscriptions").update({ client_can_manage: on }).in("id", ids);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(on ? "The clients can now manage those reports in their portal." : "Those reports are back to JLS-only."); setSelected(new Set()); onChanged(); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vessels…" className="h-9 w-64 pl-8" />
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
          {([["setup", "Set up"], ["all", "All vessels"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setScope(k)}
                    className={cn("rounded px-2.5 py-1", scope === k ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
        </div>
        {canEdit && selected.size > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2 py-1 text-xs">
            <span className="px-1 font-medium">{selected.size} selected</span>
            {VESSEL_REPORTS.map((r) => (
              <Button key={r.key} size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => void bulkOptIn(r.key)}>
                <Plus className="h-3 w-3" /> Opt in to {r.label}
              </Button>
            ))}
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => void bulkClient(true)}>
              <UserCheck className="h-3 w-3" /> Let client manage
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Ship className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {scope === "setup" ? "No vessel is set up for an automated report yet." : "No vessels match."}
          </p>
          {scope === "setup" && <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => setScope("all")}><Plus className="h-4 w-4" /> Choose vessels to opt in</Button>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2">
                  {canEdit && <Checkbox checked={rows.length > 0 && rows.every((y) => selected.has(y.id))}
                            onCheckedChange={(v) => setSelected(v ? new Set(rows.map((y) => y.id)) : new Set())} aria-label="Select all" />}
                </th>
                <th className="px-3 py-2">Vessel</th>
                {VESSEL_REPORTS.map((r) => <th key={r.key} className="px-3 py-2">{r.label}</th>)}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((y) => {
                const mine = byVessel.get(y.id);
                return (
                  <tr key={y.id} className="border-b border-border/40 align-top last:border-0 hover:bg-accent/10">
                    <td className="px-3 py-2.5">{canEdit && <Checkbox checked={selected.has(y.id)} onCheckedChange={() => toggleSel(y.id)} aria-label={`Select ${y.vessel_name}`} />}</td>
                    <td className="px-3 py-2.5 font-medium">
                      <button type="button" onClick={() => onOpen(y.id)} className="text-left hover:text-primary hover:underline">{y.vessel_name}</button>
                    </td>
                    {VESSEL_REPORTS.map((r) => {
                      const s = mine?.get(r.key);
                      const c = cellOf(s);
                      return (
                        <td key={r.key} className="px-3 py-2.5">
                          <button type="button" onClick={() => onOpen(y.id)} className="text-left">
                            <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold", c.cls)}>{c.label}</span>
                            {s && (
                              <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                                <div>{s.recipients.length ? `${s.recipients.length} recipient${s.recipients.length === 1 ? "" : "s"}` : "No recipients"} · {describeReportSchedule(s.schedule)}</div>
                                {s.client_can_manage && <div className="inline-flex items-center gap-1 text-sky-400"><UserCheck className="h-3 w-3" /> Client manages</div>}
                              </div>
                            )}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpen(y.id)}>{!canEdit ? "View" : mine ? "Configure" : "Set up"}</Button>
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

// ── Activity ────────────────────────────────────────────────────────────────

function ChangeLog({ events, nameOf }: { events: Event[]; nameOf: Map<string, string> }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Changes</h2>
        <span className="text-xs text-muted-foreground">who set up, switched or re-addressed what — staff and clients</span>
      </div>
      {events.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">No changes yet.</p> : (
        <ul className="divide-y divide-border/50">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 px-4 py-2 text-sm">
              <span className="w-28 shrink-0 text-xs text-muted-foreground">{when(e.created_at)}</span>
              <span className={cn("rounded px-1.5 py-px text-[10px] font-semibold uppercase", e.actor_kind === "client" ? "bg-sky-500/15 text-sky-400" : "bg-muted text-muted-foreground")}>
                {e.actor_kind === "client" ? "Client" : "JLS"}
              </span>
              <span><b>{e.actor_name ?? "Someone"}</b> {ACTION_LABEL[e.action] ?? e.action}</span>
              <span className="text-muted-foreground">— {reportLabel(e.report_key)}, {nameOf.get(e.yacht_id) ?? "vessel"}</span>
              {e.action === "recipients_changed" && Array.isArray(e.detail?.recipients) && (
                <span className="text-xs text-muted-foreground">→ {e.detail.recipients.join(", ") || "nobody"}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Report types ────────────────────────────────────────────────────────────

function ReportTypes({ subs }: { subs: Sub[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {VESSEL_REPORTS.map((r) => {
        const mine = subs.filter((s) => s.report_key === r.key);
        return (
          <section key={r.key} className="space-y-2 rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold">{r.label}</h2>
            <p className="text-sm text-muted-foreground">{r.description}</p>
            <div className="text-xs text-muted-foreground">Default: {describeReportSchedule(r.defaultSchedule)} · email with the PDF attached</div>
            <div className="flex flex-wrap gap-2 pt-1 text-xs">
              <span className="rounded-full border border-border px-2 py-0.5">{mine.length} vessel{mine.length === 1 ? "" : "s"} set up</span>
              <span className="rounded-full border border-border px-2 py-0.5">{mine.filter((s) => s.enabled).length} on</span>
              <span className="rounded-full border border-border px-2 py-0.5">{mine.filter((s) => s.client_can_manage).length} client-managed</span>
            </div>
          </section>
        );
      })}
      <section className="space-y-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground md:col-span-2">
        <b className="text-foreground">What the client sees.</b> A report you let the client manage appears under <i>Email reports</i> in their
        Client Portal. The Captain, officers and the vessel's management can switch it on or off and change who it goes to; the day and
        time stay yours. Their changes show as <span className="text-sky-400">Client</span> on the Activity tab.
      </section>
    </div>
  );
}

// ── One vessel ──────────────────────────────────────────────────────────────

function VesselCard({ yachtId, vessel, subs, onChanged, canEdit }: { yachtId: string; vessel: string; subs: Sub[]; onChanged: () => void; canEdit: boolean }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Ship className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">{vessel}</h2>
        <span className="text-xs text-muted-foreground">{subs.filter((s) => s.enabled).length} of {VESSEL_REPORTS.length} reports on</span>
      </div>
      <div className="divide-y divide-border">
        {VESSEL_REPORTS.map((r) => (
          <ReportRow key={r.key} yachtId={yachtId} vessel={vessel} report={r} sub={subs.find((s) => s.report_key === r.key) ?? null} onChanged={onChanged} canEdit={canEdit} />
        ))}
      </div>
    </section>
  );
}

function EmailList({ value, onChange, placeholder, readOnly = false }: { value: string[]; onChange: (v: string[]) => void; placeholder: string; readOnly?: boolean }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const bad = parts.filter((p) => !isEmail(p));
    const good = parts.filter(isEmail).filter((p) => !value.includes(p));
    if (good.length) onChange([...value, ...good]);
    if (bad.length) toast.error(`Not an email address: ${bad.join(", ")}`);
    setDraft(bad.join(" "));
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1">
      {value.map((e) => (
        <span key={e} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
          {e}
          {!readOnly && (
            <button type="button" onClick={() => onChange(value.filter((x) => x !== e))} className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${e}`}>
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {readOnly ? (!value.length && <span className="py-1 text-sm text-muted-foreground">Nobody yet</span>) : <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={value.length ? "" : placeholder}
             onKeyDown={(e) => { if (["Enter", ",", ";", "Tab"].includes(e.key) && draft.trim()) { e.preventDefault(); add(draft); } }}
             onBlur={() => draft.trim() && add(draft)}
             className="min-w-[180px] flex-1 bg-transparent py-1 text-sm outline-none" />}
    </div>
  );
}

function ReportRow({ yachtId, vessel, report, sub, onChanged, canEdit }: {
  yachtId: string; vessel: string; report: (typeof VESSEL_REPORTS)[number]; sub: Sub | null; onChanged: () => void; canEdit: boolean;
}) {
  const [recipients, setRecipients] = useState<string[]>(sub?.recipients ?? []);
  const [cc, setCc] = useState<string[]>(sub?.cc ?? []);
  const [schedule, setSchedule] = useState<ReportSchedule>(sub?.schedule ?? report.defaultSchedule);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string; summary: string } | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);

  useEffect(() => {
    setRecipients(sub?.recipients ?? []); setCc(sub?.cc ?? []); setSchedule(sub?.schedule ?? report.defaultSchedule);
  }, [sub?.id, sub?.recipients?.join(","), sub?.cc?.join(","), JSON.stringify(sub?.schedule)]);

  const dirty = !!sub && (recipients.join(",") !== sub.recipients.join(",") || cc.join(",") !== sub.cc.join(",") || JSON.stringify(schedule) !== JSON.stringify(sub.schedule));

  async function optIn() {
    setBusy("optin");
    const { error } = await db.from("vessel_report_subscriptions").insert({ yacht_id: yachtId, report_key: report.key, schedule: report.defaultSchedule });
    setBusy(null);
    if (error) toast.error(error.message); else onChanged();
  }
  async function save(patch: Partial<Sub>) {
    if (!sub) return;
    setBusy("save");
    const { error } = await db.from("vessel_report_subscriptions").update(patch).eq("id", sub.id);
    setBusy(null);
    if (error) { toast.error(error.message); return false; }
    onChanged(); return true;
  }
  async function toggle(on: boolean) {
    if (on && !recipients.length) { toast.error("Add at least one recipient first."); return; }
    // Saving the switch saves the edits with it, so what goes out is what's on screen.
    if (await save({ enabled: on, recipients, cc, schedule })) {
      toast.success(on ? `${report.label} for ${vessel} is on — next: ${describeReportSchedule(schedule)}` : `${report.label} for ${vessel} switched off`);
    }
  }
  async function remove() {
    if (!sub || !confirm(`Stop ${report.label} for ${vessel} and remove its settings?`)) return;
    const { error } = await db.from("vessel_report_subscriptions").delete().eq("id", sub.id);
    if (error) toast.error(error.message); else onChanged();
  }
  async function showPreview() {
    setBusy("preview");
    try {
      const r = await api(`/api/vessel-reports?preview=${report.key}&yachtId=${yachtId}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setPreview(j);
    } catch (e: any) { toast.error(e?.message ?? "Couldn't build the preview."); }
    finally { setBusy(null); }
  }
  async function openPdf() {
    setBusy("pdf");
    try {
      const r = await api(`/api/vessel-reports?preview=${report.key}&yachtId=${yachtId}&format=pdf`);
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Couldn't build the PDF.");
      const url = URL.createObjectURL(await r.blob());
      window.open(url, "_blank", "noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) { toast.error(e?.message); }
    finally { setBusy(null); }
  }
  async function send(action: "send" | "test") {
    if (!sub) return;
    setBusy(action); setConfirmSend(false);
    try {
      const r = await api("/api/vessel-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, subscriptionId: sub.id }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      toast.success(`${action === "test" ? "Test sent" : "Sent"} to ${j.sentTo.join(", ")} — ${j.summary}`);
      onChanged();
    } catch (e: any) { toast.error(e?.message ?? "Send failed."); }
    finally { setBusy(null); }
  }

  if (!sub) {
    return (
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{report.label}</div>
          <div className="text-xs text-muted-foreground">{report.description}</div>
        </div>
        <span className="text-xs text-muted-foreground">Not opted in</span>
        {canEdit && <Button size="sm" variant="outline" disabled={busy === "optin"} onClick={() => void optIn()} className="gap-1.5">
          {busy === "optin" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Opt in
        </Button>}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3 px-4 py-4", sub.enabled && "bg-emerald-500/[0.03]")}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            {report.label}
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
              sub.enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground")}>{sub.enabled ? "On" : "Off"}</span>
          </div>
          <div className="text-xs text-muted-foreground">{report.description}</div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={sub.enabled} disabled={!canEdit || busy === "save"} onCheckedChange={(v) => void toggle(v)} />
            {sub.enabled ? "Sending" : "Switched off"}
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground" title="Shows this report under Email reports in the Client Portal, where the vessel's Captain, officers and management can switch it on/off and change its recipients">
            <Switch checked={sub.client_can_manage} disabled={!canEdit || busy === "save"}
                    onCheckedChange={(v) => void save({ client_can_manage: v }).then((ok) => ok && toast.success(v ? "The client can now manage this in their portal." : "Back to JLS-only."))} />
            <UserCheck className="h-3.5 w-3.5" /> Client can manage in their portal
          </label>
        </div>
      </div>
      {sub.changed_by_kind === "client" && sub.changed_at && (
        <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-1.5 text-xs text-sky-300">
          Last changed by the client ({sub.changed_by_name ?? "portal user"}) on {when(sub.changed_at)} — they {sub.enabled ? "have it switched on" : "switched it off"}.
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Send to</div>
          <EmailList value={recipients} onChange={setRecipients} placeholder="captain@vessel.com, then Enter" readOnly={!canEdit} />
        </div>
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Copy (CC) — optional</div>
          <EmailList value={cc} onChange={setCc} placeholder="e.g. your JLS agent" readOnly={!canEdit} />
        </div>
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">When (Dubai time)</div>
          <div className="flex gap-1.5">
            <select value={schedule.day} disabled={!canEdit} onChange={(e) => setSchedule({ ...schedule, day: e.target.value as ReportSchedule["day"] })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              {REPORT_DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <input type="time" value={schedule.time} step={900} disabled={!canEdit} onChange={(e) => setSchedule({ ...schedule, time: e.target.value || schedule.time })}
                   className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canEdit && dirty && (
          <Button size="sm" disabled={busy === "save"} onClick={() => void save({ recipients, cc, schedule, ...(recipients.length ? {} : { enabled: false }) }).then((ok) => ok && toast.success("Saved"))}>
            {busy === "save" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null} Save changes
          </Button>
        )}
        <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy} onClick={() => void showPreview()}>
          {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Preview
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy} onClick={() => void openPdf()}>
          {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} PDF
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy} onClick={() => void send("test")} title="Send it to your own email, nobody else">
          {busy === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />} Send test to me
        </Button>
        {canEdit && <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy || dirty || !sub.recipients.length} onClick={() => setConfirmSend(true)}
                title={dirty ? "Save your changes first" : !sub.recipients.length ? "Add a recipient first" : "Send it to the recipients now"}>
          {busy === "send" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send now
        </Button>}
        <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> {sub.enabled ? describeReportSchedule(sub.schedule) : "Not scheduled while off"}</span>
          <span>Last sent: {when(sub.last_sent_at)}</span>
          {canEdit && <button type="button" onClick={() => void remove()} className="hover:text-red-400" title="Remove this report"><Trash2 className="h-3.5 w-3.5" /></button>}
        </span>
      </div>
      {sub.last_status === "failed" && sub.last_error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">Last send failed: {sub.last_error}</div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{preview?.subject}</DialogTitle>
            <DialogDescription>As it would go out now · {preview?.summary} · PDF attached</DialogDescription>
          </DialogHeader>
          {preview && <iframe title="Report preview" srcDoc={preview.html} sandbox="" className="h-[60vh] w-full rounded-md border border-border bg-white" />}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmSend} onOpenChange={setConfirmSend}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send {report.label} for {vessel} now?</DialogTitle>
            <DialogDescription>It goes to the vessel's recipients straight away, with the PDF attached.</DialogDescription>
          </DialogHeader>
          <div className="text-sm">
            <div><span className="text-muted-foreground">To:</span> {sub.recipients.join(", ")}</div>
            {sub.cc.length > 0 && <div><span className="text-muted-foreground">CC:</span> {sub.cc.join(", ")}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSend(false)}>Cancel</Button>
            <Button onClick={() => void send("send")} className="gap-1.5"><Send className="h-4 w-4" /> Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecentRuns({ runs, nameOf }: { runs: Run[]; nameOf: Map<string, string> }) {
  if (!runs.length) return null;
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <History className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Recent sends</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Vessel</th><th className="px-4 py-2">Report</th><th className="px-4 py-2">How</th><th className="px-4 py-2">To</th><th className="px-4 py-2">Result</th></tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-border/50 align-top">
                <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{when(r.created_at)}</td>
                <td className="px-4 py-2">{nameOf.get(r.yacht_id) ?? "—"}</td>
                <td className="px-4 py-2">{reportLabel(r.report_key)}</td>
                <td className="px-4 py-2 text-xs capitalize text-muted-foreground">{r.trigger === "schedule" ? "Scheduled" : r.trigger}</td>
                <td className="px-4 py-2 text-xs">{r.recipients.join(", ")}</td>
                <td className="px-4 py-2 text-xs">
                  <span className={cn(r.status === "sent" ? "text-emerald-400" : r.status === "failed" ? "text-red-400" : "text-muted-foreground")}>{r.status}</span>
                  {r.summary && <span className="text-muted-foreground"> · {r.summary}</span>}
                  {r.error && <div className="text-red-300">{r.error}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
