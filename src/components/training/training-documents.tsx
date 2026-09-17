/**
 * Training documents — files and folders, and nothing else.
 *
 * Two buttons: Add document, Add folder. A document is a file with a name; a
 * folder is a name you can put documents inside. No expiry dates, no crew link,
 * no certificate type — the Training screen previously asked for all of that and
 * none of it was wanted here. (The full certification register, with those
 * fields, still lives on the Training Institute page.)
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
import { guardUploadFile, uploadContentType } from "@/lib/upload-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TIcon } from "@/components/polaris-ui/primitives";

export type TrainingFolder = { id: string; name: string; parent_id: string | null; yacht_id: string | null };
export type TrainingDoc = {
  id: string; folder_id: string | null; yacht_id: string | null;
  title: string | null; file_url: string; file_name: string | null; created_at: string;
};

const db = () => supabase as any;

export function TrainingDocuments({ yachtId }: { yachtId: string | null }) {
  const { user } = useAuth();
  const [folders, setFolders] = useState<TrainingFolder[]>([]);
  const [docs, setDocs] = useState<TrainingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  /** Folder ids from the root down to where we are now; empty = top level. */
  const [path, setPath] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteFolder, setDeleteFolder] = useState<TrainingFolder | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<TrainingDoc | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function addDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!guardUploadFile(file)) { e.target.value = ""; return; }
    setUploading(true);
    try {
      const path_ = `training/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("permit-documents")
        .upload(path_, file, { contentType: uploadContentType(file) });
      if (error) throw error;
      const { error: insErr } = await db().from("training_documents").insert([{
        folder_id: here, yacht_id: yachtId,
        title: file.name, file_url: storageRef("permit-documents", path_), file_name: file.name,
        created_by: user?.id ?? null,
      }]);
      if (insErr) throw insErr;
      toast.success(`${file.name} added`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
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

  return (
    <>
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
          <input ref={fileRef} type="file" className="hidden" onChange={addDocument} />
          <Button size="sm" variant="outline" className="h-9 gap-1.5" disabled={uploading}
            onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TIcon name="upload" size={14} />}
            Add document
          </Button>
          <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => { setFolderName(""); setFolderOpen(true); }}>
            <TIcon name="folder-plus" size={14} /> Add folder
          </Button>
        </div>
      </div>

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
            Use Add document to upload a file, or Add folder to organise them.
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
                      {n === 0 ? "Empty" : `${n} document${n === 1 ? "" : "s"}`}
                      {f.yacht_id === null && yachtId ? " · all vessels" : ""}
                    </span>
                  </span>
                </button>
                <button onClick={() => setDeleteFolder(f)} title="Remove folder"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pds-text-secondary)", padding: 4 }}>
                  <TIcon name="trash" size={15} />
                </button>
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
                  Added {new Date(d.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  {d.yacht_id === null && yachtId ? " · all vessels" : ""}
                </span>
              </div>
              <button onClick={() => setDeleteDoc(d)} title="Remove document"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pds-text-secondary)", padding: 4 }}>
                <TIcon name="trash" size={15} />
              </button>
            </div>
          ))}
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
    </>
  );
}
