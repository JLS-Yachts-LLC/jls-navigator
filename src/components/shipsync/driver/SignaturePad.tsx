import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { toCanvasPoint, MIN_SIGNATURE_TRAVEL } from "./signature-geometry";

export interface SignaturePadHandle {
  toBlob: () => Promise<Blob | null>;
  clear: () => void;
  isEmpty: () => boolean;
  /** Draw a previously saved signature back onto the pad. */
  loadFrom: (blob: Blob) => Promise<void>;
}

/** Lightweight pointer-drawn signature pad (no dependency). */
export const SignaturePad = forwardRef<SignaturePadHandle, { className?: string }>(function SignaturePad({ className }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [, force] = useState(0);

  function ctx() { return canvasRef.current?.getContext("2d") ?? null; }
  /**
   * The paper is painted INTO the canvas, not left to a CSS background: a phone's dark mode (or the Polaris dark theme)
   * can darken a CSS background, and black ink on a darkened pad is what made signatures hard to see. A signature is
   * now black on white wherever it is shown — here, in the PDF, in the email, and in the dark ShipSync screens.
   */
  function paper() {
    const c = ctx(); const cv = canvasRef.current;
    if (!c || !cv) return;
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, cv.width, cv.height);
  }
  useEffect(() => { paper(); }, []);
  function pos(e: React.PointerEvent) {
    const cv = canvasRef.current!;
    return toCanvasPoint(e.clientX, e.clientY, cv.getBoundingClientRect(), cv);
  }
  function down(e: React.PointerEvent) {
    e.preventDefault();
    const c = ctx(); if (!c) return;
    drawing.current = true;
    const p = pos(e); start.current = p; c.beginPath(); c.moveTo(p.x, p.y);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const c = ctx(); if (!c) return;
    const p = pos(e); c.lineWidth = 4; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = "#000000";
    c.lineTo(p.x, p.y); c.stroke();
    // Only a stroke that has actually travelled counts as signed — a single tap leaves a dot, not a signature.
    if (!dirty.current && start.current && Math.hypot(p.x - start.current.x, p.y - start.current.y) >= MIN_SIGNATURE_TRAVEL) { dirty.current = true; force((n) => n + 1); }
  }
  function up() { drawing.current = false; }

  useImperativeHandle(ref, () => ({
    toBlob: () => new Promise((res) => {
      if (!canvasRef.current || !dirty.current) return res(null);
      canvasRef.current.toBlob((b) => res(b), "image/png");
    }),
    clear: () => {
      paper();
      dirty.current = false; force((n) => n + 1);
    },
    isEmpty: () => !dirty.current,
    loadFrom: async (blob) => {
      const c = ctx(); const cv = canvasRef.current;
      if (!c || !cv || typeof createImageBitmap !== "function") return;
      const bmp = await createImageBitmap(blob);
      paper();
      c.drawImage(bmp, 0, 0, cv.width, cv.height);
      bmp.close?.();
      dirty.current = true; force((n) => n + 1);
    },
  }));

  return (
    <div className={className}>
      <canvas
        ref={canvasRef} width={520} height={180}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
        className="w-full touch-none rounded-lg border border-border bg-white"
        style={{ height: 180, colorScheme: "light" }}
      />
      <div className="mt-1 flex justify-between text-[14px] text-muted-foreground">
        <span>{dirty.current ? "Signed" : "Sign above"}</span>
        <button type="button" onClick={() => { paper(); dirty.current = false; force((n) => n + 1); }} className="underline">Clear</button>
      </div>
    </div>
  );
});
