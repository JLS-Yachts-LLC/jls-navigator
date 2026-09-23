/**
 * The Documents tab of a small boat record.
 *
 * DMA asks for eighteen named documents, and this screen already listed them as
 * ticks. The ticks stay — some documents are confirmed verbally, or held by the
 * client — but each one is now a place to put the actual file, so "6/18 received"
 * can be backed by something you can open.
 *
 * Files that answer no particular requirement (correspondence, a photo of the
 * hull, a receipt) go under "Other documents" rather than being turned away.
 *
 * Upload, rename, move and delete all act on one file at a time through the row
 * menu. "Move" re-files a document against a different requirement, which is the
 * only kind of move this shape has — there are no folders, because the checklist
 * is the structure.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2, Circle, Upload, MoreVertical, Pencil, FolderInput, Download,
  Trash2, Loader2, Paperclip, FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  listDocs, uploadDocs, renameDoc, moveDoc, deleteDoc, downloadDoc, markReceived,
  docLabel, fileSizeLabel, type BoatDoc,
} from "@/lib/small-boats/documents";

export type DocField = { key: string; label: string };

/** The "no specific requirement" group. Not a doc_key — that column is null. */
const OTHER = "__other__";

export function BoatDocuments({
  boatId, docFields, flags, onSetReceived,
}: {
  boatId: string | null;
  docFields: readonly DocField[];
  flags: Record<string, boolean>;
  /** Set a requirement's tick. Called on click, and on upload so it follows the file. */
  onSetReceived: (key: string, received: boolean) => void;
}) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<BoatDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<BoatDoc | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [moving, setMoving] = useState<BoatDoc | null>(null);
  const [moveTo, setMoveTo] = useState<string>(OTHER);
  const [deleting, setDeleting] = useState<BoatDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const pickers = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => { if (boatId) void load(boatId); else setDocs([]); }, [boatId]);

  async function load(id: string) {
    setLoading(true);
    try {
      setDocs(await listDocs(id));
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load the documents.");
    } finally {
      setLoading(false);
    }
  }

  /** Documents grouped by the requirement they answer; OTHER holds the rest. */
  const byKey = useMemo(() => {
    const known = new Set(docFields.map(f => f.key));
    const map: Record<string, BoatDoc[]> = { [OTHER]: [] };
    for (const f of docFields) map[f.key] = [];
    for (const d of docs) {
      const k = d.doc_key && known.has(d.doc_key) ? d.doc_key : OTHER;
      (map[k] ??= []).push(d);
    }
    return map;
  }, [docs, docFields]);

  async function onPick(key: string, files: FileList | null) {
    if (!boatId || !files?.length) return;
    setBusyKey(key);
    try {
      const { uploaded, skipped } = await uploadDocs(
        boatId, key === OTHER ? null : key, Array.from(files), user?.id ?? null,
      );
      if (uploaded) {
        toast.success(uploaded === 1 ? "Document uploaded." : `${uploaded} documents uploaded.`);
        // A file against a requirement is the strongest evidence it is in hand.
        if (key !== OTHER && !flags[key]) {
          await markReceived(boatId, key);
          onSetReceived(key, true);
        }
      }
      if (skipped && !uploaded) toast.error("Nothing was uploaded.");
      await load(boatId);
    } catch (e: any) {
      toast.error(e?.message ?? "The upload failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function doRename() {
    if (!renaming) return;
    setSaving(true);
    try {
      await renameDoc(renaming.id, renameTo);
      setRenaming(null);
      if (boatId) await load(boatId);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not rename the document.");
    } finally {
      setSaving(false);
    }
  }

  async function doMove() {
    if (!moving) return;
    setSaving(true);
    try {
      const key = moveTo === OTHER ? null : moveTo;
      await moveDoc(moving.id, key);
      setMoving(null);
      if (key && !flags[key] && boatId) {
        await markReceived(boatId, key);
        onSetReceived(key, true);
      }
      if (boatId) await load(boatId);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not move the document.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!deleting) return;
    setSaving(true);
    try {
      await deleteDoc(deleting);
      setDeleting(null);
      toast.success("Document deleted.");
      if (boatId) await load(boatId);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not delete the document.");
    } finally {
      setSaving(false);
    }
  }

  // A new boat has no id to hang files on until it is saved.
  if (!boatId) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center">
        <Paperclip className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Register the boat first, then reopen it to attach documents.
        </p>
      </div>
    );
  }

  const withFiles = docs.length;
  const groups: Array<{ key: string; label: string; ticked: boolean }> = [
    ...docFields.map(f => ({ key: f.key, label: f.label, ticked: !!flags[f.key] })),
    { key: OTHER, label: "Other documents", ticked: false },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Tick what has been received, and attach the file against it.
        </p>
        <span className="text-sm font-medium text-foreground">
          {docFields.filter(f => flags[f.key]).length} / {docFields.length} received
          {withFiles > 0 && (
            <span className="ml-2 text-muted-foreground">
              · {withFiles} file{withFiles === 1 ? "" : "s"}
            </span>
          )}
        </span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
        </div>
      )}

      <div className="divide-y divide-border rounded-md border border-border">
        {groups.map(g => {
          const files = byKey[g.key] ?? [];
          const isOther = g.key === OTHER;
          return (
            <div key={g.key} className="px-2 py-1.5">
              <div className="flex items-center gap-2">
                {isOther ? (
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <button
                    type="button"
                    onClick={() => onSetReceived(g.key, !g.ticked)}
                    title={g.ticked ? "Mark as not received" : "Mark as received"}
                    className="shrink-0"
                  >
                    {g.ticked
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      : <Circle className="h-4 w-4 text-muted-foreground/50" />}
                  </button>
                )}

                <span className={`flex-1 text-sm ${g.ticked || isOther ? "text-foreground" : "text-muted-foreground"}`}>
                  {g.label}
                  {files.length > 0 && (
                    <span className="ml-2 text-sm text-muted-foreground">({files.length})</span>
                  )}
                </span>

                <input
                  ref={el => { pickers.current[g.key] = el; }}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => { void onPick(g.key, e.target.files); e.target.value = ""; }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-sm"
                  disabled={busyKey === g.key}
                  onClick={() => pickers.current[g.key]?.click()}
                >
                  {busyKey === g.key
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Upload className="h-3.5 w-3.5" />}
                  Upload
                </Button>
              </div>

              {files.length > 0 && (
                <ul className="mb-1 ml-6 mt-1 space-y-0.5">
                  {files.map(d => (
                    <li key={d.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/60">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <button
                        type="button"
                        onClick={() => downloadDoc(d).catch(e => toast.error(e?.message ?? "Could not open the file."))}
                        className="flex-1 truncate text-left text-sm text-foreground hover:underline"
                        title={docLabel(d)}
                      >
                        {docLabel(d)}
                      </button>
                      <span className="shrink-0 text-sm text-muted-foreground">
                        {fileSizeLabel(d.file_size)}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setRenaming(d); setRenameTo(docLabel(d)); }}>
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setMoving(d); setMoveTo(d.doc_key ?? OTHER); }}>
                            <FolderInput className="mr-2 h-3.5 w-3.5" /> Move to…
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => downloadDoc(d).catch(e => toast.error(e?.message ?? "Could not download the file."))}
                          >
                            <Download className="mr-2 h-3.5 w-3.5" /> Download
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleting(d)}>
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Rename */}
      <Dialog open={!!renaming} onOpenChange={o => !o && setRenaming(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Rename document</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={renameTo}
              onChange={e => setRenameTo(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void doRename(); }}
              autoFocus
            />
            <p className="text-sm text-muted-foreground">
              This changes the name shown here. The stored file is untouched.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void doRename()} disabled={saving || !renameTo.trim()} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move */}
      <Dialog open={!!moving} onOpenChange={o => !o && setMoving(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Move document</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>File it against</Label>
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {docFields.map(f => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
                <SelectItem value={OTHER}>Other documents</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoving(null)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void doMove()} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleting} onOpenChange={o => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? docLabel(deleting) : ""} will be removed from this boat and
              the file deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); void doDelete(); }} disabled={saving}>
              {saving ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
