import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, MapPin, X, FileText, Mail, Ship } from "lucide-react";
import { StatusBadge } from "@/components/shipsync/shared";
import {
  createDeliveryNote, assignPackagesToNote, setNoteDriver, unassignPackage,
} from "@/lib/shipsync/data";
import { supabase } from "@/integrations/supabase/client";
import { googleMapsDirectionsUrl, type ShipSyncDeliveryNote } from "@/lib/shipsync/model";
import type { ShipSyncData } from "@/components/shipsync-page";

export function ShipSyncDispatch({ data, reload }: { data: ShipSyncData; reload: () => Promise<void> }) {
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newBoat, setNewBoat] = useState("");

  const openNotes = useMemo(() => data.notes.filter((n) => n.status !== "delivered" && n.status !== "cancelled"), [data.notes]);
  const sel = data.notes.find((n) => n.id === selId) ?? null;
  const pkgsOnNote = useMemo(() => data.packages.filter((p) => p.delivery_note_id === selId), [data.packages, selId]);
  // Per-boat parcel counts for the selected note (a route can span several boats).
  const pkgsByBoat = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pkgsOnNote) { const k = p.boat_name || "No boat"; m.set(k, (m.get(k) ?? 0) + 1); }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [pkgsOnNote]);
  const pool = useMemo(() => {
    if (!sel) return [];
    return data.packages.filter((p) => !p.delivery_note_id && ["in_office", "in_storage"].includes(p.status)
      && (!sel.boat_name || p.boat_name === sel.boat_name));
  }, [data.packages, sel]);
  const boats = useMemo(() => Array.from(new Set(data.packages.map((p) => p.boat_name).filter(Boolean) as string[])).sort(), [data.packages]);

  async function makeNote() {
    if (!newBoat.trim()) { toast.error("Pick a boat for the delivery note"); return; }
    setBusy(true);
    try { const n = await createDeliveryNote(newBoat.trim().toUpperCase()); setNewBoat(""); await reload(); setSelId(n.id); toast.success(`Delivery note ${n.number} created`); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }
  async function addToNote(pkgId: string) {
    if (!sel) return;
    await assignPackagesToNote([pkgId], sel, sel.driver_id); await reload();
  }
  async function removeFromNote(pkgId: string) { await unassignPackage(pkgId); await reload(); }
  async function changeDriver(driverId: string) {
    if (!sel) return;
    await setNoteDriver(sel.id, driverId === "none" ? null : driverId); await reload();
  }
  async function saveDestination(patch: Partial<ShipSyncDeliveryNote>) {
    if (!sel) return;
    await (supabase as any).from("shipsync_delivery_notes").update(patch).eq("id", sel.id); await reload();
  }
  async function setNoteStatus(status: string) {
    if (!sel) return;
    await (supabase as any).from("shipsync_delivery_notes").update({ status, ...(status === "delivered" ? { delivered_at: new Date().toISOString() } : {}) }).eq("id", sel.id);
    if (status === "delivered") await (supabase as any).from("shipsync_packages").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("delivery_note_id", sel.id);
    await reload();
  }

  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  async function callApi(path: string, payload: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error ?? `Failed (${r.status})`);
    return j;
  }
  async function genPdf(kind: "predelivery" | "delivery") {
    if (!sel) return;
    setPdfBusy(kind);
    try {
      const j = await callApi("/api/shipsync/note-pdf", { noteId: sel.id, kind });
      toast.success(`${kind === "predelivery" ? "Pre-delivery" : "Delivery"} note generated`);
      window.open(j.pdfUrl, "_blank", "noreferrer");
      await reload();
    } catch (e: any) { toast.error(e?.message ?? "PDF failed"); } finally { setPdfBusy(null); }
  }
  async function emailPod() {
    if (!sel) return;
    setPdfBusy("email");
    try {
      const j = await callApi("/api/shipsync/email-pod", { noteId: sel.id });
      toast.success(`Proof of delivery emailed to ${j.to}`);
      await reload();
    } catch (e: any) { toast.error(e?.message ?? "Email failed"); } finally { setPdfBusy(null); }
  }

  return (
    <div className="grid gap-4 px-6 py-5 lg:grid-cols-[340px_1fr]">
      {/* Notes list + create */}
      <div>
        <div className="mb-2 flex gap-2">
          <Input value={newBoat} onChange={(e) => setNewBoat(e.target.value)} list="ss-disp-boats" placeholder="Boat for new note…" className="h-9" />
          <datalist id="ss-disp-boats">{boats.map((b) => <option key={b} value={b} />)}</datalist>
          <Button size="sm" className="h-9 gap-1.5 shrink-0" onClick={makeNote} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Note</Button>
        </div>
        <div className="flex flex-col gap-1.5">
          {openNotes.length === 0 && <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No open delivery notes.</div>}
          {openNotes.map((n) => {
            const notePkgs = data.packages.filter((p) => p.delivery_note_id === n.id);
            const count = notePkgs.length;
            const noteBoats = Array.from(new Set(notePkgs.map((p) => p.boat_name).filter(Boolean) as string[])).sort();
            const boatList = n.boat_name ? [n.boat_name] : (noteBoats.length ? noteBoats : ["—"]);
            const driver = data.drivers.find((d) => d.id === n.driver_id);
            return (
              <button key={n.id} onClick={() => setSelId(n.id)}
                className={`rounded-lg border p-3 text-left transition ${selId === n.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent/30"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-bold">DN-{n.number}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{count} pkg</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {boatList.map((b) => (
                    <span key={b} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground/80">{b}</span>
                  ))}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">{driver?.name ?? "no driver"}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected note management */}
      <div>
        {!sel ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">Select or create a delivery note.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-lg font-semibold">Delivery Note DN-{sel.number}</h2>
              <span className="text-sm text-muted-foreground">{sel.boat_name ?? (pkgsByBoat.length > 1 ? "Multiple boats" : pkgsByBoat[0]?.[0] ?? "—")}</span>
              <div className="ml-auto flex items-center gap-2">
                <Select value={sel.driver_id ?? "none"} onValueChange={changeDriver}>
                  <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Assign driver" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No driver</SelectItem>
                    {data.drivers.filter((d) => d.active).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={sel.status} onValueChange={setNoteStatus}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="dispatched">Dispatched</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Documents & notifications */}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => genPdf("predelivery")} disabled={!!pdfBusy}>
                {pdfBusy === "predelivery" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Pre-delivery note
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => genPdf("delivery")} disabled={!!pdfBusy}>
                {pdfBusy === "delivery" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Delivery note
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={emailPod} disabled={!!pdfBusy}>
                {pdfBusy === "email" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Email POD
              </Button>
              {sel.delivery_pdf_url && <a href={sel.delivery_pdf_url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-primary hover:underline">View delivery PDF</a>}
            </div>

            {/* Destination (for routing) */}
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> Destination</div>
              <div className="grid grid-cols-[1fr_120px_120px] gap-2">
                <Input value={sel.destination_address ?? ""} onChange={(e) => saveDestination({ destination_address: e.target.value })} placeholder="Marina / berth address" className="h-9" />
                <Input value={sel.destination_lat ?? ""} onChange={(e) => saveDestination({ destination_lat: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Lat" className="h-9" />
                <Input value={sel.destination_lng ?? ""} onChange={(e) => saveDestination({ destination_lng: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Lng" className="h-9" />
              </div>
              {googleMapsDirectionsUrl([{ address: sel.destination_address, lat: sel.destination_lat, lng: sel.destination_lng }]) && (
                <a href={googleMapsDirectionsUrl([{ address: sel.destination_address, lat: sel.destination_lat, lng: sel.destination_lng }])!} target="_blank" rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline"><MapPin className="h-3.5 w-3.5" /> Preview route in Google Maps</a>
              )}
            </div>

            {/* Per-boat breakdown (a route can span several boats) */}
            {pkgsByBoat.length > 1 && (
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Parcels per boat ({pkgsByBoat.length} boats)</div>
                <div className="divide-y divide-border/40">
                  {pkgsByBoat.map(([boat, count]) => (
                    <div key={boat} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <Ship className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <span className="font-medium">{boat}</span>
                      <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{count} pkg</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Packages on this note */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">On this note ({pkgsOnNote.length})</div>
              {pkgsOnNote.length === 0 ? <div className="px-3 py-6 text-center text-sm text-muted-foreground">No packages yet — add from the pool below.</div> : (
                <div className="divide-y divide-border/40">
                  {pkgsOnNote.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="font-mono text-[12px]">{p.barcode ?? "—"}</span>
                      <span className="text-muted-foreground">{p.package_owner ?? ""}</span>
                      <StatusBadge status={p.status} />
                      <Button variant="ghost" size="sm" className="ml-auto h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive" onClick={() => removeFromNote(p.id)}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pool of available packages for this boat */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Available for {sel.boat_name} ({pool.length})</div>
              {pool.length === 0 ? <div className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing waiting for this boat.</div> : (
                <div className="divide-y divide-border/40">
                  {pool.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="font-mono text-[12px]">{p.barcode ?? "—"}</span>
                      <span className="text-muted-foreground">{p.package_owner ?? ""}</span>
                      <StatusBadge status={p.status} />
                      <Button variant="outline" size="sm" className="ml-auto h-7 gap-1 text-xs" onClick={() => addToNote(p.id)}><Plus className="h-3.5 w-3.5" /> Add</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
