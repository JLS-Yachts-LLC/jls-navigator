/**
 * Logistics mobile app — Check-in · Parcels (spec p.3–6).
 *
 * Inbound parcel intake at the JLS facility. One form whose fields follow the
 * Shipment Type and Payment answers:
 *
 *   Local            Payment YES → Amount, Payment Method, Remarks
 *                    Payment NO  → nothing extra
 *   Import / Transit Payment YES → Amount, Payment Method, Remarks, BOE Number
 *                    Payment NO  → Remarks, BOE Number
 *
 * (The spec's prose for Import/Transit has the YES/NO field lists the wrong way
 * round against its own screenshots; this follows the screenshots, where BOE
 * Number and Remarks always show and Amount/Method follow Payment = YES.)
 *
 * Saving writes the same shipsync_packages row the office boards read (see
 * checkin-commit.ts). With no signal the check-in is parked on the phone and
 * uploaded when it is back online (logistics-offline.ts).
 */
import { useEffect, useState } from "react";
import { ScanLine } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/error-message";
import { BarcodeScannerDialog } from "@/components/shipsync/BarcodeScanner";
import { loadYachtNames, loadDestinations } from "@/lib/shipsync/data";
import { STATUS_META, type ShipSyncPackage } from "@/lib/shipsync/model";
import { Screen, Lbl, inputCls, SuggestInput, PhotoField, FooterButtons } from "./logistics-ui";
import { createCheckin, updateCheckin, findByAwb, isNetworkError, type CheckinPayload } from "./checkin-commit";
import { queueCheckin } from "./logistics-offline";
import { PendingBanner, useCheckinQueue } from "./checkin-pending";

type ShipType = "Local" | "Import" | "Transit";
const SHIP_TYPES: ShipType[] = ["Local", "Import", "Transit"];
/** The spec leaves the list open; these are the ways a parcel's charge is actually settled. */
const PAYMENT_METHODS = ["Cash", "Card", "Bank transfer", "Cheque"];

type Form = {
  awb: string; boat: string; shipType: ShipType; consignee: string; courier: string; qty: string;
  payment: "NO" | "YES"; amount: string; method: string; remarks: string; boe: string;
};
const BLANK: Form = {
  awb: "", boat: "", shipType: "Local", consignee: "", courier: "", qty: "1",
  payment: "NO", amount: "", method: "", remarks: "", boe: "",
};

export function CheckinParcel({ onBack }: { onBack: () => void }) {
  const [f, setF] = useState<Form>(BLANK);
  const [photo, setPhoto] = useState<File | null>(null);
  const [boats, setBoats] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [dupe, setDupe] = useState<ShipSyncPackage | null>(null);
  const queue = useCheckinQueue(false);
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));

  useEffect(() => {
    void (async () => {
      const [yachts, dests] = await Promise.all([loadYachtNames().catch(() => []), loadDestinations().catch(() => [])]);
      setBoats(Array.from(new Set([...yachts, ...dests.map((d) => d.boat_name)].filter(Boolean))).sort());
    })();
  }, []);

  const customs = f.shipType !== "Local";
  const showMoney = f.payment === "YES";
  const showRemarks = showMoney || customs;

  /** Everything this form saves, as plain data — `id` is fixed now so a retry (or a later upload) can't create the parcel twice. */
  function payload(id: string): CheckinPayload {
    return {
      id, awb: f.awb.trim(), customs,
      fields: {
        barcode: f.awb.trim(),
        boat_name: f.boat.trim().toUpperCase() || null,
        package_owner: f.consignee.trim() || null,
        courier: f.courier.trim() || null,
        num_packages: Math.max(1, Number(f.qty) || 1),
        local_import: f.shipType,
        boe_no: customs ? f.boe.trim() || null : null,
        description: showRemarks ? f.remarks.trim() || null : null,
        received_at: new Date().toISOString(),
      },
      payment: { required: f.payment === "YES", amount: showMoney && f.amount ? Number(f.amount) : null, method: showMoney ? f.method || null : null },
    };
  }

  /** No signal: keep the check-in (photo and all) on the phone; it uploads itself later. */
  async function saveOffline(p: CheckinPayload): Promise<boolean> {
    try {
      await queueCheckin(p, photo);
      toast.success(`${p.awb} saved on this phone — it uploads when you're back online`);
      reset();
      return true;
    } catch (e) {
      toast.error(errorMessage(e, "No signal, and it couldn't be saved on this phone either"));
      return false;
    }
  }

  async function submit() {
    if (!f.awb.trim()) { toast.error("Scan or type the AWB / reference number."); return; }
    if (!f.boat.trim()) { toast.error("Enter the client / boat name."); return; }
    const p = payload(crypto.randomUUID());
    setSaving(true);
    try {
      if (!navigator.onLine) { await saveOffline(p); return; }
      const existing = await findByAwb(p.awb);
      if (existing) { setDupe(existing); return; }
      const status = await createCheckin(p, photo);
      toast.success(`${p.awb} checked in — ${STATUS_META[status].label}`);
      reset();
    } catch (e) {
      if (isNetworkError(e)) await saveOffline(p);
      else toast.error(errorMessage(e, "Could not save the parcel"));
    } finally {
      setSaving(false);
    }
  }

  async function updateExisting() {
    if (!dupe) return;
    setSaving(true);
    try {
      await updateCheckin(dupe, payload(dupe.id), photo);
      toast.success(`${f.awb.trim()} updated with this check-in`);
      setDupe(null);
      reset();
    } catch (e) {
      toast.error(errorMessage(e, "Could not update the parcel"));
    } finally {
      setSaving(false);
    }
  }

  /** Saving leaves the form blank and ready for the next parcel. */
  function reset() { setF(BLANK); setPhoto(null); }

  return (
    <Screen title="Check-in · Parcels" onBack={onBack}
      footer={<FooterButtons onCancel={onBack} onSave={() => void submit()} saving={saving} />}>
      <PendingBanner queue={queue} />

      <Lbl label="AirWayBill">
        <div className="flex gap-2">
          <input className={inputCls} value={f.awb} placeholder="Scan or type the AWB or Reference Number"
            autoCapitalize="characters" onChange={(e) => set({ awb: e.target.value })} />
          <button type="button" onClick={() => setScanning(true)}
            className="flex h-12 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-[15px] font-semibold text-primary-foreground">
            <ScanLine className="h-5 w-5" /> SCAN
          </button>
        </div>
      </Lbl>

      <Lbl label="Client / Boat Name">
        <SuggestInput value={f.boat} onChange={(v) => set({ boat: v })} options={boats} placeholder="Start typing — known boats are offered" />
      </Lbl>

      <div className="grid grid-cols-2 gap-3">
        <Lbl label="Shipment Type">
          <select className={inputCls} value={f.shipType} onChange={(e) => set({ shipType: e.target.value as ShipType })}>
            {SHIP_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
          </select>
        </Lbl>
        <Lbl label="Quantity">
          <input className={inputCls} type="number" inputMode="numeric" min={1} value={f.qty} onChange={(e) => set({ qty: e.target.value })} />
        </Lbl>
        <Lbl label="Consignee"><input className={inputCls} value={f.consignee} onChange={(e) => set({ consignee: e.target.value })} /></Lbl>
        <Lbl label="Courier"><input className={inputCls} value={f.courier} onChange={(e) => set({ courier: e.target.value })} /></Lbl>
      </div>

      <Lbl label="Payment">
        <div className="grid grid-cols-2 gap-2">
          {(["NO", "YES"] as const).map((p) => (
            <button key={p} type="button" onClick={() => set({ payment: p })}
              className={`h-12 rounded-lg border text-[16px] font-semibold ${f.payment === p ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"}`}>
              {p}
            </button>
          ))}
        </div>
      </Lbl>

      {showMoney && (
        <div className="grid grid-cols-2 gap-3">
          <Lbl label="Amount (AED)">
            <input className={inputCls} type="number" inputMode="decimal" min={0} step="any" value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
          </Lbl>
          <Lbl label="Payment Method">
            <select className={inputCls} value={f.method} onChange={(e) => set({ method: e.target.value })}>
              <option value="">Select…</option>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Lbl>
        </div>
      )}

      {showRemarks && (
        <Lbl label="Remarks">
          <textarea className={`${inputCls} h-24 py-2`} value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} />
        </Lbl>
      )}
      {customs && (
        <Lbl label="BOE Number"><input className={inputCls} value={f.boe} onChange={(e) => set({ boe: e.target.value })} /></Lbl>
      )}

      <PhotoField file={photo} onChange={setPhoto} />

      <BarcodeScannerDialog open={scanning} onClose={() => setScanning(false)} title="Scan parcel barcode"
        onDetected={(v) => { set({ awb: v }); setScanning(false); }} />

      {dupe && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div className="font-display text-[19px] font-bold">AWB already on file</div>
            <p className="mt-2 text-[15px] text-muted-foreground">
              <span className="font-mono text-foreground">{dupe.barcode}</span> is already on the {dupe.local_import ?? "Local"} board
              {dupe.boat_name ? <> for <span className="font-semibold text-foreground">{dupe.boat_name}</span></> : null}
              {" "}({STATUS_META[dupe.status]?.label ?? dupe.status}). Check it in on that record instead of creating a duplicate?
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setDupe(null)} disabled={saving}
                className="h-12 rounded-lg border border-border text-[16px] font-semibold">Back</button>
              <button type="button" onClick={() => void updateExisting()} disabled={saving}
                className="h-12 rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-50">
                {saving ? "Saving…" : "Update it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}
