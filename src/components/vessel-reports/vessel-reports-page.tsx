/**
 * Reports → Automated Reports.
 *
 * Opt a vessel in to an automated report, say who it goes to and when, and
 * switch it on. Everything is per vessel: nothing goes to a vessel that hasn't
 * been opted in here, and each report has its own recipients — there is no
 * fleet-wide list. Settings live in vessel_report_subscriptions (RLS, staff);
 * the worker sends them (lib/vessel-reports/run.server).
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Eye, FileDown, Loader2, Plus, Send, Ship, Trash2, X, FlaskConical, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
};
type Run = {
  id: string; yacht_id: string; report_key: string; trigger: string; status: string;
  recipients: string[]; summary: string | null; error: string | null; created_at: string;
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" }) : "—";

async function api(path: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session?.access_token ?? ""}`);
  return fetch(path, { ...init, headers });
}

export function VesselReportsPage() {
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [extraVessels, setExtraVessels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  async function load() {
    const [y, s, r] = await Promise.all([
      db.from("yachts").select("id, vessel_name").eq("archive", false).order("vessel_name"),
      db.from("vessel_report_subscriptions").select("id, yacht_id, report_key, enabled, recipients, cc, schedule, last_sent_at, last_status, last_error"),
      db.from("vessel_report_runs").select("id, yacht_id, report_key, trigger, status, recipients, summary, error, created_at").order("created_at", { ascending: false }).limit(40),
    ]);
    setYachts(y.data ?? []); setSubs(s.data ?? []); setRuns(r.data ?? []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const nameOf = useMemo(() => new Map(yachts.map((y) => [y.id, y.vessel_name])), [yachts]);
  const vesselIds = useMemo(() => {
    const ids = [...new Set([...subs.map((s) => s.yacht_id), ...extraVessels])];
    return ids.sort((a, b) => (nameOf.get(a) ?? "").localeCompare(nameOf.get(b) ?? ""));
  }, [subs, extraVessels, nameOf]);
  const live = subs.filter((s) => s.enabled).length;

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Automated Reports</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Reports sent to a vessel on a schedule. Each vessel is opted in one report at a time, with its own recipients —
            nothing goes to a vessel that isn't set up and switched on here.
          </p>
        </div>
        <Button onClick={() => setAdding(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Opt in a vessel</Button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border px-2.5 py-1">{vesselIds.length} vessel{vesselIds.length === 1 ? "" : "s"} set up</span>
        <span className={cn("rounded-full border px-2.5 py-1", live ? "border-emerald-500/40 text-emerald-400" : "border-border text-muted-foreground")}>{live} report{live === 1 ? "" : "s"} switched on</span>
      </div>

      {loading ? (
        <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : vesselIds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Ship className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No vessel is opted in to any automated report yet.</p>
          <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Opt in a vessel</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {vesselIds.map((yid) => (
            <VesselCard key={yid} yachtId={yid} vessel={nameOf.get(yid) ?? "Vessel"}
                        subs={subs.filter((s) => s.yacht_id === yid)} onChanged={load} />
          ))}
        </div>
      )}

      <RecentRuns runs={runs} nameOf={nameOf} />

      <AddVesselDialog open={adding} onClose={() => setAdding(false)} yachts={yachts} taken={new Set(vesselIds)}
                       onPick={(id) => { setExtraVessels((v) => [...v, id]); setAdding(false); }} />
    </div>
  );
}

function AddVesselDialog({ open, onClose, yachts, taken, onPick }: {
  open: boolean; onClose: () => void; yachts: Yacht[]; taken: Set<string>; onPick: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const list = yachts.filter((y) => !taken.has(y.id) && y.vessel_name?.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setQ(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Opt in a vessel</DialogTitle>
          <DialogDescription>Choose the vessel, then pick its reports and who they go to. Nothing is sent until you switch a report on.</DialogDescription>
        </DialogHeader>
        <Input autoFocus placeholder="Search vessels…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-72 overflow-auto rounded-md border border-border">
          {list.map((y) => (
            <button key={y.id} type="button" onClick={() => { onPick(y.id); setQ(""); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/40">
              <Ship className="h-3.5 w-3.5 text-muted-foreground" /> {y.vessel_name}
            </button>
          ))}
          {list.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No vessels match.</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VesselCard({ yachtId, vessel, subs, onChanged }: { yachtId: string; vessel: string; subs: Sub[]; onChanged: () => void }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Ship className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">{vessel}</h2>
        <span className="text-xs text-muted-foreground">{subs.filter((s) => s.enabled).length} of {VESSEL_REPORTS.length} reports on</span>
      </div>
      <div className="divide-y divide-border">
        {VESSEL_REPORTS.map((r) => (
          <ReportRow key={r.key} yachtId={yachtId} vessel={vessel} report={r} sub={subs.find((s) => s.report_key === r.key) ?? null} onChanged={onChanged} />
        ))}
      </div>
    </section>
  );
}

function EmailList({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
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
          <button type="button" onClick={() => onChange(value.filter((x) => x !== e))} className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${e}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={value.length ? "" : placeholder}
             onKeyDown={(e) => { if (["Enter", ",", ";", "Tab"].includes(e.key) && draft.trim()) { e.preventDefault(); add(draft); } }}
             onBlur={() => draft.trim() && add(draft)}
             className="min-w-[180px] flex-1 bg-transparent py-1 text-sm outline-none" />
    </div>
  );
}

function ReportRow({ yachtId, vessel, report, sub, onChanged }: {
  yachtId: string; vessel: string; report: (typeof VESSEL_REPORTS)[number]; sub: Sub | null; onChanged: () => void;
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
        <Button size="sm" variant="outline" disabled={busy === "optin"} onClick={() => void optIn()} className="gap-1.5">
          {busy === "optin" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Opt in
        </Button>
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
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={sub.enabled} disabled={busy === "save"} onCheckedChange={(v) => void toggle(v)} />
          {sub.enabled ? "Sending" : "Switched off"}
        </label>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Send to</div>
          <EmailList value={recipients} onChange={setRecipients} placeholder="captain@vessel.com, then Enter" />
        </div>
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Copy (CC) — optional</div>
          <EmailList value={cc} onChange={setCc} placeholder="e.g. your JLS agent" />
        </div>
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">When (Dubai time)</div>
          <div className="flex gap-1.5">
            <select value={schedule.day} onChange={(e) => setSchedule({ ...schedule, day: e.target.value as ReportSchedule["day"] })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              {REPORT_DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <input type="time" value={schedule.time} step={900} onChange={(e) => setSchedule({ ...schedule, time: e.target.value || schedule.time })}
                   className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {dirty && (
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
        <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy || dirty || !sub.recipients.length} onClick={() => setConfirmSend(true)}
                title={dirty ? "Save your changes first" : !sub.recipients.length ? "Add a recipient first" : "Send it to the recipients now"}>
          {busy === "send" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send now
        </Button>
        <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> {sub.enabled ? describeReportSchedule(sub.schedule) : "Not scheduled while off"}</span>
          <span>Last sent: {when(sub.last_sent_at)}</span>
          <button type="button" onClick={() => void remove()} className="hover:text-red-400" title="Remove this report"><Trash2 className="h-3.5 w-3.5" /></button>
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
