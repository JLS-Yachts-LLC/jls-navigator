/**
 * Crew Academy — the JLS course library and course creator (staff).
 *
 * List of JLS courses → open one to edit: details, then sections → lessons →
 * blocks (reading, video, PDF, picture, quiz, read & understood). Preview runs
 * the real course player with local marking. Publish snapshots the draft as a
 * new version (crew part-way through keep the version they started); Offer
 * chooses which vessels can use it. Vessels then enrol their own crew from the
 * Client Portal — nothing here shows crew or results (private to the vessel).
 *
 * Talks to /api/academy-admin. Permission: the Crew Academy module — View to
 * look, Create to write, Edit to publish and offer; global admins can do all.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowUp, Archive, CheckCircle2, Crosshair, Eye, FileText, Film, GraduationCap, Image as ImageIcon,
  LayoutGrid, Link2, ListChecks, ListOrdered, Loader2, Plus, RotateCcw, Save, Send, Ship, Signature, Sparkles, Trash2, Type, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/ui/markdown";
import { CoursePlayer, type PlayerApi } from "@/components/academy/course-player";
import { openAuthedPdf } from "@/components/academy/open-pdf";
import {
  BLOCK_LABELS, emptyContent, embedUrl, findBlock, forLearner, gradeBlock, isGraded, newBlock, newId, newPair, newQuestion, publishProblems,
  type Block, type BlockProgress, type BlockType, type CourseContent, type HotspotBlock, type MatchBlock, type OrderBlock,
  type Question, type QuizBlock, type SortBlock,
} from "@/lib/academy/content";

async function adminFetch(path: string, init: RequestInit = {}): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ""}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error ?? `Request failed (${res.status})`), { status: res.status, body });
  return body;
}
const post = (body: unknown) =>
  adminFetch("/api/academy-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/**
 * Where the course creator reads and writes. JLS's library uses
 * /api/academy-admin; a vessel writing its own courses in the Client Portal
 * passes a backend for /api/portal/academy (same operations, its own scope).
 */
export type CourseBackend = {
  /** GET with this query string, e.g. "op=course&id=…". */
  get: (query: string) => Promise<any>;
  post: (body: unknown) => Promise<any>;
  /** JLS only: choose which vessels a course is offered to. */
  canOffer: boolean;
  /** Shown as "From …" in the preview. */
  owner: string;
  backLabel: string;
};
const JLS_BACKEND: CourseBackend = {
  get: (q) => adminFetch(`/api/academy-admin?${q}`), post, canOffer: true, owner: "JLS Yachts", backLabel: "Course library",
};
const BackendCtx = createContext<CourseBackend>(JLS_BACKEND);

const inputCls = "w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/60";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground";
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

type CourseRow = {
  id: string; title: string; summary: string | null; category: string | null; status: string;
  offerAll: boolean; offeredTo: number; versions: number; published: boolean; updatedAt: string;
};

export function CourseLibrary() {
  const [list, setList] = useState<{ canCreate: boolean; canEdit: boolean; courses: CourseRow[]; sharedCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<"library" | "shared">("library");

  const load = useCallback(async () => {
    try { setList(await adminFetch("/api/academy-admin?op=courses")); setError(null); }
    catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (openId) return <CourseEditor id={openId} onBack={() => { setOpenId(null); void load(); }} />;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><GraduationCap className="h-5 w-5 text-primary" /> Crew Academy</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            JLS's course library for yacht crew. Publish a course, offer it to vessels, and each vessel enrols its own crew from the
            Client Portal. Crew, results and a vessel's own courses stay private to the vessel.
          </p>
        </div>
        {list?.canCreate && tab === "library" && (
          <button onClick={async () => {
            const title = prompt("Course title");
            if (!title?.trim()) return;
            try { const r = await post({ op: "create", title }); setOpenId(r.id); } catch (e: any) { toast.error(e.message); }
          }} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> New course
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-border text-sm">
        {(["library", "shared"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn("-mb-px border-b-2 px-3 py-2 font-medium", tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {k === "library" ? "JLS courses" : `Shared with JLS${list?.sharedCount ? ` (${list.sharedCount})` : ""}`}
          </button>
        ))}
      </div>

      {tab === "shared" && <SharedWithJls />}
      {tab === "library" && error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
      {tab === "library" && !list && !error && <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
      {tab === "library" && list && list.courses.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center text-sm text-muted-foreground">
          No courses yet.{list.canCreate ? " Start with “New course”." : ""}
        </div>
      )}
      {tab === "library" && list && list.courses.length > 0 && (
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card/60">
          {list.courses.map((c) => (
            <button key={c.id} onClick={() => setOpenId(c.id)} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-card">
              <div className="min-w-0">
                <div className="font-medium">{c.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {c.category ? `${c.category} · ` : ""}
                  {c.versions ? `version ${c.versions}` : "never published"} · updated {fmtDate(c.updatedAt)}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{c.offerAll ? "All vessels" : c.offeredTo ? `${c.offeredTo} vessel${c.offeredTo === 1 ? "" : "s"}` : "Not offered"}</span>
                <StatusPill status={c.status} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared with JLS ─────────────────────────────────────────────────────────
type SharedData = {
  courses: { shareId: string; courseId: string; title: string; summary: string | null; vessel: string; sharedBy: string | null; note: string | null; sharedAt: string; status: string }[];
  people: { shareId: string; learnerId: string; name: string; email: string; active: boolean; vessel: string; sharedBy: string | null; sharedByKind: string; sharedAt: string;
    results: { enrolmentId: string; certificate: string | null; course: string; from: string; status: string; mandatory: boolean; dueDate: string | null; completedAt: string | null; score: number | null; expiresAt: string | null }[] }[];
};

/** What vessels (and crew) have chosen to show JLS — read-only; they can withdraw it any time. */
function SharedWithJls() {
  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; passMark: number; vessel: string; content: CourseContent } | null>(null);
  useEffect(() => { adminFetch("/api/academy-admin?op=shared").then(setData).catch((e) => setError(e.message)); }, []);

  if (preview) {
    return (
      <div className="pds pds-embed dark fixed inset-0 z-50 overflow-y-auto bg-background text-foreground" style={{ colorScheme: "dark" }}>
        <Preview title={preview.title} content={preview.content} passMark={preview.passMark} from={preview.vessel} onExit={() => setPreview(null)}
          mediaUrl={async (id) => (await adminFetch(`/api/academy-admin?op=media-url&id=${encodeURIComponent(id)}`)).url ?? null}
          banner={<div className="mt-4 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
            {preview.vessel}'s course, shared with JLS for review. Nothing here is recorded.
          </div>} />
      </div>
    );
  }
  if (error) return <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>;
  if (!data) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!data.courses.length && !data.people.length) {
    return <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center text-sm text-muted-foreground">
      Nothing shared yet. Vessels can share one of their own courses, or a crew member's results, for JLS to review.
    </div>;
  }
  return (
    <div className="space-y-6">
      {data.courses.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Vessels' courses</h2>
          <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card/60">
            {data.courses.map((c) => (
              <div key={c.shareId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium">{c.title} <span className="text-xs font-normal text-muted-foreground">· {c.vessel}</span></div>
                  <div className="mt-0.5 text-xs text-muted-foreground">Shared {fmtDate(c.sharedAt)}{c.sharedBy ? ` by ${c.sharedBy}` : ""}{c.note ? ` — “${c.note}”` : ""}</div>
                </div>
                <ToolButton icon={Eye} onClick={async () => {
                  try { setPreview(await adminFetch(`/api/academy-admin?op=shared-course&id=${encodeURIComponent(c.courseId)}`)); }
                  catch (e: any) { toast.error(e.message); }
                }}>Open</ToolButton>
              </div>
            ))}
          </div>
        </section>
      )}
      {data.people.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Crew training records</h2>
          <div className="space-y-3">
            {data.people.map((p) => (
              <div key={p.shareId} className="rounded-xl border border-border bg-card/60 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-medium">{p.name} <span className="text-xs font-normal text-muted-foreground">· {p.vessel}{p.active ? "" : " · no longer on board"}</span></div>
                  <div className="text-xs text-muted-foreground">Shared by {p.sharedByKind === "crew" ? "them" : p.sharedBy ?? "the vessel"} · {fmtDate(p.sharedAt)}</div>
                </div>
                {p.results.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No courses yet.</p> : (
                  <table className="mt-2 w-full text-sm">
                    <tbody className="divide-y divide-border/50">
                      {p.results.map((r, i) => (
                        <tr key={i}>
                          <td className="py-1.5 pr-3">{r.course} <span className="text-xs text-muted-foreground">({r.from})</span></td>
                          <td className="py-1.5 pr-3 text-xs">{r.status === "completed" ? `Passed${r.score != null ? ` ${r.score}%` : ""} · ${fmtDate(r.completedAt)}` : r.status.replace("_", " ")}</td>
                          <td className="py-1.5 text-right text-xs text-muted-foreground">
                            {r.expiresAt ? `valid until ${fmtDate(r.expiresAt)}` : r.dueDate && r.status !== "completed" ? `due ${fmtDate(r.dueDate)}` : ""}
                            {r.certificate && (
                              <button className="ml-2 text-primary hover:underline" onClick={() => void openAuthedPdf(async () => {
                                const { data: { session } } = await supabase.auth.getSession();
                                return fetch(`/api/academy-admin?op=certificate&enrolment=${encodeURIComponent(r.enrolmentId)}`, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
                              }).catch((e) => toast.error(e.message))}>Certificate</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = status === "published" ? "bg-emerald-500/15 text-emerald-300" : status === "archived" ? "bg-slate-500/15 text-slate-300" : "bg-amber-500/15 text-amber-300";
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", cls)}>{status}</span>;
}

// ═══════════════════════════════════════════════════════════════════════════
type Details = { title: string; summary: string; category: string; minutes: string; passMark: string; refreshMonths: string };
type MediaFile = { id: string; kind: string; file_name: string; mime_type: string | null; size_bytes: number | null };
type Loaded = {
  canCreate: boolean; canEdit: boolean;
  course: { id: string; title: string; summary: string | null; category: string | null; minutes: number | null; passMark: number;
    refreshMonths: number | null; status: string; offerAll: boolean; currentVersionId: string | null; content: CourseContent };
  versions: { id: string; version: number; published_at: string; published_by_name: string | null }[];
  offeredTo: string[];
  files: MediaFile[];
  maxUploadBytes: number;
};

/** The course creator. Wrap with a backend for a vessel's own courses; JLS's library is the default. */
export function CourseEditor({ id, onBack, backend = JLS_BACKEND }: { id: string; onBack: () => void; backend?: CourseBackend }) {
  return <BackendCtx.Provider value={backend}><Editor id={id} onBack={onBack} /></BackendCtx.Provider>;
}

function Editor({ id, onBack }: { id: string; onBack: () => void }) {
  const api = useContext(BackendCtx);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [content, setContent] = useState<CourseContent>(emptyContent());
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [offering, setOffering] = useState(false);

  const load = useCallback(async () => {
    const d: Loaded = await api.get(`op=course&id=${encodeURIComponent(id)}`);
    setLoaded(d);
    setDetails({
      title: d.course.title, summary: d.course.summary ?? "", category: d.course.category ?? "",
      minutes: d.course.minutes?.toString() ?? "", passMark: String(d.course.passMark), refreshMonths: d.course.refreshMonths?.toString() ?? "",
    });
    setContent(d.course.content.sections.length ? d.course.content : emptyContent());
    setFiles(d.files);
    setDirty(false);
  }, [id]);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load]);

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const editable = !!loaded?.canCreate;
  const change = (fn: (c: CourseContent) => CourseContent) => { setContent((c) => fn(structuredClone(c))); setDirty(true); };
  const setD = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setDetails((d) => d && { ...d, [k]: e.target.value }); setDirty(true);
  };

  const save = async (quiet = false) => {
    if (!details) return false;
    setBusy("save");
    try {
      const r = await api.post({
        op: "save", id, title: details.title, summary: details.summary, category: details.category,
        minutes: details.minutes || null, passMark: details.passMark || 80, refreshMonths: details.refreshMonths || null, content,
      });
      setContent(r.content); setDirty(false);
      if (!quiet) toast.success("Saved");
      return true;
    } catch (e: any) { toast.error(e.message); return false; }
    finally { setBusy(null); }
  };

  const publish = async () => {
    const local = publishProblems(content);
    setProblems(local);
    if (local.length) { toast.error("Fix the items listed before publishing."); return; }
    if (!(await save(true))) return;
    setBusy("publish");
    try {
      const r = await api.post({ op: "publish", id });
      toast.success(`Published version ${r.version}`);
      await load();
    } catch (e: any) {
      setProblems(e.body?.problems ?? []); toast.error(e.message);
    } finally { setBusy(null); }
  };

  if (!loaded || !details) return <div className="flex justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  if (previewing) {
    return (
      <div className="pds pds-embed dark min-h-screen bg-background text-foreground" style={{ colorScheme: "dark" }}>
        <Preview title={details.title} content={content} passMark={Number(details.passMark) || 80} onExit={() => setPreviewing(false)} />
      </div>
    );
  }

  const latest = loaded.versions[0];
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 pb-24 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => { if (!dirty || confirm("Leave without saving your changes?")) onBack(); }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {api.backLabel}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={loaded.course.status} />
          <span className="text-xs text-muted-foreground">
            {latest ? `v${latest.version} published ${fmtDate(latest.published_at)}${latest.published_by_name ? ` by ${latest.published_by_name}` : ""}` : "Not published yet"}
          </span>
          <ToolButton onClick={() => setPreviewing(true)} icon={Eye}>Preview</ToolButton>
          {editable && <ToolButton onClick={() => void save()} icon={Save} busy={busy === "save"} primary={dirty}>{dirty ? "Save" : "Saved"}</ToolButton>}
          {loaded.canEdit && <ToolButton onClick={() => void publish()} icon={Send} busy={busy === "publish"}>Publish{latest ? " new version" : ""}</ToolButton>}
          {loaded.canEdit && api.canOffer && <ToolButton onClick={() => setOffering(true)} icon={Ship}>Vessels</ToolButton>}
          {loaded.canEdit && (
            loaded.course.status === "archived"
              ? <ToolButton icon={RotateCcw} onClick={async () => { await api.post({ op: "restore", id }); await load(); }}>Restore</ToolButton>
              : <ToolButton icon={Archive} onClick={async () => {
                  if (!confirm("Archive this course? Vessels can't enrol anyone new; crew already on it can finish.")) return;
                  await api.post({ op: "archive", id }); await load();
                }}>Archive</ToolButton>
          )}
        </div>
      </div>

      {problems.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <div className="mb-1.5 flex items-center justify-between font-semibold text-amber-200">
            Before this can be published
            <button onClick={() => setProblems([])} aria-label="Dismiss"><X className="h-4 w-4" /></button>
          </div>
          <ul className="ml-4 list-disc space-y-0.5 text-amber-100/80">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}

      {/* Details */}
      <fieldset disabled={!editable} className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card/60 p-4 sm:grid-cols-6">
        <div className="sm:col-span-4"><label className={labelCls}>Title</label><input className={inputCls} value={details.title} onChange={setD("title")} maxLength={200} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Category</label><input className={inputCls} value={details.category} onChange={setD("category")} placeholder="e.g. Safety, Interior" maxLength={100} /></div>
        <div className="sm:col-span-6"><label className={labelCls}>Summary (shown to crew)</label><textarea className={cn(inputCls, "min-h-[64px]")} value={details.summary} onChange={setD("summary")} maxLength={2000} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Minutes to complete</label><input className={inputCls} type="number" min={1} value={details.minutes} onChange={setD("minutes")} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Pass mark %</label><input className={inputCls} type="number" min={0} max={100} value={details.passMark} onChange={setD("passMark")} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Refresher every (months)</label><input className={inputCls} type="number" min={1} value={details.refreshMonths} onChange={setD("refreshMonths")} placeholder="Once only" /></div>
      </fieldset>

      {/* Structure */}
      <div className="space-y-4">
        {content.sections.map((s, si) => (
          <div key={s.id} className="rounded-xl border border-border bg-card/40">
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Section {si + 1}</span>
              <input className={cn(inputCls, "flex-1 py-1.5 font-semibold")} value={s.title} disabled={!editable} placeholder="Section title"
                onChange={(e) => change((c) => { c.sections[si].title = e.target.value; return c; })} />
              {editable && <MoveButtons i={si} n={content.sections.length}
                onMove={(d) => change((c) => { swap(c.sections, si, si + d); return c; })}
                onDelete={() => { if (confirm("Delete this section and its lessons?")) change((c) => { c.sections.splice(si, 1); return c; }); }} />}
            </div>
            <div className="space-y-3 p-3 sm:p-4">
              {s.lessons.map((l, li) => (
                <div key={l.id} className="rounded-lg border border-border/70 bg-background/30">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span className="text-[11px] text-muted-foreground">Lesson {li + 1}</span>
                    <input className={cn(inputCls, "flex-1 py-1.5")} value={l.title} disabled={!editable} placeholder="Lesson title"
                      onChange={(e) => change((c) => { c.sections[si].lessons[li].title = e.target.value; return c; })} />
                    {editable && <MoveButtons i={li} n={s.lessons.length}
                      onMove={(d) => change((c) => { swap(c.sections[si].lessons, li, li + d); return c; })}
                      onDelete={() => { if (confirm("Delete this lesson?")) change((c) => { c.sections[si].lessons.splice(li, 1); return c; }); }} />}
                  </div>
                  <div className="space-y-2.5 px-3 pb-3">
                    {l.blocks.map((b, bi) => (
                      <BlockEditor key={b.id} block={b} editable={editable} courseId={id} files={files} maxUpload={loaded.maxUploadBytes}
                        onUploaded={(f) => setFiles((fs) => [f, ...fs])}
                        onChange={(nb) => change((c) => { c.sections[si].lessons[li].blocks[bi] = nb; return c; })}
                        tools={editable && <MoveButtons i={bi} n={l.blocks.length}
                          onMove={(d) => change((c) => { swap(c.sections[si].lessons[li].blocks, bi, bi + d); return c; })}
                          onDelete={() => change((c) => { c.sections[si].lessons[li].blocks.splice(bi, 1); return c; })} />} />
                    ))}
                    {editable && <AddBlock onAdd={(t) => change((c) => { c.sections[si].lessons[li].blocks.push(newBlock(t)); return c; })}
                      onDraft={async () => {
                        const raw = prompt("How many questions should be drafted? (3–10)", "5");
                        if (raw === null) return;
                        // Drafting reads the saved lesson, so save first.
                        if (dirty && !(await save(true))) return;
                        try {
                          const r = await api.post({ op: "draft-quiz", id, lessonId: l.id, count: Number(raw) || 5 });
                          if (!r.questions?.length) { toast.error("No usable questions came back — try again."); return; }
                          change((c) => {
                            c.sections[si].lessons[li].blocks.push({ id: newId(), type: "quiz", title: "Quiz (AI draft — check before publishing)", questions: r.questions });
                            return c;
                          });
                          toast.success(`${r.questions.length} questions drafted — check each one, then save.`);
                        } catch (e: any) { toast.error(e.message); }
                      }} />}
                  </div>
                </div>
              ))}
              {editable && (
                <button onClick={() => change((c) => { c.sections[si].lessons.push({ id: newId(), title: "", blocks: [] }); return c; })}
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Plus className="h-4 w-4" /> Add lesson</button>
              )}
            </div>
          </div>
        ))}
        {editable && (
          <button onClick={() => change((c) => { c.sections.push({ id: newId(), title: "", lessons: [{ id: newId(), title: "", blocks: [] }] }); return c; })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            <Plus className="h-4 w-4" /> Add section
          </button>
        )}
      </div>

      {offering && <OfferModal id={id} offerAll={loaded.course.offerAll} offeredTo={loaded.offeredTo}
        published={!!loaded.course.currentVersionId} onClose={() => setOffering(false)} onSaved={() => { setOffering(false); void load(); }} />}
    </div>
  );
}

function swap<T>(arr: T[], a: number, b: number) {
  if (b < 0 || b >= arr.length) return;
  [arr[a], arr[b]] = [arr[b], arr[a]];
}

function ToolButton({ onClick, icon: Icon, children, busy, primary }: {
  onClick: () => void; icon: any; children: React.ReactNode; busy?: boolean; primary?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={busy}
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition disabled:opacity-50",
        primary ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card/60 hover:bg-card")}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />} {children}
    </button>
  );
}

function MoveButtons({ i, n, onMove, onDelete }: { i: number; n: number; onMove: (d: -1 | 1) => void; onDelete: () => void }) {
  const btn = "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-30";
  return (
    <div className="flex shrink-0 items-center">
      <button className={btn} disabled={i === 0} onClick={() => onMove(-1)} title="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
      <button className={btn} disabled={i === n - 1} onClick={() => onMove(1)} title="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
      <button className={cn(btn, "hover:text-red-300")} onClick={onDelete} title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}

const BLOCK_ICONS: Record<BlockType, any> = {
  reading: Type, video: Film, document: FileText, image: ImageIcon, quiz: ListChecks, acknowledge: Signature,
  match: Link2, order: ListOrdered, sort: LayoutGrid, hotspot: Crosshair,
};

function AddBlock({ onAdd, onDraft }: { onAdd: (t: BlockType) => void; onDraft?: () => Promise<void> }) {
  const [drafting, setDrafting] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      {onDraft && (
        <button disabled={drafting} onClick={async () => { setDrafting(true); try { await onDraft(); } finally { setDrafting(false); } }}
          title="Claude reads this lesson's text and PDFs and drafts quiz questions for you to check"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-violet-500/40 bg-violet-500/10 px-2 text-xs text-violet-200 hover:border-violet-400 disabled:opacity-60">
          {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {drafting ? "Drafting…" : "Draft quiz with AI"}
        </button>
      )}
      <span className="mr-1 text-xs text-muted-foreground">Add:</span>
      {(Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => {
        const Icon = BLOCK_ICONS[t];
        return (
          <button key={t} onClick={() => onAdd(t)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card/60 px-2 text-xs hover:border-primary/50 hover:text-primary">
            <Icon className="h-3.5 w-3.5" /> {BLOCK_LABELS[t]}
          </button>
        );
      })}
    </div>
  );
}

// ── Block editors ────────────────────────────────────────────────────────────
function BlockEditor({ block, editable, courseId, files, maxUpload, onUploaded, onChange, tools }: {
  block: Block; editable: boolean; courseId: string; files: MediaFile[]; maxUpload: number;
  onUploaded: (f: MediaFile) => void; onChange: (b: Block) => void; tools: React.ReactNode;
}) {
  const Icon = BLOCK_ICONS[block.type];
  const set = (patch: Partial<Block>) => onChange({ ...block, ...patch } as Block);
  return (
    <div className="rounded-lg border border-border bg-card/70">
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {BLOCK_LABELS[block.type]}</span>
        {tools}
      </div>
      <fieldset disabled={!editable} className="space-y-2.5 p-3">
        {block.type === "reading" && <ReadingEditor value={block.markdown} onChange={(markdown) => set({ markdown })} />}
        {block.type === "video" && (
          <>
            <input className={inputCls} placeholder="Title (optional)" value={block.title ?? ""} onChange={(e) => set({ title: e.target.value })} />
            <MediaPicker kind="video" accept="video/mp4" mediaId={block.mediaId ?? null} courseId={courseId} files={files} maxUpload={maxUpload}
              onUploaded={onUploaded} onPick={(mediaId) => set({ mediaId, url: null })} />
            {!block.mediaId && (
              <div>
                <input className={inputCls} placeholder="…or paste a YouTube / Vimeo link" value={block.url ?? ""} onChange={(e) => set({ url: e.target.value })} />
                {block.url && !embedUrl(block.url) && <p className="mt-1 text-xs text-amber-300">Only YouTube and Vimeo links can be played.</p>}
                {block.url && embedUrl(block.url) && <p className="mt-1 text-xs text-muted-foreground">Linked videos can't be tracked — they count as watched once opened.</p>}
              </div>
            )}
            {block.mediaId && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={block.mustWatch} onChange={(e) => set({ mustWatch: e.target.checked })} /> Must be watched to the end
              </label>
            )}
          </>
        )}
        {block.type === "document" && (
          <>
            <input className={inputCls} placeholder="Title shown to crew" value={block.title ?? ""} onChange={(e) => set({ title: e.target.value })} />
            <MediaPicker kind="document" accept="application/pdf" mediaId={block.mediaId} courseId={courseId} files={files} maxUpload={maxUpload}
              onUploaded={onUploaded} onPick={(mediaId) => set({ mediaId })} />
          </>
        )}
        {block.type === "image" && (
          <>
            <MediaPicker kind="image" accept="image/jpeg,image/png,image/webp,image/gif" mediaId={block.mediaId} courseId={courseId} files={files} maxUpload={maxUpload}
              onUploaded={onUploaded} onPick={(mediaId) => set({ mediaId })} />
            <input className={inputCls} placeholder="Caption (optional)" value={block.caption ?? ""} onChange={(e) => set({ caption: e.target.value })} />
          </>
        )}
        {block.type === "acknowledge" && (
          <textarea className={cn(inputCls, "min-h-[56px]")} value={block.statement} onChange={(e) => set({ statement: e.target.value })}
            placeholder="What the crew member confirms, e.g. I have read and understood the garbage management plan." />
        )}
        {block.type === "quiz" && <QuizEditor block={block} onChange={onChange} />}
        {(block.type === "match" || block.type === "order" || block.type === "sort" || block.type === "hotspot") && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input className={inputCls} placeholder="Title (optional)" value={block.title ?? ""} onChange={(e) => set({ title: e.target.value })} />
            <input className={inputCls} placeholder="Instruction shown to crew" value={block.prompt ?? ""} onChange={(e) => set({ prompt: e.target.value })} />
          </div>
        )}
        {block.type === "match" && <MatchEditor block={block} onChange={onChange} />}
        {block.type === "order" && <OrderEditor block={block} onChange={onChange} />}
        {block.type === "sort" && <SortEditor block={block} onChange={onChange} />}
        {block.type === "hotspot" && (
          <>
            <MediaPicker kind="image" accept="image/jpeg,image/png,image/webp,image/gif" mediaId={block.mediaId} courseId={courseId} files={files} maxUpload={maxUpload}
              onUploaded={onUploaded} onPick={(mediaId) => set({ mediaId })} />
            {block.mediaId && <HotspotEditor block={block} onChange={onChange} />}
          </>
        )}
      </fieldset>
    </div>
  );
}

function ReadingEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [preview, setPreview] = useState(false);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span>Text — **bold**, *italic*, # headings, - lists, [links](https://…)</span>
        <button type="button" onClick={() => setPreview((p) => !p)} className="hover:text-foreground">{preview ? "Edit" : "Preview"}</button>
      </div>
      {preview
        ? <div className="min-h-[120px] rounded-lg border border-border bg-background/40 p-3"><Markdown>{value || "_Nothing yet_"}</Markdown></div>
        : <textarea className={cn(inputCls, "min-h-[160px] font-mono text-[13px]")} value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

// ── Exercise editors ─────────────────────────────────────────────────────────
function MatchEditor({ block, onChange }: { block: MatchBlock; onChange: (b: Block) => void }) {
  const setPair = (i: number, patch: Partial<MatchBlock["pairs"][number]>) =>
    onChange({ ...block, pairs: block.pairs.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">Write each item and its match. Crew see the right-hand answers shuffled and drag them into place.</p>
      {block.pairs.map((p, i) => (
        <div key={p.id} className="flex items-center gap-2">
          <input className={cn(inputCls, "py-1.5")} placeholder={`Item ${i + 1}`} value={p.left} onChange={(e) => setPair(i, { left: e.target.value })} />
          <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input className={cn(inputCls, "py-1.5")} placeholder="Its match" value={p.right} onChange={(e) => setPair(i, { right: e.target.value })} />
          {block.pairs.length > 2 && (
            <button type="button" onClick={() => onChange({ ...block, pairs: block.pairs.filter((_, j) => j !== i) })}
              className="text-muted-foreground hover:text-red-300" title="Remove pair"><X className="h-4 w-4" /></button>
          )}
        </div>
      ))}
      {block.pairs.length < 20 && (
        <button type="button" onClick={() => onChange({ ...block, pairs: [...block.pairs, newPair()] })} className="text-xs text-primary hover:underline">+ Add pair</button>
      )}
    </div>
  );
}

function OrderEditor({ block, onChange }: { block: OrderBlock; onChange: (b: Block) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">Write the steps in the RIGHT order. Crew get them shuffled.</p>
      {block.items.map((it, i) => (
        <div key={it.id} className="flex items-center gap-2">
          <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}.</span>
          <input className={cn(inputCls, "py-1.5")} placeholder={`Step ${i + 1}`} value={it.text}
            onChange={(e) => onChange({ ...block, items: block.items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
          <MoveButtons i={i} n={block.items.length}
            onMove={(d) => { const items = [...block.items]; swap(items, i, i + d); onChange({ ...block, items }); }}
            onDelete={() => { if (block.items.length > 2) onChange({ ...block, items: block.items.filter((_, j) => j !== i) }); }} />
        </div>
      ))}
      {block.items.length < 20 && (
        <button type="button" onClick={() => onChange({ ...block, items: [...block.items, { id: newId(), text: "" }] })} className="text-xs text-primary hover:underline">+ Add step</button>
      )}
    </div>
  );
}

function SortEditor({ block, onChange }: { block: SortBlock; onChange: (b: Block) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 text-[11px] text-muted-foreground">Groups</div>
        <div className="flex flex-wrap gap-2">
          {block.buckets.map((b, i) => (
            <div key={b.id} className="flex items-center gap-1">
              <input className={cn(inputCls, "w-40 py-1.5")} placeholder={`Group ${i + 1}`} value={b.text}
                onChange={(e) => onChange({ ...block, buckets: block.buckets.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              {block.buckets.length > 2 && (
                <button type="button" title="Remove group" className="text-muted-foreground hover:text-red-300" onClick={() => {
                  const buckets = block.buckets.filter((_, j) => j !== i);
                  onChange({ ...block, buckets, items: block.items.map((it) => (it.bucketId === b.id ? { ...it, bucketId: buckets[0].id } : it)) });
                }}><X className="h-4 w-4" /></button>
              )}
            </div>
          ))}
          {block.buckets.length < 6 && (
            <button type="button" onClick={() => onChange({ ...block, buckets: [...block.buckets, { id: newId(), text: "" }] })} className="text-xs text-primary hover:underline">+ Add group</button>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-[11px] text-muted-foreground">Items, each with the group it belongs in</div>
        {block.items.map((it, i) => (
          <div key={it.id} className="flex items-center gap-2">
            <input className={cn(inputCls, "py-1.5")} placeholder={`Item ${i + 1}`} value={it.text}
              onChange={(e) => onChange({ ...block, items: block.items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
            <select className={cn(inputCls, "w-44 py-1.5")} value={it.bucketId}
              onChange={(e) => onChange({ ...block, items: block.items.map((x, j) => (j === i ? { ...x, bucketId: e.target.value } : x)) })}>
              {block.buckets.map((b, bi) => <option key={b.id} value={b.id}>{b.text || `Group ${bi + 1}`}</option>)}
            </select>
            {block.items.length > 2 && (
              <button type="button" title="Remove item" className="text-muted-foreground hover:text-red-300"
                onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></button>
            )}
          </div>
        ))}
        {block.items.length < 30 && (
          <button type="button" onClick={() => onChange({ ...block, items: [...block.items, { id: newId(), text: "", bucketId: block.buckets[0]?.id ?? "" }] })}
            className="text-xs text-primary hover:underline">+ Add item</button>
        )}
      </div>
    </div>
  );
}

/** Click the picture to mark a right place; resize or remove each mark below. */
function HotspotEditor({ block, onChange }: { block: HotspotBlock; onChange: (b: Block) => void }) {
  const api = useContext(BackendCtx);
  const [url, setUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState(0.66);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!block.mediaId) return;
    api.get(`op=media-url&id=${encodeURIComponent(block.mediaId)}`).then((r) => setUrl(r.url ?? null)).catch(() => setUrl(null));
  }, [api, block.mediaId]);
  const style = (x: number, y: number, r: number) => ({ left: `${x - r}%`, top: `${(y - r) / aspect}%`, width: `${r * 2}%`, height: `${(r * 2) / aspect}%` });
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">Click the picture to mark the right place (you can mark more than one). A tap anywhere inside a circle counts as right.</p>
      {url ? (
        <div ref={ref} className="relative max-w-xl cursor-crosshair overflow-hidden rounded-lg" onClick={(e) => {
          if (!ref.current || block.spots.length >= 10) return;
          const r = ref.current.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.width) * 100;
          onChange({ ...block, spots: [...block.spots, { id: newId(), x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: 6 }] });
        }}>
          <img src={url} alt="" className="block w-full select-none" draggable={false}
            onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth) setAspect(i.naturalHeight / i.naturalWidth); }} />
          {block.spots.map((s, i) => (
            <span key={s.id} className="absolute flex items-center justify-center rounded-full border-2 border-emerald-400 bg-emerald-400/25 text-[10px] font-bold text-white"
              style={style(s.x, s.y, s.r)}>{i + 1}</span>
          ))}
        </div>
      ) : <div className="text-xs text-muted-foreground">Loading picture…</div>}
      {block.spots.map((s, i) => (
        <div key={s.id} className="flex items-center gap-3 text-xs">
          <span className="w-16">Place {i + 1}</span>
          <span className="text-muted-foreground">size</span>
          <input type="range" min={2} max={25} value={s.r} className="w-40"
            onChange={(e) => onChange({ ...block, spots: block.spots.map((x, j) => (j === i ? { ...x, r: Number(e.target.value) } : x)) })} />
          <button type="button" className="text-muted-foreground hover:text-red-300"
            onClick={() => onChange({ ...block, spots: block.spots.filter((_, j) => j !== i) })}>Remove</button>
        </div>
      ))}
    </div>
  );
}

function MediaPicker({ kind, accept, mediaId, courseId, files, maxUpload, onUploaded, onPick }: {
  kind: "video" | "image" | "document"; accept: string; mediaId: string | null; courseId: string; files: MediaFile[]; maxUpload: number;
  onUploaded: (f: MediaFile) => void; onPick: (mediaId: string | null) => void;
}) {
  const api = useContext(BackendCtx);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const current = files.find((f) => f.id === mediaId);

  const upload = async (file: File) => {
    if (file.size > maxUpload) {
      toast.error(`That file is ${(file.size / 1048576).toFixed(0)} MB — the limit is ${maxUpload / 1048576} MB.${kind === "video" ? " Export at 720p (H.264 MP4) to make it smaller." : ""}`);
      return;
    }
    setUploading(file.name);
    try {
      const r = await api.post({ op: "upload-url", courseId, fileName: file.name, mimeType: file.type, size: file.size });
      const { error } = await supabase.storage.from(r.bucket).uploadToSignedUrl(r.path, r.token, file, { contentType: file.type });
      if (error) throw error;
      onUploaded({ id: r.mediaId, kind: r.kind, file_name: file.name, mime_type: file.type, size_bytes: file.size });
      onPick(r.mediaId);
    } catch (e: any) { toast.error(e.message ?? "Upload failed"); }
    finally { setUploading(null); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {current ? (
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-background/50 px-2.5 py-1.5 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className="truncate">{current.file_name}</span>
          {current.size_bytes ? <span className="text-xs text-muted-foreground">({(current.size_bytes / 1048576).toFixed(1)} MB)</span> : null}
        </span>
      ) : mediaId ? <span className="text-sm text-muted-foreground">File attached</span> : null}
      <button type="button" onClick={() => inputRef.current?.click()} disabled={!!uploading}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs hover:bg-card disabled:opacity-50">
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {uploading ? `Uploading ${uploading}…` : mediaId ? "Replace" : kind === "video" ? "Upload MP4" : kind === "document" ? "Upload PDF" : "Upload picture"}
      </button>
      {mediaId && <button type="button" onClick={() => onPick(null)} className="text-xs text-muted-foreground hover:text-red-300">Remove</button>}
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
      {kind === "video" && !mediaId && <span className="text-[11px] text-muted-foreground">720p MP4, up to {maxUpload / 1048576} MB</span>}
    </div>
  );
}

function QuizEditor({ block, onChange }: { block: QuizBlock; onChange: (b: Block) => void }) {
  const setQ = (qi: number, patch: Partial<Question>) =>
    onChange({ ...block, questions: block.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)) });
  return (
    <div className="space-y-3">
      <input className={inputCls} placeholder="Quiz title (optional)" value={block.title ?? ""} onChange={(e) => onChange({ ...block, title: e.target.value })} />
      {block.questions.map((q, qi) => (
        <div key={q.id} className="rounded-lg border border-border/70 bg-background/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Q{qi + 1}</span>
            <select className={cn(inputCls, "w-auto py-1.5")} value={q.kind} onChange={(e) => {
              const nq = newQuestion(e.target.value as Question["kind"]);
              setQ(qi, { kind: nq.kind, options: e.target.value === "truefalse" ? nq.options : (q.kind === "truefalse" ? nq.options : q.options), correct: [] });
            }}>
              <option value="single">One right answer</option>
              <option value="multi">Several right answers</option>
              <option value="truefalse">True or false</option>
            </select>
            <div className="ml-auto">
              <MoveButtons i={qi} n={block.questions.length}
                onMove={(d) => { const qs = [...block.questions]; swap(qs, qi, qi + d); onChange({ ...block, questions: qs }); }}
                onDelete={() => onChange({ ...block, questions: block.questions.filter((_, i) => i !== qi) })} />
            </div>
          </div>
          <textarea className={cn(inputCls, "mt-2 min-h-[48px]")} placeholder="Question" value={q.prompt} onChange={(e) => setQ(qi, { prompt: e.target.value })} />
          <div className="mt-2 space-y-1.5">
            {q.options.map((o, oi) => {
              const right = q.correct.includes(o.id);
              return (
                <div key={o.id} className="flex items-center gap-2">
                  <button type="button" title={right ? "Right answer" : "Mark as a right answer"}
                    onClick={() => setQ(qi, { correct: q.kind === "multi" ? (right ? q.correct.filter((c) => c !== o.id) : [...q.correct, o.id]) : [o.id] })}
                    className={cn("flex h-7 w-7 shrink-0 items-center justify-center border", q.kind === "multi" ? "rounded-md" : "rounded-full",
                      right ? "border-emerald-500 bg-emerald-500/20 text-emerald-300" : "border-border text-muted-foreground/40 hover:text-muted-foreground")}>
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                  <input className={cn(inputCls, "py-1.5")} value={o.text} disabled={q.kind === "truefalse"} placeholder={`Answer ${oi + 1}`}
                    onChange={(e) => setQ(qi, { options: q.options.map((x, i) => (i === oi ? { ...x, text: e.target.value } : x)) })} />
                  {q.kind !== "truefalse" && q.options.length > 2 && (
                    <button type="button" onClick={() => setQ(qi, { options: q.options.filter((_, i) => i !== oi), correct: q.correct.filter((c) => c !== o.id) })}
                      className="text-muted-foreground hover:text-red-300" title="Remove answer"><X className="h-4 w-4" /></button>
                  )}
                </div>
              );
            })}
            {q.kind !== "truefalse" && q.options.length < 10 && (
              <button type="button" onClick={() => setQ(qi, { options: [...q.options, { id: newId(), text: "" }] })}
                className="text-xs text-primary hover:underline">+ Add answer</button>
            )}
          </div>
          <input className={cn(inputCls, "mt-2")} placeholder="Explanation shown after they pass (optional)" value={q.explanation ?? ""}
            onChange={(e) => setQ(qi, { explanation: e.target.value })} />
        </div>
      ))}
      <button type="button" onClick={() => onChange({ ...block, questions: [...block.questions, newQuestion("single")] })}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Plus className="h-4 w-4" /> Add question</button>
      <p className="text-[11px] text-muted-foreground">Tick the circle next to each right answer. Crew can retry a quiz until they reach the pass mark.</p>
    </div>
  );
}

// ── Preview (local marking, nothing saved) ───────────────────────────────────
export function Preview({ title, content, passMark, onExit, mediaUrl, from, banner }: {
  title: string; content: CourseContent; passMark: number; onExit: () => void;
  /** Defaults to the creator's backend. */
  mediaUrl?: (mediaId: string) => Promise<string | null>;
  from?: string; banner?: React.ReactNode;
}) {
  const backend = useContext(BackendCtx);
  const progress = useRef<Map<string, BlockProgress>>(new Map());
  const snapshot = () => ({ progress: [...progress.current.values()] });
  const touch = (blockId: string, patch: Partial<BlockProgress>) =>
    progress.current.set(blockId, { ...(progress.current.get(blockId) ?? { block_id: blockId }), ...patch });

  const api = useMemo<PlayerApi>(() => ({
    mediaUrl: mediaUrl ?? (async (mediaId) => (await backend.get(`op=media-url&id=${encodeURIComponent(mediaId)}`)).url ?? null),
    viewed: async (lessonId) => {
      const lesson = content.sections.flatMap((s) => s.lessons).find((l) => l.id === lessonId);
      for (const b of lesson?.blocks ?? []) {
        if (b.type === "reading" || b.type === "image" || b.type === "document" || (b.type === "video" && !(b.mediaId && b.mustWatch))) {
          touch(b.id, { viewed_at: new Date().toISOString() });
        }
      }
      return snapshot();
    },
    video: async (blockId, percent) => {
      touch(blockId, { viewed_at: new Date().toISOString(), video_percent: Math.max(progress.current.get(blockId)?.video_percent ?? 0, percent) });
      return snapshot();
    },
    answer: async (blockId, answers) => {
      const found = findBlock(content, blockId);
      if (!found || !isGraded(found.block)) throw new Error("Not a quiz or exercise");
      const r = gradeBlock(found.block, answers, passMark);
      const prev = progress.current.get(blockId);
      touch(blockId, { score: Math.max(prev?.score ?? 0, r.score), completed_at: prev?.completed_at ?? (r.passed ? new Date().toISOString() : null) });
      return {
        ...snapshot(),
        result: { ...r, passMark, solution: r.passed ? r.solution : undefined, questions: r.questions.map((q) => (r.passed ? q : { id: q.id, correct: q.correct, rightAnswers: [] })) },
      };
    },
    acknowledge: async (blockId) => { touch(blockId, { completed_at: new Date().toISOString() }); return snapshot(); },
  }), [content, passMark, mediaUrl, backend]);
  // What crew would get: answer keys stripped, exercises shuffled.
  const learnerCopy = useMemo(() => forLearner(content), [content]);

  return (
    <CoursePlayer title={title} from={from ?? backend.owner} content={learnerCopy} passMark={passMark} initialProgress={[]} api={api}
      onExit={onExit} exitLabel={banner ? "Back" : "Back to editing"}
      banner={banner ?? <div className="mt-4 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
        Preview of the unsaved draft, as crew will see it. Nothing here is recorded.
      </div>} />
  );
}

// ── Offer to vessels ─────────────────────────────────────────────────────────
function OfferModal({ id, offerAll, offeredTo, published, onClose, onSaved }: {
  id: string; offerAll: boolean; offeredTo: string[]; published: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [vessels, setVessels] = useState<{ id: string; vessel_name: string }[] | null>(null);
  const [all, setAll] = useState(offerAll);
  const [picked, setPicked] = useState<Set<string>>(new Set(offeredTo));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { adminFetch("/api/academy-admin?op=vessels").then((r) => setVessels(r.vessels)).catch((e) => toast.error(e.message)); }, []);
  const shown = (vessels ?? []).filter((v) => v.vessel_name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Offer to vessels</h2>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Vessels with Crew Academy switched on will see this course and can enrol their crew.
          {!published && " It appears to them once it's published."}
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Every vessel
        </label>
        {!all && (
          <>
            <input className={cn(inputCls, "mt-3")} placeholder="Search vessels" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
              {!vessels ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : shown.map((v) => (
                <label key={v.id} className="flex cursor-pointer items-center gap-2 border-b border-border/40 px-3 py-1.5 text-sm last:border-0 hover:bg-background/40">
                  <input type="checkbox" checked={picked.has(v.id)} onChange={(e) => {
                    const next = new Set(picked); e.target.checked ? next.add(v.id) : next.delete(v.id); setPicked(next);
                  }} /> {v.vessel_name}
                </label>
              ))}
            </div>
            <div className="mt-1.5 text-xs text-muted-foreground">{picked.size} chosen</div>
          </>
        )}
        <button disabled={busy} onClick={async () => {
          setBusy(true);
          try { await post({ op: "offer", id, offerAll: all, yachtIds: all ? [] : [...picked] }); toast.success("Saved"); onSaved(); }
          catch (e: any) { toast.error(e.message); setBusy(false); }
        }} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save
        </button>
      </div>
    </div>
  );
}
