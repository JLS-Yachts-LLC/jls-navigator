/**
 * Training documents — files and folders, and nothing else.
 *
 * Add document takes one file or many; Add folder either creates an empty folder
 * by name, or takes a whole folder from your computer and recreates it here with
 * its subfolders intact. Dropping files or folders onto the page does the same.
 * No expiry dates, no crew link, no certificate type — the Training screen
 * previously asked for all of that and none of it was wanted here. (The full
 * certification register, with those fields, still lives on the Training
 * Institute page.)
 *
 * Vessel scope comes from the picker already on the screen rather than from a
 * field in the form: whatever vessel is selected when you add something is what
 * it belongs to, and "All vessels" means everyone sees it. A vessel view shows
 * its own items plus the shared ones, so a fleet-wide handbook appears
 * everywhere without being filed twice.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { storageRef } from "@/lib/signed-url";
import { SignedAnchor } from "@/components/ui/signed-file";
import { uploadRejectionReason, uploadContentType } from "@/lib/upload-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TIcon } from "@/components/polaris-ui/primitives";
import {
  renameDoc, renameFolder, moveDoc, moveFolder, downloadDoc, downloadFolder,
  duplicateDoc, duplicateFolder, selfAndDescendants, folderPath,
  type Folder as OpFolder, type Doc as OpDoc,
} from "@/lib/training/documents";

export type TrainingFolder = OpFolder;
export type TrainingDoc = OpDoc;

/** What a row action is working on: a folder, or a document. */
type Target =
  | { kind: "folder"; folder: TrainingFolder }
  | { kind: "doc"; doc: TrainingDoc };

const targetName = (t: Target) =>
  t.kind === "folder" ? t.folder.name : (t.doc.title ?? t.doc.file_name ?? "Document");

const db = () => supabase as any;

/** A file to add, and the folder path it should land in ("" = right here). */
type Picked = { file: File; dir: string };

/** How many uploads run at once. Sequential is too slow for a folder of scans;
 *  unbounded would open hundreds of sockets and stall the browser. */
const UPLOAD_CONCURRENCY = 4;

/** Strip the leading folder-name segment browsers put on webkitRelativePath. */
function dirOf(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i === -1 ? "" : relPath.slice(0, i);
}

/**
 * Walk a dropped FileSystemEntry tree into a flat list of files plus every
 * directory seen (so an empty subfolder is still recreated).
 *
 * readEntries() returns at most ~100 entries per call and must be called again
 * until it returns none — reading once silently truncates a large folder.
 */
async function walkEntry(entry: any, prefix: string, out: Picked[], dirs: Set<string>): Promise<void> {
  if (!entry) return;
  if (entry.isFile) {
    const file: File = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ file, dir: prefix });
    return;
  }
  if (!entry.isDirectory) return;
  const dir = prefix ? `${prefix}/${entry.name}` : entry.name;
  dirs.add(dir);
  const reader = entry.createReader();
  for (;;) {
    const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
    if (!batch.length) break;
    for (const child of batch) await walkEntry(child, dir, out, dirs);
  }
}

export function TrainingDocuments({ yachtId }: { yachtId: string | null }) {
  const { user } = useAuth();
  const [folders, setFolders] = useState<TrainingFolder[]>([]);
  const [docs, setDocs] = useState<TrainingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  /** Folder ids from the root down to where we are now; empty = top level. */
  const [path, setPath] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteFolder, setDeleteFolder] = useState<TrainingFolder | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<TrainingDoc | null>(null);
  // Rename / Move share one target, since only one can be open at a time.
  const [renaming, setRenaming] = useState<Target | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moving, setMoving] = useState<Target | null>(null);
  /** Long-running row action, e.g. zipping a folder — shown on the row itself. */
  const [working, setWorking] = useState<{ id: string; label: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  /** Nested dragenter/dragleave fire constantly; count them so the overlay is stable. */
  const dragDepth = useRef(0);

  const here = path.length ? path[path.length - 1] : null;

  const load = useCallback(async () => {
    setLoading(true);
    // A vessel sees its own items AND the fleet-wide ones; "All vessels" sees all.
    const scope = (q: any) => (yachtId ? q.or(`yacht_id.eq.${yachtId},yacht_id.is.null`) : q);
    const [f, d] = await Promise.all([
      scope(db().from("training_document_folders").select("id, name, parent_id, yacht_id").order("name")),
      scope(db().from("training_documents").select("*").order("created_at", { ascending: false })),
    ]);
    setFolders((f.data ?? []) as TrainingFolder[]);
    setDocs((d.data ?? []) as TrainingDoc[]);
    setLoading(false);
  }, [yachtId]);

  useEffect(() => { void load(); }, [load]);
  // Switching vessel can leave us inside a folder that view cannot see.
  useEffect(() => { setPath([]); }, [yachtId]);

  const childFolders = folders.filter((f) => (f.parent_id ?? null) === here);
  const childDocs = docs.filter((d) => (d.folder_id ?? null) === here);

  /**
   * Add files, recreating any folder structure they carry.
   *
   * Folders are matched by name under their parent before being created, so
   * dropping the same folder twice merges into it rather than making a second
   * copy with the same name.
   */
  async function addFiles(picked: Picked[], extraDirs: string[] = []) {
    if (!picked.length && !extraDirs.length) return;

    // Refuse anything the bucket would reject BEFORE uploading, and collect the
    // reasons — one toast per bad file would be unusable for a large folder.
    const skipped: string[] = [];
    const usable = picked.filter((p) => {
      const reason = uploadRejectionReason(p.file);
      if (reason) { skipped.push(reason); return false; }
      return true;
    });

    setProgress({ done: 0, total: usable.length });
    let added = 0;
    const failed: string[] = [];

    try {
      // ── Folders first, so every file has somewhere to go ──
      const idByDir = new Map<string, string | null>([["", here]]);
      // Local mirror of what exists, so folders created in this run are reused
      // by later files without a round trip.
      const known = folders.map((f) => ({ id: f.id, name: f.name, parent_id: f.parent_id }));

      async function ensureDir(dir: string): Promise<string | null> {
        if (idByDir.has(dir)) return idByDir.get(dir)!;
        const i = dir.lastIndexOf("/");
        const parentDir = i === -1 ? "" : dir.slice(0, i);
        const name = i === -1 ? dir : dir.slice(i + 1);
        const parentId = await ensureDir(parentDir);

        const existing = known.find((f) => f.name === name && (f.parent_id ?? null) === parentId);
        if (existing) { idByDir.set(dir, existing.id); return existing.id; }

        const { data, error } = await db().from("training_document_folders")
          .insert([{ name, parent_id: parentId, yacht_id: yachtId, created_by: user?.id ?? null }])
          .select("id, name, parent_id").single();
        if (error) throw error;
        known.push({ id: data.id, name: data.name, parent_id: data.parent_id });
        idByDir.set(dir, data.id);
        return data.id;
      }

      // Deepest paths last so parents always exist first.
      const allDirs = [...new Set([...usable.map((p) => p.dir), ...extraDirs])]
        .filter(Boolean)
        .sort((a, b) => a.split("/").length - b.split("/").length);
      for (const d of allDirs) await ensureDir(d);

      // ── Then the files, a few at a time ──
      let cursor = 0;
      async function worker() {
        for (;;) {
          const i = cursor++;
          if (i >= usable.length) return;
          const { file, dir } = usable[i];
          try {
            const key = `training/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`;
            const { error } = await supabase.storage.from("permit-documents")
              .upload(key, file, { contentType: uploadContentType(file) });
            if (error) throw error;
            const { error: insErr } = await db().from("training_documents").insert([{
              folder_id: idByDir.get(dir) ?? here,
              yacht_id: yachtId,
              title: file.name,
              file_url: storageRef("permit-documents", key),
              file_name: file.name,
              created_by: user?.id ?? null,
            }]);
            if (insErr) throw insErr;
            added++;
          } catch (e) {
            failed.push(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
          } finally {
            setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, usable.length || 1) }, worker));

      // One summary, not one message per file.
      const parts: string[] = [];
      if (added) parts.push(`${added} document${added === 1 ? "" : "s"} added`);
      if (allDirs.length) parts.push(`${allDirs.length} folder${allDirs.length === 1 ? "" : "s"} created`);
      if (parts.length) toast.success(parts.join(", "));
      if (skipped.length) {
        toast.warning(
          skipped.length === 1 ? skipped[0] : `${skipped.length} files were skipped`,
          skipped.length > 1 ? { description: skipped.slice(0, 4).join("\n") } : undefined,
        );
      }
      if (failed.length) {
        toast.error(
          failed.length === 1 ? failed[0] : `${failed.length} files failed to upload`,
          failed.length > 1 ? { description: failed.slice(0, 4).join("\n") } : undefined,
        );
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add these files");
    } finally {
      setProgress(null);
    }
  }

  /** Files chosen from the plain picker — no folder structure. */
  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void addFiles(files.map((file) => ({ file, dir: "" })));
  }

  /** A folder chosen from the picker — webkitRelativePath carries the structure. */
  function onPickDirectory(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void addFiles(files.map((file) => ({
      file,
      dir: dirOf((file as any).webkitRelativePath ?? ""),
    })));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    // Read the DataTransfer SYNCHRONOUSLY — it is emptied the moment this
    // handler yields, so collecting entries after an await returns nothing.
    const entries = Array.from(e.dataTransfer.items ?? [])
      .map((i: any) => (typeof i.webkitGetAsEntry === "function" ? i.webkitGetAsEntry() : null))
      .filter(Boolean);
    const plain = Array.from(e.dataTransfer.files ?? []);

    void (async () => {
      if (entries.length) {
        const out: Picked[] = [];
        const dirs = new Set<string>();
        try {
          for (const entry of entries) await walkEntry(entry, "", out, dirs);
          await addFiles(out, [...dirs]);
          return;
        } catch {
          // Fall through to the plain file list below.
        }
      }
      if (plain.length) await addFiles(plain.map((file) => ({ file, dir: "" })));
    })();
  }

  async function createFolder() {
    const name = folderName.trim();
    if (!name) return;
    setBusy(true);
    const { error } = await db().from("training_document_folders").insert([{
      name, parent_id: here, yacht_id: yachtId, created_by: user?.id ?? null,
    }]);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setFolderOpen(false);
    setFolderName("");
    toast.success(`Folder “${name}” created`);
    await load();
  }

  async function removeFolder() {
    if (!deleteFolder) return;
    const { error } = await db().from("training_document_folders").delete().eq("id", deleteFolder.id);
    setDeleteFolder(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Folder removed");
    await load();
  }

  async function removeDoc() {
    if (!deleteDoc) return;
    const { error } = await db().from("training_documents").delete().eq("id", deleteDoc.id);
    setDeleteDoc(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Document removed");
    await load();
  }

  // ── Row actions ─────────────────────────────────────────────────────────────

  function openRename(t: Target) {
    setRenameValue(targetName(t));
    setRenaming(t);
  }

  async function saveRename() {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name) return;
    setBusy(true);
    try {
      if (renaming.kind === "folder") await renameFolder(renaming.folder.id, name);
      else await renameDoc(renaming.doc.id, name);
      setRenaming(null);
      toast.success("Renamed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rename");
    } finally { setBusy(false); }
  }

  async function doMove(destination: string | null) {
    if (!moving) return;
    setBusy(true);
    try {
      if (moving.kind === "folder") await moveFolder(moving.folder.id, destination, folders);
      else await moveDoc(moving.doc.id, destination);
      setMoving(null);
      const where = destination ? `“${folders.find((f) => f.id === destination)?.name}”` : "All documents";
      toast.success(`Moved to ${where}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move");
    } finally { setBusy(false); }
  }

  async function doDownload(t: Target) {
    const id = t.kind === "folder" ? t.folder.id : t.doc.id;
    setWorking({ id, label: "Preparing…" });
    try {
      if (t.kind === "doc") {
        await downloadDoc(t.doc);
      } else {
        const n = await downloadFolder(t.folder, folders, docs,
          (done, total) => setWorking({ id, label: `Zipping ${done} of ${total}…` }));
        toast.success(`${n} document${n === 1 ? "" : "s"} downloaded`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally { setWorking(null); }
  }

  async function doDuplicate(t: Target) {
    const id = t.kind === "folder" ? t.folder.id : t.doc.id;
    setWorking({ id, label: "Duplicating…" });
    try {
      if (t.kind === "doc") {
        await duplicateDoc(t.doc, user?.id ?? null);
        toast.success("Document duplicated");
      } else {
        const r = await duplicateFolder(t.folder, folders, docs, user?.id ?? null,
          (done, total) => setWorking({ id, label: `Copying ${done} of ${total}…` }));
        toast.success(`Folder duplicated — ${r.folders} folder${r.folders === 1 ? "" : "s"}, ${r.documents} document${r.documents === 1 ? "" : "s"}`);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not duplicate");
    } finally { setWorking(null); }
  }

  /** Destinations for the move dialog — a folder can't go inside itself. */
  function moveTargets(t: Target): TrainingFolder[] {
    const banned = t.kind === "folder" ? selfAndDescendants(t.folder.id, folders) : new Set<string>();
    return folders
      .filter((f) => !banned.has(f.id))
      .map((f) => ({ f, path: folderPath(f.id, folders) }))
      .sort((a, b) => a.path.localeCompare(b.path))
      .map(({ f }) => f);
  }

  /** The row's ⋯ menu — same actions for a folder and a document. */
  function RowMenu({ target }: { target: Target }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button title="More"
            className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pds-text-secondary)", padding: 4 }}>
            <TIcon name="dots" size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openRename(target)}>Rename</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMoving(target)}>Move to folder…</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void doDownload(target)}>Download</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void doDuplicate(target)}>Duplicate</DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => target.kind === "folder" ? setDeleteFolder(target.folder) : setDeleteDoc(target.doc)}>
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  /** How many documents sit in this folder and everything under it. */
  function countIn(folderId: string): number {
    const stack = [folderId];
    const ids = new Set<string>([folderId]);
    while (stack.length) {
      const id = stack.pop()!;
      for (const f of folders) if (f.parent_id === id && !ids.has(f.id)) { ids.add(f.id); stack.push(f.id); }
    }
    return docs.filter((d) => d.folder_id && ids.has(d.folder_id)).length;
  }

  const crumbs = path.map((id) => folders.find((f) => f.id === id)).filter(Boolean) as TrainingFolder[];
  const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
    borderBottom: "1px solid var(--pds-border-soft)",
  };
  const nameStyle: React.CSSProperties = {
    fontSize: "var(--pds-fs-body)", color: "var(--pds-text)", fontWeight: 500,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  };
  const subStyle: React.CSSProperties = {
    fontSize: "var(--pds-fs-label)", color: "var(--pds-text-secondary)", marginTop: 2,
  };
  const uploading = progress !== null;

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); dragDepth.current++; setDragOver(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => { e.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragOver(false); } }}
      onDrop={onDrop}
      style={{ position: "relative", minHeight: 220 }}
    >
      {/* Toolbar: where you are, and the two things you can do. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: "var(--pds-fs-body)" }}>
          <button onClick={() => setPath([])}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: path.length ? "var(--pds-accent)" : "var(--pds-text-secondary)" }}>
            All documents
          </button>
          {crumbs.map((c, i) => (
            <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <TIcon name="chevron-right" size={13} color="var(--pds-text-secondary)" />
              <button onClick={() => setPath(path.slice(0, i + 1))}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                         color: i === crumbs.length - 1 ? "var(--pds-text)" : "var(--pds-accent)" }}>
                {c.name}
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={onPickFiles} />
          {/* webkitdirectory turns this into a folder picker. Not in the React
              types, and unsupported on Firefox — hence the plain multi-file
              picker above as the everywhere-option. */}
          <input ref={dirRef} type="file" multiple className="hidden" onChange={onPickDirectory}
            {...({ webkitdirectory: "", directory: "" } as any)} />

          <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={uploading}
            onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TIcon name="upload" size={14} />}
            Add document
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={uploading}>
                <TIcon name="folder-plus" size={14} /> Add folder
                <TIcon name="chevron-down" size={12} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setFolderName(""); setFolderOpen(true); }}>
                New empty folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => dirRef.current?.click()}>
                Upload a folder from my computer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {uploading && (
        <div style={{ marginBottom: 12, fontSize: "var(--pds-fs-label)", color: "var(--pds-text-secondary)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Uploading {progress.done} of {progress.total}…
          </div>
          <div style={{ height: 3, borderRadius: 2, background: "var(--pds-surface-3)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                          background: "var(--pds-accent)", transition: "width .2s" }} />
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : childFolders.length === 0 && childDocs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "36px 16px" }}>
          <TIcon name="folder" size={40} color="rgba(69,144,186,0.35)" style={{ display: "block", margin: "0 auto 12px" }} />
          <p style={{ fontSize: "var(--pds-fs-body)", color: "var(--pds-text-secondary)", margin: "0 0 4px" }}>
            {here ? "This folder is empty." : "No documents yet."}
          </p>
          <p style={{ fontSize: "var(--pds-fs-label)", color: "var(--pds-text-secondary)", margin: 0 }}>
            Drag files or a folder in, or use the buttons above.
          </p>
        </div>
      ) : (
        <div>
          {/* Folders first, then documents — the order every file browser uses. */}
          {childFolders.map((f) => {
            const n = countIn(f.id);
            return (
              <div key={f.id} style={rowStyle} className="group">
                <button onClick={() => setPath([...path, f.id])}
                  style={{ display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", padding: 0, cursor: "pointer", flex: 1, minWidth: 0, textAlign: "left" }}>
                  <TIcon name="folder" size={18} color="var(--pds-gold-light)" />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ ...nameStyle, display: "block" }}>{f.name}</span>
                    <span style={{ ...subStyle, display: "block" }}>
                      {working?.id === f.id ? working.label : (
                        <>
                          {n === 0 ? "Empty" : `${n} document${n === 1 ? "" : "s"}`}
                          {f.yacht_id === null && yachtId ? " · all vessels" : ""}
                        </>
                      )}
                    </span>
                  </span>
                </button>
                {working?.id === f.id
                  ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--pds-text-secondary)", margin: 4 }} />
                  : <RowMenu target={{ kind: "folder", folder: f }} />}
              </div>
            );
          })}

          {childDocs.map((d) => (
            <div key={d.id} style={rowStyle} className="group">
              <TIcon name="file-description" size={18} color="var(--pds-text-secondary)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <SignedAnchor stored={d.file_url} style={{ ...nameStyle, display: "block", textDecoration: "none" }}>
                  {d.title ?? d.file_name ?? "Document"}
                </SignedAnchor>
                <span style={{ ...subStyle, display: "block" }}>
                  {working?.id === d.id ? working.label : (
                    <>
                      Added {new Date(d.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      {d.yacht_id === null && yachtId ? " · all vessels" : ""}
                    </>
                  )}
                </span>
              </div>
              {working?.id === d.id
                ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--pds-text-secondary)", margin: 4 }} />
                : <RowMenu target={{ kind: "doc", doc: d }} />}
            </div>
          ))}
        </div>
      )}

      {/* Drop target — covers the card only while something is being dragged over it. */}
      {dragOver && !uploading && (
        <div style={{
          position: "absolute", inset: -8, borderRadius: 10, zIndex: 5,
          border: "2px dashed var(--pds-accent)", background: "rgba(0,0,0,0.55)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
          pointerEvents: "none",
        }}>
          <TIcon name="upload" size={28} color="var(--pds-accent)" />
          <span style={{ fontSize: "var(--pds-fs-body)", color: "var(--pds-text)" }}>
            Drop to add {crumbs.length ? `to “${crumbs[crumbs.length - 1].name}”` : "here"}
          </span>
          <span style={{ fontSize: "var(--pds-fs-label)", color: "var(--pds-text-secondary)" }}>
            Folders keep their structure
          </span>
        </div>
      )}

      {/* Add folder — one field, because a folder is just a name. */}
      <Dialog open={folderOpen} onOpenChange={(o) => !o && setFolderOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{here ? `New folder in “${crumbs[crumbs.length - 1]?.name}”` : "New folder"}</DialogTitle>
          </DialogHeader>
          <Input autoFocus value={folderName} placeholder="Folder name"
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void createFolder(); }} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void createFolder()} disabled={!folderName.trim() || busy}>
              {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename — one field, same dialog for a folder or a document. */}
      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename {renaming?.kind === "folder" ? "folder" : "document"}</DialogTitle>
          </DialogHeader>
          <Input autoFocus value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void saveRename(); }} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void saveRename()} disabled={!renameValue.trim() || busy}>
              {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />} Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move — pick a destination from the whole tree, indented by depth. */}
      <Dialog open={!!moving} onOpenChange={(o) => !o && setMoving(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move “{moving ? targetName(moving) : ""}”</DialogTitle>
          </DialogHeader>
          <div style={{ maxHeight: 300, overflowY: "auto", margin: "4px 0" }}>
            <button onClick={() => void doMove(null)} disabled={busy}
              className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-accent/40 disabled:opacity-50">
              <span className="inline-flex items-center gap-2"><TIcon name="folder" size={15} /> All documents</span>
            </button>
            {moving && moveTargets(moving).map((f) => {
              const path = folderPath(f.id, folders);
              const depth = path.split("/").length - 1;
              return (
                <button key={f.id} onClick={() => void doMove(f.id)} disabled={busy}
                  className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-accent/40 disabled:opacity-50"
                  style={{ paddingLeft: 8 + depth * 16 }}>
                  <span className="inline-flex items-center gap-2">
                    <TIcon name="folder" size={15} /> {f.name}
                  </span>
                </button>
              );
            })}
            {moving && moveTargets(moving).length === 0 && (
              <p style={{ fontSize: "var(--pds-fs-label)", color: "var(--pds-text-secondary)", padding: "8px 2px", margin: 0 }}>
                No other folders yet — create one first, or move this to All documents.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoving(null)} disabled={busy}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteFolder} onOpenChange={(o) => !o && setDeleteFolder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{deleteFolder?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFolder && countIn(deleteFolder.id) > 0
                ? `This folder and the ${countIn(deleteFolder.id)} document(s) inside it will be removed.`
                : "This folder will be removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeFolder()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteDoc} onOpenChange={(o) => !o && setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this document?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteDoc?.title ?? deleteDoc?.file_name}” will be removed from Training.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeDoc()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
