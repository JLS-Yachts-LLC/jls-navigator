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
type SubType = "Exit" | "Entry";

const PORT_OPTIONS = [
  "Dubai Marina",
  "Port Rashid",
  "Hamdan Port",
  "Port Zayed",
  "Mina Seyahi",
  "Khalid Port",
  "Fujairah Port",
  "Khor Fakkan",
  "Abu Dhabi",
  "Muscat",
  "Doha",
  "Bahrain",
  "Kuwait",
  "Jeddah",
];

export function ExitEntryDialog({
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

  // dma_phase stores "Exit" | "Entry"; issuing_authority stores port of call/entry port; notes stores next_other_port
  const [form, setForm] = useState<Partial<Permit>>(() =>
    editing ?? { permit_type: "exit_entry", status: "pending", dma_phase: "Exit" }
  );

  useEffect(() => {
    setForm(editing ?? { permit_type: "exit_entry", status: "pending", dma_phase: "Exit" });
  }, [editing]);

  const subType = (form.dma_phase ?? "Exit") as SubType;

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
        permit_type: "exit_entry" as const,
        yacht_id: form.yacht_id ?? null,
        permit_number: form.permit_number || null,
        status: (form.status ?? "pending") as PermitStatus,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        issuing_authority: form.issuing_authority || null,
        holder_name: form.holder_name || null,
        contact_email: form.contact_email || null,
        jls_quotation_number: form.jls_quotation_number || null,
        dma_phase: subType,
        document_url: form.document_url || null,
        notes: form.notes || null,
      };

      if (editing) {
        const { error } = await supabase.from("permits").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Permit updated");
      } else {
        const { data, error } = await supabase
          .from("permits")
          .insert([{ ...payload, created_by: userId } as never])
          .select("id")
          .single();
        if (error) throw error;
        toast.success("Permit created");
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
          {editing ? "Edit" : "New"} {subType} Permit
        </DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Boat Name */}
        <div className="space-y-1.5">
          <Label>Boat Name</Label>
          <Select
            value={form.yacht_id ?? "__none"}
            onValueChange={(v) => set("yacht_id", v === "__none" ? null : v)}
          >
            <SelectTrigger><SelectValue placeholder="Select yacht" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— None —</SelectItem>
              {yachts.map((y) => (
                <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Permit Type (Exit / Entry) */}
        <div className="space-y-1.5">
          <Label>Permit Type</Label>
          <Select value={subType} onValueChange={(v) => set("dma_phase", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Exit">Exit</SelectItem>
              <SelectItem value="Entry">Entry</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Exit-specific: Exit Permit Date */}
        {subType === "Exit" && (
          <div className="space-y-1.5">
            <Label>Exit Permit Date</Label>
            <Input
              type="date"
              value={form.issue_date ?? ""}
              onChange={(e) => set("issue_date", e.target.value)}
            />
          </div>
        )}

        {/* Entry-specific: Entry Permit Date + Expiration */}
        {subType === "Entry" && (
          <>
            <div className="space-y-1.5">
              <Label>Entry Permit Date</Label>
              <Input
                type="date"
                value={form.issue_date ?? ""}
                onChange={(e) => set("issue_date", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Entry Permit Expiration</Label>
              <Input
                type="date"
                value={form.expiry_date ?? ""}
                onChange={(e) => set("expiry_date", e.target.value)}
              />
            </div>
          </>
        )}

        {/* Exit-specific: Next Port of Call */}
        {subType === "Exit" && (
          <div className="space-y-1.5">
            <Label>Next Port of Call</Label>
            <Select
              value={form.issuing_authority ?? "__none"}
              onValueChange={(v) => set("issuing_authority", v === "__none" ? null : v)}
            >
              <SelectTrigger><SelectValue placeholder="Select port" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Select —</SelectItem>
                {PORT_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Exit-specific: Next Other Port (free text) */}
        {subType === "Exit" && (
          <div className="space-y-1.5">
            <Label>Next Other Port</Label>
            <Input
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="If not in list above"
            />
          </div>
        )}

        {/* Entry-specific: Entry Port */}
        {subType === "Entry" && (
          <div className="space-y-1.5">
            <Label>Entry Port</Label>
            <Select
              value={form.issuing_authority ?? "__none"}
              onValueChange={(v) => set("issuing_authority", v === "__none" ? null : v)}
            >
              <SelectTrigger><SelectValue placeholder="Select port" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Select —</SelectItem>
                {PORT_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Quotation Number */}
        <div className="space-y-1.5">
          <Label>Quotation Number</Label>
          <Input
            value={form.jls_quotation_number ?? ""}
            onChange={(e) => set("jls_quotation_number", e.target.value)}
          />
        </div>

        {/* Client Purser Name */}
        <div className="space-y-1.5">
          <Label>Client Purser Name</Label>
          <Input
            value={form.holder_name ?? ""}
            onChange={(e) => set("holder_name", e.target.value)}
          />
        </div>

        {/* Email Address */}
        <div className="space-y-1.5">
          <Label>Email Address</Label>
          <Input
            type="email"
            value={form.contact_email ?? ""}
            onChange={(e) => set("contact_email", e.target.value)}
          />
        </div>

        {/* Status */}
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={form.status ?? "pending"}
            onValueChange={(v) => set("status", v as PermitStatus)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERMIT_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Attachments */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Attachments for Client</Label>
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
            Email notifications are not yet configured. The permit will be saved but{" "}
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
          {editing ? "Save Changes" : "Create Permit"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
