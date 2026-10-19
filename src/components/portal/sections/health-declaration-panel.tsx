/**
 * Maritime Declaration of Health (Abu Dhabi Ports, IHR 2005 Annex 8): what
 * the master completes, signs and sends back to the JLS Abu Dhabi agency team
 * at least five working days before arriving in Abu Dhabi. Ship particulars,
 * crew on board and recent joiners come filled in, and everything stays
 * editable. Sending it builds the signed PDF, files it on the vessel's
 * documents and raises a Client Request. Reads and writes go through
 * /api/portal/health-declaration (the table is closed to portal logins).
 */
import { useCallback, useEffect, useState } from "react";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";
import { ArrowRight, CalendarClock, Download, HeartPulse, Loader2, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { SignaturePad, VesselStampPicker } from "@/components/esign/signature-pad";
import {
  DECLARATION_TEXT, HEALTH_FIELDS, HEALTH_QUESTIONS, HEALTH_REQUIRED, MAX_JOINERS, MAX_PORTS, SYMPTOMS_NOTE,
  detailsKey, healthDueDate, missingForSubmit, uaeToday, type JoinedPerson, type PortOfCall,
} from "@/lib/portal/health-declaration";
import { SectionCard, SectionLoading, StatusBadge, fmtDate } from "./section-ui";

async function api(path: string, init: RequestInit = {}) {
  const res = await portalFetch(path, { ...init, headers: init.body ? { "Content-Type": "application/json" } : undefined });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong — please try again.");
  return body;
}

const inputCls =
  "w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm outline-none transition focus:border-primary/60 disabled:opacity-60";

type Prefill = {
  ship_name: string | null; imo_no: string | null; flag: string | null; gross_tonnage: string | null;
  master_name: string | null; crew_count: number | null; joined_persons: JoinedPerson[];
};
type Submitted = {
  id: string; arrival_date: string | null; port_of_arrival: string | null; arriving_from: string | null;
  due_date: string | null; late: boolean; submitted_at: string | null; submitted_by_name: string | null;
  document_id: string | null; captain_request_id: string | null; captain_requests: { reference: string; status: string } | null;
};
type HealthData = { prefill: Prefill; draft: Record<string, any> | null; submitted: Submitted[]; holidays: string[] };

const REQUEST_STATUS: Record<string, string> = {
  new: "Sent", acknowledged: "Acknowledged", in_progress: "In progress", completed: "Done", cancelled: "Cancelled",
};

const emptyJoiner = (): JoinedPerson => ({ name: "", joined_from: ["", "", ""] });

/** Working days (Mon–Fri, less holidays) from today until `date`; negative once it has passed. */
function workingDaysUntil(date: string, holidays: Set<string>): number {
  const today = uaeToday();
  if (date === today) return 0;
  const step = date > today ? 1 : -1;
  const d = new Date(`${today}T00:00:00Z`);
  let n = 0;
  while (d.toISOString().slice(0, 10) !== date) {
    d.setUTCDate(d.getUTCDate() + step);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6 && !holidays.has(d.toISOString().slice(0, 10))) n += step;
  }
  return n;
}

export function HealthDeclarationPanel({ canEdit, onOpenRequest }: { canEdit: boolean; onOpenRequest: (id: string) => void }) {
  const [data, setData] = useState<HealthData | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [ports, setPorts] = useState<PortOfCall[]>([]);
  const [joined, setJoined] = useState<JoinedPerson[]>([]);
  const [particulars, setParticulars] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [stamp, setStamp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const body: HealthData = await api("/api/portal/health-declaration");
      setData(body);
      const d = body.draft;
      if (d) {
        setVals(Object.fromEntries(HEALTH_FIELDS.map((f) => [f.key, d[f.key] == null ? "" : String(d[f.key])])));
        setAnswers(Object.fromEntries(Object.entries((d.answers ?? {}) as Record<string, unknown>).map(([k, v]) => [k, v == null ? "" : String(v)])));
        setPorts(((d.ports_of_call ?? []) as PortOfCall[]).length ? d.ports_of_call : [{ port: "", departed: "" }]);
        setJoined(((d.joined_persons ?? []) as JoinedPerson[]).map((p) => ({ name: p.name ?? "", joined_from: [0, 1, 2].map((i) => p.joined_from?.[i] ?? "") })));
        setParticulars(d.particulars ?? "");
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the declaration.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <SectionLoading />;
  if (!data) return <SectionCard className="px-6 py-10 text-center text-sm text-red-300">{error}</SectionCard>;

  const draft = data.draft;
  const holidays = new Set(data.holidays);
  const due = healthDueDate(vals.arrival_date, data.holidays);
  const dueIn = due ? workingDaysUntil(due, holidays) : null;
  const payload = () => ({ ...vals, answers, ports_of_call: ports, joined_persons: joined, particulars });
  const missing = draft ? missingForSubmit({ ...vals, answers }) : [];

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name); setError(null); setNotice(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(null); }
  }
  const start = () => run("start", async () => {
    await api("/api/portal/health-declaration", { method: "POST", body: "{}" });
    await load();
  });
  const save = () => run("save", async () => {
    await api(`/api/portal/health-declaration?id=${draft!.id}`, { method: "PATCH", body: JSON.stringify(payload()) });
    setNotice("Draft saved.");
  });
  const submit = () => run("submit", async () => {
    const res = await api(`/api/portal/health-declaration?id=${draft!.id}&action=submit`, {
      method: "POST", body: JSON.stringify({ ...payload(), signature, stamp }),
    });
    setNotice(`Signed and sent to JLS as ${res.requestReference}. The PDF is in your documents.${res.late ? " It was sent after the due date, so the team will treat it as urgent." : ""}`);
    setSignature(null); setStamp(null);
    await load();
  });
  const refill = () => {
    const p = data.prefill;
    setVals((v) => ({
      ...v,
      ship_name: p.ship_name ?? v.ship_name, imo_no: p.imo_no ?? v.imo_no, flag: p.flag ?? v.flag,
      gross_tonnage: p.gross_tonnage ?? v.gross_tonnage, master_name: p.master_name ?? v.master_name,
      crew_count: p.crew_count == null ? v.crew_count : String(p.crew_count),
    }));
    setNotice("Filled in from your vessel profile and crew list — check, then save.");
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => setVals((v) => ({ ...v, [key]: e.target.value }));
  const field = (key: string, className?: string) => {
    const f = HEALTH_FIELDS.find((x) => x.key === key)!;
    const required = HEALTH_REQUIRED.includes(key);
    return (
      <div key={key} className={className}>
        <label htmlFor={`hd-${key}`} className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {f.label}{required && <span className="text-primary"> *</span>}
        </label>
        <input id={`hd-${key}`} className={cn(inputCls, required && !vals[key]?.trim() && "border-amber-500/40")}
               type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} min={f.type === "number" ? 0 : undefined}
               step={f.type === "number" ? 1 : undefined} disabled={!canEdit} value={vals[key] ?? ""} onChange={set(key)} />
      </div>
    );
  };
  const yesNo = (value: string | undefined, onChange: (v: string) => void, label: string) => (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-xl border border-border p-1 text-sm">
      {(["yes", "no"] as const).map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} disabled={!canEdit} onClick={() => onChange(o)}
                className={cn("min-w-14 rounded-lg px-3 py-1.5 font-medium capitalize transition disabled:opacity-60",
                  value === o ? (o === "yes" ? "bg-amber-500 text-black" : "bg-primary text-primary-foreground") : "text-muted-foreground hover:text-foreground")}>
          {o}
        </button>
      ))}
    </div>
  );
  const fieldYesNo = (key: string) => {
    const f = HEALTH_FIELDS.find((x) => x.key === key)!;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0 flex-1 text-sm">{f.label}{HEALTH_REQUIRED.includes(key) && <span className="text-primary"> *</span>}</span>
        {yesNo(vals[key], (v) => setVals((x) => ({ ...x, [key]: v })), f.label)}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}
      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      {!draft ? (
        <SectionCard className="flex flex-wrap items-center gap-4 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><HeartPulse className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Arriving in Abu Dhabi?</div>
            <div className="text-sm text-muted-foreground">
              Abu Dhabi Ports needs a Maritime Declaration of Health, signed by the master. Send it to JLS at least five working days before you arrive. Your ship's particulars and crew are filled in for you.
            </div>
          </div>
          {canEdit && (
            <button type="button" onClick={() => void start()} disabled={!!busy}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
              {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Start health declaration
            </button>
          )}
        </SectionCard>
      ) : (
        <>
          <SectionCard className="p-5">
            <h2 className="text-sm font-semibold">Arrival</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {field("arrival_date")}
              <div className="flex items-end">
                <div className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-sm",
                  dueIn == null ? "border-border text-muted-foreground"
                    : dueIn < 0 ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                    : dueIn <= 2 ? "border-amber-500/30 bg-amber-500/5 text-amber-200"
                    : "border-emerald-500/30 bg-emerald-500/5 text-emerald-200")}>
                  <CalendarClock className="h-4 w-4 shrink-0" />
                  {due == null
                    ? "Enter your arrival date to see when this is due."
                    : dueIn! < 0
                      ? <>Was due by {fmtDate(due)}. You can still send it, but it will be marked late.</>
                      : <>Due by <strong className="font-semibold">{fmtDate(due)}</strong> ({dueIn === 0 ? "today" : `${dueIn} working day${dueIn === 1 ? "" : "s"} left`})</>}
                </div>
              </div>
              {field("port_of_arrival")}
              {field("arriving_from")}
              {field("sailing_to")}
              <div className="grid grid-cols-2 gap-3">{field("crew_count")}{field("passenger_count")}</div>
            </div>
          </SectionCard>

          <SectionCard className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Ship</h2>
              {canEdit && (
                <button type="button" onClick={refill} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                  <RefreshCw className="h-3.5 w-3.5" /> Refill from vessel profile
                </button>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {["ship_name", "imo_no", "flag", "master_name", "gross_tonnage", "inland_tonnage", "surgeon_name"].map((k) => field(k))}
            </div>
          </SectionCard>

          <SectionCard className="space-y-4 p-5">
            <h2 className="text-sm font-semibold">Sanitation certificate &amp; affected areas</h2>
            {fieldYesNo("sanitation_cert_carried")}
            {vals.sanitation_cert_carried === "yes" && (
              <div className="grid gap-3 sm:grid-cols-2">{field("sanitation_cert_issued_at")}{field("sanitation_cert_date")}</div>
            )}
            {fieldYesNo("reinspection_required")}
            {fieldYesNo("visited_affected_area")}
            {vals.visited_affected_area === "yes" && (
              <div className="grid gap-3 sm:grid-cols-2">{field("affected_area_port")}{field("affected_area_date")}</div>
            )}
          </SectionCard>

          <SectionCard className="p-5">
            <h2 className="text-sm font-semibold">Ports of call</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Since the voyage began or in the last 30 days, whichever is shorter, with the date you left each one.</p>
            <div className="mt-3 space-y-2">
              {ports.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{i + 1}.</span>
                  <input aria-label={`Port of call ${i + 1}`} placeholder="Port" className={inputCls} disabled={!canEdit} value={p.port}
                         onChange={(e) => setPorts((x) => x.map((y, j) => (j === i ? { ...y, port: e.target.value } : y)))} />
                  <input aria-label={`Departure date ${i + 1}`} type="date" className={cn(inputCls, "w-44 shrink-0")} disabled={!canEdit} value={p.departed}
                         onChange={(e) => setPorts((x) => x.map((y, j) => (j === i ? { ...y, departed: e.target.value } : y)))} />
                  {canEdit && (
                    <button type="button" aria-label={`Remove port ${i + 1}`} onClick={() => setPorts((x) => x.filter((_, j) => j !== i))}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-red-300">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {canEdit && ports.length < MAX_PORTS && (
              <button type="button" onClick={() => setPorts((x) => [...x, { port: "", departed: "" }])}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                <Plus className="h-3.5 w-3.5" /> Add port
              </button>
            )}
          </SectionCard>

          <SectionCard className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Persons who joined in the last 30 days</h2>
              {canEdit && data.prefill.joined_persons.length > 0 && (
                <button type="button" onClick={() => setJoined(data.prefill.joined_persons.map((p) => ({ name: p.name, joined_from: [0, 1, 2].map((i) => p.joined_from?.[i] ?? "") })))}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                  <RefreshCw className="h-3.5 w-3.5" /> Refill from crew sign-ons
                </button>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">Crew, passengers or anyone else, with up to three ports or countries each has come from.</p>
            {joined.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Nobody listed.</p>}
            <div className="mt-3 space-y-3">
              {joined.map((p, i) => (
                <div key={i} className="rounded-xl border border-border bg-background/30 p-3">
                  <div className="flex items-center gap-2">
                    <input aria-label={`Person ${i + 1} name`} placeholder="Name" className={inputCls} disabled={!canEdit} value={p.name}
                           onChange={(e) => setJoined((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                    {canEdit && (
                      <button type="button" aria-label={`Remove person ${i + 1}`} onClick={() => setJoined((x) => x.filter((_, j) => j !== i))}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-red-300">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {[0, 1, 2].map((n) => (
                      <input key={n} aria-label={`Person ${i + 1} joined from (${n + 1})`} placeholder={`Joined from (${n + 1})`} className={inputCls}
                             disabled={!canEdit} value={p.joined_from[n] ?? ""}
                             onChange={(e) => setJoined((x) => x.map((y, j) => (j === i ? { ...y, joined_from: y.joined_from.map((f, m) => (m === n ? e.target.value : f)) } : y)))} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {canEdit && joined.length < MAX_JOINERS && (
              <button type="button" onClick={() => setJoined((x) => [...x, emptyJoiner()])}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                <Plus className="h-3.5 w-3.5" /> Add person
              </button>
            )}
          </SectionCard>

          <SectionCard className="p-5">
            <h2 className="text-sm font-semibold">Health questions</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Answer every question. For each yes, give the details: they go on the schedule attached to the declaration.</p>
            <ol className="mt-3 space-y-4">
              {HEALTH_QUESTIONS.map((q, i) => (
                <li key={q.key} className="border-t border-border/60 pt-4 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 text-sm"><span className="text-muted-foreground">{i + 1}.</span> {q.text}</span>
                    {yesNo(answers[q.key], (v) => setAnswers((a) => ({ ...a, [q.key]: v })), `Question ${i + 1}`)}
                  </div>
                  {answers[q.key] === "yes" && (
                    <div className="mt-3 space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
                      {q.count && (
                        <div className="max-w-56">
                          <label htmlFor={`hd-${q.count.key}`} className="mb-1 block text-xs font-medium text-muted-foreground">{q.count.label} <span className="text-primary">*</span></label>
                          <input id={`hd-${q.count.key}`} type="number" min={0} step={1} className={inputCls} disabled={!canEdit} value={answers[q.count.key] ?? ""}
                                 onChange={(e) => setAnswers((a) => ({ ...a, [q.count!.key]: e.target.value }))} />
                        </div>
                      )}
                      <label htmlFor={`hd-${detailsKey(q)}`} className="block text-xs font-medium text-muted-foreground">If yes, give details <span className="text-primary">*</span></label>
                      <textarea id={`hd-${detailsKey(q)}`} rows={3} className={inputCls} placeholder={q.hint} disabled={!canEdit} value={answers[detailsKey(q)] ?? ""}
                                onChange={(e) => setAnswers((a) => ({ ...a, [detailsKey(q)]: e.target.value }))} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <div className="mt-4">
              <label htmlFor="hd-particulars" className="mb-1.5 block text-xs font-medium text-muted-foreground">Further remarks (optional)</label>
              <textarea id="hd-particulars" rows={2} className={inputCls} disabled={!canEdit} value={particulars} onChange={(e) => setParticulars(e.target.value)} />
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">{SYMPTOMS_NOTE}</p>
          </SectionCard>

          {canEdit && (
            <SectionCard className="p-5">
              <h2 className="text-sm font-semibold">Declaration &amp; signature</h2>
              <p className="mt-1 text-sm text-muted-foreground">{DECLARATION_TEXT}</p>
              <div className="mt-3 space-y-3 rounded-xl bg-white p-3 text-slate-900">
                <div className="text-xs font-medium text-slate-600">Master's signature <span className="text-red-600">*</span></div>
                <SignaturePad onChange={setSignature} />
                <VesselStampPicker onChange={setStamp} />
              </div>
            </SectionCard>
          )}

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              {(missing.length > 0 || !signature) && (
                <span className="text-xs text-amber-300">Still needed: {[...missing, ...(signature ? [] : ["the master's signature"])].join(", ")}</span>
              )}
              <div className="flex-1" />
              <button type="button" onClick={() => void save()} disabled={!!busy}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-5 text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50">
                {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />} Save draft
              </button>
              <button type="button" onClick={() => void submit()} disabled={!!busy || missing.length > 0 || !signature}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
                {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Sign &amp; send to JLS
              </button>
            </div>
          )}
        </>
      )}

      {data.submitted.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Sent to JLS</h2>
          {data.submitted.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-card/80 p-4">
              <button type="button" disabled={!s.captain_request_id} onClick={() => s.captain_request_id && onOpenRequest(s.captain_request_id)}
                      className="min-w-0 flex-1 text-left enabled:hover:text-primary">
                <div className="font-medium">Arriving {fmtDate(s.arrival_date)} · {s.port_of_arrival ?? "Abu Dhabi"}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  From {s.arriving_from ?? "—"} · sent {fmtDate(s.submitted_at)}{s.submitted_by_name ? ` by ${s.submitted_by_name}` : ""}
                  {s.captain_requests?.reference && ` · ${s.captain_requests.reference}`}
                </div>
              </button>
              {s.late && <StatusBadge label="Sent late" tone="amber" />}
              {s.captain_requests && <StatusBadge label={REQUEST_STATUS[s.captain_requests.status] ?? s.captain_requests.status} tone={s.captain_requests.status === "completed" ? "green" : "sky"} />}
              {s.document_id && <OpenPdfButton id={s.document_id} />}
              {s.captain_request_id && <ArrowRight className="h-4 w-4 text-muted-foreground/60" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Opens the signed PDF through the portal's ownership-checked document endpoint. */
function OpenPdfButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try {
      const res = await portalFetch(`/api/portal/documents/open?type=vessel_doc&id=${id}`, { redirect: "follow" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "That document could not be opened.");
      }
      window.open(res.url, "_blank", "noreferrer");
    } catch (e) {
      alert(e instanceof Error ? e.message : "That document could not be opened.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={() => void open()} disabled={busy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-foreground transition hover:border-primary/50 disabled:opacity-50">
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} PDF
    </button>
  );
}
