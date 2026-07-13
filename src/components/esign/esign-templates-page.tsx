import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { doSendForSignature } from "@/lib/esign.server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileStack, Plus, Search, Loader2, Send, Upload, UploadCloud, FileText, Download, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Template = {
  id: string; name: string; description: string | null; category: string | null;
  file_path: string; file_name: string; signature_fields: any; updated_at: string;
};

const SIG_POSITIONS = ["bottom-right", "bottom-left", "bottom-center", "top-right", "top-left", "middle-center"];
const EMPTY_NEW = { name: "", category: "", description: "", sigPage: "1", sigPos: "bottom-right" };
const EMPTY_USE = { title: "", signer_name: "", signer_email: "", message: "" };

export function EsignTemplatesPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  // New template
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_NEW);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  // Use template
  const [useTarget, setUseTarget] = useState<Template | null>(null);
  const [useForm, setUseForm] = useState(EMPTY_USE);
  const [using, setUsing] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any).from("esign_templates")
      .select("id, name, description, category, file_path, file_name, signature_fields, updated_at")
      .order("category", { nullsFirst: true }).order("name");
    if (error) toast.error(error.message);
    setRows((data ?? []) as Template[]);
    setLoading(false);
  }

  async function createTemplate() {
    if (!form.name.trim()) { toast.error("Template name is required"); return; }
    if (!file) { toast.error("Attach a PDF"); return; }
    setBusy(true);
    try {
      const path = `templates/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const up = await supabase.storage.from("esign-documents").upload(path, file, { contentType: file.type || "application/pdf" });
      if (up.error) throw up.error;
      const { error } = await (supabase as any).from("esign_templates").insert([{
        name: form.name.trim(),
        category: form.category.trim() || null,
        description: form.description.trim() || null,
        file_path: path,
        file_name: file.name,
        signature_fields: [{ page: Number(form.sigPage) || 1, pos: form.sigPos }],
        created_by: user?.id ?? null,
      }]);
      if (error) throw error;
      toast.success("Template added");
      setOpen(false); setForm(EMPTY_NEW); setFile(null);
      void load();
    } catch (e: any) { toast.error(e.message ?? "Failed to add template"); }
    finally { setBusy(false); }
  }

  function openUse(t: Template) {
    setUseTarget(t);
    setUseForm({ ...EMPTY_USE, title: t.name });
  }

  async function useTemplate(sendNow: boolean) {
    if (!useTarget) return;
    if (!useForm.title.trim()) { toast.error("Title is required"); return; }
    if (!useForm.signer_name.trim() || !useForm.signer_email.trim()) { toast.error("Signer name and email are required"); return; }
    setUsing(true);
    try {
      // Copy the template PDF to a fresh originals/ path so the document is independent.
      const newPath = `originals/${crypto.randomUUID()}-${useTarget.file_name.replace(/[^\w.\-]+/g, "_")}`;
      const copy = await (supabase.storage.from("esign-documents") as any).copy(useTarget.file_path, newPath);
      if (copy.error) throw copy.error;

      const { data: inserted, error } = await (supabase as any).from("esign_documents").insert([{
        title: useForm.title.trim(),
        description: useTarget.description,
        signer_name: useForm.signer_name.trim(),
        signer_email: useForm.signer_email.trim(),
        message: useForm.message.trim() || null,
        file_path: newPath,
        file_name: useTarget.file_name,
        status: "draft",
        signature_fields: useTarget.signature_fields ?? [{ page: 1, pos: "bottom-right" }],
        created_by: user?.id ?? null,
      }]).select("id").single();
      if (error) throw error;

      if (sendNow) {
        await doSendForSignature({ data: { documentId: inserted.id, senderEmail: user?.email } } as any);
        toast.success(`Document created from template and sent to ${useForm.signer_email}`);
      } else {
        toast.success("Draft created from template — find it under Documents");
      }
      setUseTarget(null); setUseForm(EMPTY_USE);
    } catch (e: any) { toast.error(e.message ?? "Failed to create from template"); }
    finally { setUsing(false); }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await (supabase.storage.from("esign-documents") as any).remove([deleteTarget.file_path]).catch(() => {});
      const { error } = await (supabase as any).from("esign_templates").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      setRows(prev => prev.filter(r => r.id !== deleteTarget.id));
      toast.success(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
    } catch (e: any) { toast.error(e.message ?? "Delete failed"); }
    finally { setDeleting(false); }
  }

  function download(t: Template) {
    const { data } = (supabase as any).storage.from("esign-documents").getPublicUrl(t.file_path);
    if (data?.publicUrl) window.open(data.publicUrl, "_blank");
  }

  const filtered = useMemo(() => rows.filter(r => {
    if (!q.trim()) return true;
    return [r.name, r.category, r.description, r.file_name].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase());
  }), [rows, q]);

  const grouped = useMemo(() => {
    const m = new Map<string, Template[]>();
    for (const t of filtered) { const k = t.category ?? "General"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(t); }
    return [...m.entries()];
  }, [filtered]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Documents</div>
          <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
            <FileStack className="h-4 w-4 text-primary/80" /> Templates
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search templates…" className="h-9 w-60 pl-8 text-sm" />
          </div>
          <Button size="sm" onClick={() => setOpen(true)} className="h-9 gap-1.5 px-3.5 font-medium shadow-sm"><Plus className="h-3.5 w-3.5" /> New Template</Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
            <FileStack className="mb-3 h-7 w-7 text-muted-foreground/40" />
            <p className="font-display text-base font-semibold">{rows.length === 0 ? "No templates yet" : "No templates match"}</p>
            <p className="mt-1 text-sm text-muted-foreground">Add a ready-to-go PDF you reuse often, then create documents from it in one click.</p>
            {rows.length === 0 && <Button onClick={() => setOpen(true)} className="mt-4 gap-1.5"><Plus className="h-4 w-4" /> New Template</Button>}
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([cat, list]) => (
              <div key={cat}>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">{cat}</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map(t => (
                    <div key={t.id} className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"><FileText className="h-4 w-4 text-primary/80" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium leading-tight line-clamp-2">{t.name}</div>
                          {t.description && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</div>}
                          <div className="mt-1 truncate text-[11px] text-muted-foreground/70">{t.file_name}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-1.5 border-t border-border/40 pt-3">
                        <Button size="sm" className="h-7 flex-1 gap-1.5 text-xs" onClick={() => openUse(t)}><Wand2 className="h-3 w-3" /> Use</Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" title="Download" onClick={() => download(t)}><Download className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive" title="Delete" onClick={() => setDeleteTarget(t)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New template dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileStack className="h-4 w-4 text-primary" /> New Template</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Template name <span className="text-destructive">*</span></Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-8" placeholder="e.g. Standard Charter Agreement" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="h-8" placeholder="e.g. Charter, HR" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="h-8" placeholder="Optional one-line note" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Template PDF <span className="text-destructive">*</span></Label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 hover:bg-muted/40 transition">
                <UploadCloud className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{file ? file.name : "Choose a ready-to-go PDF"}</span>
                <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Default signature placement</Label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Page</span>
                  <Input type="number" min={1} value={form.sigPage} onChange={e => setForm(f => ({ ...f, sigPage: e.target.value }))} className="h-8 w-16" />
                </div>
                <select value={form.sigPos} onChange={e => setForm(f => ({ ...f, sigPos: e.target.value }))} className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm">
                  {SIG_POSITIONS.map(p => <option key={p} value={p}>{p.replace("-", " ")}</option>)}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={createTemplate} disabled={busy} className="gap-1.5">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Add Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Use template dialog */}
      <Dialog open={!!useTarget} onOpenChange={(o) => { if (!o && !using) setUseTarget(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-primary" /> New Document from “{useTarget?.name}”</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Document title <span className="text-destructive">*</span></Label>
              <Input value={useForm.title} onChange={e => setUseForm(f => ({ ...f, title: e.target.value }))} className="h-8" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Signer name <span className="text-destructive">*</span></Label>
                <Input value={useForm.signer_name} onChange={e => setUseForm(f => ({ ...f, signer_name: e.target.value }))} className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Signer email <span className="text-destructive">*</span></Label>
                <Input type="email" value={useForm.signer_email} onChange={e => setUseForm(f => ({ ...f, signer_email: e.target.value }))} className="h-8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Message to signer</Label>
              <Textarea rows={2} value={useForm.message} onChange={e => setUseForm(f => ({ ...f, message: e.target.value }))} className="resize-none text-sm" placeholder="Optional note included in the signing email." />
            </div>
            <p className="text-[11px] text-muted-foreground/70">A copy of the template PDF is used, so editing or deleting the template later won't affect this document.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUseTarget(null)} disabled={using}>Cancel</Button>
            <Button variant="outline" onClick={() => useTemplate(false)} disabled={using} className="gap-1.5"><Upload className="h-3.5 w-3.5" /> Save draft</Button>
            <Button onClick={() => useTemplate(true)} disabled={using} className="gap-1.5">{using ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send for signature</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>“{deleteTarget?.name}” will be removed. Documents already created from it are unaffected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void doDelete(); }} disabled={deleting} className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
