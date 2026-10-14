/**
 * Share Training files and folders with guests — any staff member.
 *
 *   POST /api/guest-shares
 *     { action: "share", resourceType, resourceId, targets: [{ guestId } | { groupId }],
 *       permission: "read" | "read_write", expiresAt?, note?, notify?, message? }
 *         → one live share per target (sharing again with someone updates theirs),
 *           then, if notify, one email per guest reached (group members included).
 *     { action: "update", shareId, permission?, expiresAt? }   (expiresAt null = no end date)
 *     { action: "revoke", shareIds: [...] }
 *
 * Reads (who has what) happen in the browser under staff RLS.
 */
import { logAuditEvent } from "@/lib/admin/audit";
import { json, requireStaff } from "@/lib/guest/guest-auth.server";
import { sendShareNotice } from "@/lib/guest/guest-email.server";
import { PERMISSION_LABEL, type SharePermission, type ShareResourceType } from "@/lib/guest/shares";

const TYPES: ShareResourceType[] = ["training_folder", "training_document"];
const PERMS: SharePermission[] = ["read", "read_write"];

async function resourceName(sb: any, type: ShareResourceType, id: string): Promise<string | null> {
  if (type === "training_folder") {
    const { data } = await sb.from("training_document_folders").select("name").eq("id", id).maybeSingle();
    return data?.name ?? null;
  }
  const { data } = await sb.from("training_documents").select("title, file_name").eq("id", id).maybeSingle();
  return data ? (data.title ?? data.file_name ?? "Document") : null;
}

/** An ISO date, or null for "no end date". Rejects past dates. */
function parseExpiry(v: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (v === null || v === undefined || v === "") return { ok: true, value: null };
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return { ok: false, error: "That expiry date isn't valid." };
  if (d.getTime() <= Date.now()) return { ok: false, error: "The expiry date must be in the future." };
  return { ok: true, value: d.toISOString() };
}

export async function guestSharesHandler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = await requireStaff(request);
  if (!auth.ok) return auth.response;
  const { sb, staff } = auth;
  const body = (await request.json().catch(() => ({}))) as Record<string, any>;

  const audit = (label: string, detail: string) => logAuditEvent({
    event_type: "PERM", module: "training",
    actor_id: staff.userId, actor_email: staff.email, actor_role: "staff",
    target_type: "guest_share", target_label: label, detail,
    ip_address: request.headers.get("x-forwarded-for"), result: "success",
  } as any);

  if (body.action === "share") {
    const type = body.resourceType as ShareResourceType;
    const id = String(body.resourceId ?? "");
    const permission = (body.permission ?? "read") as SharePermission;
    if (!TYPES.includes(type) || !id) return json({ error: "Nothing to share." }, 400);
    if (!PERMS.includes(permission)) return json({ error: "Unknown permission." }, 400);
    const expiry = parseExpiry(body.expiresAt);
    if (!expiry.ok) return json({ error: expiry.error }, 400);
    const name = await resourceName(sb, type, id);
    if (!name) return json({ error: "That file or folder no longer exists." }, 404);

    const targets = (Array.isArray(body.targets) ? body.targets : [])
      .map((t: any) => ({ guestId: t?.guestId ? String(t.guestId) : null, groupId: t?.groupId ? String(t.groupId) : null }))
      .filter((t: any) => !!t.guestId !== !!t.groupId);
    if (!targets.length) return json({ error: "Choose at least one guest or group." }, 400);

    const note = String(body.note ?? "").trim() || null;
    const saved: string[] = [];
    for (const t of targets) {
      const col = t.guestId ? "guest_id" : "group_id";
      const val = t.guestId ?? t.groupId;
      const { data: live } = await sb.from("guest_shares").select("id")
        .eq("resource_type", type).eq("resource_id", id).eq(col, val).is("revoked_at", null).maybeSingle();
      if (live) {
        const { error } = await sb.from("guest_shares")
          .update({ permission, expires_at: expiry.value, note }).eq("id", live.id);
        if (error) return json({ error: error.message }, 500);
        saved.push(live.id);
      } else {
        const { data: row, error } = await sb.from("guest_shares").insert({
          resource_type: type, resource_id: id, [col]: val, permission,
          expires_at: expiry.value, note, shared_by: staff.userId, shared_by_name: staff.name,
        }).select("id").single();
        if (error) return json({ error: error.message }, 500);
        saved.push(row.id);
      }
    }

    // Who to tell: direct guests plus every member of the chosen groups, once each.
    let notified = 0;
    const notifyErrors: string[] = [];
    if (body.notify) {
      const guestIds = new Set<string>(targets.filter((t: any) => t.guestId).map((t: any) => t.guestId));
      const groupIds = targets.filter((t: any) => t.groupId).map((t: any) => t.groupId);
      if (groupIds.length) {
        const { data: members } = await sb.from("guest_group_members").select("guest_id").in("group_id", groupIds);
        for (const m of members ?? []) guestIds.add(m.guest_id);
      }
      if (guestIds.size) {
        const { data: guests } = await sb.from("guest_accounts")
          .select("id, email, display_name, active").in("id", [...guestIds]);
        for (const g of (guests ?? []).filter((x: any) => x.active)) {
          const r = await sendShareNotice({
            to: g.email, guestName: g.display_name, sharedBy: staff.name,
            items: [{ name, kind: type === "training_folder" ? "folder" : "document" }],
            permissionLabel: PERMISSION_LABEL[permission],
            message: body.message, expiresAt: expiry.value,
          });
          if (r.sent) notified++; else if (r.error && !notifyErrors.includes(r.error)) notifyErrors.push(r.error);
        }
      }
    }

    await audit(name, `Shared with ${targets.length} guest target${targets.length === 1 ? "" : "s"} — ${PERMISSION_LABEL[permission]}${expiry.value ? `, until ${expiry.value.slice(0, 10)}` : ""}${body.notify ? `, ${notified} notified` : ""}`);
    return json({
      success: true, shareIds: saved, notified,
      warning: notifyErrors.length ? `Shared, but the email could not be sent: ${notifyErrors[0]}` : undefined,
    });
  }

  if (body.action === "update") {
    const { data: share } = await sb.from("guest_shares").select("id, resource_type, resource_id, revoked_at")
      .eq("id", body.shareId).maybeSingle();
    if (!share || share.revoked_at) return json({ error: "That share no longer exists." }, 404);
    const patch: Record<string, unknown> = {};
    if ("permission" in body) {
      if (!PERMS.includes(body.permission)) return json({ error: "Unknown permission." }, 400);
      patch.permission = body.permission;
    }
    if ("expiresAt" in body) {
      const expiry = parseExpiry(body.expiresAt);
      if (!expiry.ok) return json({ error: expiry.error }, 400);
      patch.expires_at = expiry.value;
    }
    const { error } = await sb.from("guest_shares").update(patch).eq("id", share.id);
    if (error) return json({ error: error.message }, 500);
    const name = (await resourceName(sb, share.resource_type, share.resource_id)) ?? share.resource_id;
    await audit(name, `Guest share changed: ${Object.entries(patch).map(([k, v]) => `${k}=${v ?? "none"}`).join(", ")}`);
    return json({ success: true });
  }

  if (body.action === "revoke") {
    const ids: string[] = (Array.isArray(body.shareIds) ? body.shareIds : [body.shareId]).filter(Boolean).map(String);
    if (!ids.length) return json({ error: "Nothing to revoke." }, 400);
    const { data, error } = await sb.from("guest_shares")
      .update({ revoked_at: new Date().toISOString(), revoked_by: staff.userId, revoked_by_name: staff.name })
      .in("id", ids).is("revoked_at", null).select("id");
    if (error) return json({ error: error.message }, 500);
    await audit(`${data?.length ?? 0} share(s)`, "Guest access revoked");
    return json({ success: true, revoked: data?.length ?? 0 });
  }

  return json({ error: `Unknown action: ${body.action}` }, 400);
}
