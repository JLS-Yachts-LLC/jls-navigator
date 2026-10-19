/**
 * Crew Academy interactive exercises in the course player:
 *
 *   match    drag (or tap) each answer onto the item it belongs to
 *   order    drag (or tap) the steps into the right order
 *   sort     drag (or tap) each item into the right group
 *   hotspot  tap the right place on a picture
 *
 * Phone first. Dragging uses pointer events, so it works with a finger and a
 * mouse alike; every exercise can also be done by tapping (tap an item, then
 * tap where it goes) for small screens and accessibility. The learner's copy of
 * the block has no answer key — marking happens on the server (gradeBlock); the
 * full solution is shown only once the exercise is passed.
 */
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HotspotBlock, HotspotSpot, MatchBlock, OrderBlock, SortBlock } from "@/lib/academy/content";
import { BlockShell, SubmitBar, useMediaUrl, useSubmit, type PlayerApi, type PlayerUpdate } from "./player-shared";

type Common = {
  api: PlayerApi; done: boolean; best: number | null; passMark: number;
  onUpdate: (u: PlayerUpdate | void) => void; locked: boolean;
};

// ── Drag with a finger or a mouse ────────────────────────────────────────────
/**
 * Press on an item and move more than a few pixels → it follows the pointer;
 * let go over an element marked data-drop="<target>" → onDrop(item, target).
 * Press and let go without moving → onTap(item) (the tap-to-place route).
 */
function useDrag(onDrop: (itemId: string, target: string) => void) {
  const [ghost, setGhost] = useState<{ id: string; label: string; x: number; y: number } | null>(null);
  const start = (e: React.PointerEvent<HTMLElement>, id: string, label: string, onTap: () => void) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const el = e.currentTarget;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) moved = true;
      if (moved) setGhost({ id, label, x: ev.clientX, y: ev.clientY });
    };
    const end = (ev: PointerEvent, cancelled = false) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      setGhost(null);
      if (cancelled) return;
      if (!moved) { onTap(); return; }
      const target = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-drop]");
      if (target?.dataset.drop) onDrop(id, target.dataset.drop);
    };
    const up = (ev: PointerEvent) => end(ev);
    const cancel = (ev: PointerEvent) => end(ev, true);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
  };
  const layer = ghost && (
    <div className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-primary bg-card px-3 py-2 text-sm shadow-2xl"
      style={{ left: ghost.x, top: ghost.y }}>{ghost.label}</div>
  );
  return { start, layer, dragging: ghost?.id ?? null };
}

function Chip({ label, selected, disabled, onPointerDown, tone }: {
  label: string; selected?: boolean; disabled?: boolean; tone?: "right" | "wrong";
  onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void;
}) {
  return (
    <span role="button" tabIndex={disabled ? -1 : 0} onPointerDown={disabled ? undefined : onPointerDown}
      className={cn("inline-flex min-h-10 select-none items-center rounded-xl border px-3 py-2 text-[15px] leading-snug",
        !disabled && "cursor-grab touch-none active:cursor-grabbing",
        selected ? "border-primary bg-primary/15 ring-2 ring-primary/40" : "border-border bg-background/60",
        tone === "right" && "border-emerald-500/60 bg-emerald-500/10", tone === "wrong" && "border-red-500/60 bg-red-500/10")}>
      {label}
    </span>
  );
}

const Mark = ({ ok }: { ok: boolean }) => ok
  ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
  : <XCircle className="h-4 w-4 shrink-0 text-red-400" />;

function Passed({ label, best }: { label: string; best: number | null }) {
  return <BlockShell done label={label}><p className="text-sm">Passed{best != null ? ` with ${best}%` : ""}.</p></BlockShell>;
}

// ── Match ────────────────────────────────────────────────────────────────────
export function MatchView({ block, api, done, best, passMark, onUpdate, locked }: Common & { block: MatchBlock }) {
  const choices = block.choices ?? [];
  const [placed, setPlaced] = useState<Record<string, string>>({}); // pairId → choiceId
  const [picked, setPicked] = useState<string | null>(null);
  const s = useSubmit(api, block.id, onUpdate);
  const frozen = !!s.result || locked;
  const verdict = new Map((s.result?.questions ?? []).map((q) => [q.id, q.correct]));
  const solution = (s.result?.solution ?? null) as Record<string, string> | null;
  const textOf = (id: string) => choices.find((c) => c.id === id)?.text ?? "";
  const put = (choiceId: string, pairId: string) => setPlaced((p) => {
    const next = Object.fromEntries(Object.entries(p).filter(([, c]) => c !== choiceId));
    next[pairId] = choiceId;
    return next;
  });
  const drag = useDrag((choiceId, target) => { if (!frozen) { if (target === "bank") setPlaced((p) => Object.fromEntries(Object.entries(p).filter(([, c]) => c !== choiceId))); else put(choiceId, target); setPicked(null); } });
  const bank = choices.filter((c) => !Object.values(placed).includes(c.id));

  if (done && !s.result) return <Passed label={block.title || "Match pairs"} best={best} />;
  return (
    <BlockShell done={done} label={block.title || "Match pairs"}>
      {block.prompt && <p className="mb-3 text-[15px]">{block.prompt}</p>}
      <p className="mb-3 text-xs text-muted-foreground">Drag each answer onto its match — or tap an answer, then tap where it goes. Pass mark {passMark}%.</p>
      <ul className="space-y-2">
        {block.pairs.map((pr) => {
          const choiceId = placed[pr.id];
          return (
            <li key={pr.id} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-2 font-medium">{verdict.has(pr.id) && <Mark ok={verdict.get(pr.id)!} />}{pr.left}</div>
              <div data-drop={pr.id} onClick={() => { if (!frozen && picked) { put(picked, pr.id); setPicked(null); } }}
                className={cn("flex min-h-12 items-center rounded-xl border border-dashed p-1.5",
                  picked && !frozen ? "border-primary/60 bg-primary/5" : "border-border")}>
                {choiceId
                  ? <Chip label={textOf(choiceId)} disabled={frozen} selected={picked === choiceId}
                      tone={verdict.has(pr.id) ? (verdict.get(pr.id) ? "right" : "wrong") : undefined}
                      onPointerDown={(e) => drag.start(e, choiceId, textOf(choiceId), () => setPicked(picked === choiceId ? null : choiceId))} />
                  : <span className="px-2 text-sm text-muted-foreground/60">{solution ? textOf(solution[pr.id]) : "Drop here"}</span>}
              </div>
              {solution && choiceId && solution[pr.id] !== choiceId && (
                <div className="text-xs text-emerald-300 sm:col-start-2">Right answer: {textOf(solution[pr.id])}</div>
              )}
            </li>
          );
        })}
      </ul>
      {!frozen && (
        <div data-drop="bank" onClick={() => setPicked(null)} className="mt-4 flex min-h-12 flex-wrap gap-2 rounded-xl bg-background/40 p-2">
          {bank.length === 0 ? <span className="px-1 py-2 text-xs text-muted-foreground">All placed — check your answers.</span>
            : bank.map((c) => (
              <Chip key={c.id} label={c.text} selected={picked === c.id}
                onPointerDown={(e) => drag.start(e, c.id, c.text, () => setPicked(picked === c.id ? null : c.id))} />
            ))}
        </div>
      )}
      {drag.layer}
      <SubmitBar result={s.result} busy={s.busy} error={s.error} locked={locked} canSubmit={Object.keys(placed).length === block.pairs.length}
        onSubmit={() => void s.submit(placed)} onRetry={() => { s.reset(); setPlaced({}); }} />
    </BlockShell>
  );
}

// ── Order ────────────────────────────────────────────────────────────────────
export function OrderView({ block, api, done, best, passMark, onUpdate, locked }: Common & { block: OrderBlock }) {
  const [items, setItems] = useState(block.items);
  const [picked, setPicked] = useState<string | null>(null);
  const s = useSubmit(api, block.id, onUpdate);
  const frozen = !!s.result || locked;
  const verdict = new Map((s.result?.questions ?? []).map((q) => [q.id, q.correct]));
  const solution = (s.result?.solution ?? null) as string[] | null;
  const moveTo = (id: string, index: number) => setItems((list) => {
    const from = list.findIndex((i) => i.id === id);
    if (from < 0 || from === index) return list;
    const next = [...list];
    const [it] = next.splice(from, 1);
    next.splice(index, 0, it);
    return next;
  });
  const drag = useDrag((id, target) => { if (!frozen) { moveTo(id, Number(target)); setPicked(null); } });

  if (done && !s.result) return <Passed label={block.title || "Put in order"} best={best} />;
  return (
    <BlockShell done={done} label={block.title || "Put in order"}>
      {block.prompt && <p className="mb-3 text-[15px]">{block.prompt}</p>}
      <p className="mb-3 text-xs text-muted-foreground">Drag the steps into order — or tap a step, then tap where it should go. Pass mark {passMark}%.</p>
      <ol className="space-y-2">
        {items.map((it, i) => (
          <li key={it.id} data-drop={String(i)} onClick={() => { if (!frozen && picked && picked !== it.id) { moveTo(picked, i); setPicked(null); } }}
            className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right text-sm font-semibold text-muted-foreground">{i + 1}.</span>
            <div className="min-w-0 flex-1">
              <Chip label={it.text} disabled={frozen} selected={picked === it.id}
                tone={verdict.has(String(i)) ? (verdict.get(String(i)) ? "right" : "wrong") : undefined}
                onPointerDown={(e) => drag.start(e, it.id, it.text, () => setPicked(picked === it.id ? null : it.id))} />
            </div>
            {!frozen && (
              <span className="flex shrink-0">
                <button aria-label="Move up" disabled={i === 0} onClick={(e) => { e.stopPropagation(); moveTo(it.id, i - 1); }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button aria-label="Move down" disabled={i === items.length - 1} onClick={(e) => { e.stopPropagation(); moveTo(it.id, i + 1); }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {solution && (
        <p className="mt-3 text-xs text-emerald-300">Right order: {solution.map((id) => block.items.find((x) => x.id === id)?.text).join(" → ")}</p>
      )}
      {drag.layer}
      <SubmitBar result={s.result} busy={s.busy} error={s.error} locked={locked} canSubmit
        onSubmit={() => void s.submit(items.map((i) => i.id))} onRetry={() => s.reset()} />
    </BlockShell>
  );
}

// ── Sort ─────────────────────────────────────────────────────────────────────
export function SortView({ block, api, done, best, passMark, onUpdate, locked }: Common & { block: SortBlock }) {
  const [where, setWhere] = useState<Record<string, string>>({}); // itemId → bucketId
  const [picked, setPicked] = useState<string | null>(null);
  const s = useSubmit(api, block.id, onUpdate);
  const frozen = !!s.result || locked;
  const verdict = new Map((s.result?.questions ?? []).map((q) => [q.id, q.correct]));
  const solution = (s.result?.solution ?? null) as Record<string, string> | null;
  const place = (itemId: string, target: string) => setWhere((w) => {
    const next = { ...w };
    if (target === "bank") delete next[itemId]; else next[itemId] = target;
    return next;
  });
  const drag = useDrag((id, target) => { if (!frozen) { place(id, target); setPicked(null); } });
  const chip = (it: SortBlock["items"][number]) => (
    <Chip key={it.id} label={it.text} disabled={frozen} selected={picked === it.id}
      tone={verdict.has(it.id) ? (verdict.get(it.id) ? "right" : "wrong") : undefined}
      onPointerDown={(e) => drag.start(e, it.id, it.text, () => setPicked(picked === it.id ? null : it.id))} />
  );
  const unsorted = block.items.filter((it) => !where[it.id]);

  if (done && !s.result) return <Passed label={block.title || "Sort into groups"} best={best} />;
  return (
    <BlockShell done={done} label={block.title || "Sort into groups"}>
      {block.prompt && <p className="mb-3 text-[15px]">{block.prompt}</p>}
      <p className="mb-3 text-xs text-muted-foreground">Drag each item into its group — or tap an item, then tap the group. Pass mark {passMark}%.</p>
      {!frozen && (
        <div data-drop="bank" onClick={() => setPicked(null)} className="mb-3 flex min-h-12 flex-wrap gap-2 rounded-xl bg-background/40 p-2">
          {unsorted.length === 0 ? <span className="px-1 py-2 text-xs text-muted-foreground">Everything is sorted — check your answers.</span> : unsorted.map(chip)}
        </div>
      )}
      <div className={cn("grid gap-2", block.buckets.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {block.buckets.map((b) => (
          <div key={b.id} data-drop={b.id} onClick={() => { if (!frozen && picked) { place(picked, b.id); setPicked(null); } }}
            className={cn("min-h-24 rounded-xl border border-dashed p-2", picked && !frozen ? "border-primary/60 bg-primary/5" : "border-border")}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{b.text}</div>
            <div className="flex flex-wrap gap-2">{block.items.filter((it) => where[it.id] === b.id).map(chip)}</div>
          </div>
        ))}
      </div>
      {solution && (
        <ul className="mt-3 space-y-0.5 text-xs text-emerald-300">
          {block.items.filter((it) => where[it.id] !== solution[it.id]).map((it) => (
            <li key={it.id}>{it.text} → {block.buckets.find((b) => b.id === solution[it.id])?.text}</li>
          ))}
        </ul>
      )}
      {drag.layer}
      <SubmitBar result={s.result} busy={s.busy} error={s.error} locked={locked} canSubmit={unsorted.length === 0}
        onSubmit={() => void s.submit(where)} onRetry={() => { s.reset(); setWhere({}); }} />
    </BlockShell>
  );
}

// ── Hotspot ──────────────────────────────────────────────────────────────────
export function HotspotView({ block, api, done, best, passMark, onUpdate, locked }: Common & { block: HotspotBlock }) {
  const { url, error } = useMediaUrl(api, block.mediaId);
  const [tap, setTap] = useState<{ x: number; y: number } | null>(null);
  const [aspect, setAspect] = useState(0.66); // height ÷ width, from the picture once loaded
  const ref = useRef<HTMLDivElement>(null);
  const s = useSubmit(api, block.id, onUpdate);
  const frozen = !!s.result || locked;
  const spots = (s.result?.solution ?? []) as HotspotSpot[];
  // Positions are percentages of the picture's WIDTH (y too), so circles stay round.
  const style = (x: number, y: number, r = 0) => ({ left: `${x - r}%`, top: `${(y - r) / aspect}%`, width: r ? `${r * 2}%` : undefined, height: r ? `${(r * 2) / aspect}%` : undefined });

  if (done && !s.result) return <Passed label={block.title || "Tap the picture"} best={best} />;
  return (
    <BlockShell done={done} label={block.title || "Tap the picture"}>
      {block.prompt && <p className="mb-3 text-[15px]">{block.prompt}</p>}
      {url ? (
        <div ref={ref} className={cn("relative overflow-hidden rounded-lg", !frozen && "cursor-crosshair")}
          onClick={(e) => {
            if (frozen || !ref.current) return;
            const r = ref.current.getBoundingClientRect();
            setTap({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.width) * 100 });
          }}>
          <img src={url} alt="" className="block w-full select-none" draggable={false}
            onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth) setAspect(i.naturalHeight / i.naturalWidth); }} />
          {spots.map((sp) => (
            <span key={sp.id} className="absolute rounded-full border-2 border-emerald-400 bg-emerald-400/20" style={style(sp.x, sp.y, sp.r)} />
          ))}
          {tap && (
            <span className={cn("absolute -ml-3 -mt-3 h-6 w-6 rounded-full border-2 shadow",
              s.result ? (s.result.passed ? "border-emerald-300 bg-emerald-400/60" : "border-red-300 bg-red-400/60") : "border-white bg-primary/70")}
              style={style(tap.x, tap.y)} />
          )}
        </div>
      ) : <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">{error ?? <Loader2 className="h-5 w-5 animate-spin" />}</div>}
      {!s.result && <p className="mt-2 text-xs text-muted-foreground">{tap ? "Tap again to move your mark." : "Tap the picture to place your mark."} Pass mark {passMark}%.</p>}
      <SubmitBar result={s.result} busy={s.busy} error={s.error} locked={locked} canSubmit={!!tap}
        onSubmit={() => void s.submit(tap)} onRetry={() => { s.reset(); setTap(null); }} />
    </BlockShell>
  );
}
