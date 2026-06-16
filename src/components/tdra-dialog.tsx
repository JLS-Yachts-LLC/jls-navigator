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
  "TDRA",
  "Dubai Municipality",
  "Dubai Maritime City Authority",
  "Port Rashid",
  "Hamdan Port",
  "Other",
];

// ── Reusable picture-upload box ──────────────────────────────────────────────
interface UploadBoxProps {
  label: string;
  fileName: string | null;
  uploading: boolean;
  fileUrl?: string | null;
  isBusy: boolean;
  onClear: () => void;
  onPick: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  onFileChange: (f: File) => void;
  accept?: string;
}

function TdraUploadBox({
  label,
  fileName,
  uploading,
  fileUrl,
  isBusy,
  onClear,
  onPick,
  inputRef,
  onFileChange,
  accept = ".pdf,.jpg,.jpeg,.png",
}: UploadBoxProps) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div
        onClick={() => !isBusy && onPick()}
        className={`h-28 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1.5 text-center p-3 transition cursor-pointer ${
          fileName
            ? "border-primary/50 bg-primary/5"
            : "border-border bg-muted/20 hover:border-primary/40"
        }`}
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : fileName ? (
          <>
            <FileCheck2 className="h-5 w-5 text-primary" />
            <span className="text-[10px] text-primary font-medium break-all leading-tight line-clamp-2">
              {fileName}
            </span>
            {fileUrl && (
              <span onClick={(e) => e.stopPropagation()}>
              <SignedAnchor
                stored={fileUrl}
                className="text-[10px] text-muted-foreground underline hover:text-foreground"
              >
                View
              </SignedAnchor>
              </span>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="text-[10px] text-destructive/70 hover:text-destructive"
            >
              Remove
            </button>
          </>
        ) : (
          <>
            <Paperclip className="h-5 w-5 text-muted-foreground/50" />
            <span className="text-[10px] text-muted-foreground">
              Tap or click to add a file
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFileChange(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────
export function TdraDialog({ yachts, editing, userId, onSaved }: Props) {
  const [form, setForm] = useState<Partial<Permit>>(() =>
    editing ?? { permit_type: "tdra", status: "pending" }
  );
  const [busy, setBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  // Invoice from Authority — stored in `notes` with prefix "invoice_url:"
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [invoiceFileName, setInvoiceFileName] = useState<string | null>(null);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const invoiceRef = useRef<HTMLInputElement>(null);

  // TDRA Certificate — stored in `document_url`
  const [certFileName, setCertFileName] = useState<string | null>(null);
  const [uploadingCert, setUploadingCert] = useState(false);
  const certRef = useRef<HTMLInputElement>(null);

  // Attachments for Client — also stored in `document_url` (last uploaded wins)
  const [attachFileName, setAttachFileName] = useState<string | null>(null);
  const [uploadingAttach, setUploadingAttach] = useState(false);
  const attachRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(editing ?? { permit_type: "tdra", status: "pending" });
    // Restore cert filename from document_url
    if (editing?.document_url) {
      const parts = editing.document_url.split("/");
      setCertFileName(decodeURIComponent(parts[parts.length - 1].split("?")[0]));
    } else {
      setCertFileName(null);
    }
    // Restore invoice URL from notes
    if (editing?.notes?.startsWith("invoice_url:")) {
      const url = editing.notes.replace("invoice_url:", "");
      setInvoiceUrl(url);
      const parts = url.split("/");
      setInvoiceFileName(decodeURIComponent(parts[parts.length - 1].split("?")[0]));
    } else {
      setInvoiceUrl(null);
      setInvoiceFileName(null);
    }
    setAttachFileName(null);
  }, [editing]);

  function set<K extends keyof Permit>(k: K, v: Permit[K] | string | null) {
    setForm((f) => ({ ...f, [k]: v as Permit[K] }));
  }

  async function uploadFile(file: File, folder: string): Promise<string> {
    const path = `tdra/${folder}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
    const { error } = await supabase.storage
      .from("permit-documents")
      .upload(path, file, { upsert: true });
    if (error) throw error;
    return supabase.storage.from("permit-documents").getPublicUrl(path).data.publicUrl;
  }

  async function handleInvoiceUpload(file: File) {
    setUploadingInvoice(true);
    try {
      const url = await uploadFile(file, "invoice");
      setInvoiceUrl(url);
      setInvoiceFileName(file.name);
      set("notes", `invoice_url:${url}`);
      toast.success("Invoice uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingInvoice(false);
    }
  }

  async function handleCertUpload(file: File) {
    setUploadingCert(true);
    try {
      const url = await uploadFile(file, "certificate");
      set("document_url", url);
      setCertFileName(file.name);
      toast.success("Certificate uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingCert(false);
    }
  }

  async function handleAttachUpload(file: File) {
    setUploadingAttach(true);
    try {
      const url = await uploadFile(file, "attachments");
      set("document_url", url);
      setAttachFileName(file.name);
      toast.success("Attachment uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingAttach(false);
    }
  }

  function buildPayload() {
    return {
      permit_type: "tdra" as const,
      yacht_id: form.yacht_id ?? null,
      permit_number: form.permit_number || null,       // Applied By
      status: (form.status ?? "pending") as PermitStatus,
      issue_date: form.issue_date || null,             // TDRA Date Applied
      expiry_date: form.expiry_date || null,           // Expiry Date
      issuing_authority: form.issuing_authority || null,
      holder_name: form.holder_name || null,           // Name
      contact_email: form.contact_email || null,
      dma_phase: null,
      preferred_inspection_date: null,
      jls_quotation_number: form.jls_quotation_number || null,
      document_url: form.document_url || null,         // TDRA Certificate / Attachments
      notes: invoiceUrl ? `invoice_url:${invoiceUrl}` : null, // Invoice URL
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
        .eq("permit_type", "tdra")
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

      const subject = tmpl ? replace(tmpl.subject) : `TDRA Permit — ${yachtName}`;
      const body = tmpl
        ? replace(tmpl.body)
        : `Dear ${form.holder_name ?? "Client"},\n\nPlease find your TDRA Permit details below.\n\nVessel: ${yachtName}\nDate Applied: ${form.issue_date ?? "—"}\nExpiry: ${form.expiry_date ?? "—"}\nAuthority: ${form.issuing_authority ?? "—"}\nApplied By: ${form.permit_number ?? "—"}\n${form.jls_quotation_number ? `JLS Quotation No: ${form.jls_quotation_number}\n` : ""}${form.document_url ? `\nCertificate: ${form.document_url}` : ""}\n\nKind regards,\nJLS Yachts`;

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

  const isBusy = busy || emailBusy || uploadingInvoice || uploadingCert || uploadingAttach;

  return (
    <DialogContent className="max-w-4xl">
      <DialogHeader>
        <DialogTitle>
          {editing ? "Edit" : "New"} TDRA Permit
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSaveOnly}>
        <div className="grid grid-cols-3 gap-x-4 gap-y-4">
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
            <Label>TDRA Date Applied</Label>
            <Input
              type="date"
              value={form.issue_date ?? ""}
              onChange={(e) => set("issue_date", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={form.holder_name ?? ""}
              onChange={(e) => set("holder_name", e.target.value)}
            />
          </div>

          {/* Row 2 */}
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
          <div className="space-y-1.5">
            <Label>Expiry Date</Label>
            <Input
              type="date"
              value={form.expiry_date ?? ""}
              onChange={(e) => set("expiry_date", e.target.value)}
            />
          </div>

          {/* Row 3 — document uploads */}
          <TdraUploadBox
            label="Invoice from Authority"
            fileName={invoiceFileName}
            uploading={uploadingInvoice}
            fileUrl={invoiceUrl}
            isBusy={isBusy}
            onClear={() => { setInvoiceUrl(null); setInvoiceFileName(null); set("notes", null); }}
            onPick={() => invoiceRef.current?.click()}
            inputRef={invoiceRef}
            onFileChange={handleInvoiceUpload}
          />
          <TdraUploadBox
            label="TDRA Certificate"
            fileName={certFileName}
            uploading={uploadingCert}
            fileUrl={form.document_url ?? null}
            isBusy={isBusy}
            onClear={() => { set("document_url", null); setCertFileName(null); }}
            onPick={() => certRef.current?.click()}
            inputRef={certRef}
            onFileChange={handleCertUpload}
          />
          <div className="space-y-1.5">
            <Label>JLS Quotation No.</Label>
            <Input
              value={(form.jls_quotation_number as string) ?? ""}
              onChange={(e) => set("jls_quotation_number" as keyof Permit, e.target.value)}
            />
          </div>

          {/* Row 4 */}
          <div className="space-y-1.5">
            <Label>Applied By</Label>
            <Input
              value={form.permit_number ?? ""}
              onChange={(e) => set("permit_number", e.target.value)}
              placeholder="e.g. External Admin"
            />
          </div>

          {/* Attachments for Client — spans 2 cols */}
          <div className="col-span-2 space-y-1.5">
            <Label>Attachments for Client</Label>
            <div
              onClick={() => !isBusy && attachRef.current?.click()}
              className={`h-28 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center p-4 transition cursor-pointer ${
                attachFileName
                  ? "border-primary/50 bg-primary/5"
                  : "border-border bg-muted/20 hover:border-primary/40"
              }`}
            >
              {uploadingAttach ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : attachFileName ? (
                <>
                  <FileCheck2 className="h-5 w-5 text-primary" />
                  <span className="text-xs text-primary font-medium">{attachFileName}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setAttachFileName(null); }}
                    className="text-xs text-destructive/70 hover:text-destructive"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <Paperclip className="h-5 w-5 text-muted-foreground/60" />
                  <span className="text-xs text-muted-foreground">There is nothing attached.</span>
                  <span className="text-xs text-primary font-medium">Attach file</span>
                </>
              )}
              <input
                ref={attachRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleAttachUpload(f);
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
