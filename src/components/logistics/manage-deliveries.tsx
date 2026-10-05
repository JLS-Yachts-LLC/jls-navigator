/**
 * Logistics mobile app — Manage Deliveries, the administrator's view (spec p.36–38).
 *
 *   For Deliveries   every open delivery note, colour-coded: yellow = the driver
 *                    tapped Complete Later (Awaiting Completion), red = no driver
 *                    yet, green = assigned. Tap one to see its parcels, force a
 *                    status change, cancel it or change its driver.
 *   Delivered        finished notes, searchable by AWB, reference, client or
 *                    delivery note, filterable by boat and delivery date. Tap one
 *                    for the parcels, the proof-of-delivery photo, the delivery
 *                    note PDF and a Resend box.
 */
import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";
import { SignedImage } from "@/components/ui/signed-file";
import type { ShipSyncDriver, ShipSyncPackage } from "@/lib/shipsync/model";
import { loadCheckoutNotes, type CheckoutNote } from "./logistics-data";
import {
  searchDelivered, loadNoteFull, loadDeliveredBoats, adminSetStatus, resendPod, listActiveDrivers, setNoteDriver,
  type DeliveredRow,
} from "./logistics-delivery-data";
import { generateNotePdf } from "./logistics-api";
import { Screen, Lbl, inputCls, Sheet } from "./logistics-ui";

type Tab = "active" | "delivered";
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export function ManageDeliveries({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("active");
  const [active, setActive] = useState<CheckoutNote | null>(null);
  const [done, setDone] = useState<DeliveredRow | null>(null);

  if (active) return <ActiveDetail row={active} onBack={() => setActive(null)} />;
  if (done) return <DeliveredDetail row={done} onBack={() => setDone(null)} />;

  return (
    <Screen title="Manage Deliveries" onBack={onBack}>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card/50 p-1">
        {([["active", "For Deliveries"], ["delivered", "Delivered"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={cn("h-10 rounded-md text-[15px] font-semibold transition", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      {tab === "active" ? <ActiveList onOpen={setActive} /> : <DeliveredList onOpen={setDone} />}
    </Screen>
  );
}

// ── For Deliveries ───────────────────────────────────────────────────────────

function tone(r: CheckoutNote): { cls: string; label: string } {
  if (r.note.awaiting_completion_at) return { cls: "border-amber-500/60 bg-amber-500/15", label: "Awaiting Completion" };
  if (!r.driverName) return { cls: "border-red-500/50 bg-red-500/10", label: "Driver: No Driver Assigned" };
  return { cls: "border-emerald-500/50 bg-emerald-500/10", label: `Driver: ${r.driverName}` };
}

function ActiveList({ onOpen }: { onOpen: (r: CheckoutNote) => void }) {
  const [rows, setRows] = useState<CheckoutNote[] | null>(null);
  useEffect(() => { void loadCheckoutNotes().then(setRows).catch((e) => { toast.error(errorMessage(e, "Could not load deliveries")); setRows([]); }); }, []);
  if (rows === null) return <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin" />;
  if (rows.length === 0) return <p className="py-10 text-center text-[15px] text-muted-foreground">Nothing is out for delivery.</p>;
  return (
    <>
      <p className="text-[14px] text-muted-foreground">Select a delivery to view details, change status, cancel it or change driver.</p>
      {rows.map((r) => {
        const t = tone(r);
        return (
          <button key={r.note.id} type="button" onClick={() => onOpen(r)} className={cn("w-full rounded-xl border p-3 text-left", t.cls)}>
            <div className="text-[16px] font-semibold">DN {r.note.number ?? "—"}{r.note.boat_name ? ` - ${r.note.boat_name}` : " - Multiple boats"}</div>
            <div className="mt-1 flex justify-between text-[14px] text-muted-foreground"><span>Total Package: {r.total}</span><span>{t.label}</span></div>
          </button>
        );
      })}
    </>
  );
}

function ActiveDetail({ row, onBack }: { row: CheckoutNote; onBack: () => void }) {
  const { note } = row;
  const [parcels, setParcels] = useState<ShipSyncPackage[] | null>(null);
  const [sheet, setSheet] = useState<null | "status" | "driver" | "cancel">(null);
  const [drivers, setDrivers] = useState<ShipSyncDriver[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { void loadNoteFull(note.id).then(setParcels); void listActiveDrivers().then(setDrivers); }, [note.id]);

  async function act(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); onBack(); } catch (e) { toast.error(errorMessage(e, "Could not save")); setBusy(false); }
  }

  const t = tone(row);
  return (
    <Screen title={`DN ${note.number ?? ""}`} subtitle={note.boat_name ?? "Multiple boats"} onBack={onBack}
      footer={<div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={() => { setPick(note.status); setSheet("status"); }} className="h-12 rounded-lg border border-border text-[13px] font-semibold">Change Status</button>
        <button type="button" onClick={() => { setPick(note.driver_id ?? ""); setSheet("driver"); }} className="h-12 rounded-lg border border-border text-[13px] font-semibold">Change Driver</button>
        <button type="button" onClick={() => setSheet("cancel")} className="h-12 rounded-lg bg-[#E05252] text-[13px] font-semibold text-white">Cancel Delivery</button>
      </div>}>
      <div className={cn("rounded-xl border p-3 text-[15px]", t.cls)}>
        <div className="font-semibold">{t.label}</div>
        <div className="text-muted-foreground">Status: {note.status === "open" ? "Draft" : note.status} · Total Package: {row.total}</div>
      </div>
      {parcels === null ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : <ItemTable parcels={parcels} />}

      {sheet === "status" && (
        <Sheet title="Change Status" onClose={() => setSheet(null)}>
          <select className={inputCls} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="open">Draft (open)</option><option value="dispatched">Out for delivery (dispatched)</option><option value="delivered">Delivered</option>
          </select>
          <p className="text-[13px] text-muted-foreground">Marking it Delivered also marks every parcel on it Delivered, with no proof attached.</p>
          <button type="button" disabled={busy || pick === note.status} onClick={() => void act(() => adminSetStatus(note.id, pick as "open" | "dispatched" | "delivered"), "Status updated")}
            className="h-12 w-full rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-50">Update</button>
        </Sheet>
      )}
      {sheet === "driver" && (
        <Sheet title="Change Driver" onClose={() => setSheet(null)}>
          <select className={inputCls} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Select driver…</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button type="button" disabled={busy || !pick || pick === note.driver_id} onClick={() => void act(() => setNoteDriver(note.id, pick), "Driver changed")}
            className="h-12 w-full rounded-lg bg-primary text-[16px] font-semibold text-primary-foreground disabled:opacity-50">Assign</button>
        </Sheet>
      )}
      {sheet === "cancel" && (
        <Sheet title="Cancel this delivery?" onClose={() => setSheet(null)}>
          <p className="text-[15px] text-muted-foreground">The note is cancelled and every parcel on it goes back to the unfulfilled queue.</p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setSheet(null)} className="h-12 rounded-lg border border-border font-semibold">Keep it</button>
            <button type="button" disabled={busy} onClick={() => void act(() => adminSetStatus(note.id, "cancelled"), "Delivery cancelled")} className="h-12 rounded-lg bg-[#E05252] font-semibold text-white disabled:opacity-50">Cancel Delivery</button>
          </div>
        </Sheet>
      )}
    </Screen>
  );
}

// ── Delivered ────────────────────────────────────────────────────────────────

function DeliveredList({ onOpen }: { onOpen: (r: DeliveredRow) => void }) {
  const [q, setQ] = useState("");
  const [boat, setBoat] = useState("");
  const [date, setDate] = useState("");
  const [boats, setBoats] = useState<string[]>([]);
  const [rows, setRows] = useState<DeliveredRow[] | null>(null);

  useEffect(() => { void loadDeliveredBoats().then(setBoats); }, []);
  // Searching as you type, but not on every keystroke.
  const search = useCallback(async () => { setRows(null); setRows(await searchDelivered({ q, boat, date }).catch((e) => { toast.error(errorMessage(e, "Search failed")); return []; })); }, [q, boat, date]);
  useEffect(() => { const t = setTimeout(() => void search(), 300); return () => clearTimeout(t); }, [search]);

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input className={cn(inputCls, "pl-10")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search AWB, Reference No., Client, Delivery Note" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <select className={inputCls} value={boat} onChange={(e) => setBoat(e.target.value)}><option value="">All clients</option>{boats.map((b) => <option key={b} value={b}>{b}</option>)}</select>
        <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date delivered" />
      </div>
      {rows === null ? <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin" /> : rows.length === 0 ? <p className="py-8 text-center text-[15px] text-muted-foreground">No delivered notes match.</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.note.id}>
              <button type="button" onClick={() => onOpen(r)} className="w-full rounded-xl border border-border bg-card p-3 text-left transition hover:border-primary">
                <div className="flex justify-between gap-2 text-[16px] font-semibold"><span className="truncate">{r.note.boat_name ?? "Multiple boats"}</span><span className="shrink-0 text-primary">DN {r.note.number ?? "—"}</span></div>
                <div className="mt-1 grid grid-cols-3 gap-2 text-[13px] text-muted-foreground">
                  <span>{fmt(r.note.delivered_at)}</span><span className="truncate">{r.driverName ?? "—"}</span><span className="truncate">{r.receiverRole ?? r.receiver ?? "—"}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function DeliveredDetail({ row, onBack }: { row: DeliveredRow; onBack: () => void }) {
  const { note } = row;
  const [parcels, setParcels] = useState<ShipSyncPackage[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { void loadNoteFull(note.id).then((p) => { setParcels(p); setEmail(p.find((x) => x.receiver_email)?.receiver_email ?? ""); }); }, [note.id]);

  const proof = parcels?.find((p) => p.delivery_photo_url)?.delivery_photo_url ?? null;

  async function pdf() {
    setBusy("pdf");
    try { window.open(await generateNotePdf(note.id, "delivery"), "_blank", "noreferrer"); } catch (e) { toast.error(errorMessage(e, "Could not build the delivery note")); } finally { setBusy(null); }
  }
  async function send() {
    if (!email.trim()) { toast.error("Enter an email address."); return; }
    setBusy("send");
    try { await resendPod(note.id, email); toast.success(`Proof of delivery sent to ${email.trim()}`); } catch (e) { toast.error(errorMessage(e, "Could not send")); } finally { setBusy(null); }
  }

  return (
    <Screen title="Delivered Item" subtitle={`${note.boat_name ?? "Multiple boats"} · DN ${note.number ?? ""}`} onBack={onBack}>
      <dl className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-3 text-[14px]">
        <div><dt className="text-muted-foreground">Date delivered</dt><dd className="font-medium">{fmt(note.delivered_at)}</dd></div>
        <div><dt className="text-muted-foreground">Driver</dt><dd className="font-medium">{row.driverName ?? "—"}</dd></div>
        <div className="col-span-2"><dt className="text-muted-foreground">Receiver</dt><dd className="font-medium">{[row.receiver, row.receiverRole].filter(Boolean).join(" · ") || "—"}</dd></div>
      </dl>
      {parcels === null ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : <ItemTable parcels={parcels} />}
      {proof && <div><span className="mb-1 block text-[14px] font-medium text-muted-foreground">Proof of Delivery</span><SignedImage stored={proof} alt="Proof of delivery" className="max-h-72 w-full rounded-lg object-contain" /></div>}
      <button type="button" onClick={() => void pdf()} disabled={!!busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-border text-[15px] font-semibold disabled:opacity-50">
        {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-5 w-5" />} Generate Delivery Note
      </button>
      <Lbl label="Resend Delivery Note">
        <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter Email Address" />
      </Lbl>
      <button type="button" onClick={() => void send()} disabled={!!busy} className="h-12 w-full rounded-lg bg-[#3FA76A] text-[16px] font-semibold text-white disabled:opacity-50">
        {busy === "send" ? "Sending…" : "Send Proof of Delivery"}
      </button>
    </Screen>
  );
}

function ItemTable({ parcels }: { parcels: ShipSyncPackage[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-[13px]">
        <thead className="bg-muted/30 text-left text-muted-foreground"><tr><th className="px-2 py-2">#</th><th className="px-2 py-2">AWB/Ref No.</th><th className="px-2 py-2">Package Owner</th><th className="px-2 py-2">Qty</th><th className="px-2 py-2">Courier</th></tr></thead>
        <tbody className="divide-y divide-border/50">
          {parcels.length === 0 && <tr><td colSpan={5} className="px-2 py-5 text-center text-muted-foreground">No parcels on this note.</td></tr>}
          {parcels.map((p, i) => (
            <tr key={p.id}><td className="px-2 py-2">{i + 1}</td><td className="px-2 py-2 font-mono">{p.barcode ?? "—"}</td><td className="px-2 py-2">{p.package_owner ?? "—"}</td><td className="px-2 py-2 tabular-nums">{p.num_packages ?? 1}</td><td className="px-2 py-2">{p.courier ?? "—"}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
