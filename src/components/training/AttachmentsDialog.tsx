/**
 * Training Institute — the files held against one training record or student.
 *
 * Opened from the paperclip on a row. Upload, rename, move to another record or
 * student, and delete — the four the Institute asked for, in one dialog so the
 * Records tab and the Students tab behave identically.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, Upload, Paperclip, Pencil, FolderInput, Trash2, X, Check, Search,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { guardUploadFile } from "@/lib/upload-guard";
import { SignedAnchor } from "@/components/ui/signed-file";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  listAttachments, uploadAttachment, renameAttachment, moveAttachment,
  deleteAttachment, type AttachmentOwner, type TrainingAttachment,
} from "@/lib/training/attachments";

/** Somewhere a file can be moved to — a training record, or a student. */
export type MoveTarget = { id: string; label: string; sub?: string };

export function AttachmentsDialog({
  open, onClose, ownerType, ownerId, ownerLabel, moveTargets, onChanged,
}: {
  open: boolean;
  onClose: () => void;
  ownerType: AttachmentOwner;
  ownerId: string;
  /** Whose files these are — shown in the title so a stray click is obvious. */
  ownerLabel: string;
  /** The other rows on this tab, for Move. Excludes the current owner. */
  moveTargets: MoveTarget[];
  /** Fires after any change, so the caller can refresh its paperclip counts. */
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const [files, setFiles] = useState<TrainingAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [moving, setMoving] = useState<TrainingAttachment | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      setFiles(await listAttachments(ownerType, ownerId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the files");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && ownerId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ownerType, ownerId]);

  /** Several files at once — picking them one at a time is the slow way. */
  async function upload(picked: FileList | null) {
    const list = Array.from(picked ?? []);
    if (!list.length) return;
    setBusy(true);
    let added = 0;
    try {
      for (const file of list) {
        if (!guardUploadFile(file)) continue;
        try {
          await uploadAttachment(ownerType, ownerId, file, user?.id ?? null);
          added += 1;
        } catch (e) {
          // One bad file must not abandon the rest of the selection.
          toast.error(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
        }
      }
      if (added) toast.success(`${added} file${added === 1 ? "" : "s"} uploaded`);
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function commitRename(a: TrainingAttachment) {
    const name = draftName.trim();
    setRenaming(null);
    if (!name || name === a.file_name) return;
    try {
      await renameAttachment(a, name);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
    }
  }

  async function doMove(target: MoveTarget) {
    if (!moving) return;
    const a = moving;
    setMoving(null);
    try {
      await moveAttachment(a, ownerType, target.id);
      toast.success(`“${a.file_name}” moved to ${target.label}`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Move failed");
    }
  }

  async function remove(a: TrainingAttachment) {
    if (!confirm(`Delete “${a.file_name}”? This cannot be undone.`)) return;
    try {
      await deleteAttachment(a);
      toast.success(`“${a.file_name}” deleted`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[22px]">
            Files — {ownerLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[14px] text-muted-foreground">
            {loading ? "Loading…"
              : files.length === 0 ? "Nothing attached yet."
              : `${files.length} file${files.length === 1 ? "" : "s"}`}
          </p>
          <input ref={inputRef} type="file" multiple className="hidden"
            onChange={(e) => void upload(e.target.files)} />
          <button onClick={() => inputRef.current?.click()} disabled={busy}
            className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[15px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
          </button>
        </div>

        <div className="max-h-[50vh] overflow-auto rounded-md border border-border">
          {loading ? (
            <div className="flex h-28 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <p className="px-4 py-8 text-center text-[15px] text-muted-foreground">
              Upload certificates, assessments or ID scans and they stay with this{" "}
              {ownerType === "student" ? "student" : "training record"}.
            </p>
          ) : (
            <ul className="divide-y divide-border/40">
              {files.map((a) => (
                <li key={a.id} className="flex items-center gap-2 px-3 py-2">
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />

                  {renaming === a.id ? (
                    <input autoFocus value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => void commitRename(a)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-primary bg-background px-2 py-1 text-[15px] outline-none" />
                  ) : (
                    <SignedAnchor stored={a.storage_ref}
                      className="min-w-0 flex-1 truncate text-[15px] text-primary hover:underline"
                      title={a.file_name}>
                      {a.file_name}
                    </SignedAnchor>
                  )}

                  <span className="shrink-0 text-[14px] text-muted-foreground">
                    {new Date(a.created_at).toLocaleDateString("en-GB")}
                  </span>

                  <RowAction label="Rename" icon={Pencil}
                    onClick={() => { setRenaming(a.id); setDraftName(a.file_name); }} />
                  <RowAction label="Move" icon={FolderInput}
                    disabled={moveTargets.length === 0}
                    onClick={() => setMoving(a)} />
                  <RowAction label="Delete" icon={Trash2} danger onClick={() => void remove(a)} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {moving && (
          <MovePicker
            fileName={moving.file_name}
            targets={moveTargets}
            ownerType={ownerType}
            onPick={(t) => void doMove(t)}
            onCancel={() => setMoving(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RowAction({
  label, icon: Icon, onClick, danger, disabled,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button onClick={onClick} title={label} aria-label={label} disabled={disabled}
      className={cn("shrink-0 rounded p-1.5 text-muted-foreground transition disabled:opacity-30",
        danger ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-accent hover:text-foreground")}>
      <Icon className="h-4 w-4" />
    </button>
  );
}

/**
 * Where to move a file to.
 *
 * Searchable, because a hundred students is a long list and scrolling one to
 * find a name is how a file ends up on the wrong record a second time.
 */
function MovePicker({
  fileName, targets, ownerType, onPick, onCancel,
}: {
  fileName: string;
  targets: MoveTarget[];
  ownerType: AttachmentOwner;
  onPick: (t: MoveTarget) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? targets.filter((t) => `${t.label} ${t.sub ?? ""}`.toLowerCase().includes(needle))
      : targets;
    return list.slice(0, 50);
  }, [targets, q]);

  return (
    <div className="rounded-md border border-border bg-muted/15 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-[15px]">
          Move <span className="font-medium">“{fileName}”</span> to another{" "}
          {ownerType === "student" ? "student" : "training record"}:
        </p>
        <button onClick={onCancel} title="Cancel move"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={ownerType === "student" ? "Search students…" : "Search records…"}
          className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-[15px] outline-none focus:border-primary" />
      </div>

      <ul className="max-h-48 overflow-auto rounded border border-border/60 bg-background">
        {matches.length === 0 ? (
          <li className="px-3 py-3 text-center text-[14px] text-muted-foreground">Nothing matches that.</li>
        ) : matches.map((t) => (
          <li key={t.id}>
            <button onClick={() => onPick(t)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent">
              <Check className="h-3.5 w-3.5 shrink-0 text-transparent" />
              <span className="min-w-0 flex-1 truncate text-[15px]">{t.label}</span>
              {t.sub && <span className="shrink-0 truncate text-[14px] text-muted-foreground">{t.sub}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
