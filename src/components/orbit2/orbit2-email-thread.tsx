/**
 * The email thread with the client on an Orbit 2 record (Email Threads tab).
 *
 * The bunkering request goes out from the platform mailbox and asks for replies
 * there; the Worker files each reply on the record by the Task ID in its subject
 * and copies its attachments into Documents (lib/orbit2/orbit2-mail.server).
 * This shows that thread, and answers it: a reply here goes out as a reply-all
 * on the client's latest email, so it threads in everyone's Outlook as well.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, RefreshCw, Send, X, Mail } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/error-message";
import { guardUploadFile, uploadContentType } from "@/lib/upload-guard";
import { storageRef } from "@/lib/signed-url";
import { SignedAnchor } from "@/components/ui/signed-file";
import { ORBIT2_BUCKET, type Orbit2File } from "./orbit2-data";
import { inputCls, stamp } from "./orbit2-fields";

const sb = supabase as any;

type Orbit2Email = {
  id: string;
  direction: "in" | "out";
  from_address: string | null;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string | null;
  body_text: string | null;
  graph_message_id: string | null;
  sent_at: string;
};

async function call(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/orbit2/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error ?? `Request failed (${res.status})`);
  return out;
}

export function EmailThread({
  projectId, files, onFilesChanged,
}: {
  projectId: string;
  files: Orbit2File[];
  /** Replies bring attachments into Documents — the parent reloads its file list. */
  onFilesChanged: () => Promise<void> | void;
}) {
  const { user } = useAuth();
  const [emails, setEmails] = useState<Orbit2Email[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function load() {
    const { data, error } = await sb.from("orbit2_emails").select("*").eq("project_id", projectId).order("sent_at");
    if (error) { toast.error(error.message); setEmails([]); return; }
    setEmails((data ?? []) as Orbit2Email[]);
  }

  useEffect(() => {
    setEmails(null); setText(""); setPending([]);
    void load();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [emails?.length]);

  async function check() {
    setChecking(true);
    try {
      const r = await call({ action: "poll" });
      await Promise.all([load(), onFilesChanged()]);
      if (r.error) toast.warning(r.error);
      else toast.success(r.filed ? `${r.filed} new email${r.filed === 1 ? "" : "s"} filed.` : "No new replies.");
    } catch (e) {
      toast.error(errorMessage(e, "Could not check the mailbox"));
    } finally {
      setChecking(false);
    }
  }

  /** Files attached to a reply are stored on the record first, so what was sent stays in Documents. */
  async function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (!picked.length) return;
    setUploading(true);
    try {
      for (const file of picked) {
        if (!guardUploadFile(file, { accepts: "Use a PDF or an image." })) continue;
        const path = `orbit2/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
        const { error: upErr } = await supabase.storage.from(ORBIT2_BUCKET)
          .upload(path, file, { contentType: uploadContentType(file), upsert: false });
        if (upErr) { toast.error(`${file.name}: ${upErr.message}`); continue; }
        const { data, error } = await sb.from("orbit2_files").insert({
          project_id: projectId, slot: "document", file_name: file.name,
          storage_ref: storageRef(ORBIT2_BUCKET, path), uploaded_by: user?.id ?? null,
        }).select("id").single();
        if (error) { toast.error(`${file.name}: ${error.message}`); continue; }
        setPending((p) => [...p, { id: data.id, name: file.name }]);
      }
      await onFilesChanged();
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    try {
      await call({ action: "reply", project_id: projectId, text, file_ids: pending.map((p) => p.id) });
      toast.success("Reply sent to the client.");
      setText(""); setPending([]);
      await Promise.all([load(), onFilesChanged()]);
    } catch (e) {
      toast.error(errorMessage(e, "Could not send the reply"));
    } finally {
      setSending(false);
    }
  }

  const lastIn = [...(emails ?? [])].reverse().find((e) => e.direction === "in" && e.graph_message_id);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[14px] font-medium text-muted-foreground">Email Threads</div>
        <button onClick={() => void check()} disabled={checking}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[14px] font-medium hover:bg-accent disabled:opacity-50">
          {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Check for replies
        </button>
      </div>

      <div className="rounded-md border border-border bg-background">
        <div className="max-h-[28rem] space-y-2 overflow-auto p-2.5">
          {emails === null ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : emails.length === 0 ? (
            <p className="px-1 py-1.5 text-[14px] text-muted-foreground/70">
              No emails yet. When the client replies to the bunkering request, the reply and its attachments appear here — checked every 5 minutes.
            </p>
          ) : emails.map((e) => {
            const atts = files.filter((f) => f.email_id === e.id);
            const client = e.direction === "in";
            return (
              <div key={e.id} className={cn("rounded-md border px-3 py-2",
                client ? "mr-6 border-primary/40 bg-primary/5" : "ml-6 border-border bg-muted/20")}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-[14px] font-semibold">
                    {e.from_name || e.from_address || "—"}
                    <span className="ml-1.5 font-normal text-muted-foreground">{client ? "Client" : "Team"}</span>
                  </span>
                  <span className="text-[14px] text-muted-foreground">{stamp(e.sent_at)}</span>
                </div>
                {e.subject && <div className="truncate text-[14px] text-muted-foreground" title={e.subject}>{e.subject}</div>}
                <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{e.body_text || "(no text)"}</p>
                {atts.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {atts.map((f) => (
                      <SignedAnchor key={f.id} stored={f.storage_ref} title={f.file_name}
                        className="flex max-w-full items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-[14px] text-primary hover:underline">
                        <Paperclip className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{f.file_name}</span>
                      </SignedAnchor>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {lastIn ? (
          <div className="border-t border-border/50 p-2.5">
            <textarea className={cn(inputCls, "min-h-[5rem] resize-y")} value={text}
              placeholder={`Reply to ${lastIn.from_name || lastIn.from_address} — goes as reply-all; the bunkering team stays copied`}
              onChange={(ev) => setText(ev.target.value)} />
            {pending.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {pending.map((p) => (
                  <span key={p.id} className="flex items-center gap-1 rounded-full bg-primary/15 py-0.5 pl-2.5 pr-1 text-[14px] text-primary">
                    {p.name}
                    <button type="button" title="Leave off this reply (it stays in Documents)"
                      onClick={() => setPending((list) => list.filter((x) => x.id !== p.id))}
                      className="rounded-full p-0.5 hover:bg-primary/20"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center justify-between gap-2">
              <input ref={fileRef} type="file" multiple accept="application/pdf,image/*" className="hidden"
                onChange={(ev) => void addFiles(ev.target.files)} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[14px] font-medium hover:bg-accent disabled:opacity-50">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                Attach
              </button>
              <button onClick={() => void send()} disabled={sending || uploading || !text.trim()}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[15px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send reply
              </button>
            </div>
          </div>
        ) : emails && emails.length > 0 ? (
          <p className="flex items-center gap-1.5 border-t border-border/50 px-3 py-2 text-[14px] text-muted-foreground">
            <Mail className="h-3.5 w-3.5" /> You can reply here once the client has answered.
          </p>
        ) : null}
      </div>
    </div>
  );
}
