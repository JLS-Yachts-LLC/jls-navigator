/**
 * Visa report recipients for the older visa screens (Vessel Visa Reports, the
 * Beta Visa Reports screen). They used to read yachts.send_visa_reports /
 * visa_report_email; that setting is retired, and who a vessel's visa report
 * goes to is now its Visa status report in Reports → Automated Reports. This
 * fills the same two fields from there, so those screens' "Send report" keeps
 * working without each one learning the new table.
 */
import { supabase } from "@/integrations/supabase/client";

export async function withVisaReportRecipients<T extends { id: string }>(
  yachts: T[],
): Promise<Array<T & { send_visa_reports: boolean; visa_report_email: string | null }>> {
  const { data } = await (supabase as any)
    .from("vessel_report_subscriptions")
    .select("yacht_id, recipients, cc")
    .eq("report_key", "visa_status");
  const byYacht = new Map<string, string[]>(
    (data ?? []).map((s: any) => [s.yacht_id, [...(s.recipients ?? []), ...(s.cc ?? [])]]),
  );
  return yachts.map((y) => {
    const to = byYacht.get(y.id) ?? [];
    return { ...y, send_visa_reports: to.length > 0, visa_report_email: to.length ? to.join(", ") : null };
  });
}
