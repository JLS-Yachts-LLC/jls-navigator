/**
 * Crew Contract Builder — a multi-step wizard (General → Salary → Trial & Notice →
 * Calculations → Adjustments → Travel → Review). Core fields map to crew_contracts
 * columns; the rest live in crew_contracts.values (jsonb). Supports reusable
 * contract profiles (save current config / apply a saved one).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ArrowRight, Check, Loader2, Save, BookMarked } from "lucide-react";

const db = () => supabase as any;
const CUR = ["USD", "EUR", "GBP", "AED"];
const STEPS = ["General", "Salary", "Trial & Notice", "Calculations", "Adjustments", "Travel", "Review"];

type Values = Record<string, any>;
const DEFAULTS: Values = {
  contract_type: "SEA", start_date: "", end_date: "", port_of_engagement: "", special_terms: "",
  payroll_id: "", currency: "EUR", salary_calc: "Monthly", salary: "", daily_rate: "", secondary_salary: "",
  trial_included: false, trial_duration: "", accrue_leave_trial: true, notice_during: "", notice_after: "",
  employment_type: "Rotation", annual_leave_days: "", accrual_method: "Day-by-day", accrual_rate: "1",
  leave_balance_carry: "", travel_level: "Economy", repat_destination: "", budget_currency: "EUR",
  flight_budget: "", track_flights: true, yearly_allowance: "",
};

function num(v: any): number | null { const n = Number(v); return v === "" || isNaN(n) ? null : n; }

export function ContractBuilder({ crew, yachts, onClose, onSaved }: {
  crew: { id: string; full_name: string; rank?: string; yacht_id?: string; currency?: string }[];
  yachts: { id: string; vessel_name: string }[];
  onClose: () => void; onSaved: () => void;
}) {
  const [step, setStep] = useState(0);
  const [crewId, setCrewId] = useState("");
  const [yachtId, setYachtId] = useState("");
  const [position, setPosition] = useState("");
  const [v, setV] = useState<Values>(DEFAULTS);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: string, val: any) => setV((p) => ({ ...p, [k]: val }));

  useEffect(() => {
    (async () => { const { data } = await db().from("crew_contract_profiles").select("*").order("name"); setProfiles(data ?? []); })();
  }, []);

  // Daily rate auto-derives from a monthly salary (×12 / 365), like Voly.
  useEffect(() => {
    if (v.salary_calc === "Monthly" && v.salary !== "" && !isNaN(Number(v.salary))) {
      set("daily_rate", ((Number(v.salary) * 12) / 365).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.salary, v.salary_calc]);

  function pickCrew(id: string) {
    setCrewId(id);
    const c = crew.find((x) => x.id === id);
    if (c) { setPosition(c.rank ?? ""); if (c.yacht_id) setYachtId(c.yacht_id); if (c.currency) set("currency", c.currency); }
  }
  function applyProfile(id: string) {
    const p = profiles.find((x) => x.id === id); if (!p) return;
    setV((prev) => ({ ...prev, ...p.values }));
    toast.success(`Applied "${p.name}"`);
  }
  async function saveProfile() {
    const name = prompt("Save this configuration as a profile named:"); if (!name?.trim()) return;
    const { values: _omit, ...rest } = v as any; void _omit;
    const { error } = await db().from("crew_contract_profiles").insert({ name: name.trim(), values: v });
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    const { data } = await db().from("crew_contract_profiles").select("*").order("name"); setProfiles(data ?? []);
  }

  async function save() {
    if (!crewId) { toast.error("Select a crew member"); setStep(0); return; }
    setBusy(true);
    try {
      const row = {
        placed_crew_id: crewId, yacht_id: yachtId || null, position: position || null,
        contract_type: v.contract_type || null, employment_type: v.employment_type || null,
        start_date: v.start_date || null, end_date: v.end_date || null,
        salary: num(v.salary), currency: v.currency || null, rotation: v.accrual_rate ? `1:${v.accrual_rate}` : null,
        status: "draft", values: { ...v, position, port_of_engagement: v.port_of_engagement },
      };
      const { error } = await db().from("crew_contracts").insert(row);
      if (error) throw error;
      toast.success("Contract created"); onSaved();
    } catch (e: any) { toast.error(e.message ?? "Failed"); setBusy(false); }
  }

  const fld = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div><label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</label>{children}</div>
  );
  const Toggle = ({ k }: { k: string }) => (
    <div className="flex h-9 overflow-hidden rounded-md border border-border text-xs">
      {["No", "Yes"].map((lbl, i) => (
        <button key={lbl} onClick={() => set(k, i === 1)} className={`flex-1 ${(!!v[k]) === (i === 1) ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>{lbl}</button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header + stepper */}
        <div className="border-b border-border px-5 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">New Contract</h2>
            <div className="flex items-center gap-2">
              {profiles.length > 0 && (
                <select onChange={(e) => e.target.value && applyProfile(e.target.value)} value="" className="h-8 rounded-md border border-border bg-background px-2 text-xs">
                  <option value="">Apply profile…</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              <button onClick={saveProfile} title="Save as profile" className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"><BookMarked className="h-3.5 w-3.5" /> Save profile</button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {STEPS.map((s, i) => (
              <button key={s} onClick={() => setStep(i)} className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${i === step ? "bg-primary/15 text-primary" : i < step ? "text-emerald-400" : "text-muted-foreground"}`}>
                {i < step ? "✓ " : ""}{s}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {step === 0 && (
            <div className="grid grid-cols-2 gap-3">
              <F label="Crew member *"><select className={fld} value={crewId} onChange={(e) => pickCrew(e.target.value)}><option value="">— select —</option>{crew.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></F>
              <F label="Vessel"><select className={fld} value={yachtId} onChange={(e) => setYachtId(e.target.value)}><option value="">— none —</option>{yachts.map((y) => <option key={y.id} value={y.id}>{y.vessel_name}</option>)}</select></F>
              <F label="Position"><Input className="h-9" value={position} onChange={(e) => setPosition(e.target.value)} /></F>
              <F label="Contract type"><select className={fld} value={v.contract_type} onChange={(e) => set("contract_type", e.target.value)}>{["SEA", "Employment", "Freelance", "Daywork"].map((x) => <option key={x}>{x}</option>)}</select></F>
              <F label="Employment start date"><Input type="date" className="h-9" value={v.start_date} onChange={(e) => set("start_date", e.target.value)} /></F>
              <F label="Port of engagement"><Input className="h-9" value={v.port_of_engagement} onChange={(e) => set("port_of_engagement", e.target.value)} /></F>
              <div className="col-span-2"><F label="Special terms & conditions"><textarea rows={2} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={v.special_terms} onChange={(e) => set("special_terms", e.target.value)} /></F></div>
            </div>
          )}
          {step === 1 && (
            <div className="grid grid-cols-2 gap-3">
              <F label="Payroll ID"><Input className="h-9" value={v.payroll_id} onChange={(e) => set("payroll_id", e.target.value)} /></F>
              <F label="Salary currency"><select className={fld} value={v.currency} onChange={(e) => set("currency", e.target.value)}>{CUR.map((c) => <option key={c}>{c}</option>)}</select></F>
              <F label="Primary salary calculation"><select className={fld} value={v.salary_calc} onChange={(e) => set("salary_calc", e.target.value)}>{["Monthly", "Daily"].map((c) => <option key={c}>{c}</option>)}</select></F>
              <F label={v.salary_calc === "Daily" ? "Daily rate" : "Monthly salary"}><Input type="number" className="h-9" value={v.salary} onChange={(e) => set("salary", e.target.value)} /></F>
              <F label="Base daily rate (auto)"><Input className="h-9" value={v.daily_rate} onChange={(e) => set("daily_rate", e.target.value)} readOnly={v.salary_calc === "Monthly"} /></F>
              <F label="Secondary monthly salary"><Input type="number" className="h-9" value={v.secondary_salary} onChange={(e) => set("secondary_salary", e.target.value)} /></F>
            </div>
          )}
          {step === 2 && (
            <div className="grid grid-cols-2 gap-3">
              <F label="Include trial period"><Toggle k="trial_included" /></F>
              <F label="Trial duration (days)"><Input type="number" className="h-9" value={v.trial_duration} onChange={(e) => set("trial_duration", e.target.value)} disabled={!v.trial_included} /></F>
              <F label="Accrue leave during trial"><Toggle k="accrue_leave_trial" /></F>
              <div />
              <F label="Notice period during trial (days)"><Input type="number" className="h-9" value={v.notice_during} onChange={(e) => set("notice_during", e.target.value)} /></F>
              <F label="Notice period after trial (days)"><Input type="number" className="h-9" value={v.notice_after} onChange={(e) => set("notice_after", e.target.value)} /></F>
            </div>
          )}
          {step === 3 && (
            <div className="grid grid-cols-2 gap-3">
              <F label="Employment"><select className={fld} value={v.employment_type} onChange={(e) => set("employment_type", e.target.value)}>{["Permanent", "Rotation"].map((c) => <option key={c}>{c}</option>)}</select></F>
              <F label="Annual leave (days)"><Input type="number" className="h-9" value={v.annual_leave_days} onChange={(e) => set("annual_leave_days", e.target.value)} /></F>
              <F label="Accrual calculation"><select className={fld} value={v.accrual_method} onChange={(e) => set("accrual_method", e.target.value)}>{["Day-by-day", "Calendar month"].map((c) => <option key={c}>{c}</option>)}</select></F>
              <F label="1 day ON accrues __ day OFF"><Input type="number" step="0.01" className="h-9" value={v.accrual_rate} onChange={(e) => set("accrual_rate", e.target.value)} /></F>
              {v.employment_type === "Rotation" && <p className="col-span-2 text-[11px] text-amber-400">Rotation contracts do not accrue holiday whilst off the vessel.</p>}
            </div>
          )}
          {step === 4 && (
            <div className="grid grid-cols-2 gap-3">
              <F label="Leave balance to carry (+/−)"><Input type="number" className="h-9" value={v.leave_balance_carry} onChange={(e) => set("leave_balance_carry", e.target.value)} /></F>
              <p className="col-span-2 text-[11px] text-muted-foreground">If they owe the vessel, enter a negative number (e.g. −5).</p>
            </div>
          )}
          {step === 5 && (
            <div className="grid grid-cols-2 gap-3">
              <F label="Travel level"><select className={fld} value={v.travel_level} onChange={(e) => set("travel_level", e.target.value)}>{["Economy", "Premium Economy", "Business", "First"].map((c) => <option key={c}>{c}</option>)}</select></F>
              <F label="Repatriation destination"><Input className="h-9" value={v.repat_destination} onChange={(e) => set("repat_destination", e.target.value)} /></F>
              <F label="Budget currency"><select className={fld} value={v.budget_currency} onChange={(e) => set("budget_currency", e.target.value)}>{CUR.map((c) => <option key={c}>{c}</option>)}</select></F>
              <F label="Flight budget"><Input type="number" className="h-9" value={v.flight_budget} onChange={(e) => set("flight_budget", e.target.value)} /></F>
              <F label="Track number of flights"><Toggle k="track_flights" /></F>
              <F label="Yearly flight allowance"><Input type="number" className="h-9" value={v.yearly_allowance} onChange={(e) => set("yearly_allowance", e.target.value)} /></F>
            </div>
          )}
          {step === 6 && (
            <div className="rounded-lg border border-border bg-background divide-y divide-border/60 text-sm">
              {[
                ["Crew", crew.find((c) => c.id === crewId)?.full_name], ["Vessel", yachts.find((y) => y.id === yachtId)?.vessel_name],
                ["Position", position], ["Type", `${v.contract_type} · ${v.employment_type}`], ["Start", v.start_date],
                ["Salary", v.salary ? `${v.salary} ${v.currency} (${v.salary_calc})` : "—"], ["Daily rate", v.daily_rate],
                ["Trial", v.trial_included ? `${v.trial_duration} days` : "None"], ["Notice", `${v.notice_during || 0}/${v.notice_after || 0} days`],
                ["Annual leave", v.annual_leave_days], ["Accrual", `${v.accrual_method} · 1:${v.accrual_rate}`],
                ["Leave carry", v.leave_balance_carry || "0"], ["Travel", `${v.travel_level} → ${v.repat_destination || "—"}`],
              ].map(([k, val]) => <div key={k as string} className="flex justify-between px-3 py-1.5"><span className="text-muted-foreground">{k}</span><span className="font-medium">{(val as string) || "—"}</span></div>)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => step === 0 ? onClose() : setStep(step - 1)} className="gap-1.5"><ArrowLeft className="h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}</Button>
          {step < STEPS.length - 1
            ? <Button size="sm" onClick={() => setStep(step + 1)} className="gap-1.5">Next <ArrowRight className="h-4 w-4" /></Button>
            : <Button size="sm" onClick={save} disabled={busy} className="gap-1.5">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Create contract</Button>}
        </div>
      </div>
    </div>
  );
}
