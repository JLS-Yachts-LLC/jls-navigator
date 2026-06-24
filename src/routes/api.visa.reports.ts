/**
 * Visa reports — Tickets #180, #181, #192
 *
 *   GET /api/visa/reports/pipeline           — all UAE applications (filterable)
 *   GET /api/visa/reports/pipeline?format=csv — CSV export (#192)
 *   GET /api/visa/reports/expiry?days=N      — UAE visas expiring within N days
 *   GET /api/visa/reports/expiry?format=csv  — CSV export (#192)
 *   GET .../{pipeline,expiry}?format=pdf      — PDF export (#191)
 *
 * Reconciliation notes: country_code 'AE'; crew via crew_member_id; vessel via
 * yacht_id -> yachts(vessel_name). requireAccess gates with module view level.
 *
 * Schema note: the real expiry column on visa_applications is `visa_expiry` (the
 * issue date is `visa_issuance_date`). The visa-expiry-flag system (migration 038:
 * visa_expiry_date / visa_renewed / expiry_flags_sent / visa_expiry_flags) is NOT
 * applied to this project, so this report reads `visa_expiry` directly and derives
 * urgency from days-to-expiry rather than from flag rows.
 */

import { createClient } from '@supabase/supabase-js'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { requireAccess } from '@/lib/auth/requireAccess.server'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  })
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function addDays(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

/** Days-to-expiry label derived from visa_expiry (replaces the old flag column). */
function daysLeftLabel(expiry: string | null): string {
  if (!expiry) return '—'
  const exp = new Date(expiry + 'T00:00:00').getTime()
  const base = new Date(todayStr() + 'T00:00:00').getTime()
  const d = Math.round((exp - base) / 86_400_000)
  if (Number.isNaN(d)) return '—'
  return d < 0 ? `${-d}d overdue` : `${d}d`
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csvResponse(rows: string[][], filename: string): Response {
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

/**
 * Compact A4-portrait table PDF. headers + rows are plain strings; column widths
 * are proportional to `weights`. Mirrors the house style in api.visa.export.ts.
 */
async function buildReportPdf(title: string, headers: string[], rows: string[][], weights: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const white = rgb(1, 1, 1)
  const navy = rgb(0.08, 0.18, 0.35)
  const slate = rgb(0.35, 0.45, 0.55)
  const black = rgb(0, 0, 0)
  const bgRow = rgb(0.96, 0.97, 0.98)

  const pageW = 595, pageH = 842 // A4 portrait
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
    p.drawText(`Generated: ${gen}`, { x: pageW - 170, y: pageH - 22, size: 8, font: reg, color: rgb(0.7, 0.8, 0.9) })
    p.drawText(`${rows.length} record${rows.length === 1 ? '' : 's'}`, { x: pageW - 170, y: pageH - 36, size: 8, font: reg, color: rgb(0.7, 0.8, 0.9) })
    p.drawLine({ start: { x: marginX, y: 22 }, end: { x: pageW - marginX, y: 22 }, thickness: 0.5, color: rgb(0.8, 0.85, 0.9) })
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

function pdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

const SELECT = `
  id, status, country_code, visa_issuance_date, visa_expiry, visa_number,
  vessel_name, created_at, updated_at,
  crew_members ( id, full_name ),
  yachts ( id, vessel_name )
`

export async function visaReportsHandler(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const access = await requireAccess(request, { module: 'crew_immigration', level: 'view' })
  if (!access.ok) return access.response

  const sb = admin()
  const format = url.searchParams.get('format')

  // ── pipeline ────────────────────────────────────────────────────────────────
  if (url.pathname.endsWith('/pipeline')) {
    const statusFilter = url.searchParams.get('status')
    const vesselFilter = url.searchParams.get('vessel_id') // maps to yacht_id
    const expiryFilter = url.searchParams.get('expiry')    // '30d' | '10wd' | '5wd'

    let q = sb.from('visa_applications').select(SELECT)
      .eq('country_code', 'AE')
      .order('created_at', { ascending: false })
    if (statusFilter) q = q.eq('status', statusFilter)
    if (vesselFilter) q = q.eq('yacht_id', vesselFilter)

    const { data, error } = await q
    if (error) return json({ error: 'Report fetch failed' }, 500)

    let rows = (data ?? []) as any[]
    // Urgency windows derived from days-to-expiry (the flag system isn't deployed):
    // 5 working days ≈ 7 calendar, 10 working days ≈ 14, 30-day = 30.
    if (expiryFilter) {
      const windowDays = expiryFilter === '5wd' ? 7 : expiryFilter === '10wd' ? 14 : expiryFilter === '30d' ? 30 : null
      if (windowDays != null) {
        const today = todayStr()
        const cutoff = addDays(windowDays)
        rows = rows.filter((a) => a.visa_expiry && a.visa_expiry >= today && a.visa_expiry <= cutoff)
      }
    }

    if (format === 'csv') {
      const out: string[][] = [['Crew member', 'Vessel', 'Status', 'Issue date', 'Expiry date', 'Days left']]
      for (const a of rows) {
        out.push([
          a.crew_members?.full_name ?? '',
          a.yachts?.vessel_name ?? a.vessel_name ?? '',
          a.status, a.visa_issuance_date ?? '', a.visa_expiry ?? '',
          daysLeftLabel(a.visa_expiry ?? null),
        ])
      }
      return csvResponse(out, 'uae-visa-pipeline.csv')
    }

    if (format === 'pdf') {
      const body = rows.map((a) => [
        a.crew_members?.full_name ?? '—',
        a.yachts?.vessel_name ?? a.vessel_name ?? '—',
        a.status, a.visa_expiry ?? '—', daysLeftLabel(a.visa_expiry ?? null),
      ])
      const bytes = await buildReportPdf('UAE Visa Pipeline',
        ['Crew member', 'Vessel', 'Status', 'Expiry', 'Days left'], body, [3, 3, 2, 2, 2.2])
      return pdfResponse(bytes, 'uae-visa-pipeline.pdf')
    }

    return json({ applications: rows, total: rows.length })
  }

  // ── expiry ────────────────────────────────────────────────────────────────────
  if (url.pathname.endsWith('/expiry')) {
    const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get('days') ?? '90', 10) || 90))
    const today = todayStr()

    const { data, error } = await sb.from('visa_applications').select(SELECT)
      .eq('country_code', 'AE')
      .eq('status', 'approved')
      .gte('visa_expiry', today)
      .lte('visa_expiry', addDays(days))
      .order('visa_expiry', { ascending: true })

    if (error) return json({ error: 'Expiry report failed' }, 500)
    const rows = (data ?? []) as any[]

    if (format === 'csv') {
      const out: string[][] = [['Crew member', 'Vessel', 'Expiry date', 'Days left']]
      for (const a of rows) {
        out.push([a.crew_members?.full_name ?? '', a.yachts?.vessel_name ?? a.vessel_name ?? '', a.visa_expiry ?? '', daysLeftLabel(a.visa_expiry ?? null)])
      }
      return csvResponse(out, 'uae-visa-expiry.csv')
    }

    if (format === 'pdf') {
      const body = rows.map((a) => [
        a.crew_members?.full_name ?? '—',
        a.yachts?.vessel_name ?? a.vessel_name ?? '—',
        a.visa_expiry ?? '—', daysLeftLabel(a.visa_expiry ?? null),
      ])
      const bytes = await buildReportPdf(`Expiring UAE Visas — next ${days} days`,
        ['Crew member', 'Vessel', 'Expiry', 'Days left'], body, [3.2, 3, 2, 2.2])
      return pdfResponse(bytes, 'uae-visa-expiry.pdf')
    }

    return json({ expiring: rows, window_days: days, total: rows.length })
  }

  return json({ error: 'Not found' }, 404)
}
