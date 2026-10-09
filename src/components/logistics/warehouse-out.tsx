/**
 * Logistics mobile app — Warehouse · Out (spec p.20–25).
 *
 * The list is every check-out still to be completed (DN WH0001…), coloured by
 * where it has got to. NEW CHECK-OUT builds one: add whole stored packages by
 * scan or by searching a client's storage, or break a box open ("Add Item from
 * Packing List") and send part of it with a Qty Out. Then choose how it leaves:
 *
 *   JLS Transport     date + available driver + destination → Save / Assign
 *   Third Party       carrier's driver name + photo + a printed delivery note → Release
 *   Client Collection crew position → name → email (or 3rd Party), photo, signature → Release
 *
 * Nothing is written until Save / Assign / Release, so Cancel discards. The warehouse
 * records only change on Release (or "Mark as Released" for a JLS run once it has gone).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, ScanLine, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";
import { BarcodeScannerDialog } from "@/components/shipsync/BarcodeScanner";
import type { SignaturePadHandle } from "@/components/shipsync/driver/SignaturePad";
import type { ShipSyncDriver } from "@/lib/shipsync/model";
import { loadDriversFor, loadDestination } from "./logistics-data";
import {
  isNotSetUp, loadCheckouts, loadCheckoutLines, loadStockBoats, loadStock, findByScan, saveCheckout, sameBoxClash,
  releaseCheckout, cancelCheckout, openDeliveryNote,
  type OutRow, type OutLine, type OutMode, type WhCheckout,
} from "./logistics-warehouse-out-data";
import { Screen, Lbl, inputCls, PhotoField, Sheet } from "./logistics-ui";
import { localToday } from "./logistics-warehouse-data";
import { ClientCollection, FootBtn } from "./checkout-parcels";
import { shipsyncApi } from "./logistics-api";

type View = { kind: "list" } | { kind: "build"; row: OutRow | null } | { kind: "detail"; row: OutRow };

const fail = (e: unknown, fallback: string) =>
  toast.error(isNotSetUp(e) ? "Warehouse - Out isn't set up in the database yet — the migration 20261003100000_warehouse_checkouts.sql needs to be run." : errorMessage(e, fallback));

export function WarehouseOut({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<View>({ kind: "list" });
  const toList = () => setView({ kind: "list" });
  if (view.kind === "build") return <Builder row={view.row} onDone={toList} />;
  if (view.kind === "detail") return <Detail row={view.row} onDone={toList} />;
  return <List onBack={onBack} onNew={() => setView({ kind: "build", row: null })}
    onOpen={(row) => setView(row.co.status === "assigned" ? { kind: "detail", row } : { kind: "build", row })} />;
}

// ── List ─────────────────────────────────────────────────────────────────────

function statusOf(r: OutRow): { label: string; cls: string } {
  if (r.co.status === "assigned") return { label: "Pending", cls: "border-emerald-500/50 bg-emerald-500/10" };
  if (r.co.mode === "third") return { label: "Third Party - Transportation", cls: "border-sky-500/50 bg-sky-500/10" };
  if (r.co.mode === "client") return { label: "For Collection", cls: "border-amber-500/50 bg-amber-500/10" };
  return { label: "Not yet arranged", cls: "border-red-500/50 bg-red-500/10" };
}

function List({ onBack, onNew, onOpen }: { onBack: () => void; onNew: () => void; onOpen: (r: OutRow) => void }) {
  const [rows, setRows] = useState<OutRow[] | null>(null);
  const [setup, setSetup] = useState(false);

  useEffect(() => {
    void loadCheckouts().then(setRows).catch((e) => {
      if (isNotSetUp(e)) setSetup(true); else toast.error(errorMessage(e, "Could not load check-outs"));
      setRows([]);
    });
  }, []);

  return (
    <Screen title="Warehouse - Out" onBack={onBack}
      footer={<button type="button" onClick={onNew} disabled={setup} className="h-12 w-full rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-50">NEW CHECK-OUT</button>}>
      {setup && (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-[15px]">
          <div className="font-semibold">Warehouse - Out isn't switched on yet</div>
          <p className="mt-1 text-muted-foreground">Its database tables haven't been created. Run <span className="font-mono text-[14px]">20261003100000_warehouse_checkouts.sql</span> once in Supabase and this screen will start working.</p>
        </div>
      )}
      {rows === null ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        : rows.length === 0 ? (!setup && <p className="py-10 text-center text-[15px] text-muted-foreground">No check-outs scheduled.</p>)
        : rows.map((r) => {
          const s = statusOf(r);
          return (
            <button key={r.co.id} type="button" onClick={() => onOpen(r)} className={cn("w-full rounded-xl border p-3 text-left", s.cls)}>
              <div className="text-[16px] font-semibold">DN {r.co.number}{r.co.boat_name ? ` - ${r.co.boat_name}` : r.total ? " - Multiple clients" : ""}</div>
              <div className="mt-1 flex justify-between gap-2 text-[14px] text-muted-foreground">
                <span>Total Package: {r.total}</span>
                <span className="text-right">{s.label}{r.driverName ? ` · ${r.driverName}` : ""}</span>
              </div>
            </button>
          );
        })}
    </Screen>
  );
}

// ── The lines on a check-out ─────────────────────────────────────────────────

function OutTables({ lines, onRemove, onQty }: { lines: OutLine[]; onRemove?: (key: string) => void; onQty?: (key: string, qty: number) => void }) {
  const packages = lines.filter((l): l is Extract<OutLine, { kind: "package" }> => l.kind === "package");
  const contents = lines.filter((l): l is Extract<OutLine, { kind: "content" }> => l.kind === "content");
  const trash = (key: string) => onRemove && (
    <td className="px-1"><button type="button" aria-label="Remove" onClick={() => onRemove(key)} className="rounded p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></td>
  );
  return (
    <div className="space-y-3">
      {(packages.length > 0 || contents.length === 0) && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[14px]">
            <thead className="bg-muted/30 text-left text-muted-foreground"><tr><th className="px-2 py-2">Client/Boat</th><th className="px-2 py-2">Ref No.</th><th className="px-2 py-2">Description</th>{onRemove && <th />}</tr></thead>
            <tbody className="divide-y divide-border/50">
              {packages.length === 0 && <tr><td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">Scan or search to add packages.</td></tr>}
              {packages.map((l) => <tr key={l.key}><td className="px-2 py-2">{l.boat || "—"}</td><td className="px-2 py-2 font-mono">{l.ref_no}</td><td className="px-2 py-2">{l.description || "—"}</td>{trash(l.key)}</tr>)}
            </tbody>
            <tfoot><tr className="bg-muted/20 font-semibold"><td className="px-2 py-2" colSpan={2}>TOTAL</td><td className="px-2 py-2 tabular-nums">{packages.length}</td>{onRemove && <td />}</tr></tfoot>
          </table>
        </div>
      )}
      {contents.length > 0 && (
        <div>
          <div className="mb-1 text-[14px] font-medium text-muted-foreground">Items from the box</div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-[14px]">
              <thead className="bg-muted/30 text-left text-muted-foreground"><tr><th className="px-2 py-2">Ref. No. / Item ID</th><th className="px-2 py-2">Description</th><th className="px-2 py-2">Stored</th><th className="px-2 py-2">Qty Out</th>{onRemove && <th />}</tr></thead>
              <tbody className="divide-y divide-border/50">
                {contents.map((l) => (
                  <tr key={l.key}>
                    <td className="px-2 py-2"><div className="font-mono">{l.itemId}</div><div className="text-muted-foreground">{l.boat}</div></td>
                    <td className="px-2 py-2">{l.description}</td>
                    <td className="px-2 py-2 tabular-nums">{l.stored}</td>
                    <td className="px-2 py-2">
                      {onQty
                        ? <input type="number" inputMode="decimal" min={0} max={l.stored} value={l.qtyOut || ""} onChange={(e) => onQty(l.key, Number(e.target.value))} className="h-10 w-16 rounded-md border border-border bg-background px-2 text-base" />
                        : <span className="tabular-nums">{l.qtyOut}</span>}
                    </td>
                    {trash(l.key)}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-muted/20 font-semibold"><td className="px-2 py-2" colSpan={3}>TOTAL</td><td className="px-2 py-2 tabular-nums">{contents.length}</td>{onRemove && <td />}</tr></tfoot>
            </table>
          </div>
        </div>
      )}
      {packages.length > 0 && contents.length > 0 && <div className="text-right text-[14px] font-semibold">Total: {lines.length}</div>}
    </div>
  );
}

// ── Search to add ────────────────────────────────────────────────────────────

/** Pick a client, then tick whole packages ("All Items") or lines from inside a box ("Items from the box", with a Qty Out). */
function SearchToAdd({ exceptId, taken, here, onAdd, onClose }: { exceptId: string | null; taken: Set<string>; here: OutLine[]; onAdd: (l: OutLine[]) => void; onClose: () => void }) {
  const [boats, setBoats] = useState<string[] | null>(null);
  const [boat, setBoat] = useState("");
  const [stock, setStock] = useState<{ packages: OutLine[]; contents: OutLine[] } | null>(null);
  const [tab, setTab] = useState<"all" | "box">("all");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState<Record<string, number>>({});

  useEffect(() => { void loadStockBoats().then(setBoats).catch((e) => { fail(e, "Could not load the warehouse"); setBoats([]); }); }, []);
  useEffect(() => {
    if (!boat) return;
    setStock(null); setTicked(new Set()); setQty({});
    let on = true;
    void loadStock(boat, exceptId)
      .then((s) => {
        if (!on) return;
        // This check-out's own lines count too: a box can't be added whole if items from it are already here, and vice versa.
        const wholeHere = new Set(here.filter((l) => l.kind === "package").map((l) => l.ref_no));
        const insideHere = new Set(here.filter((l) => l.kind === "content").map((l) => l.ref_no));
        setStock({
          packages: s.packages.filter((l) => !taken.has(l.key) && !insideHere.has(l.ref_no)),
          contents: s.contents.filter((l) => !taken.has(l.key) && !wholeHere.has(l.ref_no)),
        });
      })
      .catch((e) => { if (!on) return; fail(e, "Could not load that client's storage"); setStock({ packages: [], contents: [] }); });
    return () => { on = false; };
  }, [boat]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = stock ? (tab === "all" ? stock.packages : stock.contents) : [];
  const allOn = list.length > 0 && list.every((l) => ticked.has(l.key));
  const toggle = (key: string) => setTicked((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  function add() {
    const chosen = [...(stock?.packages ?? []), ...(stock?.contents ?? [])].filter((l) => ticked.has(l.key))
      .map((l): OutLine => (l.kind === "content" ? { ...l, qtyOut: Math.min(l.stored, qty[l.key] ?? l.stored) } : l));
    if (chosen.some((l) => l.kind === "content" && !(l.qtyOut > 0))) { toast.error("Enter a Qty Out for each item from the box."); return; }
    onAdd(chosen);
  }

  return (
    <Sheet title="Select Client/Boat Name" onClose={onClose}>
      {boats === null ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : (
        <select className={inputCls} value={boat} onChange={(e) => setBoat(e.target.value)}>
          <option value="">{boats.length ? "Select client / boat…" : "Nothing is in storage"}</option>
          {boats.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      )}
      {boat && (stock === null ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {([["all", `All Items (${stock.packages.length})`], ["box", `Items from the box (${stock.contents.length})`]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={cn("h-11 rounded-lg border text-[14px] font-semibold", tab === k ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}>{l}</button>
            ))}
          </div>
          {list.length === 0 ? <p className="text-[14px] text-muted-foreground">{tab === "all" ? `No whole packages left for ${boat}.` : `No packing-list items left for ${boat}.`}</p> : (
            <>
              <label className="flex items-center gap-3 text-[15px] font-medium">
                <input type="checkbox" className="h-5 w-5" checked={allOn} onChange={() => setTicked((s) => { const n = new Set(s); for (const l of list) { if (allOn) n.delete(l.key); else n.add(l.key); } return n; })} /> Check All items
              </label>
              <ul className="divide-y divide-border/50 rounded-lg border border-border">
                {list.map((l) => (
                  <li key={l.key} className="flex items-center gap-3 px-3 py-3 text-[15px]">
                    <input type="checkbox" aria-label={`Select ${l.ref_no}`} className="h-5 w-5 shrink-0" checked={ticked.has(l.key)} onChange={() => toggle(l.key)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[14px]">{l.kind === "content" ? l.itemId : l.ref_no}</span>
                      <span className="block truncate text-[14px] text-muted-foreground">{l.description || "—"}{l.kind === "content" ? ` · Stored ${l.stored}` : ""}</span>
                    </span>
                    {l.kind === "content" && ticked.has(l.key) && (
                      <input type="number" inputMode="decimal" min={0} max={l.stored} aria-label="Qty Out" value={qty[l.key] ?? l.stored}
                        onChange={(e) => setQty((q) => ({ ...q, [l.key]: Number(e.target.value) }))} className="h-10 w-16 shrink-0 rounded-md border border-border bg-background px-2 text-base" />
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ))}
      <button type="button" disabled={ticked.size === 0} onClick={add} className="h-12 w-full rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-50">
        Add Selected Items{ticked.size ? ` (${ticked.size})` : ""}
      </button>
    </Sheet>
  );
}

// ── Builder ──────────────────────────────────────────────────────────────────

function Builder({ row, onDone }: { row: OutRow | null; onDone: () => void }) {
  const [co, setCo] = useState<WhCheckout | null>(row?.co ?? null);
  const [lines, setLines] = useState<OutLine[]>([]);
  const [loaded, setLoaded] = useState(!row);
  const [mode, setMode] = useState<OutMode>(row?.co.mode ?? "jls");
  const [busy, setBusy] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [searching, setSearching] = useState(false);

  const [date, setDate] = useState(row?.co.scheduled_date ?? "");
  const [driverId, setDriverId] = useState(row?.co.driver_id ?? "");
  const [drivers, setDrivers] = useState<ShipSyncDriver[]>([]);
  const [destination, setDestination] = useState(row?.co.destination ?? "");
  const [carrier, setCarrier] = useState(row?.co.carrier_driver_name ?? "");
  const [h, setH] = useState({ name: "", position: "", email: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const sig = useRef<SignaturePadHandle>(null);

  /** Each mode asks for different things; what was typed for one must not be quietly submitted under another. */
  function changeMode(m: OutMode) {
    if (m === mode) return;
    setMode(m); setH({ name: "", position: "", email: "" }); setCarrier(""); setPhoto(null); sig.current?.clear();
  }
  /** Leaving with lines on the list throws them away (nothing is written until Save / Assign / Release) — so ask first. */
  const leave = () => { if (lines.length === 0 || window.confirm("Leave this check-out? What you've added so far will be discarded.")) onDone(); };
  const clearAll = () => { if (lines.length === 0 || window.confirm("Remove everything from the list?")) setLines([]); };

  useEffect(() => {
    if (!row) return;
    void loadCheckoutLines(row.co.id).then(setLines).catch((e) => fail(e, "Could not load this check-out")).finally(() => setLoaded(true));
  }, [row]);

  const boats = useMemo(() => Array.from(new Set(lines.map((l) => l.boat).filter(Boolean))), [lines]);
  const single = boats.length === 1 ? boats[0] : "";

  useEffect(() => { if (!date) return; let on = true; void loadDriversFor(date).then((d) => { if (!on) return; setDrivers(d); if (!d.some((x) => x.id === driverId)) setDriverId(""); }).catch(() => { /* the list stays as it was */ }); return () => { on = false; }; },
    [date]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (single && !destination) void loadDestination(single).then((a) => { if (a) setDestination(a); }); },
    [single]); // eslint-disable-line react-hooks/exhaustive-deps

  const taken = useMemo(() => new Set(lines.map((l) => l.key)), [lines]);
  const add = (incoming: OutLine[]) => setLines((cur) => { const have = new Set(cur.map((l) => l.key)); return [...cur, ...incoming.filter((l) => !have.has(l.key))]; });

  async function onScan(code: string) {
    setScanning(false);
    try {
      const r = await findByScan(code, co?.id ?? null);
      if (!r.line) { toast.error(r.reason ?? "Not found"); return; }
      if (taken.has(r.line.key)) { toast.info(`${code} is already on the list.`); return; }
      const clash = sameBoxClash([...lines, r.line]);
      if (clash) { toast.error(clash); return; }
      add([r.line]); toast.success(`${code} added`);
    } catch (e) { fail(e, "Could not look that up"); }
  }

  const draft = () => ({ mode, lines, date, driverId, destination, carrier });
  async function persist(status: "draft" | "assigned"): Promise<WhCheckout> {
    const saved = await saveCheckout(co?.id ?? null, draft(), status);
    setCo(saved);
    return saved;
  }

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    try { await fn(); } catch (e) { fail(e, "Something went wrong"); } finally { setBusy(null); }
  }
  const needItems = () => { if (lines.length === 0) { toast.error("Add at least one item first."); return true; } return false; };

  const save = () => { if (needItems()) return; void run("save", async () => { const n = await persist("draft"); toast.success(`Saved — DN ${n.number}`); onDone(); }); };

  const assign = () => {
    if (needItems()) return;
    if (!date) { toast.error("Select the date."); return; }
    if (!driverId) { toast.error("Select an available driver."); return; }
    void run("assign", async () => {
      const n = await persist("assigned");
      toast.success(`DN ${n.number} assigned to ${drivers.find((d) => d.id === driverId)?.name ?? "the driver"}`);
      onDone();
    });
  };

  const release = () => {
    if (needItems()) return;
    if (mode === "third") {
      if (!carrier.trim()) { toast.error("Enter the driver's name."); return; }
      if (!photo) { toast.error("Capture or upload a photo of the carrier."); return; }
    } else {
      if (!h.name.trim()) { toast.error("Enter the name of the person collecting."); return; }
      if (sig.current?.isEmpty()) { toast.error("The collector needs to sign."); return; }
    }
    void run("release", async () => {
      const n = await persist("draft");
      const signature = mode === "client" ? await sig.current?.toBlob() ?? null : null;
      await releaseCheckout(n, mode === "third"
        ? { name: carrier, position: "Third-party carrier", email: "", photo, signature: null }
        : { name: h.name, position: h.position, email: h.email, photo, signature });
      toast.success(`DN ${n.number} released`);
      // The collector's receipt, where we have an address to send it to.
      if (mode === "client" && h.email.trim()) {
        shipsyncApi("/api/shipsync/email-warehouse-receipt", { checkoutId: n.id, to: h.email.trim() })
          .then(() => toast.success(`Receipt emailed to ${h.email.trim()}`))
          .catch((e) => toast.error(errorMessage(e, "Released, but the receipt email failed")));
      }
      onDone();
    });
  };

  const generate = () => {
    if (needItems()) return;
    void run("pdf", async () => { const n = await persist("draft"); openDeliveryNote(n, lines, carrier); });
  };

  const discard = () => {
    if (!co || !window.confirm(`Cancel DN ${co.number}? Its items go back to being free to check out.`)) return;
    void run("cancel", async () => { await cancelCheckout(co.id); toast.success(`DN ${co.number} cancelled`); onDone(); });
  };

  if (!loaded) return <Screen title="Warehouse - Out" onBack={onDone}><Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin" /></Screen>;

  const footer = (
    <div className="grid grid-cols-4 gap-2">
      <FootBtn color="bg-[#E05252]" onClick={leave} disabled={!!busy}>Cancel</FootBtn>
      <FootBtn color="bg-[#E0922B]" onClick={clearAll} disabled={!!busy}>Clear</FootBtn>
      <FootBtn color="bg-[#D9B52B]" onClick={save} disabled={!!busy} loading={busy === "save"}>Save</FootBtn>
      {mode === "jls"
        ? <FootBtn color="bg-[#3FA76A]" onClick={assign} disabled={!!busy} loading={busy === "assign"}>Assign</FootBtn>
        : <FootBtn color="bg-[#3FA76A]" onClick={release} disabled={!!busy} loading={busy === "release"}>Release</FootBtn>}
    </div>
  );

  return (
    <Screen title="Warehouse - Out" subtitle={co?.number ? `DN ${co.number}` : "New delivery note"} onBack={leave} footer={footer}>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setScanning(true)} className="flex h-12 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground"><ScanLine className="h-5 w-5" /> SCAN</button>
        <button type="button" onClick={() => setSearching(true)} className="flex h-12 items-center justify-center gap-2 rounded-lg border border-border text-[15px] font-semibold"><Search className="h-5 w-5" /> SEARCH TO ADD</button>
      </div>

      <OutTables lines={lines} onRemove={(key) => setLines((c) => c.filter((l) => l.key !== key))}
        onQty={(key, q) => setLines((c) => c.map((l) => (l.key === key && l.kind === "content" ? { ...l, qtyOut: q } : l)))} />

      <Lbl label="Select Mode of Check-out">
        <select className={inputCls} value={mode} onChange={(e) => changeMode(e.target.value as OutMode)}>
          <option value="jls">JLS Transport</option>
          <option value="third">Third Party - Transport</option>
          <option value="client">Client Collection</option>
        </select>
      </Lbl>

      {mode === "jls" && (
        <>
          <Lbl label="Select Date"><input type="date" min={localToday()} className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Lbl>
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
          <Lbl label="Driver's Name"><input className={inputCls} value={carrier} onChange={(e) => setCarrier(e.target.value)} /></Lbl>
          <PhotoField file={photo} onChange={setPhoto} label="Upload or Capture an Image" />
          <button type="button" onClick={generate} disabled={!!busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-border text-[15px] font-semibold disabled:opacity-50">
            {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-5 w-5" />} Generate Delivery Note
          </button>
        </>
      )}

      {mode === "client" && <ClientCollection boats={boats} h={h} setH={setH} photo={photo} setPhoto={setPhoto} sig={sig} />}

      {co && <button type="button" onClick={discard} disabled={!!busy} className="w-full py-2 text-center text-[14px] font-medium text-destructive disabled:opacity-50">Cancel this check-out ({co.number})</button>}

      <BarcodeScannerDialog open={scanning} onClose={() => setScanning(false)} title="Scan package label" onDetected={(v) => void onScan(v)} />
      {searching && <SearchToAdd exceptId={co?.id ?? null} taken={taken} here={lines} onClose={() => setSearching(false)} onAdd={(l) => { add(l); setSearching(false); toast.success(`${l.length} added`); }} />}
    </Screen>
  );
}

// ── Detail (a JLS run that has a driver) ─────────────────────────────────────

/** Assigned runs are read-only; once the goods have gone, Mark as Released takes them out of the warehouse. */
function Detail({ row, onDone }: { row: OutRow; onDone: () => void }) {
  const [lines, setLines] = useState<OutLine[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { void loadCheckoutLines(row.co.id).then(setLines).catch((e) => { fail(e, "Could not load this check-out"); setLines([]); }); }, [row.co.id]);

  function markReleased() {
    if (!window.confirm(`Mark DN ${row.co.number} as released? The items will be taken out of the warehouse records.`)) return;
    setBusy("release");
    releaseCheckout(row.co, null).then(() => { toast.success(`DN ${row.co.number} released`); onDone(); }).catch((e) => { fail(e, "Could not release"); setBusy(null); });
  }
  function cancel() {
    if (!window.confirm(`Cancel DN ${row.co.number}? Its items go back to being free to check out.`)) return;
    setBusy("cancel");
    cancelCheckout(row.co.id).then(() => { toast.success(`DN ${row.co.number} cancelled`); onDone(); }).catch((e) => { fail(e, "Could not cancel"); setBusy(null); });
  }

  return (
    <Screen title={`DN ${row.co.number}`} subtitle={row.co.boat_name ?? "Multiple clients"} onBack={onDone}
      footer={<button type="button" onClick={markReleased} disabled={!!busy} className="flex h-12 w-full items-center justify-center rounded-lg bg-[#3FA76A] text-[16px] font-semibold text-white disabled:opacity-50">
        {busy === "release" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mark as Released"}</button>}>
      <div className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-3 text-[15px]">
        <div className="font-semibold">Driver: {row.driverName ?? "—"}</div>
        <div className="text-muted-foreground">{row.co.scheduled_date ?? "No date"} · {row.co.destination ?? "No destination"}</div>
      </div>
      {lines === null ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : <OutTables lines={lines} />}
      <button type="button" onClick={cancel} disabled={!!busy} className="w-full py-2 text-center text-[14px] font-medium text-destructive disabled:opacity-50">Cancel this check-out</button>
    </Screen>
  );
}
