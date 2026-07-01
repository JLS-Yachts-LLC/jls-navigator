/**
 * MastersDeclarationForm — native structured Master's Declaration (VAT
 * zero-rating document for bunkering), matching the FRS reference PDF
 * field-for-field. Linked directly to orbit_service_requests(id). Signing
 * locks the row via migration 083's trigger; signature/stamp capture is a
 * placeholder file path for now (see BunkerDeliveryNoteForm's note on why
 * Anchor's e-sign doesn't fit an immediate on-the-spot signature).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

const TRANSPORT_CATEGORIES = [
  { value: "a_uae_to_outside", label: "A — UAE to Outside UAE" },
  { value: "b_outside_to_uae", label: "B — Outside UAE to UAE" },
  { value: "c_within_uae_waters", label: "C — Within UAE Waters" },
];

const db = () => supabase as any;

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <div className={`space-y-1.5 ${full ? "col-span-2 sm:col-span-3" : ""}`}><Label className="text-xs">{label}</Label>{children}</div>;
}

export function MastersDeclarationForm({
  requestId,
  yachtId,
  onBack,
}: {
  requestId: string;
  yachtId: string | null;
  onBack: () => void;
}) {
  const [declaration, setDeclaration] = useState<any>(null);
  const [f, setF] = useState<Record<string, string>>({ transport_category: "b_outside_to_uae", quantity_uom: "MT" });
  const [confirmsNoSanctioned, setConfirmsNoSanctioned] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [signatureName, setSignatureName] = useState("");

  useEffect(() => { void load(); }, [requestId]);
  async function load() {
    setLoading(true);
    const { data } = await db().from("masters_declarations").select("*").eq("request_id", requestId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setDeclaration(data ?? null);
    if (data) {
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(data)) flat[k] = v == null ? "" : String(v);
      setF(flat);
      setConfirmsNoSanctioned(!!data.confirms_no_sanctioned_port_voyage);
    }
    setLoading(false);
  }

  function set(k: string, v: string) { setF((s) => ({ ...s, [k]: v })); }

  async function save() {
    if (!f.owner_name || !f.master_name || !f.bunker_supply_date || !f.bunker_supply_port || !f.final_quantity_received) {
      toast.error("Owner name, master name, supply date/port, and quantity are required");
      return;
    }
    setBusy(true);
    const payload = { ...f, vessel_id: yachtId, confirms_no_sanctioned_port_voyage: confirmsNoSanctioned };
    const { error } = await db().rpc("create_masters_declaration", { p_request_id: requestId, p_declaration_data: payload });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Master's Declaration saved");
    await load();
  }

  async function sign() {
    if (!declaration?.id) { toast.error("Save the declaration first"); return; }
    if (!signatureName.trim()) { toast.error("Enter a name to confirm signing"); return; }
    setBusy(true);
    const { error } = await db().rpc("sign_masters_declaration", {
      p_declaration_id: declaration.id,
      p_signature_file_path: `placeholder/${declaration.id}/signature.txt`,
      p_ship_stamp_file_path: `placeholder/${declaration.id}/stamp.txt`,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Master's Declaration signed and locked");
    await load();
  }

  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>;
  const signed = declaration?.status === "signed";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5"><ArrowLeft className="h-3.5 w-3.5" /> Request</Button>
        {signed && <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase text-emerald-600">Signed &amp; Locked</span>}
      </div>

      {signed && declaration && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-muted-foreground">
          A signed Master's Declaration already exists for this request (declared {declaration.declared_at}).
          Corrections require a new declaration, not an edit — this one stays locked.
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Owner Name"><Input value={f.owner_name ?? ""} onChange={(e) => set("owner_name", e.target.value)} disabled={signed} className="h-8" /></Field>
          <Field label="Ship Arrival Date"><Input type="date" value={f.ship_arrival_date ?? ""} onChange={(e) => set("ship_arrival_date", e.target.value)} disabled={signed} className="h-8" /></Field>
          <Field label="Bunker Supply Date *"><Input type="date" value={f.bunker_supply_date ?? ""} onChange={(e) => set("bunker_supply_date", e.target.value)} disabled={signed} className="h-8" /></Field>

          <Field label="Bunker Supply Port *"><Input value={f.bunker_supply_port ?? ""} onChange={(e) => set("bunker_supply_port", e.target.value)} disabled={signed} className="h-8" /></Field>
          <Field label="Last Port of Call"><Input value={f.last_port_of_call ?? ""} onChange={(e) => set("last_port_of_call", e.target.value)} disabled={signed} className="h-8" /></Field>
          <Field label="Load Port (or 'NA')"><Input value={f.load_port ?? ""} onChange={(e) => set("load_port", e.target.value)} disabled={signed} className="h-8" /></Field>

          <Field label="Next Port of Call"><Input value={f.next_port_of_call ?? ""} onChange={(e) => set("next_port_of_call", e.target.value)} disabled={signed} className="h-8" /></Field>
          <Field label="Final Quantity Received *"><Input type="number" step="0.01" value={f.final_quantity_received ?? ""} onChange={(e) => set("final_quantity_received", e.target.value)} disabled={signed} className="h-8" /></Field>
          <Field label="UOM"><Input value={f.quantity_uom ?? "MT"} onChange={(e) => set("quantity_uom", e.target.value)} disabled={signed} className="h-8" /></Field>

          <Field label="Transport Category" full>
            <Select value={f.transport_category ?? ""} onValueChange={(v) => set("transport_category", v)} disabled={signed}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>{TRANSPORT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>

          <Field label="Master Name *"><Input value={f.master_name ?? ""} onChange={(e) => set("master_name", e.target.value)} disabled={signed} className="h-8" /></Field>

          <div className="col-span-2 flex items-center gap-2 sm:col-span-3">
            <input type="checkbox" checked={confirmsNoSanctioned} disabled={signed} onChange={(e) => setConfirmsNoSanctioned(e.target.checked)} className="h-4 w-4" />
            <Label className="text-xs">I confirm this voyage does not call at any sanctioned port</Label>
          </div>
        </div>
      </div>

      {!signed && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save Declaration</Button>
          <div className="flex items-center gap-2">
            <Input value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder="Type name to sign" className="h-8 w-48" />
            <Button variant="outline" onClick={sign} disabled={busy || !declaration?.id}>Sign &amp; Lock</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MastersDeclarationForm;
