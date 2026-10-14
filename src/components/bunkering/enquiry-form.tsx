/**
 * The bunkering enquiry form — JLS's Bunkering Enquiry Form (vessel details, requirements, delivery information) and the
 * vessel's confirmation that fuel type, specification and quantity have been checked against its requirements.
 */
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SignaturePad, type SignaturePadHandle } from "@/components/shipsync/driver/SignaturePad";
import {
  FUEL_TYPES, PORTS, DELIVERY_METHODS, UNITS, ROLES, CONFIRM_METHODS, SAILS_OUT_OPTIONS, matchYacht, vatTreatment, fuelRule, type EnquiryForm,
} from "@/lib/bunkering/model";

const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-1", className)}><Label className="text-sm">{label}</Label>{children}</div>;
}
function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <section className="space-y-3"><h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{n}. {title}</h3>{children}</section>;
}

export type YachtOption = { id: string; vessel_name: string; flag?: string | null };

export function EnquiryFormView({ value, onChange, yachts = [] }: { value: EnquiryForm; onChange: (v: EnquiryForm) => void; yachts?: YachtOption[] }) {
  const linked = yachts.find((y) => y.id === value.yachtId) ?? null;
  /** Typing a yacht's name links the enquiry to it (an exact match only), and fills the flag if it is empty. */
  function typeYacht(name: string) {
    const hit = matchYacht(name, yachts) as YachtOption | null;
    const full = hit ? yachts.find((y) => y.id === hit.id) : null;
    onChange({ ...value, yachtName: name, yachtId: hit?.id ?? "", flag: value.flag || (full?.flag ?? "") });
  }
  const set = <K extends keyof EnquiryForm>(k: K, v: EnquiryForm[K]) => onChange({ ...value, [k]: v });
  const text = (k: keyof EnquiryForm, props: React.ComponentProps<typeof Input> = {}) => (
    <Input value={value[k]} onChange={(e) => set(k, e.target.value)} {...props} />
  );
  return (
    <div className="space-y-6">
      <Section n={1} title="Vessel details">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Yacht name">
            <Input list="bunker-yachts" value={value.yachtName} onChange={(e) => typeYacht(e.target.value)} placeholder="Start typing — Polaris yachts are offered" />
            <datalist id="bunker-yachts">{yachts.map((y) => <option key={y.id} value={y.vessel_name} />)}</datalist>
            <p className={cn("text-xs", linked ? "text-emerald-500" : "text-muted-foreground")}>
              {linked ? `Linked to ${linked.vessel_name} — the vessel can see this enquiry in its Client Portal.` : "Not linked to a Polaris yacht, so the vessel won't see it in the Client Portal. Choose the yacht from the list to link it."}
            </p>
          </Field>
          <Field label="Flag">{text("flag")}</Field>
          <Field label="LOA (m)">{text("loa", { type: "number", inputMode: "decimal", min: 0 })}</Field>
          <Field label="IMO number">{text("imo")}</Field>
          <Field label="Captain's name">{text("captain")}</Field>
          <Field label="Chief Engineer's name">{text("chiefEngineer")}</Field>
          <Field label="Contact number / WhatsApp">{text("contactNumber")}</Field>
          <Field label="Email address">{text("contactEmail", { type: "email" })}</Field>
        </div>
      </Section>

      <Section n={2} title="Bunkering requirements">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bunkering location / port">
            <input className={selectCls} list="bunker-ports" value={value.port} onChange={(e) => set("port", e.target.value)} placeholder="Choose or type a port" />
            <datalist id="bunker-ports">{PORTS.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Marina / berth / anchorage">{text("berth")}</Field>
          <Field label="Preferred bunkering date">{text("preferredDate", { type: "date" })}</Field>
          <Field label="Preferred time">{text("preferredTime", { type: "time" })}</Field>
          <Field label="Fuel type / grade">
            <select className={selectCls} value={value.fuelType} onChange={(e) => set("fuelType", e.target.value)}>
              <option value="">Choose…</option>{FUEL_TYPES.map((f) => <option key={f}>{f}</option>)}
            </select>
          </Field>
          {value.fuelType === "Other" ? <Field label="Which fuel?">{text("fuelOther")}</Field> : <div />}
          <Field label="Required quantity">{text("quantity", { type: "number", inputMode: "decimal", min: 0 })}</Field>
          <Field label="Unit">
            <select className={selectCls} value={value.unit} onChange={(e) => set("unit", e.target.value)}>{UNITS.map((u) => <option key={u.code} value={u.code}>{u.label}</option>)}</select>
          </Field>
        </div>
        <Field label="Required fuel specification / sulphur limit (if applicable)"><Textarea rows={2} value={value.specNotes} onChange={(e) => set("specNotes", e.target.value)} /></Field>
      </Section>

      <Section n={3} title="Delivery information">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Preferred delivery method">
            <select className={selectCls} value={value.deliveryMethod} onChange={(e) => set("deliveryMethod", e.target.value)}>
              <option value="">Choose…</option>{DELIVERY_METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <div />
          <Field label="Estimated fuel remaining on board">{text("fuelRemaining")}</Field>
          <Field label="Available tank capacity for delivery">{text("tankCapacity")}</Field>
        </div>
        <Field label="Special requirements / restrictions"><Textarea rows={2} value={value.specialRequirements} onChange={(e) => set("specialRequirements", e.target.value)} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Will the vessel sail out of the UAE after bunkering?">
            <select className={selectCls} value={value.sailsOut} onChange={(e) => set("sailsOut", e.target.value)}>
              <option value="">Choose…</option>{SAILS_OUT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Planned departure date">{text("departureDate", { type: "date" })}</Field>
        </div>
        <GuidanceNotes form={value} />
        <Field label="Internal notes (JLS only)"><Textarea rows={2} value={value.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </Section>
    </div>
  );
}

/** How the UAE rules apply to this enquiry, worked out from what has been entered (VAT, and the 48-hour rule for 1000 ppm fuel). */
export function GuidanceNotes({ form }: { form: Pick<EnquiryForm, "sailsOut" | "preferredDate" | "departureDate" | "fuelType"> }) {
  const vat = vatTreatment({ sailsOut: form.sailsOut, bunkerDate: form.preferredDate, departureDate: form.departureDate });
  const rule = fuelRule({ fuelType: form.fuelType, bunkerDate: form.preferredDate, departureDate: form.departureDate });
  return (
    <div className="space-y-2">
      <div className={cn("rounded-lg border px-3 py-2 text-sm", vat.rate === null ? "border-border text-muted-foreground" : "border-primary/40 bg-primary/5")}><strong>VAT:</strong> {vat.text}</div>
      {rule && <div className={cn("rounded-lg border px-3 py-2 text-sm", rule.level === "warn" ? "border-amber-500/50 bg-amber-500/10 text-amber-500" : "border-emerald-500/40 text-emerald-500")}><strong>Fuel:</strong> {rule.text}</div>}
    </div>
  );
}

export interface DeclarationHandle { read: () => Promise<{ role: string; name: string; method: string; signature: Blob | null } | null> }

/**
 * The vessel's confirmation: "I confirm that the information provided is accurate and that the requested fuel type, specification
 * and quantity have been checked against the vessel's requirements" — by the Captain or the Chief Engineer, with the name, how it
 * was confirmed, and (when signed on screen) their signature.
 */
export const DeclarationBox = forwardRef<DeclarationHandle, { optional?: boolean; defaultName?: string }>(function DeclarationBox({ optional = false, defaultName = "" }, ref) {
  const [role, setRole] = useState<string>("");
  const [name, setName] = useState(defaultName);
  const [method, setMethod] = useState<string>("Signed on screen");
  const pad = useRef<SignaturePadHandle>(null);

  useImperativeHandle(ref, () => ({
    read: async () => {
      if (!role && !name.trim() && optional) return null;
      if (!role) throw new Error("Say whether the Captain or the Chief Engineer is confirming.");
      if (!name.trim()) throw new Error("Give the name of the person confirming.");
      let signature: Blob | null = null;
      if (method === "Signed on screen") {
        signature = await pad.current?.toBlob() ?? null;
        if (!signature) throw new Error("The signature is needed — sign in the box.");
      }
      return { role, name: name.trim(), method, signature };
    },
  }));

  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">4. Vessel's confirmation</h3>
      <p className="text-sm">I confirm that the information provided is accurate and that the requested <strong>fuel type, specification and quantity</strong> have been checked against the vessel's requirements.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Confirmed by">
          <select className={selectCls} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">{optional ? "Not yet confirmed" : "Choose…"}</option>{ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="How it was confirmed" className="sm:col-span-2">
          <select className={selectCls} value={method} onChange={(e) => setMethod(e.target.value)}>{CONFIRM_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
        </Field>
      </div>
      {method === "Signed on screen" && <div className="space-y-1"><Label className="text-sm">Signature</Label><SignaturePad ref={pad} /></div>}
      {method !== "Signed on screen" && <p className="text-sm text-muted-foreground">Attach the signed form, email or WhatsApp confirmation under Documents and photos so the record holds it.</p>}
      {optional && <p className="text-sm text-muted-foreground">You can leave this empty and record it later — but enquiries cannot go to suppliers until the vessel has confirmed.</p>}
    </section>
  );
});
