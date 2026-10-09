/**
 * Logistics mobile app — what "checking a parcel in" writes, kept apart from the
 * form so the same code runs when the phone is online and later, when a check-in
 * saved without signal is uploaded (see logistics-offline.ts).
 *
 * Saving writes the same shipsync_packages row the office boards read. A parcel
 * checked in is Warehouse, whichever board it lands on. The Import board also gets
 * its IMPORT / TRANSIT group (its Item ID comes from the database), a Monday status of
 * "Warehouse" and — when it was paid for — the Paid Amount and Payment Method.
 */
import { supabase } from "@/integrations/supabase/client";
import { createPackage, patchPackage, uploadShipSyncImage } from "@/lib/shipsync/data";
import type { PackageStatus, ShipSyncPackage } from "@/lib/shipsync/model";
import { isNetworkError } from "@/lib/network-error";

const sb = supabase as any;

export type Board = "Local" | "Import" | "Transit";

/** A BOE number as scanned or typed — barcode asterisks and spaces ignored. */
const cleanBoe = (boe: string) => boe.trim().replace(/^\*+|\*+$/g, "").trim();

/**
 * Which board a check-in is saved to.
 *   Paid (any type)    -> Import board, with the Paid Amount and Payment Method
 *   Import, not paid   -> Import board when the BOE starts with 101, otherwise Local
 *   Local, not paid    -> Local
 *   Transit            -> Transit (it lives on the Import/Transit board)
 */
export function routeCheckin(shipType: Board, paid: boolean, boe: string): Board {
  if (shipType === "Transit") return "Transit";
  if (paid) return "Import";
  if (shipType === "Local") return "Local";
  return cleanBoe(boe).startsWith("101") ? "Import" : "Local";
}

/** Everything a check-in needs, as plain data — so it can be parked on the phone and replayed. */
export type CheckinPayload = {
  /** Fixed before the first save attempt, so replaying a check-in that half-worked can't create it twice. */
  id: string;
  awb: string;
  /** Retained for check-ins saved by an earlier version; the board is `fields.local_import`. */
  customs?: boolean;
  fields: Partial<ShipSyncPackage>;
  /** Payment has no column of its own; it rides in `extra` beside the rest of the intake detail. */
  payment: { required: boolean; amount: number | null; method: string | null };
};

const onImportBoard = (p: CheckinPayload) => p.fields.local_import === "Import" || p.fields.local_import === "Transit";

/** What a paid check-in writes into the Import board's own Paid Amount / Payment Method columns. */
function paidColumns(p: CheckinPayload): Record<string, string> {
  if (!p.payment.required) return {};
  return {
    ...(p.payment.amount != null ? { "Paid Amount": String(p.payment.amount) } : {}),
    ...(p.payment.method ? { "PAYMENT METHOD": p.payment.method } : {}),
  };
}

export { isNetworkError };

/** A fresh id for a check-in. crypto.randomUUID is missing on older iPhones (before iOS 15.4), where calling it would silently kill Save. */
export function newId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10).join("")}`;
}

/** Case-insensitive exact AWB match (pattern characters escaped so "_" or "%" aren't wildcards). Throws on a failed lookup. */
export async function findByAwb(awb: string): Promise<ShipSyncPackage | null> {
  const exact = awb.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await sb.from("shipsync_packages").select("*").ilike("barcode", exact).limit(1);
  if (error) throw error;
  return (data?.[0] as ShipSyncPackage | undefined) ?? null;
}

/** A fresh check-in. Returns the status the parcel was filed under (always Warehouse). */
export async function createCheckin(p: CheckinPayload, photo: Blob | null): Promise<PackageStatus> {
  const item_photo_url = photo ? await uploadShipSyncImage(photo, `packages/${p.id}/item_${Date.now()}.jpg`) : null;
  const extra: Record<string, unknown> = { payment: p.payment, checked_in_via: "logistics-app" };
  const status: PackageStatus = "in_storage";

  if (onImportBoard(p)) {
    // Same shape the Import board gives a shipment raised in the app: its IMPORT / TRANSIT group
    // (position copied from the board) and the Monday status "Warehouse". The Item ID is NOT
    // assigned here — a database trigger gives every Import/Transit row one on insert, so a save
    // that fails (or is retried) can't use up a number.
    const group = p.fields.local_import === "Transit" ? "TRANSIT" : "IMPORT";
    const { data: sample } = await sb.from("shipsync_packages").select("extra")
      .in("local_import", ["Import", "Transit"]).eq("extra->>monday_group_title", group).limit(1);
    const g = sample?.[0]?.extra;
    if (g) { extra.monday_group_title = group; extra.monday_group_position = g.monday_group_position; }
    extra.monday = { STATUS: "Warehouse", ...paidColumns(p) };
  }

  await createPackage({ id: p.id, ...p.fields, status, item_photo_url, extra } as any);
  return status;
}

const blank = (v: unknown) => v == null || v === "";
/** Monday statuses that mean "not here yet" — safe to replace with Warehouse once the parcel has arrived. */
const PRE_ARRIVAL = ["", "incoming", "intransit", "new request", "collected from origin", "arrived in uae"];

/**
 * The AWB already exists (often a Monday item raised before the parcel arrived) —
 * check it in on that record rather than duplicate it. This ADDS to the record; it
 * never wipes what is already there:
 *   • consignee, courier, remarks, boat: filled only where the record has none
 *   • BOE: set when one was typed
 *   • board, quantity, date received: kept as they are (the check-in's own values
 *     only fill a gap) — a check-in must not move a parcel between boards
 *   • a parcel still "In office" is now in the warehouse; one that has moved on keeps its status
 */
export async function updateCheckin(existing: ShipSyncPackage, p: CheckinPayload, photo: Blob | null): Promise<void> {
  const item_photo_url = photo ? await uploadShipSyncImage(photo, `packages/${existing.id}/item_${Date.now()}.jpg`) : existing.item_photo_url;
  const prior = (existing.extra ?? {}) as Record<string, any>;
  const f = p.fields as Record<string, any>;
  const have = existing as unknown as Record<string, any>;

  const patch: Record<string, any> = { item_photo_url };
  for (const k of ["boat_name", "package_owner", "courier", "description"]) if (!blank(f[k]) && blank(have[k])) patch[k] = f[k];
  if (!blank(f.boe_no)) patch.boe_no = f.boe_no;
  if (blank(have.received_at)) patch.received_at = f.received_at;
  if (blank(have.local_import)) patch.local_import = f.local_import;
  if (blank(have.num_packages) || Number(have.num_packages) < 1 || Number(f.num_packages) > 1) patch.num_packages = f.num_packages;
  if (existing.status === "in_office") patch.status = "in_storage" as PackageStatus;

  const onImport = existing.local_import === "Import" || existing.local_import === "Transit" || (blank(have.local_import) && onImportBoard(p));
  const monday = { ...(prior.monday ?? {}) } as Record<string, string>;
  if (onImport) {
    Object.assign(monday, paidColumns(p));
    if (PRE_ARRIVAL.includes(String(monday.STATUS ?? "").trim().toLowerCase())) monday.STATUS = "Warehouse";
  }
  patch.extra = { ...prior, payment: p.payment, checked_in_via: "logistics-app", ...(onImport ? { monday } : {}) };

  await patchPackage(existing.id, patch as any);
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
