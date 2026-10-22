/**
 * Review-before-send for several permits in one email (SD-0081).
 *
 * Opens from the permits list once rows are ticked: the vessel gets a single
 * message listing every selected pass, each with its own secure document link,
 * instead of one email per pass. Shows the real message (rendered by the server
 * code that sends it); the recipients start as the passes' own contact
 * addresses and can be edited. Nothing leaves until the sender presses Send.
 */
import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  previewPermitBatchEmail, sendPermitBatchEmail,
  MAX_PERMIT_ATTACHMENT_BYTES, MAX_PERMIT_ATTACHMENTS,
  type PermitBatchPreview, type PermitBatchResult,
} from "@/lib/permits/send-permit-email";
import { Loader2, Mail, Paperclip, X, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const fmtSize = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PermitBatchEmailDialog({
  permitIds, noun, nounPlural = `${noun}es`, api, onClose, onSent,
}: {
  /** The permits to send together; null keeps the dialog closed. */
  permitIds: string[] | null;
  /** What one of them is called, e.g. "gate pass". */
  noun: string;
  nounPlural?: string;
  /** Another batch endpoint with the same shapes (e.g. seaman's cards, SD-0079). */
  api?: {
    preview: (ids: string[]) => Promise<PermitBatchPreview>;
    send: (ids: string[], to: string, files: File[]) => Promise<PermitBatchResult>;
  };
  onClose: () => void;
  onSent: () => void;
}) {
  const [preview, setPreview] = useState<PermitBatchPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const key = permitIds?.join(",") ?? "";

  useEffect(() => {
    setPreview(null);
    setLoadError(null);
    setFiles([]);
    setTo("");
    if (!permitIds?.length) return;
    let live = true;
    (api?.preview ?? previewPermitBatchEmail)(permitIds)
      .then((p) => { if (live) { setPreview(p); setTo(p.to); } })
      .catch((e) => { if (live) setLoadError(e instanceof Error ? e.message : "Could not build the email"); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const plural = (n: number) => `${n} ${n === 1 ? noun : nounPlural}`;
  const recipients = to.split(/[\s;,]+/).map((s) => s.trim()).filter(Boolean);
  const badRecipient = recipients.find((r) => !EMAIL_RE.test(r));

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
    if (!permitIds?.length || !preview || !recipients.length || badRecipient) return;
    setSending(true);
    try {
      const res = await (api?.send ?? sendPermitBatchEmail)(permitIds, recipients.join("; "), files);
      const extra = res.attachments ? ` with ${res.attachments} attachment${res.attachments === 1 ? "" : "s"}` : "";
      toast.success(`${plural(res.count)} sent to ${res.to} in one email${extra}`, {
        description: res.delivery === "portal"
          ? "The documents are waiting in the client's portal — no links were emailed, as they requested."
          : res.secureLinks
            ? `${res.secureLinks} document${res.secureLinks === 1 ? "" : "s"} went as secure links, and the send is logged against the vessel.`
            : "The send is logged against the vessel.",
      });
      onSent();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Email failed to send";
      toast.error(msg, { duration: /switched off|disabled/i.test(msg) ? 12000 : 6000 });
    } finally {
      setSending(false);
    }
  }

  const documentLine = !preview ? null
    : preview.withDocument === 0 ? "None of these has a document on file — the email has the details only."
    : preview.delivery === "portal" ? "Documents: waiting in the client's portal (no links emailed)."
    : `Documents: ${preview.withDocument} of ${preview.count} have a secure link in the email (expire in 30 days).`;

  return (
    <Dialog open={!!permitIds?.length} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-4 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Send {permitIds ? plural(permitIds.length) : ""} in one email</DialogTitle>
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
            <dl className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">To</dt>
              <dd className="min-w-0">
                <Input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="captain@vessel.com; agent@vessel.com"
                  disabled={sending}
                  className="h-9"
                />
                {badRecipient ? (
                  <p className="mt-1 text-sm text-destructive">"{badRecipient}" isn't a valid email address</p>
                ) : !recipients.length ? (
                  <p className="mt-1 text-sm text-amber-400">No client email on file — add one here</p>
                ) : null}
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
          <Button
            type="button" onClick={send}
            disabled={sending || !preview || !recipients.length || !!badRecipient}
            className="gap-1.5"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
