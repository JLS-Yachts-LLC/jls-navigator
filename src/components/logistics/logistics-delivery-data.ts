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
import { assignPackagesToNote, unassignPackage } from "@/lib/shipsync/data";
import { deliverBoat, queueDelivery, scanOntoVan, type DeliveryProof } from "@/lib/shipsync/driver-data";
import { isNetworkError } from "@/lib/network-error";
import type { ShipSyncDeliveryNote, ShipSyncDriver, ShipSyncPackage } from "@/lib/shipsync/model";
import { generateNotePdf, shipsyncApi } from "./logistics-api";

const sb = supabase as any;

export { loadDriverRuns, listActiveDrivers } from "@/lib/shipsync/driver-data";
export { scanOntoVan };

/** Packages still to hand over — assigned to the run, not yet delivered. */
export const PENDING = ["assigned", "out_for_delivery"] as const;

/** A parcel the driver has already scanned or confirmed onto the van. */
export const isScanned = (p: ShipSyncPackage) => p.driver_scanned || p.status === "out_for_delivery";

/** "Removed from List": the parcel was loaded by mistake, so it goes back to the office's pool. */
export async function removeFromRun(p: ShipSyncPackage): Promise<void> {
  const noteId = p.delivery_note_id;
  await unassignPackage(p.id);
  if (!noteId) return;
  // If that was the last thing left to deliver, the note is finished (or empty): don't leave it dispatched forever.
  const { data, error } = await sb.from("shipsync_packages").select("status").eq("delivery_note_id", noteId);
  if (error) return;
  const rows = data ?? [];
  if (rows.some((r: any) => (PENDING as readonly string[]).includes(r.status))) return;
  const patch = rows.length === 0
    ? { status: "cancelled", driver_id: null, awaiting_completion_at: null }
    : { status: "delivered", delivered_at: new Date().toISOString(), awaiting_completion_at: null };
  await sb.from("shipsync_delivery_notes").update(patch).eq("id", noteId).eq("status", "dispatched");
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

export type CompleteResult = {
  /** The note had nothing left to deliver and was closed. */
  closed: boolean;
  emailed: string[];
  /** No signal (or it dropped part-way): saved on the phone and sent later. */
  queued?: boolean;
  /** The parcels ARE delivered, but a follow-up step failed — shown to the driver as a warning, never as a reason to do the handover again. */
  problem?: string;
};

/**
 * Complete Delivery (the finalised proof of delivery) for ONE boat on the run.
 * Stamps that boat's parcels with the receiver, photo and signature; closes the note
 * once nothing is left on it; and emails that boat's proof to its client and the driver.
 *
 * Once the parcels are stamped this never throws: whatever fails afterwards (closing
 * the note, the email) comes back as `problem`, so the driver isn't left on a screen
 * where pressing the button again would re-stamp every parcel.
 */
export async function completeDelivery(
  note: ShipSyncDeliveryNote, parcels: ShipSyncPackage[], h: Handover, driver: ShipSyncDriver | null, boat?: string,
): Promise<CompleteResult> {
  const proof: DeliveryProof = {
    status: "delivered", receiverName: h.name.trim(), receiverDesignation: h.position.trim(),
    receiverEmail: h.email.trim() || undefined, photo: h.photo, signature: h.signature,
  };
  try {
    await deliverBoat(parcels, proof);
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    await queueDelivery(parcels, proof);               // the connection dropped part-way: keep the handover, send it later
    return { closed: false, emailed: [], queued: true };
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) return { closed: false, emailed: [], queued: true };

  let closed = false;
  try {
    const { count, error } = await sb.from("shipsync_packages").select("id", { count: "exact", head: true })
      .eq("delivery_note_id", note.id).in("status", [...PENDING]);
    if (error || count == null) throw error ?? new Error("no count returned");   // can't tell whether anything is left — so do NOT close the note
    closed = count === 0;
    // This boat is done, so the note is no longer "awaiting completion" (even if other boats are still to go).
    const { error: ue } = await sb.from("shipsync_delivery_notes").update({
      awaiting_completion_at: null, ...(closed ? { status: "delivered", delivered_at: new Date().toISOString() } : {}),
    }).eq("id", note.id);
    if (ue) { closed = false; throw ue; }
  } catch (e) {
    return { closed: false, emailed: [], problem: `Delivered, but the note could not be closed (${errorMessage(e, "unknown error")}). The office can finish it.` };
  }

  // The proof goes to the client and to the driver. The PDF is rebuilt first so it carries this signature.
  const to = [h.email.trim(), driver?.email?.trim()].filter((a): a is string => !!a);
  if (to.length === 0) return { closed, emailed: [] };
  try {
    await generateNotePdf(note.id, "delivery");
    await shipsyncApi("/api/shipsync/email-pod", { noteId: note.id, kind: "delivery", to: to.join(","), ...(boat && boat !== "—" ? { boat } : {}) });
    return { closed, emailed: to };
  } catch (e) {
    return { closed, emailed: [], problem: `Delivered, but the proof-of-delivery email failed (${errorMessage(e, "unknown error")}). It can be resent from Manage Deliveries.` };
  }
}

/**
 * Close the driver's runs that have nothing left to deliver. A handover made with no
 * signal is queued on the phone and replayed later, which stamps the parcels but cannot
 * close the note — so after a sync this finishes the job. (No proof email goes from here;
 * the office can resend it from the Delivered tab.) Returns how many notes were closed.
 */
export async function closeFinishedNotes(driverId: string): Promise<number> {
  const { data: notes, error } = await sb.from("shipsync_delivery_notes").select("id").eq("driver_id", driverId).eq("status", "dispatched");
  if (error) throw error;
  let closed = 0;
  for (const n of notes ?? []) {
    const { data: pk, error: pe } = await sb.from("shipsync_packages").select("status").eq("delivery_note_id", n.id);
    if (pe) continue;
    const rows = pk ?? [];
    const pending = rows.some((p: any) => (PENDING as readonly string[]).includes(p.status));
    if (rows.length === 0 || pending) continue;
    const { error: ue } = await sb.from("shipsync_delivery_notes").update({ status: "delivered", delivered_at: new Date().toISOString(), awaiting_completion_at: null }).eq("id", n.id);
    if (!ue) closed++;
  }
  return closed;
}

/**
 * Give a note to a (new) driver. A draft becomes a real run — its parcels are
 * assigned and the note dispatched — otherwise it would show a driver while nothing
 * ever reached that driver's phone. A run already under way hands over only the parcels
 * still to deliver. Parcels first, note last, errors checked: a failure part-way is
 * retryable and never leaves the note and its parcels on different drivers.
 */
export async function setNoteDriver(noteId: string, driverId: string | null): Promise<void> {
  const { data: note, error: ne } = await sb.from("shipsync_delivery_notes").select("*").eq("id", noteId).single();
  if (ne) throw ne;
  const { data: pk, error: pe } = await sb.from("shipsync_packages").select("id, status").eq("delivery_note_id", noteId);
  if (pe) throw pe;
  const open = (pk ?? []).filter((p: any) => !["delivered", "collected", "refused", "delivered_tbi", "completed"].includes(p.status));

  if (driverId && note.status === "open") {
    await assignPackagesToNote(open.map((p: any) => p.id), note as ShipSyncDeliveryNote, driverId);
    const { error } = await sb.from("shipsync_delivery_notes").update({ status: "dispatched", driver_id: driverId }).eq("id", noteId);
    if (error) throw error;
    return;
  }
  if (open.length) {
    const { error } = await sb.from("shipsync_packages").update({ driver_id: driverId }).in("id", open.map((p: any) => p.id));
    if (error) throw error;
  }
  const { error } = await sb.from("shipsync_delivery_notes").update({ driver_id: driverId }).eq("id", noteId);
  if (error) throw error;
}

// ── Manage Deliveries ────────────────────────────────────────────────────────

export type DeliveredRow = {
  note: ShipSyncDeliveryNote; driverName: string | null; receiver: string | null; receiverRole: string | null;
};

/**
 * The start and end of a day (YYYY-MM-DD) in UAE time, as timestamps with their offset.
 * The filter used local midnight, then took the next day through toISOString() (UTC) — which in
 * any time zone ahead of UTC gives the SAME day again, an empty range, so the Delivered date filter
 * always found nothing. UAE has no daylight saving, so the offset is fixed.
 */
export function uaeDayBounds(date: string): { from: string; to: string } {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { from: `${date}T00:00:00+04:00`, to: `${next}T00:00:00+04:00` };
}

export type DeliveredFilter = { q: string; boat: string; date: string };

/** The Delivered tab: finished notes, filtered by search text, boat and delivery date. */
export async function searchDelivered(f: DeliveredFilter): Promise<DeliveredRow[]> {
  let query = sb.from("shipsync_delivery_notes").select("*").eq("status", "delivered").order("delivered_at", { ascending: false }).limit(150);
  if (f.boat) query = query.ilike("boat_name", f.boat.replace(/[\\%_]/g, (c) => `\\${c}`));
  if (f.date) {
    const { from, to } = uaeDayBounds(f.date);
    query = query.gte("delivered_at", from).lt("delivered_at", to);
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
  if (status === "delivered") {
    // Parcels already collected, refused or finished keep their own outcome.
    const { error: pe } = await sb.from("shipsync_packages").update({ status: "delivered", delivered_at: now })
      .eq("delivery_note_id", noteId).in("status", [...PENDING, "in_office", "in_storage"]);
    if (pe) throw pe;
  }
}

/** Resend the proof of delivery for a finished note to one address. */
export async function resendPod(noteId: string, to: string): Promise<void> {
  await shipsyncApi("/api/shipsync/email-pod", { noteId, kind: "delivery", to: to.trim() });
}
