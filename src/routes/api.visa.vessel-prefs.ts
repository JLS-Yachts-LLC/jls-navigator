/**
 * GET/POST /api/visa/vessel-prefs  — vessel comms preferences for visa reports.
 *   GET  ?yacht_id=...            → current prefs
 *   POST { yacht_id, ...prefs }   → update prefs
 *
 * Editing prefs is restricted to global-tier admins (spec: global_admin /
 * vessel_manager; crew_immigration is read-only). vessel_manager scoping isn't
 * modelled in this codebase yet, so we gate on adminOnly as the safe subset.
 * allow_crew_whatsapp_delivery is force-false in this build (spec rule #9).
 */
import { createClient } from "@supabase/supabase-js";
import { requireAccess } from "@/lib/auth/requireAccess.server";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function admin() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    {
      auth: { persistSession: false },
    },
  );
}

const PREF_COLUMNS =
  "id, vessel_name, visa_report_email, send_visa_reports, vessel_whatsapp, send_visa_via_whatsapp, allow_crew_email_delivery, allow_crew_whatsapp_delivery";

const E164 = /^\+[1-9]\d{1,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function visaVesselPrefsHandler(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const access = await requireAccess(request, {
      module: "crew_immigration",
      level: "view",
    });
    if (!access.ok) return access.response;
    const yachtId = url.searchParams.get("yacht_id");
    if (!yachtId) return json({ error: "yacht_id is required" }, 400);
    const { data, error } = await admin()
      .from("yachts")
      .select(PREF_COLUMNS)
      .eq("id", yachtId)
      .single();
    if (error || !data) return json({ error: "Vessel not found" }, 404);
    return json({ prefs: data });
  }

  if (request.method === "POST") {
    const access = await requireAccess(request, { adminOnly: true });
    if (!access.ok) return access.response;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const yachtId = body.yacht_id as string | undefined;
    if (!yachtId) return json({ error: "yacht_id is required" }, 400);

    const sendReports = !!body.send_visa_reports;
    const email =
      (body.visa_report_email as string | undefined)?.trim() || null;
    const whatsapp =
      (body.vessel_whatsapp as string | undefined)?.trim() || null;

    if (sendReports && (!email || !EMAIL.test(email))) {
      return json(
        {
          error:
            "A valid visa_report_email is required when reports are enabled",
        },
        400,
      );
    }
    if (whatsapp && !E164.test(whatsapp)) {
      return json(
        { error: "vessel_whatsapp must be E.164 format (e.g. +97150…)" },
        400,
      );
    }

    const update = {
      send_visa_reports: sendReports,
      visa_report_email: email,
      vessel_whatsapp: whatsapp,
      send_visa_via_whatsapp: !!body.send_visa_via_whatsapp && !!whatsapp,
      allow_crew_email_delivery: !!body.allow_crew_email_delivery,
      allow_crew_whatsapp_delivery: false, // LOCKED this build (spec rule #9)
    };

    const sb = admin();
    const { error } = await sb.from("yachts").update(update).eq("id", yachtId);
    if (error) return json({ error: "Update failed" }, 500);

    await sb.from("audit_log").insert({
      user_id: access.claims.userId,
      event_type: "data_edit",
      module: "crew_visas",
      resource_type: "yacht",
      resource_id: yachtId,
      metadata: { action: "vessel_comms_prefs_updated", ...update },
    });

    return json({ ok: true, prefs: { id: yachtId, ...update } });
  }

  return json({ error: "Method not allowed" }, 405);
}
