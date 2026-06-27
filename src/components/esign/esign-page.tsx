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
import { FileSignature, Plus, Search, Loader2, Send, Upload, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ESIGN_STATUS_ORDER, ESIGN_STATUS_LABEL, ESIGN_STATUS_COLOR } from "./esign-meta";

type Doc = {
  id: string; reference: string | null; title: string; signer_name: string; signer_email: string;
  status: string; sent_at: string | null; signed_at: string | null; updated_at: string;
};

const EMPTY = { title: "", description: "", signer_name: "", signer_email: "", message: "" };
const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function EsignPage({ onOpenDocument }: { onOpenDocument?: (id: string) => void } = {}) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any).from("esign_documents")
      .select("id, reference, title, signer_name, signer_email, status, sent_at, signed_at, updated_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as Doc[]);
    setLoading(false);
  }

  async function createDoc(sendNow: boolean) {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!form.signer_name.trim() || !form.signer_email.trim()) { toast.error("Signer name and email are required"); return; }
    if (!file) { toast.error("Please attach a PDF to sign"); return; }
    setBusy(true);
    try {
      const path = `originals/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const up = await supabase.storage.from("esign-documents").upload(path, file, { contentType: file.type || "application/pdf" });
      if (up.error) throw up.error;

      const { data: inserted, error } = await (supabase as any).from("esign_documents").insert([{
        title: form.title.trim(),
        description: form.description.trim() || null,
        signer_name: form.signer_name.trim(),
        signer_email: form.signer_email.trim(),
        message: form.message.trim() || null,
        file_path: path,
        file_name: file.name,
        status: "draft",
        created_by: user?.id ?? null,
      }]).select("id").single();
      if (error) throw error;

      if (sendNow) {
        await doSendForSignature({ data: { documentId: inserted.id, senderEmail: user?.email } } as any);
        toast.success("Document sent for signature");
      } else {
        toast.success("Draft saved");
      }
      setOpen(false); setForm(EMPTY); setFile(null);
      void load();
    } catch (e: any) { toast.error(e.message ?? "Failed to create document"); }
    finally { setBusy(false); }
  }

  async function send(d: Doc) {
    setSendingId(d.id);
    try {
      await doSendForSignature({ data: { documentId: d.id, senderEmail: user?.email } } as any);
      toast.success(`Sent to ${d.signer_email}`);
      void load();
    } catch (e: any) { toast.error(e.message ?? "Send failed"); }
    finally { setSendingId(null); }
  }

  const filtered = useMemo(() => rows.filter(r => {
    if (filter !== "all" && r.status !== filter) return false;
    if (q.trim()) {
      const hay = [r.reference, r.title, r.signer_name, r.signer_email].join(" ").toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [rows, q, filter]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Documents</div>
          <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
            <FileSignature className="h-4 w-4 text-primary/80" /> Anchor
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search documents…" className="h-9 w-60 pl-8 text-sm" />
          </div>
          <Button size="sm" onClick={() => setOpen(true)} className="h-9 gap-1.5 px-3.5 font-medium shadow-sm"><Plus className="h-3.5 w-3.5" /> New Document</Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-4 border-b border-border/40 bg-muted/10 px-6 py-2 text-xs">
        <button onClick={() => setFilter("all")} className={cn("transition", filter === "all" ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground")}>All {rows.length}</button>
        {ESIGN_STATUS_ORDER.map(s => {
          const n = rows.filter(r => r.status === s).length;
          if (!n && s !== "sent" && s !== "signed") return null;
          return (
            <button key={s} onClick={() => setFilter(filter === s ? "all" : s)} className={cn("transition", filter === s ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground")}>
              {n} {ESIGN_STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
            <FileSignature className="mb-3 h-7 w-7 text-muted-foreground/40" />
            <p className="font-display text-base font-semibold">{rows.length === 0 ? "No documents yet" : "No documents match"}</p>
            <p className="mt-1 text-sm text-muted-foreground">Upload a PDF and send it to someone for electronic signature.</p>
            {rows.length === 0 && <Button onClick={() => setOpen(true)} className="mt-4 gap-1.5"><Plus className="h-4 w-4" /> New Document</Button>}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                {["Ref", "Title", "Signer", "Status", "Sent", "Signed", ""].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">{onOpenDocument
                      ? <button onClick={() => onOpenDocument(d.id)} className="font-mono text-xs text-primary hover:underline">{d.reference ?? "—"}</button>
                      : <Link to="/esign/$documentId" params={{ documentId: d.id }} className="font-mono text-xs text-primary hover:underline">{d.reference ?? "—"}</Link>}</td>
                    <td className="px-4 py-3">{onOpenDocument
                      ? <button onClick={() => onOpenDocument(d.id)} className="font-medium hover:text-primary transition-colors line-clamp-1 text-left">{d.title}</button>
                      : <Link to="/esign/$documentId" params={{ documentId: d.id }} className="font-medium hover:text-primary transition-colors line-clamp-1">{d.title}</Link>}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><div className="leading-tight">{d.signer_name}</div><div className="text-xs text-muted-foreground">{d.signer_email}</div></td>
                    <td className="px-4 py-3"><span className={cn("rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold", ESIGN_STATUS_COLOR[d.status] ?? "bg-muted text-muted-foreground")}>{ESIGN_STATUS_LABEL[d.status] ?? d.status}</span></td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmt(d.sent_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmt(d.signed_at)}</td>
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

      {/* New document dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileSignature className="h-4 w-4 text-primary" /> New Document</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Document title <span className="text-destructive">*</span></Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="h-8" placeholder="e.g. Charter Agreement — MY Aurora" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Signer name <span className="text-destructive">*</span></Label>
                <Input value={form.signer_name} onChange={e => setForm(f => ({ ...f, signer_name: e.target.value }))} className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Signer email <span className="text-destructive">*</span></Label>
                <Input type="email" value={form.signer_email} onChange={e => setForm(f => ({ ...f, signer_email: e.target.value }))} className="h-8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Message to signer</Label>
              <Textarea rows={2} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} className="resize-none text-sm" placeholder="Optional note included in the signing email." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Document (PDF) <span className="text-destructive">*</span></Label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 hover:bg-muted/40 transition">
                <UploadCloud className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{file ? file.name : "Choose a PDF to send for signing"}</span>
                <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="outline" onClick={() => createDoc(false)} disabled={busy} className="gap-1.5"><Upload className="h-3.5 w-3.5" /> Save draft</Button>
            <Button onClick={() => createDoc(true)} disabled={busy} className="gap-1.5">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send for signature</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
