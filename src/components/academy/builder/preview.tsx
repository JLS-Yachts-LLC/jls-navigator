/** Crew Academy course creator — preview a draft in the real course player, marking locally (nothing is recorded). */
import { useMemo, useRef } from "react";
import { CoursePlayer, type PlayerApi } from "@/components/academy/course-player";
import { findBlock, forLearner, gradeBlock, isGraded, type BlockProgress, type CourseContent } from "@/lib/academy/content";
import { useBackend } from "./shared";

// ── Preview (local marking, nothing saved) ───────────────────────────────────
export function Preview({ title, content, passMark, onExit, mediaUrl, from, banner, toolbar, exitLabel }: {
  title: string; content: CourseContent; passMark: number; onExit: () => void; toolbar?: React.ReactNode;
  /** Defaults to the creator's backend. */
  mediaUrl?: (mediaId: string) => Promise<string | null>;
  from?: string; banner?: React.ReactNode; exitLabel?: string;
}) {
  const backend = useBackend();
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
      onExit={onExit} exitLabel={exitLabel ?? (banner ? "Back" : "Back to editing")} toolbar={toolbar}
      banner={banner ?? <div className="mt-4 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
        Preview of your draft, as crew will see it. Nothing here is recorded.
      </div>} />
  );
}
