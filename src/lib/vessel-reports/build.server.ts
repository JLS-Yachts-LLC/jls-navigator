/**
 * Build one vessel's automated report: the email (subject/html/text) and its
 * PDF attachment. Read-only apart from the visa report, which records its
 * snapshot in visa_report_log the way the manual Vessel Visa Reports screen does.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateVesselVisaReport } from "@/lib/visa-reporting/generateReport.server";
import { buildVisaReportEmail, type VisaReportEmailCrewRow } from "@/lib/visa-reporting/reportEmail";
import { formatDateDMY, type SnapshotRow } from "@/lib/visa-reporting/statusHelpers";
import { emailBrandLockup } from "@/lib/email/brand-mark";
import { buildReportPdf } from "@/routes/api.movements.reports";
import type { ReportKey } from "./catalogue";

export interface BuiltReport {
  subject: string;
  html: string;
  text: string;
  attachments: { filename: string; contentBase64: string; contentType: string }[];
  /** One line for the send log, e.g. "3 crew · 1 expiring · 0 expired". */
  summary: string;
  /** visa_report_log row, for the visa report — marked sent once delivered. */
  visaReportId?: string;
}

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const fileSafe = (s: string) => s.replace(/[^\w .-]+/g, "").trim() || "Vessel";

/** Today in Dubai, YYYY-MM-DD — the business's calendar, not UTC's. */
function dubaiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); return addDays(iso, -((d.getUTCDay() + 6) % 7)); };
const nice = (iso: string | null | undefined) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

export async function buildVesselReport(key: ReportKey, yachtId: string, opts: { staffCopy?: boolean } = {}): Promise<BuiltReport> {
  const sb = supabaseAdmin as any;
  const { data: yacht } = await sb.from("yachts").select("id, vessel_name, qbo_customer_id").eq("id", yachtId).maybeSingle();
  if (!yacht) throw new Error("Vessel not found");
  const vessel = String(yacht.vessel_name ?? "Vessel");
  if (key === "visa_status") return buildVisaStatus(yachtId, vessel, opts);
  if (key === "statement_of_account") {
    const { buildStatement } = await import("./statement.server");
    return buildStatement(yachtId, vessel, yacht.qbo_customer_id ?? null);
  }
  if (key === "document_expiries") {
    const { buildDocumentExpiries } = await import("./expiries.server");
    return buildDocumentExpiries(yachtId, vessel);
  }
  if (key === "crew_on_board") {
    const { buildCrewOnBoard } = await import("./crew.server");
    return buildCrewOnBoard(yachtId, vessel);
  }
  return buildSignOnOff(yachtId, vessel);
}

// ── Visa status ─────────────────────────────────────────────────────────────

async function buildVisaStatus(yachtId: string, vessel: string, opts: { staffCopy?: boolean }): Promise<BuiltReport> {
  const gen = await generateVesselVisaReport(yachtId, null);
  if (!gen.ok) throw new Error(gen.error);
  const report = gen.report;
  const snapshot = (report.snapshot_data ?? []) as SnapshotRow[];

  const rows = (status: string, by: (c: SnapshotRow) => number): VisaReportEmailCrewRow[] =>
    snapshot.filter((c) => c.status === status).sort((a, b) => by(a) - by(b)).slice(0, 10)
      .map((c) => ({ name: c.name ?? "—", visaType: c.visa_type, date: c.expiry_date, days: (status === "expired" ? c.days_overdue : c.days_remaining) ?? 0 }));
  const base = process.env.VITE_APP_URL ?? "https://polaris.jlsyachts.com";
  const { subject, html, text } = buildVisaReportEmail({
    vesselName: vessel,
    reportDate: report.report_date,
    totalCrew: report.crew_count ?? 0,
    activeVisas: report.active_count ?? 0,
    expiringVisas: report.expiring_count ?? 0,
    expiredVisas: report.expired_count ?? 0,
    signOns: report.sign_on_count,
    signOffs: report.sign_off_count,
    expiringSoonCrew: rows("expiring_soon", (c) => c.days_remaining ?? 0),
    expiredCrew: rows("expired", (c) => -(c.days_overdue ?? 0)),
    // Clients get a "contact your agent" line; only a staff copy links into Polaris.
    preferencesUrl: opts.staffCopy ? `${base}/polaris-redesign?screen=vessel-report-automations` : "",
  });

  const STATUS: Record<string, string> = { active: "In date", expiring_soon: "Expiring soon", expired: "Expired", no_visa: "No visa on file" };
  const order: Record<string, number> = { expired: 0, expiring_soon: 1, active: 2, no_visa: 3 };
  const pdfRows = [...snapshot]
    .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || String(a.name ?? "").localeCompare(String(b.name ?? "")))
    .map((c) => [
      c.name ?? "—", c.nationality ?? "—", c.visa_type ?? "—", formatDateDMY(c.expiry_date), STATUS[c.status] ?? c.status,
      c.status === "expired" ? `${c.days_overdue ?? 0} days overdue` : c.days_remaining != null ? `${c.days_remaining} days left` : "—",
    ]);
  const pdf = await buildReportPdf(`Visa status — ${vessel} — ${nice(report.report_date)}`,
    ["Crew", "Nationality", "Visa", "Expiry", "Status", "Days"], pdfRows, [3, 2, 2.4, 1.6, 1.8, 1.8]);

  return {
    subject, html, text,
    attachments: [{ filename: `Visa status - ${fileSafe(vessel)} - ${report.report_date}.pdf`, contentBase64: b64(pdf), contentType: "application/pdf" }],
    summary: `${report.crew_count ?? 0} crew · ${report.active_count ?? 0} in date · ${report.expiring_count ?? 0} expiring · ${report.expired_count ?? 0} expired`,
    visaReportId: report.id,
  };
}

// ── Sign On / Sign Off ──────────────────────────────────────────────────────

const SELECT = `crew_member_id, event_type, event_date, status, port, airline, flight_number,
  departure_airport, arrival_airport, pickup_required,
  crew_members ( full_name, first_name, last_name, rank, nationality )`;

async function buildSignOnOff(yachtId: string, vessel: string): Promise<BuiltReport> {
  const sb = supabaseAdmin as any;
  const today = dubaiToday();
  const monday = mondayOf(today);
  const sunday = addDays(monday, 6);
  const ahead = addDays(sunday, 14);

  const { data, error } = await sb.from("crew_signon_events").select(SELECT)
    .eq("yacht_id", yachtId).order("event_date", { ascending: true });
  if (error) throw new Error(error.message);
  const all = (data ?? []) as any[];

  const name = (a: any) => a.crew_members?.full_name || `${a.crew_members?.first_name ?? ""} ${a.crew_members?.last_name ?? ""}`.trim() || "—";
  const kind = (a: any) => (a.event_type === "sign_off" ? "Sign off" : "Sign on");
  const flight = (a: any) => [a.airline, a.flight_number].filter(Boolean).join(" ") || "—";
  const route = (a: any) => [a.departure_airport, a.arrival_airport].filter(Boolean).join(" → ") || "—";

  const thisWeek = all.filter((a) => a.event_date >= monday && a.event_date <= sunday);
  const comingUp = all.filter((a) => a.event_date > sunday && a.event_date <= ahead && a.status === "confirmed");
  // On board = the latest movement for each crew member is a sign-on that has happened.
  const latest = new Map<string, any>();
  for (const a of all) if (a.event_date <= today) latest.set(a.crew_member_id, a);
  const onBoard = [...latest.values()].filter((a) => a.event_type !== "sign_off").sort((a, b) => name(a).localeCompare(name(b)));

  const ons = thisWeek.filter((a) => a.event_type !== "sign_off").length;
  const offs = thisWeek.length - ons;

  const table = (title: string, list: any[], empty: string) => `
    <h3 style="margin:22px 0 6px;font-size:14px;color:#07435E">${esc(title)}</h3>
    ${list.length ? `<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
      <tr style="background:#f1f5f9;text-align:left"><th>Date</th><th>Movement</th><th>Crew</th><th>Flight</th><th>Status</th></tr>
      ${list.map((a) => `<tr style="border-top:1px solid #e5e7eb"><td>${esc(nice(a.event_date))}</td><td>${esc(kind(a))}</td><td>${esc(name(a))}${a.crew_members?.rank ? ` <span style="color:#6b7280">· ${esc(a.crew_members.rank)}</span>` : ""}</td><td>${esc(flight(a))}</td><td>${esc(a.status ?? "—")}</td></tr>`).join("")}
    </table>` : `<p style="margin:0;color:#6b7280">${esc(empty)}</p>`}`;

  const subject = `${vessel} — Sign On / Sign Off, w/c ${nice(monday)} (${ons} on / ${offs} off)`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f8fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:24px">
      ${emailBrandLockup(`<span style="font-size:16px;font-weight:700;color:#07435E">JLS Yachts</span>`)}
      <h2 style="margin:16px 0 4px;font-size:18px;color:#07435E">${esc(vessel)} — Sign On / Sign Off</h2>
      <p style="margin:0;color:#4b5563">Week commencing ${esc(nice(monday))}: <b>${ons}</b> sign-on${ons === 1 ? "" : "s"}, <b>${offs}</b> sign-off${offs === 1 ? "" : "s"} · <b>${onBoard.length}</b> crew on board.</p>
      ${table("This week", thisWeek, "No sign-ons or sign-offs this week.")}
      ${table("Coming up (next two weeks, confirmed)", comingUp, "Nothing confirmed for the next two weeks.")}
      <h3 style="margin:22px 0 6px;font-size:14px;color:#07435E">On board</h3>
      ${onBoard.length
        ? `<p style="margin:0;font-size:13px">${onBoard.map((a) => `${esc(name(a))}${a.crew_members?.rank ? ` (${esc(a.crew_members.rank)})` : ""}`).join(" · ")}</p>`
        : `<p style="margin:0;color:#6b7280">No crew recorded on board.</p>`}
      <p style="margin:22px 0 0;font-size:12px;color:#6b7280">The full list is attached as a PDF. To change who receives this report, please contact your JLS agent.</p>
    </div>
    <p style="text-align:center;font-size:12px;color:#94a3b8;margin:14px 0 0">JLS Yachts LLC · Superyacht Middle East</p>
  </div></body></html>`;
  const line = (a: any) => `- ${nice(a.event_date)} ${kind(a)}: ${name(a)} (${flight(a)}, ${a.status ?? "—"})`;
  const text = `${vessel} — Sign On / Sign Off, w/c ${nice(monday)}\n${ons} sign-ons, ${offs} sign-offs, ${onBoard.length} on board.\n\n`
    + `This week:\n${thisWeek.map(line).join("\n") || "  none"}\n\nComing up:\n${comingUp.map(line).join("\n") || "  none"}\n\n`
    + `On board: ${onBoard.map(name).join(", ") || "none recorded"}`;

  const pdfRows = [...thisWeek, ...comingUp].map((a) => [nice(a.event_date), kind(a), name(a), a.crew_members?.rank ?? "—", flight(a), route(a), a.status ?? "—"]);
  for (const a of onBoard) pdfRows.push(["On board", "—", name(a), a.crew_members?.rank ?? "—", "—", "—", `since ${nice(a.event_date)}`]);
  const pdf = await buildReportPdf(`Sign On / Sign Off — ${vessel} — w/c ${nice(monday)}`,
    ["Date", "Movement", "Crew", "Rank", "Flight", "Route", "Status"], pdfRows, [1.8, 1.4, 3, 2, 1.8, 2.2, 1.8]);

  return {
    subject, html, text,
    attachments: [{ filename: `Sign On-Off - ${fileSafe(vessel)} - w-c ${monday}.pdf`, contentBase64: b64(pdf), contentType: "application/pdf" }],
    summary: `${ons} on · ${offs} off this week · ${comingUp.length} coming up · ${onBoard.length} on board`,
  };
}
