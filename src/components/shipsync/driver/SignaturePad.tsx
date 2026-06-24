import { forwardRef, useImperativeHandle, useRef, useState } from "react";

export interface SignaturePadHandle {
  toBlob: () => Promise<Blob | null>;
  clear: () => void;
  isEmpty: () => boolean;
}

/** Lightweight pointer-drawn signature pad (no dependency). */
export const SignaturePad = forwardRef<SignaturePadHandle, { className?: string }>(function SignaturePad({ className }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [, force] = useState(0);

  function ctx() { return canvasRef.current?.getContext("2d") ?? null; }
  function pos(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function down(e: React.PointerEvent) {
    e.preventDefault();
    const c = ctx(); if (!c) return;
    drawing.current = true; dirty.current = true; force((n) => n + 1);
    const p = pos(e); c.beginPath(); c.moveTo(p.x, p.y);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const c = ctx(); if (!c) return;
    const p = pos(e); c.lineWidth = 2.2; c.lineCap = "round"; c.strokeStyle = "#0d1520";
    c.lineTo(p.x, p.y); c.stroke();
  }
  function up() { drawing.current = false; }

  useImperativeHandle(ref, () => ({
    toBlob: () => new Promise((res) => {
      if (!canvasRef.current || !dirty.current) return res(null);
      canvasRef.current.toBlob((b) => res(b), "image/png");
    }),
    clear: () => {
      const c = ctx(); const cv = canvasRef.current;
      if (c && cv) c.clearRect(0, 0, cv.width, cv.height);
      dirty.current = false; force((n) => n + 1);
    },
    isEmpty: () => !dirty.current,
  }));

  return (
    <div className={className}>
      <canvas
        ref={canvasRef} width={520} height={180}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        className="w-full touch-none rounded-lg border border-border bg-white"
        style={{ height: 180 }}
      />
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{dirty.current ? "Signed" : "Sign above"}</span>
        <button type="button" onClick={() => { const c = ctx(); const cv = canvasRef.current; if (c && cv) c.clearRect(0, 0, cv.width, cv.height); dirty.current = false; force((n) => n + 1); }} className="underline">Clear</button>
      </div>
    </div>
  );
});
