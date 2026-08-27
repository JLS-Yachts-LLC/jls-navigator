/**
 * Photo upload + display for Crew Care records (vehicles and driver avatars).
 *
 * Files go to the existing permit-documents bucket, so no new bucket or storage
 * policy is needed. Two shapes:
 *   • <Avatar>       — round driver photo, falls back to initials
 *   • <PhotoField>   — upload/replace/remove control for a form
 *
 * Images are resized client-side before upload: a 6 MB phone photo becomes
 * ~80 KB, which matters because these render in list views where a dozen load
 * at once.
 */
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Camera, Loader2, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BUCKET = "permit-documents";
/** Long edge, in pixels — plenty for a list thumbnail or a detail card. */
const MAX_EDGE = 900;

/** Draw the image into a canvas at a bounded size and re-encode as JPEG. */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file; // no canvas (very old browser) — upload the original
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob(b => resolve(b ?? file), "image/jpeg", 0.82),
  );
}

/** Upload and return the public URL. `folder` e.g. "drivers/photos". */
export async function uploadPhoto(file: File, folder: string, id: string): Promise<string> {
  const body = await shrink(file);
  const path = `${folder}/${id}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    upsert: true, contentType: "image/jpeg",
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// ── Round avatar (driver lists) ────────────────────────────────────────────────

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";

export function Avatar({ src, name, size = 32, className }: {
  src?: string | null; name: string; size?: number; className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const px = { width: size, height: size };
  if (src && !failed) {
    return (
      <img
        src={src} alt={name} style={px} loading="lazy"
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full border border-border object-cover", className)}
      />
    );
  }
  return (
    <div style={px}
      className={cn("flex shrink-0 items-center justify-center rounded-full border border-border bg-primary/15 font-semibold text-primary", className)}>
      {name.trim()
        ? <span style={{ fontSize: Math.max(9, size * 0.36) }}>{initialsOf(name)}</span>
        : <User style={{ width: size * 0.5, height: size * 0.5 }} />}
    </div>
  );
}

// ── Form field ────────────────────────────────────────────────────────────────

export function PhotoField({
  label, value, onChange, folder, recordId, round = false, disabled,
}: {
  label: string;
  value: string | null;
  /** Called with the new URL, or null when removed. Persisting is the caller's job. */
  onChange: (url: string | null) => void;
  folder: string;
  /** Used in the filename; a temporary id is fine for an unsaved record. */
  recordId: string;
  round?: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadPhoto(file, folder, recordId));
      toast.success("Photo uploaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not upload the photo");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = ""; // let the same file be re-picked
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex items-center gap-3">
        {value ? (
          <img src={value} alt=""
            className={cn("border border-border object-cover", round ? "h-16 w-16 rounded-full" : "h-16 w-24 rounded-lg")} />
        ) : (
          <div className={cn("flex items-center justify-center border border-dashed border-border text-muted-foreground/50",
            round ? "h-16 w-16 rounded-full" : "h-16 w-24 rounded-lg")}>
            <Camera className="h-5 w-5" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs transition hover:text-foreground",
            (busy || disabled) && "pointer-events-none opacity-50")}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            {value ? "Replace photo" : "Add photo"}
            <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden"
              disabled={busy || disabled}
              onChange={e => void pick(e.target.files?.[0] ?? null)} />
          </label>
          {value && (
            <button type="button" onClick={() => onChange(null)}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition hover:text-red-400">
              <Trash2 className="h-3 w-3" /> Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
