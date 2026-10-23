import { useState, useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { doSendForSignature } from "@/lib/esign.server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Receipt, Plus, Loader2, Send, Upload, UploadCloud } from "lucide-react";
import { confidentialPath } from "@/components/anchor/confidential";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ESIGN_STATUS_ORDER, ESIGN_STATUS_LABEL, ESIGN_STATUS_COLOR, sendOutcome } from "./esign-meta";

// SD-0083 — one-off quotations sent to the client to accept and sign. A quote is
// an esign_documents row with kind = 'quotation', so it signs, certifies and
// audits exactly like any other Anchor document; this box is its own list.

type Quote = {
  id: string; reference: string | null; title: string; signer_name: string; signer_email: string;
  status: string; sent_at: string | null; signed_at: string | null;
};

// The client accepts a quote by signing it — say so in the list.
const QUOTE_STATUS_LABEL: Record<string, string> = { ...ESIGN_STATUS_LABEL, signed: "Accepted", viewed: "Opened by client" };
const SIG_POSITIONS = ["bottom-right", "bottom-left", "bottom-center", "top-right", "top-left", "middle-center"];
const EMPTY = { title: "", signer_name: "", signer_email: "", message: "" };
const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function QuotationsBox({ confidential = false, onOpenDocument }: { confidential?: boolean; onOpenDocument?: (id: string) => void }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [sigPage, setSigPage] = useState("1");
  const [sigPos, setSigPos] = useState("bottom-right");
  const [busy, setBusy] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => { void load(); }, [confidential]);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any).from("esign_documents")
      .select("id, reference, title, signer_name, signer_email, status, sent_at, signed_at")
      .eq("kind", "quotation").eq("confidential", confidential)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as Quote[]);
    setLoading(false);
  }

  function close() { setOpen(false); setForm(EMPTY); setFile(null); setSigPage("1"); setSigPos("bottom-right"); }

  async function createQuote(sendNow: boolean) {
    if (!form.title.trim()) { toast.error("Quotation title is required"); return; }
    if (!form.signer_name.trim() || !form.signer_email.trim()) { toast.error("Client name and email are required"); return; }
    if (!file) { toast.error("Attach the quotation PDF"); return; }
    setBusy(true);
    try {
      const path = confidentialPath(confidential, `quotations/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`);
      const up = await supabase.storage.from("esign-documents").upload(path, file, { contentType: file.type || "application/pdf" });
      if (up.error) throw up.error;

      const { data: inserted, error } = await (supabase as any).from("esign_documents").insert([{
        kind: "quotation",
        title: form.title.trim(),
        signer_name: form.signer_name.trim(),
        signer_email: form.signer_email.trim(),
        message: form.message.trim() || null,
        file_path: path,
        file_name: file.name,
        status: "draft",
        signature_fields: [{ page: Number(sigPage) || 1, pos: sigPos }],
        confidential,
        created_by: user?.id ?? null,
      }]).select("id").single();
      if (error) throw error;

      if (sendNow) {
        const res = await doSendForSignature({ data: { documentId: inserted.id, senderEmail: user?.email } } as any);
        toast.success(sendOutcome(res, `Quotation sent to ${form.signer_email.trim()}`));
      } else {
        toast.success("Quotation saved as a draft");
      }
      close();
      void load();
    } catch (e: any) { toast.error(e.message ?? "Failed to create the quotation"); }
    finally { setBusy(false); }
  }

  async function send(d: Quote) {
    setSendingId(d.id);
    try {
      const res = await doSendForSignature({ data: { documentId: d.id, senderEmail: user?.email } } as any);
      toast.success(sendOutcome(res, `Quotation sent to ${d.signer_email}`));
      void load();
    } catch (e: any) { toast.error(e.message ?? "Send failed"); }
    finally { setSendingId(null); }
  }

  const filtered = useMemo(() => rows.filter(r => filter === "all" || r.status === filter), [rows, filter]);

  const openLink = (d: Quote, children: React.ReactNode, className: string) => onOpenDocument
    ? <button onClick={() => onOpenDocument(d.id)} className={cn(className, "text-left")}>{children}</button>
    : <Link to="/esign/$documentId" params={{ documentId: d.id }} className={className}>{children}</Link>;

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Receipt className="h-4 w-4 text-primary/80" /></div>
          <div>
            <div className="font-display text-base font-semibold leading-tight">Quotations</div>
            <div className="text-xs text-muted-foreground">Upload a quotation and send it to the client to accept and sign.</div>
          </div>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="h-8 gap-1.5"><Plus className="h-3.5 w-3.5" /> New Quotation</Button>
      </div>

      {rows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
          <button onClick={() => setFilter("all")} className={cn("transition", filter === "all" ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>All {rows.length}</button>
          {ESIGN_STATUS_ORDER.map(s => {
            const n = rows.filter(r => r.status === s).length;
            if (!n) return null;
            return (
              <button key={s} onClick={() => setFilter(filter === s ? "all" : s)} className={cn("transition", filter === s ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {n} {QUOTE_STATUS_LABEL[s]}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3">
        {loading ? (
          <div className="flex h-20 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">No quotations yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                {["Ref", "Quotation", "Client", "Status", "Sent", "Accepted", ""].map(h => (
                  <th key={h} className="whitespace-nowrap px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id} className="border-b border-border/40 transition-colors last:border-0 hover:bg-accent/20">
                    <td className="whitespace-nowrap px-4 py-3">{openLink(d, d.reference ?? "—", "font-mono text-xs text-primary hover:underline")}</td>
                    <td className="px-4 py-3">{openLink(d, d.title, "line-clamp-1 font-medium transition-colors hover:text-primary")}</td>
                    <td className="whitespace-nowrap px-4 py-3"><div className="leading-tight">{d.signer_name}</div><div className="text-xs text-muted-foreground">{d.signer_email}</div></td>
                    <td className="px-4 py-3"><span className={cn("rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold", ESIGN_STATUS_COLOR[d.status] ?? "bg-muted text-muted-foreground")}>{QUOTE_STATUS_LABEL[d.status] ?? d.status}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmt(d.sent_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmt(d.signed_at)}</td>
                    <td className="px-4 py-3 text-right">
                      {(d.status === "draft" || d.status === "sent" || d.status === "viewed" || d.status === "expired") && (
                        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={sendingId === d.id} onClick={() => send(d)}>
                          {sendingId === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          {d.status === "draft" ? "Send" : "Resend"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) close(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> New Quotation</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Quotation title <span className="text-destructive">*</span></Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="h-8" placeholder="e.g. Port agency quotation — MY Aurora" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Client name <span className="text-destructive">*</span></Label>
                <Input value={form.signer_name} onChange={e => setForm(f => ({ ...f, signer_name: e.target.value }))} className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Client email <span className="text-destructive">*</span></Label>
                <Input type="email" value={form.signer_email} onChange={e => setForm(f => ({ ...f, signer_email: e.target.value }))} className="h-8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Message to client</Label>
              <Textarea rows={2} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} className="resize-none text-sm" placeholder="Optional note included in the email." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Quotation (PDF) <span className="text-destructive">*</span></Label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 transition hover:bg-muted/40">
                <UploadCloud className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{file ? file.name : "Choose the quotation PDF"}</span>
                <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Signature placement</Label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Page</span>
                  <Input type="number" min={1} value={sigPage} onChange={e => setSigPage(e.target.value)} className="h-8 w-16" />
                </div>
                <select value={sigPos} onChange={e => setSigPos(e.target.value)} className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm">
                  {SIG_POSITIONS.map(p => <option key={p} value={p}>{p.replace("-", " ")}</option>)}
                </select>
              </div>
              <p className="text-[11px] text-muted-foreground/70">The client's signature is stamped here to accept the quote, and a signature certificate page is appended.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
            <Button variant="outline" onClick={() => createQuote(false)} disabled={busy} className="gap-1.5"><Upload className="h-3.5 w-3.5" /> Save draft</Button>
            <Button onClick={() => createQuote(true)} disabled={busy} className="gap-1.5">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send to client</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
