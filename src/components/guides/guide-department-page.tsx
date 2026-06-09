import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Route } from "@/routes/_app.guides.$department.index";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Loader2, BookOpen, FileText, Pencil, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { departmentByKey, departmentLabel, slugify } from "./guide-meta";

type Guide = {
  id: string;
  department: string;
  category: string | null;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  sort_order: number;
  published: boolean;
  updated_at: string;
};

const EMPTY = { title: "", category: "", summary: "", body: "", published: true };

export function GuideDepartmentPage() {
  const { department } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const dept = departmentByKey(department);

  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Guide | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void load(); }, [department]);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any).from("guides")
      .select("*").eq("department", departmentLabel(department))
      .order("category", { nullsFirst: true }).order("sort_order").order("title");
    if (error) toast.error(error.message);
    setGuides((data ?? []) as Guide[]);
    setLoading(false);
  }

  function openNew() { setEditing(null); setForm(EMPTY); setOpen(true); }
  function openEdit(g: Guide) {
    setEditing(g);
    setForm({ title: g.title, category: g.category ?? "", summary: g.summary ?? "", body: g.body, published: g.published });
    setOpen(true);
  }

  async function save() {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setBusy(true);
    try {
      const payload = {
        department: departmentLabel(department),
        category: form.category.trim() || null,
        title: form.title.trim(),
        summary: form.summary.trim() || null,
        body: form.body,
        published: form.published,
        updated_at: new Date().toISOString(),
      };
      const db = supabase as any;
      if (editing) {
        const { error } = await db.from("guides").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Guide updated");
      } else {
        const slug = `${slugify(form.title)}-${Math.random().toString(36).slice(2, 6)}`;
        const { error } = await db.from("guides").insert([{ ...payload, slug, created_by: user?.id ?? null }]);
        if (error) throw error;
        toast.success("Guide created");
      }
      setOpen(false);
      void load();
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  // Group by category for display.
  const grouped = useMemo(() => {
    const map = new Map<string, Guide[]>();
    for (const g of guides) {
      const k = g.category ?? "General";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(g);
    }
    return Array.from(map.entries());
  }, [guides]);

  const Icon = dept?.icon ?? BookOpen;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div className="flex items-center gap-3 text-sm">
          <button onClick={() => navigate({ to: "/guides" })} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition">
            <ArrowLeft className="h-4 w-4" /> Guides
          </button>
          <span className="text-muted-foreground/40">/</span>
          <span className="font-medium">{dept?.label ?? department}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
            <Icon className="h-4 w-4 text-primary/80" /> {dept?.label ?? department} Guides
          </h1>
          <Button size="sm" onClick={openNew} className="h-9 gap-1.5 px-3.5 font-medium shadow-sm">
            <Plus className="h-3.5 w-3.5" /> New Guide
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : guides.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
            <BookOpen className="mb-3 h-7 w-7 text-muted-foreground/40" />
            <p className="font-display text-base font-semibold">No guides yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add how-to guides and reference material for {dept?.label ?? department}.</p>
            <Button onClick={openNew} className="mt-4 gap-1.5"><Plus className="h-4 w-4" /> New Guide</Button>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([cat, list]) => (
              <div key={cat}>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">{cat}</div>
                <div className="space-y-2">
                  {list.map(g => (
                    <div key={g.id} className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm">
                      <FileText className="h-4 w-4 shrink-0 text-primary/70" />
                      <Link to="/guides/$department/$guideId" params={{ department, guideId: g.id }} className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-medium leading-tight">
                          {g.title}
                          {!g.published && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Draft</span>}
                        </div>
                        {g.summary && <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{g.summary}</div>}
                      </Link>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" onClick={() => openEdit(g)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit Guide" : "New Guide"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Title <span className="text-destructive">*</span></Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="h-8" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Visas" className="h-8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Summary</Label>
              <Input value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} placeholder="One-line description" className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Content <span className="text-muted-foreground">(Markdown)</span></Label>
              <Textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={12} className="resize-y font-mono text-xs" placeholder={"## Section\n\n- Point one\n- Point two"} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.published} onCheckedChange={v => setForm(f => ({ ...f, published: v }))} id="pub" />
              <Label htmlFor="pub" className="text-xs">Published</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Save Changes" : "Create Guide"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
