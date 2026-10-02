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
 * Saving writes the same shipsync_packages row the office boards read, so a
 * parcel checked in here is on the Local / Import board straight away. Local
 * parcels land in Warehouse (the office's default); Import and Transit are given
 * a Monday-style Item ID and joined to the "Incoming" group when the board has
 * one, exactly as the desktop does for a shipment raised in the app.
 */
import { useEffect, useState } from "react";
import { ScanLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/error-message";
import { BarcodeScannerDialog } from "@/components/shipsync/BarcodeScanner";
import { createPackage, patchPackage, uploadShipSyncImage, loadYachtNames, loadDestinations } from "@/lib/shipsync/data";
import { nextItemId, STATUS_META, type PackageStatus, type ShipSyncPackage } from "@/lib/shipsync/model";
import { Screen, Lbl, inputCls, SuggestInput, PhotoField, FooterButtons } from "./logistics-ui";

const sb = supabase as any;

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

  /** The parcel row for this form — shared by a fresh check-in and an update of an existing one. */
  function fields(): Partial<ShipSyncPackage> {
    return {
      barcode: f.awb.trim(),
      boat_name: f.boat.trim().toUpperCase() || null,
      package_owner: f.consignee.trim() || null,
      courier: f.courier.trim() || null,
      num_packages: Math.max(1, Number(f.qty) || 1),
      local_import: f.shipType,
      boe_no: customs ? f.boe.trim() || null : null,
      description: showRemarks ? f.remarks.trim() || null : null,
      received_at: new Date().toISOString(),
    };
  }

  /** Payment has no column of its own; it rides in `extra` beside the rest of the intake detail. */
  function paymentExtra() {
    return {
      payment: {
        required: f.payment === "YES",
        amount: showMoney && f.amount ? Number(f.amount) : null,
        method: showMoney ? f.method || null : null,
      },
    };
  }

  async function submit() {
    if (!f.awb.trim()) { toast.error("Scan or type the AWB / reference number."); return; }
    if (!f.boat.trim()) { toast.error("Enter the client / boat name."); return; }
    setSaving(true);
    try {
      // ilike for a case-insensitive exact match — with the pattern characters
      // escaped, so an AWB containing "_" or "%" is not read as a wildcard.
      const exact = f.awb.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
      const { data: existing } = await sb.from("shipsync_packages").select("*").ilike("barcode", exact).limit(1);
      if (existing?.[0]) { setDupe(existing[0] as ShipSyncPackage); return; }
      await create();
    } catch (e) {
      toast.error(errorMessage(e, "Could not save the parcel"));
    } finally {
      setSaving(false);
    }
  }

  async function create() {
    const id = crypto.randomUUID();
    const item_photo_url = photo ? await uploadShipSyncImage(photo, `packages/${id}/item_${Date.now()}.jpg`) : null;
    const extra: Record<string, unknown> = { ...paymentExtra(), checked_in_via: "logistics-app" };
    let status: PackageStatus = "in_storage";

    if (customs) {
      // Same shape the Import board gives a shipment raised in the app: a
      // Monday-style Item ID, and the "Incoming" group if the board has one.
      status = "in_office";
      const itemId = await nextItemId();
      const { data: sample } = await sb.from("shipsync_packages").select("extra")
        .in("local_import", ["Import", "Transit"]).eq("extra->>monday_group_title", "Incoming").limit(1);
      const g = sample?.[0]?.extra;
      if (g) { extra.monday_group_title = "Incoming"; extra.monday_group_position = g.monday_group_position; }
      extra.monday = { "Item ID": itemId, ...(g ? { STATUS: "Incoming" } : {}) };
    }

    await createPackage({ id, ...fields(), status, item_photo_url, extra } as any);
    toast.success(`${f.awb.trim()} checked in — ${STATUS_META[status].label}`);
    reset();
  }

  /** The AWB already exists (often a Monday item raised before the parcel arrived) — check it in rather than duplicate it. */
  async function updateExisting() {
    if (!dupe) return;
    setSaving(true);
    try {
      const id = dupe.id;
      const item_photo_url = photo ? await uploadShipSyncImage(photo, `packages/${id}/item_${Date.now()}.jpg`) : dupe.item_photo_url;
      await patchPackage(id, {
        ...fields(), item_photo_url,
        extra: { ...(dupe.extra ?? {}), ...paymentExtra(), checked_in_via: "logistics-app" },
      } as any);
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
