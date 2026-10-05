/**
 * Arrivals & departures (Agency with JLS) — the two things a vessel sends its
 * agent when it moves:
 *   · the Pre-Arrival / Cruising Permit form (vessel particulars filled in from
 *     the profile; the captain adds the trip), raised to JLS as a Client Request;
 *   · Seaport Immigration sign-on / sign-off requests, which go straight into
 *     the seaport team's queue with its SLA, and whose completion report is
 *     emailed back to whoever submitted.
 * Everything reads and writes through /api/portal/prearrival and
 * /api/portal/seaport (the tables are closed to portal logins at the database).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";
import {
  Anchor, ArrowRight, CheckCircle2, FileSignature, Loader2, Plane, Plus, Send, Ship, Trash2, UserMinus, UserPlus, X,
} from "lucide-react";
import { PREARRIVAL_FIELDS, PREARRIVAL_PROFILE, PREARRIVAL_REQUIRED } from "@/lib/portal/prearrival";
import { SectionCard, SectionEmpty, SectionHeader, SectionLoading, StatusBadge, fmtDate } from "./section-ui";

const db = supabase as any;

async function api(path: string, init: RequestInit = {}) {
  const res = await portalFetch(path, { ...init, headers: init.body ? { "Content-Type": "application/json" } : undefined });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong — please try again.");
  return body;
}

const inputCls =
  "w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm outline-none transition focus:border-primary/60 disabled:opacity-60";

export function MovementsSection({ yachtId, canEdit, onOpenRequest }: {
  yachtId: string; canEdit: boolean; onOpenRequest: (requestId: string) => void;
}) {
  const [view, setView] = useState<"prearrival" | "seaport">("prearrival");
  return (
    <div className="space-y-4">
      <SectionHeader title="Arrivals & departures"
                     subtitle="Tell JLS where you're heading and who's joining or leaving — we handle the permits, immigration and clearance." />
      <div className="inline-flex rounded-xl border border-border p-1 text-sm">
        {([["prearrival", "Pre-arrival form"], ["seaport", "Crew sign-on / sign-off"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
                  className={cn("rounded-lg px-4 py-1.5 font-medium transition", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>
      {view === "prearrival"
        ? <PreArrivalPanel canEdit={canEdit} onOpenRequest={onOpenRequest} />
        : <SeaportPanel yachtId={yachtId} canEdit={canEdit} />}
    </div>
  );
}

// ── Pre-arrival form ────────────────────────────────────────────────────────
type PrearrivalData = {
  prefill: Record<string, any> | null;
  draft: Record<string, any> | null;
  tenders: Array<Record<string, any>>;
  submitted: Array<{
    id: string; arrival_date: string | null; arrival_port: string | null; arrival_emirate: string | null;
    last_port_of_call: string | null; submitted_at: string | null; submitted_by_name: string | null;
    captain_request_id: string | null; captain_requests: { reference: string; status: string } | null;
  }>;
};

const REQUEST_STATUS: Record<string, string> = {
  new: "Sent", acknowledged: "Acknowledged", in_progress: "In progress", completed: "Done", cancelled: "Cancelled",
};

function PreArrivalPanel({ canEdit, onOpenRequest }: { canEdit: boolean; onOpenRequest: (id: string) => void }) {
  const [data, setData] = useState<PrearrivalData | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addingTender, setAddingTender] = useState(false);

  const load = useCallback(async () => {
    try {
      const body: PrearrivalData = await api("/api/portal/prearrival");
      setData(body);
      if (body.draft) setVals(Object.fromEntries(PREARRIVAL_FIELDS.map((f) => [f.key, body.draft![f.key] == null ? "" : String(body.draft![f.key])])));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the form.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <SectionLoading />;
  if (!data) return <SectionCard className="px-6 py-10 text-center text-sm text-red-300">{error}</SectionCard>;

  const draft = data.draft;
  const missing = PREARRIVAL_REQUIRED.filter((k) => !vals[k]?.trim());

  const start = () => run("start", async () => {
    await api("/api/portal/prearrival", { method: "POST", body: "{}" });
    await load();
  });
  const save = () => run("save", async () => {
    await api(`/api/portal/prearrival?id=${draft!.id}`, { method: "PATCH", body: JSON.stringify(vals) });
    setNotice("Draft saved.");
  });
  const submit = () => run("submit", async () => {
    const res = await api(`/api/portal/prearrival?id=${draft!.id}&action=submit`, { method: "POST", body: JSON.stringify(vals) });
    setNotice(`Sent to JLS as ${res.requestReference}. We'll be in touch about your permits.`);
    await load();
  });
  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name); setError(null); setNotice(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(null); }
  }

  const field = (key: string) => {
    const f = PREARRIVAL_FIELDS.find((x) => x.key === key)!;
    const required = PREARRIVAL_REQUIRED.includes(key);
    return (
      <div key={key}>
        <label htmlFor={`pa-${key}`} className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {f.label}{required && <span className="text-primary"> *</span>}
        </label>
        <input id={`pa-${key}`} className={cn(inputCls, required && !vals[key]?.trim() && "border-amber-500/40")}
               type={f.type === "number" ? "number" : f.type} step={f.type === "number" ? "any" : undefined} min={f.type === "number" ? 0 : undefined}
               disabled={!canEdit} value={vals[key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))} />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}
      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      {!draft ? (
        <SectionCard className="flex flex-wrap items-center gap-4 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><FileSignature className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Heading to the UAE?</div>
            <div className="text-sm text-muted-foreground">Send JLS your pre-arrival details and we'll arrange the cruising permit and entry. Your vessel's particulars are filled in for you.</div>
          </div>
          {canEdit && (
            <button type="button" onClick={() => void start()} disabled={!!busy}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
              {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Start pre-arrival form
            </button>
          )}
        </SectionCard>
      ) : (
        <>
          <SectionCard className="p-5">
            <h2 className="text-sm font-semibold">This trip</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">{["arrival_date", "last_port_of_call", "arrival_emirate", "arrival_port"].map(field)}</div>
          </SectionCard>

          <SectionCard className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">From your vessel profile</h2>
              <span className="text-xs text-muted-foreground">Something wrong? Message JLS and we'll correct it.</span>
            </div>
            <div className="mt-3 space-y-4">
              {PREARRIVAL_PROFILE.map((g) => (
                <div key={g.group}>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{g.group}</div>
                  <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-3">
                    {g.fields.map(([k, label]) => {
                      const v = data.prefill?.[k];
                      return (
                        <div key={k} className="min-w-0">
                          <dt className="text-[11px] text-muted-foreground">{label}</dt>
                          <dd className={cn("truncate text-sm", v == null || v === "" ? "text-amber-300/80" : "")}>{v == null || v === "" ? "Not on file" : String(v)}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard className="p-5">
            <h2 className="text-sm font-semibold">Further particulars</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Kept from your last form, so you only need to check them.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">{PREARRIVAL_FIELDS.filter((f) => f.group === "particulars").map((f) => field(f.key))}</div>
          </SectionCard>

          <SectionCard className="p-5">
            <h2 className="text-sm font-semibold">Heads of department</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">{PREARRIVAL_FIELDS.filter((f) => f.group === "heads").map((f) => field(f.key))}</div>
          </SectionCard>

          <SectionCard className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Tenders &amp; toys</h2>
              {canEdit && !addingTender && (
                <button type="button" onClick={() => setAddingTender(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              )}
            </div>
            {data.tenders.length === 0 && !addingTender && <p className="mt-2 text-sm text-muted-foreground">None recorded.</p>}
            <div className="mt-2 space-y-1.5">
              {data.tenders.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border bg-background/30 px-3 py-2 text-sm">
                  <Ship className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{t.description ?? t.manufacturer_model ?? "Tender"}</span>
                    <span className="text-muted-foreground"> {[t.manufacturer_model && t.description ? t.manufacturer_model : null, t.length_m ? `${t.length_m} m` : null, t.color, t.fuel_type, t.year_of_build].filter(Boolean).join(" · ")}</span>
                  </span>
                  {canEdit && (
                    <button type="button" aria-label={`Remove ${t.description ?? "tender"}`}
                            onClick={() => { if (confirm("Remove this tender?")) void run("tender", async () => { await api(`/api/portal/prearrival?tender=${t.id}`, { method: "DELETE" }); await load(); }); }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-red-300">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {addingTender && (
              <TenderForm onCancel={() => setAddingTender(false)}
                          onSave={(t) => run("tender", async () => { await api("/api/portal/prearrival?action=tender", { method: "POST", body: JSON.stringify(t) }); setAddingTender(false); await load(); })} />
            )}
          </SectionCard>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              {missing.length > 0 && <span className="text-xs text-amber-300">Still needed: {missing.map((k) => PREARRIVAL_FIELDS.find((f) => f.key === k)?.label).join(", ")}</span>}
              <div className="flex-1" />
              <button type="button" onClick={() => void save()} disabled={!!busy}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-5 text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50">
                {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />} Save draft
              </button>
              <button type="button" onClick={() => void submit()} disabled={!!busy || missing.length > 0}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
                {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to JLS
              </button>
            </div>
          )}
        </>
      )}

      {data.submitted.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Sent to JLS</h2>
          {data.submitted.map((s) => (
            <button key={s.id} type="button" disabled={!s.captain_request_id}
                    onClick={() => s.captain_request_id && onOpenRequest(s.captain_request_id)}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-border bg-card/80 p-4 text-left transition enabled:hover:border-primary/50">
              <div className="min-w-0 flex-1">
                <div className="font-medium">Arriving {fmtDate(s.arrival_date)} · {s.arrival_port ?? "—"}{s.arrival_emirate ? `, ${s.arrival_emirate}` : ""}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  From {s.last_port_of_call ?? "—"} · sent {fmtDate(s.submitted_at)}{s.submitted_by_name ? ` by ${s.submitted_by_name}` : ""}
                  {s.captain_requests?.reference && ` · ${s.captain_requests.reference}`}
                </div>
              </div>
              {s.captain_requests && <StatusBadge label={REQUEST_STATUS[s.captain_requests.status] ?? s.captain_requests.status} tone={s.captain_requests.status === "completed" ? "green" : "sky"} />}
              {s.captain_request_id && <ArrowRight className="h-4 w-4 text-muted-foreground/60" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TenderForm({ onCancel, onSave }: { onCancel: () => void; onSave: (t: Record<string, string>) => void }) {
  const [t, setT] = useState<Record<string, string>>({});
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setT((x) => ({ ...x, [k]: e.target.value }));
  const fields: Array<[string, string, string?]> = [
    ["description", "Description"], ["manufacturer_model", "Make & model"], ["length_m", "Length (m)", "number"],
    ["id_serial_no", "ID / serial no."], ["color", "Colour"], ["fuel_type", "Fuel"], ["year_of_build", "Year built", "number"],
  ];
  return (
    <div className="mt-3 rounded-xl border border-border bg-background/30 p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {fields.map(([k, label, type]) => (
          <div key={k}>
            <label htmlFor={`tn-${k}`} className="mb-1 block text-[11px] text-muted-foreground">{label}</label>
            <input id={`tn-${k}`} className={inputCls} type={type ?? "text"} min={type ? 0 : undefined} value={t[k] ?? ""} onChange={set(k)} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="min-h-9 rounded-xl border border-border px-4 text-xs font-medium text-muted-foreground hover:text-foreground">Cancel</button>
        <button type="button" onClick={() => onSave(t)} disabled={!t.description?.trim() && !t.manufacturer_model?.trim()}
                className="min-h-9 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">Add tender</button>
      </div>
    </div>
  );
}

// ── Seaport sign-on / sign-off ─────────────────────────────────────────────
type SeaportLine = {
  crew_name: string; flight_date: string | null; flight_time: string | null; flight_number: string | null;
  pickup_required: boolean; pickup_time: string | null; status: string;
};
type SeaportRequest = {
  request_id: string; request_date: string; status: string; notes: string | null; created_at: string;
  acknowledged_at: string | null; completed_at: string | null; report_sent_at: string | null;
  arrivals: SeaportLine[]; departures: SeaportLine[];
};

const SEAPORT_STATUS: Record<string, { label: string; tone: "green" | "amber" | "red" | "sky" | "slate" }> = {
  submitted: { label: "Submitted", tone: "amber" },
  acknowledged: { label: "Acknowledged", tone: "sky" },
  in_progress: { label: "In progress", tone: "sky" },
  completed: { label: "Completed", tone: "green" },
  report_sent: { label: "Report sent", tone: "green" },
};

function SeaportPanel({ yachtId, canEdit }: { yachtId: string; canEdit: boolean }) {
  const [reqs, setReqs] = useState<SeaportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const body = await api("/api/portal/seaport");
      setReqs(body.requests ?? []); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load requests.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <SectionLoading />;

  return (
    <div className="space-y-3">
      <SectionCard className="flex flex-wrap items-center gap-4 p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Anchor className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Crew joining or leaving?</div>
          <div className="text-sm text-muted-foreground">Send the week's sign-ons and sign-offs with flights. JLS handles seaport immigration and pickups, and emails you the completion report.</div>
        </div>
        {canEdit && (
          <button type="button" onClick={() => setCreating(true)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110">
            <Plus className="h-4 w-4" /> New request
          </button>
        )}
      </SectionCard>
      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      {reqs.length === 0 ? (
        <SectionEmpty icon={Plane} message="No sign-on / sign-off requests yet." />
      ) : (
        reqs.map((r) => {
          const st = SEAPORT_STATUS[r.status] ?? { label: r.status, tone: "slate" as const };
          const isOpen = open === r.request_id;
          return (
            <SectionCard key={r.request_id} className="p-0">
              <button type="button" onClick={() => setOpen(isOpen ? null : r.request_id)} aria-expanded={isOpen}
                      className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-4 text-left">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">Week of {fmtDate(r.request_date)}</span>
                    <StatusBadge label={st.label} tone={st.tone} />
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {r.arrivals.length} joining · {r.departures.length} leaving · sent {fmtDate(r.created_at)}
                    {r.completed_at && ` · completed ${fmtDate(r.completed_at)}`}
                  </div>
                </div>
                <ArrowRight className={cn("h-4 w-4 text-muted-foreground/60 transition", isOpen && "rotate-90")} />
              </button>
              {isOpen && (
                <div className="space-y-3 border-t border-border/60 p-4">
                  {([["Joining", r.arrivals, UserPlus], ["Leaving", r.departures, UserMinus]] as const).map(([label, lines, Icon]) => lines.length > 0 && (
                    <div key={label}>
                      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
                      <div className="space-y-1">
                        {lines.map((l, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                            <span className="font-medium">{l.crew_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {[l.flight_number, l.flight_date ? fmtDate(l.flight_date) : null, l.flight_time, l.pickup_required ? `pickup ${l.pickup_time ?? ""}`.trim() : null].filter(Boolean).join(" · ") || "No flight details"}
                            </span>
                            <span className={cn("ml-auto text-[11px]", l.status === "completed" ? "text-emerald-400" : l.status === "no_show" || l.status === "cancelled" ? "text-red-300" : "text-muted-foreground")}>
                              {l.status.replace("_", " ")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {r.notes && <p className="whitespace-pre-line text-sm text-muted-foreground">{r.notes}</p>}
                </div>
              )}
            </SectionCard>
          );
        })
      )}

      {creating && <SeaportForm yachtId={yachtId} onClose={() => setCreating(false)} onDone={() => { setCreating(false); void load(); }} />}
    </div>
  );
}

type DraftLine = {
  key: string; crew_id: string; crew_name: string; flight_date: string; flight_time: string; flight_number: string;
  pickup_required: boolean; pickup_time: string; crew_contact: string;
};
let seq = 0;
const blankLine = (): DraftLine => ({ key: `s${++seq}`, crew_id: "", crew_name: "", flight_date: "", flight_time: "", flight_number: "", pickup_required: false, pickup_time: "", crew_contact: "" });

function SeaportForm({ yachtId, onClose, onDone }: { yachtId: string; onClose: () => void; onDone: () => void }) {
  const [crew, setCrew] = useState<Array<{ id: string; name: string; phone: string | null }>>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [arrivals, setArrivals] = useState<DraftLine[]>([blankLine()]);
  const [departures, setDepartures] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    db.from("crew_members").select("id, full_name, first_name, last_name, phone, status").eq("yacht_id", yachtId).order("last_name")
      .then(({ data }: any) => setCrew((data ?? []).map((c: any) => ({
        id: c.id, phone: c.phone ?? null,
        name: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Crew",
      }))));
  }, [yachtId]);

  const submit = async () => {
    setBusy(true); setError(null);
    const pack = (lines: DraftLine[]) => lines.filter((l) => l.crew_name.trim()).map(({ key, ...l }) => ({ ...l, crew_id: l.crew_id || null }));
    try {
      await api("/api/portal/seaport", { method: "POST", body: JSON.stringify({ request_date: date, notes, arrivals: pack(arrivals), departures: pack(departures) }) });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit."); setBusy(false);
    }
  };
  const count = [...arrivals, ...departures].filter((l) => l.crew_name.trim()).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Crew sign-on / sign-off</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <label htmlFor="sp-date" className="mb-1.5 block text-xs font-medium text-muted-foreground">Week / date</label>
            <input id="sp-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="sp-notes" className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes for JLS</label>
            <input id="sp-notes" className={inputCls} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <LineEditor title="Joining (sign on)" icon={<UserPlus className="h-4 w-4" />} crew={crew} lines={arrivals} setLines={setArrivals} />
        <LineEditor title="Leaving (sign off)" icon={<UserMinus className="h-4 w-4" />} crew={crew} lines={departures} setLines={setDepartures} />
        {error && <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        <button type="button" onClick={() => void submit()} disabled={busy || !count}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Send to JLS{count ? ` · ${count} crew` : ""}
        </button>
      </div>
    </div>
  );
}

function LineEditor({ title, icon, crew, lines, setLines }: {
  title: string; icon: React.ReactNode; crew: Array<{ id: string; name: string; phone: string | null }>;
  lines: DraftLine[]; setLines: (fn: (l: DraftLine[]) => DraftLine[]) => void;
}) {
  const set = (key: string, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</h3>
        <button type="button" onClick={() => setLines((ls) => [...ls, blankLine()])} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
          <Plus className="h-3.5 w-3.5" /> Add crew
        </button>
      </div>
      {lines.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Nobody — add crew if anyone is {title.startsWith("Joining") ? "joining" : "leaving"}.</p>}
      <div className="mt-2 space-y-2">
        {lines.map((l, idx) => (
          <div key={l.key} className="rounded-xl border border-border bg-background/30 p-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_88px_110px_36px]">
              <div>
                <input aria-label={`Crew name, line ${idx + 1}`} list={`crew-list-${title}`} className={inputCls} maxLength={120} placeholder="Crew name"
                       value={l.crew_name}
                       onChange={(e) => {
                         const match = crew.find((c) => c.name.toLowerCase() === e.target.value.trim().toLowerCase());
                         set(l.key, { crew_name: e.target.value, crew_id: match?.id ?? "", crew_contact: l.crew_contact || match?.phone || "" });
                       }} />
                <datalist id={`crew-list-${title}`}>{crew.map((c) => <option key={c.id} value={c.name} />)}</datalist>
              </div>
              <input aria-label={`Flight date, line ${idx + 1}`} type="date" className={inputCls} value={l.flight_date} onChange={(e) => set(l.key, { flight_date: e.target.value })} />
              <input aria-label={`Flight time, line ${idx + 1}`} type="time" className={cn(inputCls, "px-2")} value={l.flight_time} onChange={(e) => set(l.key, { flight_time: e.target.value })} />
              <input aria-label={`Flight number, line ${idx + 1}`} className={cn(inputCls, "uppercase")} maxLength={20} placeholder="Flight no." value={l.flight_number} onChange={(e) => set(l.key, { flight_number: e.target.value })} />
              <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Remove line ${idx + 1}`}
                      className="flex h-10 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <label className="inline-flex items-center gap-2 text-muted-foreground">
                <input type="checkbox" checked={l.pickup_required} onChange={(e) => set(l.key, { pickup_required: e.target.checked })} className="h-4 w-4" /> Needs a pickup
              </label>
              {l.pickup_required && (
                <input aria-label={`Pickup time, line ${idx + 1}`} type="time" className="h-9 rounded-lg border border-border bg-background/50 px-2 text-sm outline-none focus:border-primary/60"
                       value={l.pickup_time} onChange={(e) => set(l.key, { pickup_time: e.target.value })} />
              )}
              <input aria-label={`Contact number, line ${idx + 1}`} type="tel" className="h-9 min-w-[160px] flex-1 rounded-lg border border-border bg-background/50 px-3 text-sm outline-none focus:border-primary/60"
                     maxLength={40} placeholder="Contact number" value={l.crew_contact} onChange={(e) => set(l.key, { crew_contact: e.target.value })} />
              {l.crew_id && <span className="text-[11px] text-emerald-400">On your crew list</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
