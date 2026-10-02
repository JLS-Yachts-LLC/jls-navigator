/**
 * Logistics mobile app — the reads and writes behind Deliveries (the driver's
 * phone) and Manage Deliveries (the admin's).
 *
 * The driver side reuses the existing offline-aware functions (loadDriverRuns,
 * scanOntoVan, deliverBoat) so a scan or a handover made with no signal is queued
 * and synced exactly as it is in the current driver app. Closing the note itself,
 * cancelling and changing driver need a connection and say so if there isn't one.
 */
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/error-message";
import { setNoteDriver, unassignPackage } from "@/lib/shipsync/data";
import { deliverBoat, scanOntoVan, type DeliveryProof } from "@/lib/shipsync/driver-data";
import type { ShipSyncDeliveryNote, ShipSyncDriver, ShipSyncPackage } from "@/lib/shipsync/model";
import { generateNotePdf, shipsyncApi } from "./logistics-api";

const sb = supabase as any;

export { loadDriverRuns, listActiveDrivers } from "@/lib/shipsync/driver-data";
export { scanOntoVan, setNoteDriver };

/** Packages still to hand over — assigned to the run, not yet delivered. */
export const PENDING = ["assigned", "out_for_delivery"] as const;

/** A parcel the driver has already scanned or confirmed onto the van. */
export const isScanned = (p: ShipSyncPackage) => p.driver_scanned || p.status === "out_for_delivery";

/** "Removed from List": the parcel was loaded by mistake, so it goes back to the office's pool. */
export async function removeFromRun(p: ShipSyncPackage): Promise<void> {
  await unassignPackage(p.id);
}

/** Complete Later: remember on the server that this note is half-finished, so the office can see it. Best effort — never blocks the driver. */
export async function markAwaiting(noteId: string, on: boolean): Promise<void> {
  await sb.from("shipsync_delivery_notes").update({ awaiting_completion_at: on ? new Date().toISOString() : null }).eq("id", noteId);
}

/** Cancel Delivery: every parcel returns to the unfulfilled queue and the note is closed off. */
export async function cancelDelivery(noteId: string): Promise<void> {
  const { data } = await sb.from("shipsync_packages").select("id").eq("delivery_note_id", noteId);
  for (const p of data ?? []) await unassignPackage(p.id);
  const { error } = await sb.from("shipsync_delivery_notes").update({ status: "cancelled", driver_id: null, awaiting_completion_at: null }).eq("id", noteId);
  if (error) throw error;
}

export type Handover = { name: string; position: string; email: string; photo: Blob | null; signature: Blob | null };

/**
 * Complete Delivery (the finalised proof of delivery). Stamps the parcels with
 * the receiver, photo and signature, closes the note once nothing is left on it,
 * and emails the proof to the client and the driver.
 */
export async function completeDelivery(
  note: ShipSyncDeliveryNote, parcels: ShipSyncPackage[], h: Handover, driver: ShipSyncDriver | null,
): Promise<{ closed: boolean; emailed: string[] }> {
  const proof: DeliveryProof = {
    status: "delivered", receiverName: h.name.trim(), receiverDesignation: h.position.trim(),
    receiverEmail: h.email.trim() || undefined, photo: h.photo, signature: h.signature,
  };
  await deliverBoat(parcels, proof);

  if (typeof navigator !== "undefined" && !navigator.onLine) return { closed: false, emailed: [] };

  const { count } = await sb.from("shipsync_packages").select("id", { count: "exact", head: true })
    .eq("delivery_note_id", note.id).in("status", [...PENDING]);
  const closed = (count ?? 0) === 0;
  if (closed) {
    await sb.from("shipsync_delivery_notes").update({ status: "delivered", delivered_at: new Date().toISOString(), awaiting_completion_at: null }).eq("id", note.id);
  }

  // The proof goes to the client and to the driver. Rebuilt first so the PDF carries this signature.
  const to = [h.email.trim(), driver?.email?.trim()].filter((a): a is string => !!a);
  if (!closed || to.length === 0) return { closed, emailed: [] };
  try {
    await generateNotePdf(note.id, "delivery");
    await shipsyncApi("/api/shipsync/email-pod", { noteId: note.id, kind: "delivery", to: to.join(",") });
    return { closed, emailed: to };
  } catch (e) {
    throw new Error(`Delivered, but the proof-of-delivery email failed: ${errorMessage(e, "unknown error")}`);
  }
}

// ── Manage Deliveries ────────────────────────────────────────────────────────

export type DeliveredRow = {
  note: ShipSyncDeliveryNote; driverName: string | null; receiver: string | null; receiverRole: string | null;
};

export type DeliveredFilter = { q: string; boat: string; date: string };

/** The Delivered tab: finished notes, filtered by search text, boat and delivery date. */
export async function searchDelivered(f: DeliveredFilter): Promise<DeliveredRow[]> {
  let query = sb.from("shipsync_delivery_notes").select("*").eq("status", "delivered").order("delivered_at", { ascending: false }).limit(150);
  if (f.boat) query = query.ilike("boat_name", f.boat.replace(/[\\%_]/g, (c) => `\\${c}`));
  if (f.date) {
    const next = new Date(`${f.date}T00:00:00`); next.setDate(next.getDate() + 1);
    query = query.gte("delivered_at", `${f.date}T00:00:00`).lt("delivered_at", next.toISOString().slice(0, 10) + "T00:00:00");
  }
  const q = f.q.trim().replace(/[\\%_,()]/g, " ").trim();
  if (q) {
    // A note matches on its own number or boat — or on any parcel on it (AWB, owner, boat).
    const { data: hits } = await sb.from("shipsync_packages").select("delivery_note_id")
      .not("delivery_note_id", "is", null).or(`barcode.ilike.%${q}%,package_owner.ilike.%${q}%,boat_name.ilike.%${q}%`).limit(150);
    const ids = Array.from(new Set<string>((hits ?? []).map((h: any) => h.delivery_note_id)));
    query = query.or([`number.ilike.%${q}%`, `boat_name.ilike.%${q}%`, ...(ids.length ? [`id.in.(${ids.join(",")})`] : [])].join(","));
  }
  const { data: notes } = await query;
  const list = (notes ?? []) as ShipSyncDeliveryNote[];
  if (list.length === 0) return [];

  const [{ data: drivers }, { data: pk }] = await Promise.all([
    sb.from("shipsync_drivers").select("id, name"),
    sb.from("shipsync_packages").select("delivery_note_id, receiver_full_name, receiver_designation").in("delivery_note_id", list.map((n) => n.id)).not("receiver_full_name", "is", null),
  ]);
  const dn = new Map<string, string>((drivers ?? []).map((d: any) => [d.id, d.name]));
  const rc = new Map<string, { n: string; r: string | null }>();
  for (const p of pk ?? []) if (!rc.has(p.delivery_note_id)) rc.set(p.delivery_note_id, { n: p.receiver_full_name, r: p.receiver_designation });
  return list.map((note) => ({
    note, driverName: note.driver_id ? dn.get(note.driver_id) ?? null : null,
    receiver: rc.get(note.id)?.n ?? null, receiverRole: rc.get(note.id)?.r ?? null,
  }));
}

export async function loadNoteFull(noteId: string): Promise<ShipSyncPackage[]> {
  const { data } = await sb.from("shipsync_packages").select("*").eq("delivery_note_id", noteId).order("boat_name");
  return (data ?? []) as ShipSyncPackage[];
}

/** Boats that appear on delivered notes, for the Delivered tab's filter. */
export async function loadDeliveredBoats(): Promise<string[]> {
  const { data } = await sb.from("shipsync_delivery_notes").select("boat_name").eq("status", "delivered").not("boat_name", "is", null).limit(2000);
  return Array.from(new Set<string>((data ?? []).map((r: any) => r.boat_name as string))).sort();
}

/** Admin force-change of a note's state. Same effects the office Dispatch screen applies. */
export async function adminSetStatus(noteId: string, status: "open" | "dispatched" | "delivered" | "cancelled"): Promise<void> {
  if (status === "cancelled") { await cancelDelivery(noteId); return; }
  const now = new Date().toISOString();
  const { error } = await sb.from("shipsync_delivery_notes").update({ status, ...(status === "delivered" ? { delivered_at: now } : {}), awaiting_completion_at: null }).eq("id", noteId);
  if (error) throw error;
  if (status === "delivered") await sb.from("shipsync_packages").update({ status: "delivered", delivered_at: now }).eq("delivery_note_id", noteId);
}

/** Resend the proof of delivery for a finished note to one address. */
export async function resendPod(noteId: string, to: string): Promise<void> {
  await shipsyncApi("/api/shipsync/email-pod", { noteId, kind: "delivery", to: to.trim() });
}
