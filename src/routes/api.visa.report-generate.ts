/**
 * POST /api/visa/report-generate  — body { yacht_id }
 * Generates (does not send) a vessel visa report. Gated by crew_immigration
 * 'create'. Vessel-scoped by construction: the SQL function only ever reads one
 * yacht's crew. Generate and Send are separate operations (spec rule #3).
 */
import { requireAccess } from "@/lib/auth/requireAccess.server";
import { generateVesselVisaReport } from "@/lib/visa-reporting/generateReport.server";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function visaReportGenerateHandler(
  request: Request,
): Promise<Response> {
  const access = await requireAccess(request, {
    module: "crew_immigration",
    level: "create",
  });
  if (!access.ok) return access.response;

  let body: { yacht_id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.yacht_id) return json({ error: "yacht_id is required" }, 400);

  const result = await generateVesselVisaReport(
    body.yacht_id,
    access.claims.userId,
  );
  if (!result.ok) return json({ error: result.error }, 500);

  return json({ ok: true, report: result.report });
}
