/**
 * Crew Academy — the JLS course library and course creator (staff).
 *
 * List of JLS courses → open one in the course creator (builder/editor.tsx):
 * an outline of sections → lessons on the left, the selected lesson's blocks on
 * the right, autosaved. Preview runs the real course player with local marking.
 * Publish snapshots the draft as a new version (crew part-way through keep the
 * version they started); Vessels chooses which vessels can use it. Vessels then
 * enrol their own crew from the Client Portal — nothing here shows crew or
 * results (private to the vessel).
 *
 * Talks to /api/academy-admin. Permission: the Crew Academy module — View to
 * look, Create to write, Edit to publish and offer; global admins can do all.
 */
import { useCallback, useEffect, useState } from "react";
import { Eye, GraduationCap, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { openAuthedPdf } from "@/components/academy/open-pdf";
import type { CourseContent } from "@/lib/academy/content";
import { Editor } from "@/components/academy/builder/editor";
import { Preview } from "@/components/academy/builder/preview";
import { BackendCtx, JLS_BACKEND, StatusPill, ToolButton, adminFetch, fmtDate, post, type CourseBackend } from "@/components/academy/builder/shared";

export type { CourseBackend } from "@/components/academy/builder/shared";
export { Preview } from "@/components/academy/builder/preview";

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

/** The course creator. Wrap with a backend for a vessel's own courses; JLS's library is the default. */
export function CourseEditor({ id, onBack, backend = JLS_BACKEND }: { id: string; onBack: () => void; backend?: CourseBackend }) {
  return <BackendCtx.Provider value={backend}><Editor id={id} onBack={onBack} /></BackendCtx.Provider>;
}
