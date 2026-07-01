/**
 * BunkerDeliveryNoteForm — native structured Bunker Delivery Note,
 * replacing Bunker_Delivery.xlsm (FRS). Every field from the workbook's
 * BDN/Note sheets, linked directly to the orbit_service_requests row
 * (there is no separate work_order entity in this codebase's ORBIT
 * design). Draft/in-progress states are freely editable via
 * upsert_bunker_delivery_note; signing locks the row at the database level
 * (migration 083's trigger), not just in the UI.
 *
 * Signature capture: Anchor's e-sign is a remote, email-based workflow
 * (send a PDF out for signature via an external service) — not a simple
 * in-form capture widget suitable for an immediate, on-the-spot delivery
 * sign-off, and the go-live spec itself scopes this as a stub for now
 * ("type name to confirm"), with real capture as a distinct future ticket.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

const DELIVERY_PORTS = ["AUH Freeport", "Emirates Palace", "Yas Marina", "Mina Rashid", "Anchorage", "Dubai Harbour", "Other"];
const CAMLOCK_TYPES = ["Adaptor (Male)", "Coupler (Female)"];
const MANIFOLD_LOCATIONS = ["Fwd", "Mid", "Aft"];
const FUEL_GRADES = ["HFO", "MDO", "MGO", "LSMGO", "ULSMGO"];
const DELIVERY_METHODS = ["Ex-Wharf", "Ex-Truck"];
const BERTH_SIDES = ["Port", "Starboard"];
const MARPOL_BASES = [
  { value: "reg_18_3_or_14_1", label: "Reg 18.3 / 14.1" },
  { value: "reg_14_4_ultra_low", label: "Reg 14.4 (Ultra Low)" },
  { value: "purchaser_specified", label: "Purchaser Specified" },
];

const db = () => supabase as any;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
    </div>
  );
}

export function BunkerDeliveryNoteForm({
  requestId,
  yachtId,
  suppliers,
  onBack,
}: {
  requestId: string;
  yachtId: string | null;
  suppliers: { org_id: string; name: string }[];
  onBack: () => void;
}) {
  const [bdn, setBdn] = useState<any>(null);
  const [f, setF] = useState<Record<string, string>>({ quantity_uom: "MT" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [signName, setSignName] = useState("");

  useEffect(() => { void load(); }, [requestId]);
  async function load() {
    setLoading(true);
    const { data } = await db().from("bunker_delivery_notes").select("*").eq("request_id", requestId).maybeSingle();
    setBdn(data ?? null);
    if (data) {
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(data)) flat[k] = v == null ? "" : String(v);
      setF(flat);
    }
    setLoading(false);
  }

  function set(k: string, v: string) { setF((s) => ({ ...s, [k]: v })); }

  async function save() {
    setBusy(true);
    const payload: Record<string, unknown> = { ...f, vessel_id: yachtId };
    const { error } = await db().rpc("upsert_bunker_delivery_note", { p_request_id: requestId, p_bdn_data: payload });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Delivery note saved");
    await load();
  }

  async function sign() {
    if (!bdn?.id) { toast.error("Save the delivery note first"); return; }
    if (!signName.trim()) { toast.error("Enter a name to confirm signing"); return; }
    setBusy(true);
    const { error } = await db().rpc("sign_bunker_delivery_note", { p_bdn_id: bdn.id, p_signed_by_name: signName.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bunker Delivery Note signed and locked");
    await load();
  }

  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>;
  const signed = bdn?.status === "signed";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5"><ArrowLeft className="h-3.5 w-3.5" /> Request</Button>
        {bdn?.bdn_number && <span className="text-sm font-medium text-muted-foreground">{bdn.bdn_number}</span>}
        {signed && <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase text-emerald-600">Signed &amp; Locked</span>}
      </div>

      <Section title="Receiving Vessel">
        <Field label="PTW Number"><Input value={f.ptw_number ?? ""} onChange={(e) => set("ptw_number", e.target.value)} disabled={signed} className="h-8" /></Field>
        <Field label="Draft (m)"><Input type="number" step="0.01" value={f.draft_m ?? ""} onChange={(e) => set("draft_m", e.target.value)} disabled={signed} className="h-8" /></Field>
      </Section>

      <Section title="Delivery Port / Berth">
        <Field label="Delivery Port">
          <Select value={f.delivery_port ?? ""} onValueChange={(v) => set("delivery_port", v)} disabled={signed}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{DELIVERY_PORTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Berth No."><Input value={f.berth_no ?? ""} onChange={(e) => set("berth_no", e.target.value)} disabled={signed} className="h-8" /></Field>
      </Section>

      <Section title="Camlock &amp; Hose">
        <Field label="Camlock Type">
          <Select value={f.camlock_type ?? ""} onValueChange={(v) => set("camlock_type", v)} disabled={signed}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{CAMLOCK_TYPES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Camlock Diameter"><Input value={f.camlock_size_diameter ?? ""} onChange={(e) => set("camlock_size_diameter", e.target.value)} disabled={signed} className="h-8" /></Field>
        <Field label="Hose Diameter"><Input value={f.hose_size_diameter ?? ""} onChange={(e) => set("hose_size_diameter", e.target.value)} disabled={signed} className="h-8" /></Field>
        <Field label="Hose Length (m)"><Input type="number" step="0.1" value={f.hose_length_m ?? ""} onChange={(e) => set("hose_length_m", e.target.value)} disabled={signed} className="h-8" /></Field>
      </Section>

      <Section title="Connection &amp; Manifold">
        <Field label="Manifold Location">
          <Select value={f.manifold_location ?? ""} onValueChange={(v) => set("manifold_location", v)} disabled={signed}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{MANIFOLD_LOCATIONS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Manifold Note"><Input value={f.manifold_diagram_note ?? ""} onChange={(e) => set("manifold_diagram_note", e.target.value)} disabled={signed} className="h-8" /></Field>
      </Section>

      <Section title="Bunker Fuel Requirement">
        <Field label="Fuel Grade">
          <Select value={f.fuel_grade ?? ""} onValueChange={(v) => set("fuel_grade", v)} disabled={signed}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{FUEL_GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Fuel Description"><Input value={f.fuel_description ?? ""} onChange={(e) => set("fuel_description", e.target.value)} disabled={signed} className="h-8" /></Field>
        <Field label="Max Sulfur Content"><Input value={f.max_sulfur_content ?? ""} onChange={(e) => set("max_sulfur_content", e.target.value)} disabled={signed} className="h-8" /></Field>
        <Field label="Specs"><Input value={f.specs ?? ""} onChange={(e) => set("specs", e.target.value)} disabled={signed} className="h-8" /></Field>
        <Field label="Min Qty"><Input type="number" value={f.min_qty ?? ""} onChange={(e) => set("min_qty", e.target.value)} disabled={signed} className="h-8" /></Field>
        <Field label="Max Qty"><Input type="number" value={f.max_qty ?? ""} onChange={(e) => set("max_qty", e.target.value)} disabled={signed} className="h-8" /></Field>
      </Section>

      <Section title="Transfer / Delivery Method">
        <Field label="Transfer Rate (per hr)"><Input type="number" value={f.transfer_rate_per_hour ?? ""} onChange={(e) => set("transfer_rate_per_hour", e.target.value)} disabled={signed} className="h-8" /></Field>
        <Field label="Delivery Method">
          <Select value={f.delivery_method ?? ""} onValueChange={(v) => set("delivery_method", v)} disabled={signed}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{DELIVERY_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Berth Alongside Side">
          <Select value={f.berth_alongside_side ?? ""} onValueChange={(v) => set("berth_alongside_side", v)} disabled={signed}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{BERTH_SIDES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title="Supplier &amp; Tanker">
        <Field label="Supplier">
          <Select value={f.supplier_org_id ?? "__none"} onValueChange={(v) => set("supplier_org_id", v === "__none" ? "" : v)} disabled={signed}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— None —</SelectItem>
              {suppliers.map((s) => <SelectItem key={s.org_id} value={s.org_id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Driver Name"><Input value={f.driver_name ?? ""} onChange={(e) => set("driver_name", e.target.value)} disabled={signed} className="h-8" /></Field>
        <Field label="Tanker No."><Input value={f.tanker_no ?? ""} onChange={(e) => set("tanker_no", e.target.value)} disabled={signed} className="h-8" /></Field>
        <Field label="Tanker Capacity"><Input type="number" value={f.tanker_capacity ?? ""} onChange={(e) => set("tanker_capacity", e.target.value)} disabled={signed} className="h-8" /></Field>
      </Section>

      <Section title="Delivery Log">
        <Field label="Alongside At"><Input type="datetime-local" value={f.alongside_at ? f.alongside_at.slice(0, 16) : ""} onChange={(e) => set("alongside_at", e.target.value)} disabled={signed} className="h-8" /></Field>
        <Field label="Commenced At"><Input type="datetime-local" value={f.commenced_at ? f.commenced_at.slice(0, 16) : ""} onChange={(e) => set("commenced_at", e.target.value)} disabled={signed} className="h-8" /></Field>
        <Field label="Completed At"><Input type="datetime-local" value={f.completed_at ? f.completed_at.slice(0, 16) : ""} onChange={(e) => set("completed_at", e.target.value)} disabled={signed} className="h-8" /></Field>
      </Section>

      <Section title="Fuel Quality Results">
        <Field label="Product Grade"><Input value={f.product_grade ?? ""} onChange={(e) => set("product_grade", e.target.value)} disabled={signed} className="h-8" /></Field>
        <Field label="Viscosity (cSt)"><Input type="number" step="0.01" value={f.viscosity_cst ?? ""} onChange={(e) => set("viscosity_cst", e.target.value)} disabled={signed} className="h-8" /></Field>
        <Field label="Sulfur Content (%)"><Input type="number" step="0.001" value={f.sulfur_content_pct ?? ""} onChange={(e) => set("sulfur_content_pct", e.target.value)} disabled={signed} className="h-8" /></Field>
        <Field label="Flash Point (°C)"><Input type="number" step="0.1" value={f.flash_point_c ?? ""} onChange={(e) => set("flash_point_c", e.target.value)} disabled={signed} className="h-8" /></Field>
        <Field label="Density (kg/m³)"><Input type="number" step="0.01" value={f.density_kg_m3 ?? ""} onChange={(e) => set("density_kg_m3", e.target.value)} disabled={signed} className="h-8" /></Field>
        <Field label="Delivered (MT)"><Input type="number" step="0.01" value={f.delivered_mt ?? ""} onChange={(e) => set("delivered_mt", e.target.value)} disabled={signed} className="h-8" /></Field>
      </Section>

      <Section title="MARPOL Annex VI Declaration">
        <Field label="Limit Basis">
          <Select value={f.marpol_limit_basis ?? ""} onValueChange={(v) => set("marpol_limit_basis", v)} disabled={signed}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{MARPOL_BASES.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Purchaser Specified Limit (%)"><Input type="number" step="0.001" value={f.purchaser_specified_limit_pct ?? ""} onChange={(e) => set("purchaser_specified_limit_pct", e.target.value)} disabled={signed} className="h-8" /></Field>
      </Section>

      {!signed && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save Draft</Button>
          </div>
          <div className="flex items-center gap-2">
            <Input value={signName} onChange={(e) => setSignName(e.target.value)} placeholder="Type name to sign" className="h-8 w-48" />
            <Button variant="outline" onClick={sign} disabled={busy || !bdn?.id}>Sign &amp; Lock</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default BunkerDeliveryNoteForm;
