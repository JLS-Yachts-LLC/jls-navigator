import { useState, useEffect, useMemo, useRef } from "react";
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
import { ArrowLeft, Plus, Loader2, BookOpen, FileText, Pencil, ChevronRight, Upload, Sparkles, Heading, Bold, Italic, List, Link2, Youtube, Eye } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/ui/markdown";
import { youtubeId } from "@/lib/youtube";
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

  // ── Content editor (toolbar + preview + YouTube embeds) ──────────────────────
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [contentTab, setContentTab] = useState<"write" | "preview">("write");
  const [ytOpen, setYtOpen] = useState(false);
  const [ytUrl, setYtUrl] = useState("");

  /** Wrap the current selection with `before`/`after` (for bold, italic, links). */
  function surround(before: string, after: string, placeholder = "") {
    const ta = bodyRef.current;
    if (!ta) { setForm(f => ({ ...f, body: f.body + before + placeholder + after })); return; }
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    setForm(f => ({ ...f, body: next }));
    requestAnimationFrame(() => { ta.focus(); const p = s + before.length + sel.length; ta.setSelectionRange(p, p); });
  }

  /** Insert a block on its own lines at the cursor (headings, lists, videos). */
  function insertBlock(text: string) {
    const ta = bodyRef.current;
    const value = form.body;
    const at = ta ? ta.selectionStart : value.length;
    const pre = value.slice(0, at);
    const post = value.slice(at);
    const lead = pre && !pre.endsWith("\n\n") ? (pre.endsWith("\n") ? "\n" : "\n\n") : "";
    const trail = post && !post.startsWith("\n") ? "\n\n" : "";
    const next = pre + lead + text + trail + post;
    setForm(f => ({ ...f, body: next }));
    requestAnimationFrame(() => { if (ta) { ta.focus(); const p = (pre + lead + text).length; ta.setSelectionRange(p, p); } });
  }

  function insertYouTube() {
    const id = youtubeId(ytUrl);
    if (!id) { toast.error("Enter a valid YouTube link"); return; }
    insertBlock(`https://youtu.be/${id}`);
    setYtUrl(""); setYtOpen(false);
    toast.success("Video added — it plays inline in the guide");
  }

  // Document import (PDF/Word → AI-extracted guide + branded PDF)
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importCategory, setImportCategory] = useState("");
  const [importPublished, setImportPublished] = useState(true);
  const [importBusy, setImportBusy] = useState(false);

  useEffect(() => { void load(); }, [department]);

  async function doImport() {
    if (!importFile) { toast.error("Choose a PDF or Word document"); return; }
    setImportBusy(true);
    try {
      const buf = await importFile.arrayBuffer();
      let bin = "";
      const b = new Uint8Array(buf);
      for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
      const fileBase64 = btoa(bin);
      const { data: { session } } = await (supabase as any).auth.getSession();
      const res = await fetch("/api/guides/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({
          fileBase64, fileName: importFile.name, mimeType: importFile.type,
          department: departmentLabel(department), category: importCategory.trim() || undefined,
          published: importPublished,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error ?? `Failed (${res.status})`);
      toast.success(`Imported “${j.title}”`);
      setImportOpen(false); setImportFile(null); setImportCategory("");
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    } finally { setImportBusy(false); }
  }

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
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="h-9 gap-1.5 px-3.5 font-medium">
              <Upload className="h-3.5 w-3.5" /> Import Document
            </Button>
            <Button size="sm" onClick={openNew} className="h-9 gap-1.5 px-3.5 font-medium shadow-sm">
              <Plus className="h-3.5 w-3.5" /> New Guide
            </Button>
          </div>
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
              <div className="flex items-center justify-between">
                <Label className="text-xs">Content</Label>
                <div className="flex rounded-md border border-border p-0.5">
                  <button type="button" onClick={() => setContentTab("write")}
                    className={cn("rounded px-2.5 py-1 text-[11px] font-medium transition", contentTab === "write" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
                    <Pencil className="mr-1 inline h-3 w-3" /> Write
                  </button>
                  <button type="button" onClick={() => setContentTab("preview")}
                    className={cn("rounded px-2.5 py-1 text-[11px] font-medium transition", contentTab === "preview" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
                    <Eye className="mr-1 inline h-3 w-3" /> Preview
                  </button>
                </div>
              </div>

              {contentTab === "write" ? (
                <>
                  {/* Formatting toolbar */}
                  <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/20 p-1">
                    {[
                      { icon: Heading, title: "Heading", fn: () => insertBlock("## Heading") },
                      { icon: Bold, title: "Bold", fn: () => surround("**", "**", "bold text") },
                      { icon: Italic, title: "Italic", fn: () => surround("*", "*", "italic text") },
                      { icon: List, title: "Bullet list", fn: () => insertBlock("- ") },
                      { icon: Link2, title: "Link", fn: () => surround("[", "](https://)", "link text") },
                    ].map(({ icon: Icon, title, fn }) => (
                      <button key={title} type="button" title={title} onClick={fn}
                        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition">
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    ))}
                    <div className="mx-0.5 h-4 w-px bg-border" />
                    <button type="button" title="Insert YouTube video" onClick={() => setYtOpen(o => !o)}
                      className={cn("flex h-7 items-center gap-1.5 rounded px-2 text-[11px] font-medium transition", ytOpen ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                      <Youtube className="h-3.5 w-3.5" /> YouTube
                    </button>
                  </div>

                  {/* YouTube inline inserter */}
                  {ytOpen && (
                    <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
                      <Youtube className="h-4 w-4 shrink-0 text-primary" />
                      <Input
                        value={ytUrl}
                        onChange={e => setYtUrl(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); insertYouTube(); } }}
                        placeholder="Paste a YouTube link (youtube.com/watch?v=… or youtu.be/…)"
                        className="h-8 text-xs"
                        autoFocus
                      />
                      <Button size="sm" className="h-8 shrink-0" onClick={insertYouTube}>Insert at cursor</Button>
                    </div>
                  )}

                  <Textarea ref={bodyRef} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={12} className="resize-y font-mono text-xs" placeholder={"## Section\n\n- Point one\n- Point two\n\nPaste a YouTube link on its own line to embed a video."} />
                  <p className="text-[10.5px] text-muted-foreground">Supports Markdown. A YouTube link on its own line becomes an embedded player where you place it.</p>
                </>
              ) : (
                <div className="pds-scroll max-h-[380px] min-h-[220px] overflow-auto rounded-md border border-border bg-card p-4">
                  {form.body.trim()
                    ? <Markdown>{form.body}</Markdown>
                    : <p className="text-sm text-muted-foreground italic">Nothing to preview yet.</p>}
                </div>
              )}
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

      {/* Import a PDF/Word document → AI-extracted guide + branded PDF */}
      <Dialog open={importOpen} onOpenChange={(o) => { if (!importBusy) setImportOpen(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Import Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Upload a PDF or Word document and Polaris will extract its content into a guide, then attach a Polaris/JLS-branded PDF. You can edit the result afterwards.
            </p>
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition",
                importFile ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-accent/20",
              )}
            >
              <Upload className="h-6 w-6 text-muted-foreground/50" />
              {importFile
                ? <span className="text-sm font-medium">{importFile.name}</span>
                : <span className="text-sm text-muted-foreground">Click to choose a <span className="font-medium">.pdf</span> or <span className="font-medium">.docx</span></span>}
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setImportFile(f); }}
              />
            </label>
            <div className="space-y-1.5">
              <Label className="text-xs">Category <span className="text-muted-foreground">(optional — leave blank to auto-detect)</span></Label>
              <Input value={importCategory} onChange={(e) => setImportCategory(e.target.value)} placeholder="e.g. Visas" className="h-8" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={importPublished} onCheckedChange={setImportPublished} id="imp-pub" />
              <Label htmlFor="imp-pub" className="text-xs">Publish immediately</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importBusy}>Cancel</Button>
            <Button onClick={doImport} disabled={importBusy || !importFile} className="gap-1.5">
              {importBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Extracting…</> : <><Sparkles className="h-4 w-4" /> Import & Create</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
