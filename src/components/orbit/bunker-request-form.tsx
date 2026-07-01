/**
 * BunkerRequestForm — structured RFQ Builder Section 1 intake for the
 * FUEL_BUNKERING category (FRS RFQ Builder). Replaces the generic "New
 * Service Request" dialog only when the Fuel quick-action tile is used —
 * every other category keeps using the existing generic dialog in
 * orbit-requests-page.tsx unchanged.
 *
 * Submits via create_bunker_request (migration 084), which also seeds the
 * Bunkering-specific required documents/approvals (RFQ Builder Sections
 * 3 & 4) in the same transaction. Section 2 (Execution Information —
 * supplier, hose connection, bunkering side, site contact) is completed by
 * Operations after assignment, not at intake — see BunkerExecutionDetails
 * in orbit-request-detail-extensions.tsx.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { URGENCY_META } from "./orbit-constants";

const FUEL_GRADES = ["HFO", "MDO", "MGO", "LSMGO", "ULSMGO"];

const EMPTY = {
  title: "", yacht_id: "__none", urgency: "medium", marina: "",
  location: "", delivery_date: "", billing_entity: "",
  fuel_grade: "MGO", min_quantity: "", max_quantity: "", description: "",
};

export function BunkerRequestForm({
  open,
  onOpenChange,
  yachts,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  yachts: { id: string; vessel_name: string }[];
  onCreated: (requestId: string) => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    if (!form.location.trim()) { toast.error("Location is required"); return; }
    if (!user) { toast.error("You must be signed in"); return; }
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("create_bunker_request", {
        p_yacht_id: form.yacht_id === "__none" ? null : form.yacht_id,
        p_title: form.title.trim() || `Bunkering — ${form.fuel_grade}`,
        p_description: form.description || null,
        p_urgency: form.urgency,
        p_marina: form.marina || null,
        p_location: form.location.trim(),
        p_delivery_date: form.delivery_date || null,
        p_billing_entity: form.billing_entity || null,
        p_fuel_grade: form.fuel_grade,
        p_min_quantity: form.min_quantity ? Number(form.min_quantity) : null,
        p_max_quantity: form.max_quantity ? Number(form.max_quantity) : null,
      });
      if (error) throw error;
      toast.success("Bunkering request submitted");
      onOpenChange(false);
      setForm({ ...EMPTY });
      onCreated(data as string);
    } catch (e: any) {
      toast.error(e.message ?? "Could not submit request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Bunkering Request</DialogTitle></DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. MGO bunkering — Yas Marina" className="h-8" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Vessel</Label>
              <Select value={form.yacht_id} onValueChange={(v) => set("yacht_id", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {yachts.map((y) => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Urgency</Label>
              <Select value={form.urgency} onValueChange={(v) => set("urgency", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(URGENCY_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            1. Information Required for Quotation
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Location <span className="text-destructive">*</span></Label>
              <Input value={form.location} onChange={(e) => set("location", e.target.value)} className="h-8" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Delivery date</Label>
              <Input type="date" value={form.delivery_date} onChange={(e) => set("delivery_date", e.target.value)} className="h-8" /></div>
          </div>

          <div className="space-y-1.5"><Label className="text-xs">Billing entity</Label>
            <Input value={form.billing_entity} onChange={(e) => set("billing_entity", e.target.value)} className="h-8" /></div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Fuel grade</Label>
              <Select value={form.fuel_grade} onValueChange={(v) => set("fuel_grade", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{FUEL_GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Min qty (MT)</Label>
              <Input type="number" value={form.min_quantity} onChange={(e) => set("min_quantity", e.target.value)} className="h-8" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Max qty (MT)</Label>
              <Input type="number" value={form.max_quantity} onChange={(e) => set("max_quantity", e.target.value)} className="h-8" /></div>
          </div>

          <div className="space-y-1.5"><Label className="text-xs">Marina / location note</Label>
            <Input value={form.marina} onChange={(e) => set("marina", e.target.value)} className="h-8" /></div>

          <div className="space-y-1.5"><Label className="text-xs">Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} className="resize-none text-sm" /></div>

          <p className="text-xs text-muted-foreground">
            Supporting documents (Master's Declaration, Fuel Analysis Request, Safety Checklist,
            Delivery Receipt) and approvals (Captain, Chief Engineer) are seeded automatically on submit.
            Section 2 (Execution Information) is completed by Operations after assignment.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit RFQ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default BunkerRequestForm;
