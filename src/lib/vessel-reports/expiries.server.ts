/**
 * Automated report: Document & permit expiries.
 *
 * Every dated paper for the vessel and its current crew that has expired or
 * falls due in the next 90 days, grouped Expired · within 30 days · 31–60 ·
 * 61–90. Sources:
 *   vessel — cruising permit (yachts), permits, vessel documents, ISM certificates
 *   crew   — passport and seaman's book (crew_members), crew documents, training
 *            certificates, UAE visa — for crew signed on or on leave only
 * Where a paper has been renewed (a newer one of the same kind), only the
 * newest counts, so a renewal clears it. Expired items older than a year are
 * left out as history rather than something to act on.
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
const title = (s: string | null | undefined) => (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
const ACRONYMS = /\b(Tdra|Dma|Fma|Rya|Ism|Stcw|Eng1|Gmdss|Mca|Uae|Uaq|Ssr|Mlc|Ais|Epirb)\b/g;
const label = (s: string | null | undefined) => title(s).replace(ACRONYMS, (m) => m.toUpperCase());

type Item = { who: string; what: string; ref: string | null; date: string };

export async function buildDocumentExpiries(yachtId: string, vessel: string): Promise<BuiltReport> {
  const sb = supabaseAdmin as any;
  const today = dubaiToday();
  const horizon = addDays(today, 90);
  const floor = addDays(today, -365);

  const { data: crewRows } = await sb.from("crew_members")
    .select("id, full_name, first_name, last_name, status, passport_number, passport_expiry_date, seamans_book_expiry")
    .eq("yacht_id", yachtId);
  const crew = ((crewRows ?? []) as any[]).filter((c) => ["active", "on_leave"].includes(String(c.status ?? "").toLowerCase()));
  const crewIds = crew.map((c) => c.id);
  const nameOf = new Map<string, string>(crew.map((c) => [c.id, c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Crew member"]));
  const none = { data: [] };

  const [yR, permitsR, docsR, ismR, crewDocsR, trainingR, visasR]: any[] = await Promise.all([
    sb.from("yachts").select("cruising_permit_expiry").eq("id", yachtId).maybeSingle(),
    sb.from("permits").select("permit_type, permit_number, expiry_date, status").eq("yacht_id", yachtId).not("expiry_date", "is", null),
    sb.from("yacht_documents").select("doc_type, title, expiry_date").eq("yacht_id", yachtId).not("expiry_date", "is", null),
    sb.from("ism_certificates").select("title, certificate_type, reference, expiry_date, status").eq("yacht_id", yachtId).not("expiry_date", "is", null),
    crewIds.length ? sb.from("crew_documents").select("crew_member_id, doc_type, title, expiry_date").in("crew_member_id", crewIds).not("expiry_date", "is", null) : none,
    crewIds.length ? sb.from("training_certifications").select("crew_member_id, certificate, cert_type, expiry_date, status").in("crew_member_id", crewIds).not("expiry_date", "is", null) : none,
    crewIds.length ? sb.from("visa_applications").select("crew_member_id, visa_type, visa_expiry, status").in("crew_member_id", crewIds).not("visa_expiry", "is", null).neq("status", "cancelled") : none,
  ]);

  // Newest per key — a renewed paper replaces the old one.
  const latest = new Map<string, Item>();
  const add = (key: string, item: Item) => {
    const had = latest.get(key);
    if (!had || item.date > had.date) latest.set(key, item);
  };
  const dead = (s: unknown) => ["cancelled", "void", "rejected", "superseded"].includes(String(s ?? "").toLowerCase());

  if (yR?.data?.cruising_permit_expiry) add("cruising", { who: "Vessel", what: "Cruising permit", ref: null, date: yR.data.cruising_permit_expiry });
  for (const p of permitsR.data ?? []) {
    if (p.permit_type === "gate_pass" || dead(p.status)) continue; // gate passes aren't reliable dated papers
    add(`permit:${p.permit_type}`, { who: "Vessel", what: label(p.permit_type) || "Permit", ref: p.permit_number ?? null, date: p.expiry_date });
  }
  for (const d of docsR.data ?? []) {
    add(`doc:${d.doc_type ?? d.title}`, { who: "Vessel", what: d.title || label(d.doc_type) || "Document", ref: null, date: d.expiry_date });
  }
  for (const c of ismR.data ?? []) {
    if (dead(c.status)) continue;
    add(`ism:${c.certificate_type ?? c.title}`, { who: "Vessel", what: c.title || label(c.certificate_type) || "Certificate", ref: c.reference ?? null, date: c.expiry_date });
  }
  for (const c of crew) {
    const who = nameOf.get(c.id)!;
    if (c.passport_expiry_date) add(`pp:${c.id}`, { who, what: "Passport", ref: c.passport_number ?? null, date: c.passport_expiry_date });
    if (c.seamans_book_expiry) add(`sb:${c.id}`, { who, what: "Seaman's book", ref: null, date: c.seamans_book_expiry });
  }
  for (const d of crewDocsR.data ?? []) {
    add(`cdoc:${d.crew_member_id}:${d.doc_type ?? d.title}`, { who: nameOf.get(d.crew_member_id) ?? "Crew member", what: d.title || label(d.doc_type) || "Document", ref: null, date: d.expiry_date });
  }
  for (const t of trainingR.data ?? []) {
    if (dead(t.status)) continue;
    add(`cert:${t.crew_member_id}:${t.cert_type ?? t.certificate}`, { who: nameOf.get(t.crew_member_id) ?? "Crew member", what: t.certificate || label(t.cert_type) || "Certificate", ref: null, date: t.expiry_date });
  }
  for (const v of visasR.data ?? []) {
    add(`visa:${v.crew_member_id}`, { who: nameOf.get(v.crew_member_id) ?? "Crew member", what: v.visa_type ? `UAE visa (${v.visa_type})` : "UAE visa", ref: null, date: v.visa_expiry });
  }

  const due = [...latest.values()]
    .filter((i) => i.date >= floor && i.date <= horizon)
    .sort((a, b) => a.date.localeCompare(b.date) || a.who.localeCompare(b.who));
  const days = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  const groups = [
    { label: "Expired", tone: "#b91c1c", items: due.filter((i) => days(i.date) < 0) },
    { label: "Due within 30 days", tone: "#b45309", items: due.filter((i) => days(i.date) >= 0 && days(i.date) <= 30) },
    { label: "Due in 31–60 days", tone: "#07435E", items: due.filter((i) => days(i.date) > 30 && days(i.date) <= 60) },
    { label: "Due in 61–90 days", tone: "#07435E", items: due.filter((i) => days(i.date) > 60) },
  ];
  const when = (d: string) => { const n = days(d); return n < 0 ? `${-n} day${n === -1 ? "" : "s"} ago` : n === 0 ? "today" : `in ${n} day${n === 1 ? "" : "s"}`; };

  const section = (g: (typeof groups)[number]) => !g.items.length ? "" : `
    <h3 style="margin:22px 0 6px;font-size:14px;color:${g.tone}">${esc(g.label)} (${g.items.length})</h3>
    <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
      <tr style="background:#f1f5f9;text-align:left"><th>For</th><th>Document</th><th>Expiry</th><th></th></tr>
      ${g.items.map((i) => `<tr style="border-top:1px solid #e5e7eb"><td>${esc(i.who)}</td><td>${esc(i.what)}${i.ref ? ` <span style="color:#6b7280">· ${esc(i.ref)}</span>` : ""}</td><td>${esc(nice(i.date))}</td><td style="color:${g.tone}">${esc(when(i.date))}</td></tr>`).join("")}
    </table>`;
  const [expired, d30] = [groups[0].items.length, groups[1].items.length];

  const subject = `${vessel} — Document & permit expiries, ${nice(today)} (${expired} expired, ${d30} due within 30 days)`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f8fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <div style="max-width:660px;margin:0 auto;padding:24px 16px">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:24px">
      ${emailBrandLockup(`<span style="font-size:16px;font-weight:700;color:#07435E">JLS Yachts</span>`)}
      <h2 style="margin:16px 0 4px;font-size:18px;color:#07435E">${esc(vessel)} — Document &amp; permit expiries</h2>
      <p style="margin:0;color:#4b5563">As at ${esc(nice(today))}: <b>${expired}</b> expired, <b>${d30}</b> due within 30 days, <b>${due.length}</b> in the next 90 days in all — for the vessel and the crew on board or on leave.</p>
      ${due.length ? groups.map(section).join("") : `<p style="margin:18px 0 0">Nothing has expired and nothing falls due in the next 90 days.</p>`}
      <p style="margin:22px 0 0;font-size:12px;color:#6b7280">The list is attached as a PDF. Already renewed? Upload the new one in your Client Portal or send it to your JLS agent and it drops off this list. To change who receives this report, please contact your JLS agent.</p>
    </div>
    <p style="text-align:center;font-size:12px;color:#94a3b8;margin:14px 0 0">JLS Yachts LLC · Superyacht Middle East</p>
  </div></body></html>`;
  const text = `${vessel} — Document & permit expiries, ${nice(today)}\n${expired} expired, ${d30} due within 30 days, ${due.length} in the next 90 days.\n\n`
    + (groups.filter((g) => g.items.length).map((g) => `${g.label}:\n${g.items.map((i) => `- ${i.who}: ${i.what} — ${nice(i.date)} (${when(i.date)})`).join("\n")}`).join("\n\n")
      || "Nothing expired or due in the next 90 days.");

  const pdfRows = groups.flatMap((g) => g.items.map((i) => [g.label, i.who, i.what, i.ref ?? "—", nice(i.date), when(i.date)]));
  const pdf = await buildReportPdf(`Document & permit expiries — ${vessel} — ${nice(today)}`,
    ["Status", "For", "Document", "Reference", "Expiry", "When"], pdfRows, [2, 2.6, 3.2, 2, 1.6, 1.6]);

  return {
    subject, html, text,
    attachments: [{ filename: `Expiries - ${fileSafe(vessel)} - ${today}.pdf`, contentBase64: b64(pdf), contentType: "application/pdf" }],
    summary: `${expired} expired · ${d30} within 30 days · ${due.length} in 90 days`,
  };
}
