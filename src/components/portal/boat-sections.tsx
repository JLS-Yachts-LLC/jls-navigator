/**
 * The boat owner's screens — Home summary, Compliance, Documents, Jobs and
 * Safety kit — for one managed boat. Everything comes from
 * /api/portal/boats/detail (owner-safe fields only); documents and inspection
 * reports open through /api/portal/boats/open, which checks ownership, signs a
 * short-lived link and records the open.
 */
import { useState } from "react";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Download, FileCheck2, Loader2, ShieldCheck, Wrench,
} from "lucide-react";

export type BoatDetail = {
  compliance: Array<{
    regime: "dma" | "fma" | "rya"; label: string; authority: string; variant: string | null;
    lastInspection: string | null; nextDue: string | null; hasReport: boolean;
  }>;
  documents: Array<{ id: string; category: string; categoryLabel: string; fileName: string; addedAt: string }>;
  jobs: Array<{
    id: string; jobNo: string | null; kind: string; kindLabel: string; title: string; status: string;
    dueDate: string | null; scheduledDate: string | null; scheduledTime: string | null; updatedAt: string;
  }>;
  safetyKit: Array<{ id: string; item: string; qty: number | null; unit: string | null; condition: string | null; expiryDate: string; onBoard: boolean }>;
};

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const daysTo = (d: string) => Math.round((Date.parse(`${d.slice(0, 10)}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86400000);

const JOB_STATUS: Record<string, { label: string; cls: string }> = {
  Pending: { label: "Scheduled", cls: "bg-sky-500/15 text-sky-300" },
  Ongoing: { label: "In progress", cls: "bg-amber-500/15 text-amber-300" },
  Complete: { label: "Done", cls: "bg-emerald-500/15 text-emerald-300" },
};

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-2xl border border-border bg-card/80 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.5)]", className)}>{children}</div>;
}
function Empty({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-12 text-center">
      <Icon className="mb-3 h-7 w-7 text-muted-foreground/40" />
      <p className="max-w-sm text-sm text-muted-foreground">{children}</p>
    </Card>
  );
}

function OpenButton({ boatId, params, label = "Open" }: { boatId: string; params: Record<string, string>; label?: string }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const res = await portalFetch(`/api/portal/boats/open?${new URLSearchParams({ boat: boatId, ...params })}`, { redirect: "follow" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "That document could not be opened.");
      }
      window.open(res.url, "_blank", "noreferrer");
    } catch (e) {
      alert(e instanceof Error ? e.message : "That document could not be opened.");
    } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={() => void open()} disabled={busy}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium transition hover:border-primary/50 disabled:opacity-50">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} {label}
    </button>
  );
}

/** What needs the owner's attention, worst first. */
export function boatAlerts(d: BoatDetail) {
  const out: Array<{ key: string; tone: "red" | "amber" | "sky"; text: string; tab: string }> = [];
  for (const c of d.compliance) {
    if (!c.lastInspection) out.push({ key: `c-${c.regime}`, tone: "amber", text: `${c.label}: no inspection on record yet`, tab: "compliance" });
    else if (c.nextDue && daysTo(c.nextDue) < 0) out.push({ key: `c-${c.regime}`, tone: "red", text: `${c.label} was due ${fmtDate(c.nextDue)}`, tab: "compliance" });
    else if (c.nextDue && daysTo(c.nextDue) <= 45) out.push({ key: `c-${c.regime}`, tone: "amber", text: `${c.label} due ${fmtDate(c.nextDue)}`, tab: "compliance" });
  }
  for (const k of d.safetyKit) {
    const n = daysTo(k.expiryDate);
    if (n < 0) out.push({ key: `k-${k.id}`, tone: "red", text: `${k.item} expired ${fmtDate(k.expiryDate)}`, tab: "safety" });
    else if (n <= 60) out.push({ key: `k-${k.id}`, tone: "amber", text: `${k.item} expires ${fmtDate(k.expiryDate)}`, tab: "safety" });
  }
  const next = d.jobs.filter((j) => j.status !== "Complete" && j.scheduledDate && daysTo(j.scheduledDate) >= 0)
    .sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!))[0];
  if (next) out.push({ key: `j-${next.id}`, tone: "sky", text: `${next.kindLabel} booked for ${fmtDate(next.scheduledDate)}${next.scheduledTime ? ` at ${next.scheduledTime}` : ""}`, tab: "jobs" });
  const rank = { red: 0, amber: 1, sky: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

export function BoatAlertsCard({ detail, onOpen }: { detail: BoatDetail; onOpen: (tab: string) => void }) {
  const alerts = boatAlerts(detail);
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">For your attention</h2>
      {alerts.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" /> All up to date.</div>
      ) : (
        <div className="space-y-1.5">
          {alerts.map((a) => (
            <button key={a.key} type="button" onClick={() => onOpen(a.tab)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-background/30 px-3 py-2.5 text-left text-sm transition hover:border-primary/50">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", a.tone === "red" ? "bg-red-400" : a.tone === "amber" ? "bg-amber-400" : "bg-sky-400")} />
              <span className="flex-1">{a.text}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

export function BoatCompliance({ boatId, detail }: { boatId: string; detail: BoatDetail }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Compliance</h1>
        <p className="mt-1 text-sm text-muted-foreground">The inspections your boat needs, when each was last done, and the report.</p>
      </div>
      {detail.compliance.length === 0 ? (
        <Empty icon={ShieldCheck}>No inspections are set up for this boat. Ask JLS if you think it needs one.</Empty>
      ) : detail.compliance.map((c) => {
        const n = c.nextDue ? daysTo(c.nextDue) : null;
        const tone = !c.lastInspection ? "text-amber-300" : n != null && n < 0 ? "text-red-300" : n != null && n <= 45 ? "text-amber-300" : "text-emerald-300";
        return (
          <Card key={c.regime} className="flex flex-wrap items-center gap-x-5 gap-y-2 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{c.label}{c.variant ? ` · ${c.variant}` : ""}</div>
              <div className="text-xs text-muted-foreground">{c.authority}</div>
            </div>
            <div className="text-right text-sm">
              <div className="text-xs text-muted-foreground">Last done</div>
              <div>{c.lastInspection ? fmtDate(c.lastInspection) : "Not on record"}</div>
            </div>
            <div className="text-right text-sm">
              <div className="text-xs text-muted-foreground">Next due</div>
              <div className={tone}>{c.nextDue ? (n! < 0 ? `Overdue · ${fmtDate(c.nextDue)}` : fmtDate(c.nextDue)) : "—"}</div>
            </div>
            {c.hasReport && <OpenButton boatId={boatId} params={{ type: "inspection", regime: c.regime }} label="Report" />}
          </Card>
        );
      })}
      <p className="text-xs text-muted-foreground">Next due dates assume an annual inspection. JLS books each one and lets you know.</p>
    </div>
  );
}

export function BoatDocuments({ boatId, detail }: { boatId: string; detail: BoatDetail }) {
  const groups = new Map<string, BoatDetail["documents"]>();
  for (const d of detail.documents) {
    if (!groups.has(d.categoryLabel)) groups.set(d.categoryLabel, []);
    groups.get(d.categoryLabel)!.push(d);
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">Licences, insurance, berth agreements and service certificates JLS holds for your boat.</p>
      </div>
      {detail.documents.length === 0 ? (
        <Empty icon={FileCheck2}>No documents on file yet.</Empty>
      ) : [...groups.entries()].map(([label, docs]) => (
        <div key={label}>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
          <div className="space-y-1.5">
            {docs.map((d) => (
              <Card key={d.id} className="flex items-center gap-3 p-3 pl-4">
                <FileCheck2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{d.fileName}</div>
                  <div className="text-[11px] text-muted-foreground">Added {fmtDate(d.addedAt)}</div>
                </div>
                <OpenButton boatId={boatId} params={{ type: "document", id: d.id }} />
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BoatJobs({ detail }: { detail: BoatDetail }) {
  const open = detail.jobs.filter((j) => j.status !== "Complete");
  const done = detail.jobs.filter((j) => j.status === "Complete");
  const Row = ({ j }: { j: BoatDetail["jobs"][number] }) => {
    const st = JOB_STATUS[j.status] ?? { label: j.status, cls: "bg-slate-500/15 text-slate-300" };
    const when = j.scheduledDate ?? j.dueDate;
    return (
      <Card className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{j.title || j.kindLabel}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", st.cls)}>{st.label}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{[j.kindLabel, j.jobNo].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {j.status === "Complete" ? `Completed ${fmtDate(j.updatedAt)}`
            : when ? <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> {fmtDate(when)}{j.scheduledTime ? ` · ${j.scheduledTime}` : ""}</span>
            : "Date to be confirmed"}
        </div>
      </Card>
    );
  };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Jobs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Work JLS has booked or completed on your boat.</p>
      </div>
      {detail.jobs.length === 0 ? <Empty icon={Wrench}>No jobs yet.</Empty> : (
        <>
          {open.length > 0 && <div className="space-y-2"><h2 className="text-sm font-semibold text-muted-foreground">Booked &amp; in progress</h2>{open.map((j) => <Row key={j.id} j={j} />)}</div>}
          {done.length > 0 && <div className="space-y-2"><h2 className="text-sm font-semibold text-muted-foreground">Completed</h2>{done.map((j) => <Row key={j.id} j={j} />)}</div>}
        </>
      )}
    </div>
  );
}

export function BoatSafetyKit({ detail }: { detail: BoatDetail }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Safety kit</h1>
        <p className="mt-1 text-sm text-muted-foreground">Equipment on board with an expiry date — flares, extinguishers, liferaft, first aid and the like.</p>
      </div>
      {detail.safetyKit.length === 0 ? <Empty icon={ClipboardList}>No dated safety equipment recorded yet.</Empty> : (
        <div className="space-y-1.5">
          {detail.safetyKit.map((k) => {
            const n = daysTo(k.expiryDate);
            return (
              <Card key={k.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 p-4", n < 0 ? "border-red-500/40" : n <= 60 ? "border-amber-500/40" : "")}>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{k.item}</div>
                  <div className="text-xs text-muted-foreground">
                    {[k.qty != null ? `${k.qty}${k.unit ? ` ${k.unit}` : ""}` : null, k.condition, k.onBoard ? null : "not on board"].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div className={cn("flex items-center gap-1.5 text-sm", n < 0 ? "text-red-300" : n <= 60 ? "text-amber-300" : "text-muted-foreground")}>
                  {(n < 0 || n <= 60) && <AlertTriangle className="h-3.5 w-3.5" />}
                  {n < 0 ? `Expired ${fmtDate(k.expiryDate)}` : `Expires ${fmtDate(k.expiryDate)}`}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">JLS replaces expiring items at the boat's next service — message us if you'd like it sooner.</p>
    </div>
  );
}
