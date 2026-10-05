/**
 * Gate passes (Agency with JLS) — ask JLS for a pass for contractors, visitors,
 * a vehicle, crew or a delivery, see where each request has got to, and renew
 * one that's about to run out. Reads and writes through /api/portal/gatepasses;
 * each request is a Client Request the team works, and its status is what's
 * shown here.
 */
import { useCallback, useEffect, useState } from "react";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";
import { ArrowRight, CalendarRange, Car, CheckCircle2, IdCard, Loader2, MapPin, Plus, RotateCcw, Trash2, Users, X } from "lucide-react";
import { GATE_PASS_TYPES, gatePassStatus } from "@/lib/portal/gatepasses";
import { SectionCard, SectionEmpty, SectionHeader, SectionLoading, StatusBadge, fmtDate } from "./section-ui";

type Person = { name: string; company: string | null; id_number: string | null; nationality: string | null };
type PassRequest = {
  id: string; pass_type: string; people: Person[]; company: string | null; vehicle_plate: string | null;
  purpose: string | null; location: string | null; valid_from: string; valid_to: string;
  contact_name: string | null; contact_phone: string | null; notes: string | null; renewal_of: string | null;
  requested_by_name: string | null; captain_request_id: string | null; created_at: string;
  captain_requests: { reference: string; status: string } | null;
};

async function api(path: string, init: RequestInit = {}) {
  const res = await portalFetch(path, { ...init, headers: init.body ? { "Content-Type": "application/json" } : undefined });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong — please try again.");
  return body;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysFromToday = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${todayIso()}T00:00:00Z`)) / 86400000);
const typeLabel = (t: string) => GATE_PASS_TYPES.find((x) => x.value === t)?.label ?? t;
const dateRange = (a: string, b: string) => (a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`);

export function GatePassesSection({ canEdit, onOpenRequest }: { canEdit: boolean; onOpenRequest: (requestId: string) => void }) {
  const [rows, setRows] = useState<PassRequest[]>([]);
  const [defaultLocation, setDefaultLocation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<{ from: PassRequest | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const body = await api("/api/portal/gatepasses");
      setRows(body.requests ?? []); setDefaultLocation(body.defaultLocation ?? null); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load gate passes.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <SectionLoading />;

  const today = todayIso();
  const current = rows.filter((r) => r.valid_to >= today && r.captain_requests?.status !== "cancelled");
  const past = rows.filter((r) => !current.includes(r));

  const Row = ({ r }: { r: PassRequest }) => {
    const st = gatePassStatus(r.captain_requests?.status);
    const left = daysFromToday(r.valid_to);
    const issued = r.captain_requests?.status === "completed";
    const expiring = issued && left >= 0 && left <= 3;
    const Icon = r.pass_type === "vehicle" ? Car : Users;
    return (
      <SectionCard className={cn("p-4", expiring && "border-amber-500/40")}>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{typeLabel(r.pass_type)}{r.company ? ` · ${r.company}` : ""}</span>
              <StatusBadge label={st.label} tone={st.tone} />
              {r.renewal_of && <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">renewal</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><CalendarRange className="h-3.5 w-3.5" /> {dateRange(r.valid_from, r.valid_to)}</span>
              {r.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {r.location}</span>}
              {r.vehicle_plate && <span className="inline-flex items-center gap-1"><Car className="h-3.5 w-3.5" /> {r.vehicle_plate}</span>}
            </div>
            {r.people.length > 0 && (
              <div className="mt-1.5 text-sm">{r.people.map((p) => p.name).join(", ")}</div>
            )}
            {r.purpose && <div className="mt-1 text-xs text-muted-foreground">{r.purpose}</div>}
            {expiring && <div className="mt-1.5 text-xs font-medium text-amber-300">{left === 0 ? "Expires today" : `Expires in ${left} day${left === 1 ? "" : "s"}`} — renew it if they're still coming.</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <button type="button" onClick={() => setForm({ from: r })}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground transition hover:text-foreground">
                <RotateCcw className="h-3.5 w-3.5" /> Renew
              </button>
            )}
            {r.captain_request_id && (
              <button type="button" onClick={() => onOpenRequest(r.captain_request_id!)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground transition hover:text-foreground">
                {r.captain_requests?.reference ?? "Request"} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </SectionCard>
    );
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Gate passes"
                     subtitle="Ask JLS for quay access for contractors, visitors, vehicles, crew and deliveries — and renew a pass before it runs out."
                     action={canEdit && (
                       <button type="button" onClick={() => setForm({ from: null })}
                               className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:brightness-110">
                         <Plus className="h-4 w-4" /> Request a pass
                       </button>
                     )} />
      {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}
      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      {rows.length === 0 ? (
        <SectionEmpty icon={IdCard} message={canEdit
          ? "No gate passes requested yet. Tell us who's coming and when, and JLS arranges the pass with the marina."
          : "No gate passes requested yet."} />
      ) : (
        <>
          {current.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Current &amp; upcoming</h2>
              {current.map((r) => <Row key={r.id} r={r} />)}
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Past</h2>
              {past.slice(0, 30).map((r) => <Row key={r.id} r={r} />)}
            </div>
          )}
        </>
      )}

      {form && (
        <GatePassForm from={form.from} defaultLocation={defaultLocation}
                      onClose={() => setForm(null)}
                      onSent={(ref) => { setForm(null); setNotice(`Sent to JLS as ${ref}. We'll confirm once the pass is issued.`); void load(); }} />
      )}
    </div>
  );
}

// ── Request / renew ─────────────────────────────────────────────────────────
const inputCls =
  "w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm outline-none transition focus:border-primary/60";
type DraftPerson = { key: string; name: string; company: string; id_number: string; nationality: string };
let seq = 0;
const blankPerson = (p: Partial<DraftPerson> = {}): DraftPerson => ({ key: `p${++seq}`, name: "", company: "", id_number: "", nationality: "", ...p });

function GatePassForm({ from, defaultLocation, onClose, onSent }: {
  from: PassRequest | null; defaultLocation: string | null; onClose: () => void; onSent: (reference: string) => void;
}) {
  // A renewal starts the day after the old pass ends (or today, if that's passed), for the same length.
  const renewStart = from ? (() => {
    const next = new Date(Date.parse(`${from.valid_to}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    return next < todayIso() ? todayIso() : next;
  })() : todayIso();
  const length = from ? Math.max(0, daysFromToday(from.valid_to) - daysFromToday(from.valid_from)) : 0;
  const renewEnd = new Date(Date.parse(`${renewStart}T00:00:00Z`) + length * 86400000).toISOString().slice(0, 10);

  const [passType, setPassType] = useState(from?.pass_type ?? "contractor");
  const [people, setPeople] = useState<DraftPerson[]>(() =>
    from?.people.length ? from.people.map((p) => blankPerson({ name: p.name, company: p.company ?? "", id_number: p.id_number ?? "", nationality: p.nationality ?? "" })) : [blankPerson()]);
  const [company, setCompany] = useState(from?.company ?? "");
  const [plate, setPlate] = useState(from?.vehicle_plate ?? "");
  const [validFrom, setValidFrom] = useState(renewStart);
  const [validTo, setValidTo] = useState(from ? renewEnd : todayIso());
  const [location, setLocation] = useState(from?.location ?? defaultLocation ?? "");
  const [purpose, setPurpose] = useState(from?.purpose ?? "");
  const [contactName, setContactName] = useState(from?.contact_name ?? "");
  const [contactPhone, setContactPhone] = useState(from?.contact_phone ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setPerson = (key: string, patch: Partial<DraftPerson>) => setPeople((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const named = people.filter((p) => p.name.trim());
  const ready = validFrom && validTo && validTo >= validFrom && (passType === "vehicle" ? plate.trim() : named.length > 0);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const res = await api("/api/portal/gatepasses", {
        method: "POST",
        body: JSON.stringify({
          pass_type: passType, company, vehicle_plate: plate, valid_from: validFrom, valid_to: validTo, location, purpose,
          contact_name: contactName, contact_phone: contactPhone, notes, renewal_of: from?.id ?? null,
          people: named.map(({ key, ...p }) => p),
        }),
      });
      onSent(res.requestReference);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send."); setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{from ? "Renew gate pass" : "Request a gate pass"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-medium text-muted-foreground">Who is it for?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {GATE_PASS_TYPES.map((t) => (
              <label key={t.value} title={t.blurb}
                     className={cn("flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2.5 text-center text-sm font-medium transition",
                       passType === t.value ? "border-primary/60 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                <input type="radio" name="pass-type" value={t.value} checked={passType === t.value} onChange={() => setPassType(t.value)} className="sr-only" />
                {t.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="gp-from" className="mb-1.5 block text-xs font-medium text-muted-foreground">From <span className="text-primary">*</span></label>
            <input id="gp-from" type="date" className={inputCls} min={todayIso()} value={validFrom}
                   onChange={(e) => { setValidFrom(e.target.value); if (validTo < e.target.value) setValidTo(e.target.value); }} />
          </div>
          <div>
            <label htmlFor="gp-to" className="mb-1.5 block text-xs font-medium text-muted-foreground">Until <span className="text-primary">*</span></label>
            <input id="gp-to" type="date" className={inputCls} min={validFrom} value={validTo} onChange={(e) => setValidTo(e.target.value)} />
          </div>
          <div>
            <label htmlFor="gp-company" className="mb-1.5 block text-xs font-medium text-muted-foreground">Company</label>
            <input id="gp-company" className={inputCls} maxLength={120} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Alpha Marine Services" />
          </div>
          <div>
            <label htmlFor="gp-where" className="mb-1.5 block text-xs font-medium text-muted-foreground">Where</label>
            <input id="gp-where" className={inputCls} maxLength={160} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Marina and berth" />
          </div>
          {(passType === "vehicle" || passType === "delivery") && (
            <div>
              <label htmlFor="gp-plate" className="mb-1.5 block text-xs font-medium text-muted-foreground">Vehicle plate{passType === "vehicle" && <span className="text-primary"> *</span>}</label>
              <input id="gp-plate" className={cn(inputCls, "uppercase")} maxLength={30} value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="e.g. DXB A 12345" />
            </div>
          )}
          <div className={cn(passType === "vehicle" || passType === "delivery" ? "" : "sm:col-span-2")}>
            <label htmlFor="gp-purpose" className="mb-1.5 block text-xs font-medium text-muted-foreground">Purpose</label>
            <input id="gp-purpose" className={inputCls} maxLength={300} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Generator service" />
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">People{passType !== "vehicle" && <span className="text-primary"> *</span>}</h3>
            <button type="button" onClick={() => setPeople((ps) => [...ps, blankPerson({ company })])}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              <Plus className="h-3.5 w-3.5" /> Add a person
            </button>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">As on their passport or Emirates ID — the marina checks it at the gate.</p>
          <div className="mt-2 space-y-2">
            {people.map((p, i) => (
              <div key={p.key} className="grid gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_36px]">
                <input aria-label={`Person ${i + 1} full name`} className={inputCls} maxLength={120} placeholder="Full name" value={p.name} onChange={(e) => setPerson(p.key, { name: e.target.value })} />
                <input aria-label={`Person ${i + 1} passport or ID number`} className={inputCls} maxLength={40} placeholder="Passport / ID no." value={p.id_number} onChange={(e) => setPerson(p.key, { id_number: e.target.value })} />
                <input aria-label={`Person ${i + 1} nationality`} className={inputCls} maxLength={60} placeholder="Nationality" value={p.nationality} onChange={(e) => setPerson(p.key, { nationality: e.target.value })} />
                <button type="button" onClick={() => setPeople((ps) => (ps.length > 1 ? ps.filter((x) => x.key !== p.key) : [blankPerson()]))}
                        aria-label={`Remove person ${i + 1}`} className="flex h-10 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-red-300">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="gp-cname" className="mb-1.5 block text-xs font-medium text-muted-foreground">On-site contact</label>
            <input id="gp-cname" className={inputCls} maxLength={120} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Who meets them" />
          </div>
          <div>
            <label htmlFor="gp-cphone" className="mb-1.5 block text-xs font-medium text-muted-foreground">Contact number</label>
            <input id="gp-cphone" type="tel" className={inputCls} maxLength={40} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="gp-notes" className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes for JLS</label>
            <textarea id="gp-notes" className={cn(inputCls, "min-h-[64px]")} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Arrival times, equipment they're bringing…" />
          </div>
        </div>

        {error && <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        <button type="button" onClick={() => void submit()} disabled={busy || !ready}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Send to JLS
        </button>
      </div>
    </div>
  );
}
