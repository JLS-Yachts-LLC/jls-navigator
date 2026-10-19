/**
 * Pieces shared by the course player (course-player.tsx) and its interactive
 * exercises (exercises.tsx): the PlayerApi the caller supplies, the block frame,
 * file links, and the submit / result / retry flow every marked block uses.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BlockProgress } from "@/lib/academy/content";

export type QuizResultView = {
  score: number; right: number; total: number; passed: boolean; passMark: number;
  questions: { id: string; correct: boolean; rightAnswers: string[]; explanation?: string }[];
  /** An exercise's full answer — sent only once it's passed. */
  solution?: unknown;
};
export type PlayerUpdate = { progress: BlockProgress[]; outcome?: { status?: string; score?: number | null } };

export type PlayerApi = {
  mediaUrl: (mediaId: string) => Promise<string | null>;
  viewed: (lessonId: string) => Promise<PlayerUpdate | void>;
  video: (blockId: string, percent: number, seconds: number) => Promise<PlayerUpdate | void>;
  /** Answers are block-shaped: see gradeBlock() in lib/academy/content. */
  answer: (blockId: string, answers: unknown) => Promise<PlayerUpdate & { result: QuizResultView }>;
  acknowledge: (blockId: string) => Promise<PlayerUpdate | void>;
};

export function BlockShell({ done, label, children }: { done: boolean; label?: string; children: React.ReactNode }) {
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

export function useMediaUrl(api: PlayerApi, mediaId: string | null | undefined) {
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

/** Submit answers for a marked block, hold the result, and reset for a retry. */
export function useSubmit(api: PlayerApi, blockId: string, onUpdate: (u: PlayerUpdate | void) => void) {
  const [result, setResult] = useState<QuizResultView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (answers: unknown) => {
    setBusy(true); setError(null);
    try {
      const u = await api.answer(blockId, answers);
      setResult(u.result); onUpdate(u);
    } catch (e: any) { setError(e?.message ?? "Could not submit"); }
    setBusy(false);
  };
  return { result, busy, error, submit, reset: () => setResult(null) };
}

/** "Passed / Not quite" with Try again — or the Submit button before an attempt. */
export function SubmitBar({ result, busy, error, canSubmit, locked, onSubmit, onRetry, label = "Check my answer" }: {
  result: QuizResultView | null; busy: boolean; error: string | null; canSubmit: boolean; locked: boolean;
  onSubmit: () => void; onRetry: () => void; label?: string;
}) {
  return (
    <>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      {result ? (
        <div className={cn("mt-5 rounded-xl border p-3.5", result.passed ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10")}>
          <div className="font-semibold">{result.passed ? "Passed" : "Not quite"} — {result.right} of {result.total} right ({result.score}%)</div>
          {!result.passed && (
            <>
              <p className="mt-1 text-sm text-muted-foreground">You need {result.passMark}% to pass. Have another look and try again.</p>
              <button onClick={onRetry} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm">
                <RotateCcw className="h-4 w-4" /> Try again
              </button>
            </>
          )}
        </div>
      ) : (
        <button disabled={!canSubmit || busy || locked} onClick={onSubmit}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {label}
        </button>
      )}
    </>
  );
}
