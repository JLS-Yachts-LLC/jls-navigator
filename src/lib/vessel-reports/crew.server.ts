/**
 * Automated report: Crew on board.
 *
 * Who is on board, counted the way the Client Portal's Today's brief counts it
 * (crew_members.status "active" = signed on, "on_leave" = on leave), with each
 * person's rank, nationality, when they last signed on, passport expiry and
 * current UAE visa — flagging a passport inside six months and a visa expired
 * or inside 30 days.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emailBrandLockup } from "@/lib/email/brand-mark";
import { buildReportPdf } from "@/routes/api.movements.reports";
import type { BuiltReport } from "./build.server";

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const fileSafe = (s: string) => s.replace(/[^\w .-]+/g, "").trim() || "Vessel";
const dubaiToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nice = (iso: string | null | undefined) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

type Row = {
  name: string; rank: string; nationality: string; signedOn: string | null;
  passport: string | null; visaType: string | null; visaExpiry: string | null;
  passportFlag: "expired" | "soon" | null; visaFlag: "expired" | "soon" | "none" | null;
};

export async function buildCrewOnBoard(yachtId: string, vessel: string): Promise<BuiltReport> {
  const sb = supabaseAdmin as any;
  const today = dubaiToday();
  const in30 = addDays(today, 30);
  const in6m = addDays(today, 183);

  const [crewR, eventsR, visasR] = await Promise.all([
    sb.from("crew_members").select("id, full_name, first_name, last_name, rank, nationality, status, passport_expiry_date").eq("yacht_id", yachtId),
    sb.from("crew_signon_events").select("crew_member_id, event_type, event_date").eq("yacht_id", yachtId).lte("event_date", today).order("event_date", { ascending: true }),
    sb.from("visa_applications").select("crew_member_id, visa_type, visa_expiry, status").eq("yacht_id", yachtId).neq("status", "cancelled").order("visa_expiry", { ascending: false }),
  ]);
  if (crewR.error) throw new Error(crewR.error.message);
  const crew = (crewR.data ?? []) as any[];
  const status = (c: any) => String(c.status ?? "").toLowerCase();
  const onBoard = crew.filter((c) => status(c) === "active");
  const onLeave = crew.filter((c) => status(c) === "on_leave");

  // Last sign-on per person, and their newest visa.
  const lastOn = new Map<string, string>();
  for (const e of (eventsR.data ?? []) as any[]) if (e.event_type !== "sign_off") lastOn.set(e.crew_member_id, e.event_date);
  const visaOf = new Map<string, any>();
  for (const v of (visasR.data ?? []) as any[]) if (v.crew_member_id && !visaOf.has(v.crew_member_id)) visaOf.set(v.crew_member_id, v);

  const toRow = (c: any): Row => {
    const v = visaOf.get(c.id);
    const pp = c.passport_expiry_date ?? null;
    const ve = v?.visa_expiry ?? null;
    return {
      name: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Crew member",
      rank: c.rank ?? "—",
      nationality: c.nationality ?? "—",
      signedOn: lastOn.get(c.id) ?? null,
      passport: pp,
      visaType: v?.visa_type ?? null,
      visaExpiry: ve,
      passportFlag: !pp ? null : pp < today ? "expired" : pp <= in6m ? "soon" : null,
      visaFlag: !v ? "none" : !ve ? null : ve < today ? "expired" : ve <= in30 ? "soon" : null,
    };
  };
  const rows = onBoard.map(toRow).sort((a, b) => a.name.localeCompare(b.name));
  const leave = onLeave.map(toRow).sort((a, b) => a.name.localeCompare(b.name));
  const attention = rows.filter((r) => r.passportFlag || r.visaFlag === "expired" || r.visaFlag === "soon").length;

  const flagged = (text: string, flag: string | null) =>
    flag === "expired" ? `<span style="color:#b91c1c;font-weight:600">${esc(text)} (expired)</span>`
      : flag === "soon" ? `<span style="color:#b45309;font-weight:600">${esc(text)}</span>`
      : esc(text);
  const visaCell = (r: Row) =>
    r.visaFlag === "none" ? `<span style="color:#6b7280">No UAE visa on file</span>`
      : flagged(`${r.visaType ?? "Visa"} · ${nice(r.visaExpiry)}`, r.visaFlag);
  const table = (list: Row[]) => `<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
      <tr style="background:#f1f5f9;text-align:left"><th>Crew</th><th>Rank</th><th>Nationality</th><th>Signed on</th><th>Passport expiry</th><th>UAE visa</th></tr>
      ${list.map((r) => `<tr style="border-top:1px solid #e5e7eb"><td>${esc(r.name)}</td><td>${esc(r.rank)}</td><td>${esc(r.nationality)}</td>`
        + `<td>${esc(nice(r.signedOn))}</td><td>${r.passport ? flagged(nice(r.passport), r.passportFlag) : "—"}</td><td>${visaCell(r)}</td></tr>`).join("")}
    </table>`;

  const subject = `${vessel} — Crew on board, ${nice(today)} (${rows.length} on board)`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f8fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <div style="max-width:680px;margin:0 auto;padding:24px 16px">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:24px">
      ${emailBrandLockup(`<span style="font-size:16px;font-weight:700;color:#07435E">JLS Yachts</span>`)}
      <h2 style="margin:16px 0 4px;font-size:18px;color:#07435E">${esc(vessel)} — Crew on board</h2>
      <p style="margin:0;color:#4b5563">As at ${esc(nice(today))}: <b>${rows.length}</b> on board${leave.length ? `, <b>${leave.length}</b> on leave` : ""}${attention ? ` · <span style="color:#b45309"><b>${attention}</b> need${attention === 1 ? "s" : ""} attention</span>` : ""}.</p>
      <h3 style="margin:22px 0 6px;font-size:14px;color:#07435E">On board</h3>
      ${rows.length ? table(rows) : `<p style="margin:0;color:#6b7280">No crew are recorded as on board.</p>`}
      ${leave.length ? `<h3 style="margin:22px 0 6px;font-size:14px;color:#07435E">On leave</h3>${table(leave)}` : ""}
      <p style="margin:18px 0 0;font-size:12px;color:#6b7280">Amber: a passport expiring within six months, or a visa within 30 days. Red: expired.</p>
      <p style="margin:6px 0 0;font-size:12px;color:#6b7280">The list is attached as a PDF. Anything out of date? Update it in your Client Portal, or let your JLS agent know. To change who receives this report, please contact your JLS agent.</p>
    </div>
    <p style="text-align:center;font-size:12px;color:#94a3b8;margin:14px 0 0">JLS Yachts LLC · Superyacht Middle East</p>
  </div></body></html>`;
  const line = (r: Row) => `- ${r.name} (${r.rank}), signed on ${nice(r.signedOn)}, passport ${nice(r.passport)}, visa ${r.visaFlag === "none" ? "none on file" : nice(r.visaExpiry)}`;
  const text = `${vessel} — Crew on board, ${nice(today)}\n${rows.length} on board, ${leave.length} on leave.\n\n`
    + `On board:\n${rows.map(line).join("\n") || "  none recorded"}`
    + (leave.length ? `\n\nOn leave:\n${leave.map(line).join("\n")}` : "");

  const mark = (text: string, flag: string | null) => (flag === "expired" ? `${text} (expired)` : flag === "soon" ? `${text} (!)` : text);
  const pdfRows = [...rows.map((r) => ["On board", r] as const), ...leave.map((r) => ["On leave", r] as const)].map(([where, r]) => [
    r.name, r.rank, r.nationality, where, nice(r.signedOn),
    r.passport ? mark(nice(r.passport), r.passportFlag) : "—",
    r.visaFlag === "none" ? "None on file" : mark(`${r.visaType ?? "Visa"} ${nice(r.visaExpiry)}`, r.visaFlag),
  ]);
  const pdf = await buildReportPdf(`Crew on board — ${vessel} — ${nice(today)}`,
    ["Crew", "Rank", "Nationality", "Status", "Signed on", "Passport expiry", "UAE visa"], pdfRows, [3, 2, 1.8, 1.4, 1.6, 2, 2.6]);

  return {
    subject, html, text,
    attachments: [{ filename: `Crew on board - ${fileSafe(vessel)} - ${today}.pdf`, contentBase64: b64(pdf), contentType: "application/pdf" }],
    summary: `${rows.length} on board · ${leave.length} on leave · ${attention} need${attention === 1 ? "s" : ""} attention`,
  };
}
