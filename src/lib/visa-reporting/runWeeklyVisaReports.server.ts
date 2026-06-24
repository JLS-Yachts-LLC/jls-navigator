/**
 * Weekly visa-report dispatch — Friday 08:00 UAE (04:00 UTC).
 * Called from the Cloudflare Worker scheduled() handler (worker-entry.ts), mirroring
 * runWeeklyImmigrationReports(). For every yacht opted in (send_visa_reports = true
 * with a visa_report_email), generate a fresh report then send it. Generate and send
 * stay separate operations (spec rule #3); each yacht is isolated so one failure
 * never blocks the rest.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateVesselVisaReport } from "./generateReport.server";
import { sendVesselVisaReport } from "./sendReport.server";

export async function runWeeklyVisaReports(): Promise<{
  vessels: number;
  generated: number;
  sent: number;
}> {
  const sb = supabaseAdmin as any;

  const { data: yachts } = await sb
    .from("yachts")
    .select("id, vessel_name")
    .eq("send_visa_reports", true)
    .not("visa_report_email", "is", null);

  const list = (yachts ?? []) as Array<{ id: string }>;
  let generated = 0;
  let sent = 0;

  for (const y of list) {
    try {
      const gen = await generateVesselVisaReport(y.id, null);
      if (!gen.ok) continue;
      generated++;
      const res = await sendVesselVisaReport(
        gen.report.id,
        "weekly_cron",
        null,
      );
      if (res.ok) sent++;
    } catch (e) {
      console.error(
        `[weekly-visa] yacht ${y.id} failed:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return { vessels: list.length, generated, sent };
}
