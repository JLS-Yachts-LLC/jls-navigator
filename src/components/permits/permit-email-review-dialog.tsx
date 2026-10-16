/**
 * Review-before-send for a permit email.
 *
 * Opens on the permits list's Send button: shows the real message (rendered by
 * the same server code that sends it), who it goes to, and how the permit
 * document will travel. The sender can add files — a quote, a covering letter —
 * and nothing leaves until they press Send.
 */
import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  previewPermitEmail, sendPermitEmail, deliveryNote,
  MAX_PERMIT_ATTACHMENT_BYTES, MAX_PERMIT_ATTACHMENTS,
  type PermitEmailPreview,
} from "@/lib/permits/send-permit-email";
import { Loader2, Mail, Paperclip, X, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const fmtSize = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export function PermitEmailReviewDialog({
  permitId, onClose, onSent,
}: {
  /** The permit to send; null keeps the dialog closed. */
  permitId: string | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [preview, setPreview] = useState<PermitEmailPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreview(null);
    setLoadError(null);
    setFiles([]);
    if (!permitId) return;
    let live = true;
    previewPermitEmail(permitId)
      .then((p) => { if (live) setPreview(p); })
      .catch((e) => { if (live) setLoadError(e instanceof Error ? e.message : "Could not build the email"); });
    return () => { live = false; };
  }, [permitId]);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (f.size > MAX_PERMIT_ATTACHMENT_BYTES) {
        toast.error(`"${f.name}" is ${fmtSize(f.size)} — attachments can be up to 3 MB each`);
        continue;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (next.length >= MAX_PERMIT_ATTACHMENTS) {
        toast.error(`Up to ${MAX_PERMIT_ATTACHMENTS} attachments per email`);
        break;
      }
      next.push(f);
    }
    setFiles(next);
  }

  async function send() {
    if (!permitId || !preview) return;
    setSending(true);
    try {
      const res = await sendPermitEmail(permitId, files);
      const extra = res.attachments ? ` with ${res.attachments} attachment${res.attachments === 1 ? "" : "s"}` : "";
      toast.success(`Email sent to ${res.to}${extra}`, { description: deliveryNote(res) });
      onSent();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Email failed to send";
      // The mail guard's refusal is long and explains itself — show it in full.
      toast.error(msg, { duration: /switched off|disabled/i.test(msg) ? 12000 : 6000 });
    } finally {
      setSending(false);
    }
  }

  const documentLine = !preview ? null
    : !preview.hasDocument ? "No permit document on file — the email has the details only."
    : preview.delivery === "portal" ? "Permit document: waiting in the client's portal (no link emailed)."
    : "Permit document: secure link in the email (expires in 30 days).";

  return (
    <Dialog open={!!permitId} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Check before sending</DialogTitle>
          <DialogDescription className="text-sm">
            Nothing is sent until you press Send.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {loadError}
          </div>
        ) : !preview ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Building the email…
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">To</dt>
              <dd className="min-w-0 truncate font-medium">
                {preview.to || <span className="text-amber-400">No client email set on this permit</span>}
              </dd>
              <dt className="text-muted-foreground">Subject</dt>
              <dd className="min-w-0 truncate font-medium">{preview.subject}</dd>
              <dt className="text-muted-foreground">Vessel</dt>
              <dd className="min-w-0 truncate">{preview.vesselName}</dd>
            </dl>
            <p className="text-sm text-muted-foreground">{documentLine}</p>

            {/* Sandboxed so the email's own styles can't leak into the app. */}
            <iframe
              title="Email preview"
              srcDoc={preview.html}
              sandbox=""
              className="min-h-[320px] flex-1 rounded-md border border-border bg-white"
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Attachments</span>
                <Button
                  type="button" size="sm" variant="outline" className="gap-1.5"
                  disabled={sending || files.length >= MAX_PERMIT_ATTACHMENTS}
                  onClick={() => fileInput.current?.click()}
                >
                  <Paperclip className="h-4 w-4" /> Add attachment
                </Button>
                <input
                  ref={fileInput} type="file" multiple className="hidden"
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                />
              </div>
              {files.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None added. You can attach a quote or any other file — up to 3 MB each.
                </p>
              ) : (
                <ul className="space-y-1">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${f.size}`}
                      className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="shrink-0 text-muted-foreground">{fmtSize(f.size)}</span>
                      <button
                        type="button" disabled={sending} aria-label={`Remove ${f.name}`}
                        onClick={() => setFiles(files.filter((_, j) => j !== i))}
                        className="rounded p-1 text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button type="button" onClick={send} disabled={sending || !preview || !preview.to} className="gap-1.5">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
