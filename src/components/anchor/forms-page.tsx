import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileText, ChevronLeft, Loader2, Download, Mail, PenLine, CheckCircle2, Ship, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ANCHOR_FORMS, type FormDef, type FormField } from "@/lib/anchor-forms/definitions";

// yachts column → form field key (auto-populate vessel data). Anything we don't hold
// on the yacht record (voyage-specific fields like ETA, persons onboard) is left blank.
const VESSEL_MAP: Record<string, string> = {
  vessel_name: "vessel_name", flag: "vessel_flag", imo_no: "imo",
  length_overall_m: "loa", mmsi: "mmsi", berth: "berth",
  location: "marina_arrival", port_of_registry: "marina_departure",
  // CF12a vessel-registration / details / owner fields
  vessel_type: "vessel_type", built_year: "year_build", gross_tonnage: "gross_tonnage",
  breadth_m: "beam", draught_m: "draft", max_crew: "crew_count", max_guests: "max_passengers",
  owners_name: "owner_name", owners_nationality: "owner_nationality",
  contact_no: "owner_mobile", email_address: "owner_email",
};
const VESSEL_COLS =
  "id, vessel_name, flag, imo_no, length_overall_m, mmsi, berth, location, port_of_registry, " +
  "vessel_type, built_year, gross_tonnage, breadth_m, draught_m, max_crew, max_guests, " +
  "owners_name, owners_nationality, contact_no, email_address";

// JLS is the Approved Maritime Agent — pre-fill the agent block on every DMA form.
const AGENT_DEFAULTS: Record<string, string> = {
  agent_details: "JLS Yachts LLC, Office 58-2 Leader Sport Compound, Plot 598-1000, DIP 1, P.O. Box 341766, Dubai, United Arab Emirates",
  contact_number: "+971 (0)4 331 3555",
  email: "info@jlsyachts.com",
  // CF12a agent block
  agent_name: "JLS Yachts LLC",
  agent_phone: "+971 (0)4 331 3555",
};

type Result = { submissionId: string; pdfUrl: string; emailTo: string | null; title: string };

async function token(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}
async function api(body: any) {
  const res = await fetch("/api/anchor-forms", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok || !j.ok) throw new Error(j.error ?? "Request failed");
  return j;
}

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40";

function Field({ field, value, onChange }: { field: FormField; value: string; onChange: (v: string) => void }) {
  const common = { value, onChange: (e: any) => onChange(e.target.value), placeholder: field.placeholder };
  return (
    <div className={field.full ? "sm:col-span-2" : ""}>
      <label className="mb-1 flex items-baseline gap-2 text-xs font-medium text-muted-foreground">
        <span>{field.label}{field.required && <span className="text-destructive"> *</span>}</span>
        {field.labelAr && <span dir="rtl" className="text-[11px] text-muted-foreground/60">{field.labelAr}</span>}
      </label>
      {field.type === "textarea" ? (
        <textarea {...common} rows={2} className={inputCls} />
      ) : field.type === "select" ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">Select…</option>
          {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "time" ? "time" : field.type === "email" ? "email" : "text"} {...common} className={inputCls} />
      )}
    </div>
  );
}

function FillForm({ def, onBack }: { def: FormDef; onBack: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [signer, setSigner] = useState({ name: "", email: "" });

  const set = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));
  const fieldKeys = new Set(def.sections.flatMap((s) => s.fields).map((f) => f.key));
  const missing = def.sections.flatMap((s) => s.fields).filter((f) => f.required && !values[f.key]?.trim());

  // Vessel auto-populate: forms with a vessel_name field get a vessel picker that
  // prefills vessel fields from the yachts record.
  const hasVessel = fieldKeys.has("vessel_name");
  const [vessels, setVessels] = useState<any[]>([]);
  useEffect(() => {
    if (!hasVessel) return;
    void (async () => {
      const { data } = await (supabase as any).from("yachts").select(VESSEL_COLS).order("vessel_name");
      setVessels(data ?? []);
    })();
  }, [hasVessel]);

  // Pre-fill the Maritime Agent block (JLS) once, for any form that has those fields.
  useEffect(() => {
    setValues((p) => {
      const next = { ...p };
      for (const [key, val] of Object.entries(AGENT_DEFAULTS)) {
        if (fieldKeys.has(key) && !next[key]) next[key] = val;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.key]);
  function pickVessel(id: string) {
    const y = vessels.find((v) => v.id === id);
    if (!y) return;
    setValues((p) => {
      const next = { ...p };
      for (const [col, key] of Object.entries(VESSEL_MAP)) {
        if (fieldKeys.has(key) && y[col] != null && y[col] !== "") next[key] = String(y[col]);
      }
      return next;
    });
    toast.success(`Pre-filled from ${y.vessel_name}`);
  }

  // Signatory auto-populate: forms with a signatory_name field get a picker that
  // prefills the signatory's name + title from the JLS signatory registry (the same
  // registry that stamps signatures on DMA approval).
  const hasSignatory = fieldKeys.has("signatory_name");
  const [signatories, setSignatories] = useState<any[]>([]);
  useEffect(() => {
    if (!hasSignatory) return;
    void (async () => {
      const { data } = await (supabase as any).from("jls_signatories")
        .select("id, full_name, title").eq("active", true).order("full_name");
      setSignatories(data ?? []);
    })();
  }, [hasSignatory]);
  function pickSignatory(id: string) {
    const s = signatories.find((x) => x.id === id);
    if (!s) return;
    setValues((p) => {
      const next = { ...p };
      if (fieldKeys.has("signatory_name")) next.signatory_name = s.full_name ?? "";
      if (fieldKeys.has("signatory_title") && s.title) next.signatory_title = s.title;
      return next;
    });
    toast.success(`Signatory set to ${s.full_name}`);
  }

  async function generate() {
    if (missing.length) { toast.error(`Required: ${missing.map((f) => f.label).join(", ")}`); return; }
    setBusy("generate");
    try {
      const r = await api({ action: "generate", formKey: def.key, values });
      setResult(r); setEmailTo(r.emailTo ?? "");
      toast.success("Form generated");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }
  async function email() {
    if (!result) return;
    if (!emailTo.trim()) { toast.error("Enter a recipient email"); return; }
    setBusy("email");
    try { await api({ action: "email", submissionId: result.submissionId, to: emailTo }); toast.success(`Emailed to ${emailTo}`); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }
  async function sign() {
    if (!result) return;
    if (!signer.name.trim() || !signer.email.trim()) { toast.error("Enter signer name and email"); return; }
    setBusy("sign");
    try { await api({ action: "sign", submissionId: result.submissionId, signerName: signer.name, signerEmail: signer.email }); toast.success("Sent for signature"); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-5">
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> All forms
      </button>
      <h1 className="font-display text-xl font-semibold">{def.title}</h1>
      {def.intro && <p className="mt-1 text-sm text-muted-foreground">{def.intro}</p>}

      {(hasVessel || hasSignatory) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/50 p-3">
          {hasVessel && (
            <>
              <Ship className="h-4 w-4 text-primary/70" />
              <span className="text-xs font-medium text-muted-foreground">Auto-fill from vessel</span>
              <select onChange={(e) => e.target.value && pickVessel(e.target.value)} className={`${inputCls} max-w-xs`} defaultValue="">
                <option value="">Select a vessel…</option>
                {vessels.map((v) => <option key={v.id} value={v.id}>{v.vessel_name ?? "Unnamed"}</option>)}
              </select>
            </>
          )}
          {hasSignatory && (
            <>
              <PenLine className="h-4 w-4 text-primary/70" />
              <span className="text-xs font-medium text-muted-foreground">Signatory</span>
              <select onChange={(e) => e.target.value && pickSignatory(e.target.value)} className={`${inputCls} max-w-xs`} defaultValue="">
                <option value="">Select a signatory…</option>
                {signatories.map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.title ? ` — ${s.title}` : ""}</option>)}
              </select>
            </>
          )}
        </div>
      )}

      <div className="mt-5 space-y-6">
        {def.sections.map((section, i) => (
          <div key={i}>
            {section.title && <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-primary/80">{section.title}</div>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {section.fields.map((f) => <Field key={f.key} field={f} value={values[f.key] ?? ""} onChange={(v) => set(f.key, v)} />)}
            </div>
          </div>
        ))}
      </div>

      {!result ? (
        <button onClick={generate} disabled={busy === "generate"} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Generate document
        </button>
      ) : (
        <div className="mt-6 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Document generated</div>
          <div className="flex flex-wrap items-end gap-4">
            <a href={result.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/50">
              <Download className="h-4 w-4" /> Download / view PDF
            </a>
          </div>
          {/* Email */}
          <div className="mt-4 border-t border-border/60 pt-4">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Email this document</div>
            <div className="flex flex-wrap gap-2">
              <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="recipient@example.com" className={`${inputCls} max-w-xs`} />
              <button onClick={email} disabled={busy === "email"} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/50 disabled:opacity-50">
                {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Send email
              </button>
            </div>
          </div>
          {/* Sign */}
          <div className="mt-4 border-t border-border/60 pt-4">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Send for e-signature (Anchor)</div>
            <div className="flex flex-wrap gap-2">
              <input value={signer.name} onChange={(e) => setSigner((s) => ({ ...s, name: e.target.value }))} placeholder="Signer name" className={`${inputCls} max-w-[180px]`} />
              <input value={signer.email} onChange={(e) => setSigner((s) => ({ ...s, email: e.target.value }))} placeholder="Signer email" className={`${inputCls} max-w-[200px]`} />
              <button onClick={sign} disabled={busy === "sign"} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/50 disabled:opacity-50">
                {busy === "sign" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />} Send for signature
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  completed: { label: "Generated", cls: "bg-muted text-muted-foreground" },
  emailed: { label: "Emailed", cls: "bg-primary/15 text-primary" },
  sent_for_signature: { label: "Sent for signature", cls: "bg-amber-500/15 text-amber-500" },
  signed: { label: "Signed", cls: "bg-emerald-500/15 text-emerald-500" },
};

const APPROVAL_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Awaiting approval", cls: "bg-amber-500/15 text-amber-500" },
  approved: { label: "Approved", cls: "bg-emerald-500/15 text-emerald-500" },
  rejected: { label: "Rejected", cls: "bg-red-500/15 text-red-400" },
};

export function FormsPage() {
  const [active, setActive] = useState<FormDef | null>(null);
  const [subs, setSubs] = useState<any[]>([]);
  const [approveTarget, setApproveTarget] = useState<any | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const { data } = await (supabase as any).from("anchor_form_submissions")
      .select("id, form_key, title, status, created_at, pdf_path, signed_pdf_path, approval_status, approval_chain, approval_step, approval_log")
      .order("created_at", { ascending: false }).limit(25);
    setSubs(data ?? []);
  }, []);
  useEffect(() => { void reload(); }, [reload, active]);

  async function viewPdf(path: string) {
    const { data } = await (supabase as any).storage.from("esign-documents").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("Could not open the document");
  }
  async function act(action: "approve" | "reject", id: string) {
    if (action === "reject" && !confirm("Reject this document?")) return;
    setBusyId(id);
    try { await api({ action, submissionId: id }); toast.success(action === "approve" ? "Approved" : "Rejected"); await reload(); }
    catch (e: any) { toast.error(e.message ?? "Failed"); } finally { setBusyId(null); }
  }

  if (active) return <FillForm def={active} onBack={() => setActive(null)} />;

  return (
    <div className="mx-auto max-w-4xl px-6 py-5">
      <h1 className="font-display text-xl font-semibold">Digital Forms</h1>
      <p className="mt-1 text-sm text-muted-foreground">Fill a form, generate a PDF, then download, email, or send it for signature.</p>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ANCHOR_FORMS.map((f) => (
          <button key={f.key} onClick={() => setActive(f)} className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/50">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5" /></div>
            <div className="min-w-0">
              <div className="font-display text-sm font-semibold">{f.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{f.description}</div>
              <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">{f.category}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Document tracking */}
      <div className="mt-8">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Recent documents</div>
        {subs.length === 0 ? (
          <div className="rounded-xl border border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">No documents generated yet.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            {subs.map((s) => {
              const m = STATUS_META[s.status] ?? { label: s.status, cls: "bg-muted text-muted-foreground" };
              const isDma = typeof s.form_key === "string" && s.form_key.startsWith("dma-");
              const ap = s.approval_status && s.approval_status !== "none" ? APPROVAL_META[s.approval_status] : null;
              const chain = (s.approval_chain ?? []) as { name: string; email: string }[];
              const currentApprover = s.approval_status === "pending" ? chain[s.approval_step ?? 0] : null;
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 border-b border-border/50 bg-card px-4 py-2.5 last:border-0">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{s.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(s.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {currentApprover && <> · with <strong className="text-foreground">{currentApprover.name || currentApprover.email}</strong></>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {ap && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ap.cls}`}>{ap.label}</span>}
                    {!ap && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.cls}`}>{m.label}</span>}
                    {(s.signed_pdf_path || s.pdf_path) && (
                      <button onClick={() => viewPdf(s.signed_pdf_path || s.pdf_path)} className="text-xs text-primary hover:underline">View</button>
                    )}
                    {isDma && (!s.approval_status || s.approval_status === "none" || s.approval_status === "rejected") && s.pdf_path && (
                      <button onClick={() => setApproveTarget(s)} className="rounded bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/25">Submit for approval</button>
                    )}
                    {s.approval_status === "pending" && (
                      <>
                        <button disabled={busyId === s.id} onClick={() => act("approve", s.id)} className="rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/25">{busyId === s.id ? "…" : "Approve"}</button>
                        <button disabled={busyId === s.id} onClick={() => act("reject", s.id)} className="rounded px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-red-400">Reject</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {approveTarget && <ApprovalSubmitDialog sub={approveTarget} onClose={() => setApproveTarget(null)} onDone={() => { setApproveTarget(null); void reload(); }} />}
    </div>
  );
}

function ApprovalSubmitDialog({ sub, onClose, onDone }: { sub: any; onClose: () => void; onDone: () => void }) {
  const [sigs, setSigs] = useState<any[]>([]);
  const [chain, setChain] = useState<{ name: string; email: string }[]>([]);
  const [signatoryId, setSignatoryId] = useState("");
  const [authority, setAuthority] = useState("sail@pcfc.ae");
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("jls_signatories").select("id, full_name, email, approver_name, approver_email, signature_path").eq("active", true).order("full_name");
      setSigs(data ?? []);
    })();
  }, []);

  function addApprover() {
    const s = sigs.find((x) => x.id === pick);
    if (!s) return;
    const email = s.approver_email || s.email;
    const name = s.approver_name || s.full_name;
    if (!email || chain.some((c) => c.email === email)) return;
    setChain((c) => [...c, { name, email }]); setPick("");
  }
  async function submit() {
    if (!chain.length) { toast.error("Add at least one approver"); return; }
    setBusy(true);
    try {
      await api({ action: "submit-approval", submissionId: sub.id, chain, signatoryId: signatoryId || null, authorityEmail: authority || null });
      toast.success("Submitted for approval"); onDone();
    } catch (e: any) { toast.error(e.message ?? "Failed"); setBusy(false); }
  }
  const fld = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-border px-5 py-3.5"><h2 className="text-base font-semibold">Submit for approval</h2><p className="text-xs text-muted-foreground mt-0.5">{sub.title}</p></div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Approval chain (in order)</label>
            <div className="flex gap-2">
              <select className={fld} value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Add approver…</option>
                {sigs.map((s) => <option key={s.id} value={s.id}>{s.approver_name || s.full_name} ({s.approver_email || s.email || "no email"})</option>)}
              </select>
              <Button size="sm" variant="outline" className="h-9" onClick={addApprover} disabled={!pick}>Add</Button>
            </div>
            <div className="mt-2 space-y-1">
              {chain.length === 0 && <p className="text-[11px] text-muted-foreground/60">No approvers yet — add Hilary, then Maddie, etc.</p>}
              {chain.map((c, i) => (
                <div key={c.email} className="flex items-center gap-2 rounded border border-border/60 bg-background px-2 py-1 text-xs">
                  <span className="text-muted-foreground">{i + 1}.</span><span className="flex-1">{c.name} <span className="text-muted-foreground">· {c.email}</span></span>
                  <button onClick={() => setChain((x) => x.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Signatory (auto-signs on approval)</label>
              <select className={fld} value={signatoryId} onChange={(e) => setSignatoryId(e.target.value)}>
                <option value="">— none —</option>
                {sigs.map((s) => <option key={s.id} value={s.id} disabled={!s.signature_path}>{s.full_name}{s.signature_path ? "" : " (no signature)"}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Email to authority on approval</label>
              <input className={fld} value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder="sail@pcfc.ae" />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={busy || !chain.length}>{busy ? "…" : "Submit"}</Button>
        </div>
      </div>
    </div>
  );
}

export default FormsPage;
