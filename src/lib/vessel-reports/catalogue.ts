/**
 * The automated reports a vessel can be opted in to (Reports → Automated
 * Reports). Shared by the screen and the worker. Adding a report: a key here,
 * the same key in vessel_report_subscriptions' CHECK, and a builder in
 * lib/vessel-reports/build.server.ts.
 */
export type ReportKey = "visa_status" | "sign_on_off" | "statement_of_account";
/** A weekday, every day, or "monthly" = the 1st of each month. */
export type ReportDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun" | "daily" | "monthly";
export type ReportSchedule = { day: ReportDay; time: string; tz?: string };

export const VESSEL_REPORTS: Array<{
  key: ReportKey;
  label: string;
  description: string;
  defaultSchedule: ReportSchedule;
}> = [
  {
    key: "visa_status",
    label: "Visa status",
    description: "Every crew member's UAE visa — in date, expiring within 30 days, or expired — with the PDF report attached.",
    defaultSchedule: { day: "fri", time: "08:00", tz: "Asia/Dubai" },
  },
  {
    key: "sign_on_off",
    label: "Sign On / Sign Off",
    description: "This week's crew sign-ons and sign-offs, the confirmed movements coming up, and who is on board, with the PDF attached.",
    defaultSchedule: { day: "mon", time: "07:00", tz: "Asia/Dubai" },
  },
  {
    key: "statement_of_account",
    label: "Statement of account",
    description: "What the vessel owes — open balance, overdue and every unpaid invoice — from each company that bills it (JLS, and Waypoint where linked), with the statement PDF attached.",
    defaultSchedule: { day: "monthly", time: "09:00", tz: "Asia/Dubai" },
  },
];

export const REPORT_DAYS: Array<{ value: ReportDay; label: string }> = [
  { value: "mon", label: "Mondays" }, { value: "tue", label: "Tuesdays" }, { value: "wed", label: "Wednesdays" },
  { value: "thu", label: "Thursdays" }, { value: "fri", label: "Fridays" }, { value: "sat", label: "Saturdays" },
  { value: "sun", label: "Sundays" }, { value: "daily", label: "Every day" },
  { value: "monthly", label: "1st of each month" },
];

export const reportLabel = (key: string) => VESSEL_REPORTS.find((r) => r.key === key)?.label ?? key;

export function describeReportSchedule(s: ReportSchedule): string {
  const day = REPORT_DAYS.find((d) => d.value === s.day)?.label ?? s.day;
  return `${s.day === "monthly" ? "The 1st of each month" : day} at ${s.time} (Dubai)`;
}

export const isEmail = (s: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s.trim());
