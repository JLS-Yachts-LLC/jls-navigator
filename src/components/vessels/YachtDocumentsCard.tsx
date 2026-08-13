/**
 * Documents card on a yacht.
 *
 * The vessel equivalent of the crew Documents card: files live in Polaris storage,
 * are filed into folders, and each one is badged according to where it exists —
 * Polaris only, SharePoint only, or both. Two-way by hand:
 *   • "Send" pushes a Polaris file into the vessel's SharePoint folder.
 *   • "Import" pulls a SharePoint-only file down into Polaris.
 *   • "Sync both ways" does every outstanding one in a single pass.
 *
 * Crew paperwork is deliberately absent — it lives under the vessel's
 * "Crew Documents" subfolder and belongs to the crew profile, not here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileText, FolderPlus, Folder, FolderOpen, ChevronRight, ExternalLink, Cloud, CloudOff,
  Loader2, Trash2, UploadCloud, DownloadCloud, ShieldQuestion, GripVertical, RefreshCw,
  Upload, ArrowLeftRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SignedAnchor } from "@/components/ui/signed-file";
import { useAuth } from "@/lib/auth";
import {
  listYachtSharePointFolder, createYachtSharePointFolder,
  pushYachtDocToSharePoint, pullYachtDocFromSharePoint,
} from "@/lib/yacht-doc-sharepoint.server";

type DocRow = {
  id: string; doc_type: string | null; title: string | null;
  file_url: string | null; file_name: string | null; expiry_date: string | null;
};
type FolderRow = { id: string; name: string };
type SpItem = {
  id: string; name: string; folder: string | null; isFolder: boolean;
  webUrl: string | null; size: number | null; lastModified: string | null;
};

/** A row in the list: a Polaris document, a SharePoint-only file, or both. */
type Item = {
  docKey: string;
  label: string;
  meta: string;
  /** Polaris storage reference — absent for SharePoint-only files. */
  stored?: string;
  spName: string;
  /** SharePoint counterpart, when we found or recorded one. */
  sp?: { id: string; webUrl: string | null } | null;
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtSize = (n: number | null) =>
  n == null ? "" : n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const nameKey = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function YachtDocumentsCard({ yachtId, vesselName }: { yachtId: string; vesselName: string }) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [placement, setPlacement] = useState<Record<string, string | null>>({});
  const [links, setLinks] = useState<Record<string, { spItemId: string | null; webUrl: string | null }>>({});
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);
  const [busyKey, setBusyKey] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sp, setSp] = useState<{ loading: boolean; exists: boolean; webUrl: string | null; items: SpItem[]; error?: string }>(
    { loading: true, exists: false, webUrl: null, items: [] },
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const newFolderRef = useRef<HTMLInputElement>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  const loadPolaris = useCallback(async () => {
    const db = supabase as any;
    const [{ data: d }, { data: f }, { data: p }, { data: l }] = await Promise.all([
      db.from("yacht_documents").select("id, doc_type, title, file_url, file_name, expiry_date")
        .eq("yacht_id", yachtId).order("created_at", { ascending: false }),
      db.from("yacht_document_folders").select("id, name").eq("yacht_id", yachtId).order("name"),
      db.from("yacht_document_placements").select("doc_key, folder_id").eq("yacht_id", yachtId),
      db.from("yacht_document_sharepoint_links").select("doc_key, sp_item_id, web_url").eq("yacht_id", yachtId),
    ]);
    setDocs((d ?? []) as DocRow[]);
    setFolders((f ?? []) as FolderRow[]);
    setPlacement(Object.fromEntries(((p ?? []) as any[]).map(r => [r.doc_key, r.folder_id ?? null])));
    setLinks(Object.fromEntries(((l ?? []) as any[]).map(r => [r.doc_key, { spItemId: r.sp_item_id ?? null, webUrl: r.web_url ?? null }])));
  }, [yachtId]);

  const loadSharePoint = useCallback(async () => {
    setSp(s => ({ ...s, loading: true }));
    try {
      const res = await (listYachtSharePointFolder as any)({ data: { vesselName } });
      setSp({ loading: false, exists: !!res?.exists, webUrl: res?.webUrl ?? null, items: res?.items ?? [], error: res?.error });
    } catch (e: any) {
      setSp({ loading: false, exists: false, webUrl: null, items: [], error: e?.message ?? String(e) });
    }
  }, [vesselName]);

  useEffect(() => { void loadPolaris(); }, [loadPolaris]);
  useEffect(() => { void loadSharePoint(); }, [loadSharePoint]);

  // ── Merge both sides into one list ──────────────────────────────────────────
  const items = useMemo<Item[]>(() => {
    const spFiles = sp.items.filter(i => !i.isFolder);
    const claimed = new Set<string>();
    const out: Item[] = [];

    for (const d of docs) {
      const docKey = `doc:${d.id}`;
      const label = d.title || d.file_name || "Untitled document";
      const recorded = links[docKey];
      // Recorded push wins; otherwise match on name so files put in SharePoint by
      // hand still register as "in both" rather than showing up twice.
      let match = recorded?.spItemId ? spFiles.find(f => f.id === recorded.spItemId) : undefined;
      if (!match) {
        const want = nameKey(d.file_name || label);
        match = spFiles.find(f => !claimed.has(f.id) && nameKey(f.name) === want);
      }
      if (match) claimed.add(match.id);
      out.push({
        docKey, label,
        meta: [d.doc_type, d.expiry_date ? `Expires ${fmtDate(d.expiry_date)}` : null].filter(Boolean).join(" · ") || "Document",
        stored: d.file_url ?? undefined,
        spName: d.file_name || label,
        sp: match ? { id: match.id, webUrl: match.webUrl } : recorded?.spItemId ? { id: recorded.spItemId, webUrl: recorded.webUrl } : null,
      });
    }

    // Anything left in SharePoint exists only there — offer to import it.
    for (const f of spFiles) {
      if (claimed.has(f.id)) continue;
      out.push({
        docKey: `sp:${f.id}`,
        label: f.name,
        meta: [f.folder ? `in ${f.folder}` : null, fmtSize(f.size), f.lastModified ? fmtDate(f.lastModified) : null]
          .filter(Boolean).join(" · ") || "SharePoint file",
        spName: f.name,
        sp: { id: f.id, webUrl: f.webUrl },
      });
    }
    return out;
  }, [docs, sp.items, links]);

  const polarisOnly = items.filter(i => i.stored && !i.sp);
  const sharePointOnly = items.filter(i => !i.stored);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function upload(file: File) {
    setUploading(true);
    try {
      const path = `yachts/${yachtId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("permit-documents").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("permit-documents").getPublicUrl(path);
      const { error: insErr } = await (supabase as any).from("yacht_documents").insert([{
        yacht_id: yachtId, title: file.name, file_name: file.name, file_url: publicUrl,
        doc_type: "upload", created_by: user?.id ?? null,
      }]);
      if (insErr) throw insErr;
      toast.success(`“${file.name}” uploaded`);
      await loadPolaris();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function sendToSharePoint(it: Item) {
    if (!it.stored) return;
    setBusyKey(b => ({ ...b, [it.docKey]: true }));
    try {
      const folderId = placement[it.docKey] ?? null;
      const subfolder = folderId ? folders.find(f => f.id === folderId)?.name ?? null : null;
      const res = await (pushYachtDocToSharePoint as any)({
        data: { yachtId, docKey: it.docKey, vesselName, stored: it.stored, fileName: it.spName, subfolder },
      });
      if (!res?.ok) { toast.error(res?.error ?? "Upload to SharePoint failed"); return; }
      toast.success(`“${it.label}” sent to SharePoint`);
      await Promise.all([loadPolaris(), loadSharePoint()]);
    } finally {
      setBusyKey(b => ({ ...b, [it.docKey]: false }));
    }
  }

  async function importFromSharePoint(it: Item) {
    if (!it.sp) return;
    setBusyKey(b => ({ ...b, [it.docKey]: true }));
    try {
      const res = await (pullYachtDocFromSharePoint as any)({
        data: { yachtId, itemId: it.sp.id, fileName: it.spName },
      });
      if (!res?.ok) { toast.error(res?.error ?? "Import failed"); return; }
      toast.success(`“${it.label}” imported into Polaris`);
      await Promise.all([loadPolaris(), loadSharePoint()]);
    } finally {
      setBusyKey(b => ({ ...b, [it.docKey]: false }));
    }
  }

  /** Everything outstanding, in both directions, in one pass. */
  async function syncBothWays() {
    const toPush = polarisOnly;
    const toPull = sharePointOnly;
    if (!toPush.length && !toPull.length) { toast.info("Already in step — nothing to sync"); return; }
    if (!confirm(`Sync this vessel's documents?\n\n• ${toPush.length} to send to SharePoint\n• ${toPull.length} to import into Polaris`)) return;
    setSyncing(true);
    let pushed = 0, pulled = 0, failed = 0;
    try {
      for (const it of toPush) {
        const folderId = placement[it.docKey] ?? null;
        const subfolder = folderId ? folders.find(f => f.id === folderId)?.name ?? null : null;
        const res = await (pushYachtDocToSharePoint as any)({
          data: { yachtId, docKey: it.docKey, vesselName, stored: it.stored!, fileName: it.spName, subfolder },
        }).catch(() => ({ ok: false }));
        res?.ok ? pushed++ : failed++;
      }
      for (const it of toPull) {
        const res = await (pullYachtDocFromSharePoint as any)({
          data: { yachtId, itemId: it.sp!.id, fileName: it.spName },
        }).catch(() => ({ ok: false }));
        res?.ok ? pulled++ : failed++;
      }
      toast[failed ? "warning" : "success"](
        `Sent ${pushed}, imported ${pulled}${failed ? `, ${failed} failed` : ""}`,
      );
      await Promise.all([loadPolaris(), loadSharePoint()]);
    } finally {
      setSyncing(false);
    }
  }

  async function createFolder() {
    const name = newName.trim();
    if (!name) return;
    const { data, error } = await (supabase as any).from("yacht_document_folders")
      .insert([{ yacht_id: yachtId, name, created_by: user?.id ?? null }]).select("id, name").single();
    if (error) {
      toast.error(/duplicate|unique/i.test(error.message) ? `There is already a folder called “${name}”.` : error.message);
      return;
    }
    setFolders(f => [...f, data as FolderRow].sort((a, b) => a.name.localeCompare(b.name)));
    setOpenFolders(o => ({ ...o, [data.id]: true }));
    setNewName(""); setCreating(false);
    toast.success(`Folder “${name}” created`);
    const res = await (createYachtSharePointFolder as any)({ data: { vesselName, folderName: name } })
      .catch((e: any) => ({ ok: false, error: e?.message }));
    if (res?.ok) void loadSharePoint();
    else toast.warning(`Folder created in Polaris, but not in SharePoint: ${res?.error ?? "unknown error"}`);
  }

  async function deleteFolder(f: FolderRow) {
    const inside = items.filter(i => placement[i.docKey] === f.id).length;
    if (!confirm(`Delete the folder “${f.name}”?${inside ? ` The ${inside} file(s) inside move back to the main list.` : ""}\n\nThe SharePoint folder is left untouched.`)) return;
    const { error } = await (supabase as any).from("yacht_document_folders").delete().eq("id", f.id);
    if (error) { toast.error(error.message); return; }
    setFolders(prev => prev.filter(x => x.id !== f.id));
    setPlacement(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v === f.id ? null : v])));
    toast.success(`Folder “${f.name}” deleted`);
  }

  async function moveTo(docKey: string, folderId: string | null) {
    if ((placement[docKey] ?? null) === folderId) return;
    const previous = placement[docKey] ?? null;
    setPlacement(p => ({ ...p, [docKey]: folderId }));
    const { error } = await (supabase as any).from("yacht_document_placements").upsert(
      { yacht_id: yachtId, doc_key: docKey, folder_id: folderId, updated_at: new Date().toISOString() },
      { onConflict: "yacht_id,doc_key" },
    );
    if (error) { setPlacement(p => ({ ...p, [docKey]: previous })); toast.error(error.message); return; }
    const name = folderId ? folders.find(f => f.id === folderId)?.name : null;
    toast.success(name ? `Moved into “${name}”` : "Moved back to the main list");
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const rootItems = items.filter(i => !placement[i.docKey]);
  const inFolder = (fid: string) => items.filter(i => placement[i.docKey] === fid);

  const dropProps = (target: string | "root") => ({
    onDragOver: (e: React.DragEvent) => { if (dragKey) { e.preventDefault(); setDropTarget(target); } },
    onDragLeave: () => setDropTarget(t => (t === target ? null : t)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const key = e.dataTransfer.getData("text/polaris-doc") || dragKey;
      setDropTarget(null); setDragKey(null);
      if (key) void moveTo(key, target === "root" ? null : target);
    },
  });

  const row = (it: Item) => (
    <DocRowView
      key={it.docKey} it={it} busy={!!busyKey[it.docKey]}
      onDragStart={setDragKey} onDragEnd={() => setDragKey(null)}
      onSend={() => void sendToSharePoint(it)}
      onImport={() => void importFromSharePoint(it)}
    />
  );

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-semibold">Documents</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{items.length}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <label className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium transition hover:text-foreground", uploading && "opacity-50")}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload
            <input ref={fileRef} type="file" className="hidden" disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          </label>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-[11px]"
            onClick={() => void syncBothWays()} disabled={syncing || sp.loading}
            title="Send Polaris-only files to SharePoint and import SharePoint-only files into Polaris">
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />} Sync both ways
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-[11px]"
            onClick={() => { void loadPolaris(); void loadSharePoint(); }} disabled={sp.loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", sp.loading && "animate-spin")} /> Refresh
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-[11px]"
            onClick={() => { setCreating(true); setTimeout(() => newFolderRef.current?.focus(), 0); }}>
            <FolderPlus className="h-3.5 w-3.5" /> New folder
          </Button>
          {sp.webUrl && (
            <a href={sp.webUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:text-foreground">
              <FolderOpen className="h-3.5 w-3.5" /> SharePoint folder
            </a>
          )}
        </div>
      </div>

      {/* What's out of step */}
      {!sp.loading && (polarisOnly.length > 0 || sharePointOnly.length > 0) && (
        <p className="mb-2 text-[11.5px] text-muted-foreground">
          {polarisOnly.length > 0 && <>{polarisOnly.length} in Polaris only</>}
          {polarisOnly.length > 0 && sharePointOnly.length > 0 && " · "}
          {sharePointOnly.length > 0 && <>{sharePointOnly.length} in SharePoint only</>}
          {" — “Sync both ways” puts every file on both sides."}
        </p>
      )}
      {sp.error && (
        <p className="mb-2 flex items-center gap-1.5 text-[11px] text-amber-400/90">
          <ShieldQuestion className="h-3 w-3" /> SharePoint could not be reached — badges show Polaris only. {sp.error}
        </p>
      )}

      {creating && (
        <div className="mt-2 flex items-center gap-2">
          <Input ref={newFolderRef} value={newName} onChange={e => setNewName(e.target.value)}
            placeholder='Folder name (e.g. "Certificates")' className="h-8 text-[13px]"
            onKeyDown={e => { if (e.key === "Enter") void createFolder(); if (e.key === "Escape") { setCreating(false); setNewName(""); } }} />
          <Button size="sm" className="h-8" onClick={() => void createFolder()} disabled={!newName.trim()}>Create</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => { setCreating(false); setNewName(""); }}>Cancel</Button>
        </div>
      )}

      <div className="mt-2 space-y-1">
        {folders.map(f => {
          const inside = inFolder(f.id);
          const isOpen = openFolders[f.id];
          return (
            <div key={f.id} className={cn("rounded-lg border transition", dropTarget === f.id ? "border-primary bg-primary/10" : "border-border/60 bg-muted/20")} {...dropProps(f.id)}>
              <div className="flex items-center gap-2 px-2.5 py-2">
                <button type="button" onClick={() => setOpenFolders(o => ({ ...o, [f.id]: !isOpen }))} className="flex flex-1 items-center gap-2 text-left">
                  <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition", isOpen && "rotate-90")} />
                  {isOpen ? <FolderOpen className="h-4 w-4 text-primary/80" /> : <Folder className="h-4 w-4 text-primary/80" />}
                  <span className="text-[13px] font-medium">{f.name}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold text-muted-foreground">{inside.length}</span>
                </button>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400" title="Delete folder" onClick={() => void deleteFolder(f)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {isOpen && (
                <div className="border-t border-border/50 px-2.5">
                  {inside.length === 0
                    ? <p className="py-2.5 text-[11.5px] text-muted-foreground">Empty — drag a document here to file it.</p>
                    : <div className="divide-y divide-border/40">{inside.map(row)}</div>}
                </div>
              )}
            </div>
          );
        })}

        <div className={cn("rounded-lg border border-transparent transition", dropTarget === "root" && "border-primary bg-primary/10")} {...dropProps("root")}>
          {items.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">
              No documents yet. Upload one, or press Sync to bring in whatever is already in SharePoint.
            </p>
          ) : rootItems.length === 0 ? (
            <p className="py-3 text-[11.5px] text-muted-foreground">Every document is filed in a folder — drop one here to move it back out.</p>
          ) : (
            <div className="divide-y divide-border/50">{rootItems.map(row)}</div>
          )}
        </div>
      </div>

      {sp.loading && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking SharePoint…
        </p>
      )}
    </section>
  );
}

function DocRowView({
  it, busy, onDragStart, onDragEnd, onSend, onImport,
}: {
  it: Item; busy: boolean;
  onDragStart: (k: string) => void; onDragEnd: () => void;
  onSend: () => void; onImport: () => void;
}) {
  const inPolaris = !!it.stored;
  const inSharePoint = !!it.sp;
  const both = inPolaris && inSharePoint;

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData("text/polaris-doc", it.docKey); e.dataTransfer.effectAllowed = "move"; onDragStart(it.docKey); }}
      onDragEnd={onDragEnd}
      className="group flex cursor-grab items-center gap-3 py-3 active:cursor-grabbing"
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground/70" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{it.label}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{it.meta}</div>
      </div>

      {both ? (
        <span title="In Polaris and SharePoint" className="inline-flex shrink-0 items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-400">
          <Cloud className="h-3 w-3" /> Both
        </span>
      ) : inPolaris ? (
        <span title="Held in Polaris only — not yet in SharePoint" className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold text-muted-foreground">
          <CloudOff className="h-3 w-3" /> Polaris only
        </span>
      ) : (
        <span title="In SharePoint only — not yet imported into Polaris" className="inline-flex shrink-0 items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-sky-400">
          <Cloud className="h-3 w-3" /> SharePoint only
        </span>
      )}

      {inPolaris && !inSharePoint && (
        <Button size="sm" variant="outline" className="h-6 shrink-0 gap-1 px-1.5 text-[10.5px]" onClick={onSend} disabled={busy}
          title="Upload this file to the vessel's SharePoint folder">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <UploadCloud className="h-3 w-3" />} Send
        </Button>
      )}
      {!inPolaris && (
        <Button size="sm" variant="outline" className="h-6 shrink-0 gap-1 px-1.5 text-[10.5px]" onClick={onImport} disabled={busy}
          title="Copy this SharePoint file into Polaris">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <DownloadCloud className="h-3 w-3" />} Import
        </Button>
      )}

      {it.stored ? (
        <SignedAnchor stored={it.stored}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:text-foreground aria-disabled:opacity-50">
          <ExternalLink className="h-3 w-3" /> Open
        </SignedAnchor>
      ) : it.sp?.webUrl ? (
        <a href={it.sp.webUrl} target="_blank" rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:text-foreground">
          <ExternalLink className="h-3 w-3" /> Open
        </a>
      ) : null}
    </div>
  );
}
