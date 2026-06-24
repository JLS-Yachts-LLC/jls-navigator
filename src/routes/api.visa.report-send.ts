/**
 * POST /api/visa/report-send  — body { report_id }
 * Dispatches an already-generated report by email (+ optional vessel WhatsApp).
 * Gated by crew_immigration 'create'.
 */
import { requireAccess } from "@/lib/auth/requireAccess.server";
import { sendVesselVisaReport } from "@/lib/visa-reporting/sendReport.server";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function visaReportSendHandler(
  request: Request,
): Promise<Response> {
  const access = await requireAccess(request, {
    module: "crew_immigration",
    level: "create",
  });
  if (!access.ok) return access.response;

  let body: { report_id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.report_id) return json({ error: "report_id is required" }, 400);

  const result = await sendVesselVisaReport(
    body.report_id,
    "manual",
    access.claims.userId,
  );
  if (!result.ok)
    return json(
      { error: result.error ?? "Send failed", emailStatus: result.emailStatus },
      result.emailStatus === "skipped" ? 400 : 502,
    );

  return json({
    ok: true,
    reportId: result.reportId,
    emailStatus: result.emailStatus,
  });
}
