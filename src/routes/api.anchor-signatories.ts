/**
 * Anchor — Signatory authorisation API. POST /api/anchor-signatories (staff only).
 *
 * Actions:
 *   decide          → the signatory approves / declines a request to use their signature.
 *                     Only the signatory themself can decide. An approved e-sign document
 *                     that was waiting is then sent; a DMA form waiting after its last
 *                     approver is finalised (stamped + emailed to the authority).
 *   request-access  → ask a signatory to make you an authorised user of their signature.
 *
 * Granting / revoking authorised users is done straight in the database (RLS lets only
 * the signatory or a global admin do it); requests and uses are written only here and
 * in the signing code (see src/lib/anchor/signatory-auth.server.ts).
 */
import { requireStaff, json } from "@/lib/guest/guest-auth.server";
import {
  companySignatoryIds, esignFingerprint, findApprovedUse, notifyStaff,
} from "@/lib/anchor/signatory-auth.server";

function logEntry(actor: string, action: string, note?: string | null) {
  return { actor, action, note: note ?? null, at: new Date().toISOString() };
}

export async function anchorSignatoriesHandler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const gate = await requireStaff(request);
  if (!gate.ok) return gate.response;
  const { sb, staff } = gate;
  const origin = new URL(request.url).origin;

  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }
  const action = String(body.action ?? "");

  const canSeeConfidential = async () => {
    const { data } = await sb.rpc("can_see_anchor_confidential", { p_user_id: staff.userId });
    return data === true;
  };

  try {
    // ── The signatory approves / declines one use of their signature ──
    if (action === "decide") {
      const approve = body.approve === true;
      const note = body.note ? String(body.note).slice(0, 500) : null;
      const { data: use } = await sb.from("jls_signatory_uses").select("*").eq("id", body.useId).maybeSingle();
      if (!use) return json({ error: "Request not found" }, 404);
      const { data: sig } = await sb.from("jls_signatories").select("id, full_name, user_id, confidential").eq("id", use.signatory_id).maybeSingle();
      if (!sig) return json({ error: "Request not found" }, 404);
      if (sig.user_id !== staff.userId) return json({ error: `Only ${sig.full_name} can approve the use of their signature.` }, 403);
      if (use.status !== "pending") return json({ error: "This request has already been answered." }, 409);

      const { data: updated } = await sb.from("jls_signatory_uses").update({
        status: approve ? "approved" : "denied", basis: approve ? "approved" : null,
        decided_by: staff.userId, decided_by_email: staff.email, decided_at: new Date().toISOString(), note,
      }).eq("id", use.id).eq("status", "pending").select("id");
      if (!updated?.length) return json({ error: "This request has already been answered." }, 409);

      const verdict = approve ? "approved" : "declined";
      let followUp: string | null = null;

      // e-Sign document waiting for this approval → send it once every signatory on it has approved.
      if (use.esign_document_id) {
        const { data: doc } = await sb.from("esign_documents").select("*").eq("id", use.esign_document_id).maybeSingle();
        if (doc) {
          await sb.from("esign_events").insert([{ document_id: doc.id, event: approve ? "signatory_approved" : "signatory_declined", actor: `${sig.full_name}${note ? ` — ${note}` : ""}` }]);
          if (doc.status === "awaiting_approval") {
            if (!approve) {
              await sb.from("esign_documents").update({ status: "draft" }).eq("id", doc.id);
              followUp = "The document was returned to draft.";
            } else {
              const fingerprint = await esignFingerprint(sb, doc);
              let ready = true;
              for (const sid of companySignatoryIds(doc.signature_fields, doc.pack)) {
                if (!(await findApprovedUse(sb, sid, { kind: "esign", documentId: doc.id }, fingerprint))) { ready = false; break; }
              }
              if (ready) {
                const { deliverSigningInvite } = await import("@/lib/esign.server");
                await deliverSigningInvite(doc, use.requested_by_email ?? null, { ip: null, ua: null, origin });
                followUp = `The document was sent to ${doc.signer_email}.`;
              }
            }
          }
        }
      }

      // DMA form: finalise if it was only waiting for the signatory.
      if (use.form_submission_id) {
        const { data: sub } = await sb.from("anchor_form_submissions").select("*").eq("id", use.form_submission_id).maybeSingle();
        if (sub) {
          const log = [...(sub.approval_log ?? []), logEntry(staff.email, approve ? "signature approved" : "signature declined", note)];
          if (approve && sub.approval_status === "awaiting_signatory") {
            const { finaliseSubmission } = await import("@/routes/api.anchor-forms");
            const done = await finaliseSubmission(sub, log);
            followUp = done.ok ? "The form was signed and finalised." : done.error ?? null;
          } else if (!approve && sub.approval_status === "awaiting_signatory") {
            await sb.from("anchor_form_submissions").update({ approval_status: "rejected", status: "completed", approval_log: log, updated_at: new Date().toISOString() }).eq("id", sub.id);
          } else {
            await sb.from("anchor_form_submissions").update({ approval_log: log, updated_at: new Date().toISOString() }).eq("id", sub.id);
          }
        }
      }

      if (use.campaign_id && !use.esign_document_id && approve) followUp = "Retry the held recipients in the campaign to send them.";

      await notifyStaff(sb, {
        userId: use.requested_by, email: use.requested_by_email, type: "signatory_use_decision",
        urgency: approve ? "info" : "warning",
        title: `${sig.full_name} ${verdict} their signature on “${use.document_title ?? "a document"}”`,
        body: `${sig.full_name} ${verdict} the use of their signature on “${use.document_title ?? "a document"}”.${note ? ` Note: ${note}` : ""}${followUp ? ` ${followUp}` : ""}`,
        actionUrl: "/esign", metadata: { use_id: use.id }, origin,
      });
      return json({ ok: true, followUp });
    }

    // ── Ask to be an authorised user of a signature ──
    if (action === "request-access") {
      const { data: sig } = await sb.from("jls_signatories").select("id, full_name, user_id, email, confidential").eq("id", body.signatoryId).maybeSingle();
      if (!sig || (sig.confidential && !(await canSeeConfidential()))) return json({ error: "Signatory not found" }, 404);
      if (!sig.user_id) return json({ error: `${sig.full_name} has no Polaris login linked yet — ask a global admin.` }, 409);
      const note = body.note ? String(body.note).slice(0, 500) : "";
      const { data: profile } = await sb.from("user_profiles").select("email").eq("user_id", sig.user_id).maybeSingle();
      await sb.from("jls_signatory_events").insert({
        signatory_id: sig.id, event: "access_requested", actor: staff.userId, actor_email: staff.email, target_user: staff.userId, detail: note || null,
      });
      await notifyStaff(sb, {
        userId: sig.user_id, email: profile?.email ?? sig.email, type: "signatory_access_request",
        title: `${staff.name} asks to use your signature`,
        body: `${staff.name} (${staff.email}) asks to be an authorised user of your signature in Anchor.${note ? ` Note: ${note}` : ""} You can add them under Anchor → Signatories — or ignore this to keep them out.`,
        actionUrl: "/esign?tab=signatories", metadata: { signatory_id: sig.id, requester: staff.userId }, origin,
      });
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e?.message ?? "Signatory action failed" }, 500);
  }
}
