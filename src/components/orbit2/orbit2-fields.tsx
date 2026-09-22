/**
 * Orbit 2 — the form controls the Project, Bunkering and NOC screens share.
 *
 * Typeahead, labelled field, team picker, attachment slot and note log. They
 * live together because the spec asks for the same behaviours in three places
 * and the point of Smart Auto-Suggest is that the same name is offered
 * everywhere it could be typed.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip, X, Upload, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { guardUploadFile, uploadContentType } from "@/lib/upload-guard";
import { storageRef } from "@/lib/signed-url";
import { SignedAnchor } from "@/components/ui/signed-file";
import { ORBIT2_TEAM } from "./orbit2-constants";
import { ORBIT2_BUCKET, matchSuggestions, isExisting } from "./orbit2-data";

// ── Layout ──────────────────────────────────────────────────────────────────

export function Field({
  label, children, hint, className,
}: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[14px] font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[14px] text-muted-foreground/80">{hint}</span>}
    </label>
  );
}

/** One input style everywhere, at the platform's 16px minimum for form fields. */
export const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-base " +
  "outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/40 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

// ── Smart Auto-Suggest ──────────────────────────────────────────────────────

/**
 * Free-text input that offers what has been entered before.
 *
 * The suggestion list is advice, not a constraint — a genuinely new client must
 * still be typeable. What it does do is say when a value already exists, which
 * is what stops the same boat being logged under three spellings.
 */
export function Typeahead({
  value, onChange, options, placeholder, disabled, id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => matchSuggestions(options, value), [options, value]);
  const known = value.trim() !== "" && isExisting(options, value);

  useEffect(() => {
    function away(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <input
        id={id}
        className={inputCls}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { setFocused(true); setOpen(true); }}
        onBlur={() => setFocused(false)}
      />
      {known && !focused && (
        <Check className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500"
          aria-label="Matches an existing entry" />
      )}
      {open && matches.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover py-1 shadow-lg">
          {matches.map((m) => (
            <li key={m}>
              <button type="button"
                className="block w-full px-3 py-1.5 text-left text-[15px] hover:bg-accent"
                onMouseDown={(e) => { e.preventDefault(); onChange(m); setOpen(false); }}>
                {m}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Assign Team ─────────────────────────────────────────────────────────────

/** A closed checklist — only the eight authorised names, per spec. */
export function TeamPicker({
  value, onChange, disabled,
}: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const toggle = (name: string) =>
    onChange(value.includes(name) ? value.filter((v) => v !== name) : [...value, name]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {ORBIT2_TEAM.map((name) => {
        const on = value.includes(name);
        return (
          <button key={name} type="button" disabled={disabled} onClick={() => toggle(name)}
            className={cn(
              "rounded-full border px-3 py-1 text-[14px] font-medium transition disabled:opacity-60",
              on ? "border-primary bg-primary/15 text-primary"
                 : "border-border text-muted-foreground hover:bg-accent")}>
            {name}
          </button>
        );
      })}
    </div>
  );
}

// ── Attachments ─────────────────────────────────────────────────────────────

export type UploadedFile = { id: string; file_name: string; storage_ref: string };

/**
 * One attachment slot — Supplier Quote, Invoice, a general document, an image.
 *
 * PDF and images only, per spec, and the platform upload guard applies on top
 * (size cap and type allow-list). The file goes to Storage and only its
 * reference is handed back; the caller decides where that reference is recorded.
 */
export function FileSlot({
  label, files, onUpload, onRemove, accept = "application/pdf,image/*", disabled,
}: {
  label: string;
  files: UploadedFile[];
  onUpload: (file: File, ref: string) => Promise<void> | void;
  onRemove?: (f: UploadedFile) => void;
  accept?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!guardUploadFile(file, { accepts: "Use a PDF or an image." })) return;
    if (!/^(application\/pdf|image\/)/.test(file.type || "")) {
      toast.error("Only PDF and image files can be attached here.");
      return;
    }
    setBusy(true);
    try {
      // Random prefix: two people uploading "invoice.pdf" must not overwrite
      // each other, and the original name is kept alongside for display.
      const path = `orbit2/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await supabase.storage
        .from(ORBIT2_BUCKET)
        .upload(path, file, { contentType: uploadContentType(file), upsert: false });
      if (error) throw error;
      await onUpload(file, storageRef(ORBIT2_BUCKET, path));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-md border border-border bg-muted/10 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[14px] font-medium text-muted-foreground">{label}</span>
        <button type="button" disabled={disabled || busy} onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[14px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Attach
        </button>
      </div>
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])} />
      {files.length === 0 ? (
        <p className="text-[14px] text-muted-foreground/70">None attached</p>
      ) : (
        <ul className="space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <SignedAnchor stored={f.storage_ref} className="flex-1 truncate text-[14px] text-primary hover:underline"
                title={f.file_name}>
                {f.file_name}
              </SignedAnchor>
              {onRemove && (
                <button type="button" onClick={() => onRemove(f)} title="Remove attachment"
                  className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Note log ────────────────────────────────────────────────────────────────

/**
 * Remarks and Team Comments.
 *
 * Every entry carries its author and the moment it was written, prepended by the
 * system rather than typed, so the log reads as a record instead of a notepad.
 * Existing entries are never editable — that is what makes it worth reading.
 */
export function NoteLog({
  title, notes, onAdd, placeholder, readOnly, emptyText,
}: {
  title: string;
  notes: { id: string; author: string; body: string; created_at: string }[];
  onAdd?: (body: string) => Promise<void>;
  placeholder?: string;
  readOnly?: boolean;
  emptyText?: string;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const body = draft.trim();
    if (!body || !onAdd) return;
    setBusy(true);
    try { await onAdd(body); setDraft(""); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="mb-1 text-[14px] font-medium text-muted-foreground">{title}</div>
      <div className="rounded-md border border-border bg-background">
        <ul className="max-h-44 divide-y divide-border/40 overflow-auto">
          {notes.length === 0 ? (
            <li className="px-3 py-2.5 text-[14px] text-muted-foreground/70">
              {emptyText ?? "Nothing logged yet."}
            </li>
          ) : notes.map((n) => (
            <li key={n.id} className="px-3 py-2 text-[14px] leading-relaxed">
              <span className="font-semibold">{n.author}</span>
              <span className="text-muted-foreground"> [{stamp(n.created_at)}]: </span>
              <span className="whitespace-pre-wrap">{n.body}</span>
            </li>
          ))}
        </ul>
        {!readOnly && onAdd && (
          <div className="flex gap-2 border-t border-border/60 p-2">
            <input className={cn(inputCls, "py-1.5 text-[15px]")} value={draft} placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }} />
            <button type="button" onClick={() => void add()} disabled={busy || !draft.trim()}
              className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-[15px] font-medium text-primary-foreground disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** DD/MM/YYYY – HH:MM, as the spec's example log lines read. */
export function stamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB")} – ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}
