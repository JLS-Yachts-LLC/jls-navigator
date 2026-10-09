/**
 * Logistics mobile app — the small set of phone-sized controls every screen in
 * it shares: the screen frame (title, back, pinned footer), a labelled field, a
 * suggest-as-you-type input and the camera/gallery photo picker.
 *
 * Inputs are 16px (text-base) on purpose: iOS Safari zooms the page when a
 * smaller field is focused, which on a warehouse floor means losing the form.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Camera, ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const inputCls =
  "h-12 w-full rounded-lg border border-border bg-background px-3 text-base outline-none " +
  "transition focus:border-primary focus:ring-1 focus:ring-primary/40 disabled:opacity-60";

export function Lbl({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[14px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** A full-height phone screen: title bar, scrolling body, footer pinned to the bottom. */
export function Screen({
  title, subtitle, onBack, right, footer, children,
}: {
  title: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode;
  footer?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border/70 bg-card/95 px-3 py-2.5 backdrop-blur">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-accent">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[20px] font-bold leading-tight">{title}</div>
          {subtitle && <div className="truncate text-[14px] text-muted-foreground">{subtitle}</div>}
        </div>
        {right}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-md space-y-4 px-4 py-4">{children}</div>
      </main>
      {footer && (
        <footer className="border-t border-border/70 bg-card/95 px-4 py-3 backdrop-blur"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <div className="mx-auto max-w-md">{footer}</div>
        </footer>
      )}
    </div>
  );
}

/** Free text that offers what has been used before — a suggestion, never a constraint. */
export function SuggestInput({
  value, onChange, options, placeholder, id,
}: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; id?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options.slice(0, 8);
    const starts = options.filter((o) => o.toLowerCase().startsWith(q));
    const has = options.filter((o) => !o.toLowerCase().startsWith(q) && o.toLowerCase().includes(q));
    return [...starts, ...has].slice(0, 8);
  }, [options, value]);

  useEffect(() => {
    const away = (e: MouseEvent | TouchEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("touchstart", away); };
  }, []);

  return (
    <div ref={box} className="relative">
      <input id={id} className={inputCls} value={value} placeholder={placeholder} autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && matches.length > 0 && !(matches.length === 1 && matches[0].toLowerCase() === value.trim().toLowerCase()) && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-popover py-1 shadow-lg">
          {matches.map((m) => (
            <li key={m}>
              <button type="button" className="block w-full px-3 py-2.5 text-left text-base hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(m); setOpen(false); }}>
                {m}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Capture or Upload Image" — a live camera shot or a file from the gallery. */
export function PhotoField({
  file, onChange, label = "Capture or Upload Image",
}: { file: File | null; onChange: (f: File | null) => void; label?: string }) {
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f: File | undefined) => { if (f) onChange(f); };

  return (
    <div>
      <span className="mb-1 block text-[14px] font-medium text-muted-foreground">{label}</span>
      <div className="relative flex min-h-[148px] items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/20">
        {preview ? (
          <>
            <img src={preview} alt="" className="max-h-64 w-full object-contain" />
            <button type="button" onClick={() => onChange(null)} aria-label="Remove photo"
              className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 shadow">
              <X className="h-5 w-5" />
            </button>
          </>
        ) : (
          <div className="flex gap-3 p-4">
            <button type="button" onClick={() => cam.current?.click()}
              className="flex h-12 items-center gap-2 rounded-lg bg-primary px-4 text-[15px] font-semibold text-primary-foreground">
              <Camera className="h-5 w-5" /> Camera
            </button>
            <button type="button" onClick={() => gal.current?.click()}
              className="flex h-12 items-center gap-2 rounded-lg border border-border px-4 text-[15px] font-semibold">
              <ImagePlus className="h-5 w-5" /> Gallery
            </button>
          </div>
        )}
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={gal} type="file" accept="image/*" className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

/** Red Cancel / green Save, as in the layouts. */
export function FooterButtons({
  onCancel, onSave, saving, saveLabel = "SAVE", cancelLabel = "Cancel", disabled,
}: { onCancel: () => void; onSave: () => void; saving?: boolean; saveLabel?: string; cancelLabel?: string; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button type="button" onClick={onCancel} disabled={saving}
        className="h-12 rounded-lg bg-[#E05252] text-[16px] font-semibold text-white disabled:opacity-50">{cancelLabel}</button>
      <button type="button" onClick={onSave} disabled={saving || disabled}
        className="h-12 rounded-lg bg-[#3FA76A] text-[16px] font-semibold text-white disabled:opacity-50">
        {saving ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}

/** A bottom sheet over the current screen — pickers, confirmations and short forms. */
export function Sheet({ title, onClose, children, sticky }: { title: string; onClose: () => void; children: React.ReactNode; sticky?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !sticky) onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose, sticky]);
  return (
    // `sticky` sheets hold typing (a shelf's limits, an item's edit): tapping the dim area must not throw that away.
    <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/60 sm:items-center" onClick={sticky ? undefined : onClose}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className="max-h-[85dvh] w-full max-w-md space-y-3 overflow-y-auto overscroll-contain rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl"
        style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-[19px] font-bold">{title}</div>
        {children}
      </div>
    </div>
  );
}
