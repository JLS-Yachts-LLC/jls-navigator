/**
 * Crew Academy — the course creator, shared by JLS's library (/academy-admin)
 * and a vessel's own courses (Client Portal); the backend decides which.
 *
 *   ┌ header: back · save state · undo / redo · things to fix · Preview · Publish ┐
 *   │ outline (sections → lessons)  │  the selected lesson's blocks              │
 *   └───────────────────────────────┴────────────────────────────────────────────┘
 *
 * Blocks show as one line and open one at a time. Everything autosaves ~1.5 s
 * after the last change; each save carries the course's updated_at from the
 * last load/save, so if the course changed anywhere else in the meantime the
 * save is refused and the editor stops and asks for a reload rather than
 * overwriting it. Publishing stays a separate, deliberate step. Undo / redo
 * covers every edit. On phones and tablets the outline is a slide-over panel.
 * The stored content shape is content.ts's — this file only edits it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Archive, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Copy, Eye,
  FolderInput, GripVertical, ListTree, Loader2, Maximize2, Minimize2, MoreHorizontal, Pencil, Plus, Redo2, RefreshCw, RotateCcw, Send, Settings2, Ship,
  Sparkles, Trash2, Undo2, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BLOCK_LABELS, emptyContent, newBlock, newId,
  type Block, type BlockType, type CourseContent, type Lesson, type Section,
} from "@/lib/academy/content";
import { courseIssues, type Issue } from "@/lib/academy/builder-checks";
import { BlockFields } from "./block-editors";
import { OfferModal } from "./offer-modal";
import { Preview } from "./preview";
import {
  Menu, MenuDivider, MenuItem, MenuLabel, StatusPill, Thumb, ToolButton, blockCatalogue, blockIcon, blockSummary, fmtDate, fmtSize,
  inputCls, labelCls, useBackend, type MediaFile,
} from "./shared";

type Details = { title: string; summary: string; category: string; minutes: string; passMark: string; refreshMonths: string; catalogue: boolean };
type Doc = { details: Details; content: CourseContent };
type Loaded = {
  canCreate: boolean; canEdit: boolean;
  course: { id: string; title: string; summary: string | null; category: string | null; minutes: number | null; passMark: number;
    refreshMonths: number | null; status: string; offerAll: boolean; currentVersionId: string | null; content: CourseContent; catalogue?: boolean;
    updatedAt?: string | null };
  versions: { id: string; version: number; published_at: string; published_by_name: string | null }[];
  offeredTo: string[];
  files: MediaFile[];
  maxUploadBytes: number;
};
type Sel = { kind: "details" } | { kind: "lesson"; lessonId: string };
type SaveState =
  | { state: "saved" } | { state: "pending" } | { state: "saving" }
  | { state: "error"; message: string } | { state: "invalid"; message: string } | { state: "conflict"; message: string };
type DragItem = { kind: "section" | "lesson" | "block"; id: string } | null;

const AUTOSAVE_MS = 1500;
const COALESCE_MS = 1500;

// ── Pure helpers on (cloned) content ────────────────────────────────────────
const lessonsOf = (c: CourseContent) => c.sections.flatMap((s) => s.lessons.map((l) => ({ section: s, lesson: l })));
function lessonPos(c: CourseContent, lessonId: string) {
  for (let si = 0; si < c.sections.length; si++) {
    const li = c.sections[si].lessons.findIndex((l) => l.id === lessonId);
    if (li >= 0) return { si, li, section: c.sections[si], lesson: c.sections[si].lessons[li] };
  }
  return null;
}
function blockPos(c: CourseContent, blockId: string) {
  for (const s of c.sections) for (const l of s.lessons) {
    const bi = l.blocks.findIndex((b) => b.id === blockId);
    if (bi >= 0) return { lesson: l, bi };
  }
  return null;
}
function moveLesson(c: CourseContent, lessonId: string, toSectionId: string, toIndex: number) {
  const from = lessonPos(c, lessonId);
  const to = c.sections.find((s) => s.id === toSectionId);
  if (!from || !to) return;
  const [l] = from.section.lessons.splice(from.li, 1);
  let i = toIndex;
  if (from.section === to && from.li < i) i--;
  to.lessons.splice(Math.max(0, Math.min(i, to.lessons.length)), 0, l);
}
function moveBlock(c: CourseContent, blockId: string, toLessonId: string, toIndex: number) {
  const from = blockPos(c, blockId);
  const to = lessonPos(c, toLessonId)?.lesson;
  if (!from || !to) return;
  const [b] = from.lesson.blocks.splice(from.bi, 1);
  let i = toIndex;
  if (from.lesson === to && from.bi < i) i--;
  to.blocks.splice(Math.max(0, Math.min(i, to.blocks.length)), 0, b);
}
const copyBlock = (b: Block): Block => ({ ...structuredClone(b), id: newId() });

function detailsProblem(d: Details): string | null {
  if (!d.title.trim()) return "Give the course a title";
  const num = (v: string, lo: number, hi: number, what: string) => {
    if (!v.trim()) return null;
    const n = Number(v);
    return Number.isFinite(n) && Math.round(n) >= lo && Math.round(n) <= hi ? null : `${what}: enter a number from ${lo} to ${hi}`;
  };
  return num(d.minutes, 1, 1000, "Minutes to complete") ?? num(d.passMark, 0, 100, "Pass mark") ?? num(d.refreshMonths, 1, 120, "Refresher");
}

const ago = (t: number, now: number) => {
  const s = Math.round((now - t) / 1000);
  return s < 10 ? "just now" : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};
const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

// ═══════════════════════════════════════════════════════════════════════════
export function Editor({ id, onBack }: { id: string; onBack: () => void }) {
  const api = useBackend();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [doc, setDocState] = useState<Doc | null>(null);
  const docRef = useRef<Doc | null>(null);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [sel, setSel] = useState<Sel>({ kind: "details" });
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [preview, setPreview] = useState<null | { lessonId?: string }>(null);
  const [focus, setFocus] = useState(false);
  const [offering, setOffering] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Undo / redo
  const past = useRef<Doc[]>([]);
  const future = useRef<Doc[]>([]);
  const lastEdit = useRef<{ key?: string; at: number }>({ at: 0 });
  const [, bump] = useState(0);

  // Autosave
  const rev = useRef(0);
  const savedRev = useRef(0);
  const [revTick, setRevTick] = useState(0);
  const base = useRef<string | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);
  const [save, setSave] = useState<SaveState>({ state: "saved" });
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const conflict = save.state === "conflict";
  const saveStateRef = useRef(save);
  saveStateRef.current = save;
  const failedRev = useRef(-1); // don't auto-retry a failed save until something changes

  const editable = !!loaded?.canCreate;

  const setDoc = (d: Doc) => { docRef.current = d; setDocState(d); };

  const load = useCallback(async (opts: { keepDoc?: boolean } = {}) => {
    const d: Loaded = await api.get(`op=course&id=${encodeURIComponent(id)}`);
    setLoaded(d);
    setFiles(d.files);
    base.current = d.course.updatedAt ?? null;
    if (opts.keepDoc && rev.current !== savedRev.current) return d; // unsaved edits stay; they save against the new base
    const next: Doc = {
      details: {
        title: d.course.title, summary: d.course.summary ?? "", category: d.course.category ?? "",
        minutes: d.course.minutes?.toString() ?? "", passMark: String(d.course.passMark), refreshMonths: d.course.refreshMonths?.toString() ?? "",
        catalogue: d.course.catalogue !== false,
      },
      content: d.course.content.sections.length ? d.course.content : emptyContent(),
    };
    setDoc(next);
    if (!opts.keepDoc) {
      past.current = []; future.current = [];
      rev.current = savedRev.current = 0;
      setSave({ state: "saved" });
      setSavedAt(null);
      let want: string | null = null;
      try { want = sessionStorage.getItem(`academy-builder:${id}`); } catch { /* */ }
      const all = lessonsOf(next.content);
      const pick = all.find((x) => x.lesson.id === want)?.lesson ?? all[0]?.lesson;
      setSel(want === "details" || !pick ? { kind: "details" } : { kind: "lesson", lessonId: pick.id });
    }
    return d;
  }, [api, id]);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);

  useEffect(() => {
    if (!docRef.current) return; // not until the course has loaded and picked a lesson
    try { sessionStorage.setItem(`academy-builder:${id}`, sel.kind === "details" ? "details" : sel.lessonId); } catch { /* */ }
  }, [id, sel]);

  /** Every edit: snapshot for undo (typing in one place within 1.5 s is one step), mark unsaved. */
  const change = useCallback((fn: (d: Doc) => void, key?: string) => {
    const prev = docRef.current;
    if (!prev) return;
    const next = structuredClone(prev);
    fn(next);
    const t = Date.now();
    if (!(key && lastEdit.current.key === key && t - lastEdit.current.at < COALESCE_MS)) {
      past.current.push(prev);
      if (past.current.length > 200) past.current.shift();
    }
    lastEdit.current = { key, at: t };
    future.current = [];
    setDoc(next);
    rev.current++;
    setRevTick((n) => n + 1);
  }, []);
  const changeContent = useCallback((fn: (c: CourseContent) => void, key?: string) => change((d) => fn(d.content), key), [change]);

  const restore = (d: Doc) => {
    setDoc(d);
    lastEdit.current = { at: 0 };
    rev.current++;
    setRevTick((n) => n + 1);
    bump((n) => n + 1);
    // Keep the selection on something that still exists.
    setSel((s) => (s.kind === "lesson" && !lessonPos(d.content, s.lessonId)
      ? (lessonsOf(d.content)[0] ? { kind: "lesson", lessonId: lessonsOf(d.content)[0].lesson.id } : { kind: "details" }) : s));
  };
  const undo = () => { const p = past.current.pop(); if (!p || !docRef.current) return; future.current.push(docRef.current); restore(p); };
  const redo = () => { const f = future.current.pop(); if (!f || !docRef.current) return; past.current.push(docRef.current); restore(f); };

  // ── Saving ────────────────────────────────────────────────────────────────
  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!editable) return true;
    while (inflight.current) await inflight.current;
    if (saveStateRef.current.state === "conflict") return false;
    if (rev.current === savedRev.current) return true;
    const d = docRef.current!;
    const invalid = detailsProblem(d.details);
    if (invalid) { failedRev.current = rev.current; setSave({ state: "invalid", message: invalid }); return false; }
    const r = rev.current;
    setSave({ state: "saving" });
    const p = (async () => {
      try {
        const res = await api.post({
          op: "save", id, title: d.details.title, summary: d.details.summary, category: d.details.category,
          minutes: d.details.minutes || null, passMark: d.details.passMark || 80, refreshMonths: d.details.refreshMonths || null,
          catalogue: d.details.catalogue, content: d.content, baseUpdatedAt: base.current,
        });
        base.current = res.updatedAt ?? null;
        savedRev.current = r;
        setSavedAt(Date.now());
        setSave(rev.current === r ? { state: "saved" } : { state: "pending" });
        return true;
      } catch (e: any) {
        if (e.status === 409 || e.body?.conflict) setSave({ state: "conflict", message: e.message });
        else { failedRev.current = r; setSave({ state: "error", message: e.message ?? "Couldn't save" }); }
        return false;
      } finally { inflight.current = null; }
    })();
    inflight.current = p;
    return p;
  }, [api, id, editable]);
  const saveRef = useRef(saveNow);
  saveRef.current = saveNow;

  // Debounced autosave after each change (and again if edits arrived mid-save).
  useEffect(() => {
    if (!editable || conflict || rev.current === savedRev.current) return;
    if ((save.state === "error" || save.state === "invalid") && failedRev.current === rev.current) return;
    if (save.state === "saved") setSave({ state: "pending" });
    const t = setTimeout(() => { void saveRef.current(); }, AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revTick, editable, conflict, save.state === "saving"]);

  // Save on tab hide; warn when leaving with unsaved work.
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") void saveRef.current(); };
    const leave = (e: BeforeUnloadEvent) => {
      if (rev.current !== savedRev.current || inflight.current) { void saveRef.current(); e.preventDefault(); e.returnValue = ""; }
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("beforeunload", leave);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("beforeunload", leave); };
  }, []);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);

  // Keyboard: Ctrl/Cmd+S saves now; Ctrl/Cmd+Z / Shift+Z / Y undo and redo (text boxes keep their own undo).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "s") { e.preventDefault(); void saveRef.current(); return; }
      if (!editable || isTyping(e.target)) return;
      if (key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((key === "z" && e.shiftKey) || key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  // Scroll a block into view once it's rendered (after add / jump to a problem).
  useEffect(() => {
    if (!scrollTo) return;
    const el = document.querySelector(`[data-block-id="${scrollTo}"]`);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); setScrollTo(null); }
  });

  const issues = useMemo(() => (doc ? courseIssues(doc.content) : []), [doc]);
  // If the selected lesson goes (deleted, undone), fall back to the first one.
  useEffect(() => {
    if (!doc || sel.kind !== "lesson" || lessonPos(doc.content, sel.lessonId)) return;
    const first = lessonsOf(doc.content)[0];
    setSel(first ? { kind: "lesson", lessonId: first.lesson.id } : { kind: "details" });
  }, [doc, sel]);
  const detailsIssue = doc ? detailsProblem(doc.details) : null;

  if (!loaded || !doc) return <div className="flex justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const content = doc.content;
  const lesson = sel.kind === "lesson" ? lessonPos(content, sel.lessonId) : null;
  const flat = lessonsOf(content);
  const at = lesson ? flat.findIndex((x) => x.lesson.id === lesson.lesson.id) : -1;
  const latest = loaded.versions[0];

  const selectLesson = (lessonId: string, blockId?: string | null) => {
    setSel({ kind: "lesson", lessonId });
    setOpenBlock(blockId ?? null);
    setDrawer(false);
    if (blockId) setScrollTo(blockId);
    else document.querySelector("[data-builder-top]")?.scrollIntoView({ block: "start" });
  };
  const goTo = (i: Issue) => {
    if (i.lessonId) selectLesson(i.lessonId, i.blockId);
    else if (i.sectionId) {
      const s = content.sections.find((x) => x.id === i.sectionId);
      if (s?.lessons[0]) selectLesson(s.lessons[0].id);
      else setDrawer(true);
      setTimeout(() => (document.querySelector(`[data-section-title="${i.sectionId}"]`) as HTMLInputElement | null)?.focus(), 50);
    }
  };

  const leave = async () => {
    if (editable && rev.current !== savedRev.current && !(await saveNow())) {
      if (!confirm("Your latest changes couldn't be saved. Leave anyway and lose them?")) return;
    }
    onBack();
  };

  const publish = async () => {
    if (issues.length) {
      toast.error(`${issues.length} thing${issues.length === 1 ? "" : "s"} to fix before this can be published — taking you to the first.`);
      goTo(issues[0]);
      return;
    }
    if (!(await saveNow())) { toast.error("Your changes need to save before publishing."); return; }
    const v = (latest?.version ?? 0) + 1;
    if (!confirm(latest
      ? `Publish version ${v}? Crew who start the course from now get it; anyone part-way through keeps the version they started.`
      : "Publish this course? Once it's published it can be offered and crew can be enrolled.")) return;
    setBusy("publish");
    try {
      const r = await api.post({ op: "publish", id });
      toast.success(`Published version ${r.version}`);
      await load({ keepDoc: true });
    } catch (e: any) {
      const p: string[] = e.body?.problems ?? [];
      toast.error(p.length ? `${e.message} ${p.slice(0, 3).join(" ")}` : e.message);
    } finally { setBusy(null); }
  };
  const setArchived = async (archived: boolean) => {
    if (archived && !confirm("Archive this course? No one new can be enrolled; crew already on it can finish.")) return;
    if (!(await saveNow())) { toast.error("Your changes need to save first."); return; }
    try { await api.post({ op: archived ? "archive" : "restore", id }); await load({ keepDoc: true }); }
    catch (e: any) { toast.error(e.message); }
  };

  // ── Preview ───────────────────────────────────────────────────────────────
  if (preview) {
    const only = preview.lessonId ? lessonPos(content, preview.lessonId) : null;
    const shown: CourseContent = only ? { sections: [{ ...only.section, lessons: [only.lesson] }] } : content;
    return (
      <div className={cn("pds pds-embed dark bg-background text-foreground", focus ? "fixed inset-0 z-50 overflow-y-auto" : "min-h-screen")} style={{ colorScheme: "dark" }}>
        <Preview title={doc.details.title} content={shown} passMark={Number(doc.details.passMark) || 80}
          onExit={() => { setPreview(null); setFocus(false); }} exitLabel="Back to editing"
          banner={<div className="mt-4 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
            {only ? `Preview of one lesson — “${only.lesson.title || "Untitled lesson"}” — ` : "Preview of your draft, "}as crew will see it. Nothing here is recorded.
          </div>}
          toolbar={<button onClick={() => setFocus((f) => !f)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2.5 text-xs text-muted-foreground hover:text-foreground">
            {focus ? <><Minimize2 className="h-3.5 w-3.5" /> Show the Polaris menu</> : <><Maximize2 className="h-3.5 w-3.5" /> Focus mode</>}
          </button>} />
      </div>
    );
  }

  const outline = (
    <Outline content={content} issues={issues} detailsIssue={!!detailsIssue} sel={sel} editable={editable} changeContent={changeContent}
      onSelectDetails={() => { setSel({ kind: "details" }); setDrawer(false); }} onSelectLesson={(lid) => selectLesson(lid)}
      onAddedLesson={(lid) => selectLesson(lid)} />
  );

  return (
    <div className="@container min-h-full" data-builder-top>
      {/* Header */}
      <div className="sticky top-[var(--builder-top,0px)] z-30 border-b border-border bg-background">
        <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
          <button onClick={() => void leave()} title={api.backLabel}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden @5xl:inline">{api.backLabel}</span>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold">{doc.details.title || "Untitled course"}</span>
              <span className="hidden @lg:inline"><StatusPill status={loaded.course.status} /></span>
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {latest ? `v${latest.version} published ${fmtDate(latest.published_at)}${latest.published_by_name ? ` by ${latest.published_by_name}` : ""}` : "Not published yet"}
            </div>
          </div>
          {editable && <SaveStatus save={save} savedAt={savedAt} now={now} onRetry={() => void saveNow()} />}
          {editable && (
            <div className="hidden items-center @xl:flex">
              <ToolButton icon={Undo2} title="Undo (Ctrl+Z)" onClick={undo} disabled={!past.current.length} className="rounded-r-none border-r-0" />
              <ToolButton icon={Redo2} title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!future.current.length} className="rounded-l-none" />
            </div>
          )}
          {issues.length > 0 && <IssuesMenu issues={issues} content={content} onGo={goTo} />}
          <Menu width={260} button={({ toggle, ref }) => (
            <button ref={ref} onClick={toggle} title="Preview"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2.5 text-xs font-medium hover:bg-card">
              <Eye className="h-3.5 w-3.5" /> <span className="hidden @3xl:inline">Preview</span> <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          )}>
            {(close) => (
              <>
                <MenuItem icon={Eye} description="Start at the beginning, as crew will" onSelect={() => { close(); setPreview({}); }}>Whole course</MenuItem>
                <MenuItem icon={Eye} disabled={!lesson} description={lesson ? lesson.lesson.title || "Untitled lesson" : "Pick a lesson first"}
                  onSelect={() => { close(); if (lesson) setPreview({ lessonId: lesson.lesson.id }); }}>This lesson</MenuItem>
              </>
            )}
          </Menu>
          {loaded.canEdit && (
            <ToolButton onClick={() => void publish()} icon={Send} busy={busy === "publish"} primary disabled={conflict}
              title={issues.length ? `${issues.length} to fix before publishing` : "Publish"}>
              <span className="hidden @xl:inline">Publish{latest && " new version"}</span>
            </ToolButton>
          )}
          {(loaded.canEdit || editable) && (
            <Menu width={240} button={({ toggle, ref }) => (
              <button ref={ref} onClick={toggle} aria-label="More" title="More"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card/60 hover:bg-card">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}>
              {(close) => (
                <>
                  {editable && (
                    <div className="@xl:hidden">
                      <MenuItem icon={Undo2} disabled={!past.current.length} onSelect={() => { close(); undo(); }}>Undo</MenuItem>
                      <MenuItem icon={Redo2} disabled={!future.current.length} onSelect={() => { close(); redo(); }}>Redo</MenuItem>
                      <MenuDivider />
                    </div>
                  )}
                  <MenuItem icon={Settings2} onSelect={() => { close(); setSel({ kind: "details" }); }}>Course details and files</MenuItem>
                  {loaded.canEdit && api.canOffer && (
                    <MenuItem icon={Ship} description="Which vessels can use this course" onSelect={() => { close(); setOffering(true); }}>Vessels</MenuItem>
                  )}
                  {loaded.canEdit && (loaded.course.status === "archived"
                    ? <MenuItem icon={RotateCcw} onSelect={() => { close(); void setArchived(false); }}>Restore course</MenuItem>
                    : <MenuItem icon={Archive} description="No new enrolments; crew on it can finish" onSelect={() => { close(); void setArchived(true); }}>Archive course</MenuItem>)}
                </>
              )}
            </Menu>
          )}
        </div>
        {conflict && (
          <div className="flex flex-wrap items-center gap-3 border-t border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
            <span className="min-w-0 flex-1">
              {save.message} Saving is paused so nothing gets overwritten{rev.current !== savedRev.current ? " — your latest edits here aren't saved" : ""}.
            </span>
            <ToolButton icon={RefreshCw} onClick={async () => {
              if (rev.current !== savedRev.current && !confirm("Reload the latest version? Your unsaved edits here will be lost.")) return;
              try { await load(); toast.success("Loaded the latest version"); } catch (e: any) { toast.error(e.message); }
            }}>Reload latest</ToolButton>
          </div>
        )}
      </div>

      <div className="@4xl:grid @4xl:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        {/* Outline (big screens) */}
        <aside className="hidden border-r border-border/70 @4xl:block">
          <div className={cn("sticky overflow-y-auto p-3", conflict
            ? "top-[calc(var(--builder-top,0px)+110px)] max-h-[calc(100dvh-110px-var(--builder-top,0px))]"
            : "top-[calc(var(--builder-top,0px)+57px)] max-h-[calc(100dvh-57px-var(--builder-top,0px))]")}>{outline}</div>
        </aside>

        {/* Outline (phones / tablets): slide-over */}
        {drawer && (
          <div className="fixed inset-0 z-50 @4xl:hidden" role="dialog" aria-label="Course outline">
            <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
            <div className="absolute inset-y-0 left-0 flex w-[88vw] max-w-sm flex-col border-r border-border bg-background shadow-2xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="text-sm font-semibold">Course outline</span>
                <button onClick={() => setDrawer(false)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-card"><X className="h-4 w-4" /></button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">{outline}</div>
            </div>
          </div>
        )}

        <main className="min-w-0">
          {/* Lesson switcher (phones / tablets) */}
          <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2 @4xl:hidden">
            <button onClick={() => setDrawer(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 text-sm font-medium">
              <ListTree className="h-4 w-4" /> Outline
              {issues.length > 0 && <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-200">{issues.length}</span>}
            </button>
            <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {lesson ? <>{lesson.section.title || `Section ${lesson.si + 1}`} › <span className="text-foreground">{lesson.lesson.title || "Untitled lesson"}</span></> : "Course details"}
            </div>
            <button disabled={at <= 0} onClick={() => selectLesson(flat[at - 1].lesson.id)} aria-label="Previous lesson"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <button disabled={at < 0 ? !flat.length : at >= flat.length - 1} onClick={() => selectLesson(flat[at + 1].lesson.id)} aria-label="Next lesson"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>

          <div className="mx-auto max-w-4xl p-3 pb-32 sm:p-5">
            {sel.kind === "details" || !lesson ? (
              <DetailsPane details={doc.details} problem={detailsIssue} editable={editable} files={files} content={content} loaded={loaded}
                onChange={(patch, key) => change((d) => { Object.assign(d.details, patch); }, key)} />
            ) : (
              <LessonPane key={lesson.lesson.id} content={content} section={lesson.section} si={lesson.si} lesson={lesson.lesson}
                issues={issues.filter((i) => i.lessonId === lesson.lesson.id || (i.sectionId === lesson.section.id && !i.lessonId))}
                editable={editable} courseId={id} files={files} maxUpload={loaded.maxUploadBytes}
                onUploaded={(f) => setFiles((fs) => [f, ...fs])}
                openBlock={openBlock} setOpenBlock={setOpenBlock} changeContent={changeContent}
                onPreview={() => setPreview({ lessonId: lesson.lesson.id })}
                onScrollTo={setScrollTo} saveNow={saveNow}
                prev={at > 0 ? flat[at - 1].lesson : null} next={at >= 0 && at < flat.length - 1 ? flat[at + 1].lesson : null}
                onGoLesson={(lid) => selectLesson(lid)} />
            )}
          </div>
        </main>
      </div>

      {offering && <OfferModal id={id} offerAll={loaded.course.offerAll} offeredTo={loaded.offeredTo}
        published={!!loaded.course.currentVersionId} onClose={() => setOffering(false)}
        onSaved={() => { setOffering(false); void (async () => { await saveNow(); await load({ keepDoc: true }); })(); }} />}
    </div>
  );
}

// ── Save status ─────────────────────────────────────────────────────────────
function SaveStatus({ save, savedAt, now, onRetry }: { save: SaveState; savedAt: number | null; now: number; onRetry: () => void }) {
  const base = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs";
  if (save.state === "saving" || save.state === "pending") {
    return <span className={cn(base, "text-muted-foreground")} aria-live="polite">
      {save.state === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />}
      <span className="hidden @3xl:inline">{save.state === "saving" ? "Saving…" : "Unsaved changes"}</span>
    </span>;
  }
  if (save.state === "error") {
    return <button onClick={onRetry} title={save.message}
      className={cn(base, "border border-red-500/50 bg-red-500/10 font-medium text-red-200 hover:bg-red-500/20")} aria-live="assertive">
      <CircleAlert className="h-3.5 w-3.5" /> <span className="hidden @3xl:inline">Couldn't save —</span> Retry
    </button>;
  }
  if (save.state === "invalid") {
    return <span className={cn(base, "max-w-[220px] text-amber-200")} title={save.message} aria-live="polite">
      <CircleAlert className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Not saved<span className="hidden @3xl:inline">: {save.message}</span></span>
    </span>;
  }
  if (save.state === "conflict") return <span className={cn(base, "font-medium text-amber-200")}><AlertTriangle className="h-3.5 w-3.5" /> Paused</span>;
  return <span className={cn(base, "text-muted-foreground")} aria-live="polite">
    <Check className="h-3.5 w-3.5 text-emerald-400" /> <span className="hidden @3xl:inline">{savedAt ? `Saved · ${ago(savedAt, now)}` : "Saved"}</span>
  </span>;
}

function IssuesMenu({ issues, content, onGo }: { issues: Issue[]; content: CourseContent; onGo: (i: Issue) => void }) {
  const where = (i: Issue) => {
    const p = i.lessonId ? lessonPos(content, i.lessonId) : null;
    const s = content.sections.find((x) => x.id === i.sectionId);
    if (p) return `${p.section.title || `Section ${p.si + 1}`} › ${p.lesson.title || `Lesson ${p.li + 1}`}`;
    return s ? s.title || `Section ${content.sections.indexOf(s) + 1}` : "Course";
  };
  return (
    <Menu width={360} button={({ toggle, ref }) => (
      <button ref={ref} onClick={toggle} title="Things to fix before publishing"
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-2.5 text-xs font-medium text-amber-100 hover:bg-amber-500/20">
        <CircleAlert className="h-3.5 w-3.5" /> {issues.length}<span className="hidden @4xl:inline"> to fix</span>
      </button>
    )}>
      {(close) => (
        <>
          <MenuLabel>Before this can be published</MenuLabel>
          {issues.slice(0, 60).map((i, n) => (
            <button key={n} type="button" onClick={() => { close(); onGo(i); }}
              className="flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-background/70">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span className="min-w-0"><span className="block">{i.text}</span><span className="block truncate text-xs text-muted-foreground">{where(i)}</span></span>
            </button>
          ))}
          {issues.length > 60 && <div className="px-2.5 py-1.5 text-xs text-muted-foreground">…and {issues.length - 60} more</div>}
        </>
      )}
    </Menu>
  );
}

// ── Outline ─────────────────────────────────────────────────────────────────
let dragging: DragItem = null;

function Outline({ content, issues, detailsIssue, sel, editable, changeContent, onSelectDetails, onSelectLesson, onAddedLesson }: {
  content: CourseContent; issues: Issue[]; detailsIssue: boolean; sel: Sel; editable: boolean;
  changeContent: (fn: (c: CourseContent) => void, key?: string) => void;
  onSelectDetails: () => void; onSelectLesson: (id: string) => void; onAddedLesson: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; where: "before" | "after" | "into" } | null>(null);
  const count = (pred: (i: Issue) => boolean) => issues.filter(pred).length;

  const addLesson = (sectionId: string) => {
    const lid = newId();
    changeContent((c) => { c.sections.find((s) => s.id === sectionId)?.lessons.push({ id: lid, title: "", blocks: [] }); });
    onAddedLesson(lid);
    setRenaming(lid);
  };
  const addSection = () => {
    const sid = newId(), lid = newId();
    changeContent((c) => { c.sections.push({ id: sid, title: "", lessons: [{ id: lid, title: "", blocks: [] }] }); });
    onAddedLesson(lid);
    setRenaming(sid);
  };
  const halves = (e: React.DragEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? "before" : "after";
  };
  const dropOnLesson = (s: Section, li: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragging || dragging.kind === "section") return;
      e.preventDefault(); e.dataTransfer.dropEffect = "move";
      const l = s.lessons[li];
      setDrop({ id: l.id, where: dragging.kind === "block" ? "into" : halves(e) });
    },
    onDragLeave: () => setDrop(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const d = dragging, l = s.lessons[li], where = drop?.where;
      setDrop(null);
      if (!d) return;
      if (d.kind === "block") {
        changeContent((c) => moveBlock(c, d.id, l.id, Number.MAX_SAFE_INTEGER));
        toast.success(`Moved to “${l.title || "Untitled lesson"}”`);
      } else if (d.kind === "lesson" && d.id !== l.id) {
        changeContent((c) => moveLesson(c, d.id, s.id, li + (where === "after" ? 1 : 0)));
      }
    },
  });
  const dropOnSection = (s: Section, si: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragging || dragging.kind === "block") return;
      e.preventDefault(); e.dataTransfer.dropEffect = "move";
      setDrop({ id: s.id, where: dragging.kind === "lesson" ? "into" : halves(e) });
    },
    onDragLeave: () => setDrop(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const d = dragging, where = drop?.where;
      setDrop(null);
      if (!d) return;
      if (d.kind === "lesson") changeContent((c) => moveLesson(c, d.id, s.id, 0));
      if (d.kind === "section" && d.id !== s.id) {
        changeContent((c) => {
          const from = c.sections.findIndex((x) => x.id === d.id);
          const [moved] = c.sections.splice(from, 1);
          let to = si + (where === "after" ? 1 : 0);
          if (from < to) to--;
          c.sections.splice(to, 0, moved);
        });
      }
    },
  });
  const dragStart = (item: DragItem) => (e: React.DragEvent) => {
    dragging = item;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item!.id);
  };
  const dragEnd = () => { dragging = null; setDrop(null); };
  const line = (id: string, where: "before" | "after") =>
    drop?.id === id && drop.where === where && <span className={cn("pointer-events-none absolute inset-x-1 h-0.5 rounded bg-primary", where === "before" ? "-top-px" : "-bottom-px")} />;

  return (
    <nav className="space-y-3 text-sm" aria-label="Course outline">
      <button onClick={onSelectDetails}
        className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left", sel.kind === "details" ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-card/70 hover:text-foreground")}>
        <Settings2 className="h-4 w-4 shrink-0" /> <span className="flex-1">Course details & files</span>
        {detailsIssue && <span className="h-2 w-2 rounded-full bg-amber-400" title="Needs attention" />}
      </button>

      {content.sections.map((s, si) => {
        const sIssues = count((i) => i.sectionId === s.id && !i.lessonId);
        return (
          <div key={s.id} className="rounded-xl border border-border/60 bg-card/30">
            <div {...(editable ? dropOnSection(s, si) : {})}
              className={cn("group relative flex items-center gap-1 px-2 py-1.5", drop?.id === s.id && drop.where === "into" && "rounded-t-xl bg-primary/15")}>
              {line(s.id, "before")}{line(s.id, "after")}
              {editable && (
                <span draggable onDragStart={dragStart({ kind: "section", id: s.id })} onDragEnd={dragEnd} title="Drag to reorder"
                  className="hidden h-6 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 hover:text-foreground [@media(hover:hover)_and_(pointer:fine)]:flex">
                  <GripVertical className="h-3.5 w-3.5" />
                </span>
              )}
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">{si + 1}.</span>
              {renaming === s.id ? (
                <RenameInput value={s.title} placeholder="Section title" onDone={(v) => {
                  setRenaming(null);
                  if (v !== null) changeContent((c) => { c.sections[si].title = v; });
                }} />
              ) : (
                <span onDoubleClick={() => editable && setRenaming(s.id)}
                  className={cn("line-clamp-2 min-w-0 flex-1 px-1 text-[13px] font-semibold leading-snug", !s.title.trim() && "italic font-normal text-muted-foreground")}>
                  {s.title.trim() || "Untitled section"}
                </span>
              )}
              {sIssues > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" title="Needs a title" />}
              {editable && (
                <Menu width={230} button={({ toggle, ref, open }) => (
                  <button ref={ref} onClick={toggle} aria-label="Section options"
                    className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground",
                      !open && "[@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:focus:opacity-100")}>
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                )}>
                  {(close) => (
                    <>
                      <MenuItem icon={Pencil} onSelect={() => { close(); setRenaming(s.id); }}>Rename section</MenuItem>
                      <MenuItem icon={Plus} onSelect={() => { close(); addLesson(s.id); }}>Add a lesson</MenuItem>
                      <MenuItem icon={ArrowUp} disabled={si === 0} onSelect={() => { close(); changeContent((c) => { const [x] = c.sections.splice(si, 1); c.sections.splice(si - 1, 0, x); }); }}>Move up</MenuItem>
                      <MenuItem icon={ArrowDown} disabled={si === content.sections.length - 1} onSelect={() => { close(); changeContent((c) => { const [x] = c.sections.splice(si, 1); c.sections.splice(si + 1, 0, x); }); }}>Move down</MenuItem>
                      <MenuDivider />
                      <MenuItem icon={Trash2} danger onSelect={() => {
                        close();
                        const n = s.lessons.reduce((a, l) => a + l.blocks.length, 0);
                        if (n && !confirm(`Delete the section “${s.title || "Untitled section"}” with its ${s.lessons.length} lesson(s) and ${n} block(s)? You can undo this.`)) return;
                        changeContent((c) => { c.sections.splice(si, 1); });
                      }}>Delete section</MenuItem>
                    </>
                  )}
                </Menu>
              )}
            </div>
            <div className="space-y-0.5 px-1.5 pb-1.5">
              {s.lessons.map((l, li) => {
                const active = sel.kind === "lesson" && sel.lessonId === l.id;
                const n = count((i) => i.lessonId === l.id);
                return (
                  <div key={l.id} {...(editable ? dropOnLesson(s, li) : {})}
                    className={cn("group relative flex items-center rounded-lg", active ? "bg-primary/15" : "hover:bg-card/70",
                      drop?.id === l.id && drop.where === "into" && "ring-2 ring-primary")}>
                    {line(l.id, "before")}{line(l.id, "after")}
                    {renaming === l.id ? (
                      <div className="flex-1 py-1 pl-2"><RenameInput value={l.title} placeholder="Lesson title" onDone={(v) => {
                        setRenaming(null);
                        if (v !== null) changeContent((c) => { const p = lessonPos(c, l.id); if (p) p.lesson.title = v; });
                      }} /></div>
                    ) : (
                      <button draggable={editable} onDragStart={dragStart({ kind: "lesson", id: l.id })} onDragEnd={dragEnd}
                        onClick={() => onSelectLesson(l.id)} onDoubleClick={() => editable && setRenaming(l.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left [@media(hover:hover)_and_(pointer:fine)]:py-1.5">
                        <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{li + 1}</span>
                        <span className={cn("line-clamp-2 min-w-0 flex-1 leading-snug", active ? "font-medium text-foreground" : "text-foreground/85", !l.title.trim() && "italic text-muted-foreground")}>
                          {l.title.trim() || "Untitled lesson"}
                        </span>
                        {n > 0
                          ? <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-200" title={`${n} to fix`}>{n}</span>
                          : <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{l.blocks.length}</span>}
                      </button>
                    )}
                    {editable && renaming !== l.id && (
                      <LessonMenu content={content} section={s} si={si} li={li} lesson={l} changeContent={changeContent}
                        onRename={() => setRenaming(l.id)} onSelect={onSelectLesson} hoverOnly={!active} />
                    )}
                  </div>
                );
              })}
              {s.lessons.length === 0 && <div className="px-2 py-1.5 text-xs italic text-muted-foreground">No lessons yet</div>}
              {editable && (
                <button onClick={() => addLesson(s.id)}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-card/70 hover:text-primary">
                  <Plus className="h-3.5 w-3.5" /> Add lesson
                </button>
              )}
            </div>
          </div>
        );
      })}
      {editable && (
        <button onClick={addSection}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary">
          <Plus className="h-3.5 w-3.5" /> Add section
        </button>
      )}
      {editable && <p className="hidden px-1 text-[11px] leading-4 text-muted-foreground [@media(hover:hover)_and_(pointer:fine)]:block">Drag lessons and sections to reorder. Drop a block on a lesson to move it there. Double-click a name to rename.</p>}
    </nav>
  );
}

function RenameInput({ value, placeholder, onDone }: { value: string; placeholder: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(value);
  const done = useRef(false);
  const finish = (x: string | null) => { if (done.current) return; done.current = true; onDone(x); };
  return (
    <input autoFocus className={cn(inputCls, "h-8 flex-1 py-1 text-sm")} value={v} placeholder={placeholder} maxLength={300}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)} onBlur={() => finish(v)}
      onKeyDown={(e) => { if (e.key === "Enter") finish(v); if (e.key === "Escape") finish(null); }} />
  );
}

function LessonMenu({ content, section, si, li, lesson, changeContent, onRename, onSelect, hoverOnly }: {
  content: CourseContent; section: Section; si: number; li: number; lesson: Lesson;
  changeContent: (fn: (c: CourseContent) => void) => void; onRename: () => void; onSelect: (id: string) => void; hoverOnly?: boolean;
}) {
  return (
    <Menu width={250} button={({ toggle, ref, open }) => (
      <button ref={ref} onClick={toggle} aria-label="Lesson options"
        className={cn("mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground",
          hoverOnly && !open && "[@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:focus:opacity-100")}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
    )}>
      {(close) => (
        <>
          <MenuItem icon={Pencil} onSelect={() => { close(); onRename(); }}>Rename lesson</MenuItem>
          <MenuItem icon={Copy} onSelect={() => {
            close();
            const nid = newId();
            changeContent((c) => {
              const p = lessonPos(c, lesson.id);
              if (p) p.section.lessons.splice(p.li + 1, 0, { id: nid, title: `${lesson.title} (copy)`.trim(), blocks: lesson.blocks.map(copyBlock) });
            });
            onSelect(nid);
          }}>Duplicate lesson</MenuItem>
          <MenuItem icon={ArrowUp} disabled={li === 0 && si === 0} onSelect={() => {
            close();
            changeContent((c) => (li > 0 ? moveLesson(c, lesson.id, section.id, li - 1) : moveLesson(c, lesson.id, c.sections[si - 1].id, Number.MAX_SAFE_INTEGER)));
          }}>Move up</MenuItem>
          <MenuItem icon={ArrowDown} disabled={li === section.lessons.length - 1 && si === content.sections.length - 1} onSelect={() => {
            close();
            changeContent((c) => (li < section.lessons.length - 1 ? moveLesson(c, lesson.id, section.id, li + 2) : moveLesson(c, lesson.id, c.sections[si + 1].id, 0)));
          }}>Move down</MenuItem>
          {content.sections.length > 1 && (
            <>
              <MenuLabel>Move to section</MenuLabel>
              {content.sections.map((s, i) => s.id !== section.id && (
                <MenuItem key={s.id} icon={FolderInput} onSelect={() => { close(); changeContent((c) => moveLesson(c, lesson.id, s.id, Number.MAX_SAFE_INTEGER)); }}>
                  {i + 1}. {s.title || "Untitled section"}
                </MenuItem>
              ))}
            </>
          )}
          <MenuDivider />
          <MenuItem icon={Trash2} danger onSelect={() => {
            close();
            if (lesson.blocks.length && !confirm(`Delete the lesson “${lesson.title || "Untitled lesson"}” and its ${lesson.blocks.length} block(s)? You can undo this.`)) return;
            changeContent((c) => { const p = lessonPos(c, lesson.id); if (p) p.section.lessons.splice(p.li, 1); });
          }}>Delete lesson</MenuItem>
        </>
      )}
    </Menu>
  );
}

// ── Course details ──────────────────────────────────────────────────────────
function DetailsPane({ details, problem, editable, files, content, loaded, onChange }: {
  details: Details; problem: string | null; editable: boolean; files: MediaFile[]; content: CourseContent; loaded: Loaded;
  onChange: (patch: Partial<Details>, key?: string) => void;
}) {
  const field = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ [k]: e.target.value }, `details:${k}`);
  const uses = (fid: string) => content.sections.flatMap((s) => s.lessons.flatMap((l) => l.blocks))
    .filter((b) => "mediaId" in b && (b as { mediaId?: string | null }).mediaId === fid).length;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold">Course details</h2>
        <p className="text-sm text-muted-foreground">What crew see in the catalogue, and how the course is marked.</p>
      </div>
      {problem && <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"><CircleAlert className="h-4 w-4 shrink-0" /> {problem}</div>}
      <fieldset disabled={!editable} className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card/60 p-4 sm:grid-cols-6">
        <div className="sm:col-span-4"><label className={labelCls}>Title</label><input className={inputCls} value={details.title} onChange={field("title")} maxLength={200} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Category</label><input className={inputCls} value={details.category} onChange={field("category")} placeholder="e.g. Safety, Interior" maxLength={100} /></div>
        <div className="sm:col-span-6"><label className={labelCls}>Summary (shown to crew)</label><textarea className={cn(inputCls, "min-h-[88px]")} value={details.summary} onChange={field("summary")} maxLength={2000} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Minutes to complete</label><input className={inputCls} type="number" inputMode="numeric" min={1} value={details.minutes} onChange={field("minutes")} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Pass mark %</label><input className={inputCls} type="number" inputMode="numeric" min={0} max={100} value={details.passMark} onChange={field("passMark")} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Refresher every (months)</label><input className={inputCls} type="number" inputMode="numeric" min={1} value={details.refreshMonths} onChange={field("refreshMonths")} placeholder="Once only" /></div>
        <label className="flex items-start gap-2 text-sm sm:col-span-6">
          <input type="checkbox" className="mt-0.5" checked={details.catalogue} onChange={(e) => onChange({ catalogue: e.target.checked })} />
          Show in the crew catalogue — crew can see it and ask to enrol (a training manager on board approves)
        </label>
      </fieldset>

      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Course files ({files.length})</h3>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files yet. Drop pictures, videos and PDFs onto blocks in a lesson; they're kept here to reuse.</p>
        ) : (
          <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card/40">
            {files.map((f) => {
              const n = uses(f.id);
              return (
                <div key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  {f.kind === "image" ? <Thumb mediaId={f.id} className="h-9 w-12" /> : (() => { const I = blockIcon(f.kind === "video" ? "video" : "document"); return <span className="flex h-9 w-12 items-center justify-center rounded-md bg-background/60"><I className="h-4 w-4 text-muted-foreground" /></span>; })()}
                  <span className="min-w-0 flex-1 truncate">{f.file_name}</span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{fmtSize(f.size_bytes)}</span>
                  <span className={cn("shrink-0 text-xs", n ? "text-muted-foreground" : "text-amber-200/80")}>{n ? `used ${n}×` : "not used"}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {loaded.versions.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Published versions</h3>
          <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card/40 text-sm">
            {loaded.versions.map((v) => (
              <div key={v.id} className="flex justify-between gap-3 px-3 py-2">
                <span>Version {v.version}</span>
                <span className="text-xs text-muted-foreground">{fmtDate(v.published_at)}{v.published_by_name ? ` · ${v.published_by_name}` : ""}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── One lesson ──────────────────────────────────────────────────────────────
function LessonPane({ content, section, si, lesson, issues, editable, courseId, files, maxUpload, onUploaded, openBlock, setOpenBlock,
  changeContent, onPreview, onScrollTo, saveNow, prev, next, onGoLesson }: {
  content: CourseContent; section: Section; si: number; lesson: Lesson; issues: Issue[]; editable: boolean; courseId: string;
  files: MediaFile[]; maxUpload: number; onUploaded: (f: MediaFile) => void;
  openBlock: string | null; setOpenBlock: (id: string | null) => void;
  changeContent: (fn: (c: CourseContent) => void, key?: string) => void;
  onPreview: () => void; onScrollTo: (id: string) => void; saveNow: () => Promise<boolean>;
  prev: Lesson | null; next: Lesson | null; onGoLesson: (id: string) => void;
}) {
  const api = useBackend();
  const [drop, setDrop] = useState<{ id: string; where: "before" | "after" } | null>(null);
  const [drafting, setDrafting] = useState<number | null>(null); // insert index for the AI dialog
  const sectionIssue = issues.find((i) => !i.lessonId);
  const lessonIssues = issues.filter((i) => i.lessonId && !i.blockId);

  const insert = (type: BlockType, at: number) => {
    const b = newBlock(type);
    changeContent((c) => { lessonPos(c, lesson.id)?.lesson.blocks.splice(at, 0, b); });
    setOpenBlock(b.id);
    onScrollTo(b.id);
  };
  const removeBlock = (b: Block, bi: number) => {
    changeContent((c) => { const p = lessonPos(c, lesson.id); p?.lesson.blocks.splice(bi, 1); });
    toast(`${BLOCK_LABELS[b.type]} block deleted`, {
      action: {
        label: "Undo",
        onClick: () => changeContent((c) => {
          const p = lessonPos(c, lesson.id);
          if (p && !blockPos(c, b.id)) p.lesson.blocks.splice(Math.min(bi, p.lesson.blocks.length), 0, b);
        }),
      },
    });
  };
  const runDraft = async (count: number, at: number) => {
    // Drafting reads the saved lesson, so save first.
    if (!(await saveNow())) { toast.error("Save your changes first, then try again."); return false; }
    try {
      const r = await api.post({ op: "draft-quiz", id: courseId, lessonId: lesson.id, count });
      if (!r.questions?.length) { toast.error("No usable questions came back — try again."); return false; }
      const b: Block = { id: newId(), type: "quiz", title: "Quiz (AI draft — check before publishing)", questions: r.questions };
      changeContent((c) => { lessonPos(c, lesson.id)?.lesson.blocks.splice(at, 0, b); });
      setOpenBlock(b.id);
      onScrollTo(b.id);
      toast.success(`${r.questions.length} questions drafted — check each one.`);
      return true;
    } catch (e: any) { toast.error(e.message); return false; }
  };
  const blockDrop = (b: Block, bi: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (dragging?.kind !== "block") return;
      e.preventDefault(); e.dataTransfer.dropEffect = "move";
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setDrop({ id: b.id, where: e.clientY < r.top + Math.min(r.height / 2, 40) ? "before" : "after" });
    },
    onDragLeave: (e: React.DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDrop(null); },
    onDrop: (e: React.DragEvent) => {
      if (dragging?.kind !== "block") return;
      e.preventDefault();
      const d = dragging, where = drop?.where;
      setDrop(null);
      if (d.id !== b.id) changeContent((c) => moveBlock(c, d.id, lesson.id, bi + (where === "after" ? 1 : 0)));
    },
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Section {si + 1}</span>
          <input data-section-title={section.id} disabled={!editable} value={section.title} placeholder="Section title" maxLength={300}
            onChange={(e) => changeContent((c) => { const s = c.sections.find((x) => x.id === section.id); if (s) s.title = e.target.value; }, `section:${section.id}`)}
            className={cn("min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground outline-none hover:border-border focus:border-primary/60 focus:text-foreground",
              sectionIssue && "border-amber-500/50")} />
        </div>
        <div className="flex items-start gap-2">
          <input disabled={!editable} value={lesson.title} placeholder="Lesson title" maxLength={300} aria-label="Lesson title"
            onChange={(e) => changeContent((c) => { const p = lessonPos(c, lesson.id); if (p) p.lesson.title = e.target.value; }, `lesson:${lesson.id}`)}
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-xl font-bold outline-none hover:border-border focus:border-primary/60 sm:text-2xl" />
          <ToolButton icon={Eye} onClick={onPreview} title="Preview this lesson" className="mt-1"><span className="hidden sm:inline">Preview lesson</span></ToolButton>
        </div>
        {(sectionIssue || lessonIssues.length > 0) && (
          <div className="flex flex-wrap gap-1.5 px-1.5">
            {[sectionIssue, ...lessonIssues].filter(Boolean).map((i, n) => <IssueChip key={n} text={i!.text} />)}
          </div>
        )}
      </div>

      {lesson.blocks.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">This lesson is empty. Add text, a picture or video, a quiz or an exercise.</p>
          {editable && <div className="mt-4 flex justify-center"><AddBlockMenu big onAdd={(t) => insert(t, 0)} onDraft={() => setDrafting(0)} /></div>}
        </div>
      ) : (
        <div className="space-y-1">
          {lesson.blocks.map((b, bi) => (
            <div key={b.id}>
              {editable && <InsertPoint onAdd={(t) => insert(t, bi)} onDraft={() => setDrafting(bi)} />}
              <BlockCard block={b} index={bi} count={lesson.blocks.length} open={openBlock === b.id} issues={issues.filter((i) => i.blockId === b.id)}
                editable={editable} files={files} courseId={courseId} maxUpload={maxUpload} onUploaded={onUploaded} content={content} lessonId={lesson.id}
                dropLine={drop?.id === b.id ? drop.where : null} dropProps={editable ? blockDrop(b, bi) : {}}
                onToggle={() => setOpenBlock(openBlock === b.id ? null : b.id)}
                onChange={(nb) => changeContent((c) => { const p = lessonPos(c, lesson.id); if (p) p.lesson.blocks[bi] = nb; }, `block:${b.id}`)}
                onMove={(d) => changeContent((c) => moveBlock(c, b.id, lesson.id, bi + (d > 0 ? 2 : -1)))}
                onDuplicate={() => {
                  const copy = copyBlock(b);
                  changeContent((c) => { lessonPos(c, lesson.id)?.lesson.blocks.splice(bi + 1, 0, copy); });
                  setOpenBlock(copy.id); onScrollTo(copy.id);
                }}
                onMoveTo={(lid) => {
                  changeContent((c) => moveBlock(c, b.id, lid, Number.MAX_SAFE_INTEGER));
                  const to = lessonPos(content, lid)?.lesson;
                  toast.success(`Moved to “${to?.title || "Untitled lesson"}”`, { action: { label: "Go there", onClick: () => onGoLesson(lid) } });
                }}
                onDelete={() => removeBlock(b, bi)} />
            </div>
          ))}
          {editable && <div className="pt-3"><AddBlockMenu big onAdd={(t) => insert(t, lesson.blocks.length)} onDraft={() => setDrafting(lesson.blocks.length)} /></div>}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-4">
        {prev ? <button onClick={() => onGoLesson(prev.id)} className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 shrink-0" /> <span className="truncate">{prev.title || "Untitled lesson"}</span></button> : <span />}
        {next ? <button onClick={() => onGoLesson(next.id)} className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <span className="truncate">{next.title || "Untitled lesson"}</span> <ArrowRight className="h-4 w-4 shrink-0" /></button> : <span />}
      </div>

      {drafting !== null && <DraftQuizDialog onClose={() => setDrafting(null)} onRun={async (n) => { const ok = await runDraft(n, drafting); if (ok) setDrafting(null); }} />}
    </div>
  );
}

const IssueChip = ({ text }: { text: string }) => (
  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-100"><CircleAlert className="h-3 w-3 text-amber-300" /> {text}</span>
);

function BlockCard({ block, index, count, open, issues, editable, files, courseId, maxUpload, onUploaded, content, lessonId, dropLine, dropProps,
  onToggle, onChange, onMove, onDuplicate, onMoveTo, onDelete }: {
  block: Block; index: number; count: number; open: boolean; issues: Issue[]; editable: boolean; files: MediaFile[]; courseId: string;
  maxUpload: number; onUploaded: (f: MediaFile) => void; content: CourseContent; lessonId: string;
  dropLine: "before" | "after" | null; dropProps: Record<string, unknown>;
  onToggle: () => void; onChange: (b: Block) => void; onMove: (d: -1 | 1) => void; onDuplicate: () => void; onMoveTo: (lessonId: string) => void; onDelete: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const Icon = blockIcon(block.type);
  const sum = blockSummary(block, files);
  const others = lessonsOf(content).filter((x) => x.lesson.id !== lessonId);
  return (
    <div ref={card} data-block-id={block.id} {...dropProps}
      className={cn("relative scroll-mt-24 rounded-xl border bg-card/60 transition-colors",
        open ? "border-primary/50 shadow-lg shadow-black/20" : "border-border hover:border-border/100 hover:bg-card/80",
        issues.length > 0 && !open && "border-amber-500/40")}>
      {dropLine && <span className={cn("pointer-events-none absolute inset-x-2 z-10 h-1 rounded bg-primary", dropLine === "before" ? "-top-[5px]" : "-bottom-[5px]")} />}
      <div className="flex items-center gap-1 pr-1">
        {editable && (
          <span draggable title="Drag to move"
            onDragStart={(e) => {
              dragging = { kind: "block", id: block.id };
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", block.id);
              if (card.current) e.dataTransfer.setDragImage(card.current, 24, 20);
            }}
            onDragEnd={() => { dragging = null; }}
            className="hidden h-11 w-6 shrink-0 cursor-grab items-center justify-center self-stretch rounded-l-xl text-muted-foreground/50 hover:bg-background/40 hover:text-foreground active:cursor-grabbing [@media(hover:hover)_and_(pointer:fine)]:flex">
            <GripVertical className="h-4 w-4" />
          </span>
        )}
        <button type="button" onClick={onToggle} aria-expanded={open}
          className={cn("flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left", editable ? "pl-3 [@media(hover:hover)_and_(pointer:fine)]:pl-0" : "pl-3")}>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background/60 text-muted-foreground"><Icon className="h-4 w-4" /></span>
          {sum.mediaId && <Thumb mediaId={sum.mediaId} className="hidden h-8 w-11 sm:block" />}
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{BLOCK_LABELS[block.type]}</span>
              {sum.detail && <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">· {sum.detail}</span>}
            </span>
            <span className={cn("block truncate text-sm", sum.title === "Empty" && "italic text-muted-foreground")}>{sum.title}</span>
          </span>
          {issues.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-100" title={issues.map((i) => i.text).join("\n")}>
              <CircleAlert className="h-3 w-3" /> {issues.length}
            </span>
          )}
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
        </button>
        {editable && (
          <Menu width={260} button={({ toggle, ref }) => (
            <button ref={ref} type="button" onClick={toggle} aria-label="Block options"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background/60 hover:text-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}>
            {(close) => (
              <>
                <MenuItem icon={ArrowUp} disabled={index === 0} onSelect={() => { close(); onMove(-1); }}>Move up</MenuItem>
                <MenuItem icon={ArrowDown} disabled={index === count - 1} onSelect={() => { close(); onMove(1); }}>Move down</MenuItem>
                <MenuItem icon={Copy} onSelect={() => { close(); onDuplicate(); }}>Duplicate</MenuItem>
                {others.length > 0 && (
                  <>
                    <MenuLabel>Move to lesson</MenuLabel>
                    <div className="max-h-56 overflow-y-auto">
                      {others.map(({ section, lesson }) => (
                        <MenuItem key={lesson.id} icon={FolderInput} description={section.title || "Untitled section"} onSelect={() => { close(); onMoveTo(lesson.id); }}>
                          {lesson.title || "Untitled lesson"}
                        </MenuItem>
                      ))}
                    </div>
                  </>
                )}
                <MenuDivider />
                <MenuItem icon={Trash2} danger onSelect={() => { close(); onDelete(); }}>Delete</MenuItem>
              </>
            )}
          </Menu>
        )}
      </div>
      {open && (
        <div className="@container border-t border-border/60 p-3 sm:p-4">
          {issues.length > 0 && <div className="mb-3 flex flex-wrap gap-1.5">{issues.map((i, n) => <IssueChip key={n} text={i.text} />)}</div>}
          <BlockFields block={block} editable={editable} courseId={courseId} files={files} maxUpload={maxUpload} onUploaded={onUploaded} onChange={onChange} />
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={onToggle} className="text-xs text-muted-foreground hover:text-foreground">Close block</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Adding blocks ───────────────────────────────────────────────────────────
function AddBlockMenu({ onAdd, onDraft, big }: { onAdd: (t: BlockType) => void; onDraft: () => void; big?: boolean }) {
  return (
    <Menu width={340} align="start" button={({ toggle, ref, open }) => big ? (
      <button ref={ref} type="button" onClick={toggle}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground transition hover:border-primary/60 hover:text-primary">
        <Plus className="h-4 w-4" /> Add block
      </button>
    ) : (
      <button ref={ref} type="button" onClick={toggle} aria-label="Insert a block here" title="Insert a block here"
        className={cn("relative flex h-6 w-6 items-center justify-center rounded-full border border-primary/60 bg-background text-primary shadow transition",
          open ? "opacity-100" : "opacity-0 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-60")}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    )}>
      {(close) => (
        <>
          {blockCatalogue().map((g) => (
            <div key={g.group}>
              <MenuLabel>{g.group}</MenuLabel>
              {g.items.map((it) => (
                <MenuItem key={it.type} icon={blockIcon(it.type)} description={it.description} onSelect={() => { close(); onAdd(it.type); }}>{it.label}</MenuItem>
              ))}
              {g.group === "Check understanding" && (
                <MenuItem icon={Sparkles} description="Claude reads this lesson's text and PDFs and drafts questions for you to check"
                  onSelect={() => { close(); onDraft(); }}>Draft a quiz with AI</MenuItem>
              )}
            </div>
          ))}
        </>
      )}
    </Menu>
  );
}

/** A thin gap between blocks with a "+" to insert there (always shown on touch screens). */
function InsertPoint({ onAdd, onDraft }: { onAdd: (t: BlockType) => void; onDraft: () => void }) {
  return (
    <div className="group relative flex h-4 items-center justify-center">
      <span className="absolute inset-x-6 h-px bg-primary/0 transition group-hover:bg-primary/40" />
      <AddBlockMenu onAdd={onAdd} onDraft={onDraft} />
    </div>
  );
}

function DraftQuizDialog({ onClose, onRun }: { onClose: () => void; onRun: (n: number) => Promise<void> }) {
  const [n, setN] = useState(5);
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-lg font-bold"><Sparkles className="h-5 w-5 text-violet-300" /> Draft a quiz with AI</div>
        <p className="mt-1 text-sm text-muted-foreground">Claude reads this lesson's text and PDFs and drafts questions. They arrive as a quiz block for you to check before publishing.</p>
        <label className="mt-4 block text-sm font-medium">How many questions?</label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[3, 4, 5, 6, 8, 10].map((x) => (
            <button key={x} type="button" onClick={() => setN(x)}
              className={cn("h-9 w-11 rounded-lg border text-sm", n === x ? "border-primary bg-primary/15 font-semibold" : "border-border hover:bg-background/60")}>{x}</button>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <ToolButton icon={X} onClick={onClose} disabled={busy}>Cancel</ToolButton>
          <ToolButton icon={Sparkles} primary busy={busy} onClick={async () => { setBusy(true); try { await onRun(n); } finally { setBusy(false); } }}>
            {busy ? "Drafting…" : "Draft questions"}
          </ToolButton>
        </div>
      </div>
    </div>
  );
}
