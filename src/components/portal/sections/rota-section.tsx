/**
 * Crew rota & certificates (On board).
 *
 *   Rota          twelve weeks at a glance: one row per crew member, a bar for
 *                 each stretch away (leave, training, travel, sick). Everyone is
 *                 on board unless a bar says otherwise; the footer counts who's
 *                 aboard each day. Upcoming crew changes can be sent to JLS,
 *                 which raises a Visa & Immigration request to arrange the
 *                 sign-off / sign-on.
 *   Certificates  each crew member's STCW, ENG1, CoC… with expiry and a scan.
 *                 Stored in the staff Training area's records, so JLS sees them.
 *
 * Reads through RLS (vessel-scoped, also works in staff preview); writes go
 * through /api/portal/rota. Editing needs a position that manages crew.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";
import { BadgeCheck, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Plane, Send, Trash2, Users, X } from "lucide-react";
import { AddButton, AttachedFiles, SectionCard, SectionEmpty, SectionHeader, SectionLoading, StatusBadge, daysUntil, fmtDate } from "./section-ui";
import {
  AWAY_KINDS, CERT_TYPES, CERT_WARN_DAYS, awayLabel, awayOn, certTypeLabel, type RotationEntry,
} from "@/lib/portal/crew-rota";

const db = supabase as any;

type Crew = { id: string; name: string; rank: string | null; department: string | null };
type Cert = {
  id: string; crew_member_id: string; cert_type: string | null; certificate: string; issuing_body: string | null;
  issue_date: string | null; expiry_date: string | null; status: string | null; notes: string | null;
};
type RequestInfo = { id: string; reference: string | null; status: string };

const DAY_W = 18;
const WEEKS = 12;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const mondayOf = (d: Date) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return addDays(x, -((x.getUTCDay() + 6) % 7));
};
const fmtShort = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

async function rotaRequest(params: Record<string, string>, init: RequestInit = {}) {
  const res = await portalFetch(`/api/portal/rota?${new URLSearchParams(params)}`, {
    ...init, headers: typeof init.body === "string" ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong — please try again.");
  return body;
}

export function RotaSection({ yachtId, canEdit }: { yachtId: string; canEdit: boolean }) {
  const [view, setView] = useState<"rota" | "certs">("rota");
  const [crew, setCrew] = useState<Crew[]>([]);
  const [entries, setEntries] = useState<RotationEntry[]>([]);
  const [certs, setCerts] = useState<Cert[]>([]);
  const [requests, setRequests] = useState<Record<string, RequestInfo>>({});
  const [loading, setLoading] = useState(true);
  const [awayOpen, setAwayOpen] = useState<RotationEntry | { new: true; crewId?: string; start?: string } | null>(null);
  const [certOpen, setCertOpen] = useState<Cert | { new: true; crewId?: string } | null>(null);

  const load = useCallback(async () => {
    const [c, r, t] = await Promise.all([
      db.from("crew_members").select("id, full_name, first_name, last_name, rank, department, status").eq("yacht_id", yachtId).order("last_name"),
      db.from("onboard_crew_rotation").select("*").eq("yacht_id", yachtId).order("start_date"),
      db.from("training_certifications").select("id, crew_member_id, cert_type, certificate, issuing_body, issue_date, expiry_date, status, notes").not("crew_member_id", "is", null),
    ]);
    const list: Crew[] = ((c.data ?? []) as any[])
      .filter((m) => !m.status || ["active", "on_leave"].includes(m.status))
      .map((m) => ({ id: m.id, name: m.full_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || "Crew", rank: m.rank, department: m.department }));
    setCrew(list);
    setEntries(r.data ?? []);
    const ids = new Set(list.map((m) => m.id));
    setCerts(((t.data ?? []) as Cert[]).filter((x) => ids.has(x.crew_member_id)));
    const reqIds = ((r.data ?? []) as RotationEntry[]).map((e) => e.jls_request_id).filter(Boolean) as string[];
    if (reqIds.length) {
      const { data } = await db.from("captain_requests").select("id, reference, status").in("id", reqIds);
      setRequests(Object.fromEntries(((data ?? []) as RequestInfo[]).map((q) => [q.id, q])));
    } else setRequests({});
    setLoading(false);
  }, [yachtId]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <SectionLoading />;

  const today = iso(new Date());
  const awayToday = crew.filter((c) => awayOn(entries, c.id, today)).length;
  const certAlerts = certs.filter((c) => { const d = daysUntil(c.expiry_date); return d != null && d <= CERT_WARN_DAYS; }).length;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Crew rota & certificates"
        subtitle={crew.length ? `${crew.length - awayToday} of ${crew.length} on board today${certAlerts ? ` · ${certAlerts} certificate${certAlerts === 1 ? "" : "s"} expiring or expired` : ""}` : undefined}
        action={canEdit && crew.length > 0 && (view === "rota"
          ? <AddButton onClick={() => setAwayOpen({ new: true })}>Add time away</AddButton>
          : <AddButton onClick={() => setCertOpen({ new: true })}>Add certificate</AddButton>)}
      />

      {crew.length === 0 ? (
        <SectionEmpty icon={Users} message="No crew on the vessel yet — add your crew under Crew & immigration first." />
      ) : (
        <>
          <div className="inline-flex rounded-xl border border-border p-1 text-sm">
            {([["rota", "Rota", CalendarRange], ["certs", "Certificates", BadgeCheck]] as const).map(([k, l, Icon]) => (
              <button key={k} type="button" onClick={() => setView(k)}
                      className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 font-medium transition", view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                <Icon className="h-3.5 w-3.5" /> {l}
                {k === "certs" && certAlerts > 0 && <span className="rounded-full bg-amber-500/25 px-1.5 text-[10px] text-amber-200">{certAlerts}</span>}
              </button>
            ))}
          </div>
          {view === "rota"
            ? <RotaView crew={crew} entries={entries} requests={requests} canEdit={canEdit}
                        onAdd={(crewId, start) => setAwayOpen({ new: true, crewId, start })} onOpen={(e) => setAwayOpen(e)} onChanged={() => void load()} />
            : <CertsView crew={crew} certs={certs} canEdit={canEdit} onAdd={(crewId) => setCertOpen({ new: true, crewId })} onOpen={(c) => setCertOpen(c)} />}
        </>
      )}

      {awayOpen && (
        <AwayDialog entry={"id" in awayOpen ? awayOpen : null} crew={crew}
                    defaults={"new" in awayOpen ? { crewId: awayOpen.crewId, start: awayOpen.start } : {}}
                    request={"id" in awayOpen && awayOpen.jls_request_id ? requests[awayOpen.jls_request_id] ?? null : null}
                    canEdit={canEdit} onClose={() => setAwayOpen(null)} onSaved={() => { setAwayOpen(null); void load(); }} />
      )}
      {certOpen && (
        <CertDialog cert={"id" in certOpen ? certOpen : null} crew={crew} defaultCrewId={"new" in certOpen ? certOpen.crewId : undefined}
                    canEdit={canEdit} onClose={() => setCertOpen(null)} onSaved={() => { setCertOpen(null); void load(); }} />
      )}
    </div>
  );
}

// ─── Rota timeline ───────────────────────────────────────────────────────────

function RotaView({ crew, entries, requests, canEdit, onAdd, onOpen, onChanged }: {
  crew: Crew[]; entries: RotationEntry[]; requests: Record<string, RequestInfo>; canEdit: boolean;
  onAdd: (crewId: string, start: string) => void; onOpen: (e: RotationEntry) => void; onChanged: () => void;
}) {
  const [start, setStart] = useState(() => mondayOf(new Date()));
  const days = useMemo(() => Array.from({ length: WEEKS * 7 }, (_, i) => iso(addDays(start, i))), [start]);
  const first = days[0], last = days[days.length - 1];
  const today = iso(new Date());
  const scroller = useRef<HTMLDivElement>(null);
  const [asking, setAsking] = useState<string | null>(null);

  const visible = entries.filter((e) => e.end_date >= first && e.start_date <= last);
  const aboard = days.map((d) => crew.length - crew.filter((c) => awayOn(entries, c.id, d)).length);
  const minAboard = Math.min(...aboard);

  // Crew changes coming up: time away starting in the next 60 days (or under way).
  const horizon = iso(addDays(new Date(), 60));
  const upcoming = entries.filter((e) => e.end_date >= today && e.start_date <= horizon).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const nameOf = (id: string) => crew.find((c) => c.id === id)?.name ?? "Crew";

  const ask = async (e: RotationEntry) => {
    const message = prompt(`Ask JLS to arrange ${nameOf(e.crew_member_id)}'s crew change?\n\nAnything to add (flights, where they're going, visa)? Optional:`, "");
    if (message === null) return;
    setAsking(e.id);
    try {
      const r = await rotaRequest({ kind: "away", id: e.id, action: "request" }, { method: "POST", body: JSON.stringify({ message }) });
      alert(`Sent to JLS${r.reference ? ` as ${r.reference}` : ""} — follow it under Requests.`);
      onChanged();
    } catch (err) { alert(err instanceof Error ? err.message : "Could not send it."); }
    finally { setAsking(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setStart((s) => addDays(s, -28))} aria-label="Earlier"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" /></button>
        <div className="min-w-[180px] text-center text-sm font-semibold">{fmtShort(first)} – {fmtShort(last)}</div>
        <button type="button" onClick={() => setStart((s) => addDays(s, 28))} aria-label="Later"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"><ChevronRight className="h-4 w-4" /></button>
        {iso(start) !== iso(mondayOf(new Date())) && (
          <button type="button" onClick={() => setStart(mondayOf(new Date()))} className="text-xs font-medium text-primary hover:underline">Today</button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {AWAY_KINDS.map((k) => <span key={k.key} className="inline-flex items-center gap-1"><span className={cn("h-2.5 w-2.5 rounded-sm", k.tone)} />{k.label}</span>)}
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-current" />Planned</span>
        </div>
      </div>

      <SectionCard className="overflow-hidden">
        <div ref={scroller} className="overflow-x-auto">
          <div style={{ width: 180 + days.length * DAY_W }}>
            {/* Week header */}
            <div className="flex border-b border-border/60 text-[10px] text-muted-foreground">
              <div className="sticky left-0 z-10 w-[180px] shrink-0 bg-card px-3 py-2 font-semibold uppercase tracking-wide">Crew</div>
              {Array.from({ length: WEEKS }, (_, w) => (
                <div key={w} style={{ width: 7 * DAY_W }} className="shrink-0 border-l border-border/40 px-1.5 py-2">{fmtShort(days[w * 7])}</div>
              ))}
            </div>
            {/* Rows */}
            {crew.map((c) => (
              <div key={c.id} className="relative flex border-b border-border/40 last:border-b-0" style={{ height: 40 }}>
                <div className="sticky left-0 z-10 w-[180px] shrink-0 bg-card px-3 py-1.5">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  {c.rank && <div className="truncate text-[10px] text-muted-foreground">{c.rank}</div>}
                </div>
                <div className="relative" style={{ width: days.length * DAY_W }}>
                  {/* Day cells — tap a gap to add time away from that day */}
                  <div className="absolute inset-0 flex">
                    {days.map((d, i) => (
                      <button key={d} type="button" disabled={!canEdit} onClick={() => onAdd(c.id, d)}
                              title={canEdit ? `Add time away for ${c.name} from ${fmtShort(d)}` : undefined}
                              className={cn("h-full shrink-0", i % 7 === 0 && "border-l border-border/40", d === today && "bg-primary/10",
                                canEdit && "hover:bg-primary/5")} style={{ width: DAY_W }} />
                    ))}
                  </div>
                  {/* Bars */}
                  {visible.filter((e) => e.crew_member_id === c.id).map((e) => {
                    const from = Math.max(0, days.indexOf(e.start_date < first ? first : e.start_date));
                    const to = days.indexOf(e.end_date > last ? last : e.end_date);
                    const tone = AWAY_KINDS.find((k) => k.key === e.kind)?.tone ?? "bg-slate-500/70";
                    const req = e.jls_request_id ? requests[e.jls_request_id] : null;
                    return (
                      <button key={e.id} type="button" onClick={() => onOpen(e)}
                              title={`${awayLabel(e.kind)} · ${fmtShort(e.start_date)} – ${fmtShort(e.end_date)}${e.notes ? ` · ${e.notes}` : ""}${req ? ` · JLS ${req.reference ?? ""} ${req.status}` : ""}`}
                              className={cn("absolute top-2 flex h-6 items-center gap-1 overflow-hidden rounded-md px-1.5 text-[10px] font-semibold text-white shadow-sm",
                                tone, e.status === "planned" && "border border-dashed border-white/70 opacity-80")}
                              style={{ left: from * DAY_W + 1, width: Math.max(1, to - from + 1) * DAY_W - 2 }}>
                        {req && <Plane className="h-3 w-3 shrink-0" />}
                        <span className="truncate">{awayLabel(e.kind)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {/* On board per day */}
            <div className="flex border-t border-border/60 text-[10px]">
              <div className="sticky left-0 z-10 w-[180px] shrink-0 bg-card px-3 py-1.5 text-muted-foreground">On board</div>
              {aboard.map((n, i) => (
                <div key={days[i]} style={{ width: DAY_W }} title={`${n} on board ${fmtShort(days[i])}`}
                     className={cn("shrink-0 py-1.5 text-center tabular-nums", i % 7 === 0 && "border-l border-border/40",
                       n === minAboard && n < crew.length ? "font-semibold text-amber-300" : "text-muted-foreground")}>
                  {n}
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>
      <p className="text-[11px] text-muted-foreground">
        Everyone is on board unless a bar says otherwise. {canEdit ? "Tap an empty day to add time away from it; tap a bar to change it. " : ""}
        The amber number is the fewest people aboard in the view.
      </p>

      {/* Upcoming crew changes */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Crew changes — next 60 days</h2>
        {upcoming.length === 0 ? (
          <SectionCard className="px-4 py-6 text-center text-sm text-muted-foreground">No one is due away in the next 60 days.</SectionCard>
        ) : (
          <SectionCard className="divide-y divide-border/60 overflow-hidden">
            {upcoming.map((e) => {
              const req = e.jls_request_id ? requests[e.jls_request_id] : null;
              const back = iso(addDays(new Date(`${e.end_date}T00:00:00Z`), 1));
              return (
                <div key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", AWAY_KINDS.find((k) => k.key === e.kind)?.tone)} />
                  <button type="button" onClick={() => onOpen(e)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-medium">{nameOf(e.crew_member_id)} · {awayLabel(e.kind)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Off {fmtShort(e.start_date)} · back {fmtShort(back)}{e.start_date <= today ? " · away now" : ` · in ${daysUntil(e.start_date)} days`}
                    </div>
                  </button>
                  {req ? (
                    <StatusBadge label={`JLS ${req.reference ?? ""} · ${req.status.replace(/_/g, " ")}`} tone={req.status === "completed" ? "green" : "sky"} />
                  ) : canEdit && e.kind !== "sick" ? (
                    <button type="button" onClick={() => void ask(e)} disabled={asking === e.id}
                            className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium transition hover:border-primary/50 disabled:opacity-50">
                      {asking === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Ask JLS to arrange
                    </button>
                  ) : null}
                </div>
              );
            })}
          </SectionCard>
        )}
      </div>
    </div>
  );
}

// ─── Certificates ────────────────────────────────────────────────────────────

function certTone(expiry: string | null): { label: string; tone: "green" | "amber" | "red" | "slate" } {
  const d = daysUntil(expiry);
  if (d == null) return { label: "No expiry", tone: "slate" };
  if (d < 0) return { label: `Expired ${fmtShort(expiry!)}`, tone: "red" };
  if (d <= 30) return { label: `${d} days left`, tone: "red" };
  if (d <= CERT_WARN_DAYS) return { label: `Expires ${fmtShort(expiry!)}`, tone: "amber" };
  return { label: `Valid to ${fmtShort(expiry!)}`, tone: "green" };
}

function CertsView({ crew, certs, canEdit, onAdd, onOpen }: {
  crew: Crew[]; certs: Cert[]; canEdit: boolean; onAdd: (crewId: string) => void; onOpen: (c: Cert) => void;
}) {
  const [onlyDue, setOnlyDue] = useState(false);
  const due = (c: Cert) => { const d = daysUntil(c.expiry_date); return d != null && d <= CERT_WARN_DAYS; };
  const rows = crew.map((m) => ({
    m,
    list: certs.filter((c) => c.crew_member_id === m.id && (!onlyDue || due(c)))
      .sort((a, b) => (a.expiry_date ?? "9999").localeCompare(b.expiry_date ?? "9999")),
  })).filter((r) => !onlyDue || r.list.length);

  return (
    <div className="space-y-3">
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} />
        Only expiring in {CERT_WARN_DAYS} days or expired
      </label>
      {rows.length === 0 ? (
        <SectionCard className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing expiring — every certificate is in date.</SectionCard>
      ) : rows.map(({ m, list }) => (
        <SectionCard key={m.id} className="p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{m.name}</div>
              {m.rank && <div className="text-[11px] text-muted-foreground">{m.rank}</div>}
            </div>
            {canEdit && (
              <button type="button" onClick={() => onAdd(m.id)} className="text-xs font-medium text-primary hover:underline">+ Certificate</button>
            )}
          </div>
          {list.length === 0 ? (
            <div className="mt-2 text-xs text-muted-foreground">No certificates recorded.</div>
          ) : (
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {list.map((c) => {
                const t = certTone(c.expiry_date);
                return (
                  <button key={c.id} type="button" onClick={() => onOpen(c)}
                          className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2 text-left transition hover:border-primary/40">
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{c.certificate}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{[certTypeLabel(c.cert_type) !== c.certificate && certTypeLabel(c.cert_type), c.issuing_body].filter(Boolean).join(" · ") || " "}</span>
                    </span>
                    <StatusBadge label={t.label} tone={t.tone} />
                  </button>
                );
              })}
            </div>
          )}
        </SectionCard>
      ))}
    </div>
  );
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

const inputCls = "w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm outline-none transition focus:border-primary/60 disabled:opacity-60";

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : "col-span-2 sm:col-span-1"}>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Actions({ busy, canSave, onSave, onDelete, saveLabel }: { busy: boolean; canSave: boolean; onSave: () => void; onDelete?: () => void; saveLabel: string }) {
  return (
    <div className="mt-5 flex gap-2">
      {onDelete && (
        <button type="button" onClick={onDelete} disabled={busy}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition hover:border-red-500/40 hover:text-red-300 disabled:opacity-50">
          <Trash2 className="h-4 w-4" /> Remove
        </button>
      )}
      <button type="button" onClick={onSave} disabled={busy || !canSave}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {saveLabel}
      </button>
    </div>
  );
}

function AwayDialog({ entry, crew, defaults, request, canEdit, onClose, onSaved }: {
  entry: RotationEntry | null; crew: Crew[]; defaults: { crewId?: string; start?: string }; request: RequestInfo | null;
  canEdit: boolean; onClose: () => void; onSaved: () => void;
}) {
  const startDefault = defaults.start ?? iso(new Date());
  const [form, setForm] = useState(() => ({
    crew_member_id: entry?.crew_member_id ?? defaults.crewId ?? crew[0]?.id ?? "",
    kind: entry?.kind ?? "leave",
    start_date: entry?.start_date ?? startDefault,
    end_date: entry?.end_date ?? iso(addDays(new Date(`${startDefault}T00:00:00Z`), 13)),
    status: entry?.status ?? "planned",
    notes: entry?.notes ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const days = Math.round((Date.parse(`${form.end_date}T00:00:00Z`) - Date.parse(`${form.start_date}T00:00:00Z`)) / 86400000) + 1;

  const save = async () => {
    setBusy(true); setError(null);
    try {
      if (entry) await rotaRequest({ kind: "away", id: entry.id }, { method: "PATCH", body: JSON.stringify(form) });
      else await rotaRequest({ kind: "away" }, { method: "POST", body: JSON.stringify(form) });
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); setBusy(false); }
  };
  const remove = async () => {
    if (!entry || !confirm("Remove this time away?")) return;
    setBusy(true);
    try { await rotaRequest({ kind: "away", id: entry.id }, { method: "DELETE" }); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not remove it."); setBusy(false); }
  };

  return (
    <Shell title={entry ? "Time away" : "Add time away"} onClose={onClose}>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Crew member" wide>
          <select className={inputCls} value={form.crew_member_id} onChange={set("crew_member_id")} disabled={!canEdit}>
            {crew.map((c) => <option key={c.id} value={c.id}>{c.name}{c.rank ? ` — ${c.rank}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Reason">
          <select className={inputCls} value={form.kind} onChange={set("kind")} disabled={!canEdit}>
            {AWAY_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputCls} value={form.status} onChange={set("status")} disabled={!canEdit}>
            <option value="planned">Planned</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </Field>
        <Field label="First day away">
          <input type="date" className={inputCls} value={form.start_date} onChange={set("start_date")} disabled={!canEdit} />
        </Field>
        <Field label="Last day away">
          <input type="date" className={inputCls} value={form.end_date} onChange={set("end_date")} disabled={!canEdit} min={form.start_date} />
        </Field>
        <Field label="Notes" wide>
          <textarea className={cn(inputCls, "min-h-[70px]")} value={form.notes} onChange={set("notes")} disabled={!canEdit} maxLength={2000}
                    placeholder="e.g. Flying home to Manila, relief: J. Smith" />
        </Field>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {days > 0 ? `${days} day${days === 1 ? "" : "s"} away · back on board ${fmtShort(iso(addDays(new Date(`${form.end_date}T00:00:00Z`), 1)))}` : "The last day is before the first."}
        {request && ` · JLS request ${request.reference ?? ""} (${request.status.replace(/_/g, " ")})`}
      </p>
      {error && <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
      {canEdit && <Actions busy={busy} canSave={days > 0 && !!form.crew_member_id} onSave={() => void save()}
                           onDelete={entry ? () => void remove() : undefined} saveLabel={entry ? "Save changes" : "Add"} />}
    </Shell>
  );
}

function CertDialog({ cert, crew, defaultCrewId, canEdit, onClose, onSaved }: {
  cert: Cert | null; crew: Crew[]; defaultCrewId?: string; canEdit: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState(() => ({
    crew_member_id: cert?.crew_member_id ?? defaultCrewId ?? crew[0]?.id ?? "",
    cert_type: cert?.cert_type ?? "stcw_basic",
    certificate: cert?.certificate ?? "",
    issuing_body: cert?.issuing_body ?? "",
    issue_date: cert?.issue_date ?? "",
    expiry_date: cert?.expiry_date ?? "",
    notes: cert?.notes ?? "",
  }));
  const [savedId, setSavedId] = useState<string | null>(cert?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (andClose: boolean) => {
    setBusy(true); setError(null);
    try {
      if (savedId) await rotaRequest({ kind: "cert", id: savedId }, { method: "PATCH", body: JSON.stringify(form) });
      else setSavedId((await rotaRequest({ kind: "cert" }, { method: "POST", body: JSON.stringify(form) })).id);
      if (andClose) onSaved(); else setBusy(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); setBusy(false); }
  };
  const remove = async () => {
    if (!savedId || !confirm("Remove this certificate?")) return;
    setBusy(true);
    try { await rotaRequest({ kind: "cert", id: savedId }, { method: "DELETE" }); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not remove it."); setBusy(false); }
  };

  return (
    <Shell title={cert ? cert.certificate : "Add certificate"} onClose={onClose}>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Crew member" wide>
          <select className={inputCls} value={form.crew_member_id} onChange={set("crew_member_id")} disabled={!canEdit}>
            {crew.map((c) => <option key={c.id} value={c.id}>{c.name}{c.rank ? ` — ${c.rank}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Type" wide>
          <select className={inputCls} value={form.cert_type} onChange={set("cert_type")} disabled={!canEdit}>
            {CERT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Certificate name" wide>
          <input className={inputCls} value={form.certificate} onChange={set("certificate")} disabled={!canEdit} maxLength={160}
                 placeholder={certTypeLabel(form.cert_type)} />
        </Field>
        <Field label="Issued by">
          <input className={inputCls} value={form.issuing_body} onChange={set("issuing_body")} disabled={!canEdit} maxLength={160} placeholder="e.g. MCA" />
        </Field>
        <Field label="Issued">
          <input type="date" className={inputCls} value={form.issue_date} onChange={set("issue_date")} disabled={!canEdit} />
        </Field>
        <Field label="Expires">
          <input type="date" className={inputCls} value={form.expiry_date} onChange={set("expiry_date")} disabled={!canEdit} />
        </Field>
        <Field label="Notes" wide>
          <textarea className={cn(inputCls, "min-h-[60px]")} value={form.notes} onChange={set("notes")} disabled={!canEdit} maxLength={2000} />
        </Field>
      </div>
      {savedId ? (
        <div className="mt-4">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Scan of the certificate</div>
          <AttachedFiles refTable="training_certifications" refId={savedId} target="crew_cert" canEdit={canEdit} accept="image/*,application/pdf" label="Attach scan" />
        </div>
      ) : canEdit ? (
        <button type="button" onClick={() => void save(false)} disabled={busy || !form.crew_member_id}
                className="mt-3 text-xs font-medium text-primary hover:underline disabled:opacity-50">Save and attach a scan ›</button>
      ) : null}
      {error && <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
      {canEdit && <Actions busy={busy} canSave={!!form.crew_member_id} onSave={() => void save(true)}
                           onDelete={savedId ? () => void remove() : undefined} saveLabel={savedId ? "Save" : "Add"} />}
    </Shell>
  );
}
