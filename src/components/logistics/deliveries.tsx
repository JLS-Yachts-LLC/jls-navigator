/**
 * Logistics mobile app — Deliveries, the driver's workspace (spec p.31–35).
 *
 *   My Deliveries   the delivery notes assigned to me, "For Delivery" or
 *                   "Awaiting Completion" (I tapped Complete Later)
 *   Manifest        scan each parcel onto the van — Scan Item, tap a row and
 *                   Confirm when a label won't read, or Mark All as Scanned;
 *                   scanned rows turn green
 *   Handover        once every row is green: photo, receiver name, position,
 *                   email and signature, then Complete Delivery
 *
 * Complete Delivery stamps the proof on the parcels, closes the note and emails
 * the proof of delivery to the client and to me. Cancel Delivery returns the
 * parcels to the office's unfulfilled queue; Change Driver hands the run to a
 * colleague. Scans and the handover work with no signal and sync later; cancel,
 * change driver and closing the note need a connection and say so.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ScanLine, UserRoundCog } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";
import { BarcodeScannerDialog } from "@/components/shipsync/BarcodeScanner";
import { SignaturePad, type SignaturePadHandle } from "@/components/shipsync/driver/SignaturePad";
import { SignedImage } from "@/components/ui/signed-file";
import type { ShipSyncDeliveryNote, ShipSyncDriver, ShipSyncPackage } from "@/lib/shipsync/model";
import {
  loadDriverRuns, listActiveDrivers, scanOntoVan, setNoteDriver, removeFromRun, markAwaiting,
  cancelDelivery, completeDelivery, isScanned,
} from "./logistics-delivery-data";
import type { LogisticsIdentity } from "./logistics-identity";
import { Screen, Lbl, inputCls, PhotoField, Sheet } from "./logistics-ui";

type Runs = Awaited<ReturnType<typeof loadDriverRuns>>;
const draftKey = (noteId: string) => `logistics.delivery.draft.${noteId}`;
const online = () => typeof navigator === "undefined" || navigator.onLine;
const needOnline = (what: string) => { if (online()) return true; toast.error(`${what} needs a connection.`); return false; };

export function Deliveries({ onBack, identity }: { onBack: () => void; identity: LogisticsIdentity }) {
  const [driver, setDriver] = useState<ShipSyncDriver | null>(identity.driver);
  const [drivers, setDrivers] = useState<ShipSyncDriver[]>([]);
  const [runs, setRuns] = useState<Runs | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // Someone who isn't a driver (an administrator) chooses whose deliveries to see.
  useEffect(() => { if (!driver) void listActiveDrivers().then(setDrivers); }, [driver]);

  const reload = useCallback(async () => { if (driver) setRuns(await loadDriverRuns(driver.id)); }, [driver]);
  useEffect(() => { setRuns(null); void reload(); }, [reload]);

  if (!driver) {
    return (
      <Screen title="Deliveries" onBack={onBack}>
        <Lbl label="Whose deliveries?">
          <select className={inputCls} value="" onChange={(e) => setDriver(drivers.find((d) => d.id === e.target.value) ?? null)}>
            <option value="">{drivers.length ? "Select driver…" : "Loading…"}</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Lbl>
        <p className="text-[14px] text-muted-foreground">You're not set up as a driver, so choose one to see their run.</p>
      </Screen>
    );
  }
  if (runs === null) return <Screen title="My Deliveries" onBack={onBack}><Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin" /></Screen>;

  const mine = runs.notes
    .map((note) => ({ note, parcels: runs.packages.filter((p) => p.delivery_note_id === note.id) }))
    .filter((r) => r.parcels.length > 0);
  const open = mine.find((r) => r.note.id === openId);

  if (open) {
    return <Manifest note={open.note} parcels={open.parcels} driver={driver} reload={reload}
      onBack={() => { setOpenId(null); void reload(); }} />;
  }

  return (
    <Screen title="My Deliveries" subtitle={driver.name} onBack={onBack}
      right={!identity.driver ? <button type="button" onClick={() => setDriver(null)} className="rounded-lg px-2 py-1 text-[13px] text-muted-foreground underline">Change</button> : undefined}>
      {mine.length === 0 ? <p className="py-10 text-center text-[15px] text-muted-foreground">Nothing assigned to you right now.</p>
        : mine.map(({ note, parcels }) => (
          <button key={note.id} type="button" onClick={() => setOpenId(note.id)}
            className="w-full rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary">
            <div className="text-[16px] font-semibold">DN {note.number ?? "—"}{note.boat_name ? ` - ${note.boat_name}` : " - Multiple boats"}</div>
            <div className="mt-1 flex justify-between text-[14px]">
              <span className="text-muted-foreground">Total Package: {parcels.reduce((n, p) => n + (p.num_packages ?? 1), 0)}</span>
              <span className={note.awaiting_completion_at ? "font-medium text-amber-500" : "text-primary"}>
                {note.awaiting_completion_at ? "Awaiting Completion" : "For Delivery"}
              </span>
            </div>
          </button>
        ))}
    </Screen>
  );
}

// ── Manifest + handover ──────────────────────────────────────────────────────

function Manifest({ note, parcels, driver, reload, onBack }: {
  note: ShipSyncDeliveryNote; parcels: ShipSyncPackage[]; driver: ShipSyncDriver; reload: () => Promise<void>; onBack: () => void;
}) {
  const boats = useMemo(() => Array.from(new Set(parcels.map((p) => p.boat_name ?? "—"))), [parcels]);
  const [boat, setBoat] = useState(boats[0] ?? "—");
  useEffect(() => { if (!boats.includes(boat)) setBoat(boats[0] ?? "—"); }, [boats]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = parcels.filter((p) => (p.boat_name ?? "—") === boat);
  const allGreen = items.length > 0 && items.every(isScanned);

  const [busy, setBusy] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [detail, setDetail] = useState<ShipSyncPackage | null>(null);
  const [changing, setChanging] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [h, setH] = useState(() => { try { return JSON.parse(localStorage.getItem(draftKey(note.id)) ?? "") as { name: string; position: string; email: string }; } catch { return { name: "", position: "", email: "" }; } });
  const [photo, setPhoto] = useState<File | null>(null);
  const sig = useRef<SignaturePadHandle>(null);

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    try { await fn(); } catch (e) { toast.error(errorMessage(e, "Something went wrong")); } finally { setBusy(null); }
  }

  const scan = (p: ShipSyncPackage) => run("scan", async () => { await scanOntoVan(p); await reload(); });

  function onDetected(code: string) {
    setScanning(false);
    const p = parcels.find((x) => x.barcode?.trim().toLowerCase() === code.trim().toLowerCase());
    if (!p) { toast.error(`${code} isn't on this delivery.`); return; }
    if (isScanned(p)) { toast.info(`${code} is already scanned.`); return; }
    void scan(p);
  }

  const markAll = () => run("all", async () => { for (const p of items.filter((x) => !isScanned(x))) await scanOntoVan(p); await reload(); });

  const later = () => run("later", async () => {
    try { localStorage.setItem(draftKey(note.id), JSON.stringify(h)); } catch { /* storage blocked — the server flag below still records it */ }
    if (online()) await markAwaiting(note.id, true).catch(() => {});
    toast.success("Saved — finish it from My Deliveries.");
    onBack();
  });

  const complete = () => {
    if (!photo) { toast.error("Capture or upload a photo of the delivery."); return; }
    if (!h.name.trim() || !h.position.trim() || !h.email.trim()) { toast.error("Enter the receiver's name, position and email."); return; }
    if (sig.current?.isEmpty()) { toast.error("The receiver needs to sign."); return; }
    void run("complete", async () => {
      const signature = (await sig.current?.toBlob()) ?? null;
      const r = await completeDelivery(note, items, { ...h, photo, signature }, driver);
      try { localStorage.removeItem(draftKey(note.id)); } catch { /* ignore */ }
      toast.success(online() ? `${boat} delivered${r.emailed.length ? ` — proof emailed to ${r.emailed.join(" and ")}` : ""}` : "Saved — will sync when you're back online");
      onBack();
    });
  };

  const cancel = () => { setConfirmCancel(false); if (!needOnline("Cancelling a delivery")) return; void run("cancel", async () => { await cancelDelivery(note.id); toast.success(`DN ${note.number} cancelled — parcels returned to the office`); onBack(); }); };

  const remove = (p: ShipSyncPackage) => { if (!needOnline("Removing a parcel")) return; void run("remove", async () => { await removeFromRun(p); setDetail(null); await reload(); toast.success("Removed from the list"); }); };

  return (
    <Screen title="My Delivery" subtitle={`${boat} · DN ${note.number ?? ""}`} onBack={onBack}
      right={<button type="button" onClick={() => setChanging(true)} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[13px] font-medium"><UserRoundCog className="h-4 w-4" /> Change Driver</button>}
      footer={allGreen ? (
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => setConfirmCancel(true)} disabled={!!busy} className="h-12 rounded-lg bg-[#E05252] text-[13px] font-semibold text-white disabled:opacity-50">Cancel Delivery</button>
          <button type="button" onClick={() => void later()} disabled={!!busy} className="h-12 rounded-lg bg-[#D9B52B] text-[13px] font-semibold text-white disabled:opacity-50">Complete Later</button>
          <button type="button" onClick={complete} disabled={!!busy} className="flex h-12 items-center justify-center rounded-lg bg-[#3FA76A] text-[13px] font-semibold text-white disabled:opacity-50">
            {busy === "complete" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Complete Delivery"}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmCancel(true)} disabled={!!busy} className="h-12 w-full rounded-lg bg-[#E05252] text-[15px] font-semibold text-white disabled:opacity-50">Cancel Delivery</button>
      )}>
      {boats.length > 1 && (
        <Lbl label="Delivering to"><select className={inputCls} value={boat} onChange={(e) => setBoat(e.target.value)}>{boats.map((b) => <option key={b}>{b}</option>)}</select></Lbl>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setScanning(true)} disabled={!!busy} className="flex h-12 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50"><ScanLine className="h-5 w-5" /> Scan Item</button>
        <button type="button" onClick={() => void markAll()} disabled={!!busy || allGreen} className="h-12 rounded-lg border border-border text-[15px] font-semibold disabled:opacity-50">Mark All as Scanned</button>
      </div>

      <p className="text-[14px] text-muted-foreground">Total Item: {items.reduce((n, p) => n + (p.num_packages ?? 1), 0)} · {items.filter(isScanned).length} of {items.length} scanned</p>
      <ul className="space-y-2">
        {items.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setDetail(p)}
              className={cn("w-full rounded-lg border px-3 py-3 text-left text-[15px] transition", isScanned(p) ? "border-emerald-500/60 bg-emerald-500/20" : "border-border bg-muted/30")}>
              {p.boat_name} - <span className="font-mono">{p.barcode ?? "—"}</span> - {p.package_owner ?? "—"} - {p.courier ?? "—"} - {p.num_packages ?? 1}pc
            </button>
          </li>
        ))}
      </ul>

      {allGreen && (
        <section className="space-y-3 border-t border-border pt-4">
          <div className="font-display text-[17px] font-bold">Handover</div>
          <PhotoField file={photo} onChange={setPhoto} label="Upload or Capture an Image" />
          <Lbl label="Name of Person who received the package"><input className={inputCls} value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} /></Lbl>
          <Lbl label="Position"><input className={inputCls} value={h.position} onChange={(e) => setH({ ...h, position: e.target.value })} /></Lbl>
          <Lbl label="Email Address"><input className={inputCls} type="email" value={h.email} onChange={(e) => setH({ ...h, email: e.target.value })} /></Lbl>
          <div><span className="mb-1 block text-[14px] font-medium text-muted-foreground">Signature</span><SignaturePad ref={sig} /></div>
        </section>
      )}

      <BarcodeScannerDialog open={scanning} onClose={() => setScanning(false)} title="Scan parcel label" onDetected={onDetected} />

      {detail && (
        <Sheet title={detail.boat_name ?? "Parcel"} onClose={() => setDetail(null)}>
          <dl className="space-y-1 text-[15px]">
            <div><dt className="inline text-muted-foreground">AWB: </dt><dd className="inline font-mono">{detail.barcode ?? "—"}</dd></div>
            <div><dt className="inline text-muted-foreground">Consignee: </dt><dd className="inline">{detail.package_owner ?? "—"}</dd></div>
            <div><dt className="inline text-muted-foreground">Courier: </dt><dd className="inline">{detail.courier ?? "—"}</dd></div>
            <div><dt className="inline text-muted-foreground">Quantity: </dt><dd className="inline">{detail.num_packages ?? 1}</dd></div>
          </dl>
          {detail.item_photo_url && <SignedImage stored={detail.item_photo_url} alt="Package" className="max-h-56 w-full rounded-lg object-contain" />}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => remove(detail)} disabled={!!busy} className="h-12 rounded-lg border border-red-500/60 text-[15px] font-semibold text-red-500 disabled:opacity-50">Removed from List</button>
            <button type="button" onClick={() => { void scan(detail); setDetail(null); }} disabled={!!busy || isScanned(detail)} className="h-12 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50">{isScanned(detail) ? "Confirmed" : "Confirm"}</button>
          </div>
        </Sheet>
      )}

      {confirmCancel && (
        <Sheet title="Cancel this delivery?" onClose={() => setConfirmCancel(false)}>
          <p className="text-[15px] text-muted-foreground">The whole trip is aborted and every parcel on it goes back to the office's unfulfilled queue.</p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setConfirmCancel(false)} className="h-12 rounded-lg border border-border text-[15px] font-semibold">Keep it</button>
            <button type="button" onClick={cancel} className="h-12 rounded-lg bg-[#E05252] text-[15px] font-semibold text-white">Cancel Delivery</button>
          </div>
        </Sheet>
      )}

      {changing && <ChangeDriver note={note} current={driver} onClose={() => setChanging(false)} onDone={onBack} />}
    </Screen>
  );
}

function ChangeDriver({ note, current, onClose, onDone }: { note: ShipSyncDeliveryNote; current: ShipSyncDriver; onClose: () => void; onDone: () => void }) {
  const [list, setList] = useState<ShipSyncDriver[] | null>(null);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void listActiveDrivers().then((d) => setList(d.filter((x) => x.id !== current.id))); }, [current.id]);

  async function go() {
    if (!needOnline("Changing the driver")) return;
    setBusy(true);
    try { await setNoteDriver(note.id, to); toast.success("Handed over — the run is now on their phone."); onDone(); }
    catch (e) { toast.error(errorMessage(e, "Could not change the driver")); setBusy(false); }
  }

  return (
    <Sheet title="Change Driver" onClose={onClose}>
      <p className="text-[14px] text-muted-foreground">Hand this run to another driver. It moves to their phone straight away.</p>
      <select className={inputCls} value={to} onChange={(e) => setTo(e.target.value)}>
        <option value="">{list ? "Select New Driver" : "Loading…"}</option>
        {(list ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <button type="button" onClick={() => void go()} disabled={!to || busy} className="h-12 w-full rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-50">
        {busy ? "Handing over…" : "Complete Handover"}
      </button>
    </Sheet>
  );
}
