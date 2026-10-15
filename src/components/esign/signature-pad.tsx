import { useRef, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Eraser, PenLine, Type, ImageUp, Loader2, Stamp } from "lucide-react";
import { cleanInkImage } from "@/lib/esign/clean-image";

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
const SCRIPT_FONT = "'Brush Script MT','Segoe Script',cursive";

type Mode = "draw" | "type" | "upload";

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
    setProcessing(true);
    try {
      const dataUrl = await cleanInkImage(file, { w: OUT_W, h: OUT_H, fixed: true });
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

// Optional vessel / boat stamp: a photo or scan of the stamp, cleaned the same
// way as an uploaded signature but keeping its own shape and ink colour. It is
// placed next to the signature on the document.
export function VesselStampPicker({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const [stamp, setStamp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null); setProcessing(true);
    try {
      const dataUrl = await cleanInkImage(file, { w: 500, h: 500, fixed: false });
      setStamp(dataUrl); onChange(dataUrl);
    } catch (e: any) {
      setStamp(null); onChange(null); setError(e?.message ?? "That image couldn't be used");
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function clear() { setStamp(null); setError(null); onChange(null); }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-start gap-2">
        <Stamp className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-800">
            Vessel stamp <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Optional · advised</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">If your vessel has an official stamp, add a photo or scan of it. It's placed next to your signature, which helps the authorities accept the document.</p>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => void pickFile(e.target.files?.[0])} />
      {stamp ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-24 w-32 items-center justify-center rounded-md border border-slate-300 bg-white p-1.5">
            <img src={stamp} alt="Your vessel stamp" className="max-h-full max-w-full" />
          </div>
          <div className="flex flex-col gap-1.5">
            <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
              <ImageUp className="h-3 w-3" /> Change
            </button>
            <button type="button" onClick={clear} className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50">
              <Eraser className="h-3 w-3" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={processing}
          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageUp className="h-3.5 w-3.5" />}
          {processing ? "Preparing your stamp…" : "Add vessel stamp"}
        </button>
      )}
      {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
      <p className="mt-1.5 text-[11px] text-slate-400">PNG or JPEG, up to 8 MB. Stamp on plain white paper and take a straight-on photo; the background is removed.</p>
    </div>
  );
}
