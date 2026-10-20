import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSignedUrl } from "@/lib/signed-url";
import { PERMIT_META, type PermitType } from "@/lib/permit-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, ExternalLink, FileText, FolderOpen, Inbox, Loader2, Mail, RefreshCw, Upload, XCircle,
} from "lucide-react";

/**
 * Permit Inbox — permits Polaris found in the watched mailboxes (Faisal's), read
 * and matched to a vessel. The Agency team checks the match and the details,
 * then Confirm creates/updates the permit and copies the PDF into the vessel's
 * SharePoint folder ("ENTRY PERMIT {year}" for entry permits).
 *
 * Reads come straight from permit_inbox (Agency-only RLS); every action goes
 * through POST /api/permits/inbox.
 */

type InboxRow = {
  id: string;
  source: "email" | "upload";
  mailbox: string | null;
  received_at: string | null;
  from_address: string | null;
  from_name: string | null;
  subject: string | null;
  file_name: string | null;
  document_url: string | null;
  status: "pending" | "filed" | "rejected" | "not_permit" | "duplicate" | "error";
  reading: any;
  permit_type: string | null;
  dma_phase: string | null;
  permit_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  issuing_authority: string | null;
  vessel_name: string | null;
  suggested_yacht_id: string | null;
  match_score: number | null;
  match_reason: string | null;
  candidates: { yacht_id: string; vessel_name: string; score: number; reason: string }[];
  existing_permit_id: string | null;
  yacht_id: string | null;
  permit_id: string | null;
  sharepoint_web_url: string | null;
  sharepoint_error: string | null;
  error: string | null;
  created_at: string;
};
type Mailbox = { mailbox: string; label: string | null; enabled: boolean; last_polled_at: string | null; last_ok_at: string | null; last_error: string | null };
type Yacht = { id: string; vessel_name: string; archive: boolean | null };

type View = "review" | "filed" | "other";
const VIEW_STATUSES: Record<View, InboxRow["status"][]> = {
  review: ["pending", "error"],
  filed: ["filed"],
  other: ["not_permit", "rejected"],
};
const PHASED = new Set(["exit_entry", "dma", "abu_dhabi"]);

async function api<T = any>(payload: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await (supabase as any).auth.getSession();
  const res = await fetch("/api/permits/inbox", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const typeLabel = (t: string | null, phase: string | null) =>
  !t ? "Permit (type not recognised)" : t === "exit_entry" && phase ? `${phase} permit` : (PERMIT_META[t as PermitType]?.label ?? t);

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function PermitInbox({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const [view, setView] = useState<View>("review");
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [polling, setPolling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [{ data: items }, { data: boxes }, { count }] = await Promise.all([
      (supabase as any).from("permit_inbox").select("*").in("status", VIEW_STATUSES[view])
        .order("received_at", { ascending: false, nullsFirst: false }).limit(200),
      (supabase as any).from("permit_inbox_mailboxes").select("*").order("mailbox"),
      (supabase as any).from("permit_inbox").select("id", { count: "exact", head: true }).in("status", ["pending", "error"]),
    ]);
    setRows((items ?? []) as InboxRow[]);
    setMailboxes((boxes ?? []) as Mailbox[]);
    onCountChange?.(count ?? 0);
    setLoading(false);
  }, [view, onCountChange]);

  useEffect(() => { setLoading(true); void load(); }, [load]);
  useEffect(() => {
    void (supabase as any).from("yachts").select("id, vessel_name, archive").not("vessel_name", "is", null)
      .order("vessel_name").then(({ data }: any) => setYachts((data ?? []) as Yacht[]));
  }, []);
  useEffect(() => {
    if (!rows.some((r) => r.id === selectedId)) setSelectedId(rows[0]?.id ?? null);
  }, [rows, selectedId]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  async function checkNow() {
    setPolling(true);
    try {
      const { results } = await api<{ results: { mailbox: string; read: number; permits: number; error?: string }[] | null }>({ action: "poll" });
      const err = results?.find((r) => r.error);
      if (err) toast.error(err.error);
      else {
        const found = (results ?? []).reduce((n, r) => n + r.permits, 0);
        toast.success(found ? `${found} new permit${found === 1 ? "" : "s"} found` : "No new permits");
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check failed");
    } finally {
      setPolling(false);
    }
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const res = await api<{ id: string; status: string }>({ action: "upload", fileName: file.name, contentBase64: await fileToBase64(file) });
      toast.success(res.status === "duplicate" ? "That PDF is already in the inbox" : "Permit read — check the details");
      setView("review");
      await load();
      if (res.id && res.status !== "duplicate") setSelectedId(res.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header: what is being watched, and the two ways in */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {mailboxes.map((m) => (
            <div key={m.mailbox} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                Watching <span className="font-medium text-foreground">{m.label ?? m.mailbox}</span> ({m.mailbox})
                {m.enabled ? ` · last checked ${fmt(m.last_polled_at)}` : " · paused"}
              </span>
              {m.last_error && (
                <span className="flex items-center gap-1 text-destructive" title={m.last_error}>
                  <AlertTriangle className="h-3.5 w-3.5" /> Can't read this mailbox
                </span>
              )}
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={checkNow} disabled={polling}>
          {polling ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />} Check now
        </Button>
        <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />} Upload a permit
        </Button>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={upload} />
      </div>
      {mailboxes.find((m) => m.last_error) && (
        <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          {mailboxes.find((m) => m.last_error)?.last_error}
        </div>
      )}

      <div className="flex gap-1 border-b border-border/60 px-4">
        {([["review", "To review"], ["filed", "Filed"], ["other", "Ignored / rejected"]] as [View, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={cn("border-b-2 px-3 py-2 text-sm font-medium transition",
              view === v ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* List */}
        <div className="w-80 shrink-0 overflow-auto border-r border-border/60">
          {loading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <Inbox className="h-8 w-8" />
              {view === "review" ? "Nothing waiting. Vessel entry and exit permits appear here within 5 minutes of arriving." : "Nothing here."}
            </div>
          ) : rows.map((r) => {
            const vessel = yachts.find((y) => y.id === (r.yacht_id ?? r.suggested_yacht_id))?.vessel_name;
            return (
              <button key={r.id} onClick={() => setSelectedId(r.id)}
                className={cn("block w-full border-b border-border/40 px-4 py-3 text-left transition hover:bg-muted/40",
                  r.id === selectedId && "bg-muted/60")}>
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{vessel ?? r.vessel_name ?? r.file_name ?? "PDF"}</span>
                  {r.status === "error" && <Badge variant="destructive" className="shrink-0">Unread</Badge>}
                  {r.status === "pending" && !r.suggested_yacht_id && <Badge variant="outline" className="shrink-0">No match</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {r.status === "not_permit" || r.status === "rejected" ? r.file_name : typeLabel(r.permit_type, r.dma_phase)}
                  {r.permit_number ? ` · ${r.permit_number}` : ""}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {r.source === "upload" ? "Uploaded" : (r.from_name || r.from_address || "Email")} · {fmt(r.received_at ?? r.created_at)}
                </div>
              </button>
            );
          })}
        </div>

        {/* Detail */}
        <div className="min-w-0 flex-1 overflow-auto">
          {selected ? (
            <InboxDetail key={selected.id} row={selected} yachts={yachts} onChanged={load} />
          ) : (
            <div className="p-8 text-sm text-muted-foreground">Select an item.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function InboxDetail({ row, yachts, onChanged }: { row: InboxRow; yachts: Yacht[]; onChanged: () => Promise<void> | void }) {
  const pdfUrl = useSignedUrl(row.document_url);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(name: string, payload: Record<string, unknown>, done?: string) {
    setBusy(name);
    try {
      await api({ ...payload, id: row.id });
      if (done) toast.success(done);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{row.file_name}</span>
            {row.subject && <span className="truncate text-xs text-muted-foreground">— {row.subject}</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            {row.source === "upload" ? `Uploaded by ${row.from_address ?? "staff"}` : `From ${row.from_name ? `${row.from_name} <${row.from_address}>` : row.from_address} to ${row.mailbox}`} · {fmt(row.received_at ?? row.created_at)}
          </div>
          {row.reading?.summary && <div className="text-sm">{row.reading.summary}</div>}
        </div>
        {row.document_url ? (
          pdfUrl ? (
            <iframe title="Permit PDF" src={pdfUrl} className="h-[70vh] w-full rounded-md border border-border bg-white" />
          ) : (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          )
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            This PDF was not kept, because it didn't read as a permit. If it is one, read it again: Polaris fetches it from the mailbox.
          </div>
        )}
      </div>

      <div className="space-y-4">
        {row.status === "pending" && <ConfirmForm row={row} yachts={yachts} onChanged={onChanged} />}

        {row.status === "error" && (
          <div className="space-y-3 rounded-md border border-destructive/40 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-destructive"><AlertTriangle className="h-4 w-4" /> Couldn't read this PDF</div>
            <div className="text-xs text-muted-foreground">{row.error}</div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => act("reread", { action: "reread" }, "Read again")} disabled={!!busy}>
                {busy === "reread" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Read again
              </Button>
              <Button size="sm" variant="outline" onClick={() => act("reject", { action: "reject", as: "not_permit" })} disabled={!!busy}>Not a permit</Button>
            </div>
          </div>
        )}

        {row.status === "filed" && (
          <div className="space-y-3 rounded-md border border-border p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Filed</div>
            <div className="text-xs text-muted-foreground">
              {typeLabel(row.permit_type, row.dma_phase)} for {yachts.find((y) => y.id === row.yacht_id)?.vessel_name ?? "—"}
              {row.permit_number ? ` · ${row.permit_number}` : ""} · expires {fmtDate(row.expiry_date)}
            </div>
            {row.sharepoint_web_url ? (
              <a href={row.sharepoint_web_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <FolderOpen className="h-3.5 w-3.5" /> Open in SharePoint <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <div className="space-y-2">
                <div className="text-xs text-destructive">{row.sharepoint_error ? `Not copied to SharePoint: ${row.sharepoint_error}` : "Not copied to SharePoint."}</div>
                <Button size="sm" variant="outline" disabled={!!busy}
                  onClick={() => act("refile", { action: "refile" }, "Copied to SharePoint")}>
                  {busy === "refile" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Copy to SharePoint again
                </Button>
              </div>
            )}
          </div>
        )}

        {(row.status === "not_permit" || row.status === "rejected") && (
          <div className="space-y-3 rounded-md border border-border p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-muted-foreground">
              <XCircle className="h-4 w-4" /> {row.status === "rejected" ? "Rejected" : "Ignored — not a vessel entry or exit permit"}
            </div>
            {row.reading?.summary && <div className="text-xs text-muted-foreground">Read as: {row.reading.summary}</div>}
            <Button size="sm" variant="outline" onClick={() => act("reread", { action: "reread" }, "Moved to review")} disabled={!!busy}>
              {busy === "reread" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} It is a permit — read it again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConfirmForm({ row, yachts, onChanged }: { row: InboxRow; yachts: Yacht[]; onChanged: () => Promise<void> | void }) {
  const [yachtId, setYachtId] = useState(row.suggested_yacht_id ?? "");
  const [permitType, setPermitType] = useState(row.permit_type ?? "");
  const [phase, setPhase] = useState(row.dma_phase ?? (row.permit_type === "exit_entry" ? "Entry" : ""));
  const [permitNumber, setPermitNumber] = useState(row.permit_number ?? "");
  const [issueDate, setIssueDate] = useState(row.issue_date ?? "");
  const [expiryDate, setExpiryDate] = useState(row.expiry_date ?? "");
  const [authority, setAuthority] = useState(row.issuing_authority ?? "");
  const [existingId, setExistingId] = useState<string>(row.existing_permit_id ?? "");
  const [vesselPermits, setVesselPermits] = useState<{ id: string; permit_number: string | null; issue_date: string | null; expiry_date: string | null; dma_phase: string | null; status: string }[]>([]);
  const [toSharePoint, setToSharePoint] = useState(true);
  const [folders, setFolders] = useState<{ folder: string | null; subfolders: string[]; suggested: string } | null>(null);
  const [subfolder, setSubfolder] = useState("");
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const year = new Date(row.received_at ?? row.created_at).getFullYear();

  const yachtOptions = useMemo(() => yachts.map((y) => ({ value: y.id, label: y.vessel_name, sub: y.archive ? "archived" : undefined })), [yachts]);

  // The vessel's permits of this type — to update one instead of adding a duplicate.
  useEffect(() => {
    if (!yachtId || !permitType) { setVesselPermits([]); return; }
    let alive = true;
    let q = (supabase as any).from("permits").select("id, permit_number, issue_date, expiry_date, dma_phase, status")
      .eq("yacht_id", yachtId).eq("permit_type", permitType);
    if (PHASED.has(permitType) && phase) q = q.eq("dma_phase", phase);
    void q.order("issue_date", { ascending: false, nullsFirst: false }).limit(10).then(({ data }: any) => { if (alive) setVesselPermits(data ?? []); });
    void api<{ existingPermitId: string | null }>({ action: "match", id: row.id, yachtId, permitType, dmaPhase: phase || null })
      .then((r) => { if (alive) setExistingId(r.existingPermitId ?? ""); }).catch(() => {});
    return () => { alive = false; };
  }, [yachtId, permitType, phase, row.id]);

  // The vessel's SharePoint subfolders, with the one this permit belongs in chosen.
  useEffect(() => {
    if (!yachtId) { setFolders(null); return; }
    let alive = true;
    setFolders(null); setFoldersError(null);
    void api<{ folder: string | null; subfolders: string[]; suggested: string }>({ action: "folders", yachtId, permitType: permitType || null, dmaPhase: phase || null, year })
      .then((f) => { if (alive) { setFolders(f); setSubfolder(f.suggested); } })
      .catch((e) => { if (alive) setFoldersError(e instanceof Error ? e.message : "SharePoint unavailable"); });
    return () => { alive = false; };
  }, [yachtId, permitType, phase, year]);

  const vesselName = yachts.find((y) => y.id === yachtId)?.vessel_name ?? "";
  const existing = vesselPermits.find((p) => p.id === existingId);
  const expiryMoves = existing?.expiry_date && expiryDate && existing.expiry_date !== expiryDate;

  async function confirm() {
    if (!yachtId) { toast.error("Choose the vessel"); return; }
    if (!permitType) { toast.error("Choose the permit type"); return; }
    setSaving(true);
    try {
      const res = await api<{ updated: boolean; sharepoint: { ok: boolean; error?: string } | null }>({
        action: "confirm", id: row.id, yachtId, permitType,
        dmaPhase: PHASED.has(permitType) ? phase || null : null,
        permitNumber, issueDate: issueDate || null, expiryDate: expiryDate || null, issuingAuthority: authority,
        existingPermitId: existingId || null,
        subfolder: subfolder || null, fileToSharePoint: toSharePoint,
      });
      toast.success(`${res.updated ? "Permit updated" : "Permit added"} for ${vesselName}`);
      if (res.sharepoint && !res.sharepoint.ok) toast.warning(`Saved, but not copied to SharePoint: ${res.sharepoint.error}`, { duration: 12000 });
      else if (res.sharepoint?.ok) toast.success(`Filed in SharePoint › ${vesselName} › ${subfolder}`);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not file the permit");
    } finally {
      setSaving(false);
    }
  }

  async function reject(as: "rejected" | "not_permit") {
    setBusy(true);
    try { await api({ action: "reject", id: row.id, as }); await onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  const folderOptions = folders
    ? [...new Set([...folders.subfolders, folders.suggested])].sort((a, b) => a.localeCompare(b))
    : [];

  return (
    <div className="space-y-4 rounded-md border border-border p-3">
      {/* Vessel */}
      <div className="space-y-1.5">
        <Label>Vessel</Label>
        <SearchableSelect value={yachtId} onValueChange={setYachtId} options={yachtOptions} placeholder="Choose the vessel…" />
        {row.suggested_yacht_id && yachtId === row.suggested_yacht_id ? (
          <div className="flex items-center gap-1.5 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Suggested: {row.match_reason}</div>
        ) : (
          <div className="text-xs text-muted-foreground">
            {row.vessel_name ? <>Permit says <span className="font-medium text-foreground">{row.vessel_name}</span>. </> : null}
            {!row.suggested_yacht_id && row.match_reason}
          </div>
        )}
        {row.candidates?.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {row.candidates.map((c) => (
              <button key={c.yacht_id} onClick={() => setYachtId(c.yacht_id)} title={c.reason}
                className={cn("rounded-full border px-2 py-0.5 text-[11px]",
                  c.yacht_id === yachtId ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
                {c.vessel_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Permit details */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>Permit type</Label>
          <Select value={permitType || "__none"} onValueChange={(v) => setPermitType(v === "__none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none" disabled>Choose…</SelectItem>
              {(Object.keys(PERMIT_META) as PermitType[]).map((t) => <SelectItem key={t} value={t}>{PERMIT_META[t].label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {PHASED.has(permitType) && (
          <div className="col-span-2 space-y-1.5">
            <Label>Phase</Label>
            <Select value={phase || "Entry"} onValueChange={setPhase}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Entry">Entry</SelectItem>
                <SelectItem value="Exit">Exit</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="col-span-2 space-y-1.5">
          <Label>Permit number</Label>
          <Input value={permitNumber} onChange={(e) => setPermitNumber(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Issued</Label>
          <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Expires</Label>
          <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>{permitType === "exit_entry" ? "Port" : "Issuing authority"}</Label>
          <Input value={authority} onChange={(e) => setAuthority(e.target.value)} />
        </div>
      </div>

      {/* New or update */}
      {yachtId && permitType && (
        <div className="space-y-1.5">
          <Label>In Polaris</Label>
          <Select value={existingId || "__new"} onValueChange={(v) => setExistingId(v === "__new" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__new">Add as a new permit</SelectItem>
              {vesselPermits.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  Update {p.permit_number || "permit"} · issued {fmtDate(p.issue_date)} · expires {fmtDate(p.expiry_date)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {existingId && row.existing_permit_id === existingId && (
            <div className="text-xs text-muted-foreground">This looks like an update to a permit already in Polaris (same number or issue date).</div>
          )}
          {expiryMoves && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" /> Expiry moves from {fmtDate(existing!.expiry_date)} to {fmtDate(expiryDate)}
            </div>
          )}
        </div>
      )}

      {/* SharePoint */}
      {yachtId && (
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={toSharePoint} onCheckedChange={(v) => setToSharePoint(v === true)} />
            Copy the PDF to the vessel's SharePoint folder
          </label>
          {toSharePoint && (foldersError ? (
            <div className="text-xs text-destructive">{foldersError}</div>
          ) : !folders ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking at SharePoint…</div>
          ) : (
            <>
              <Select value={subfolder} onValueChange={setSubfolder}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {folderOptions.map((f) => (
                    <SelectItem key={f} value={f}>{f}{folders.subfolders.includes(f) ? "" : " (new folder)"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground">
                Yacht › {folders.folder ?? `${vesselName} (new folder)`} › {subfolder}
                {!folders.subfolders.includes(subfolder) && " — will be created"}
              </div>
            </>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button onClick={confirm} disabled={saving || !yachtId || !permitType}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />} Confirm &amp; file
        </Button>
        <Button variant="outline" onClick={() => reject("not_permit")} disabled={busy || saving}>Not a permit</Button>
        <Button variant="ghost" onClick={() => reject("rejected")} disabled={busy || saving}>Reject</Button>
      </div>
    </div>
  );
}

export default PermitInbox;
