/**
 * Orbit 2 — the way onto the field app from the dashboard.
 *
 * The office is at a desk; the crew are on their phones. So the button's job is
 * to get the app onto a phone: a QR code to scan, the link to send, and one line
 * on adding it to the home screen so it opens like an installed app afterwards.
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Smartphone, Copy, ExternalLink, Check } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ORBIT_FIELD_PATH } from "./orbit2-constants";

/**
 * The address the crew are given — always the real domain.
 *
 * Not window.location.origin: Polaris also answers on its *.workers.dev address,
 * and an office user who happened to be on that would hand every phone the raw
 * Cloudflare hostname. Same rule as appBaseUrl() for emailed links (that one is
 * server-only): the configured URL if set, else polaris.jlsyachts.com.
 */
const APP_BASE = (
  (import.meta.env.VITE_APP_URL as string | undefined) || "https://polaris.jlsyachts.com"
).replace(/\/$/, "");

export function FieldAppButton() {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = `${APP_BASE}${ORBIT_FIELD_PATH}`;

  useEffect(() => {
    if (!open || qr) return;
    // Dark modules on white, with a quiet zone: what every phone camera reads
    // first time. A themed, low-contrast code looks nicer and scans worse.
    QRCode.toDataURL(url, { width: 480, margin: 2, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => setQr(null));
  }, [open, qr, url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — select the link and copy it by hand.");
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[15px] font-medium hover:bg-accent">
        <Smartphone className="h-4 w-4" /> Mobile App
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* minmax(0,1fr): the dialog is a grid, and a grid column otherwise grows
            to fit its widest child — here the full URL — which pushed the QR code
            off-centre and ran the link box past the dialog's edge. */}
        <DialogContent className="max-w-sm grid-cols-[minmax(0,1fr)]">
          <DialogHeader>
            <DialogTitle className="text-[22px]">Orbit field app</DialogTitle>
          </DialogHeader>

          <p className="text-[15px] text-muted-foreground">
            For the operations team on site. Each person signs in with their own Polaris
            account and sees only the jobs assigned to them.
          </p>

          <div className="mx-auto w-56 overflow-hidden rounded-lg bg-white p-2">
            {qr
              ? <img src={qr} alt={`QR code for ${url}`} className="h-full w-full" />
              : <div className="aspect-square w-full animate-pulse rounded bg-neutral-200" />}
          </div>
          <p className="text-center text-[14px] text-muted-foreground">Scan with a phone camera to open it</p>

          <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[14px]" title={url}>{url}</span>
            <button onClick={() => void copy()} title="Copy link" aria-label="Copy link"
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          <a href={ORBIT_FIELD_PATH} target="_blank" rel="noreferrer"
            className="flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary text-[15px] font-medium text-primary-foreground hover:opacity-90">
            <ExternalLink className="h-4 w-4" /> Open the app here
          </a>

          <p className="text-[14px] text-muted-foreground">
            On the phone, use <span className="font-medium text-foreground">Add to Home Screen</span> (Safari's
            Share menu, or Chrome's ⋮ menu) so Orbit opens full-screen like an installed app.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
