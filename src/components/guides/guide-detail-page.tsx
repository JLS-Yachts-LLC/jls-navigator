import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Route } from "@/routes/_app.guides.$department.$guideId";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Markdown } from "@/components/ui/markdown";
import { ArrowLeft, Loader2, Pencil, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import { departmentByKey } from "./guide-meta";

type Guide = {
  id: string; department: string; category: string | null; slug: string;
  title: string; summary: string | null; body: string; published: boolean; updated_at: string;
};

export function GuideDetailPage() {
  const { department, guideId } = Route.useParams();
  const navigate = useNavigate();
  const dept = departmentByKey(department);

  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", category: "", summary: "", body: "", published: true });
  const [busy, setBusy] = useState(false);

  useEffect(() => { void load(); }, [guideId]);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any).from("guides").select("*").eq("id", guideId).maybeSingle();
    if (error || !data) { toast.error("Guide not found"); navigate({ to: "/guides/$department", params: { department } }); return; }
    setGuide(data as Guide);
    setLoading(false);
  }

  function openEdit() {
    if (!guide) return;
    setForm({ title: guide.title, category: guide.category ?? "", summary: guide.summary ?? "", body: guide.body, published: guide.published });
    setOpen(true);
  }

  async function save() {
    if (!guide || !form.title.trim()) { toast.error("Title is required"); return; }
    setBusy(true);
    try {
      const { error } = await (supabase as any).from("guides").update({
        title: form.title.trim(),
        category: form.category.trim() || null,
        summary: form.summary.trim() || null,
        body: form.body,
        published: form.published,
        updated_at: new Date().toISOString(),
      }).eq("id", guide.id);
      if (error) throw error;
      toast.success("Guide updated");
      setOpen(false);
      void load();
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!guide) return;
    if (!confirm(`Delete "${guide.title}"?`)) return;
    const { error } = await (supabase as any).from("guides").delete().eq("id", guide.id);
    if (error) toast.error(error.message);
    else { toast.success("Guide deleted"); navigate({ to: "/guides/$department", params: { department } }); }
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!guide) return null;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div className="flex items-center gap-3 text-sm">
          <button onClick={() => navigate({ to: "/guides" })} className="text-muted-foreground hover:text-foreground transition flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Guides
          </button>
          <span className="text-muted-foreground/40">/</span>
          <button onClick={() => navigate({ to: "/guides/$department", params: { department } })} className="text-muted-foreground hover:text-foreground transition">
            {dept?.label ?? department}
          </button>
          <span className="text-muted-foreground/40">/</span>
          <span className="font-medium truncate">{guide.title}</span>
        </div>
        <div className="mt-1.5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {guide.category && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary">{guide.category}</span>}
              {!guide.published && <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">Draft</span>}
            </div>
            <h1 className="mt-1 font-display text-xl font-bold">{guide.title}</h1>
            {guide.summary && <p className="mt-0.5 text-sm text-muted-foreground">{guide.summary}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={openEdit} className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
            <Button variant="ghost" size="sm" onClick={remove} className="gap-1.5 text-destructive/70 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <Markdown>{guide.body || "_No content yet — click Edit to add this guide's content._"}</Markdown>
          <div className="mt-8 flex items-center gap-1.5 border-t border-border/50 pt-3 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" /> Last updated {new Date(guide.updated_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>

      {/* Editor */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit Guide</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Title <span className="text-destructive">*</span></Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Visas" className="h-8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Summary</Label>
              <Input value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Content <span className="text-muted-foreground">(Markdown)</span></Label>
              <Textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={14} className="resize-y font-mono text-xs" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.published} onCheckedChange={v => setForm(f => ({ ...f, published: v }))} id="pub-edit" />
              <Label htmlFor="pub-edit" className="text-xs">Published</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
