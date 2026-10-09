import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScanLine, Camera, Loader2, Keyboard } from "lucide-react";

// Formats a handheld/logistics scanner or phone camera would emit.
const FORMATS = ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "itf", "codabar", "qr_code", "data_matrix"];

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue?: string }[]> };

/**
 * The phone's own barcode reader where it has one (Android Chrome / Edge). iPhones' Safari has none, so
 * there it is a small WebAssembly reader — loaded only when needed, and bundled with the app (not fetched
 * from a CDN), so it works from the app's own offline copy too.
 */
async function createDetector(): Promise<Detector> {
  const native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  if (native) return new native({ formats: FORMATS });
  const [{ BarcodeDetector, setZXingModuleOverrides }, wasm] = await Promise.all([
    import("barcode-detector/ponyfill"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasm.default : prefix + path) });
  return new BarcodeDetector({ formats: FORMATS as never }) as unknown as Detector;
}

/**
 * Barcode scanner dialog — mirrors the PowerApps BarcodeScanner control.
 * Live camera scanning (built in where the browser has it, a WebAssembly reader where it doesn't, as on iPhone);
 * ALWAYS shows a manual field too, which doubles as the input path for a handheld hardware scanner
 * (keystrokes ending in Enter) and for typing when the camera can't be used.
 */
export function BarcodeScannerDialog({ open, onClose, onDetected, title = "Scan barcode" }: {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraOk, setCameraOk] = useState(true);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  // Callers pass a fresh function on every render. Held in a ref so a re-render never restarts the camera.
  const detectedRef = useRef(onDetected);
  detectedRef.current = onDetected;
  const stopRef = useRef<() => void>(() => {});

  const emit = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    stopRef.current();
    setManual("");
    detectedRef.current(v);
  };

  useEffect(() => {
    if (!open) return;
    setManual("");
    setErr(null);
    if (!navigator.mediaDevices?.getUserMedia) { setCameraOk(false); return; }
    setCameraOk(true);

    // Everything this run starts is owned by THIS run, so a stale run can never stop (or leave running) the new one's camera.
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      cancelled = true;
      if (timer) { clearTimeout(timer); timer = null; }
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };
    stopRef.current = stop;

    void (async () => {
      setStarting(true);
      try {
        const detector = await createDetector();
        const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) { media.getTracks().forEach((t) => t.stop()); return; }   // closed while the camera was starting
        stream = media;
        const v = videoRef.current;
        if (v) { v.srcObject = media; await v.play().catch(() => {}); }
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (!cancelled && codes?.length) { emit(String(codes[0].rawValue ?? "")); return; }
          } catch { /* frame not ready */ }
          // ~7 looks a second is plenty for a barcode held still, and keeps the phone cool.
          if (!cancelled) timer = setTimeout(() => void tick(), 140);
        };
        void tick();
      } catch (e) {
        const name = (e as { name?: string } | null)?.name;
        setCameraOk(false);
        setErr(name === "NotAllowedError"
          ? "Camera permission denied — type the code below, or allow the camera for this site and try again."
          : "The camera scanner couldn't start — type the code below.");
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => stop();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { stopRef.current(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ScanLine className="h-4 w-4 text-primary" /> {title}</DialogTitle></DialogHeader>

        {cameraOk ? (
          <div className="relative overflow-hidden rounded-xl border border-border bg-black">
            <video ref={videoRef} playsInline muted className="h-56 w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-primary/80 shadow-[0_0_12px_2px_rgba(201,162,39,0.6)]" />
            {starting && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Loader2 className="h-5 w-5 animate-spin text-white" /></div>}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-[14px] text-muted-foreground">
            <Camera className="mx-auto mb-2 h-5 w-5 opacity-50" />
            The camera isn't available — type the barcode or use your handheld scanner below.
          </div>
        )}

        {err && <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[14px] text-amber-500">{err}</div>}

        <div>
          <label className="mb-1 flex items-center gap-1.5 text-[14px] text-muted-foreground"><Keyboard className="h-3.5 w-3.5" /> Enter or scan with a handheld</label>
          <div className="flex gap-2">
            <Input
              // With the camera running, the keyboard would cover the picture — so only raise it when there is no camera.
              autoFocus={!cameraOk}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); emit(manual); } }}
              placeholder="Barcode / air waybill…"
              autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off"
              className="h-12 text-base"
            />
            <Button onClick={() => emit(manual)} className="h-12 px-5 text-[15px]">Enter</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
