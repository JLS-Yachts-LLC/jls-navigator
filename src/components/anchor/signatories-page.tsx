/**
 * JLS Signatories registry — manage who can sign Anchor documents, upload their
 * signature image, and set the approver their documents route to. Feeds the DMA
 * approval workflow (approver) and auto-signature (uploaded PNG).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PenLine, Plus, Loader2, X, Pencil, UploadCloud, Trash2 } from "lucide-react";

type Sig = {
  id: string; full_name: string; email: string | null; title: string | null;
  signature_path: string | null; approver_name: string | null; approver_email: string | null; active: boolean;
};
const db = () => supabase as any;
const field = "w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function SigPreview({ path, className }: { path: string | null; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    if (!path) { setUrl(null); return; }
    db().storage.from("signatures").createSignedUrl(path, 3600).then(({ data }: any) => { if (on) setUrl(data?.signedUrl ?? null); });
    return () => { on = false; };
  }, [path]);
  if (!url) return null;
  return <img src={url} alt="signature" className={className ?? "h-10 object-contain"} />;
}

export function SignatoriesPage() {
  const [rows, setRows] = useState<Sig[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<Sig> | null>(null);

  useEffect(() => { void load(); }, []);
  async function load() {
    setLoading(true);
    const { data, error } = await db().from("jls_signatories").select("*").order("full_name");
    if (error) toast.error(error.message); else setRows(data ?? []);
    setLoading(false);
  }
  async function remove(id: string) {
    if (!confirm("Remove this signatory?")) return;
    const { error } = await db().from("jls_signatories").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Removed"); await load(); }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Anchor</div>
          <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight"><PenLine className="h-4 w-4 text-primary/80" /> Signatories</h1>
        </div>
        <Button size="sm" onClick={() => setEdit({ active: true })} className="h-9 gap-1.5"><Plus className="h-3.5 w-3.5" /> Add Signatory</Button>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
          Each JLS signatory can have an uploaded signature (applied automatically to documents they sign) and an
          approver (documents route to them for sign-off, e.g. the DMA approval chain).
        </p>
        {loading ? <div className="py-16 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.length === 0 && <div className="col-span-full rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">No signatories yet.</div>}
            {rows.map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.full_name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{[s.title, s.email].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  <div className="flex gap-0.5">
                    <button onClick={() => setEdit(s)} className="rounded p-1 text-muted-foreground/60 hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => remove(s.id)} className="rounded p-1 text-muted-foreground/60 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className="mt-3 flex h-12 items-center justify-center rounded-md border border-border/60 bg-background">
                  {s.signature_path ? <SigPreview path={s.signature_path} /> : <span className="text-[11px] text-muted-foreground/60">No signature uploaded</span>}
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">Approver: <span className="text-foreground">{s.approver_name || s.approver_email || "—"}</span></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {edit && <SignatoryDialog init={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); void load(); }} />}
    </div>
  );
}

function SignatoryDialog({ init, onClose, onDone }: { init: Partial<Sig>; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<Partial<Sig>>(init);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Sig, v: any) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!f.full_name?.trim()) { toast.error("Name is required"); return; }
    setBusy(true);
    try {
      let signature_path = f.signature_path ?? null;
      if (file) {
        if (file.type !== "image/png") { toast.error("Signature must be a PNG"); setBusy(false); return; }
        if (file.size > 5 * 1024 * 1024) { toast.error("Max 5 MB"); setBusy(false); return; }
        const path = `${f.id ?? crypto.randomUUID()}-${Date.now()}.png`;
        const { error: upErr } = await db().storage.from("signatures").upload(path, file, { upsert: true, contentType: "image/png" });
        if (upErr) { toast.error(`Upload failed: ${upErr.message}`); setBusy(false); return; }
        signature_path = path;
      }
      const row = {
        full_name: f.full_name.trim(), email: f.email || null, title: f.title || null,
        approver_name: f.approver_name || null, approver_email: f.approver_email || null,
        active: f.active ?? true, signature_path, updated_at: new Date().toISOString(),
      };
      const { error } = f.id ? await db().from("jls_signatories").update(row).eq("id", f.id) : await db().from("jls_signatories").insert(row);
      if (error) { toast.error(error.message); setBusy(false); return; }
      toast.success("Saved"); onDone();
    } catch (e: any) { toast.error(String(e?.message ?? e)); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-base font-semibold">{f.id ? "Edit Signatory" : "Add Signatory"}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted/50"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <L label="Full name"><input className={field} value={f.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} /></L>
            <L label="Title"><input className={field} value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Operations Director" /></L>
            <L label="Email"><input className={field} value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} /></L>
            <L label="Active"><select className={field} value={String(f.active ?? true)} onChange={(e) => set("active", e.target.value === "true")}><option value="true">Active</option><option value="false">Inactive</option></select></L>
            <L label="Approver name"><input className={field} value={f.approver_name ?? ""} onChange={(e) => set("approver_name", e.target.value)} /></L>
            <L label="Approver email"><input className={field} value={f.approver_email ?? ""} onChange={(e) => set("approver_email", e.target.value)} /></L>
          </div>
          <L label="Signature (PNG, transparent)">
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2.5 text-xs text-muted-foreground hover:border-primary/40">
                <UploadCloud className="h-4 w-4" />{file ? <span className="text-foreground">{file.name}</span> : <span>Upload PNG · max 5 MB</span>}
                <input type="file" accept="image/png" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
              {!file && f.signature_path && <SigPreview path={f.signature_path} className="h-9 object-contain" />}
            </div>
          </L>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={busy} className="gap-1.5">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save</Button>
        </div>
      </div>
    </div>
  );
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</label>{children}</div>;
}
