/**
 * Logistics mobile app — the warehouse reads and writes behind Store In,
 * Manage Warehouse and "Move Parcel to Storage".
 *
 * Same warehouse_* tables and reference numbers (JLSWH26-00001, item IDs
 * JLSWH26-00001-01) as the office Warehouse module, so a shelf filled from a
 * phone is the shelf the office sees.
 */
import { supabase } from "@/integrations/supabase/client";
import { shrinkImage } from "@/lib/shipsync/image-shrink";
import {
  loadShelves, loadClientItems, loadInternalItems, loadPackageContents,
  clientItemCrud, internalItemCrud, shelfCrud, packageContentCrud,
  nextClientRef, nextInternalRef, nextPackageItemId, uploadWarehouseFile,
  type WarehouseShelf, type WarehouseClientItem, type WarehouseInternalItem, type WarehousePackageContent, type WarehouseDoc,
} from "@/lib/warehouse/data";
import { calcCbm, allZones, shelfUsage, locationCode } from "@/components/shipsync/warehouse/warehouse-constants";
import type { ParcelLite } from "./logistics-data";

const sb = supabase as any;
export { loadShelves, loadClientItems, loadInternalItems, loadPackageContents, shelfCrud, calcCbm, allZones, shelfUsage, locationCode };
export type { WarehouseShelf, WarehouseClientItem, WarehouseInternalItem, WarehousePackageContent, WarehouseDoc };

// ── Pricing ──────────────────────────────────────────────────────────────────
// The tariff the office Storage Charge Calculator already uses: 850 AED a month
// covers a package up to 3 CBM, and every CBM over that is 285 AED. (The mobile
// spec words it as "850 AED per 3 CBM cap"; this is the same rule, with the
// excess rate the client confirmed.)
const STANDARD_CBM = 3;
const BASE_CHARGE = 850;
const EXCESS_RATE = 285;
export const storageCharge = (cbm: number) => (cbm > 0 ? Math.round((BASE_CHARGE + Math.max(0, cbm - STANDARD_CBM) * EXCESS_RATE) * 100) / 100 : 0);

/** Today as YYYY-MM-DD in the phone's own time zone (toISOString is UTC: in the UAE it gives yesterday between midnight and 4am). */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Zones ────────────────────────────────────────────────────────────────────
/** How the spec labels the three special-purpose zones; the A–E zones are just their letter. */
const ZONE_LABEL: Record<string, string> = { TEMP: "Temp (Chiller/Freezer)", PRV: "Prv (Provisioning)", CHM: "Chm (Chemicals)" };
export const zoneLabel = (z: string) => ZONE_LABEL[z.toUpperCase()] ?? z;

export const bayList = (shelves: WarehouseShelf[], zone: string) =>
  Array.from(new Set(shelves.filter((s) => s.zone === zone).map((s) => s.bay))).sort();
export const shelfList = (shelves: WarehouseShelf[], zone: string, bay: string) =>
  shelves.filter((s) => s.zone === zone && s.bay === bay).sort((a, b) => a.shelf.localeCompare(b.shelf, undefined, { numeric: true }));

/** Used length/width/height of a shelf — the largest item on it in each direction, so what is left is what the biggest next item could be. */
export function shelfUsedDims(zone: string, bay: string, shelf: string, clients: WarehouseClientItem[], internals: WarehouseInternalItem[]) {
  let l = 0, w = 0, h = 0;
  for (const it of [...clients, ...internals]) {
    if (it.zone !== zone || it.bay !== bay || it.shelf !== shelf || it.status === "Completed") continue;
    l = Math.max(l, it.length_cm ?? 0); w = Math.max(w, it.width_cm ?? 0); h = Math.max(h, it.height_cm ?? 0);
  }
  return { l, w, h };
}

/**
 * Why something of these dimensions shouldn't go on this shelf — too big for it, not enough volume
 * left, or too heavy for what's left — or null if it fits (or nothing has been measured yet).
 * A warning, not a block: the shelf's limits are guidelines the warehouse can choose to override.
 */
export function shelfFitProblem(
  shelf: WarehouseShelf | null | undefined, need: { l: number; w: number; h: number; kg: number },
  clients: WarehouseClientItem[], internals: WarehouseInternalItem[],
): string | null {
  if (!shelf) return null;
  const cbm = calcCbm(need.l, need.w, need.h);
  if (!(cbm > 0) && !(need.kg > 0)) return null;
  if (need.l > shelf.max_length_cm || need.w > shelf.max_width_cm || need.h > shelf.max_height_cm) return "This is bigger than that shelf allows.";
  const u = shelfUsage(shelf.zone, shelf.bay, shelf.shelf, clients, internals);
  const freeCbm = shelf.max_cbm - u.usedCbm;
  if (cbm > freeCbm + 1e-9) return `Only ${Math.max(0, freeCbm).toFixed(2)} m³ is free on that shelf.`;
  if (shelf.max_weight_kg != null && need.kg > shelf.max_weight_kg - u.usedWeightKg) return "That shelf can't take the weight.";
  return null;
}

/** Shelves a parcel of these dimensions can go on, tightest fit first — the Shelf Finder. */
export function recommendShelves(
  shelves: WarehouseShelf[], clients: WarehouseClientItem[], internals: WarehouseInternalItem[],
  dims: { l: number; w: number; h: number; kg: number },
) {
  const needed = calcCbm(dims.l, dims.w, dims.h);
  return shelves
    .map((s) => ({ s, ...shelfUsage(s.zone, s.bay, s.shelf, clients, internals) }))
    .filter(({ s, usedCbm, usedWeightKg }) =>
      dims.l <= s.max_length_cm && dims.w <= s.max_width_cm && dims.h <= s.max_height_cm &&
      needed <= s.max_cbm - usedCbm && dims.kg <= (s.max_weight_kg == null ? Infinity : s.max_weight_kg - usedWeightKg))
    .sort((a, b) => (a.s.max_cbm - a.usedCbm) - (b.s.max_cbm - b.usedCbm));
}

// ── Photos and files ─────────────────────────────────────────────────────────
export async function uploadPhoto(file: File, folder: string): Promise<string> {
  const small = await shrinkImage(file);
  return uploadWarehouseFile(small, `${folder}/photo-${Date.now()}.jpg`);
}
export async function uploadDocs(files: File[], folder: string): Promise<WarehouseDoc[]> {
  const out: WarehouseDoc[] = [];
  for (const f of files) out.push({ name: f.name, url: await uploadWarehouseFile(f, `${folder}/${Date.now()}-${f.name.replace(/[^\w.-]+/g, "_")}`) });
  return out;
}

// ── Store In ─────────────────────────────────────────────────────────────────
export type Location = { zone: string; bay: string; shelf: string };
/** One packing-list row. (The spec also lists a Date Stored per row; package contents have no such column, so the parent record's date stands for the whole box.) */
export type PackingLine = { itemName: string; quantity: string; unit: string; remarks: string; photo: File | null };

/** Upload every packing-list photo BEFORE anything is created, so a failed upload leaves no half-made record behind. */
type PreparedLine = { l: PackingLine; image_url: string | null };
async function preparePackingList(refHint: string, lines: PackingLine[]): Promise<PreparedLine[]> {
  const out: PreparedLine[] = [];
  for (const l of lines) {
    if (!l.itemName.trim()) continue;
    out.push({ l, image_url: l.photo ? await uploadPhoto(l.photo, `client/${refHint}/content`) : null });
  }
  return out;
}

/** Add the packing list under `refNo`, recording each row's id in `made` AS it is created — so if a later line fails, the caller can still remove the earlier ones. */
async function addPackingList(refNo: string, owner: string, lines: PreparedLine[], made: string[]): Promise<void> {
  for (const { l, image_url } of lines) {
    const row = await packageContentCrud.create({
      item_id: await nextPackageItemId(refNo), ref_no: refNo, client_or_dept: owner,
      item_name: l.itemName.trim(), quantity: positive(l.quantity, 1), unit: l.unit || "pcs", status: "Stored",
      due_date: null, remarks: l.remarks.trim() || null, image_url,
    });
    made.push(row.id);
  }
}

/** A quantity the person typed: a positive number, or `fallback` when blank/zero/negative. */
const positive = (v: string | number, fallback: number) => { const n = Number(v); return n > 0 ? n : fallback; };

/** Undo a half-finished save: remove what was made so a retry doesn't leave a duplicate behind. */
async function undoCreated(crud: { remove: (id: string) => Promise<void> }, itemId: string | null, contentIds: string[]) {
  for (const id of contentIds) await packageContentCrud.remove(id).catch(() => {});
  if (itemId) await crud.remove(itemId).catch(() => {});
}

export type ClientStore = {
  client: string; description: string; quotation: string; length: string; width: string; height: string; weight: string;
  dateStored: string; dueDate: string; charges: string; loc: Location; photo: File | null; docs: File[]; packing: PackingLine[];
};

/** Register a client's goods in storage. Returns the new reference number. */
export async function storeClient(f: ClientStore): Promise<string> {
  const ref = await nextClientRef();
  const dir = `client/${ref}`;
  const l = positive(f.length, 0), w = positive(f.width, 0), h = positive(f.height, 0);
  const cbm = calcCbm(l, w, h);
  const image_url = f.photo ? await uploadPhoto(f.photo, dir) : null;
  const documents = f.docs.length ? await uploadDocs(f.docs, dir) : [];
  const lines = await preparePackingList(ref, f.packing);
  const created = await clientItemCrud.create({
    ref_no: ref, client_name: f.client.trim(), description: f.description.trim(), quotation_no: f.quotation.trim() || null,
    length_cm: l || null, width_cm: w || null, height_cm: h || null, weight_kg: positive(f.weight, 0) || null, cbm: cbm || null,
    charges: f.charges ? Number(f.charges) : null, date_stored: f.dateStored || null, due_date: f.dueDate || null,
    zone: f.loc.zone || null, bay: f.loc.bay || null, shelf: f.loc.shelf || null, status: "Stored", documents, image_url,
  });
  const madeContents: string[] = [];
  try {
    await addPackingList(ref, f.client.trim(), lines, madeContents);
  } catch (e) {
    await undoCreated(clientItemCrud, created.id, madeContents);   // otherwise Save again would store the same goods twice
    throw e;
  }
  return ref;
}

export type InternalStore = {
  kind: "documents" | "assets"; department: string; description: string; length: string; width: string; height: string; weight: string;
  dateStored: string; destructionDate: string; loc: Location; photo: File | null; docs: File[]; packing: PackingLine[];
};

export async function storeInternal(f: InternalStore): Promise<string> {
  const ref = await nextInternalRef();
  const dir = `internal/${ref}`;
  const l = positive(f.length, 0), w = positive(f.width, 0), h = positive(f.height, 0);
  const cbm = calcCbm(l, w, h);
  const image_url = f.photo ? await uploadPhoto(f.photo, dir) : null;
  const documents = f.docs.length ? await uploadDocs(f.docs, dir) : [];
  const lines = await preparePackingList(ref, f.packing);
  const created = await internalItemCrud.create({
    ref_no: ref, kind: f.kind, department: f.department.trim(), description: f.description.trim(),
    length_cm: l || null, width_cm: w || null, height_cm: h || null, weight_kg: Number(f.weight) || null, cbm: cbm || null,
    date_stored: f.dateStored || null, destruction_date: f.kind === "documents" ? f.destructionDate || null : null,
    zone: f.loc.zone || null, bay: f.loc.bay || null, shelf: f.loc.shelf || null, status: "Stored", documents, image_url,
  });
  const madeContents: string[] = [];
  try {
    await addPackingList(ref, f.department.trim(), lines, madeContents);
  } catch (e) {
    await undoCreated(internalItemCrud, created.id, madeContents);
    throw e;
  }
  return ref;
}

// ── Move parcels into storage (from Check-Out) ───────────────────────────────
/** Parcels already moved into the warehouse carry this on `extra`, which keeps them out of the Check-Out pool. */
export const WAREHOUSE_REF_KEY = "warehouse_ref";

export type ParcelStorage = {
  mode: "box" | "individual"; length: string; width: string; height: string; weight: string; quotation: string;
  loc: Location; photo: File | null;
};

/**
 * Take parcels off the parcel flow into long-term storage. A box is ONE client
 * record with a nested Item ID per parcel; an individual parcel is its own record.
 * The parcels stay on the Local/Import board but are flagged as warehoused so they
 * can't also be checked out as parcels.
 */
export async function moveParcelsToStorage(parcels: ParcelLite[], f: ParcelStorage): Promise<string> {
  const boats = Array.from(new Set(parcels.map((p) => (p.boat_name ?? "").trim()).filter(Boolean)));
  if (boats.length > 1) throw new Error("A storage record belongs to one client — move one boat's parcels at a time.");
  const client = boats[0] ?? "Unassigned";
  const ids = parcels.map((p) => p.id);

  // Make sure every parcel is still free BEFORE anything is created: one that went onto a
  // delivery note (or into storage) since it was picked must not also be stored.
  const { data: rows, error: re } = await sb.from("shipsync_packages").select("id, status, warehouse_zone, delivery_note_id, extra").in("id", ids);
  if (re) throw re;
  if ((rows ?? []).length !== ids.length) throw new Error("Some of these parcels can no longer be found — refresh and try again.");
  const busy = (rows ?? []).filter((r: any) => r.delivery_note_id || r.extra?.[WAREHOUSE_REF_KEY]);
  if (busy.length) throw new Error(`${busy.length} of these parcels were just put on a delivery note or into the warehouse — remove them and try again.`);

  const ref = await nextClientRef();
  const l = positive(f.length, 0), w = positive(f.width, 0), h = positive(f.height, 0);
  const cbm = calcCbm(l, w, h);
  const description = f.mode === "box"
    ? `Box of ${parcels.length} parcel${parcels.length === 1 ? "" : "s"}: ${parcels.map((p) => p.barcode).filter(Boolean).join(", ")}`.slice(0, 480)
    : `${parcels[0].barcode ?? "Parcel"}${parcels[0].package_owner ? ` — ${parcels[0].package_owner}` : ""}`;
  const image_url = f.photo ? await uploadPhoto(f.photo, `client/${ref}`) : null;

  const created = await clientItemCrud.create({
    ref_no: ref, client_name: client, description, quotation_no: f.quotation.trim() || null,
    length_cm: l || null, width_cm: w || null, height_cm: h || null, weight_kg: positive(f.weight, 0) || null, cbm: cbm || null,
    charges: cbm ? storageCharge(cbm) : null, date_stored: localToday(),
    zone: f.loc.zone || null, bay: f.loc.bay || null, shelf: f.loc.shelf || null, status: "Stored", documents: [], image_url,
  });

  const madeContents: string[] = [];
  const flagged: { id: string; status: string; warehouse_zone: string | null; extra: any }[] = [];
  try {
    if (f.mode === "box") {
      for (const p of parcels) {
        const row = await packageContentCrud.create({
          item_id: await nextPackageItemId(ref), ref_no: ref, client_or_dept: client,
          item_name: [p.barcode, p.package_owner].filter(Boolean).join(" — ") || "Parcel", quantity: p.num_packages ?? 1, unit: "pcs", status: "Stored",
          due_date: null, remarks: p.courier ? `Courier: ${p.courier}` : null, image_url: null,
        });
        madeContents.push(row.id);
      }
    }
    // Flag the parcels as warehoused so they leave the Check-Out pool. Each update is guarded (still on no
    // delivery note) and checked — a parcel that could not be flagged would stay releasable AND be in storage.
    for (const r of rows ?? []) {
      const { data: done, error } = await sb.from("shipsync_packages").update({
        status: "in_storage", warehouse_zone: f.loc.zone || null, extra: { ...(r.extra ?? {}), [WAREHOUSE_REF_KEY]: ref },
      }).eq("id", r.id).is("delivery_note_id", null).select("id");
      if (error) throw error;
      if (!done?.length) throw new Error("A parcel was put on a delivery note while it was being stored — nothing has been stored; try again.");
      flagged.push({ id: r.id, status: r.status, warehouse_zone: r.warehouse_zone ?? null, extra: r.extra ?? {} });
    }
  } catch (e) {
    // Back it all out: the parcels as they were, and the new record, so a retry doesn't store the goods twice.
    for (const o of flagged) await sb.from("shipsync_packages").update({ status: o.status, warehouse_zone: o.warehouse_zone, extra: o.extra }).eq("id", o.id);
    await undoCreated(clientItemCrud, created.id, madeContents);
    throw e;
  }
  return ref;
}

// ── Find Item / Relocate ─────────────────────────────────────────────────────
export type StoredItem = {
  kind: "client" | "internal"; id: string; ref_no: string; owner: string; description: string;
  length_cm: number | null; width_cm: number | null; height_cm: number | null; weight_kg: number | null;
  zone: string | null; bay: string | null; shelf: string | null; status: string;
  date_stored: string | null; due: string | null; dueLabel: string; image_url: string | null;
  /** Item IDs / names of what's inside, so a search for one finds the box. */
  inside: string[];
};

export async function loadStoredItems(): Promise<StoredItem[]> {
  const [clients, internals, contents] = await Promise.all([loadClientItems(), loadInternalItems(), loadPackageContents()]);
  const inside = new Map<string, string[]>();
  for (const c of contents) inside.set(c.ref_no, [...(inside.get(c.ref_no) ?? []), c.item_id, c.item_name]);
  const c: StoredItem[] = clients.map((x) => ({
    kind: "client", id: x.id, ref_no: x.ref_no, owner: x.client_name, description: x.description,
    length_cm: x.length_cm, width_cm: x.width_cm, height_cm: x.height_cm, weight_kg: x.weight_kg,
    zone: x.zone, bay: x.bay, shelf: x.shelf, status: x.status, date_stored: x.date_stored, due: x.due_date, dueLabel: "Date Due",
    image_url: x.image_url, inside: inside.get(x.ref_no) ?? [],
  }));
  const i: StoredItem[] = internals.map((x) => ({
    kind: "internal", id: x.id, ref_no: x.ref_no, owner: x.department, description: x.description,
    length_cm: x.length_cm, width_cm: x.width_cm, height_cm: x.height_cm, weight_kg: x.weight_kg,
    zone: x.zone, bay: x.bay, shelf: x.shelf, status: x.status, date_stored: x.date_stored,
    due: x.destruction_date, dueLabel: "Destruction Date", image_url: x.image_url, inside: inside.get(x.ref_no) ?? [],
  }));
  return [...c, ...i];
}

export function findItems(items: StoredItem[], q: string): StoredItem[] {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  return items.filter((i) => [i.ref_no, i.owner, i.description, ...i.inside].some((v) => v?.toLowerCase().includes(t))).slice(0, 25);
}

/** An AWB that was moved into storage points at its record through `extra.warehouse_ref`. */
export async function refForAwb(awb: string): Promise<string | null> {
  const exact = awb.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await sb.from("shipsync_packages").select("extra").ilike("barcode", exact).limit(1);
  return data?.[0]?.extra?.[WAREHOUSE_REF_KEY] ?? null;
}

/** Edit one field on a stored item; dimensions keep the CBM in step. */
export async function patchStored(item: StoredItem, patch: Partial<{
  description: string; weight_kg: number | null; length_cm: number | null; width_cm: number | null; height_cm: number | null;
  status: string; due: string | null; zone: string | null; bay: string | null; shelf: string | null;
}>): Promise<void> {
  const { due, ...rest } = patch;
  const out: Record<string, unknown> = { ...rest };
  if ("due" in patch) out[item.kind === "client" ? "due_date" : "destruction_date"] = due;
  if ("length_cm" in patch || "width_cm" in patch || "height_cm" in patch) {
    const pick = (k: "length_cm" | "width_cm" | "height_cm") => (k in patch ? patch[k] : item[k]) ?? 0;
    const l = pick("length_cm"), w = pick("width_cm"), h = pick("height_cm");
    out.cbm = calcCbm(l, w, h) || null;
  }
  const crud = item.kind === "client" ? clientItemCrud : internalItemCrud;
  await crud.patch(item.id, out as any);
}
