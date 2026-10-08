/**
 * Client Portal → Email reports. The automated reports JLS has set up for the
 * vessel and offered to the client: switch each on or off and say who receives
 * it. JLS sets the day and time. Served by /api/portal/reports.
 */
import { useEffect, useState } from "react";
import { CalendarClock, Loader2, Mail, X } from "lucide-react";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";
import { SectionCard, SectionEmpty, SectionHeader, SectionLoading, StatusBadge, fmtDate } from "./section-ui";

type Report = {
  id: string; key: string; label: string; description: string; enabled: boolean;
  recipients: string[]; cc: string[]; when: string; lastSentAt: string | null;
  changedBy: { kind: "staff" | "client"; name: string | null; at: string | null } | null;
};

const isEmail = (s: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s.trim());

export function ReportsSection() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void portalFetch("/api/portal/reports").then(async (r) => {
      const j = await r.json().catch(() => null);
      if (!r.ok) { setError(j?.error ?? "Couldn't load your reports."); return; }
      setReports(j.reports); setCanManage(!!j.canManage);
    }).catch(() => setError("Couldn't load your reports."));
  }, []);

  return (
    <div className="space-y-4">
      <SectionHeader title="Email reports"
        subtitle="Reports JLS emails to you on a schedule. Switch each one on or off and choose who receives it — JLS sets the day and time." />
      {error ? <SectionCard className="p-4 text-sm text-red-300">{error}</SectionCard>
        : !reports ? <SectionLoading />
        : reports.length === 0 ? <SectionEmpty icon={Mail} message="No email reports are set up for your vessel yet. Ask your JLS agent if you'd like a weekly visa or crew movement report." />
        : reports.map((r) => (
          <ReportCard key={r.id} report={r} canManage={canManage}
                      onSaved={(u) => setReports((list) => (list ?? []).map((x) => (x.id === u.id ? u : x)))} />
        ))}
      {reports && reports.length > 0 && !canManage && (
        <p className="text-xs text-muted-foreground">Only the Captain, officers and the vessel's management can change these.</p>
      )}
    </div>
  );
}

function ReportCard({ report, canManage, onSaved }: { report: Report; canManage: boolean; onSaved: (r: Report) => void }) {
  const [recipients, setRecipients] = useState(report.recipients);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setRecipients(report.recipients); }, [report.recipients.join(",")]);
  const dirty = recipients.join(",") !== report.recipients.join(",");

  async function save(patch: { enabled?: boolean; recipients?: string[] }) {
    setBusy(true); setError(null);
    try {
      const r = await portalFetch("/api/portal/reports", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: report.id, ...patch }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "That didn't save.");
      onSaved(j.report);
    } catch (e) { setError(e instanceof Error ? e.message : "That didn't save."); }
    finally { setBusy(false); }
  }
  const add = () => {
    const parts = draft.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const bad = parts.filter((p) => !isEmail(p));
    setRecipients((list) => [...list, ...parts.filter(isEmail).filter((p) => !list.includes(p))]);
    setDraft(bad.join(" "));
    setError(bad.length ? `Not an email address: ${bad.join(", ")}` : null);
  };

  return (
    <SectionCard className={cn("space-y-3 p-4", report.enabled && "border-emerald-500/30")}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{report.label}</h2>
            <StatusBadge label={report.enabled ? "On" : "Off"} tone={report.enabled ? "green" : "slate"} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{report.description}</p>
        </div>
        {canManage && (
          <button type="button" role="switch" aria-checked={report.enabled} disabled={busy || dirty}
                  title={dirty ? "Save the email addresses first" : undefined}
                  onClick={() => void save({ enabled: !report.enabled, recipients })}
                  className={cn("relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50",
                    report.enabled ? "bg-emerald-500" : "bg-muted")}>
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", report.enabled ? "left-[22px]" : "left-0.5")} />
            <span className="sr-only">{report.enabled ? "Switch off" : "Switch on"}</span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> {report.when}</span>
        <span>Last sent: {report.lastSentAt ? fmtDate(report.lastSentAt) : "not yet"}</span>
        {report.changedBy?.at && (
          <span>Last changed {fmtDate(report.changedBy.at)} by {report.changedBy.kind === "staff" ? "JLS" : report.changedBy.name ?? "you"}</span>
        )}
      </div>

      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sent to</div>
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-background/40 px-2 py-1.5">
          {recipients.map((e) => (
            <span key={e} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
              {e}
              {canManage && (
                <button type="button" onClick={() => setRecipients((l) => l.filter((x) => x !== e))} aria-label={`Remove ${e}`} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {canManage ? (
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={recipients.length ? "Add another…" : "name@vessel.com, then Enter"}
                   onKeyDown={(e) => { if (["Enter", ",", ";"].includes(e.key) && draft.trim()) { e.preventDefault(); add(); } }}
                   onBlur={() => draft.trim() && add()}
                   className="min-w-[180px] flex-1 bg-transparent py-1 text-sm outline-none" />
          ) : recipients.length === 0 && <span className="text-sm text-muted-foreground">Nobody yet</span>}
        </div>
        {report.cc.length > 0 && <div className="mt-1 text-xs text-muted-foreground">JLS also copies: {report.cc.join(", ")}</div>}
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}
      {canManage && dirty && (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => void save({ recipients })}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save addresses
          </button>
          <button type="button" onClick={() => { setRecipients(report.recipients); setDraft(""); setError(null); }}
                  className="min-h-9 rounded-xl border border-border px-4 text-sm">Cancel</button>
        </div>
      )}
    </SectionCard>
  );
}
