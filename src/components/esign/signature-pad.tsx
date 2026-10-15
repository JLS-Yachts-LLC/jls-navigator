import { useRef, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Eraser, PenLine, Type, ImageUp, Loader2 } from "lucide-react";

// Captures a signature as a PNG data URL — drawn on a canvas, typed (rendered
// to a canvas in a script-style font) or uploaded as a photo/scan of a signature
// (paper background removed, trimmed to the ink). Calls onChange with the data
// URL, or null when cleared. Every mode yields the same 600×200 PNG so it lands
// on the document the same way.
//
// Colours are explicit, not theme tokens: this sits on the light public signing
// page, and the app's dark base theme made the unselected buttons black-on-black.

const OUT_W = 600;
const OUT_H = 200;
const MAX_UPLOAD = 8 * 1024 * 1024;
const SCRIPT_FONT = "'Brush Script MT','Segoe Script',cursive";

type Mode = "draw" | "type" | "upload";

/** Photo/scan of a signature → transparent PNG trimmed to the ink, fitted to 600×200. */
async function signatureFromImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file couldn't be read as an image"));
      i.src = url;
    });
    // Work at a capped size — phone photos are huge.
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const work = document.createElement("canvas");
    work.width = w; work.height = h;
    const wctx = work.getContext("2d", { willReadFrequently: true })!;
    wctx.drawImage(img, 0, 0, w, h);
    const px = wctx.getImageData(0, 0, w, h);
    const d = px.data;

    // Light pixels are paper → transparent; find the ink's bounding box.
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = (y * w + x) * 4;
        const lum = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
        if (d[k + 3] < 20 || lum > 200) { d[k + 3] = 0; continue; }
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) throw new Error("No signature found in that image — try a darker pen or a clearer photo");
    wctx.putImageData(px, 0, 0);

    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const pad = 12;
    const fit = Math.min((OUT_W - 2 * pad) / bw, (OUT_H - 2 * pad) / bh);
    const dw = bw * fit, dh = bh * fit;
    const out = document.createElement("canvas");
    out.width = OUT_W; out.height = OUT_H;
    out.getContext("2d")!.drawImage(work, minX, minY, bw, bh, (OUT_W - dw) / 2, (OUT_H - dh) / 2, dw, dh);
    return out.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const [mode, setMode] = useState<Mode>("draw");
  const [typed, setTyped] = useState("");
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  function switchMode(m: Mode) {
    setMode(m); setTyped(""); setUploaded(null); setUploadError(null); onChange(null);
  }

  // ── draw mode ──
  function pos(e: React.PointerEvent) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }
  function start(e: React.PointerEvent) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y); ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
    hasInk.current = true;
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasInk.current) onChange(canvasRef.current!.toDataURL("image/png"));
  }
  function clearDraw() {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    hasInk.current = false; onChange(null);
  }

  // ── type mode ──
  useEffect(() => {
    if (mode !== "type") return;
    if (!typed.trim()) { onChange(null); return; }
    const c = document.createElement("canvas");
    c.width = OUT_W; c.height = OUT_H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#0f172a";
    ctx.font = `italic 64px ${SCRIPT_FONT}`;
    ctx.textBaseline = "middle";
    ctx.fillText(typed.trim(), 20, 100);
    onChange(c.toDataURL("image/png"));
  }, [typed, mode]);

  // ── upload mode ──
  async function pickFile(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) { setUploadError("Please choose a PNG or JPEG image"); return; }
    if (file.size > MAX_UPLOAD) { setUploadError("That image is over 8 MB — please choose a smaller one"); return; }
    setProcessing(true);
    try {
      const dataUrl = await signatureFromImage(file);
      setUploaded(dataUrl); onChange(dataUrl);
    } catch (e: any) {
      setUploaded(null); onChange(null); setUploadError(e?.message ?? "That image couldn't be used");
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function clearUpload() { setUploaded(null); setUploadError(null); onChange(null); }

  const tab = (m: Mode, Icon: typeof PenLine, label: string) => (
    <button
      type="button"
      onClick={() => switchMode(m)}
      aria-pressed={mode === m}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors",
        mode === m
          ? "border-transparent bg-primary text-primary-foreground shadow"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tab("draw", PenLine, "Draw")}
        {tab("type", Type, "Type")}
        {tab("upload", ImageUp, "Upload image")}
      </div>

      {mode === "draw" && (
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={OUT_W}
            height={OUT_H}
            onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
            className="h-40 w-full touch-none rounded-lg border border-slate-300 bg-white"
          />
          <button type="button" onClick={clearDraw} className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-slate-300 bg-white/90 px-2 py-1 text-[11px] text-slate-600 hover:bg-white">
            <Eraser className="h-3 w-3" /> Clear
          </button>
          <p className="mt-1 text-center text-[11px] text-slate-500">Sign above using your mouse or finger</p>
        </div>
      )}

      {mode === "type" && (
        <div>
          <Input
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder="Type your full name"
            className="h-10 border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
          />
          {typed.trim() && (
            <div className="mt-2 flex h-24 items-center justify-center rounded-lg border border-slate-300 bg-white text-4xl text-slate-900" style={{ fontFamily: SCRIPT_FONT, fontStyle: "italic" }}>
              {typed.trim()}
            </div>
          )}
        </div>
      )}

      {mode === "upload" && (
        <div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => void pickFile(e.target.files?.[0])} />
          {uploaded ? (
            <div className="relative">
              <div className="flex h-40 items-center justify-center rounded-lg border border-slate-300 bg-white p-2">
                <img src={uploaded} alt="Your uploaded signature" className="max-h-full max-w-full" />
              </div>
              <div className="absolute right-2 top-2 flex gap-1.5">
                <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 rounded-md border border-slate-300 bg-white/90 px-2 py-1 text-[11px] text-slate-600 hover:bg-white">
                  <ImageUp className="h-3 w-3" /> Change
                </button>
                <button type="button" onClick={clearUpload} className="flex items-center gap-1 rounded-md border border-slate-300 bg-white/90 px-2 py-1 text-[11px] text-slate-600 hover:bg-white">
                  <Eraser className="h-3 w-3" /> Clear
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={processing}
              className="flex h-40 w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageUp className="h-5 w-5" />}
              <span className="font-medium text-slate-700">{processing ? "Preparing your signature…" : "Choose an image of your signature"}</span>
              <span className="text-[11px] text-slate-500">PNG or JPEG, up to 8 MB — a photo of your signature on white paper works well</span>
            </button>
          )}
          {uploadError && <p className="mt-1 text-[11px] text-red-600">{uploadError}</p>}
          {uploaded && <p className="mt-1 text-center text-[11px] text-slate-500">The paper background is removed so only your signature appears on the document</p>}
        </div>
      )}
    </div>
  );
}
