/**
 * Logistics mobile app — the reads and writes behind Check-Out · Parcels.
 *
 * Everything goes through the same shipsync_delivery_notes / shipsync_packages
 * rows the office Routing and Dispatch screens use, so a note built on a phone
 * is the same note the office sees (and the driver app picks up once assigned).
 *
 * A note is a DRAFT until a driver is assigned: its parcels are reserved on it
 * (delivery_note_id set, so nobody else can route them) but their status is left
 * alone, because 'assigned' only means something alongside a driver.
 */
import { supabase } from "@/integrations/supabase/client";
import { createDeliveryNote, assignPackagesToNote, patchPackage, uploadShipSyncImage, unassignPackage } from "@/lib/shipsync/data";
import type { ShipSyncDeliveryNote, ShipSyncDriver, ShipSyncPackage } from "@/lib/shipsync/model";
import { driverWorks, weekdayOf } from "@/lib/shipsync/model";
import { listActiveDrivers } from "@/lib/shipsync/driver-data";

const sb = supabase as any;

/** What a parcel row needs to look like in the Check-Out lists. */
export type ParcelLite = Pick<ShipSyncPackage, "id" | "barcode" | "boat_name" | "package_owner" | "courier" | "num_packages" | "status">;
const PARCEL_COLS = "id, barcode, boat_name, package_owner, courier, num_packages, status";

/** Parcels the office could still send out: on the premises and not on any note. */
const RELEASABLE = ["in_office", "in_storage"] as const;

export type CheckoutNote = {
  note: ShipSyncDeliveryNote;
  total: number;
  driverName: string | null;
};

/** Open and dispatched notes, newest first — the Check-Out list. */
export async function loadCheckoutNotes(): Promise<CheckoutNote[]> {
  const { data: notes } = await sb.from("shipsync_delivery_notes").select("*")
    .in("status", ["open", "dispatched"]).order("created_at", { ascending: false }).limit(200);
  const list = (notes ?? []) as ShipSyncDeliveryNote[];
  if (list.length === 0) return [];
  const ids = list.map((n) => n.id);
  const [{ data: pk }, { data: drivers }] = await Promise.all([
    sb.from("shipsync_packages").select("delivery_note_id, num_packages").in("delivery_note_id", ids),
    sb.from("shipsync_drivers").select("id, name"),
  ]);
  const totals = new Map<string, number>();
  for (const p of pk ?? []) totals.set(p.delivery_note_id, (totals.get(p.delivery_note_id) ?? 0) + (p.num_packages ?? 1));
  const names = new Map<string, string>((drivers ?? []).map((d: any) => [d.id, d.name]));
  return list.map((note) => ({ note, total: totals.get(note.id) ?? 0, driverName: note.driver_id ? names.get(note.driver_id) ?? null : null }));
}

export async function loadNoteParcels(noteId: string): Promise<ParcelLite[]> {
  const { data } = await sb.from("shipsync_packages").select(PARCEL_COLS).eq("delivery_note_id", noteId).order("boat_name");
  return (data ?? []) as ParcelLite[];
}

/** Boats that currently have something waiting to go out, for the "Search to add" picker. */
export async function loadBoatsWithParcels(): Promise<string[]> {
  const { data } = await sb.from("shipsync_packages").select("boat_name")
    .in("status", [...RELEASABLE]).is("delivery_note_id", null).is("extra->>warehouse_ref", null).not("boat_name", "is", null).limit(2000);
  return Array.from(new Set<string>((data ?? []).map((r: any) => r.boat_name as string))).sort();
}

export async function loadReleasableForBoat(boat: string): Promise<ParcelLite[]> {
  const exact = boat.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await sb.from("shipsync_packages").select(PARCEL_COLS)
    .ilike("boat_name", exact).in("status", [...RELEASABLE]).is("delivery_note_id", null).is("extra->>warehouse_ref", null).order("created_at");
  return (data ?? []) as ParcelLite[];
}

/** A scanned label: the parcel with that AWB, but only if it is free to send out. */
export async function findReleasableByAwb(awb: string): Promise<{ parcel?: ParcelLite; reason?: string }> {
  const exact = awb.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await sb.from("shipsync_packages").select(`${PARCEL_COLS}, delivery_note_id, extra`).ilike("barcode", exact).limit(2);
  const row = data?.[0];
  if (!row) return { reason: `${awb} isn't checked in.` };
  if (row.delivery_note_id) return { reason: `${awb} is already on a delivery note.` };
  if (row.extra?.warehouse_ref) return { reason: `${awb} is in the warehouse (${row.extra.warehouse_ref}) — release it through Warehouse - Out.` };
  if (!(RELEASABLE as readonly string[]).includes(row.status)) return { reason: `${awb} is ${row.status.replace(/_/g, " ")}, not waiting to go out.` };
  return { parcel: row as ParcelLite };
}

/** One boat → that boat's note; several → a multi-boat note (no single boat), as the office Routing does. */
function boatLabel(parcels: ParcelLite[]): string {
  const boats = Array.from(new Set(parcels.map((p) => (p.boat_name ?? "").trim()).filter(Boolean)));
  return boats.length === 1 ? boats[0] : "";
}

/**
 * Make the note's parcels exactly `parcels`: reserve any new ones, release any
 * taken off. Creates the note on first save, so a cancelled check-out never
 * burns a delivery-note number.
 */
export async function syncNoteParcels(noteId: string | null, parcels: ParcelLite[]): Promise<ShipSyncDeliveryNote> {
  let note: ShipSyncDeliveryNote;
  const created = !noteId;
  if (noteId) {
    const { data, error } = await sb.from("shipsync_delivery_notes").select("*").eq("id", noteId).single();
    if (error) throw error;
    note = data as ShipSyncDeliveryNote;
  } else {
    note = await createDeliveryNote(boatLabel(parcels), null, null);
  }

  try {
    const { data: current, error: ce } = await sb.from("shipsync_packages").select("id").eq("delivery_note_id", note.id);
    if (ce) throw ce;
    const have = new Set<string>((current ?? []).map((r: any) => r.id));
    const want = new Set(parcels.map((p) => p.id));
    const add = [...want].filter((id) => !have.has(id));
    const drop = [...have].filter((id) => !want.has(id));

    if (add.length) {
      const { error } = await sb.from("shipsync_packages").update({ delivery_note_id: note.id }).in("id", add).is("delivery_note_id", null);
      if (error) throw error;
      const { data: got } = await sb.from("shipsync_packages").select("id").in("id", add).eq("delivery_note_id", note.id);
      if ((got ?? []).length !== add.length) throw new Error("Some parcels were just put on another delivery note — refresh and try again.");
    }
    // A parcel taken off goes back to the pool properly (status and scan marks reset too), not just detached.
    for (const id of drop) await unassignPackage(id);
    const { error: be } = await sb.from("shipsync_delivery_notes").update({ boat_name: boatLabel(parcels) || null }).eq("id", note.id);
    if (be) throw be;
    return note;
  } catch (e) {
    // A note made just now that never got its parcels must not be left behind (empty, with a burned number) —
    // and whatever it had already claimed goes back, or those parcels stay locked to a note nobody can see.
    if (created) {
      await sb.from("shipsync_packages").update({ delivery_note_id: null }).eq("delivery_note_id", note.id);
      await sb.from("shipsync_delivery_notes").delete().eq("id", note.id);
    }
    throw e;
  }
}

/** JLS Vehicle · Assign: hand the note to a driver for a date. */
export async function assignToDriver(
  note: ShipSyncDeliveryNote, parcels: ParcelLite[], driverId: string, date: string, destination: string,
): Promise<void> {
  const ids = parcels.map((p) => p.id);
  await assignPackagesToNote(ids, note, driverId);
  await sb.from("shipsync_packages").update({ planned_delivery_date: date }).in("id", ids);
  const { error } = await sb.from("shipsync_delivery_notes")
    .update({ status: "dispatched", driver_id: driverId, destination_address: destination.trim() || note.destination_address }).eq("id", note.id);
  if (error) throw error;
}

export type Handover = {
  name: string; position: string; email: string;
  photo: File | null; signature: Blob | null;
};

/**
 * Third-party carrier or client collection · Release: the parcels leave the
 * premises now. They are recorded as Collected with who took them, and the note
 * is closed — there is no driver run to follow.
 */
export async function releaseParcels(note: ShipSyncDeliveryNote, parcels: ParcelLite[], h: Handover): Promise<void> {
  const stamp = Date.now();
  const photoUrl = h.photo ? await uploadShipSyncImage(h.photo, `delivery-notes/${note.number ?? note.id}/handover_${stamp}.jpg`) : null;
  const sigUrl = h.signature ? await uploadShipSyncImage(h.signature, `delivery-notes/${note.number ?? note.id}/signature_${stamp}.png`, 'signature') : null;
  const when = new Date().toISOString();
  for (const p of parcels) {
    await patchPackage(p.id, {
      status: "collected", delivered_at: when, delivery_note_id: note.id, driver_id: null,
      receiver_full_name: h.name.trim() || null, receiver_designation: h.position.trim() || null, receiver_email: h.email.trim() || null,
      delivery_photo_url: photoUrl, signature_url: sigUrl,
    });
  }
  const { error } = await sb.from("shipsync_delivery_notes").update({ status: "delivered", delivered_at: when }).eq("id", note.id);
  if (error) throw error;
}

/** Drivers who can take a run on `date` (YYYY-MM-DD): active and working that weekday. */
export async function loadDriversFor(date: string): Promise<ShipSyncDriver[]> {
  const all = await listActiveDrivers();
  return date ? all.filter((d) => driverWorks(d, weekdayOf(date))) : all;
}

export type CrewMember = { id: string; name: string; rank: string; email: string | null };

/** The crew on a boat — feeds the Position → Name → Email pickers on a client collection. */
export async function loadCrewForBoat(boatName: string): Promise<CrewMember[]> {
  const exact = boatName.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: y } = await sb.from("yachts").select("id").ilike("vessel_name", exact).limit(1);
  if (!y?.[0]) return [];
  const { data } = await sb.from("crew_members").select("id, first_name, last_name, rank, email").eq("yacht_id", y[0].id).order("last_name");
  return (data ?? [])
    .filter((c: any) => c.rank)
    .map((c: any) => ({ id: c.id, name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(), rank: String(c.rank), email: c.email ?? null }));
}

/** A boat's saved berth, offered as the destination. */
export async function loadDestination(boatName: string): Promise<string> {
  if (!boatName) return "";
  const { data } = await sb.from("shipsync_destinations").select("address").ilike("boat_name", boatName.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle();
  return data?.address ?? "";
}
