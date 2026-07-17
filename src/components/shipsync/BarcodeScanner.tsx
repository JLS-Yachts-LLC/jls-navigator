import { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScanLine, Camera, Loader2, Keyboard } from "lucide-react";

// Formats a handheld/logistics scanner or phone camera would emit.
const FORMATS = ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "itf", "codabar", "qr_code", "data_matrix"];

/**
 * Barcode scanner dialog — mirrors the PowerApps BarcodeScanner control.
 * Uses the browser BarcodeDetector API (Android Chrome / Edge) for live camera
 * scanning; ALWAYS shows a manual field too, which doubles as the input path for
 * a handheld hardware scanner (keystrokes ending in Enter) and for typing on
 * devices without camera scanning (e.g. iOS Safari).
 */
export function BarcodeScannerDialog({ open, onClose, onDetected, title = "Scan barcode" }: {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const [supported, setSupported] = useState(false);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const stop = useCallback(() => {
    cancelledRef.current = true;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const emit = useCallback((raw: string) => {
    const v = raw.trim();
    if (!v) return;
    stop();
    onDetected(v);
  }, [onDetected, stop]);

  useEffect(() => {
    if (!open) return;
    cancelledRef.current = false;
    const hasDetector = typeof (window as any).BarcodeDetector !== "undefined";
    setSupported(hasDetector);
    setErr(null);
    if (!hasDetector) return;

    (async () => {
      setStarting(true);
      try {
        const detector = new (window as any).BarcodeDetector({ formats: FORMATS });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelledRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
        const tick = async () => {
          if (cancelledRef.current || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes?.length) { emit(String(codes[0].rawValue ?? "")); return; }
          } catch { /* frame not ready */ }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e: any) {
        setErr(e?.name === "NotAllowedError" ? "Camera permission denied — type or use your handheld scanner below." : (e?.message ?? "Camera unavailable"));
      } finally {
        setStarting(false);
      }
    })();

    return () => stop();
  }, [open, emit, stop]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { stop(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ScanLine className="h-4 w-4 text-primary" /> {title}</DialogTitle></DialogHeader>

        {supported ? (
          <div className="relative overflow-hidden rounded-xl border border-border bg-black">
            <video ref={videoRef} playsInline muted className="h-56 w-full object-cover" />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-primary/80 shadow-[0_0_12px_2px_rgba(69,144,186,0.6)]" />
            {starting && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Loader2 className="h-5 w-5 animate-spin text-white" /></div>}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            <Camera className="mx-auto mb-2 h-5 w-5 opacity-50" />
            Live camera scanning isn't available on this device — type the barcode or use your handheld scanner below.
          </div>
        )}

        {err && <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">{err}</div>}

        <div>
          <label className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Keyboard className="h-3.5 w-3.5" /> Enter or scan with a handheld</label>
          <div className="flex gap-2">
            <Input
              autoFocus
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); emit(manual); } }}
              placeholder="Barcode / air waybill…"
              className="h-10"
            />
            <Button onClick={() => emit(manual)} className="h-10">Enter</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
