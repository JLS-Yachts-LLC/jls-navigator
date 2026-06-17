import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, FileText, Trash2, Loader2, Upload, ExternalLink, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadCrewDocToSharePoint } from "@/lib/visa-sharepoint.server";
import { SignedAnchor } from "@/components/ui/signed-file";

/** Read a File's bytes as a base64 string (no data: prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error ?? new Error("File read failed"));
    r.readAsDataURL(file);
  });
}

type CrewLite = { id: string; first_name: string; last_name: string; yacht_id?: string | null };
type CrewDoc = {
  id: string;
  crew_member_id: string;
  doc_type: string;
  title: string | null;
  file_url: string | null;
  file_name: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
};

const DOC_TYPES = ["Passport", "Visa", "Seaman's Book", "STCW Certificate", "Medical Certificate", "Contract", "Photo", "Other"];

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  return Math.round((new Date(d + "T00:00").getTime() - Date.now()) / 86_400_000);
}

export function CrewDocumentsPage() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<CrewDoc[]>([]);
  const [crew, setCrew] = useState<CrewLite[]>([]);
  const [yachts, setYachts] = useState<{ id: string; vessel_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filterCrew, setFilterCrew] = useState("all");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CrewDoc | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    crew_member_id: "", doc_type: "Passport", title: "",
    issue_date: "", expiry_date: "", notes: "", file_url: "", file_name: "",
  });

  useEffect(() => { void load(); void loadCrew(); void loadYachts(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await fetchAllRows(() => (supabase as any).from("crew_documents").select("*").order("expiry_date", { ascending: true, nullsFirst: false }));
    if (error) toast.error(error.message);
    else setDocs(data ?? []);
    setLoading(false);
  }
  async function loadCrew() {
    const { data } = await fetchAllRows(() => (supabase as any).from("crew_members").select("id, first_name, last_name, yacht_id").order("last_name"));
    setCrew(data ?? []);
  }
  async function loadYachts() {
    const { data } = await fetchAllRows(() => supabase.from("yachts").select("id, vessel_name").order("vessel_name"));
    setYachts((data ?? []) as { id: string; vessel_name: string }[]);
  }

  function openNew() {
    setForm({ crew_member_id: "", doc_type: "Passport", title: "", issue_date: "", expiry_date: "", notes: "", file_url: "", file_name: "" });
    setOpen(true);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `crew/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("permit-documents").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("permit-documents").getPublicUrl(path);
      setForm((f) => ({ ...f, file_url: publicUrl, file_name: file.name }));

      // All crew documents are mirrored into SharePoint under
      //   Shared Documents / Yacht / {vessel} / Crew Documents / {crew} / {file}
      // (best-effort — the Supabase copy is the source of truth).
      try {
        const member = crew.find((c) => c.id === form.crew_member_id);
        const vesselName = member?.yacht_id
          ? (yachts.find((y) => y.id === member.yacht_id)?.vessel_name ?? null)
          : null;
        const crewName = member ? `${member.first_name} ${member.last_name}`.trim() : "Unknown Crew";
        const base64 = await fileToBase64(file);
        await (uploadCrewDocToSharePoint as any)({
          data: { vesselName, crewName, fileName: file.name, contentType: file.type, base64 },
        });
        toast.success("File attached & synced to SharePoint");
      } catch (spErr) {
        toast.warning(`File attached, but SharePoint sync failed: ${spErr instanceof Error ? spErr.message : "unknown error"}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!form.crew_member_id) { toast.error("Select a crew member"); return; }
    setBusy(true);
    try {
      const { error } = await (supabase as any).from("crew_documents").insert([{
        crew_member_id: form.crew_member_id,
        doc_type: form.doc_type,
        title: form.title || null,
        file_url: form.file_url || null,
        file_name: form.file_name || null,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        notes: form.notes || null,
        created_by: user?.id,
      }]);
      if (error) throw error;
      toast.success("Document added");
      setOpen(false);
      void load();
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await (supabase as any).from("crew_documents").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success("Document removed"); void load(); }
    setDeleteTarget(null);
  }

  const crewName = (id: string) => { const c = crew.find((m) => m.id === id); return c ? `${c.first_name} ${c.last_name}` : "—"; };
  const fmtDate = (d: string | null) => d ? new Date(d + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const filtered = useMemo(() => docs.filter((d) => {
    if (filterCrew !== "all" && d.crew_member_id !== filterCrew) return false;
    if (q.trim()) {
      const s = q.toLowerCase();
      if (![crewName(d.crew_member_id), d.doc_type, d.title, d.file_name].join(" ").toLowerCase().includes(s)) return false;
    }
    return true;
  }), [docs, q, filterCrew, crew]);

  const expiringSoon = docs.filter((d) => { const n = daysUntil(d.expiry_date); return n !== null && n >= 0 && n <= 30; }).length;
  const expired = docs.filter((d) => { const n = daysUntil(d.expiry_date); return n !== null && n < 0; }).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Crew &amp; Immigration</div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight">Crew Documents</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents…" className="h-9 w-56 pl-8 text-sm" />
          </div>
          <Select value={filterCrew} onValueChange={setFilterCrew}>
            <SelectTrigger className="h-9 w-44 text-xs"><SelectValue placeholder="All Crew" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Crew</SelectItem>
              {crew.map((c) => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={openNew} className="h-9 gap-1.5 px-3.5 font-medium shadow-sm"><Plus className="h-3.5 w-3.5" /> Add Document</Button>
        </div>
      </header>

      <div className="flex items-center gap-4 border-b border-border/40 bg-muted/10 px-6 py-2 text-xs">
        <span className="text-muted-foreground">{docs.length} documents</span>
        {expiringSoon > 0 && <span className="text-amber-500 font-medium">{expiringSoon} expiring ≤ 30d</span>}
        {expired > 0 && <span className="text-destructive font-medium">{expired} expired</span>}
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
            <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-display text-base font-semibold">{q || filterCrew !== "all" ? "No documents match" : "No crew documents yet"}</p>
            <p className="text-sm text-muted-foreground mt-1">Upload passports, certificates and other crew documents in one secure vault.</p>
            {!q && filterCrew === "all" && <Button onClick={openNew} className="mt-4 gap-1.5"><Plus className="h-4 w-4" /> Add First Document</Button>}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                {["Crew Member", "Type", "Document", "Issued", "Expiry", "File", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.map((d) => {
                  const days = daysUntil(d.expiry_date);
                  return (
                    <tr key={d.id} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                      <td className="px-4 py-3 font-medium">{crewName(d.crew_member_id)}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{d.doc_type}</span></td>
                      <td className="px-4 py-3 text-foreground/80">{d.title ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{fmtDate(d.issue_date)}</td>
                      <td className="px-4 py-3 tabular-nums">
                        <span className={cn(days !== null && days < 0 ? "text-destructive" : days !== null && days <= 30 ? "text-amber-500" : "text-foreground/70")}>
                          {fmtDate(d.expiry_date)}
                        </span>
                        {days !== null && days >= 0 && days <= 30 && <span className="ml-1 text-[10px] text-amber-500">({days}d)</span>}
                      </td>
                      <td className="px-4 py-3">
                        {d.file_url ? (
                          <SignedAnchor stored={d.file_url} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            <ExternalLink className="h-3 w-3" /> View
                          </SignedAnchor>
                        ) : <span className="text-xs text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive" onClick={() => setDeleteTarget(d)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Crew Document</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Crew Member <span className="text-destructive">*</span></Label>
                <Select value={form.crew_member_id || "__none"} onValueChange={(v) => setForm((f) => ({ ...f, crew_member_id: v === "__none" ? "" : v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="— Select —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Select —</SelectItem>
                    {crew.map((c) => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Document Type</Label>
                <Select value={form.doc_type} onValueChange={(v) => setForm((f) => ({ ...f, doc_type: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Title / Reference</Label>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="h-8" placeholder="e.g. A12345678" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Issue Date</Label>
                <Input type="date" value={form.issue_date} onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))} className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Expiry Date</Label>
                <Input type="date" value={form.expiry_date} onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))} className="h-8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">File</Label>
              <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} className="h-8 w-full gap-1.5 text-xs">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {form.file_name ? <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" /> {form.file_name}</span> : "Upload file"}
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="resize-none text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy || uploading} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Add Document</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>This document record will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
