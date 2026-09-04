/**
 * Scan an air waybill to raise an Import shipment.
 *
 * Photograph or upload the waybill, the reader pulls out the AWB number, carrier,
 * shipper, pieces, weight and goods description, and the clerk confirms what was
 * read before anything is saved. Nothing is written from the scan alone — OCR is
 * a typing aid, not a source of truth, and a misread weight or piece count on a
 * customs entry is expensive.
 */
import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compressImageToMaxKB } from "@/lib/image-compress";
import { ScanLine, Loader2, Camera, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export type AwbScan = {
  awb_number: string | null;
  house_awb: string | null;
  courier: string | null;
  shipper: string | null;
  consignee: string | null;
  vessel_name: string | null;
  origin: string | null;
  destination: string | null;
  pieces: number | null;
  weight_kg: number | null;
  description: string | null;
  commodity: string | null;
  flight_date: string | null;
  declared_value: string | null;
  checklist: {
    is_air_waybill?: boolean;
    full_document_visible?: boolean;
    has_glare_or_reflections?: boolean;
    is_legible?: boolean;
  } | null;
};

export function AwbScanDialog({ open, onClose, onConfirm }: {
  open: boolean;
  onClose: () => void;
  /** Called with the confirmed values — the caller decides where they go. */
  onConfirm: (v: AwbScan) => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState<AwbScan | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() { setScan(null); setBusy(false); setSaving(false); }
  function close() { reset(); onClose(); }

  async function read(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      // Phone photos run to several megabytes; the same helper the passport
      // reader uses shrinks an image under 1 MB and passes a PDF straight
      // through, so a warehouse connection isn't uploading a raw camera file.
      const { base64: imageBase64, mediaType } = await compressImageToMaxKB(file, 1000);

      const res = await fetch("/api/shipsync/awb-ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mediaType }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body?.error ?? `Scan failed (${res.status})`);

      const d = body.data as AwbScan;
      if (d.checklist?.is_air_waybill === false) {
        toast.warning("That doesn't look like shipping paperwork — check the file, or enter the details by hand.");
      } else if (d.checklist?.is_legible === false) {
        toast.warning("That scan is hard to read — check every field before saving.");
      }
      setScan(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that file");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  async function confirm() {
    if (!scan) return;
    if (!scan.awb_number?.trim()) { toast.error("An AWB number is needed to raise the shipment"); return; }
    setSaving(true);
    try {
      await onConfirm(scan);
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the shipment");
      setSaving(false);
    }
  }

  const set = <K extends keyof AwbScan>(k: K, v: AwbScan[K]) =>
    setScan((s) => (s ? { ...s, [k]: v } : s));

  const warnings = scan?.checklist
    ? [
        scan.checklist.is_air_waybill === false && "This may not be an air waybill",
        scan.checklist.is_legible === false && "Hard to read",
        scan.checklist.has_glare_or_reflections === true && "Glare on the page",
        scan.checklist.full_document_visible === false && "Page looks cropped",
      ].filter(Boolean) as string[]
    : [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-4 w-4" /> Scan an air waybill
          </DialogTitle>
        </DialogHeader>

        {!scan ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Photograph the waybill or upload it as a PDF. The details are read out for you to check
              before the shipment is created.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2" disabled={busy} onClick={() => cameraRef.current?.click()}>
                <Camera className="h-4 w-4" /> Take a photo
              </Button>
              <Button variant="outline" className="gap-2" disabled={busy} onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> Choose a file
              </Button>
              {busy && (
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading the waybill…
                </span>
              )}
            </div>
            {/* capture="environment" opens the rear camera on a phone; on a desktop
                it behaves as an ordinary file picker. */}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                   onChange={(e) => void read(e.target.files?.[0] ?? null)} />
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
                   onChange={(e) => void read(e.target.files?.[0] ?? null)} />
          </div>
        ) : (
          <div className="space-y-3">
            {warnings.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{warnings.join(" · ")} — check the fields below carefully.</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Anything the reader couldn't make out is left blank. Correct anything wrong before saving.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Field label="AWB number" value={scan.awb_number} onChange={(v) => set("awb_number", v)} required />
              <Field label="House AWB" value={scan.house_awb} onChange={(v) => set("house_awb", v)} />
              <Field label="Carrier / courier" value={scan.courier} onChange={(v) => set("courier", v)} />
              <Field label="Shipper" value={scan.shipper} onChange={(v) => set("shipper", v)} />
              <Field label="Consignee" value={scan.consignee} onChange={(v) => set("consignee", v)} />
              <Field label="Vessel" value={scan.vessel_name} onChange={(v) => set("vessel_name", v)} />
              <Field label="Origin" value={scan.origin} onChange={(v) => set("origin", v)} />
              <Field label="Destination" value={scan.destination} onChange={(v) => set("destination", v)} />
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Pieces</Label>
                <Input type="number" min={1} value={scan.pieces ?? ""} className="h-9 text-sm"
                       onChange={(e) => set("pieces", e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Weight (kg)</Label>
                <Input type="number" min={0} step="0.01" value={scan.weight_kg ?? ""} className="h-9 text-sm"
                       onChange={(e) => set("weight_kg", e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div className="col-span-2">
                <Field label="Goods description" value={scan.description} onChange={(v) => set("description", v)} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {scan && <Button variant="ghost" onClick={reset} disabled={saving}>Scan another</Button>}
          <Button variant="ghost" onClick={close} disabled={saving}>Cancel</Button>
          {scan && (
            <Button onClick={() => void confirm()} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
              Create shipment
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, required }: {
  label: string; value: string | null; onChange: (v: string | null) => void; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}{required && <span className="text-destructive"> *</span>}
      </Label>
      <Input
        value={value ?? ""} className="h-9 text-sm"
        placeholder={value === null ? "Not read — add it" : undefined}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </div>
  );
}
