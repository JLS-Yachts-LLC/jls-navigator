import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PERMIT_STATUSES, type Permit, type PermitStatus } from "@/lib/permit-types";
import { Button } from "@/components/ui/button";
import { SignedAnchor } from "@/components/ui/signed-file";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Mail, Paperclip, Save, X, Info } from "lucide-react";
import { toast } from "sonner";

type Yacht = { id: string; vessel_name: string };

const ACCESS_ZONES = [
  "Gate A",
  "Gate B",
  "Gate C",
  "Marina Entrance",
  "Dry Dock",
  "Fuel Dock",
  "Administration",
  "All Areas",
];

export function GatePassDialog({
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
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<Partial<Permit>>(() =>
    editing ?? { permit_type: "gate_pass", status: "pending" }
  );

  useEffect(() => {
    setForm(editing ?? { permit_type: "gate_pass", status: "pending" });
  }, [editing]);

  function set<K extends keyof Permit>(k: K, v: Permit[K] | string | null) {
    setForm((f) => ({ ...f, [k]: v as Permit[K] }));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `permits/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("permit-documents").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("permit-documents").getPublicUrl(path);
      set("document_url", publicUrl);
      toast.success("File attached");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function doSave() {
    if (!userId) return;
    setBusy(true);
    try {
      const payload = {
        permit_type: "gate_pass" as const,
        yacht_id: form.yacht_id ?? null,
        permit_number: form.permit_number || null,
        status: (form.status ?? "pending") as PermitStatus,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        issuing_authority: form.issuing_authority || null,
        holder_name: form.holder_name || null,
        contact_email: form.contact_email || null,
        jls_quotation_number: form.jls_quotation_number || null,
        dma_phase: null,
        document_url: form.document_url || null,
        notes: form.notes || null,
      };

      if (editing) {
        const { error } = await supabase.from("permits").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Gate pass updated");
      } else {
        const { error } = await supabase
          .from("permits")
          .insert([{ ...payload, created_by: userId } as never]);
        if (error) throw error;
        toast.success("Gate pass created");
      }

      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const attachmentName = form.document_url
    ? decodeURIComponent(form.document_url.split("/").pop() ?? "attachment")
    : null;

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          {editing ? "Edit" : "New"} Gate Pass
        </DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Visitor Name */}
        <div className="space-y-1.5">
          <Label>Visitor Name</Label>
          <Input
            className="h-8 text-xs"
            value={form.holder_name ?? ""}
            onChange={(e) => set("holder_name", e.target.value)}
            placeholder="Full name"
          />
        </div>

        {/* Visitor Email */}
        <div className="space-y-1.5">
          <Label>Visitor Email</Label>
          <Input
            className="h-8 text-xs"
            type="email"
            value={form.contact_email ?? ""}
            onChange={(e) => set("contact_email", e.target.value)}
            placeholder="visitor@example.com"
          />
        </div>

        {/* Purpose of Visit */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Purpose of Visit</Label>
          <Input
            className="h-8 text-xs"
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Reason for access"
          />
        </div>

        {/* Access Zone / Gate */}
        <div className="space-y-1.5">
          <Label>Access Zone / Gate</Label>
          <Select
            value={form.issuing_authority ?? "__none"}
            onValueChange={(v) => set("issuing_authority", v === "__none" ? null : v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select zone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— Select —</SelectItem>
              {ACCESS_ZONES.map((z) => (
                <SelectItem key={z} value={z}>{z}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Yacht (Associated) */}
        <div className="space-y-1.5">
          <Label>Yacht (Associated)</Label>
          <Select
            value={form.yacht_id ?? "__none"}
            onValueChange={(v) => set("yacht_id", v === "__none" ? null : v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select yacht" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— None —</SelectItem>
              {yachts.map((y) => (
                <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Entry Date */}
        <div className="space-y-1.5">
          <Label>Entry Date</Label>
          <Input
            className="h-8 text-xs"
            type="date"
            value={form.issue_date ?? ""}
            onChange={(e) => set("issue_date", e.target.value)}
          />
        </div>

        {/* Expiry / Exit Date */}
        <div className="space-y-1.5">
          <Label>Expiry / Exit Date</Label>
          <Input
            className="h-8 text-xs"
            type="date"
            value={form.expiry_date ?? ""}
            onChange={(e) => set("expiry_date", e.target.value)}
          />
        </div>

        {/* Quotation/Ref Number */}
        <div className="space-y-1.5">
          <Label>Quotation / Ref Number</Label>
          <Input
            className="h-8 text-xs"
            value={form.jls_quotation_number ?? ""}
            onChange={(e) => set("jls_quotation_number", e.target.value)}
            placeholder="JLS-XXXX"
          />
        </div>

        {/* Status */}
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={form.status ?? "pending"}
            onValueChange={(v) => set("status", v as PermitStatus)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERMIT_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Document / Attachment */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Document / Attachment</Label>
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center space-y-2">
            {attachmentName ? (
              <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <SignedAnchor
                    stored={form.document_url}
                    className="truncate text-primary hover:underline"
                  >
                    {attachmentName}
                  </SignedAnchor>
                </div>
                <button
                  type="button"
                  onClick={() => set("document_url", null)}
                  className="ml-2 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                There is <span className="font-semibold text-warning">nothing</span> attached.
              </p>
            )}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
            >
              {uploading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Paperclip className="h-4 w-4" />}
              {uploading ? "Uploading…" : "Attach file"}
            </button>
          </div>
        </div>
      </div>

      {form.contact_email && (
        <div className="flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-400">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Email notifications are not yet configured. The gate pass will be saved but{" "}
            <strong>{form.contact_email}</strong> will not receive an automated email.
          </span>
        </div>
      )}

      <DialogFooter>
        <Button
          type="button"
          disabled={busy}
          onClick={doSave}
          className="gap-1.5"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {editing ? "Save Changes" : "Create Gate Pass"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
