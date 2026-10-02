/**
 * Logistics mobile app — the reads and writes behind Warehouse · Out.
 *
 * A check-out (DN WH0001…) lists whole stored packages and/or lines from a box's
 * packing list with a partial Qty Out. It is only a plan until released: the
 * warehouse records change in complete_warehouse_checkout(), one transaction, so
 * stock is never half-counted. These tables come from migration
 * 20261003100000_warehouse_checkouts.sql — until it is run, isNotSetUp() lets the
 * screens say so instead of showing a raw database error.
 */
import { supabase } from "@/integrations/supabase/client";
import { uploadWarehouseFile } from "@/lib/warehouse/data";
import { uploadPhoto } from "./logistics-warehouse-data";

const sb = supabase as any;

export type OutMode = "jls" | "third" | "client";

export type WhCheckout = {
  id: string; number: string; mode: OutMode; status: "draft" | "assigned" | "released" | "cancelled";
  boat_name: string | null; scheduled_date: string | null; driver_id: string | null; destination: string | null;
  carrier_driver_name: string | null; receiver_name: string | null; receiver_position: string | null; receiver_email: string | null;
  released_at: string | null; created_at: string;
};

/** One row on a check-out: a whole package, or a packing-list line with how many leave. */
export type OutLine =
  | { kind: "package"; key: string; clientItemId: string; ref_no: string; boat: string; description: string }
  | { kind: "content"; key: string; contentId: string; ref_no: string; itemId: string; boat: string; description: string; stored: number; qtyOut: number };

/** True when the check-out tables / function haven't been created yet. */
export const isNotSetUp = (e: unknown) => ["42P01", "PGRST205", "PGRST202"].includes((e as { code?: string } | null)?.code ?? "");

const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const OPEN = ["draft", "assigned"];

// ── Reading ──────────────────────────────────────────────────────────────────

export type OutRow = { co: WhCheckout; total: number; driverName: string | null };

/** Check-outs still to be completed, newest first. */
export async function loadCheckouts(): Promise<OutRow[]> {
  const { data, error } = await sb.from("warehouse_checkouts").select("*").in("status", OPEN).order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  const list = (data ?? []) as WhCheckout[];
  if (list.length === 0) return [];
  const [{ data: items }, { data: drivers }] = await Promise.all([
    sb.from("warehouse_checkout_items").select("checkout_id").in("checkout_id", list.map((c) => c.id)),
    sb.from("shipsync_drivers").select("id, name"),
  ]);
  const counts = new Map<string, number>();
  for (const i of items ?? []) counts.set(i.checkout_id, (counts.get(i.checkout_id) ?? 0) + 1);
  const names = new Map<string, string>((drivers ?? []).map((d: any) => [d.id, d.name]));
  return list.map((co) => ({ co, total: counts.get(co.id) ?? 0, driverName: co.driver_id ? names.get(co.driver_id) ?? null : null }));
}

export async function loadCheckoutLines(checkoutId: string): Promise<OutLine[]> {
  const { data, error } = await sb.from("warehouse_checkout_items").select("*").eq("checkout_id", checkoutId).order("created_at");
  if (error) throw error;
  const rows = data ?? [];
  const contentIds = rows.filter((r: any) => r.kind === "content" && r.content_id).map((r: any) => r.content_id);
  const stored = new Map<string, number>();
  if (contentIds.length) {
    const { data: c } = await sb.from("warehouse_package_contents").select("id, quantity").in("id", contentIds);
    for (const x of c ?? []) stored.set(x.id, Number(x.quantity));
  }
  return rows.map((r: any): OutLine => r.kind === "package"
    ? { kind: "package", key: `p:${r.client_item_id}`, clientItemId: r.client_item_id, ref_no: r.ref_no, boat: r.client_name ?? "", description: r.description ?? "" }
    : {
      kind: "content", key: `c:${r.content_id}`, contentId: r.content_id, ref_no: r.ref_no, itemId: r.item_id ?? "", boat: r.client_name ?? "",
      description: r.description ?? "", stored: stored.get(r.content_id) ?? Number(r.qty_out ?? 0), qtyOut: Number(r.qty_out ?? 0),
    });
}

/** Everything already promised to another open check-out — it can't go out twice. */
async function reservedElsewhere(exceptId: string | null): Promise<{ lines: Set<string>; packageRefs: Set<string> }> {
  const { data: open } = await sb.from("warehouse_checkouts").select("id").in("status", OPEN);
  const ids = (open ?? []).map((c: any) => c.id).filter((id: string) => id !== exceptId);
  const lines = new Set<string>(); const packageRefs = new Set<string>();
  if (ids.length === 0) return { lines, packageRefs };
  const { data: items } = await sb.from("warehouse_checkout_items").select("kind, client_item_id, content_id, ref_no").in("checkout_id", ids);
  for (const i of items ?? []) {
    if (i.kind === "package") { lines.add(`p:${i.client_item_id}`); packageRefs.add(i.ref_no); } else lines.add(`c:${i.content_id}`);
  }
  return { lines, packageRefs };
}

/** Clients that have something in storage to send out. */
export async function loadStockBoats(): Promise<string[]> {
  const { data, error } = await sb.from("warehouse_client_items").select("client_name").eq("status", "Stored").limit(3000);
  if (error) throw error;
  return Array.from(new Set<string>((data ?? []).map((r: any) => r.client_name as string).filter(Boolean))).sort();
}

const pkgLine = (p: any): OutLine => ({ kind: "package", key: `p:${p.id}`, clientItemId: p.id, ref_no: p.ref_no, boat: p.client_name, description: p.description });
const contentLine = (c: any, boat: string): OutLine => ({
  kind: "content", key: `c:${c.id}`, contentId: c.id, ref_no: c.ref_no, itemId: c.item_id, boat, description: c.item_name,
  stored: Number(c.quantity), qtyOut: Number(c.quantity),
});

/** What a client has in storage that is free to go: whole packages, and packing-list lines (Qty Out starts at everything stored). */
export async function loadStock(boat: string, exceptCheckoutId: string | null): Promise<{ packages: OutLine[]; contents: OutLine[] }> {
  const { data: pk, error } = await sb.from("warehouse_client_items").select("id, ref_no, client_name, description")
    .ilike("client_name", esc(boat)).eq("status", "Stored").order("ref_no");
  if (error) throw error;
  const taken = await reservedElsewhere(exceptCheckoutId);
  const packages = (pk ?? []).filter((p: any) => !taken.lines.has(`p:${p.id}`)).map(pkgLine);
  const refs = (pk ?? []).map((p: any) => p.ref_no).filter((r: string) => !taken.packageRefs.has(r));
  let contents: OutLine[] = [];
  if (refs.length) {
    const { data: ct } = await sb.from("warehouse_package_contents").select("id, item_id, ref_no, item_name, quantity")
      .in("ref_no", refs).eq("status", "Stored").gt("quantity", 0).order("item_id");
    contents = (ct ?? []).filter((c: any) => !taken.lines.has(`c:${c.id}`)).map((c: any) => contentLine(c, boat));
  }
  return { packages, contents };
}

/** A scanned label carries a package's reference, or an item's ID from inside a box. */
export async function findByScan(code: string, exceptCheckoutId: string | null): Promise<{ line?: OutLine; reason?: string }> {
  const c = esc(code.trim());
  const taken = await reservedElsewhere(exceptCheckoutId);
  const { data: pk } = await sb.from("warehouse_client_items").select("id, ref_no, client_name, description, status").ilike("ref_no", c).limit(1);
  if (pk?.[0]) {
    const p = pk[0];
    if (p.status !== "Stored") return { reason: `${p.ref_no} has already left the warehouse.` };
    if (taken.lines.has(`p:${p.id}`)) return { reason: `${p.ref_no} is already on another check-out.` };
    return { line: pkgLine(p) };
  }
  const { data: ct } = await sb.from("warehouse_package_contents").select("id, item_id, ref_no, item_name, quantity, status, client_or_dept").ilike("item_id", c).limit(1);
  if (ct?.[0]) {
    const x = ct[0];
    if (x.status !== "Stored" || Number(x.quantity) <= 0) return { reason: `${x.item_id} is not in storage.` };
    if (taken.lines.has(`c:${x.id}`) || taken.packageRefs.has(x.ref_no)) return { reason: `${x.item_id} is already on another check-out.` };
    return { line: contentLine(x, x.client_or_dept ?? "") };
  }
  return { reason: `${code} isn't in the warehouse.` };
}

// ── Writing ──────────────────────────────────────────────────────────────────

export type CheckoutDraft = { mode: OutMode; lines: OutLine[]; date: string; driverId: string; destination: string; carrier: string };

function boatLabel(lines: OutLine[]): string | null {
  const boats = Array.from(new Set(lines.map((l) => l.boat.trim()).filter(Boolean)));
  return boats.length === 1 ? boats[0] : null;
}

/**
 * Save the check-out as a draft, or — for a JLS vehicle with a driver — as
 * Assigned. The number (WH0001…) is issued on the first save, so a cancelled
 * check-out never uses one up. Lines are swapped in before the old ones go, so a
 * failure part-way can't leave a note empty.
 */
export async function saveCheckout(id: string | null, d: CheckoutDraft, status: "draft" | "assigned"): Promise<WhCheckout> {
  const taken = await reservedElsewhere(id);
  const clash = d.lines.find((l) => taken.lines.has(l.key) || (l.kind === "content" && taken.packageRefs.has(l.ref_no)));
  if (clash) throw new Error(`${clash.kind === "content" ? clash.itemId : clash.ref_no} was just put on another check-out — remove it and try again.`);
  for (const l of d.lines) if (l.kind === "content" && !(l.qtyOut > 0 && l.qtyOut <= l.stored)) throw new Error(`Qty Out for ${l.itemId} must be between 1 and ${l.stored}.`);

  const fields = {
    mode: d.mode, status,
    boat_name: boatLabel(d.lines),
    scheduled_date: d.mode === "jls" ? d.date || null : null,
    driver_id: d.mode === "jls" ? d.driverId || null : null,
    destination: d.mode === "jls" ? d.destination.trim() || null : null,
    carrier_driver_name: d.mode === "third" ? d.carrier.trim() || null : null,
  };

  let co: WhCheckout;
  let oldItemIds: string[] = [];
  if (id) {
    const { data: old } = await sb.from("warehouse_checkout_items").select("id").eq("checkout_id", id);
    oldItemIds = (old ?? []).map((r: any) => r.id);
    const { data, error } = await sb.from("warehouse_checkouts").update(fields).eq("id", id).in("status", OPEN).select("*").single();
    if (error) throw error;
    co = data as WhCheckout;
  } else {
    const { data: number, error: nErr } = await sb.rpc("next_warehouse_checkout_number");
    if (nErr) throw nErr;
    const { data, error } = await sb.from("warehouse_checkouts").insert({ number, ...fields }).select("*").single();
    if (error) throw error;
    co = data as WhCheckout;
  }

  if (d.lines.length) {
    const { error } = await sb.from("warehouse_checkout_items").insert(d.lines.map((l) => l.kind === "package"
      ? { checkout_id: co.id, kind: "package", client_item_id: l.clientItemId, ref_no: l.ref_no, description: l.description, client_name: l.boat }
      : { checkout_id: co.id, kind: "content", content_id: l.contentId, ref_no: l.ref_no, item_id: l.itemId, description: l.description, client_name: l.boat, qty_out: l.qtyOut }));
    if (error) throw error;
  }
  if (oldItemIds.length) {
    const { error } = await sb.from("warehouse_checkout_items").delete().in("id", oldItemIds);
    if (error) throw error;
  }
  return co;
}

/** Give up a saved check-out: it leaves the list and frees what it was holding. */
export async function cancelCheckout(id: string): Promise<void> {
  const { error } = await sb.from("warehouse_checkouts").update({ status: "cancelled" }).eq("id", id).in("status", OPEN);
  if (error) throw error;
}

export type Handover = { name: string; position: string; email: string; photo: File | null; signature: Blob | null };

/**
 * Release: the goods leave. Records who took them, then lets the database apply
 * the stock changes and close the note in one step.
 */
export async function releaseCheckout(co: WhCheckout, h: Handover | null): Promise<void> {
  if (h) {
    const stamp = Date.now();
    const photo_url = h.photo ? await uploadPhoto(h.photo, `checkout/${co.number}`) : null;
    const signature_url = h.signature ? await uploadWarehouseFile(h.signature, `checkout/${co.number}/signature-${stamp}.png`) : null;
    const { error } = await sb.from("warehouse_checkouts").update({
      receiver_name: h.name.trim() || null, receiver_position: h.position.trim() || null, receiver_email: h.email.trim() || null,
      carrier_driver_name: co.mode === "third" ? h.name.trim() || null : co.carrier_driver_name, photo_url, signature_url,
    }).eq("id", co.id);
    if (error) throw error;
  }
  const { error } = await sb.rpc("complete_warehouse_checkout", { p_id: co.id });
  if (error) throw error;
}

// ── The paper delivery note for a third-party driver ─────────────────────────

const hx = (s: string | number | null | undefined) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A plain printable delivery note, opened in a new tab for the driver's copy. */
export function openDeliveryNote(co: WhCheckout, lines: OutLine[], carrier: string): void {
  const rows = lines.map((l) => `<tr><td>${hx(l.boat)}</td><td>${hx(l.ref_no)}</td><td>${hx(l.kind === "content" ? l.itemId : "")}</td><td>${hx(l.description)}</td><td class="n">${l.kind === "content" ? l.qtyOut : "Whole package"}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Delivery Note ${hx(co.number)}</title>
<style>body{font-family:Arial,sans-serif;margin:28px;color:#111}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #999;padding:6px 8px;font-size:14px;text-align:left}th{background:#eee}.n{text-align:right}.sig{margin-top:48px;display:flex;gap:48px}.sig div{flex:1;border-top:1px solid #111;padding-top:4px;font-size:13px}</style></head>
<body><h1>Delivery Note ${hx(co.number)}</h1><div>Warehouse release${co.boat_name ? ` — ${hx(co.boat_name)}` : ""}</div>
<div>Date: ${hx(new Date().toLocaleDateString("en-GB"))} &nbsp; Carrier driver: ${hx(carrier || "—")}</div>
<table><thead><tr><th>Client/Boat</th><th>Ref No.</th><th>Item ID</th><th>Description</th><th class="n">Qty Out</th></tr></thead><tbody>${rows}</tbody></table>
<div class="sig"><div>Released by (JLS)</div><div>Received by (driver signature)</div></div>
<script>window.onload=function(){window.print()}</script></body></html>`;
  window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank", "noreferrer");
}
