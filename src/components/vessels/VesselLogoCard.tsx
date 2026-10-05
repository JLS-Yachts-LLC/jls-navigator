/**
 * The vessel's badge / logo (yachts.logo_url) on the staff vessel page.
 *
 * Saves on its own, like the photo controls beside it. The same logo shows in the
 * vessel's Client Portal, whose users can also change it (/api/portal/vessel-logo).
 * Files live in the public vessel-images bucket under logos/<yacht_id>/.
 */
import { useState } from "react";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { updateOrThrow } from "@/lib/db-write";
import { guardUploadFile, uploadContentType } from "@/lib/upload-guard";
import { cn } from "@/lib/utils";

const BUCKET = "vessel-images";
const ACCEPT = "image/png,image/jpeg,image/webp";

/** The storage path behind a logo URL, when it is this vessel's own logo file. */
function ownLogoPath(url: string | null, yachtId: string): string | null {
  const m = url ? /\/storage\/v1\/object\/public\/vessel-images\/([^?#]+)/.exec(url) : null;
  const path = m ? decodeURIComponent(m[1]) : null;
  return path?.startsWith(`logos/${yachtId}/`) ? path : null;
}

export function VesselLogoCard({ yachtId, vesselName, logoUrl, onChanged }: {
  yachtId: string; vesselName: string; logoUrl: string | null; onChanged: (url: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function commit(next: string | null, message: string) {
    await updateOrThrow(
      supabase.from("yachts").update({ logo_url: next } as never).eq("id", yachtId).select("id"),
      "vessel",
    );
    // Only once the row has moved on — never leave it pointing at a deleted file.
    const old = ownLogoPath(logoUrl, yachtId);
    if (old && logoUrl !== next) await supabase.storage.from(BUCKET).remove([old]).catch(() => {});
    onChanged(next);
    toast.success(message);
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!guardUploadFile(file, { accepts: "Use a PNG, JPG or WebP image." })) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { toast.error("Use a PNG, JPG or WebP image."); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("That image is over 2 MB — please use a smaller one."); return; }
    setBusy(true);
    try {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `logos/${yachtId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: uploadContentType(file) });
      if (error) throw error;
      await commit(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, logoUrl ? "Logo replaced" : "Logo added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload the logo");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove the ${vesselName} logo?`)) return;
    setBusy(true);
    try {
      await commit(null, "Logo removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove the logo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold">Vessel logo</span>
        <span className="text-[10px] text-muted-foreground">Shown in the Client Portal</span>
      </div>
      {/* White tile so a dark or transparent logo reads in either theme. */}
      <div className="flex h-28 items-center justify-center bg-white p-4">
        {logoUrl ? (
          <img src={logoUrl} alt={`${vesselName} logo`} className="max-h-full max-w-full object-contain" />
        ) : (
          <ImagePlus className="h-8 w-8 text-slate-300" />
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 border-t border-border p-3">
        <label className={cn(
          "inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-accent",
          busy && "pointer-events-none opacity-50",
        )}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {logoUrl ? "Replace logo" : "Upload logo"}
          <input type="file" accept={ACCEPT} className="hidden" disabled={busy} onChange={(e) => void upload(e)} />
        </label>
        {logoUrl && (
          <button type="button" disabled={busy} onClick={() => void remove()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50">
            <Trash2 className="h-3.5 w-3.5" /> Remove logo
          </button>
        )}
      </div>
    </div>
  );
}
