/**
 * Visa export handler
 * GET  /api/visa/export?yacht_id=xxx&format=pdf|csv
 * POST /api/visa/export/email  { yacht_id, to_email }
 */
import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/ses.server'

function getAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  return createClient(url, key, { auth: { persistSession: false } })
}

type VisaRow = {
  id: string
  given_name: string | null
  surname: string | null
  nationality: string | null
  passport_number: string | null
  rank_rating: string | null
  visa_number: string | null
  visa_issuance_date: string | null
  first_entry_expiry: string | null
  visa_expiry: string | null
  sign_on_date: string | null
  sign_off_date: string | null
  status: string
  application_notes: string | null
  yachts?: { vessel_name: string } | null
}

function fmt(d: string | null): string {
  if (!d) return '—'
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return d }
}

function displayName(r: VisaRow): string {
  if (r.given_name && r.surname) return `${r.given_name} ${r.surname}`
  if (r.application_notes) return r.application_notes.split('\n')[0]
  return '—'
}

function statusLabel(s: string): string {
  return { draft:'Draft', submitted:'Submitted', in_review:'In Review', processing:'Processing',
           approved:'Approved', rejected:'Rejected', completed:'Completed', cancelled:'Cancelled' }[s] ?? s
}

async function fetchRows(yachtId: string): Promise<{ rows: VisaRow[]; vesselName: string }> {
  const db = getAdmin()
  const { data, error } = await (db as any)
    .from('visa_applications')
    .select('*, yachts(vessel_name)')
    .eq('yacht_id', yachtId)
    .order('surname', { ascending: true })
  if (error) throw new Error(error.message)
  const rows: VisaRow[] = (data ?? []) as VisaRow[]
  const vesselName = rows[0]?.yachts?.vessel_name ?? 'Vessel'
  return { rows, vesselName }
}

// ─── CSV ──────────────────────────────────────────────────────────────────────
function buildCsv(rows: VisaRow[], vesselName: string): string {
  const headers = ['Given Name','Surname','Nationality','Passport No.','Rank / Rating',
                   'Visa Reference','Visa Issuance','First Entry Expiry','Visa Expiry',
                   'Sign On','Sign Off','Status']
  const esc = (v: string | null | undefined) => {
    const s = v ?? ''
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s
  }
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push([
      esc(r.given_name), esc(r.surname), esc(r.nationality), esc(r.passport_number),
      esc(r.rank_rating), esc(r.visa_number), esc(fmt(r.visa_issuance_date)),
      esc(fmt(r.first_entry_expiry)), esc(fmt(r.visa_expiry)),
      esc(fmt(r.sign_on_date)), esc(fmt(r.sign_off_date)), esc(statusLabel(r.status)),
    ].join(','))
  }
  return lines.join('\r\n')
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
async function buildPdf(rows: VisaRow[], vesselName: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const boldFont   = await doc.embedFont(StandardFonts.HelveticaBold)
  const normalFont = await doc.embedFont(StandardFonts.Helvetica)
  const white = rgb(1, 1, 1)
  const navy  = rgb(0.08, 0.18, 0.35)
  const slate = rgb(0.35, 0.45, 0.55)
  const black = rgb(0, 0, 0)
  const bgRow = rgb(0.96, 0.97, 0.98)
  const green = rgb(0.08, 0.55, 0.35)
  const red   = rgb(0.75, 0.15, 0.15)
  const amber = rgb(0.8, 0.5, 0)

  const pageW = 842; const pageH = 595  // A4 landscape
  const addPage = () => {
    const p = doc.addPage([pageW, pageH])
    // Header bar
    p.drawRectangle({ x: 0, y: pageH - 56, width: pageW, height: 56, color: navy })
    p.drawText('JLS YACHTS', { x: 24, y: pageH - 24, size: 14, font: boldFont, color: white })
    p.drawText('Visa Application Report', { x: 24, y: pageH - 40, size: 9, font: normalFont, color: rgb(0.7, 0.8, 0.9) })
    p.drawText(`Vessel: ${vesselName}`, { x: 200, y: pageH - 28, size: 10, font: boldFont, color: white })
    const genDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    p.drawText(`Generated: ${genDate}`, { x: pageW - 180, y: pageH - 28, size: 8, font: normalFont, color: rgb(0.7, 0.8, 0.9) })
    p.drawText(`${rows.length} record${rows.length === 1 ? '' : 's'}`, { x: pageW - 180, y: pageH - 42, size: 8, font: normalFont, color: rgb(0.7, 0.8, 0.9) })
    // Footer
    p.drawLine({ start: { x: 24, y: 22 }, end: { x: pageW - 24, y: 22 }, thickness: 0.5, color: rgb(0.8, 0.85, 0.9) })
    p.drawText('JLS Yachts — Confidential', { x: 24, y: 10, size: 7, font: normalFont, color: slate })
    return p
  }

  // Column config: [label, key fn, width]
  type ColDef = [string, (r: VisaRow) => string, number]
  const cols: ColDef[] = [
    ['Name',            r => displayName(r),                  130],
    ['Nationality',     r => r.nationality ?? '—',             70],
    ['Passport No.',    r => r.passport_number ?? '—',         85],
    ['Rank / Rating',   r => r.rank_rating ?? '—',             80],
    ['Visa Reference',  r => r.visa_number ?? '—',            115],
    ['Visa Issuance',   r => fmt(r.visa_issuance_date),        80],
    ['Visa Expiry',     r => fmt(r.visa_expiry),               80],
    ['Sign On',         r => fmt(r.sign_on_date),              72],
    ['Status',          r => statusLabel(r.status),            70],
  ]
  const totalColW = cols.reduce((s, c) => s + c[2], 0)
  const marginX = (pageW - totalColW) / 2

  let page = addPage()
  let y = pageH - 72
  const rowH = 18
  const headerH = 20

  // Column headers
  const drawHeaders = (pg: ReturnType<typeof doc.addPage>, startY: number) => {
    pg.drawRectangle({ x: marginX, y: startY - headerH + 4, width: totalColW, height: headerH, color: rgb(0.2, 0.35, 0.55) })
    let cx = marginX
    for (const [label, , w] of cols) {
      pg.drawText(label, { x: cx + 4, y: startY - 8, size: 7.5, font: boldFont, color: white })
      cx += w
    }
    return startY - headerH
  }

  y = drawHeaders(page, y)

  rows.forEach((r, idx) => {
    if (y < 40) {
      page = addPage()
      y = pageH - 72
      y = drawHeaders(page, y)
    }
    const bg = idx % 2 === 0 ? bgRow : white
    page.drawRectangle({ x: marginX, y: y - rowH + 4, width: totalColW, height: rowH, color: bg })

    let cx = marginX
    for (const [, valFn, w] of cols) {
      const val = valFn(r)
      let color = black
      if (valFn === ((rv: VisaRow) => statusLabel(rv.status))) {
        if (r.status === 'approved' || r.status === 'completed') color = green
        else if (r.status === 'rejected' || r.status === 'cancelled') color = red
        else if (r.status === 'in_review' || r.status === 'processing') color = amber
      }
      // Truncate long values
      let display = val
      const font = normalFont
      while (display.length > 1 && font.widthOfTextAtSize(display, 7.5) > w - 8) {
        display = display.slice(0, -1)
      }
      if (display !== val) display = display.slice(0, -1) + '…'
      page.drawText(display, { x: cx + 4, y: y - 8, size: 7.5, font, color })
      cx += w
    }
    y -= rowH
  })

  // Summary stats
  if (y > 60) {
    y -= 8
    const approved = rows.filter(r => r.status === 'approved' || r.status === 'completed').length
    const cancelled = rows.filter(r => r.status === 'cancelled').length
    const rejected = rows.filter(r => r.status === 'rejected').length
    const other = rows.length - approved - cancelled - rejected
    page.drawText(
      `Summary — Approved/Completed: ${approved}  |  Cancelled: ${cancelled}  |  Rejected: ${rejected}  |  Other: ${other}`,
      { x: marginX, y, size: 8, font: boldFont, color: navy }
    )
  }

  return doc.save()
}

// ─── Email ────────────────────────────────────────────────────────────────────
function buildEmailHtml(rows: VisaRow[], vesselName: string): string {
  const approved = rows.filter(r => r.status === 'approved' || r.status === 'completed').length
  const cancelled = rows.filter(r => r.status === 'cancelled').length
  const rejected  = rows.filter(r => r.status === 'rejected').length
  const statusColor = (s: string) =>
    s === 'approved' || s === 'completed' ? '#0a7a50' : s === 'rejected' || s === 'cancelled' ? '#b01010' : '#7a5500'
  const rows_html = rows.map(r => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e8edf2">${r.given_name ?? ''} ${r.surname ?? ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e8edf2">${r.nationality ?? '—'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e8edf2">${r.passport_number ?? '—'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e8edf2">${r.visa_number ?? '—'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e8edf2">${fmt(r.visa_expiry)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e8edf2;color:${statusColor(r.status)};font-weight:600">${statusLabel(r.status)}</td>
    </tr>`).join('')
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;margin:0;background:#f4f6f9">
<div style="max-width:900px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
<div style="background:#142e5a;color:#fff;padding:24px 32px">
  <div style="font-size:20px;font-weight:700">JLS Yachts — Visa Report</div>
  <div style="font-size:14px;opacity:0.75;margin-top:4px">Vessel: ${vesselName}</div>
</div>
<div style="padding:20px 32px;background:#e8f0fb;font-size:13px;color:#1a2a3a">
  <strong>${rows.length}</strong> records &nbsp;·&nbsp;
  Approved: <strong style="color:#0a7a50">${approved}</strong> &nbsp;·&nbsp;
  Cancelled: <strong style="color:#7a5500">${cancelled}</strong> &nbsp;·&nbsp;
  Rejected: <strong style="color:#b01010">${rejected}</strong>
</div>
<div style="padding:24px 32px">
<table style="width:100%;border-collapse:collapse;font-size:13px">
<thead><tr style="background:#1a3a6a;color:#fff">
  <th style="padding:8px;text-align:left">Name</th>
  <th style="padding:8px;text-align:left">Nationality</th>
  <th style="padding:8px;text-align:left">Passport No.</th>
  <th style="padding:8px;text-align:left">Visa Reference</th>
  <th style="padding:8px;text-align:left">Visa Expiry</th>
  <th style="padding:8px;text-align:left">Status</th>
</tr></thead>
<tbody>${rows_html}</tbody>
</table>
</div>
<div style="padding:16px 32px;background:#f8fafb;font-size:11px;color:#6b7c8d">
  Generated by JLS Polaris — Confidential
</div>
</div></body></html>`
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export async function visaExportHandler(request: Request): Promise<Response> {
  const url = new URL(request.url)

  // POST /api/visa/export/email  { yacht_id, to_email }
  if (request.method === 'POST') {
    const { yacht_id, to_email } = await request.json() as { yacht_id: string; to_email: string }
    if (!yacht_id || !to_email) return new Response('Missing params', { status: 400 })
    try {
      const { rows, vesselName } = await fetchRows(yacht_id)
      const pdfBytes = await buildPdf(rows, vesselName)
      const pdfBase64 = btoa(String.fromCharCode(...pdfBytes))
      const html = buildEmailHtml(rows, vesselName)
      const csvText = buildCsv(rows, vesselName)
      // SES doesn't natively support attachments in sendEmail; send both HTML body + CSV inline
      await sendEmail({
        to: [to_email],
        subject: `Visa Report — ${vesselName}`,
        html: html + `<hr><h3>CSV Data</h3><pre style="font-size:11px;background:#f4f4f4;padding:12px">${csvText.replace(/</g,'&lt;')}</pre>`,
        text: `Visa Report for ${vesselName}\n\n${csvText}`,
      })
      return new Response(JSON.stringify({ ok: true, vessel: vesselName, count: rows.length }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: String(e) }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  // GET /api/visa/export?yacht_id=xxx&format=pdf|csv
  const yacht_id = url.searchParams.get('yacht_id')
  const format   = url.searchParams.get('format') ?? 'csv'
  if (!yacht_id) return new Response('Missing yacht_id', { status: 400 })
  try {
    const { rows, vesselName } = await fetchRows(yacht_id)
    const safeName = vesselName.replace(/[^a-zA-Z0-9_\- ]/g, '').trim()
    if (format === 'pdf') {
      const pdfBytes = await buildPdf(rows, vesselName)
      return new Response(pdfBytes as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="Visa-Report-${safeName}.pdf"`,
        }
      })
    } else {
      const csv = buildCsv(rows, vesselName)
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="Visa-Report-${safeName}.csv"`,
        }
      })
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
}
