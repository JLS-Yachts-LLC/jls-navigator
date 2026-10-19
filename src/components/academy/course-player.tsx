/**
 * The Crew Academy course player — one lesson at a time, phone first.
 *
 * Used by crew taking a course (/academy, backed by /api/academy) and by JLS
 * staff previewing a draft (the course creator, backed by local marking). The
 * caller supplies a PlayerApi; the player never marks anything itself, so on
 * the crew side the answer key stays on the server.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Circle, ExternalLink, FileText, Loader2, PartyPopper, RotateCcw, XCircle,
} from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";
import {
  VIDEO_DONE_PERCENT, blockDone, courseOutcome, embedUrl,
  type Block, type BlockProgress, type CourseContent, type QuizBlock,
} from "@/lib/academy/content";

export type QuizResultView = {
  score: number; right: number; total: number; passed: boolean; passMark: number;
  questions: { id: string; correct: boolean; rightAnswers: string[]; explanation?: string }[];
};
export type PlayerUpdate = { progress: BlockProgress[]; outcome?: { status?: string; score?: number | null } };

export type PlayerApi = {
  mediaUrl: (mediaId: string) => Promise<string | null>;
  viewed: (lessonId: string) => Promise<PlayerUpdate | void>;
  video: (blockId: string, percent: number, seconds: number) => Promise<PlayerUpdate | void>;
  answer: (blockId: string, answers: Record<string, string[]>) => Promise<PlayerUpdate & { result: QuizResultView }>;
  acknowledge: (blockId: string) => Promise<PlayerUpdate | void>;
};

export function CoursePlayer({ title, from, content, passMark, initialProgress, initialStatus, api, onExit, exitLabel = "My courses", banner }: {
  title: string;
  from?: string;
  content: CourseContent;
  passMark: number;
  initialProgress: BlockProgress[];
  initialStatus?: string;
  api: PlayerApi;
  onExit: () => void;
  exitLabel?: string;
  /** Shown above the lesson, e.g. "Preview — answers aren't saved". */
  banner?: React.ReactNode;
}) {
  const lessons = useMemo(
    () => content.sections.flatMap((s) => s.lessons.map((l) => ({ ...l, sectionTitle: s.title }))),
    [content],
  );
  const [progress, setProgress] = useState<BlockProgress[]>(initialProgress);
  const [status, setStatus] = useState(initialStatus ?? "in_progress");
  const [index, setIndex] = useState(() => {
    // Open on the first lesson that isn't finished.
    const byId = new Map(initialProgress.map((p) => [p.block_id, p]));
    const i = lessons.findIndex((l) => l.blocks.some((b) => !blockDone(b, byId.get(b.id))));
    return i < 0 ? 0 : i;
  });
  const [listOpen, setListOpen] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(progress.map((p) => [p.block_id, p])), [progress]);
  const outcome = useMemo(() => courseOutcome(content, progress), [content, progress]);
  const lesson = lessons[index];

  const apply = useCallback((u: PlayerUpdate | void) => {
    if (!u) return;
    setProgress(u.progress);
    if (u.outcome?.status) setStatus(u.outcome.status);
  }, []);

  useEffect(() => {
    if (!lesson) return;
    void api.viewed(lesson.id).then(apply).catch(() => undefined);
    topRef.current?.scrollIntoView({ block: "start" });
  }, [lesson?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lessonDone = (l: (typeof lessons)[number]) => l.blocks.length > 0 && l.blocks.every((b) => blockDone(b, byId.get(b.id)));
  const pct = outcome.total ? Math.round((outcome.done / outcome.total) * 100) : 0;
  const complete = status === "completed" || outcome.complete;

  return (
    <div ref={topRef} className="mx-auto min-h-screen max-w-3xl px-4 pb-24 pt-4 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <button onClick={onExit} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {exitLabel}
        </button>
        <span className="text-xs text-muted-foreground">{pct}% done</span>
      </div>

      <h1 className="mt-3 text-xl font-bold leading-snug sm:text-2xl">{title}</h1>
      {from && <div className="mt-0.5 text-xs text-muted-foreground">From {from}</div>}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border/60">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      {banner}

      {complete && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <div className="font-semibold text-emerald-200">Course complete</div>
            <div className="text-sm text-emerald-100/80">
              {outcome.score != null ? `Your score: ${outcome.score}%. ` : ""}Well done — it's recorded on your training record.
            </div>
          </div>
        </div>
      )}

      {/* Lessons */}
      <div className="mt-5 rounded-2xl border border-border bg-card/60">
        <button onClick={() => setListOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Lesson {index + 1} of {lessons.length}{lesson?.sectionTitle ? ` · ${lesson.sectionTitle}` : ""}
            </div>
            <div className="truncate font-semibold">{lesson?.title || "Lesson"}</div>
          </div>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", listOpen && "rotate-180")} />
        </button>
        {listOpen && (
          <ol className="border-t border-border/60 py-1">
            {lessons.map((l, i) => (
              <li key={l.id}>
                <button onClick={() => { setIndex(i); setListOpen(false); }}
                  className={cn("flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm hover:bg-card", i === index && "text-primary")}>
                  {lessonDone(l) ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />}
                  <span className="truncate">{l.title || `Lesson ${i + 1}`}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="mt-5 space-y-5">
        {lesson?.blocks.map((b) => (
          <BlockView key={b.id} block={b} progress={byId.get(b.id)} passMark={passMark} api={api} onUpdate={apply} locked={status === "completed"} />
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <button disabled={index === 0} onClick={() => setIndex((i) => i - 1)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm disabled:opacity-40">
          <ArrowLeft className="h-4 w-4" /> Previous
        </button>
        {index < lessons.length - 1 ? (
          <button onClick={() => setIndex((i) => i + 1)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
            Next lesson <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={onExit} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
            {complete ? "Finish" : "Back to my courses"}
          </button>
        )}
      </div>
      {!complete && index === lessons.length - 1 && outcome.done < outcome.total && (
        <p className="mt-3 text-right text-xs text-muted-foreground">
          {outcome.total - outcome.done} part{outcome.total - outcome.done === 1 ? "" : "s"} still to finish — look for the empty circles in the lesson list.
        </p>
      )}
    </div>
  );
}

// ── Blocks ───────────────────────────────────────────────────────────────────
function BlockShell({ done, label, children }: { done: boolean; label?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card/70 p-4 sm:p-5">
      {label && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
          {done && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> Done</span>}
        </div>
      )}
      {children}
    </section>
  );
}

function useMediaUrl(api: PlayerApi, mediaId: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!mediaId) return;
    let live = true;
    api.mediaUrl(mediaId).then((u) => { if (live) u ? setUrl(u) : setError("Could not load the file."); })
      .catch((e) => live && setError(e?.message ?? "Could not load the file."));
    return () => { live = false; };
  }, [api, mediaId]);
  return { url, error };
}

function BlockView({ block, progress, passMark, api, onUpdate, locked }: {
  block: Block; progress: BlockProgress | undefined; passMark: number; api: PlayerApi;
  onUpdate: (u: PlayerUpdate | void) => void; locked: boolean;
}) {
  const done = blockDone(block, progress);
  switch (block.type) {
    case "reading":
      return <BlockShell done={false}><Markdown className="text-[15px]">{block.markdown}</Markdown></BlockShell>;
    case "image":
      return <ImageView block={block} api={api} />;
    case "document":
      return <DocumentView block={block} api={api} />;
    case "video":
      return <VideoView block={block} api={api} progress={progress} done={done} onUpdate={onUpdate} />;
    case "acknowledge":
      return <AcknowledgeView block={block} api={api} done={done} onUpdate={onUpdate} when={progress?.completed_at ?? null} />;
    case "quiz":
      return <QuizView block={block} api={api} done={done} best={progress?.score ?? null} passMark={passMark} onUpdate={onUpdate} locked={locked} />;
  }
}

function ImageView({ block, api }: { block: Extract<Block, { type: "image" }>; api: PlayerApi }) {
  const { url, error } = useMediaUrl(api, block.mediaId);
  return (
    <figure className="overflow-hidden rounded-2xl border border-border bg-card/70">
      {url ? <img src={url} alt={block.caption ?? ""} className="w-full" loading="lazy" />
        : <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">{error ?? <Loader2 className="h-5 w-5 animate-spin" />}</div>}
      {block.caption && <figcaption className="px-4 py-2.5 text-sm text-muted-foreground">{block.caption}</figcaption>}
    </figure>
  );
}

function DocumentView({ block, api }: { block: Extract<Block, { type: "document" }>; api: PlayerApi }) {
  const { url, error } = useMediaUrl(api, block.mediaId);
  return (
    <BlockShell done={false} label="Document">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileText className="h-5 w-5 shrink-0 text-primary" />
          <span className="truncate font-medium">{block.title || "PDF document"}</span>
        </div>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm hover:bg-card">
            <ExternalLink className="h-4 w-4" /> Open
          </a>
        ) : <span className="text-xs text-muted-foreground">{error ?? "Loading…"}</span>}
      </div>
      {url && <iframe src={url} title={block.title || "Document"} className="mt-3 hidden h-[70vh] w-full rounded-lg border border-border bg-white sm:block" />}
    </BlockShell>
  );
}

function VideoView({ block, api, progress, done, onUpdate }: {
  block: Extract<Block, { type: "video" }>; api: PlayerApi; progress: BlockProgress | undefined; done: boolean;
  onUpdate: (u: PlayerUpdate | void) => void;
}) {
  const external = !block.mediaId ? embedUrl(block.url) : null;
  const { url, error } = useMediaUrl(api, block.mediaId);
  // Furthest point reached, so skipping ahead doesn't count as watching.
  const furthest = useRef(0);
  const lastSent = useRef(progress?.video_percent ?? 0);

  const report = (el: HTMLVideoElement, force = false) => {
    if (!el.duration || !isFinite(el.duration)) return;
    const pos = el.currentTime;
    if (pos <= furthest.current + 2) furthest.current = Math.max(furthest.current, pos);
    const pct = Math.min(100, Math.round((furthest.current / el.duration) * 100));
    if (force || pct >= lastSent.current + 10 || (pct >= VIDEO_DONE_PERCENT && lastSent.current < VIDEO_DONE_PERCENT)) {
      lastSent.current = Math.max(lastSent.current, pct);
      void api.video(block.id, pct, Math.round(furthest.current)).then(onUpdate).catch(() => undefined);
    }
  };

  return (
    <BlockShell done={done && !!block.mediaId && block.mustWatch} label={block.title || "Video"}>
      {block.mediaId ? (
        url ? (
          <video src={url} controls playsInline preload="metadata" className="aspect-video w-full rounded-lg bg-black"
            onTimeUpdate={(e) => report(e.currentTarget)} onPause={(e) => report(e.currentTarget, true)} onEnded={(e) => report(e.currentTarget, true)} />
        ) : <div className="flex aspect-video items-center justify-center rounded-lg bg-black/40 text-sm text-muted-foreground">{error ?? <Loader2 className="h-5 w-5 animate-spin" />}</div>
      ) : external ? (
        <iframe src={external} title={block.title || "Video"} className="aspect-video w-full rounded-lg bg-black"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
      ) : <div className="text-sm text-muted-foreground">This video isn't available.</div>}
      {block.mediaId && block.mustWatch && !done && (
        <p className="mt-2 text-xs text-muted-foreground">
          Watch to the end to complete this part{progress?.video_percent ? ` — ${progress.video_percent}% watched so far` : ""}.
        </p>
      )}
    </BlockShell>
  );
}

function AcknowledgeView({ block, api, done, onUpdate, when }: {
  block: Extract<Block, { type: "acknowledge" }>; api: PlayerApi; done: boolean; onUpdate: (u: PlayerUpdate | void) => void; when: string | null;
}) {
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <BlockShell done={done} label="Sign-off">
      {done ? (
        <p className="text-sm"><span className="font-medium">{block.statement}</span>
          <span className="mt-1 block text-xs text-muted-foreground">Confirmed{when ? ` ${new Date(when).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}.</span></p>
      ) : (
        <>
          <label className="flex cursor-pointer items-start gap-3 text-[15px]">
            <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />
            <span>{block.statement}</span>
          </label>
          {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
          <button disabled={!ticked || busy} onClick={async () => {
            setBusy(true); setError(null);
            try { onUpdate(await api.acknowledge(block.id)); } catch (e: any) { setError(e?.message ?? "Could not save"); }
            setBusy(false);
          }} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirm
          </button>
        </>
      )}
    </BlockShell>
  );
}

function QuizView({ block, api, done, best, passMark, onUpdate, locked }: {
  block: QuizBlock; api: PlayerApi; done: boolean; best: number | null; passMark: number;
  onUpdate: (u: PlayerUpdate | void) => void; locked: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<QuizResultView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultById = new Map((result?.questions ?? []).map((q) => [q.id, q]));
  const allAnswered = block.questions.every((q) => (answers[q.id] ?? []).length > 0);

  if (done && !result) {
    return (
      <BlockShell done label={block.title || "Quiz"}>
        <p className="text-sm">Passed{best != null ? ` with ${best}%` : ""}.</p>
      </BlockShell>
    );
  }

  const pick = (qid: string, oid: string, multi: boolean) => {
    if (result) return;
    setAnswers((a) => {
      const cur = a[qid] ?? [];
      return { ...a, [qid]: multi ? (cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid]) : [oid] };
    });
  };

  return (
    <BlockShell done={done} label={block.title || "Quiz"}>
      <p className="mb-4 text-xs text-muted-foreground">
        {block.questions.length} question{block.questions.length === 1 ? "" : "s"} · pass mark {passMark}%{best != null && !done ? ` · your best so far ${best}%` : ""}
      </p>
      <ol className="space-y-5">
        {block.questions.map((q, qi) => {
          const r = resultById.get(q.id);
          const multi = q.kind === "multi";
          return (
            <li key={q.id}>
              <div className="flex items-start gap-2">
                {r && (r.correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />)}
                <div className="font-medium">{qi + 1}. {q.prompt}</div>
              </div>
              {multi && !r && <div className="mt-0.5 text-xs text-muted-foreground">Choose all that apply</div>}
              <div className="mt-2 space-y-2">
                {q.options.map((o) => {
                  const chosen = (answers[q.id] ?? []).includes(o.id);
                  const isRight = !!r && r.rightAnswers.includes(o.id);
                  return (
                    <button key={o.id} type="button" onClick={() => pick(q.id, o.id, multi)} disabled={!!result || locked}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-[15px] transition",
                        chosen ? "border-primary/60 bg-primary/10" : "border-border bg-background/40 hover:bg-card",
                        isRight && "border-emerald-500/60 bg-emerald-500/10",
                      )}>
                      <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center border", multi ? "rounded-md" : "rounded-full",
                        chosen ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50")}>
                        {chosen && <CheckCircle2 className="h-3.5 w-3.5" />}
                      </span>
                      <span>{o.text}</span>
                    </button>
                  );
                })}
              </div>
              {r?.explanation && <p className="mt-2 rounded-lg bg-background/50 px-3 py-2 text-sm text-muted-foreground">{r.explanation}</p>}
            </li>
          );
        })}
      </ol>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      {result ? (
        <div className={cn("mt-5 rounded-xl border p-3.5", result.passed ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10")}>
          <div className="font-semibold">{result.passed ? "Passed" : "Not quite"} — {result.right} of {result.total} right ({result.score}%)</div>
          {!result.passed && (
            <>
              <p className="mt-1 text-sm text-muted-foreground">You need {result.passMark}% to pass. Have another look at the lesson and try again.</p>
              <button onClick={() => { setResult(null); setAnswers({}); }}
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm">
                <RotateCcw className="h-4 w-4" /> Try again
              </button>
            </>
          )}
        </div>
      ) : (
        <button disabled={!allAnswered || busy || locked} onClick={async () => {
          setBusy(true); setError(null);
          try {
            const u = await api.answer(block.id, answers);
            setResult(u.result); onUpdate(u);
          } catch (e: any) { setError(e?.message ?? "Could not submit"); }
          setBusy(false);
        }} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Submit answers
        </button>
      )}
    </BlockShell>
  );
}
