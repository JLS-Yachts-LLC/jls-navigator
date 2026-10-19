/**
 * Weekly operations report — what JLS did for each vessel last week, what is
 * planned for the week ahead, and what needs attention (Mike, 19 Oct 2026).
 *
 * A summary at the top, then one section per team, each grouped by yacht:
 *   Agency    — GDRFA entry permit, FMA (cruising) permit and DMA permit
 *   Crew Care — sign-ons, sign-offs and transfers between vessels
 *   Visas     — applications submitted / approved, in progress, expiring
 *
 * Two editions from the same builder:
 *   • one vessel — an Automated Report a vessel can be opted in to
 *     (report key "weekly_operations"); every permit line is always shown
 *   • the fleet  — the internal Monday email (automation
 *     "weekly-operations-report"); a vessel appears in a section only when
 *     there's something to say about it there
 *
 * "Last week" is Monday–Sunday before this week, in Dubai's calendar; "the
 * week ahead" is this Monday–Sunday. Read-only.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emailBrandLockup } from "@/lib/email/brand-mark";
import { fetchAllRows } from "@/lib/fetch-all";
import { currentPermits, permitLabel, daysBetween, todayUae, type ExpiryPermitRow } from "@/lib/permit-expiry";
import { buildReportPdf } from "@/routes/api.movements.reports";
import type { BuiltReport } from "./build.server";

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const fileSafe = (s: string) => s.replace(/[^\w .-]+/g, "").trim() || "Vessel";
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); return addDays(iso, -((d.getUTCDay() + 6) % 7)); };
const nice = (iso: string | null | undefined) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const short = (iso: string | null | undefined) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }) : "—";
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const dayOf = (ts: string | null | undefined) => (ts ? String(ts).slice(0, 10) : null);

/** The three kinds of permit the Agency section reports on. */
const KINDS = [
  { key: "entry", label: "Entry permit", types: ["exit_entry"] },
  { key: "fma", label: "FMA permit", types: ["cruising_mothership", "cruising_tenders"] },
  { key: "dma", label: "DMA permit", types: ["dma"] },
] as const;
type KindKey = (typeof KINDS)[number]["key"];
const kindOf = (p: { permit_type: string; dma_phase: string | null }): KindKey | null => {
  if (p.permit_type === "exit_entry") return (p.dma_phase ?? "").toLowerCase() === "entry" ? "entry" : null;
  if (p.permit_type === "dma") return "dma";
  if (p.permit_type === "cruising_mothership" || p.permit_type === "cruising_tenders") return "fma";
  return null;
};
/** A pending permit older than this is an abandoned row from the old lists, not work in progress. */
const PENDING_FRESH_DAYS = 90;
/** Expiries this close (or already past) are flagged. */
const PERMIT_WARN_DAYS = 60;
const VISA_WARN_DAYS = 30;
/** A sign-off and a sign-on on another vessel this close together is one transfer. */
const TRANSFER_DAYS = 7;

type Tone = "bad" | "warn" | "ok" | "info";
const TONE: Record<Tone, string> = { bad: "#b91c1c", warn: "#b45309", ok: "#047857", info: "#07435E" };
/** One finding: a line in the email and a row in the PDF. */
type Line = { what: string; detail: string; date: string | null; status: string; tone: Tone };
type Group = { done: Line[]; ahead: Line[]; attention: Line[]; status?: Line[] };
const emptyGroup = (): Group => ({ done: [], ahead: [], attention: [] });
const hasAny = (g: Group | undefined) => !!g && (g.done.length + g.ahead.length + g.attention.length + (g.status?.length ?? 0)) > 0;

const MOVE_SELECT = `id, crew_member_id, yacht_id, event_type, event_date, status, airline, flight_number,
  departure_airport, arrival_airport, pickup_required, driver_assigned, driver_name,
  crew_members ( full_name, first_name, last_name, rank )`;

/** A weekly report covers last week and this week; a monthly one, last month and this month. */
export type OpsPeriod = "week" | "month";

/** The two windows a report covers, in Dubai's calendar. */
function windows(today: string, period: OpsPeriod) {
  if (period === "week") {
    const aheadFrom = mondayOf(today);
    return { doneFrom: addDays(aheadFrom, -7), doneTo: addDays(aheadFrom, -1), aheadFrom, aheadTo: addDays(aheadFrom, 6) };
  }
  const aheadFrom = `${today.slice(0, 8)}01`;
  const next = new Date(`${aheadFrom}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  const prev = new Date(`${aheadFrom}T00:00:00Z`); prev.setUTCMonth(prev.getUTCMonth() - 1);
  return { doneFrom: prev.toISOString().slice(0, 10), doneTo: addDays(aheadFrom, -1), aheadFrom, aheadTo: addDays(next.toISOString().slice(0, 10), -1) };
}
const monthName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * One vessel's report is written for the client: only that vessel, no internal
 * working notes (driver allocation, missing flight details). The fleet edition
 * is internal.
 */
export async function buildWeeklyOperations(opts: { yachtIds: string[] | "all"; staffCopy?: boolean; period?: OpsPeriod }): Promise<BuiltReport> {
  const sb = supabaseAdmin as any;
  const single = opts.yachtIds !== "all" && opts.yachtIds.length === 1;
  const period: OpsPeriod = single ? opts.period ?? "week" : "week";
  const monthly = period === "month";
  const today = todayUae();
  const { doneFrom, doneTo, aheadFrom, aheadTo } = windows(today, period);
  const L = monthly
    ? { done: `Completed in ${monthName(doneFrom)}`, ahead: `Planned for ${monthName(aheadFrom)}`, last: "last month", next: "this month", name: "Monthly" }
    : { done: "Completed last week", ahead: "Planned for this week", last: "last week", next: "this week", name: "Weekly" };
  const pendingFloor = new Date(Date.now() - PENDING_FRESH_DAYS * 86_400_000).toISOString();
  const inDone = (d: string | null) => !!d && d >= doneFrom && d <= doneTo;
  const inAhead = (d: string | null) => !!d && d >= aheadFrom && d <= aheadTo;

  // ── vessels ────────────────────────────────────────────────────────────────
  const yq = () => {
    let q = sb.from("yachts").select("id, vessel_name, status, archive, cruising_permit_expiry").order("vessel_name");
    return opts.yachtIds === "all" ? q.eq("archive", false) : q.in("id", opts.yachtIds);
  };
  const { data: yachtRows, error: yErr } = await fetchAllRows(yq);
  if (yErr) throw new Error(yErr.message);
  const yachts = (yachtRows ?? []) as Array<{ id: string; vessel_name: string | null; status: string | null; cruising_permit_expiry: string | null }>;
  if (!yachts.length) throw new Error("Vessel not found");
  const ids = new Set(yachts.map((y) => y.id));
  const otherNames = new Map<string, string>();
  const vesselName = (id: string | null | undefined) =>
    yachts.find((y) => y.id === id)?.vessel_name ?? (id && otherNames.get(id)) ?? "another vessel";
  const scope = <T,>(q: any) => (opts.yachtIds === "all" ? q : q.in("yacht_id", opts.yachtIds)) as T;

  // ── fetch ──────────────────────────────────────────────────────────────────
  const [permitsR, movesR, visasR, crewR] = await Promise.all([
    fetchAllRows(() => scope(sb.from("permits")
      .select("id, yacht_id, permit_type, permit_number, issuing_authority, dma_phase, issue_date, expiry_date, status, created_at")
      .in("permit_type", ["exit_entry", "dma", "cruising_mothership", "cruising_tenders"]).neq("status", "cancelled").order("id"))),
    // Fleet-wide on purpose, even for one vessel: a transfer's other half is on another vessel.
    fetchAllRows(() => sb.from("crew_signon_events").select(MOVE_SELECT)
      .gte("event_date", addDays(doneFrom, -TRANSFER_DAYS)).lte("event_date", addDays(aheadTo, TRANSFER_DAYS))
      .neq("status", "cancelled").order("event_date").order("id")),
    fetchAllRows(() => scope(sb.from("visa_applications")
      .select("id, yacht_id, crew_member_id, given_name, surname, visa_type, status, submitted_at, approved_at, updated_at, visa_expiry")
      .neq("status", "cancelled").order("id"))),
    fetchAllRows(() => scope(sb.from("crew_members").select("id, yacht_id, full_name, first_name, last_name, rank, status").order("id"))),
  ]);
  for (const r of [permitsR, movesR, visasR, crewR]) if (r.error) throw new Error(r.error.message);

  const crewName = new Map<string, string>();
  for (const c of crewR.data as any[]) crewName.set(c.id, c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Crew member");
  const nameOfMove = (m: any) => m.crew_members?.full_name
    || `${m.crew_members?.first_name ?? ""} ${m.crew_members?.last_name ?? ""}`.trim() || crewName.get(m.crew_member_id) || "Crew member";

  const agency = new Map<string, Group>();
  const crewCare = new Map<string, Group>();
  const visas = new Map<string, Group>();
  const g = (m: Map<string, Group>, id: string) => { let x = m.get(id); if (!x) { x = emptyGroup(); m.set(id, x); } return x; };

  // ── Agency ─────────────────────────────────────────────────────────────────
  const permits = permitsR.data as any[];
  for (const p of permits) {
    const kind = kindOf(p);
    if (!kind || !p.yacht_id || !ids.has(p.yacht_id)) continue;
    const label = permitLabel(p.permit_type, p.issuing_authority, p.dma_phase);
    const ref = p.permit_number ? ` · ${p.permit_number}` : "";
    if (inDone(p.issue_date)) {
      g(agency, p.yacht_id).done.push({ what: label, detail: `Issued${ref}${p.expiry_date ? ` · valid to ${nice(p.expiry_date)}` : ""}`, date: p.issue_date, status: "Issued", tone: "ok" });
    }
    if (p.status === "pending" && (p.created_at ?? "") >= pendingFloor) {
      const applied = dayOf(p.created_at);
      g(agency, p.yacht_id).ahead.push({ what: label, detail: `Application in progress${ref} · opened ${short(applied)}`, date: applied, status: "In progress", tone: "info" });
    }
  }
  const current = currentPermits(permits as ExpiryPermitRow[], yachts.map((y) => ({ id: y.id, cruising_permit_expiry: y.cruising_permit_expiry, status: y.status })), today, { showExpiredForDays: 60 });
  const currentBy = new Map<string, (typeof current)[number]>();
  for (const c of current) {
    const kind = c.permitType === "exit_entry" ? "entry" : c.permitType === "dma" ? "dma" : c.permitType.startsWith("cruising") ? "fma" : null;
    if (!kind) continue;
    const key = `${c.yachtId}|${kind}`;
    const had = currentBy.get(key);
    if (!had || c.expiryDate > had.expiryDate) currentBy.set(key, c); // mothership vs tenders: the later one
    if (c.days <= PERMIT_WARN_DAYS) {
      g(agency, c.yachtId).attention.push({
        what: c.label, detail: c.days < 0 ? `Expired ${-c.days} day${c.days === -1 ? "" : "s"} ago — renew` : `Expires in ${plural(c.days, "day")}${c.days <= 30 ? " — start the renewal" : ""}`,
        date: c.expiryDate, status: c.days < 0 ? "Expired" : `${c.days}d left`, tone: c.days <= 7 ? "bad" : "warn",
      });
    }
  }
  // The status line per permit: every vessel in the one-vessel edition, and in the
  // fleet edition only for vessels already in the section.
  const pendingBy = new Set(permits.filter((p) => p.status === "pending" && (p.created_at ?? "") >= pendingFloor).map((p) => `${p.yacht_id}|${kindOf(p)}`));
  const statusLines = (yachtId: string): Line[] => KINDS.map((k) => {
    const c = currentBy.get(`${yachtId}|${k.key}`);
    if (c) {
      return {
        what: k.label, detail: `${c.label}${c.permitNumber ? ` · ${c.permitNumber}` : ""}${c.fromVesselRecord ? " (from the vessel record)" : ""}`,
        date: c.expiryDate, status: c.days < 0 ? "Expired" : `Valid · ${c.days}d left`, tone: c.days < 0 ? "bad" : c.days <= PERMIT_WARN_DAYS ? "warn" : "ok",
      };
    }
    const pending = pendingBy.has(`${yachtId}|${k.key}`);
    return { what: k.label, detail: pending ? "Application in progress" : "None on file", date: null, status: pending ? "In progress" : "—", tone: "info" as Tone };
  });
  for (const y of yachts) if (single || hasAny(agency.get(y.id))) g(agency, y.id).status = statusLines(y.id);
  // Insurance expiry will join the Agency section here once vessel insurance is
  // recorded with an expiry date (it isn't yet: no vessel has one on file).

  // ── Crew Care ──────────────────────────────────────────────────────────────
  const moves = movesR.data as any[];
  // Pair transfers: a sign-off from one vessel and a sign-on to another within a week.
  const pairedWith = new Map<string, any>();
  const offs = moves.filter((m) => m.event_type === "sign_off");
  for (const on of moves.filter((m) => m.event_type === "sign_on")) {
    const off = offs.find((o) => !pairedWith.has(o.id) && o.crew_member_id === on.crew_member_id && o.yacht_id !== on.yacht_id
      && Math.abs(daysBetween(o.event_date, on.event_date)) <= TRANSFER_DAYS);
    if (off) { pairedWith.set(off.id, on); pairedWith.set(on.id, off); }
  }
  // The other vessel in a transfer may be outside this report (one-vessel edition).
  const otherIds = [...new Set([...pairedWith.values()].map((m) => m.yacht_id).filter((id) => id && !ids.has(id)))];
  if (otherIds.length) {
    const { data: others } = await sb.from("yachts").select("id, vessel_name").in("id", otherIds);
    for (const o of (others ?? []) as any[]) otherNames.set(o.id, o.vessel_name);
  }
  const flight = (m: any) => [m.airline, m.flight_number].filter(Boolean).join(" ");
  const route = (m: any) => [m.departure_airport, m.arrival_airport].filter(Boolean).join(" → ");
  for (const m of moves) {
    if (!m.yacht_id || !ids.has(m.yacht_id)) continue;
    const past = inDone(m.event_date), next = inAhead(m.event_date);
    if (!past && !next) continue;
    const other = pairedWith.get(m.id);
    const what = other
      ? (m.event_type === "sign_on" ? `Transfer in — from ${vesselName(other.yacht_id)}` : `Transfer out — to ${vesselName(other.yacht_id)}`)
      : m.event_type === "sign_off" ? "Sign-off" : "Sign-on";
    const rank = m.crew_members?.rank ? ` (${m.crew_members.rank})` : "";
    const travel = [flight(m), route(m)].filter(Boolean).join(" · ");
    const line: Line = { what, detail: `${nameOfMove(m)}${rank}${travel ? ` · ${travel}` : ""}`, date: m.event_date, status: past ? "Done" : (m.status ?? "Planned"), tone: past ? "ok" : "info" };
    const grp = g(crewCare, m.yacht_id);
    (past ? grp.done : grp.ahead).push(line);
    if (next && !single) { // internal working notes — not for the client's copy
      const gaps: string[] = [];
      if (!m.flight_number && !other) gaps.push("no flight details");
      if (m.pickup_required && !m.driver_assigned && !m.driver_name) gaps.push("pickup needed, no driver");
      if (gaps.length) grp.attention.push({ ...line, status: "Missing details", tone: "warn", detail: `${nameOfMove(m)} — ${gaps.join(", ")}` });
    }
  }

  // ── Visas ──────────────────────────────────────────────────────────────────
  const visaRows = visasR.data as any[];
  const visaName = (v: any) => crewName.get(v.crew_member_id) || [v.given_name, v.surname].filter(Boolean).join(" ") || "Crew member";
  const visaType = (v: any) => (v.visa_type ? `UAE visa (${v.visa_type})` : "UAE visa");
  const visaFloor = addDays(today, -60), visaHorizon = addDays(today, VISA_WARN_DAYS);
  const newest = new Map<string, any>();
  for (const v of visaRows) {
    if (!v.yacht_id || !ids.has(v.yacht_id)) continue;
    const status = String(v.status ?? "").toLowerCase();
    const submitted = dayOf(v.submitted_at), approved = dayOf(v.approved_at);
    if (inDone(approved)) {
      g(visas, v.yacht_id).done.push({ what: "Visa approved", detail: `${visaName(v)} · ${visaType(v)}${v.visa_expiry ? ` · valid to ${nice(v.visa_expiry)}` : ""}`, date: approved, status: "Approved", tone: "ok" });
    } else if (inDone(submitted)) {
      g(visas, v.yacht_id).done.push({ what: "Visa submitted", detail: `${visaName(v)} · ${visaType(v)}`, date: submitted, status: "Submitted", tone: "info" });
    }
    if ((status === "draft" || status === "submitted") && (v.updated_at ?? "") >= pendingFloor) {
      g(visas, v.yacht_id).ahead.push({
        what: status === "draft" ? "Visa application — draft" : "Visa application — awaiting approval",
        detail: `${visaName(v)} · ${visaType(v)}${submitted ? ` · submitted ${short(submitted)}` : ""}`, date: submitted ?? dayOf(v.updated_at), status: status === "draft" ? "Draft" : "Submitted", tone: "info",
      });
    }
    if (v.crew_member_id && v.visa_expiry) {
      const had = newest.get(v.crew_member_id);
      if (!had || v.visa_expiry > had.visa_expiry) newest.set(v.crew_member_id, v);
    }
  }
  // Expiring visas — only for crew still with the vessel, and only their newest
  // visa (a renewal clears it).
  for (const c of crewR.data as any[]) {
    if (!["active", "on_leave"].includes(String(c.status ?? "").toLowerCase()) || !c.yacht_id || !ids.has(c.yacht_id)) continue;
    const v = newest.get(c.id);
    if (!v || v.visa_expiry < visaFloor || v.visa_expiry > visaHorizon) continue;
    const days = daysBetween(today, v.visa_expiry);
    g(visas, c.yacht_id).attention.push({
      what: days < 0 ? "Visa expired" : "Visa expiring", detail: `${visaName(v)} · ${visaType(v)}${String(c.status).toLowerCase() === "on_leave" ? " · on leave" : ""}`,
      date: v.visa_expiry, status: days < 0 ? `Expired ${-days}d ago` : `${days}d left`, tone: days <= 7 ? "bad" : "warn",
    });
  }

  // ── assemble ───────────────────────────────────────────────────────────────
  const order = yachts.map((y) => y.id);
  const sortLines = (l: Line[]) => l.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.detail.localeCompare(b.detail));
  for (const m of [agency, crewCare, visas]) for (const grp of m.values()) { sortLines(grp.done); sortLines(grp.ahead); sortLines(grp.attention); }
  const sections = [
    { key: "agency", title: "Agency", sub: "Entry, FMA and DMA permits", groups: agency },
    { key: "crew", title: "Crew Care", sub: "Sign-ons, sign-offs and transfers", groups: crewCare },
    { key: "visas", title: "Visas", sub: "Applications and expiring visas", groups: visas },
  ] as const;
  const all = (m: Map<string, Group>, k: "done" | "ahead" | "attention") => [...m.values()].flatMap((x) => x[k]);
  const count = (m: Map<string, Group>, k: "done" | "ahead" | "attention", re?: RegExp) => all(m, k).filter((l) => !re || re.test(l.what)).length;
  const attentionTotal = sections.reduce((n, s) => n + all(s.groups, "attention").length, 0);

  const stats = {
    agency: `${plural(count(agency, "done"), "permit")} issued · ${count(agency, "ahead")} in progress · ${count(agency, "attention")} expiring or expired`,
    crew: `Last week ${count(crewCare, "done", /^Sign-on/)} on · ${count(crewCare, "done", /^Sign-off/)} off · ${count(crewCare, "done", single ? /^Transfer/ : /^Transfer in/)} transfers — this week ${count(crewCare, "ahead")} planned`,
    visas: `${count(visas, "done", /approved/)} approved · ${count(visas, "done", /submitted/)} submitted · ${count(visas, "ahead")} in progress · ${count(visas, "attention")} expiring or expired`,
  };
  // The most urgent items fleet-wide, for the summary.
  const urgent = sections.flatMap((s) => [...s.groups.entries()].flatMap(([yid, grp]) => grp.attention.map((l) => ({ ...l, section: s.title, vessel: vesselName(yid) }))))
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "bad" ? -1 : 1) || (a.date ?? "").localeCompare(b.date ?? ""));

  const title = single ? `${vesselName(order[0])} — Weekly operations report` : "Weekly operations report";
  const weekLine = `Last week ${short(doneFrom)}–${nice(doneTo)} · week ahead ${short(aheadFrom)}–${nice(aheadTo)}`;
  const subject = `${title}, w/c ${nice(aheadFrom)}${attentionTotal ? ` (${plural(attentionTotal, "item")} need${attentionTotal === 1 ? "s" : ""} attention)` : ""}`;

  const lineHtml = (l: Line) => `<tr style="border-top:1px solid #e5e7eb">
      <td style="padding:5px 6px;white-space:nowrap;color:#4b5563">${esc(l.date ? short(l.date) : "")}</td>
      <td style="padding:5px 6px"><b>${esc(l.what)}</b><br><span style="color:#4b5563">${esc(l.detail)}</span></td>
      <td style="padding:5px 6px;white-space:nowrap;color:${TONE[l.tone]};text-align:right">${esc(l.status)}</td></tr>`;
  const block = (label: string, lines: Line[] | undefined) => !lines?.length ? "" : `
      <div style="margin:8px 0 2px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#64748b">${esc(label)}</div>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">${lines.map(lineHtml).join("")}</table>`;
  const yachtHtml = (yid: string, grp: Group) => `
    <div style="margin:14px 0 0;padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px">
      <div style="font-size:14px;font-weight:700;color:#07435E">${esc(vesselName(yid))}</div>
      ${block("Status", grp.status)}${block("Needs attention", grp.attention)}${block("Done last week", grp.done)}${block("Week ahead", grp.ahead)}
    </div>`;
  const sectionHtml = (s: (typeof sections)[number]) => {
    const list = order.filter((id) => hasAny(s.groups.get(id)) || (single && s.key !== "agency"));
    const body = list.map((id) => hasAny(s.groups.get(id))
      ? yachtHtml(id, s.groups.get(id)!)
      : `<p style="margin:10px 0 0;color:#6b7280">Nothing for ${esc(vesselName(id))} last week or this week.</p>`).join("");
    return `<h2 style="margin:28px 0 2px;font-size:17px;color:#07435E;border-bottom:2px solid #07435E;padding-bottom:4px">${esc(s.title)}
        <span style="font-size:12px;font-weight:400;color:#64748b">· ${esc(s.sub)}</span></h2>
      ${body || `<p style="margin:10px 0 0;color:#6b7280">Nothing to report last week or this week.</p>`}`;
  };
  const summaryRow = (label: string, text: string) =>
    `<tr><td style="padding:4px 8px 4px 0;font-weight:700;color:#07435E;white-space:nowrap;vertical-align:top">${esc(label)}</td><td style="padding:4px 0;color:#1f2937">${esc(text)}</td></tr>`;
  const base = process.env.VITE_APP_URL ?? "https://polaris.jlsyachts.com";
  const footer = opts.staffCopy || !single
    ? `Built from Polaris on ${esc(nice(today))}. The full list is attached as a PDF. Change who receives this: <a href="${base}/polaris-redesign?screen=vessel-report-automations">Automated Reports</a> / Developer → Automations.`
    : "The full list is attached as a PDF. To change who receives this report, please contact your JLS agent.";

  const html = `<!doctype html><html><body style="margin:0;background:#f5f8fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <div style="max-width:720px;margin:0 auto;padding:24px 16px">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:24px">
      ${emailBrandLockup(`<span style="font-size:16px;font-weight:700;color:#07435E">JLS Yachts</span>`)}
      <h1 style="margin:16px 0 2px;font-size:20px;color:#07435E">${esc(title)}</h1>
      <p style="margin:0;color:#4b5563;font-size:13px">${esc(weekLine)}${single ? "" : ` · ${plural(new Set(sections.flatMap((s) => [...s.groups.keys()].filter((k) => hasAny(s.groups.get(k))))).size, "vessel")} with activity`}</p>

      <div style="margin:18px 0 0;padding:14px 16px;background:#f1f5f9;border-radius:10px">
        <div style="font-size:15px;font-weight:700;color:#07435E;margin-bottom:6px">Summary</div>
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px">
          ${summaryRow("Agency", stats.agency)}${summaryRow("Crew Care", stats.crew)}${summaryRow("Visas", stats.visas)}
        </table>
        ${urgent.length ? `<div style="margin:12px 0 4px;font-size:13px;font-weight:700;color:#b91c1c">Needs attention (${urgent.length})</div>
        <ul style="margin:0;padding-left:18px;font-size:13px">${urgent.slice(0, 12).map((u) => `<li style="margin:2px 0"><b>${esc(u.vessel)}</b> — ${esc(u.what)}: ${esc(u.detail)} <span style="color:${TONE[u.tone]}">(${esc(u.status)})</span></li>`).join("")}
        ${urgent.length > 12 ? `<li style="color:#6b7280">…and ${urgent.length - 12} more below.</li>` : ""}</ul>`
        : `<p style="margin:10px 0 0;font-size:13px;color:#047857">Nothing needs attention.</p>`}
      </div>

      ${sections.map(sectionHtml).join("")}
      <p style="margin:24px 0 0;font-size:12px;color:#6b7280">${footer}</p>
    </div>
    <p style="text-align:center;font-size:12px;color:#94a3b8;margin:14px 0 0">JLS Yachts LLC · Superyacht Middle East</p>
  </div></body></html>`;

  const textLines = (label: string, l: Line[] | undefined) => (l?.length ? `  ${label}:\n${l.map((x) => `    - ${x.date ? short(x.date) + " " : ""}${x.what}: ${x.detail} [${x.status}]`).join("\n")}\n` : "");
  const text = `${title}\n${weekLine}\n\nSUMMARY\nAgency: ${stats.agency}\nCrew Care: ${stats.crew}\nVisas: ${stats.visas}\n`
    + (urgent.length ? `\nNeeds attention:\n${urgent.map((u) => `- ${u.vessel} — ${u.what}: ${u.detail} (${u.status})`).join("\n")}\n` : "\nNothing needs attention.\n")
    + sections.map((s) => `\n${s.title.toUpperCase()}\n` + (order.filter((id) => hasAny(s.groups.get(id))).map((id) => {
      const grp = s.groups.get(id)!;
      return `${vesselName(id)}\n${textLines("Status", grp.status)}${textLines("Needs attention", grp.attention)}${textLines("Done last week", grp.done)}${textLines("Week ahead", grp.ahead)}`;
    }).join("\n") || "Nothing to report.\n")).join("");

  const pdfRows: string[][] = [];
  for (const s of sections) for (const id of order) {
    const grp = s.groups.get(id);
    if (!hasAny(grp)) continue;
    const push = (phase: string, l: Line[] | undefined) => { for (const x of l ?? []) pdfRows.push([s.title, vesselName(id), `${phase}: ${x.what}`, x.detail, x.date ? nice(x.date) : "—", x.status]); };
    push("Status", grp!.status); push("Attention", grp!.attention); push("Done", grp!.done); push("Ahead", grp!.ahead);
  }
  if (!pdfRows.length) pdfRows.push(["—", "—", "Nothing to report", "", "", ""]);
  const pdf = await buildReportPdf(`${title} — w/c ${nice(aheadFrom)}`,
    ["Section", "Vessel", "Item", "Detail", "Date", "Status"], pdfRows, [1.4, 2.2, 2.8, 4.6, 1.5, 1.6]);
  const who = single ? fileSafe(vesselName(order[0])) : "Fleet";

  return {
    subject, html, text,
    attachments: [{ filename: `Weekly operations - ${who} - w-c ${aheadFrom}.pdf`, contentBase64: b64(pdf), contentType: "application/pdf" }],
    summary: `${count(agency, "done")} permits issued · ${count(crewCare, "done")} movements last week · ${count(crewCare, "ahead")} this week · ${count(visas, "done")} visa updates · ${attentionTotal} need attention`,
  };
}

/** The internal Monday email — the whole fleet, to the automation's recipients. */
export async function runWeeklyOperationsReport(recipients: string[]): Promise<{ sent: number; summary: string }> {
  const to = [...new Set(recipients.map((e) => e.trim().toLowerCase()).filter((e) => /.+@.+\..+/.test(e)))];
  if (!to.length) return { sent: 0, summary: "no recipients" };
  const built = await buildWeeklyOperations({ yachtIds: "all", staffCopy: true });
  const { sendGraphEmailWithAttachments } = await import("@/lib/graph-mail.server");
  await sendGraphEmailWithAttachments({ to, subject: built.subject, html: built.html, attachments: built.attachments });
  return { sent: to.length, summary: built.summary };
}
