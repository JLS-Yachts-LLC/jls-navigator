import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { type Permit, type PermitStatus } from "@/lib/permit-types";
import {
  DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SignedAnchor } from "@/components/ui/signed-file";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, FileCheck2, Save, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Yacht = { id: string; vessel_name: string };

interface Props {
  yachts: Yacht[];
  editing: Permit | null;
  userId: string | undefined;
  onSaved: () => void;
}

const AUTHORITIES = [
  "Dubai Municipality",
  "Dubai Maritime City Authority",
  "Port Rashid",
  "Hamdan Port",
  "Other",
];

const EXTENSION_OPTIONS = [
  { value: "Not Applied", label: "Not Applied" },
  { value: "Pending", label: "Pending" },
  { value: "Granted", label: "Granted" },
  { value: "Refused", label: "Refused" },
];

export function CruisingMothershipDialog({ yachts, editing, userId, onSaved }: Props) {
  const [form, setForm] = useState<Partial<Permit>>(() =>
    editing ?? { permit_type: "cruising_mothership", status: "pending" }
  );
  const [busy, setBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(editing ?? { permit_type: "cruising_mothership", status: "pending" });
    if (editing?.document_url) {
      const parts = editing.document_url.split("/");
      setFileName(decodeURIComponent(parts[parts.length - 1].split("?")[0]));
    } else {
      setFileName(null);
    }
  }, [editing]);

  function set<K extends keyof Permit>(k: K, v: Permit[K] | string | null) {
    setForm((f) => ({ ...f, [k]: v as Permit[K] }));
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    try {
      const path = `cruising-mothership/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const { error } = await supabase.storage
        .from("permit-documents")
        .upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("permit-documents").getPublicUrl(path);
      set("document_url", data.publicUrl);
      setFileName(file.name);
      toast.success("Attachment uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function buildPayload() {
    return {
      permit_type: "cruising_mothership" as const,
      yacht_id: form.yacht_id ?? null,
      // permit_number → Applied By
      permit_number: form.permit_number || null,
      status: (form.status ?? "pending") as PermitStatus,
      // issue_date → Cruising Permit Date Applied
      issue_date: form.issue_date || null,
      // expiry_date → Expiry Date
      expiry_date: form.expiry_date || null,
      issuing_authority: form.issuing_authority || null,
      // holder_name → Client Name/Purser
      holder_name: form.holder_name || null,
      contact_email: form.contact_email || null,
      // dma_phase → 21 Day Extension
      dma_phase: form.dma_phase || null,
      // preferred_inspection_date → Issue Date (actual date from authority)
      preferred_inspection_date: form.preferred_inspection_date || null,
      jls_quotation_number: form.jls_quotation_number || null,
      document_url: form.document_url || null,
      notes: form.notes || null,
    };
  }

  async function doSave(): Promise<string> {
    if (!userId) throw new Error("Not authenticated");
    const payload = buildPayload();
    if (editing) {
      const { error } = await supabase
        .from("permits")
        .update(payload as never)
        .eq("id", editing.id);
      if (error) throw error;
      toast.success("Permit updated");
      return editing.id;
    } else {
      const { data, error } = await supabase
        .from("permits")
        .insert([{ ...payload, created_by: userId } as never])
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Permit created");
      return (data as { id: string }).id;
    }
  }

  async function handleSaveOnly(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await doSave();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailSave() {
    if (!form.contact_email) {
      toast.error("Add an email address first");
      return;
    }
    setEmailBusy(true);
    try {
      await doSave();

      const { data: templates } = await supabase
        .from("email_templates" as never)
        .select("subject, body")
        .eq("permit_type", "cruising_mothership")
        .limit(1) as { data: Array<{ subject: string; body: string }> | null };

      const tmpl = templates?.[0];
      const yachtName = yachts.find((y) => y.id === form.yacht_id)?.vessel_name ?? "";

      const replace = (s: string) =>
        s
          .replace(/\{\{boat_name\}\}/g, yachtName)
          .replace(/\{\{holder_name\}\}/g, form.holder_name ?? "")
          .replace(/\{\{expiry_date\}\}/g, form.expiry_date ?? "")
          .replace(/\{\{issue_date\}\}/g, form.issue_date ?? "")
          .replace(/\{\{authority\}\}/g, form.issuing_authority ?? "")
          .replace(/\{\{applied_by\}\}/g, form.permit_number ?? "")
          .replace(/\{\{quotation_number\}\}/g, form.jls_quotation_number ?? "");

      const subject = tmpl ? replace(tmpl.subject) : `Cruising Permit — ${yachtName}`;
      const body = tmpl
        ? replace(tmpl.body)
        : `Dear ${form.holder_name ?? "Client"},\n\nPlease find your Cruising Permit (Mothership) details below.\n\nVessel: ${yachtName}\nDate Applied: ${form.issue_date ?? "—"}\nExpiry: ${form.expiry_date ?? "—"}\nAuthority: ${form.issuing_authority ?? "—"}\nApplied By: ${form.permit_number ?? "—"}\n${form.jls_quotation_number ? `JLS Quotation No: ${form.jls_quotation_number}\n` : ""}${form.document_url ? `\nAttachment: ${form.document_url}` : ""}\n\nKind regards,\nJLS Yachts`;

      window.open(
        `mailto:${form.contact_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
        "_blank"
      );
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setEmailBusy(false);
    }
  }

  const isBusy = busy || emailBusy || uploading;

  return (
    <DialogContent className="max-w-4xl">
      <DialogHeader>
        <DialogTitle>
          {editing ? "Edit" : "New"} Cruising Permit — Mothership
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSaveOnly}>
        <div className="flex gap-5">
          {/* ── Left form grid ── */}
          <div className="flex-1 grid grid-cols-3 gap-x-4 gap-y-4">
            {/* Row 1 */}
            <div className="space-y-1.5">
              <Label>Boat Name</Label>
              <Select
                value={form.yacht_id ?? "__none"}
                onValueChange={(v) => set("yacht_id", v === "__none" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Select vessel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {yachts.map((y) => (
                    <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cruising Permit Date Applied</Label>
              <Input
                type="date"
                value={form.issue_date ?? ""}
                onChange={(e) => set("issue_date", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Expiry Date</Label>
              <Input
                type="date"
                value={form.expiry_date ?? ""}
                onChange={(e) => set("expiry_date", e.target.value)}
              />
            </div>

            {/* Row 2 */}
            <div className="space-y-1.5">
              <Label>Client Name/Purser</Label>
              <Input
                value={form.holder_name ?? ""}
                onChange={(e) => set("holder_name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={(form.contact_email as string) ?? ""}
                onChange={(e) => set("contact_email" as keyof Permit, e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Authority</Label>
              <Select
                value={form.issuing_authority ?? "__none"}
                onValueChange={(v) => set("issuing_authority", v === "__none" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Find items" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {AUTHORITIES.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Row 3 */}
            <div className="space-y-1.5">
              <Label>21 Day Extension</Label>
              <Select
                value={form.dma_phase ?? "__none"}
                onValueChange={(v) => set("dma_phase", v === "__none" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Find items" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {EXTENSION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Applied By</Label>
              <Input
                value={form.permit_number ?? ""}
                onChange={(e) => set("permit_number", e.target.value)}
                placeholder="e.g. External Admin"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Quotation Number</Label>
              <Input
                value={(form.jls_quotation_number as string) ?? ""}
                onChange={(e) => set("jls_quotation_number" as keyof Permit, e.target.value)}
              />
            </div>

            {/* Row 4 */}
            <div className="space-y-1.5">
              <Label>Issue Date</Label>
              <Input
                type="date"
                value={(form.preferred_inspection_date as string) ?? ""}
                onChange={(e) => set("preferred_inspection_date" as keyof Permit, e.target.value)}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Remarks</Label>
              <Textarea
                rows={2}
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
          </div>

          {/* ── Attachments panel ── */}
          <div className="w-52 shrink-0 flex flex-col gap-2">
            <Label>Attachments for Client</Label>
            <div
              onClick={() => !isBusy && fileRef.current?.click()}
              className={`flex-1 min-h-[200px] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center p-4 transition cursor-pointer ${
                fileName
                  ? "border-primary/50 bg-primary/5"
                  : "border-border bg-muted/20 hover:border-primary/40"
              }`}
            >
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : fileName ? (
                <>
                  <FileCheck2 className="h-6 w-6 text-primary" />
                  <span className="text-xs text-primary font-medium break-all leading-tight">
                    {fileName}
                  </span>
                  {form.document_url && (
                    <span onClick={(e) => e.stopPropagation()}>
                    <SignedAnchor
                      stored={form.document_url}
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                    >
                      View
                    </SignedAnchor>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      set("document_url", null);
                      setFileName(null);
                    }}
                    className="text-xs text-destructive/70 hover:text-destructive"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <Paperclip className="h-6 w-6 text-muted-foreground/60" />
                  <span className="text-xs text-muted-foreground">
                    Please attach any relevant documents.
                  </span>
                  <span className="text-xs text-primary font-medium">
                    Attach file
                  </span>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        </div>

        {/* ── Footer actions ── */}
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border">
          <Button type="submit" variant="outline" disabled={isBusy} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save only
          </Button>
          <Button type="button" onClick={handleEmailSave} disabled={isBusy} className="gap-1.5">
            {emailBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Email Pass &amp; Save
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
