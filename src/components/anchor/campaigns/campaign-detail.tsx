/**
 * A sent campaign — per-recipient tracking (sent → viewed → signed), reminders,
 * resending held/failed emails, attaching paper-signed copies, cancelling.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveSignedUrl } from "@/lib/signed-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Loader2, BellRing, RefreshCw, Upload, Download, Link2, FileSearch, Ban, Search, Send, Paperclip, PenLine,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { campaignApi, fileToBase64 } from "@/lib/esign/campaign-client";

const db = () => supabase as any;

type Row = {
  id: string; name: string; email: string; role: string | null; status: string; error: string | null;
  sent_at: string | null; last_reminded_at: string | null; remind_count: number;
  yacht_id: string | null; esign_document_id: string | null;
  yachts: { vessel_name: string } | null;
  doc: { id: string; reference: string | null; status: string; viewed_at: string | null; signed_at: string | null; signed_method: string | null; signed_file_path: string | null; signing_token: string | null; declined_reason: string | null } | null;
};

/** One status per recipient: the send state until delivered, then the document's. */
function stateOf(r: Row): string {
  if (r.status !== "sent") return r.status; // pending | failed | held | cancelled
  return r.doc?.status ?? "sent";
}

const STATE: Record<string, { label: string; cls: string }> = {
  pending: { label: "Not sent yet", cls: "bg-slate-500/15 text-slate-600" },
  held: { label: "Held", cls: "bg-amber-500/15 text-amber-600" },
  failed: { label: "Failed", cls: "bg-red-500/15 text-red-600" },
  cancelled: { label: "Cancelled", cls: "bg-slate-500/15 text-slate-500" },
  sent: { label: "Sent", cls: "bg-sky-500/15 text-sky-600" },
  viewed: { label: "Opened", cls: "bg-indigo-500/15 text-indigo-600" },
  signed: { label: "Signed", cls: "bg-emerald-500/15 text-emerald-600" },
  declined: { label: "Declined", cls: "bg-rose-500/15 text-rose-600" },
  expired: { label: "Expired", cls: "bg-orange-500/15 text-orange-600" },
  voided: { label: "Withdrawn", cls: "bg-slate-500/15 text-slate-500" },
};

const fmt = (d: string | null) => d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export function CampaignDetail({ campaignId, onBack, onOpenDocument }: {
  campaignId: string;
  onBack: () => void;
  onOpenDocument?: (id: string) => void;
}) {
  const [c, setC] = useState<any>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ label: string; done: number; total: number } | null>(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const uploadFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { void load(); }, [campaignId]);

  async function load() {
    const [{ data: camp }, { data: rs }] = await Promise.all([
      db().from("esign_campaigns").select("*").eq("id", campaignId).maybeSingle(),
      db().from("esign_campaign_recipients")
        .select("*, yachts:yacht_id(vessel_name), doc:esign_document_id(id, reference, status, viewed_at, signed_at, signed_method, signed_file_path, signing_token, declined_reason)")
        .eq("campaign_id", campaignId).order("name"),
    ]);
    setC(camp); setRows((rs ?? []) as Row[]); setLoading(false);
  }

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) { const s = stateOf(r); m[s] = (m[s] ?? 0) + 1; }
    return m;
  }, [rows]);
  const signed = counts.signed ?? 0;
  const delivered = rows.filter((r) => r.status === "sent").length;
  const ql = q.trim().toLowerCase();
  const visible = rows.filter((r) => (filter === "all" || stateOf(r) === filter || (filter === "unsigned" && ["sent", "viewed", "expired"].includes(stateOf(r))))
    && (!ql || `${r.name} ${r.email} ${r.yachts?.vessel_name ?? ""}`.toLowerCase().includes(ql)));

  async function runBulk(label: string, ids: string[], action: "send-one" | "remind") {
    if (!ids.length) return;
    setBulk({ label, done: 0, total: ids.length });
    let bad = 0;
    for (let i = 0; i < ids.length; i++) {
      try { const res = await campaignApi(action, { recipientId: ids[i] }); if (res.ok === false) bad++; } catch { bad++; }
      setBulk({ label, done: i + 1, total: ids.length });
    }
    setBulk(null);
    if (bad) toast.warning(`${ids.length - bad} done, ${bad} not sent`); else toast.success(`${label}: ${ids.length} done`);
    await load();
  }

  async function one(r: Row, action: "send-one" | "remind") {
    setBusyId(r.id);
    try {
      const res = await campaignApi(action, { recipientId: r.id });
      if (res.ok === false) toast.error(res.error ?? "Not sent");
      else toast.success(action === "remind" ? `Reminder sent to ${r.email}` : `Sent to ${r.email}`);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusyId(null); }
  }

  async function copyLink(r: Row) {
    if (!r.doc?.signing_token) return;
    const base = (import.meta.env.VITE_APP_URL as string | undefined) || window.location.origin;
    await navigator.clipboard.writeText(`${base.replace(/\/$/, "")}/sign/${r.doc.signing_token}`);
    toast.success("Signing link copied", { description: "It's personal to this recipient — only share it with them." });
  }

  async function downloadSigned(r: Row) {
    if (!r.doc?.signed_file_path) return;
    const url = await resolveSignedUrl(r.doc.signed_file_path, "esign-documents");
    if (url) window.open(url, "_blank", "noopener"); else toast.error("Could not open the signed copy");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = "";
    const rid = uploadFor.current; uploadFor.current = null;
    if (!file || !rid) return;
    if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) { toast.error("Upload a PDF, PNG or JPEG"); return; }
    setBusyId(rid);
    try {
      await campaignApi("staff-upload", { recipientId: rid, fileBase64: await fileToBase64(file), contentType: file.type });
      toast.success("Signed copy attached — marked as signed");
      await load();
    } catch (err: any) { toast.error(err?.message ?? "Upload failed"); }
    finally { setBusyId(null); }
  }

  async function cancel() {
    setCancelOpen(false);
    try { await campaignApi("cancel", { campaignId }); toast.success("Campaign cancelled — unsigned links withdrawn"); await load(); }
    catch (e: any) { toast.error(e?.message ?? "Could not cancel"); }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!c) return <div className="p-6 text-sm text-muted-foreground">Campaign not found. <button className="text-primary underline" onClick={onBack}>Back</button></div>;

  const pendingIds = rows.filter((r) => r.status === "pending").map((r) => r.id);
  const retryIds = rows.filter((r) => r.status === "held" || r.status === "failed").map((r) => r.id);
  const unsignedIds = rows.filter((r) => r.status === "sent" && ["sent", "viewed", "expired"].includes(r.doc?.status ?? "")).map((r) => r.id);
  const cancelled = c.status === "cancelled";

  const stat = (label: string, n: number, cls?: string) => (
    <div className="rounded-lg border border-border/60 bg-card/40 px-4 py-2.5">
      <div className={cn("text-xl font-semibold tabular-nums", cls)}>{n}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <input ref={fileInput} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={onFile} />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-8 gap-1"><ArrowLeft className="h-4 w-4" /> Campaigns</Button>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">{c.reference} · {c.doc_title}</div>
            <h1 className="font-display text-[1.15rem] font-semibold tracking-tight">{c.name}</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!cancelled && pendingIds.length > 0 && <Button size="sm" className="h-9 gap-1.5" disabled={!!bulk} onClick={() => runBulk("Sending", pendingIds, "send-one")}><Send className="h-3.5 w-3.5" /> Send remaining ({pendingIds.length})</Button>}
          {!cancelled && retryIds.length > 0 && <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={!!bulk} onClick={() => runBulk("Resending", retryIds, "send-one")}><RefreshCw className="h-3.5 w-3.5" /> Retry not sent ({retryIds.length})</Button>}
          {!cancelled && unsignedIds.length > 0 && <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={!!bulk} onClick={() => runBulk("Reminders", unsignedIds, "remind")}><BellRing className="h-3.5 w-3.5" /> Remind unsigned ({unsignedIds.length})</Button>}
          {!cancelled && <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-muted-foreground hover:text-red-600" disabled={!!bulk} onClick={() => setCancelOpen(true)}><Ban className="h-3.5 w-3.5" /> Cancel campaign</Button>}
        </div>
      </header>

      {bulk && (
        <div className="border-b border-border/60 bg-primary/5 px-6 py-3">
          <div className="mb-1.5 flex justify-between text-sm"><span>{bulk.label}… keep this tab open</span><span className="tabular-nums">{bulk.done}/{bulk.total}</span></div>
          <Progress value={(bulk.done / bulk.total) * 100} />
        </div>
      )}

      <div className="flex-1 space-y-5 overflow-auto p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("rounded-full px-2 py-0.5 font-semibold uppercase", cancelled ? "bg-slate-500/15" : c.status === "sent" ? "bg-emerald-500/15 text-emerald-600" : "bg-sky-500/15 text-sky-600")}>{c.status}</span>
          <span>{c.allow_esign ? <><PenLine className="mr-0.5 inline h-3 w-3" />E-signature</> : "Paper only"}</span>·
          <span>{c.include_pdf ? <><Paperclip className="mr-0.5 inline h-3 w-3" />PDF attached</> : "No PDF attachment"}</span>·
          <span>by {c.created_by_name ?? "—"}{c.sent_at ? `, finished sending ${fmt(c.sent_at)}` : ""}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stat("Recipients", rows.length)}
          {stat("Delivered", delivered)}
          {stat("Opened", (counts.viewed ?? 0) + signed + (counts.declined ?? 0))}
          {stat("Signed", signed, "text-emerald-600")}
          {stat("Declined", counts.declined ?? 0, (counts.declined ?? 0) ? "text-rose-600" : undefined)}
          {stat("Held / failed", (counts.held ?? 0) + (counts.failed ?? 0), (counts.held ?? 0) + (counts.failed ?? 0) ? "text-amber-600" : undefined)}
        </div>
        {rows.length > 0 && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Signed</span><span className="tabular-nums">{Math.round((signed / rows.length) * 100)}%</span></div>
            <Progress value={(signed / rows.length) * 100} />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipients…" className="pl-8" />
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            <option value="all">All ({rows.length})</option>
            <option value="unsigned">Waiting for signature ({unsignedIds.length})</option>
            {Object.entries(counts).map(([k, n]) => <option key={k} value={k}>{STATE[k]?.label ?? k} ({n})</option>)}
          </select>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Recipient</th>
                <th className="px-3 py-2 font-medium">Vessel</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Activity</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const s = stateOf(r);
                const meta = STATE[s] ?? { label: s, cls: "bg-muted" };
                const busy = busyId === r.id || !!bulk;
                const waiting = r.status === "sent" && ["sent", "viewed", "expired"].includes(r.doc?.status ?? "");
                return (
                  <tr key={r.id} className="border-t border-border/50 align-top">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.yachts?.vessel_name ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.cls)}>{meta.label}</span>
                      {s === "signed" && r.doc?.signed_method && r.doc.signed_method !== "esign" && <div className="mt-1 text-[11px] text-muted-foreground">{r.doc.signed_method === "upload" ? "Paper copy uploaded by signer" : "Paper copy attached by staff"}</div>}
                      {r.error && (s === "failed" || s === "held") && <div className="mt-1 max-w-[260px] text-[11px] text-amber-700 dark:text-amber-400">{r.error}</div>}
                      {s === "declined" && r.doc?.declined_reason && <div className="mt-1 max-w-[260px] text-[11px] text-muted-foreground">“{r.doc.declined_reason}”</div>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {r.sent_at && <div>Sent {fmt(r.sent_at)}</div>}
                      {r.doc?.viewed_at && <div>Opened {fmt(r.doc.viewed_at)}</div>}
                      {r.doc?.signed_at && <div className="text-emerald-600">Signed {fmt(r.doc.signed_at)}</div>}
                      {r.remind_count > 0 && <div>{r.remind_count} reminder{r.remind_count === 1 ? "" : "s"} · last {fmt(r.last_reminded_at)}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        {busyId === r.id && <Loader2 className="mt-1.5 h-4 w-4 animate-spin text-muted-foreground" />}
                        {!cancelled && (r.status === "pending" || r.status === "held" || r.status === "failed") && (
                          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => one(r, "send-one")}><Send className="h-3 w-3" /> {r.status === "pending" ? "Send" : "Retry"}</Button>
                        )}
                        {!cancelled && waiting && <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => one(r, "remind")}><BellRing className="h-3 w-3" /> Remind</Button>}
                        {!cancelled && waiting && (
                          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={busy} title="Attach a copy the client signed on paper and emailed back"
                            onClick={() => { uploadFor.current = r.id; fileInput.current?.click(); }}><Upload className="h-3 w-3" /> Signed copy</Button>
                        )}
                        {waiting && r.doc?.signing_token && <Button size="sm" variant="ghost" className="h-7 px-2" title="Copy this recipient's signing link" onClick={() => copyLink(r)}><Link2 className="h-3.5 w-3.5" /></Button>}
                        {s === "signed" && <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => downloadSigned(r)}><Download className="h-3 w-3" /> Signed</Button>}
                        {r.doc && onOpenDocument && <Button size="sm" variant="ghost" className="h-7 px-2" title="Open the document" onClick={() => onOpenDocument(r.doc!.id)}><FileSearch className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">No recipients match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this campaign?</AlertDialogTitle>
            <AlertDialogDescription>Every unsigned signing link is withdrawn, so those recipients can no longer sign. Documents already signed are kept. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={cancel} className="bg-red-600 hover:bg-red-700">Cancel campaign</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
