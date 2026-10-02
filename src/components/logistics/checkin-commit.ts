/**
 * Logistics mobile app — what "checking a parcel in" writes, kept apart from the
 * form so the same code runs when the phone is online and later, when a check-in
 * saved without signal is uploaded (see logistics-offline.ts).
 *
 * Saving writes the same shipsync_packages row the office boards read. Local
 * parcels land in Warehouse (the office's default); Import and Transit are given a
 * Monday-style Item ID and joined to the "Incoming" group when the board has one,
 * exactly as the desktop does for a shipment raised in the app.
 */
import { supabase } from "@/integrations/supabase/client";
import { createPackage, patchPackage, uploadShipSyncImage } from "@/lib/shipsync/data";
import { nextItemId, type PackageStatus, type ShipSyncPackage } from "@/lib/shipsync/model";

const sb = supabase as any;

/** Everything a check-in needs, as plain data — so it can be parked on the phone and replayed. */
export type CheckinPayload = {
  /** Fixed before the first save attempt, so replaying a check-in that half-worked can't create it twice. */
  id: string;
  awb: string;
  /** Import / Transit — gets an Item ID and the Incoming group. */
  customs: boolean;
  fields: Partial<ShipSyncPackage>;
  /** Payment has no column of its own; it rides in `extra` beside the rest of the intake detail. */
  payment: { required: boolean; amount: number | null; method: string | null };
};

/** True for "the request never got there" — the cases worth saving on the phone instead of failing. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = String((e as { message?: string } | null)?.message ?? e ?? "");
  return /failed to fetch|network ?error|load failed|fetch failed|network request failed/i.test(msg);
}

/** Case-insensitive exact AWB match (pattern characters escaped so "_" or "%" aren't wildcards). Throws on a failed lookup. */
export async function findByAwb(awb: string): Promise<ShipSyncPackage | null> {
  const exact = awb.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await sb.from("shipsync_packages").select("*").ilike("barcode", exact).limit(1);
  if (error) throw error;
  return (data?.[0] as ShipSyncPackage | undefined) ?? null;
}

/** A fresh check-in. Returns the status the parcel was filed under. */
export async function createCheckin(p: CheckinPayload, photo: Blob | null): Promise<PackageStatus> {
  const item_photo_url = photo ? await uploadShipSyncImage(photo, `packages/${p.id}/item_${Date.now()}.jpg`) : null;
  const extra: Record<string, unknown> = { payment: p.payment, checked_in_via: "logistics-app" };
  let status: PackageStatus = "in_storage";

  if (p.customs) {
    // Same shape the Import board gives a shipment raised in the app.
    status = "in_office";
    const itemId = await nextItemId();
    const { data: sample } = await sb.from("shipsync_packages").select("extra")
      .in("local_import", ["Import", "Transit"]).eq("extra->>monday_group_title", "Incoming").limit(1);
    const g = sample?.[0]?.extra;
    if (g) { extra.monday_group_title = "Incoming"; extra.monday_group_position = g.monday_group_position; }
    extra.monday = { "Item ID": itemId, ...(g ? { STATUS: "Incoming" } : {}) };
  }

  await createPackage({ id: p.id, ...p.fields, status, item_photo_url, extra } as any);
  return status;
}

/** The AWB already exists (often a Monday item raised before the parcel arrived) — check it in on that record rather than duplicate it. */
export async function updateCheckin(existing: ShipSyncPackage, p: CheckinPayload, photo: Blob | null): Promise<void> {
  const item_photo_url = photo ? await uploadShipSyncImage(photo, `packages/${existing.id}/item_${Date.now()}.jpg`) : existing.item_photo_url;
  await patchPackage(existing.id, {
    ...p.fields, item_photo_url,
    extra: { ...(existing.extra ?? {}), payment: p.payment, checked_in_via: "logistics-app" },
  } as any);
}

/**
 * Upload a check-in that was saved without signal. Safe to run twice: a parcel
 * already saved under this id is left alone. Nobody is there to answer the
 * "already on file" question, so when the AWB belongs to another record this does
 * NOT touch it — it hands that record back for the person to decide on.
 */
export async function commitQueued(p: CheckinPayload, photo: Blob | null): Promise<{ result: "created" | "already" } | { result: "conflict"; existing: ShipSyncPackage }> {
  const { data: same, error } = await sb.from("shipsync_packages").select("id").eq("id", p.id).limit(1);
  if (error) throw error;
  if (same?.[0]) return { result: "already" };
  const existing = await findByAwb(p.awb);
  if (existing) return { result: "conflict", existing };
  await createCheckin(p, photo);
  return { result: "created" };
}
