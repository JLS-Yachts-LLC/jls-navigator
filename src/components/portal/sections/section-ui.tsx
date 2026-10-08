/**
 * Shared building blocks for the portal's On board sections (Jobs / Charter / ISM):
 * cards, headers, badges, and the one add/edit form every record kind uses.
 * Kept in step with the portal's Card/typography so a section drops straight in.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Camera, CheckCircle2, Loader2, Paperclip, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { portalFetch } from "@/lib/portal/portal-fetch";
import type { OnboardKind } from "@/lib/portal/onboard";

/** Call /api/portal/onboard; throws the server's message on failure. */
export async function onboardRequest(kind: OnboardKind, init: RequestInit & { id?: string; action?: string } = {}) {
  const qs = new URLSearchParams({ kind });
  if (init.id) qs.set("id", init.id);
  if (init.action) qs.set("action", init.action);
  const res = await portalFetch(`/api/portal/onboard?${qs}`, {
    ...init,
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong — please try again.");
  return body;
}

export type FormField = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "date" | "number" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  /** Take the full row instead of half of it. */
  wide?: boolean;
  /** Show only when this returns true for the current form values. */
  when?: (form: Record<string, string>) => boolean;
};

const inputCls =
  "w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm outline-none transition focus:border-primary/60 disabled:opacity-50";

/**
 * Add or edit one record. `initial` null = add. The form sends every field it
 * shows (blank = cleared); the server checks each one against its own list.
 */
export function RecordFormModal({ title, kind, fields, initial, onClose, onSaved, onDelete, deleteLabel = "Delete" }: {
  title: string; kind: OnboardKind; fields: FormField[];
  initial: Record<string, any> | null;
  onClose: () => void; onSaved: () => void;
  onDelete?: () => Promise<void>; deleteLabel?: string;
}) {
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, initial?.[f.key] == null ? "" : String(initial[f.key])])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const shown = fields.filter((f) => !f.when || f.when(form));
  const missing = shown.some((f) => f.required && !form[f.key]?.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const body: Record<string, string | null> = {};
    for (const f of shown) body[f.key] = form[f.key]?.trim() || null;
    try {
      await onboardRequest(kind, { method: initial?.id ? "PATCH" : "POST", id: initial?.id, body: JSON.stringify(body) });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onDelete || !confirm(`${deleteLabel}? This can't be undone.`)) return;
    setBusy(true); setError(null);
    try { await onDelete(); } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {shown.map((f) => (
              <div key={f.key} className={cn(f.wide || f.type === "textarea" ? "col-span-2" : "col-span-2 sm:col-span-1")}>
                <label htmlFor={`f-${f.key}`} className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  {f.label}{f.required && <span className="text-primary"> *</span>}
                </label>
                {f.type === "select" ? (
                  <select id={`f-${f.key}`} className={inputCls} value={form[f.key]} onChange={set(f.key)} required={f.required}>
                    {!f.required && <option value="">—</option>}
                    {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea id={`f-${f.key}`} className={cn(inputCls, "min-h-[84px]")} maxLength={4000}
                            value={form[f.key]} onChange={set(f.key)} placeholder={f.placeholder} />
                ) : (
                  <input id={`f-${f.key}`} className={inputCls} type={f.type ?? "text"} required={f.required}
                         min={f.type === "number" ? 0 : undefined} step={f.type === "number" ? "any" : undefined}
                         maxLength={f.type === "text" || !f.type ? 160 : undefined}
                         value={form[f.key]} onChange={set(f.key)} placeholder={f.placeholder} />
                )}
              </div>
            ))}
          </div>
          {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
          <div className="flex gap-2">
            {initial?.id && onDelete && (
              <button type="button" onClick={() => void remove()} disabled={busy}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground transition hover:border-red-500/40 hover:text-red-300 disabled:opacity-50">
                <Trash2 className="h-4 w-4" /> {deleteLabel}
              </button>
            )}
            <button type="submit" disabled={busy || missing}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {initial?.id ? "Save changes" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export type UploadTarget = "checklist_photo" | "drill_file" | "job_photo" | "ism_cert" | "client_document" | "task_file" | "inventory_file" | "expense_receipt";

/** Upload one file through /api/portal/upload; throws the server's message on failure. */
export async function uploadPortalFile(fields: { target: UploadTarget; file: File; id?: string; item?: string; title?: string; doc_type?: string }) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v != null) form.append(k, v as string | Blob);
  const res = await portalFetch("/api/portal/upload", { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Could not upload that file.");
  return body;
}

/** Open a file from portal_files (signed, short-lived, logged). */
export async function openPortalFile(id: string) {
  const res = await portalFetch(`/api/portal/documents/open?type=portal_file&id=${id}`, { redirect: "follow" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "That file could not be opened.");
  window.open(res.url, "_blank", "noreferrer");
}

type PortalFile = { id: string; file_name: string; item_key: string | null; created_at: string; uploaded_by_name: string | null };

/**
 * The files attached to one record (optionally one item within it), with an
 * Add button when the person can edit. Photos only where `accept` says so.
 */
export function AttachedFiles({ refTable, refId, itemKey = null, target, canEdit, accept = "image/*", label = "Add photo" }: {
  refTable: string; refId: string; itemKey?: string | null; target: UploadTarget; canEdit: boolean; accept?: string; label?: string;
}) {
  const [files, setFiles] = useState<PortalFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = `f-${refId}-${itemKey ?? "all"}`;

  const load = async () => {
    let q = (supabase as any).from("portal_files").select("id, file_name, item_key, created_at, uploaded_by_name")
      .eq("ref_table", refTable).eq("ref_id", refId);
    q = itemKey ? q.eq("item_key", itemKey) : q;
    const { data } = await q.order("created_at");
    setFiles(data ?? []);
  };
  useEffect(() => { void load(); }, [refTable, refId, itemKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setError(null);
    try { await uploadPortalFile({ target, file, id: refId, item: itemKey ?? undefined }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not upload."); }
    finally { setBusy(false); }
  };

  if (!files.length && !canEdit) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {files.map((f, i) => (
        <button key={f.id} type="button" onClick={() => void openPortalFile(f.id).catch((e) => alert(e.message))}
                title={`${f.file_name}${f.uploaded_by_name ? ` · ${f.uploaded_by_name}` : ""}`}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/40 px-2 py-1 text-[11px] text-muted-foreground transition hover:text-foreground">
          <Paperclip className="h-3 w-3" /> {files.length > 3 ? `${i + 1}` : f.file_name.length > 18 ? `${f.file_name.slice(0, 16)}…` : f.file_name}
        </button>
      ))}
      {canEdit && (
        <label htmlFor={inputId}
               className={cn("inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-primary/50 hover:text-foreground", busy && "pointer-events-none opacity-50")}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />} {label}
          <input id={inputId} type="file" accept={accept} capture={accept === "image/*" ? "environment" : undefined} className="sr-only" onChange={(e) => void onPick(e)} />
        </label>
      )}
      {error && <span className="text-[11px] text-red-300">{error}</span>}
    </div>
  );
}

/** The section's "+ Add" button. */
export function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:brightness-110">
      <Plus className="h-4 w-4" /> {children}
    </button>
  );
}

export function SectionCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card/80 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.5)]", className)}>
      {children}
    </div>
  );
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-lg font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionLoading() {
  return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
}

export function SectionEmpty({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <SectionCard className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <Icon className="mb-3 h-7 w-7 text-muted-foreground/40" />
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </SectionCard>
  );
}

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

type Tone = "green" | "amber" | "red" | "sky" | "slate";
const TONE: Record<Tone, string> = {
  green: "bg-emerald-500/15 text-emerald-400",
  amber: "bg-amber-500/15 text-amber-400",
  red: "bg-red-500/15 text-red-400",
  sky: "bg-sky-500/15 text-sky-400",
  slate: "bg-slate-500/15 text-slate-300",
};
export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", TONE[tone])}>{label}</span>;
}

/** Days until a date (negative = past). */
export const daysUntil = (d: string | null | undefined): number | null =>
  d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;
