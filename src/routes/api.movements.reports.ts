/**
 * Crew movement / immigration reports — SOSO Phase 4.
 *
 *   GET /api/reports/crew-movement   — all movements (filters: vessel_id, from, to,
 *                                       crew_id, nationality, movement_type)
 *   GET /api/reports/weekly-sign-on  — sign-ons for a week (?week=YYYY-MM-DD Monday)
 *   GET /api/reports/weekly-sign-off — sign-offs for a week
 *   GET /api/reports/crew-onboard    — crew currently onboard (latest event = sign-on)
 *   GET /api/reports/crew-arriving    — confirmed upcoming sign-ons
 *   GET /api/reports/crew-departing   — confirmed upcoming sign-offs
 *
 * Each supports ?format=csv | pdf (default JSON). Reads crew_signon_events joined
 * to crew_members + yachts. Gated by crew_immigration view access.
 */
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { requireAccess } from '@/lib/auth/requireAccess.server'
import { sendEmail } from '@/lib/ses.server'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function csvResponse(rows: string[][], filename: string): Response {
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
  return new Response(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` } })
}
function pdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(bytes as unknown as BodyInit, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` } })
}

async function buildReportPdf(title: string, headers: string[], rows: string[][], weights: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const white = rgb(1, 1, 1), navy = rgb(0.08, 0.18, 0.35), slate = rgb(0.35, 0.45, 0.55)
  const black = rgb(0, 0, 0), bgRow = rgb(0.96, 0.97, 0.98)
  const pageW = 842, pageH = 595 // A4 landscape (wide movement tables)
  const marginX = 32
  const tableW = pageW - marginX * 2
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  const colW = weights.map((w) => (w / totalWeight) * tableW)
  const addPage = () => {
    const p = doc.addPage([pageW, pageH])
    p.drawRectangle({ x: 0, y: pageH - 52, width: pageW, height: 52, color: navy })
    p.drawText('JLS YACHTS', { x: marginX, y: pageH - 22, size: 13, font: bold, color: white })
    p.drawText(title, { x: marginX, y: pageH - 38, size: 9, font: reg, color: rgb(0.7, 0.8, 0.9) })
    const gen = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    p.drawText(`Generated: ${gen}`, { x: pageW - 180, y: pageH - 22, size: 8, font: reg, color: rgb(0.7, 0.8, 0.9) })
    p.drawText(`${rows.length} record${rows.length === 1 ? '' : 's'}`, { x: pageW - 180, y: pageH - 36, size: 8, font: reg, color: rgb(0.7, 0.8, 0.9) })
    p.drawText('JLS Yachts — Confidential', { x: marginX, y: 10, size: 7, font: reg, color: slate })
    return p
  }
  const rowH = 18, headerH = 20
  const drawHeaders = (pg: ReturnType<typeof doc.addPage>, startY: number) => {
    pg.drawRectangle({ x: marginX, y: startY - headerH + 4, width: tableW, height: headerH, color: rgb(0.2, 0.35, 0.55) })
    let cx = marginX
    headers.forEach((h, i) => { pg.drawText(h, { x: cx + 4, y: startY - 8, size: 8, font: bold, color: white }); cx += colW[i] })
    return startY - headerH
  }
  let page = addPage()
  let y = drawHeaders(page, pageH - 68)
  rows.forEach((r, idx) => {
    if (y < 40) { page = addPage(); y = drawHeaders(page, pageH - 68) }
    page.drawRectangle({ x: marginX, y: y - rowH + 4, width: tableW, height: rowH, color: idx % 2 === 0 ? bgRow : white })
    let cx = marginX
    r.forEach((val, i) => {
      let display = val ?? ''
      while (display.length > 1 && reg.widthOfTextAtSize(display, 8) > colW[i] - 8) display = display.slice(0, -1)
      if (display !== (val ?? '')) display = display.slice(0, -1) + '…'
      page.drawText(display, { x: cx + 4, y: y - 8, size: 8, font: reg, color: black })
      cx += colW[i]
    })
    y -= rowH
  })
  return doc.save()
}

const SELECT = `id, crew_member_id, yacht_id, event_type, event_date, port, status,
  airline, flight_number, departure_airport, arrival_airport, departure_datetime, arrival_datetime,
  pickup_required, pickup_time, crew_contact_number, driver_name, week_commencing,
  crew_members ( full_name, first_name, last_name, nationality, rank ),
  yachts ( vessel_name )`

// ── row formatters ──────────────────────────────────────────────────────────
const nm = (a: any) => a.crew_members?.full_name || `${a.crew_members?.first_name ?? ''} ${a.crew_members?.last_name ?? ''}`.trim() || '—'
const vs = (a: any) => a.yachts?.vessel_name ?? '—'
const flt = (a: any) => [a.airline, a.flight_number].filter(Boolean).join(' ') || '—'
const route = (a: any) => [a.departure_airport, a.arrival_airport].filter(Boolean).join(' → ') || '—'
const d = (x: any) => (x ? new Date(x).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const dt = (x: any) => (x ? new Date(x).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
const pick = (a: any) => (a.pickup_required ? (a.pickup_time ? dt(a.pickup_time) : 'Yes') : 'No')

function mondayOf(dateStr?: string | null): string {
  const base = dateStr ? new Date(dateStr) : new Date()
  const day = (base.getUTCDay() + 6) % 7 // 0 = Monday
  base.setUTCDate(base.getUTCDate() - day)
  return base.toISOString().split('T')[0]
}
function addDaysStr(iso: string, n: number): string {
  const x = new Date(iso); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().split('T')[0]
}

export async function movementReportsHandler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const access = await requireAccess(request, { module: 'crew_immigration', level: 'view' })
  if (!access.ok) return access.response

  const sb = admin()
  const format = url.searchParams.get('format')
  const path = url.pathname
  const today = new Date().toISOString().split('T')[0]

  const out = (title: string, headers: string[], weights: number[], rows: string[][], data: any[], file: string) => {
    if (format === 'csv') return csvResponse([headers, ...rows], `${file}.csv`)
    if (format === 'pdf') return buildReportPdf(title, headers, rows, weights).then((b) => pdfResponse(b, `${file}.pdf`))
    return json({ title, total: data.length, rows: data })
  }

  // ── crew-movement (filterable) ──────────────────────────────────────────────
  if (path.endsWith('/crew-movement')) {
    let q = sb.from('crew_signon_events').select(SELECT).order('event_date', { ascending: false })
    const vessel = url.searchParams.get('vessel_id')
    const crewId = url.searchParams.get('crew_id')
    const mtype = url.searchParams.get('movement_type') // sign_on | sign_off
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    if (vessel) q = q.eq('yacht_id', vessel)
    if (crewId) q = q.eq('crew_member_id', crewId)
    if (mtype) q = q.eq('event_type', mtype)
    if (from) q = q.gte('event_date', from)
    if (to) q = q.lte('event_date', to)
    const { data, error } = await q
    if (error) return json({ error: 'Report fetch failed' }, 500)
    let rows = (data ?? []) as any[]
    const nat = url.searchParams.get('nationality')
    if (nat) rows = rows.filter((a) => (a.crew_members?.nationality ?? '').toLowerCase() === nat.toLowerCase())
    const body = rows.map((a) => [d(a.event_date), a.event_type === 'sign_off' ? 'Sign Off' : 'Sign On', nm(a), vs(a), flt(a), route(a), a.port ?? '—', pick(a), a.status ?? '—'])
    return out('Crew Movement Report', ['Date', 'Type', 'Crew', 'Vessel', 'Flight', 'Route', 'Port', 'Pickup', 'Status'], [2, 1.6, 3, 2.6, 2, 2.2, 2, 1.8, 1.6], body, rows, 'crew-movement-report')
  }

  // ── weekly sign-on / sign-off ───────────────────────────────────────────────
  const weeklyOn = path.endsWith('/weekly-sign-on')
  const weeklyOff = path.endsWith('/weekly-sign-off')
  if (weeklyOn || weeklyOff) {
    const monday = mondayOf(url.searchParams.get('week'))
    const sunday = addDaysStr(monday, 6)
    const { data, error } = await sb.from('crew_signon_events').select(SELECT)
      .eq('event_type', weeklyOn ? 'sign_on' : 'sign_off')
      .gte('event_date', monday).lte('event_date', sunday)
      .order('event_date', { ascending: true })
    if (error) return json({ error: 'Report fetch failed' }, 500)
    const rows = (data ?? []) as any[]
    const verb = weeklyOn ? 'Sign On' : 'Sign Off'
    const body = rows.map((a) => [nm(a), vs(a), d(a.event_date), flt(a), route(a), pick(a), a.crew_contact_number ?? '—'])
    return out(`Weekly ${verb} — w/c ${d(monday)}`, ['Crew', 'Vessel', 'Date', 'Flight', 'Route', 'Pickup', 'Contact'], [3, 2.6, 2, 2, 2.2, 1.8, 2], body, rows, `weekly-${weeklyOn ? 'sign-on' : 'sign-off'}-${monday}`)
  }

  // ── crew currently onboard (latest movement = sign-on) ───────────────────────
  if (path.endsWith('/crew-onboard')) {
    const { data, error } = await sb.from('crew_signon_events').select(SELECT).order('event_date', { ascending: false })
    if (error) return json({ error: 'Report fetch failed' }, 500)
    const latest = new Map<string, any>()
    for (const a of (data ?? []) as any[]) if (!latest.has(a.crew_member_id)) latest.set(a.crew_member_id, a)
    const rows = [...latest.values()].filter((a) => a.event_type === 'sign_on')
      .sort((a, b) => vs(a).localeCompare(vs(b)) || nm(a).localeCompare(nm(b)))
    const body = rows.map((a) => [nm(a), a.crew_members?.rank ?? '—', vs(a), d(a.event_date), a.crew_members?.nationality ?? '—'])
    return out('Crew Currently Onboard', ['Crew', 'Rank', 'Vessel', 'Signed on', 'Nationality'], [3, 2, 3, 2, 2], body, rows, 'crew-onboard')
  }

  // ── crew arriving / departing (confirmed, upcoming) ──────────────────────────
  const arriving = path.endsWith('/crew-arriving')
  const departing = path.endsWith('/crew-departing')
  if (arriving || departing) {
    const { data, error } = await sb.from('crew_signon_events').select(SELECT)
      .eq('event_type', arriving ? 'sign_on' : 'sign_off')
      .eq('status', 'confirmed')
      .gte('event_date', today)
      .order('event_date', { ascending: true })
    if (error) return json({ error: 'Report fetch failed' }, 500)
    const rows = (data ?? []) as any[]
    const body = rows.map((a) => [nm(a), vs(a), d(a.event_date), flt(a), arriving ? dt(a.arrival_datetime) : dt(a.departure_datetime), pick(a)])
    const title = arriving ? 'Crew Awaiting Arrival' : 'Crew Scheduled to Depart'
    return out(title, ['Crew', 'Vessel', 'Date', 'Flight', arriving ? 'Arrival' : 'Departure', 'Pickup'], [3, 2.6, 2, 2, 2.4, 1.8], body, rows, arriving ? 'crew-arriving' : 'crew-departing')
  }

  return json({ error: 'Not found' }, 404)
}

/**
 * Weekly immigration digest — runs Monday 07:00 GST (cron). Emails the ops/visa
 * team a summary of this week's planned sign-ons and sign-offs, with links to the
 * full reports (SES Simple content can't attach files, so we link them).
 */
export async function runWeeklyImmigrationReports(): Promise<{ signOn: number; signOff: number; sent: number }> {
  const sb = admin()
  const monday = mondayOf(null)
  const sunday = addDaysStr(monday, 6)

  const { data } = await sb.from('crew_signon_events').select(SELECT)
    .gte('event_date', monday).lte('event_date', sunday)
    .order('event_date', { ascending: true })
  const rows = (data ?? []) as any[]
  const on = rows.filter((a) => a.event_type !== 'sign_off')
  const off = rows.filter((a) => a.event_type === 'sign_off')

  // Recipients — admin-tier users with an email.
  const { data: profiles } = await sb.from('user_profiles').select('email, roles:role_id(name)').not('email', 'is', null)
  const recipients = (profiles ?? [])
    .filter((p: any) => ['global_admin', 'org_admin'].includes(p.roles?.name))
    .map((p: any) => p.email as string)
  if (recipients.length === 0) return { signOn: on.length, signOff: off.length, sent: 0 }

  const base = process.env.VITE_APP_URL ?? 'https://jls-navigator.m-peeters-4a0.workers.dev'
  const list = (arr: any[]) => arr.length
    ? `<ul style="margin:4px 0 0;padding-left:18px">${arr.map((a) => `<li>${nm(a)} — ${vs(a)} (${d(a.event_date)})</li>`).join('')}</ul>`
    : '<p style="margin:4px 0 0;color:#6b7280">None scheduled.</p>'

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937">
    <h2 style="margin:0 0 4px">Weekly Immigration — w/c ${d(monday)}</h2>
    <p style="margin:0 0 14px;color:#4b5563">${on.length} sign-on${on.length === 1 ? '' : 's'} · ${off.length} sign-off${off.length === 1 ? '' : 's'} scheduled this week.</p>
    <h3 style="margin:0 0 2px;font-size:14px">Sign-ons</h3>${list(on)}
    <h3 style="margin:14px 0 2px;font-size:14px">Sign-offs</h3>${list(off)}
    <p style="margin:18px 0 0;font-size:12px">Full reports:
      <a href="${base}/api/reports/weekly-sign-on?format=pdf">Sign-on PDF</a> ·
      <a href="${base}/api/reports/weekly-sign-off?format=pdf">Sign-off PDF</a> ·
      <a href="${base}/api/reports/crew-onboard?format=pdf">Crew onboard</a>
    </p>
  </div>`
  const text = `Weekly Immigration — w/c ${d(monday)}\n${on.length} sign-ons, ${off.length} sign-offs scheduled.\n`
    + `Sign-ons:\n${on.map((a) => `- ${nm(a)} (${vs(a)}, ${d(a.event_date)})`).join('\n') || '  none'}\n`
    + `Sign-offs:\n${off.map((a) => `- ${nm(a)} (${vs(a)}, ${d(a.event_date)})`).join('\n') || '  none'}`

  try {
    await sendEmail({ to: recipients, subject: `Weekly Immigration — w/c ${d(monday)} (${on.length} on / ${off.length} off)`, html, text })
  } catch {
    return { signOn: on.length, signOff: off.length, sent: 0 }
  }
  return { signOn: on.length, signOff: off.length, sent: recipients.length }
}
