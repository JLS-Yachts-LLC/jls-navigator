import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A scrolling box for a wide table, with a slider underneath that moves it sideways. The platform's own scrollbars
 * are thin or hidden, and without a trackpad there was no way to reach the columns off to the right.
 * The slider only shows when there is something to scroll to. Pass the box's look (border, rounding, background)
 * in `className`.
 */
export function HScroll({ children, className }: { children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [m, setM] = useState({ max: 0, pos: 0 });

  const measure = useCallback(() => {
    const el = box.current;
    if (!el) return;
    setM({ max: Math.max(0, el.scrollWidth - el.clientWidth), pos: el.scrollLeft });
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);   // the table grows and shrinks with its rows
    return () => ro.disconnect();
  }, [measure, children]);

  return (
    // min-w-0 matters: as a grid/flex child this box would otherwise grow to the table's full width instead of scrolling it.
    <div className={cn("flex min-h-0 min-w-0 max-w-full flex-col", className)}>
      <div ref={box} onScroll={measure} className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</div>
      {m.max > 1 && (
        <div className="flex shrink-0 items-center gap-3 border-t border-border bg-card px-3 py-2">
          <span className="text-[12px] font-medium text-muted-foreground">◀</span>
          <input
            type="range" min={0} max={Math.round(m.max)} step={1} value={Math.min(Math.round(m.pos), Math.round(m.max))}
            onChange={(e) => { if (box.current) box.current.scrollLeft = Number(e.target.value); }}
            aria-label="Slide the table sideways"
            className="h-2 w-full cursor-pointer accent-[var(--primary)]"
          />
          <span className="text-[12px] font-medium text-muted-foreground">▶</span>
        </div>
      )}
    </div>
  );
}
