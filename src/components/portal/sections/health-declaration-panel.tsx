/**
 * Arrivals & departures → Declaration of Health (SD-0064). The master completes
 * Abu Dhabi Ports' Maritime Declaration of Health before every Abu Dhabi arrival
 * — at least five working days ahead — signs it (adding the ship's stamp if
 * there is one) and sends it to JLS, who receive it as a Client Request with
 * the signed PDF. Reads and writes through /api/portal/health-declaration.
 */
import { useCallback, useEffect, useState } from "react";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowRight, CalendarClock, FileDown, HeartPulse, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { SignaturePad, VesselStampPicker } from "@/components/esign/signature-pad";
import {
  DECLARATION_TEXT, HEALTH_FIELDS, HEALTH_QUESTIONS, HEALTH_REQUIRED, SYMPTOMS_NOTE,
  healthDueDate, missingAnswers, needsParticulars, uaeToday,
  type HealthAnswers, type JoinedPerson, type PortOfCall,
} from "@/lib/portal/health-declaration";
import { SectionCard, StatusBadge, SectionLoading, fmtDate } from "./section-ui";

async function api(path: string, init: RequestInit = {}) {
  const res = await portalFetch(path, { ...init, headers: init.body ? { "Content-Type": "application/json" } : undefined });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong — please try again.");
  return body;
}

async function openPdf(id: string) {
  const res = await portalFetch(`/api/portal/documents/open?type=health_declaration&id=${id}`, { redirect: "follow" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "The PDF could not be opened.");
  window.open(res.url, "_blank", "noreferrer");
}

const inputCls =
  "w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm outline-none transition focus:border-primary/60 disabled:opacity-60";

type Sent = {
  id: string; arrival_date: string | null; port_of_arrival: string | null; arriving_from: string | null;
  due_date: string | null; late: boolean; submitted_at: string | null; submitted_by_name: string | null;
  captain_request_id: string | null; captain_requests: { reference: string; status: string } | null;
};
type Data = { draft: Record<string, any> | null; submitted: Sent[] };

const REQUEST_STATUS: Record<string, string> = {
  new: "Sent", acknowledged: "Acknowledged", in_progress: "In progress", completed: "Done", cancelled: "Cancelled",
};

export function HealthDeclarationPanel({ canEdit, onOpenRequest }: { canEdit: boolean; onOpenRequest: (id: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [ports, setPorts] = useState<PortOfCall[]>([]);
  const [joined, setJoined] = useState<JoinedPerson[]>([]);
  const [answers, setAnswers] = useState<HealthAnswers>({});
  const [particulars, setParticulars] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [stamp, setStamp] = useState<string | null>(null);
  const [savedStamp, setSavedStamp] = useState<"use" | "replace" | "none">("use");
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const body: Data = await api("/api/portal/health-declaration");
      setData(body);
      const d = body.draft;
      if (d) {
        setVals(Object.fromEntries(HEALTH_FIELDS.map((f) => [f.key, d[f.key] == null ? "" : String(d[f.key])])));
        setPorts(d.ports_of_call?.length ? d.ports_of_call : [{ port: "", departed: "" }]);
        setJoined(d.joined_persons ?? []);
        setAnswers(d.answers ?? {});
        setParticulars(d.particulars ?? "");
        setSavedStamp(d.hasSavedStamp ? "use" : "none");
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
  const payload = () => ({ ...vals, ports_of_call: ports, joined_persons: joined, answers, particulars, removeSavedStamp: savedStamp !== "use" });
  const missing = [
    ...HEALTH_REQUIRED.filter((k) => !vals[k]?.trim()).map((k) => HEALTH_FIELDS.find((f) => f.key === k)!.label),
    ...missingAnswers(answers),
    ...(needsParticulars(answers) && !particulars.trim() ? ["particulars for each \"yes\""] : []),
  ];
  const due = vals.arrival_date ? healthDueDate(vals.arrival_date) : null;
  const overdue = !!due && uaeToday() > due;
  const ready = missing.length === 0 && !!signature && confirm;

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name); setError(null); setNotice(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(null); }
  }
  const start = () => run("start", async () => { await api("/api/portal/health-declaration", { method: "POST", body: "{}" }); await load(); });
  const save = () => run("save", async () => {
    await api(`/api/portal/health-declaration?id=${draft!.id}`, { method: "PATCH", body: JSON.stringify(payload()) });
    setNotice("Draft saved.");
  });
  const submit = () => run("submit", async () => {
    const res = await api(`/api/portal/health-declaration?id=${draft!.id}&action=submit`, {
      method: "POST",
      body: JSON.stringify({ ...payload(), signature, stamp: savedStamp === "use" ? null : stamp, confirm }),
    });
    setSignature(null); setStamp(null); setConfirm(false);
    setNotice(`Signed and sent to JLS as ${res.requestReference}.${res.late ? " It was sent after the due date, so it's marked late — JLS will be in touch if the port needs anything more." : ""}`);
    await load();
  });

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => setVals((v) => ({ ...v, [key]: e.target.value }));
  const field = (key: string) => {
    const f = HEALTH_FIELDS.find((x) => x.key === key)!;
    const required = HEALTH_REQUIRED.includes(key);
    return (
      <div key={key}>
        <label htmlFor={`hd-${key}`} className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {f.label}{required && <span className="text-primary"> *</span>}
        </label>
        <input id={`hd-${key}`} className={cn(inputCls, required && !vals[key]?.trim() && "border-amber-500/40")}
               type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} min={f.type === "number" ? 0 : undefined}
               disabled={!canEdit} value={vals[key] ?? ""} onChange={set(key)} />
      </div>
    );
  };
  const yesNo = (value: string | null | undefined, onChange: (v: "yes" | "no") => void, label: string) => (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-xl border border-border p-0.5 text-xs">
      {(["yes", "no"] as const).map((v) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} disabled={!canEdit} onClick={() => onChange(v)}
                className={cn("min-w-[52px] rounded-lg px-3 py-1.5 font-semibold uppercase transition",
                              value === v ? (v === "yes" ? "bg-amber-500 text-black" : "bg-primary text-primary-foreground") : "text-muted-foreground hover:text-foreground")}>
          {v}
        </button>
      ))}
    </div>
  );
  const yesNoField = (key: string) => (
    <div key={key} className="flex items-center justify-between gap-3">
      <span className="text-sm">{HEALTH_FIELDS.find((f) => f.key === key)!.label}</span>
      {yesNo(vals[key], (v) => setVals((x) => ({ ...x, [key]: v })), HEALTH_FIELDS.find((f) => f.key === key)!.label)}
    </div>
  );

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
              The master completes a Maritime Declaration of Health for every Abu Dhabi arrival and sends it to JLS at least
              5 working days before arrival. Your ship's details and crew numbers are filled in for you.
            </div>
          </div>
          {canEdit && (
            <button type="button" onClick={() => void start()} disabled={!!busy}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
              {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Start declaration
            </button>
          )}
        </SectionCard>
      ) : (
        <>
          <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
                             overdue ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-primary/25 bg-primary/5 text-foreground/90")}>
            {overdue ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
            <span>
              {!due ? "Enter your Abu Dhabi arrival date to see when this is due — it must reach JLS at least 5 working days before arrival."
                : overdue ? <>This was due by <b>{fmtDate(due)}</b>. You can still send it — it will be marked late, so please send it as soon as you can.</>
                : <>Due to JLS by <b>{fmtDate(due)}</b> — 5 working days before your arrival on {fmtDate(vals.arrival_date)}.</>}
            </span>
          </div>

          <SectionCard className="p-5">
            <h2 className="text-sm font-semibold">This voyage</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">{["arrival_date", "port_of_arrival", "arriving_from", "sailing_to", "crew_count", "passenger_count"].map(field)}</div>
          </SectionCard>

          <SectionCard className="p-5">
            <h2 className="text-sm font-semibold">Ship</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">From your vessel profile and last declaration — check them and correct anything that has changed.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">{["ship_name", "imo_no", "flag", "master_name", "gross_tonnage", "surgeon_name"].map(field)}</div>
          </SectionCard>

          <SectionCard className="space-y-3 p-5">
            <h2 className="text-sm font-semibold">Sanitation</h2>
            {yesNoField("sanitation_cert_carried")}
            {vals.sanitation_cert_carried === "yes" && <div className="grid gap-3 sm:grid-cols-2">{["sanitation_cert_issued_at", "sanitation_cert_date"].map(field)}</div>}
            {yesNoField("reinspection_required")}
            {yesNoField("visited_affected_area")}
            {vals.visited_affected_area === "yes" && <div className="grid gap-3 sm:grid-cols-2">{["affected_area_port", "affected_area_date"].map(field)}</div>}
          </SectionCard>

          <SectionCard className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Ports of call</h2>
              {canEdit && <button type="button" onClick={() => setPorts((p) => [...p, { port: "", departed: "" }])} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"><Plus className="h-3.5 w-3.5" /> Add port</button>}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">Since the voyage began, or in the past 30 days if that's shorter, with the date you left each one.</p>
            <div className="mt-3 space-y-2">
              {ports.map((p, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_150px_36px] gap-2">
                  <input aria-label={`Port ${i + 1}`} className={inputCls} placeholder="Port" maxLength={120} disabled={!canEdit} value={p.port}
                         onChange={(e) => setPorts((ps) => ps.map((x, j) => (j === i ? { ...x, port: e.target.value } : x)))} />
                  <input aria-label={`Departed port ${i + 1}`} type="date" className={inputCls} disabled={!canEdit} value={p.departed}
                         onChange={(e) => setPorts((ps) => ps.map((x, j) => (j === i ? { ...x, departed: e.target.value } : x)))} />
                  {canEdit && <button type="button" aria-label={`Remove port ${i + 1}`} onClick={() => setPorts((ps) => ps.filter((_, j) => j !== i))}
                                      className="flex h-10 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">People who joined</h2>
              {canEdit && <button type="button" onClick={() => setJoined((p) => [...p, { name: "", joined_from: ["", "", ""] }])} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"><Plus className="h-3.5 w-3.5" /> Add person</button>}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Crew, guests or anyone else who joined since the voyage began or in the past 30 days, with up to three ports or countries they came from.
              Anyone who signed on through JLS in the last 30 days is already listed.
            </p>
            {joined.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Nobody — add anyone who has joined.</p>}
            <div className="mt-3 space-y-2">
              {joined.map((p, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_36px]">
                  <input aria-label={`Name ${i + 1}`} className={inputCls} placeholder="Name" maxLength={120} disabled={!canEdit} value={p.name}
                         onChange={(e) => setJoined((ps) => ps.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  {[0, 1, 2].map((k) => (
                    <input key={k} aria-label={`Joined from (${k + 1}), person ${i + 1}`} className={inputCls} placeholder={`Joined from (${k + 1})`} maxLength={80}
                           disabled={!canEdit} value={p.joined_from?.[k] ?? ""}
                           onChange={(e) => setJoined((ps) => ps.map((x, j) => {
                             if (j !== i) return x;
                             const from = [...(x.joined_from ?? ["", "", ""])]; from[k] = e.target.value;
                             return { ...x, joined_from: from };
                           }))} />
                  ))}
                  {canEdit && <button type="button" aria-label={`Remove person ${i + 1}`} onClick={() => setJoined((ps) => ps.filter((_, j) => j !== i))}
                                      className="flex h-10 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard className="p-5">
            <h2 className="text-sm font-semibold">Health questions</h2>
            <div className="mt-3 divide-y divide-border/60">
              {HEALTH_QUESTIONS.map((q, i) => (
                <div key={q.key} className="py-3 first:pt-0">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm"><span className="text-muted-foreground">{i + 1}.</span> {q.text}</span>
                    {yesNo(answers[q.key] as string, (v) => setAnswers((a) => ({ ...a, [q.key]: v })), `Question ${i + 1}`)}
                  </div>
                  {answers[q.key] === "yes" && q.count && (
                    <div className="mt-2 flex items-center gap-2 pl-4">
                      <label htmlFor={`hd-${q.count.key}`} className="text-xs text-muted-foreground">{q.count.label}</label>
                      <input id={`hd-${q.count.key}`} type="number" min={0} className={cn(inputCls, "w-24 py-1.5")} disabled={!canEdit}
                             value={answers[q.count.key] == null ? "" : String(answers[q.count.key])}
                             onChange={(e) => setAnswers((a) => ({ ...a, [q.count!.key]: e.target.value }))} />
                    </div>
                  )}
                  {answers[q.key] === "yes" && q.where && (
                    <div className="mt-2 pl-4">
                      <input aria-label="Where did they join the ship?" className={inputCls} maxLength={120} placeholder="Where did they join the ship (if known)?" disabled={!canEdit}
                             value={(answers[q.where] as string) ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.where!]: e.target.value }))} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            {(needsParticulars(answers) || particulars) && (
              <div className="mt-3">
                <label htmlFor="hd-particulars" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Particulars for each "yes" — who, symptoms, dates, and any medical treatment or advice <span className="text-primary">*</span>
                </label>
                <textarea id="hd-particulars" rows={4} maxLength={4000} className={inputCls} disabled={!canEdit} value={particulars} onChange={(e) => setParticulars(e.target.value)} />
                <p className="mt-1 text-[11px] text-muted-foreground">This goes on the schedule attached to the declaration.</p>
              </div>
            )}
            <details className="mt-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer">Which symptoms count as a suspected infectious disease?</summary>
              <p className="mt-1.5 leading-relaxed">{SYMPTOMS_NOTE}</p>
            </details>
          </SectionCard>

          {canEdit && (
            <SectionCard className="space-y-3 p-5">
              <h2 className="text-sm font-semibold">Sign as master</h2>
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
                <span>{DECLARATION_TEXT}</span>
              </label>
              {/* The signature and stamp pickers are styled for a light page. */}
              <div className="space-y-3 rounded-xl bg-white p-3 text-slate-900">
                <SignaturePad onChange={setSignature} />
                {savedStamp === "use" ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm">
                    <span className="flex-1">Your ship stamp from your last declaration will be added.</span>
                    <button type="button" onClick={() => setSavedStamp("replace")} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">Use a different stamp</button>
                    <button type="button" onClick={() => setSavedStamp("none")} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">No stamp</button>
                  </div>
                ) : (
                  <VesselStampPicker onChange={setStamp} />
                )}
              </div>
            </SectionCard>
          )}

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              {missing.length > 0 && <span className="text-xs text-amber-300">Still needed: {missing.join(", ")}</span>}
              {missing.length === 0 && !signature && <span className="text-xs text-amber-300">Sign above to send.</span>}
              {missing.length === 0 && signature && !confirm && <span className="text-xs text-amber-300">Tick the declaration to send.</span>}
              <div className="flex-1" />
              <button type="button" onClick={() => void save()} disabled={!!busy}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-5 text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50">
                {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />} Save draft
              </button>
              <button type="button" onClick={() => void submit()} disabled={!!busy || !ready}
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
                <div className="font-medium">Arriving {fmtDate(s.arrival_date)} · {s.port_of_arrival ?? "—"}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  From {s.arriving_from ?? "—"} · sent {fmtDate(s.submitted_at)}{s.submitted_by_name ? ` by ${s.submitted_by_name}` : ""}
                  {s.captain_requests?.reference && ` · ${s.captain_requests.reference}`}
                </div>
              </button>
              {s.late && <StatusBadge label="Sent late" tone="amber" />}
              {s.captain_requests && <StatusBadge label={REQUEST_STATUS[s.captain_requests.status] ?? s.captain_requests.status} tone={s.captain_requests.status === "completed" ? "green" : "sky"} />}
              <button type="button" onClick={() => void run(`pdf-${s.id}`, () => openPdf(s.id))}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground">
                {busy === `pdf-${s.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} PDF
              </button>
              {s.captain_request_id && <ArrowRight className="h-4 w-4 text-muted-foreground/60" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
