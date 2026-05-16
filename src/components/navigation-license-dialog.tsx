import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { type Permit, type PermitStatus } from "@/lib/permit-types";
import {
  DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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

// Field mapping for Navigation License:
//   yacht_id                  → Boat Name
//   issue_date                → Navigation License Date Applied
//   expiry_date               → Expiry Date
//   holder_name               → Client Name/Purser
//   contact_email             → Email
//   issuing_authority         → Authority
//   permit_number             → Applied By
//   jls_quotation_number      → Quotation Number
//   requested_by              → Requested By  (dedicated column)
//   license_no                → License No.   (dedicated column)
//   preferred_inspection_date → Issue Date    (actual issue date from authority)
//   notes                     → Remarks
//   document_url              → Attachments for Client

export function NavigationLicenseDialog({ yachts, editing, userId, onSaved }: Props) {
  const [form, setForm] = useState<Partial<Permit>>(() =>
    editing ?? { permit_type: "navigation_license", status: "pending" }
  );
  const [busy, setBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(editing ?? { permit_type: "navigation_license", status: "pending" });
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
      const path = `navigation-license/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
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
      permit_type: "navigation_license" as const,
      yacht_id: form.yacht_id ?? null,
      permit_number: form.permit_number || null,              // Applied By
      status: (form.status ?? "pending") as PermitStatus,
      issue_date: form.issue_date || null,                    // Navigation License Date Applied
      expiry_date: form.expiry_date || null,                  // Expiry Date
      issuing_authority: form.issuing_authority || null,
      holder_name: form.holder_name || null,                  // Client Name/Purser
      contact_email: form.contact_email || null,
      dma_phase: null,
      preferred_inspection_date: form.preferred_inspection_date || null, // Issue Date
      jls_quotation_number: form.jls_quotation_number || null,           // Quotation Number
      license_no: form.license_no || null,                               // License No.
      requested_by: form.requested_by || null,                           // Requested By
      document_url: form.document_url || null,
      notes: form.notes || null,                              // Remarks
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
        .eq("permit_type", "navigation_license")
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
          .replace(/\{\{quotation_number\}\}/g, form.jls_quotation_number ?? "")
          .replace(/\{\{requested_by\}\}/g, (form.requested_by as string) ?? "")
          .replace(/\{\{license_no\}\}/g, (form.license_no as string) ?? "")
          .replace(/\{\{actual_issue_date\}\}/g, form.preferred_inspection_date ?? "");

      const subject = tmpl ? replace(tmpl.subject) : `Navigation License — ${yachtName}`;
      const body = tmpl
        ? replace(tmpl.body)
        : `Dear ${form.holder_name ?? "Client"},\n\nPlease find your Navigation License details below.\n\nVessel: ${yachtName}\nDate Applied: ${form.issue_date ?? "—"}\nExpiry: ${form.expiry_date ?? "—"}\nAuthority: ${form.issuing_authority ?? "—"}\nApplied By: ${form.permit_number ?? "—"}\n${form.jls_quotation_number ? `JLS Quotation No: ${form.jls_quotation_number}\n` : ""}${form.requested_by ? `Requested By: ${form.requested_by}\n` : ""}${form.license_no ? `License No: ${form.license_no}\n` : ""}${form.preferred_inspection_date ? `Issue Date: ${form.preferred_inspection_date}\n` : ""}${form.notes ? `\nRemarks: ${form.notes}` : ""}${form.document_url ? `\nAttachment: ${form.document_url}` : ""}\n\nKind regards,\nJLS Yachts`;

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
          {editing ? "Edit" : "New"} Navigation License
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
              <Label>Navigation License Date Applied</Label>
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
            <div className="space-y-1.5">
              <Label>Requested By</Label>
              <Input
                value={(form.requested_by as string) ?? ""}
                onChange={(e) => set("requested_by" as keyof Permit, e.target.value)}
              />
            </div>

            {/* Row 4 */}
            <div className="space-y-1.5">
              <Label>License No.</Label>
              <Input
                value={(form.license_no as string) ?? ""}
                onChange={(e) => set("license_no" as keyof Permit, e.target.value)}
                placeholder="e.g. NAV-2024-001"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Issue Date</Label>
              <Input
                type="date"
                value={(form.preferred_inspection_date as string) ?? ""}
                onChange={(e) => set("preferred_inspection_date" as keyof Permit, e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
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
                    <a
                      href={form.document_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                    >
                      View
                    </a>
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
