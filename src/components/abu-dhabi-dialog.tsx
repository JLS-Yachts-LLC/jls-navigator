import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ABU_DHABI_PERMIT_TYPES, PERMIT_STATUSES,
  type AbuDhabiPermitType, type Permit, type PermitStatus,
} from "@/lib/permit-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

type Yacht = { id: string; vessel_name: string };

export function AbuDhabiDialog({
  yachts,
  editing,
  userId,
  onSaved,
}: {
  yachts: Yacht[];
  editing: Permit | null;
  userId: string | undefined;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Partial<Permit>>(() =>
    editing ?? { permit_type: "abu_dhabi", status: "active" }
  );

  useEffect(() => {
    setForm(editing ?? { permit_type: "abu_dhabi", status: "active" });
  }, [editing]);

  function set<K extends keyof Permit>(k: K, v: Permit[K] | string | null) {
    setForm(f => ({ ...f, [k]: v as Permit[K] }));
  }

  async function doSave() {
    if (!userId) return;
    setBusy(true);
    try {
      const payload = {
        permit_type: "abu_dhabi" as const,
        yacht_id: form.yacht_id ?? null,
        permit_number: form.permit_number || null,
        status: (form.status ?? "active") as PermitStatus,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        issuing_authority: form.issuing_authority || null,
        holder_name: form.holder_name || null,
        contact_email: form.contact_email || null,
        jls_quotation_number: form.jls_quotation_number || null,
        requested_by: form.requested_by || null,
        notes: form.notes || null,
        // dma_phase stores the Abu Dhabi permit sub-type
        dma_phase: form.dma_phase || null,
        created_by: userId,
      };
      // Cast to any — Supabase generated types may not include abu_dhabi yet
      const client = supabase as any;
      const { error } = editing
        ? await client.from("permits").update(payload).eq("id", editing.id)
        : await client.from("permits").insert(payload);
      if (error) throw error;
      toast.success(editing ? "Permit updated" : "Permit created");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit Abu Dhabi Permit" : "New Abu Dhabi Permit"}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-3 py-2">
        {/* Yacht */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Yacht</Label>
            <Select value={form.yacht_id ?? "__none"} onValueChange={v => set("yacht_id", v === "__none" ? null : v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— Select yacht —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— None —</SelectItem>
                {yachts.map(y => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Permit Type (Abu Dhabi sub-type) */}
          <div className="space-y-1">
            <Label className="text-xs">Permit Type <span className="text-destructive">*</span></Label>
            <Select value={form.dma_phase ?? ""} onValueChange={v => set("dma_phase", v || null)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— Select type —" /></SelectTrigger>
              <SelectContent>
                {ABU_DHABI_PERMIT_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Permit Number + Authority */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Permit / Reference No.</Label>
            <Input value={form.permit_number ?? ""} onChange={e => set("permit_number", e.target.value)} className="h-8 text-sm" placeholder="e.g. ADMAR/P/0044/2024" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Issuing Authority</Label>
            <Select value={form.issuing_authority ?? "__none"} onValueChange={v => set("issuing_authority", v === "__none" ? null : v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— Select —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— None —</SelectItem>
                <SelectItem value="AD Maritime">AD Maritime</SelectItem>
                <SelectItem value="AD Ports">AD Ports</SelectItem>
                <SelectItem value="ADNOC">ADNOC</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Issue Date</Label>
            <Input type="date" value={form.issue_date ?? ""} onChange={e => set("issue_date", e.target.value || null)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Expiry Date</Label>
            <Input type="date" value={form.expiry_date ?? ""} onChange={e => set("expiry_date", e.target.value || null)} className="h-8 text-sm" />
          </div>
        </div>

        {/* Holder + Email */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Holder Name</Label>
            <Input value={form.holder_name ?? ""} onChange={e => set("holder_name", e.target.value)} className="h-8 text-sm" placeholder="Captain / Purser" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Contact Email</Label>
            <Input type="email" value={form.contact_email ?? ""} onChange={e => set("contact_email", e.target.value)} className="h-8 text-sm" placeholder="captain@vessel.com" />
          </div>
        </div>

        {/* Quotation + Requested By */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">JLS Quotation No.</Label>
            <Input value={form.jls_quotation_number ?? ""} onChange={e => set("jls_quotation_number", e.target.value)} className="h-8 text-sm" placeholder="e.g. Q 25-5767" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Requested By</Label>
            <Input value={form.requested_by ?? ""} onChange={e => set("requested_by", e.target.value)} className="h-8 text-sm" placeholder="Staff name" />
          </div>
        </div>

        {/* Status */}
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={form.status ?? "active"} onValueChange={v => set("status", v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERMIT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <Label className="text-xs">Notes / Location</Label>
          <Textarea value={form.notes ?? ""} onChange={e => set("notes", e.target.value)} className="text-sm min-h-[60px] resize-none" placeholder="Location, work description, anchorage details…" />
        </div>
      </div>

      <DialogFooter>
        <Button onClick={doSave} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {editing ? "Save Changes" : "Create Permit"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
