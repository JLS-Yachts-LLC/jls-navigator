import { SignedAnchor } from "@/components/ui/signed-file";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, MapPin, X, FileText, Mail, Ship, Trash2, Truck, Map as MapIcon } from "lucide-react";
import { RouteMapDialog, type RouteStop } from "@/components/shipsync/RouteMapDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shipsync/shared";
import {
  createDeliveryNote, setNoteDriver, unassignPackage, deleteRun, saveDestination as saveBoatDestination,
} from "@/lib/shipsync/data";
import { supabase } from "@/integrations/supabase/client";
import { useGoogleMaps } from "@/lib/google-maps";
import { googleMapsDirectionsUrl, vanLabel, type ShipSyncDeliveryNote } from "@/lib/shipsync/model";
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
  const boats = useMemo(() => Array.from(new Set(data.packages.map((p) => p.boat_name).filter(Boolean) as string[])).sort(), [data.packages]);
  const [confirmDel, setConfirmDel] = useState(false);
  const [showRouteMap, setShowRouteMap] = useState(false);

  // Who to send "Email pre-delivery"/"Email POD" to. Pre-fills from a
  // receiver email already on one of the note's packages (only ever set by
  // the driver app at delivery time, so usually blank pre-delivery) — the
  // whole point of this field is to let staff supply one manually instead,
  // since the email buttons used to have nowhere to send to at all.
  const [emailTo, setEmailTo] = useState("");
  useEffect(() => {
    setEmailTo(pkgsOnNote.find((p) => p.receiver_email)?.receiver_email ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);

  // Local draft for the destination fields — typing updates this instantly;
  // the DB write (+ reload) only fires on blur. Binding the inputs straight to
  // `sel` (server state) meant every keystroke round-tripped before the value
  // could update, so fast typing dropped characters or looked frozen.
  const [destDraft, setDestDraft] = useState({ address: "", lat: "", lng: "" });
  useEffect(() => {
    setDestDraft({
      address: sel?.destination_address ?? "",
      lat: sel?.destination_lat != null ? String(sel.destination_lat) : "",
      lng: sel?.destination_lng != null ? String(sel.destination_lng) : "",
    });
  }, [sel?.id]);

  // Address-suggestions dropdown on the destination field (Google Places),
  // mirroring how Google Maps itself autocompletes an address search. Degrades
  // to the plain text field when Maps isn't configured. Picking a suggestion
  // fills lat/lng too and saves immediately — no need to wait for blur.
  //
  // Guard: when the Places key/referrer isn't authorised, Google's own widget
  // doesn't fail quietly — it disables the input and overwrites its placeholder
  // with "Oops! Something went wrong." (class `gm-err-autocomplete`), which
  // would brick manual typing too. A MutationObserver reverses that the moment
  // it happens, so a broken Maps key degrades to the plain field instead of an
  // unusable one. (Confirmed via the production error log — this key has hit
  // RefererNotAllowedMapError before.)
  const { maps: gmaps } = useGoogleMaps();
  const addressInputRef = useRef<HTMLInputElement>(null);
  const placesRef = useRef<google.maps.places.Autocomplete | null>(null);
  const guardRef = useRef<MutationObserver | null>(null);
  const saveDestinationRef = useRef<((patch: Partial<ShipSyncDeliveryNote>) => Promise<void>) | undefined>(undefined);
  useEffect(() => {
    if (!gmaps?.places?.Autocomplete || !addressInputRef.current || placesRef.current) return;
    const input = addressInputRef.current;
    const ac = new gmaps.places.Autocomplete(input, {
      fields: ["formatted_address", "geometry", "name"],
    });
    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      const address = place.formatted_address || place.name || "";
      const loc = place.geometry?.location;
      const lat = loc ? loc.lat() : null;
      const lng = loc ? loc.lng() : null;
      setDestDraft({ address, lat: lat != null ? String(lat) : "", lng: lng != null ? String(lng) : "" });
      void saveDestinationRef.current?.({ destination_address: address || null, destination_lat: lat, destination_lng: lng });
    });

    const guard = new MutationObserver(() => {
      if (input.classList.contains("gm-err-autocomplete") || input.disabled) {
        input.disabled = false;
        input.classList.remove("gm-err-autocomplete");
        input.removeAttribute("style"); // clears Google's error-icon background-image
        input.placeholder = "Marina / berth address";
      }
    });
    guard.observe(input, { attributes: true, attributeFilter: ["disabled", "class", "placeholder", "style"] });

    placesRef.current = ac;
    guardRef.current = guard;
  }, [gmaps, sel?.id]);
  // Separate unmount-only cleanup — the setup effect above intentionally
  // re-fires (harmlessly, guarded by placesRef) as `sel` changes, which would
  // disconnect-then-never-reconnect the observer if cleanup lived there instead.
  useEffect(() => () => guardRef.current?.disconnect(), []);

  // Stops for the selected note: one per boat (from the destinations register),
  // falling back to the note's own destination when a boat has none.
  const routeStops = useMemo<RouteStop[]>(() => {
    if (!sel) return [];
    const noteBoats = Array.from(new Set(pkgsOnNote.map((p) => p.boat_name).filter(Boolean) as string[])).sort();
    const names = noteBoats.length ? noteBoats : sel.boat_name ? [sel.boat_name] : [];
    const stops = names.map((b) => {
      const d = data.destinations.find((x) => x.boat_name.toUpperCase() === b.toUpperCase());
      return { boat: b, address: d?.address, lat: d?.lat, lng: d?.lng } as RouteStop;
    });
    const usable = stops.filter((s) => (s.lat != null && s.lng != null) || (s.address ?? "").trim());
    if (usable.length === 0 && (sel.destination_address || (sel.destination_lat != null && sel.destination_lng != null))) {
      return [{ boat: sel.boat_name ?? "Destination", address: sel.destination_address, lat: sel.destination_lat, lng: sel.destination_lng }];
    }
    return stops;
  }, [sel, pkgsOnNote, data.destinations]);

  async function makeNote() {
    if (!newBoat.trim()) { toast.error("Pick a boat for the delivery note"); return; }
    setBusy(true);
    try { const n = await createDeliveryNote(newBoat.trim().toUpperCase()); setNewBoat(""); await reload(); setSelId(n.id); toast.success(`Delivery note ${n.number} created`); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }
  async function removeFromNote(pkgId: string) { await unassignPackage(pkgId); await reload(); }
  async function doDeleteRun() {
    if (!sel) return;
    setBusy(true);
    try {
      const num = sel.number;
      await deleteRun(sel.id);
      setConfirmDel(false); setSelId(null); await reload();
      toast.success(`Run DN-${num} deleted — parcels returned to routing`);
    } catch (e: any) { toast.error(e?.message ?? "Failed to delete run"); } finally { setBusy(false); }
  }
  async function changeDriver(driverId: string) {
    if (!sel) return;
    await setNoteDriver(sel.id, driverId === "none" ? null : driverId); await reload();
  }
  async function saveDestination(patch: Partial<ShipSyncDeliveryNote>) {
    if (!sel) return;
    await (supabase as any).from("shipsync_delivery_notes").update(patch).eq("id", sel.id);
    // Also remember this on the boat's own saved destination (shipsync_destinations,
    // the same table Routing's per-stop address field writes to) — otherwise typing
    // it in here only fixes THIS note, and the next delivery to the same boat shows
    // up blank again. Single-boat notes only; a multi-boat note has no one boat to
    // attribute the address to.
    if (sel.boat_name) {
      const destPatch: Record<string, unknown> = { type: "vessel" };
      if ("destination_address" in patch) destPatch.address = patch.destination_address;
      if ("destination_lat" in patch) destPatch.lat = patch.destination_lat;
      if ("destination_lng" in patch) destPatch.lng = patch.destination_lng;
      if (Object.keys(destPatch).length > 1) await saveBoatDestination({ boat_name: sel.boat_name, ...destPatch } as any);
    }
    await reload();
  }
  saveDestinationRef.current = saveDestination;
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
  async function emailPod(kind: "predelivery" | "delivery" = "delivery") {
    if (!sel) return;
    if (!emailTo.trim()) { toast.error("Enter a recipient email first"); return; }
    setPdfBusy(kind === "predelivery" ? "email-pre" : "email");
    try {
      const j = await callApi("/api/shipsync/email-pod", { noteId: sel.id, kind, to: emailTo.trim() });
      toast.success(kind === "predelivery" ? `Pre-delivery note emailed to ${j.to}` : `Proof of delivery emailed to ${j.to}`);
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
            const van = data.vehicles.find((v) => v.id === n.vehicle_id);
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
                <div className="mt-1 text-[11px] text-muted-foreground">{driver?.name ?? "no driver"}{van ? ` · ${vanLabel(van)}` : ""}</div>
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
              {(() => { const van = data.vehicles.find((v) => v.id === sel.vehicle_id); return van ? <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground"><Truck className="h-3.5 w-3.5" /> {vanLabel(van)}</span> : null; })()}
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
              <Input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="Recipient email"
                title="Who to send the pre-delivery/POD emails to — only auto-fills once a driver has captured a receiver email at delivery, so usually needs typing in by hand"
                className="h-8 w-48 text-xs"
              />
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => emailPod("predelivery")} disabled={!!pdfBusy || !emailTo.trim()}>
                {pdfBusy === "email-pre" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Email pre-delivery
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => emailPod("delivery")} disabled={!!pdfBusy || !emailTo.trim()}>
                {pdfBusy === "email" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Email POD
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setShowRouteMap(true)} disabled={routeStops.length === 0}
                title="Route map — optimized stop order, distances & ETA">
                <MapIcon className="h-3.5 w-3.5" /> Route map
              </Button>
              {sel.predelivery_pdf_url && <SignedAnchor stored={sel.predelivery_pdf_url} className="text-[12px] text-primary hover:underline">View pre-delivery PDF</SignedAnchor>}
              {sel.delivery_pdf_url && <SignedAnchor stored={sel.delivery_pdf_url} className="text-[12px] text-primary hover:underline">View delivery PDF</SignedAnchor>}
              <Button size="sm" variant="outline" className="ml-auto h-8 gap-1.5 text-destructive hover:bg-destructive/10" onClick={() => setConfirmDel(true)} disabled={busy}>
                <Trash2 className="h-3.5 w-3.5" /> Delete run
              </Button>
            </div>

            {/* Destination (for routing) */}
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> Destination</div>
              <div className="grid grid-cols-[1fr_120px_120px] gap-2">
                <Input
                  ref={addressInputRef}
                  value={destDraft.address}
                  onChange={(e) => setDestDraft((d) => ({ ...d, address: e.target.value }))}
                  onBlur={() => { if (destDraft.address !== (sel.destination_address ?? "")) void saveDestination({ destination_address: destDraft.address || null }); }}
                  placeholder="Marina / berth address" className="h-9"
                />
                <Input
                  value={destDraft.lat}
                  onChange={(e) => setDestDraft((d) => ({ ...d, lat: e.target.value }))}
                  onBlur={() => { const n = destDraft.lat === "" ? null : Number(destDraft.lat); if (n !== sel.destination_lat) void saveDestination({ destination_lat: n }); }}
                  placeholder="Lat" className="h-9"
                />
                <Input
                  value={destDraft.lng}
                  onChange={(e) => setDestDraft((d) => ({ ...d, lng: e.target.value }))}
                  onBlur={() => { const n = destDraft.lng === "" ? null : Number(destDraft.lng); if (n !== sel.destination_lng) void saveDestination({ destination_lng: n }); }}
                  placeholder="Lng" className="h-9"
                />
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
              {pkgsOnNote.length === 0 ? <div className="px-3 py-6 text-center text-sm text-muted-foreground">No packages on this note.</div> : (
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

          </div>
        )}
      </div>

      {sel && showRouteMap && (
        <RouteMapDialog
          open
          onOpenChange={(o) => !o && setShowRouteMap(false)}
          title={`DN-${sel.number} — route plan`}
          stops={routeStops}
        />
      )}

      {sel && (
        <Dialog open={confirmDel} onOpenChange={(o) => !o && setConfirmDel(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Delete run DN-{sel.number}?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              This removes the run and returns its {pkgsOnNote.length} parcel{pkgsOnNote.length === 1 ? "" : "s"} to the routing pool (back to In office). This can't be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDel(false)} disabled={busy}>Cancel</Button>
              <Button className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={doDeleteRun} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete run
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
