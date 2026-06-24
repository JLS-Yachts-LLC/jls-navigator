/**
 * Generate a vessel visa report — server side.
 * Thin wrapper over the SECURITY DEFINER SQL function generate_vessel_visa_report()
 * (migration 20260624000050), which builds the write-once snapshot, counts and the
 * audit entry atomically. Generate and Send are SEPARATE operations (spec rule #3):
 * this only writes visa_report_log; it never dispatches.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface VisaReportRow {
  id: string;
  yacht_id: string;
  report_date: string;
  sent_to_email: string | null;
  crew_count: number;
  active_count: number;
  expiring_count: number;
  expired_count: number;
  no_visa_count: number;
  sign_on_count: number | null;
  sign_off_count: number | null;
  generated_at: string;
  sent_at: string | null;
  manifest_source: string;
  status: string;
  snapshot_data: unknown;
}

export async function generateVesselVisaReport(
  yachtId: string,
  userId: string | null,
): Promise<{ ok: true; report: VisaReportRow } | { ok: false; error: string }> {
  const sb = supabaseAdmin as any;

  const { data: reportId, error } = await sb.rpc(
    "generate_vessel_visa_report",
    {
      p_yacht_id: yachtId,
      p_user_id: userId,
    },
  );
  if (error || !reportId)
    return { ok: false, error: error?.message ?? "Report generation failed" };

  const { data: report, error: fetchErr } = await sb
    .from("visa_report_log")
    .select("*")
    .eq("id", reportId)
    .single();
  if (fetchErr || !report)
    return { ok: false, error: fetchErr?.message ?? "Report row not found" };

  return { ok: true, report: report as VisaReportRow };
}
