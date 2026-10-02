/**
 * Logistics mobile app — Check-Out · Parcels (spec p.7–16).
 *
 * The list is every open delivery note — red while it has no driver (a draft),
 * green once assigned. NEW CHECK-OUT builds one: add parcels by scan or by
 * searching a boat's waiting parcels, pick how they leave, and finish:
 *
 *   JLS Vehicle         date + available driver + destination → Save (draft) / Assign
 *   Third-Party Transp. carrier's driver name + photo + delivery note   → Release
 *   Client Collection   crew position → name → email (or 3rd Party), photo, signature → Release
 *
 * Nothing is written until Save / Assign / Release, so Cancel really does discard
 * — and a cancelled check-out never uses up a delivery-note number. The two
 * "Move to storage" routes belong to the warehouse module and arrive with it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, ScanLine, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";
import { BarcodeScannerDialog } from "@/components/shipsync/BarcodeScanner";
import { SignaturePad, type SignaturePadHandle } from "@/components/shipsync/driver/SignaturePad";
import type { ShipSyncDeliveryNote, ShipSyncDriver } from "@/lib/shipsync/model";
import {
  loadCheckoutNotes, loadNoteParcels, loadBoatsWithParcels, loadReleasableForBoat, findReleasableByAwb,
  syncNoteParcels, assignToDriver, releaseParcels, loadDriversFor, loadCrewForBoat, loadDestination,
  type CheckoutNote, type ParcelLite, type CrewMember,
} from "./logistics-data";
import { generateNotePdf, shipsyncApi } from "./logistics-api";
import { Screen, Lbl, inputCls, PhotoField } from "./logistics-ui";

type Mode = "jls" | "third" | "client";

export function CheckoutParcels({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<{ kind: "list" } | { kind: "build"; note: ShipSyncDeliveryNote | null } | { kind: "detail"; row: CheckoutNote }>({ kind: "list" });
  if (view.kind === "build") {
    return <Builder note={view.note} onDone={() => setView({ kind: "list" })} />;
  }
  if (view.kind === "detail") return <Detail row={view.row} onBack={() => setView({ kind: "list" })} />;
  return <List onBack={onBack} onNew={() => setView({ kind: "build", note: null })}
    onOpen={(row) => setView(row.driverName ? { kind: "detail", row } : { kind: "build", note: row.note })} />;
}

// ── List ─────────────────────────────────────────────────────────────────────

function List({ onBack, onNew, onOpen }: { onBack: () => void; onNew: () => void; onOpen: (r: CheckoutNote) => void }) {
  const [rows, setRows] = useState<CheckoutNote[] | null>(null);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => { void loadCheckoutNotes().then(setRows).catch((e) => { toast.error(errorMessage(e, "Could not load delivery notes")); setRows([]); }); }, []);

  return (
    <Screen title="Check-Out - Parcels" onBack={onBack}
      footer={<button type="button" onClick={() => setChoosing(true)} className="h-12 w-full rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground">NEW CHECK-OUT</button>}>
      {rows === null ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : rows.length === 0 ? <p className="py-10 text-center text-[15px] text-muted-foreground">No check-outs in progress.</p>
        : rows.map((r) => (
          <button key={r.note.id} type="button" onClick={() => onOpen(r)}
            className={cn("w-full rounded-xl border p-3 text-left",
              r.driverName ? "border-emerald-500/50 bg-emerald-500/10" : "border-red-500/50 bg-red-500/10")}>
            <div className="text-[16px] font-semibold">DN {r.note.number ?? "—"}{r.note.boat_name ? ` - ${r.note.boat_name}` : " - Multiple boats"}</div>
            <div className="mt-1 flex justify-between text-[14px] text-muted-foreground">
              <span>Total Package: {r.total}</span>
              <span>Driver: {r.driverName ?? "No Driver Assigned"}</span>
            </div>
          </button>
        ))}

      {choosing && (
        <Sheet onClose={() => setChoosing(false)} title="NEW CHECK-OUT">
          <button type="button" onClick={() => { setChoosing(false); onNew(); }} className="h-12 w-full rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground">
            Check-out Parcel for Release
          </button>
          {["Move Parcel to Storage as 1 Box", "Move Parcel to Storage as Individual"].map((l) => (
            <div key={l} className="flex h-12 w-full items-center justify-between rounded-lg border border-border px-4 text-[16px] font-semibold opacity-60">
              {l}<span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-medium text-muted-foreground">Soon</span>
            </div>
          ))}
        </Sheet>
      )}
    </Screen>
  );
}

/** Assigned notes are read-only here — the driver app runs them. */
function Detail({ row, onBack }: { row: CheckoutNote; onBack: () => void }) {
  const [parcels, setParcels] = useState<ParcelLite[] | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  useEffect(() => { void loadNoteParcels(row.note.id).then(setParcels); }, [row.note.id]);

  async function openPdf() {
    setPdfBusy(true);
    try { window.open(await generateNotePdf(row.note.id), "_blank", "noreferrer"); }
    catch (e) { toast.error(errorMessage(e, "Could not build the delivery note")); }
    finally { setPdfBusy(false); }
  }

  return (
    <Screen title={`DN ${row.note.number ?? ""}`} subtitle={row.note.boat_name ?? "Multiple boats"} onBack={onBack}
      footer={<button type="button" onClick={() => void openPdf()} disabled={pdfBusy} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-border text-[16px] font-semibold disabled:opacity-50">
        {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-5 w-5" />} Delivery note (PDF)
      </button>}>
      <div className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-3 text-[15px]">
        <div className="font-semibold">Driver: {row.driverName}</div>
        <div className="text-muted-foreground">Total Package: {row.total}</div>
      </div>
      {parcels === null ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : <ParcelTable parcels={parcels} />}
    </Screen>
  );
}

// ── Builder ──────────────────────────────────────────────────────────────────

function Builder({ note: initial, onDone }: { note: ShipSyncDeliveryNote | null; onDone: () => void }) {
  const [note, setNote] = useState<ShipSyncDeliveryNote | null>(initial);
  const [parcels, setParcels] = useState<ParcelLite[]>([]);
  const [loaded, setLoaded] = useState(!initial);
  const [mode, setMode] = useState<Mode>("jls");
  const [busy, setBusy] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [searching, setSearching] = useState(false);

  // JLS vehicle
  const [date, setDate] = useState("");
  const [driverId, setDriverId] = useState("");
  const [drivers, setDrivers] = useState<ShipSyncDriver[]>([]);
  const [destination, setDestination] = useState("");
  // Third party / client collection
  const [h, setH] = useState({ name: "", position: "", email: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const sig = useRef<SignaturePadHandle>(null);

  useEffect(() => { if (initial) void loadNoteParcels(initial.id).then((p) => { setParcels(p); setLoaded(true); }); }, [initial]);

  const boatNames = useMemo(() => Array.from(new Set(parcels.map((p) => p.boat_name).filter(Boolean) as string[])), [parcels]);
  const single = boatNames.length === 1 ? boatNames[0] : "";

  useEffect(() => { if (date) void loadDriversFor(date).then((d) => { setDrivers(d); if (!d.some((x) => x.id === driverId)) setDriverId(""); }); },
    [date]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (single && !destination) void loadDestination(single).then((a) => { if (a) setDestination(a); }); },
    [single]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = useCallback((incoming: ParcelLite[]) => {
    setParcels((cur) => {
      const have = new Set(cur.map((p) => p.id));
      return [...cur, ...incoming.filter((p) => !have.has(p.id))];
    });
  }, []);

  async function onScan(code: string) {
    setScanning(false);
    if (parcels.some((p) => p.barcode?.toLowerCase() === code.trim().toLowerCase())) { toast.info(`${code} is already on the list.`); return; }
    const r = await findReleasableByAwb(code);
    if (r.parcel) { add([r.parcel]); toast.success(`${code} added`); } else toast.error(r.reason ?? "Not found");
  }

  /** Reserve the parcels on a note (creating it on first save) and keep it. */
  async function persist(): Promise<ShipSyncDeliveryNote> {
    const n = await syncNoteParcels(note?.id ?? null, parcels);
    setNote(n);
    return n;
  }

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    try { await fn(); } catch (e) { toast.error(errorMessage(e, "Something went wrong")); } finally { setBusy(null); }
  }

  const needItems = () => { if (parcels.length === 0) { toast.error("Add at least one parcel first."); return true; } return false; };

  const save = () => { if (needItems()) return; void run("save", async () => { const n = await persist(); toast.success(`Saved as draft — DN ${n.number}`); onDone(); }); };

  const assign = () => {
    if (needItems()) return;
    if (!date) { toast.error("Select the delivery date."); return; }
    if (!driverId) { toast.error("Select an available driver."); return; }
    void run("assign", async () => {
      const n = await persist();
      await assignToDriver(n, parcels, driverId, date, destination);
      toast.success(`DN ${n.number} assigned to ${drivers.find((d) => d.id === driverId)?.name ?? "the driver"}`);
      onDone();
    });
  };

  const release = () => {
    if (needItems()) return;
    if (!h.name.trim()) { toast.error(mode === "third" ? "Enter the driver's name." : "Enter the name of the person collecting."); return; }
    if (mode === "third" && !photo) { toast.error("Capture or upload a photo of the carrier."); return; }
    if (mode === "client" && sig.current?.isEmpty()) { toast.error("The collector needs to sign."); return; }
    void run("release", async () => {
      const n = await persist();
      const signature = mode === "client" ? await sig.current?.toBlob() ?? null : null;
      await releaseParcels(n, parcels, {
        name: h.name, email: h.email, photo, signature,
        position: mode === "third" ? "Third-party carrier" : h.position,
      });
      toast.success(`DN ${n.number} released`);
      // The collector's receipt, where we have an address to send it to.
      if (mode === "client" && h.email.trim()) {
        shipsyncApi("/api/shipsync/email-pod", { noteId: n.id, kind: "delivery", to: h.email.trim() })
          .then(() => toast.success(`Receipt emailed to ${h.email.trim()}`))
          .catch((e) => toast.error(errorMessage(e, "Released, but the receipt email failed")));
      }
      onDone();
    });
  };

  const generate = () => {
    if (needItems()) return;
    void run("pdf", async () => { const n = await persist(); window.open(await generateNotePdf(n.id), "_blank", "noreferrer"); });
  };

  if (!loaded) return <Screen title="Check-Out - Parcels" onBack={onDone}><Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin" /></Screen>;

  const footer = (
    <div className="grid grid-cols-4 gap-2">
      <FootBtn color="bg-[#E05252]" onClick={onDone} disabled={!!busy}>Cancel</FootBtn>
      <FootBtn color="bg-[#E0922B]" onClick={() => setParcels([])} disabled={!!busy}>Clear</FootBtn>
      <FootBtn color="bg-[#D9B52B]" onClick={save} disabled={!!busy} loading={busy === "save"}>Save</FootBtn>
      {mode === "jls"
        ? <FootBtn color="bg-[#3FA76A]" onClick={assign} disabled={!!busy} loading={busy === "assign"}>Assign</FootBtn>
        : <FootBtn color="bg-[#3FA76A]" onClick={release} disabled={!!busy} loading={busy === "release"}>Release</FootBtn>}
    </div>
  );

  return (
    <Screen title="Check-Out - Parcels" subtitle={note?.number ? `DN ${note.number}` : "New delivery note"} onBack={onDone} footer={footer}>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setScanning(true)} className="flex h-12 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground">
          <ScanLine className="h-5 w-5" /> SCAN
        </button>
        <button type="button" onClick={() => setSearching(true)} className="flex h-12 items-center justify-center gap-2 rounded-lg border border-border text-[15px] font-semibold">
          <Search className="h-5 w-5" /> SEARCH TO ADD
        </button>
      </div>

      <ParcelTable parcels={parcels} withBoat onRemove={(id) => setParcels((c) => c.filter((p) => p.id !== id))} />

      <Lbl label="Select Mode of Check-out">
        <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
          <option value="jls">JLS Vehicle</option>
          <option value="third">Third-Party Transportation</option>
          <option value="client">Client Collection</option>
        </select>
      </Lbl>

      {mode === "jls" && (
        <>
          <Lbl label="Select Date"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Lbl>
          <Lbl label="Select Driver">
            <select className={inputCls} value={driverId} onChange={(e) => setDriverId(e.target.value)} disabled={!date}>
              <option value="">{date ? (drivers.length ? "Select driver…" : "No driver available that day") : "Pick a date first"}</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Lbl>
          <Lbl label="Destination"><input className={inputCls} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Marina, berth or address" /></Lbl>
        </>
      )}

      {mode === "third" && (
        <>
          <Lbl label="Driver's Name"><input className={inputCls} value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} /></Lbl>
          <PhotoField file={photo} onChange={setPhoto} label="Upload or Capture an Image" />
          <button type="button" onClick={generate} disabled={!!busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-border text-[15px] font-semibold disabled:opacity-50">
            {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-5 w-5" />} Generate Delivery Note
          </button>
        </>
      )}

      {mode === "client" && <ClientCollection boats={boatNames} h={h} setH={setH} photo={photo} setPhoto={setPhoto} sig={sig} />}

      <BarcodeScannerDialog open={scanning} onClose={() => setScanning(false)} title="Scan parcel label" onDetected={(v) => void onScan(v)} />
      {searching && <SearchToAdd onClose={() => setSearching(false)} onAdd={(p) => { add(p); setSearching(false); toast.success(`${p.length} added`); }} taken={new Set(parcels.map((p) => p.id))} />}
    </Screen>
  );
}

function FootBtn({ color, onClick, disabled, loading, children }: { color: string; onClick: () => void; disabled?: boolean; loading?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cn("flex h-12 items-center justify-center rounded-lg text-[14px] font-semibold text-white disabled:opacity-50", color)}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function ParcelTable({ parcels, withBoat, onRemove }: { parcels: ParcelLite[]; withBoat?: boolean; onRemove?: (id: string) => void }) {
  const total = parcels.reduce((n, p) => n + (p.num_packages ?? 1), 0);
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-[13px]">
        <thead className="bg-muted/30 text-left text-muted-foreground">
          <tr>{withBoat && <th className="px-2 py-2">Client/Boat</th>}<th className="px-2 py-2">AWB</th><th className="px-2 py-2">Consignee</th><th className="px-2 py-2">Courier</th><th className="px-2 py-2">Qty</th>{onRemove && <th />}</tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {parcels.length === 0 && <tr><td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">Scan or search to add parcels.</td></tr>}
          {parcels.map((p) => (
            <tr key={p.id}>
              {withBoat && <td className="px-2 py-2">{p.boat_name ?? "—"}</td>}
              <td className="px-2 py-2 font-mono">{p.barcode ?? "—"}</td>
              <td className="px-2 py-2">{p.package_owner ?? "—"}</td>
              <td className="px-2 py-2">{p.courier ?? "—"}</td>
              <td className="px-2 py-2 tabular-nums">{p.num_packages ?? 1}</td>
              {onRemove && <td className="px-1"><button type="button" aria-label="Remove" onClick={() => onRemove(p.id)} className="rounded p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></td>}
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="bg-muted/20 font-semibold"><td className="px-2 py-2" colSpan={withBoat ? 4 : 3}>TOTAL</td><td className="px-2 py-2 tabular-nums">{total}</td>{onRemove && <td />}</tr></tfoot>
      </table>
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-[19px] font-bold">{title}</div>
        {children}
      </div>
    </div>
  );
}

/** The manual fallback: pick a boat, tick what to send, Add Selected Items. */
function SearchToAdd({ onClose, onAdd, taken }: { onClose: () => void; onAdd: (p: ParcelLite[]) => void; taken: Set<string> }) {
  const [boats, setBoats] = useState<string[] | null>(null);
  const [boat, setBoat] = useState("");
  const [items, setItems] = useState<ParcelLite[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  useEffect(() => { void loadBoatsWithParcels().then(setBoats); }, []);
  useEffect(() => { if (boat) { setItems(null); setTicked(new Set()); void loadReleasableForBoat(boat).then((r) => setItems(r.filter((p) => !taken.has(p.id)))); } }, [boat]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setTicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); // eslint-disable-line @typescript-eslint/no-unused-expressions
  const allOn = !!items?.length && items.every((p) => ticked.has(p.id));

  return (
    <Sheet title="Select Client/Boat Name" onClose={onClose}>
      {boats === null ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : (
        <select className={inputCls} value={boat} onChange={(e) => setBoat(e.target.value)}>
          <option value="">{boats.length ? "Select boat…" : "Nothing is waiting to go out"}</option>
          {boats.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      )}
      {boat && (items === null ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : items.length === 0 ? <p className="text-[14px] text-muted-foreground">Nothing left for {boat}.</p> : (
        <>
          <label className="flex items-center gap-3 text-[15px] font-medium">
            <input type="checkbox" className="h-5 w-5" checked={allOn} onChange={() => setTicked(allOn ? new Set() : new Set(items.map((p) => p.id)))} /> Check All items
          </label>
          <ul className="divide-y divide-border/50 rounded-lg border border-border">
            {items.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-3 px-3 py-3 text-[15px]">
                  <input type="checkbox" className="h-5 w-5" checked={ticked.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="min-w-0 flex-1"><span className="block truncate font-mono text-[14px]">{p.barcode ?? "—"}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">{[p.package_owner, p.courier].filter(Boolean).join(" · ") || "—"} · Qty {p.num_packages ?? 1}</span></span>
                </label>
              </li>
            ))}
          </ul>
        </>
      ))}
      <button type="button" disabled={ticked.size === 0} onClick={() => onAdd((items ?? []).filter((p) => ticked.has(p.id)))}
        className="h-12 w-full rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-50">
        Add Selected Items{ticked.size ? ` (${ticked.size})` : ""}
      </button>
    </Sheet>
  );
}

/** Position → Name → Email from the boat's crew list, or free text for a 3rd party. */
function ClientCollection({
  boats, h, setH, photo, setPhoto, sig,
}: {
  boats: string[]; h: { name: string; position: string; email: string }; setH: (v: { name: string; position: string; email: string }) => void;
  photo: File | null; setPhoto: (f: File | null) => void; sig: React.RefObject<SignaturePadHandle | null>;
}) {
  const [boat, setBoat] = useState(boats[0] ?? "");
  const [crew, setCrew] = useState<CrewMember[]>([]);
  useEffect(() => { if (!boats.includes(boat)) setBoat(boats[0] ?? ""); }, [boats]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (boat) void loadCrewForBoat(boat).then(setCrew); else setCrew([]); }, [boat]);

  const THIRD = "3rd Party";
  const ranks = useMemo(() => Array.from(new Set(crew.map((c) => c.rank))).sort(), [crew]);
  const third = h.position === THIRD;
  const names = crew.filter((c) => c.rank === h.position);

  return (
    <>
      {boats.length > 1 && (
        <Lbl label="Collecting for"><select className={inputCls} value={boat} onChange={(e) => { setBoat(e.target.value); setH({ name: "", position: "", email: "" }); }}>{boats.map((b) => <option key={b}>{b}</option>)}</select></Lbl>
      )}
      <Lbl label="Position">
        <select className={inputCls} value={h.position} onChange={(e) => setH({ name: "", position: e.target.value, email: "" })}>
          <option value="">Select position…</option>
          {ranks.map((r) => <option key={r} value={r}>{r}</option>)}
          <option value={THIRD}>{THIRD}</option>
        </select>
      </Lbl>
      {third ? (
        <>
          <Lbl label="Name"><input className={inputCls} value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} /></Lbl>
          <Lbl label="Email Address"><input className={inputCls} type="email" value={h.email} onChange={(e) => setH({ ...h, email: e.target.value })} /></Lbl>
        </>
      ) : (
        <>
          <Lbl label="Name">
            <select className={inputCls} disabled={!h.position} value={h.name}
              onChange={(e) => setH({ ...h, name: e.target.value, email: crew.find((c) => c.rank === h.position && c.name === e.target.value)?.email ?? "" })}>
              <option value="">{h.position ? "Select name…" : "Pick a position first"}</option>
              {names.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </Lbl>
          <Lbl label="Email Address"><input className={inputCls} type="email" value={h.email} readOnly placeholder="Filled in from the crew list" /></Lbl>
        </>
      )}
      <PhotoField file={photo} onChange={setPhoto} label="Upload or Capture an Image" />
      <div>
        <span className="mb-1 block text-[14px] font-medium text-muted-foreground">Sign</span>
        <SignaturePad ref={sig as React.RefObject<SignaturePadHandle>} />
      </div>
    </>
  );
}
