/**
 * Maritime Declaration of Health — the PDF the master signs in the Client
 * Portal, laid out like Abu Dhabi Ports' own form (the IHR 2005 Annex 8 model):
 * the Abu Dhabi Ports logo, the particulars, ports of call, persons joined, the
 * nine health questions, the symptoms note, the declaration with the master's
 * signature and ship's stamp, the surgeon's countersignature line, and a second
 * page carrying the schedule — the details behind every yes. Built with pdf-lib.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { ABU_DHABI_PORTS_LOGO_JPG } from '@/lib/portal/assets/abu-dhabi-ports-logo'
import {
  DECLARATION_TEXT, HEALTH_QUESTIONS, SYMPTOMS_NOTE, detailsKey,
  type HealthAnswers, type JoinedPerson, type PortOfCall,
} from '@/lib/portal/health-declaration'

const INK = rgb(0.08, 0.09, 0.11)
const MUTED = rgb(0.4, 0.42, 0.46)
const RULE = rgb(0.72, 0.74, 0.78)
const FILL = rgb(0.05, 0.16, 0.42)
const RED = rgb(0.7, 0.1, 0.1)

const W = 595.28
const H = 841.89
const M = 40

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** Helvetica only encodes WinAnsi: fold typographic punctuation and drop anything it can't draw. */
function safe(s: unknown): string {
  return String(s ?? '')
    .replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/[\r\t]/g, ' ')
    .normalize('NFC')
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '?')
}

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(`${String(d).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''

export type HealthPdfInput = {
  form: Record<string, any>
  signaturePng: Uint8Array
  stamp: Uint8Array | null
  submittedOn: string // yyyy-mm-dd
  signedBy: string
  late: boolean
  dueDate: string | null
}

export async function buildHealthDeclarationPdf(input: HealthPdfInput): Promise<Uint8Array> {
  const { form } = input
  const answers = (form.answers ?? {}) as HealthAnswers
  const ports = ((form.ports_of_call ?? []) as PortOfCall[]).filter((p) => p.port?.trim())
  const joined = ((form.joined_persons ?? []) as JoinedPerson[]).filter((p) => p.name?.trim())

  const pdf = await PDFDocument.create()
  pdf.setTitle(`Maritime Declaration of Health — ${form.ship_name ?? ''}`)
  pdf.setSubject('Maritime Declaration of Health (IHR 2005, Annex 8) — Abu Dhabi Ports')
  pdf.setProducer('Polaris — JLS Yachts')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique)
  const logo = await pdf.embedJpg(b64(ABU_DHABI_PORTS_LOGO_JPG))
  const embed = async (bytes: Uint8Array): Promise<PDFImage> =>
    bytes[0] === 0x89 ? pdf.embedPng(bytes) : pdf.embedJpg(bytes)
  const signature = await embed(input.signaturePng)
  const stamp = input.stamp ? await embed(input.stamp).catch(() => null) : null

  let page: PDFPage = pdf.addPage([W, H])
  let y = H - M

  const newPage = () => { page = pdf.addPage([W, H]); y = H - M }
  const ensure = (h: number) => { if (y - h < M + 20) newPage() }

  function wrap(text: string, f: PDFFont, size: number, width: number): string[] {
    const out: string[] = []
    for (const para of safe(text).split('\n')) {
      let line = ''
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word
        if (f.widthOfTextAtSize(next, size) <= width) { line = next; continue }
        if (line) out.push(line)
        // A single word longer than the line is cut to fit.
        let w = word
        while (f.widthOfTextAtSize(w, size) > width && w.length > 1) {
          let cut = w.length - 1
          while (cut > 1 && f.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--
          out.push(w.slice(0, cut)); w = w.slice(cut)
        }
        line = w
      }
      out.push(line)
    }
    return out
  }

  /** A paragraph at the cursor; returns the height used. */
  function para(text: string, opts: { f?: PDFFont; size?: number; x?: number; width?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}) {
    const f = opts.f ?? font, size = opts.size ?? 8.5, x = opts.x ?? M, width = opts.width ?? W - M - x
    const lh = size * 1.3
    for (const line of wrap(text, f, size, width)) {
      ensure(lh)
      page.drawText(line, { x, y: y - size, size, font: f, color: opts.color ?? INK })
      y -= lh
    }
    y -= opts.gap ?? 3
  }

  /** "Label: value" with the value written on a rule, like a filled-in paper form. */
  function blank(x: number, label: string, value: string, width: number, size = 8.5) {
    const lw = font.widthOfTextAtSize(safe(label), size) + 4
    page.drawText(safe(label), { x, y: y - size, size, font, color: INK })
    const vx = x + lw, vw = Math.max(20, width - lw)
    page.drawLine({ start: { x: vx, y: y - size - 2 }, end: { x: vx + vw, y: y - size - 2 }, thickness: 0.5, color: RULE })
    let v = safe(value)
    while (v && bold.widthOfTextAtSize(v, size) > vw - 2) v = v.slice(0, -1)
    if (v) page.drawText(v, { x: vx + 2, y: y - size + 0.5, size, font: bold, color: FILL })
  }
  /** One row of blanks sharing the line. */
  function row(cells: Array<[label: string, value: string, share: number]>, size = 8.5) {
    ensure(size * 2.2)
    const total = cells.reduce((s, c) => s + c[2], 0)
    let x = M
    const avail = W - 2 * M - (cells.length - 1) * 10
    for (const [label, value, share] of cells) {
      const w = (avail * share) / total
      blank(x, label, value, w, size)
      x += w + 10
    }
    y -= size * 1.95
  }

  /** Yes / No boxes, the chosen one crossed. Returns the x after them. */
  function yesNo(x: number, value: unknown, size = 8.5): number {
    for (const opt of ['yes', 'no'] as const) {
      const label = opt === 'yes' ? 'Yes' : 'No'
      page.drawRectangle({ x, y: y - size - 0.5, width: size, height: size, borderColor: INK, borderWidth: 0.6 })
      if (value === opt) {
        page.drawLine({ start: { x: x + 1.5, y: y - size + 1 }, end: { x: x + size - 1.5, y: y - 2 }, thickness: 1.1, color: FILL })
        page.drawLine({ start: { x: x + 1.5, y: y - 2 }, end: { x: x + size - 1.5, y: y - size + 1 }, thickness: 1.1, color: FILL })
      }
      page.drawText(label, { x: x + size + 3, y: y - size, size, font, color: INK })
      x += size + 3 + font.widthOfTextAtSize(label, size) + 10
    }
    return x
  }

  function heading(text: string) {
    ensure(22)
    y -= 4
    page.drawText(safe(text), { x: M, y: y - 9.5, size: 9.5, font: bold, color: INK })
    y -= 14
  }

  // ── Header ────────────────────────────────────────────────────────────────
  const logoH = 46
  const logoW = (logo.width / logo.height) * logoH
  page.drawImage(logo, { x: M, y: y - logoH, width: logoW, height: logoH })
  const title = 'MARITIME DECLARATION OF HEALTH'
  page.drawText(title, { x: W - M - bold.widthOfTextAtSize(title, 14), y: y - 20, size: 14, font: bold, color: INK })
  const sub = 'International Health Regulations (2005) - Annex 8'
  page.drawText(sub, { x: W - M - font.widthOfTextAtSize(sub, 8), y: y - 33, size: 8, font, color: MUTED })
  y -= logoH + 8
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: INK })
  y -= 6
  para('To be completed and submitted to the competent authorities by the masters of ships arriving from foreign ports.', { f: italic, size: 8, gap: 6 })

  // ── Particulars ──────────────────────────────────────────────────────────
  row([['Submitted at the port of', form.port_of_arrival ?? '', 3], ['Date', fmtDate(input.submittedOn), 1.4]])
  row([['Name of ship or inland navigation vessel', form.ship_name ?? '', 3], ['Registration / IMO No.', form.imo_no ?? '', 2]])
  row([['Arriving from', form.arriving_from ?? '', 1], ['Sailing to', form.sailing_to ?? '', 1], ['Expected arrival', fmtDate(form.arrival_date), 0.8]])
  row([['(Nationality) (Flag of vessel)', form.flag ?? '', 1], ["Master's name", form.master_name ?? '', 1]])
  row([['Gross tonnage (ship)', form.gross_tonnage ?? '', 1], ['Tonnage (inland navigation vessel)', form.inland_tonnage ?? '', 1]])

  ensure(16)
  page.drawText('Valid Sanitation Control Exemption / Control Certificate carried on board?', { x: M, y: y - 8.5, size: 8.5, font, color: INK })
  yesNo(M + font.widthOfTextAtSize('Valid Sanitation Control Exemption / Control Certificate carried on board?', 8.5) + 8, form.sanitation_cert_carried)
  y -= 18
  row([['Issued at', form.sanitation_cert_issued_at ?? '', 1.4], ['Date', fmtDate(form.sanitation_cert_date), 1]])
  ensure(16)
  page.drawText('Re-inspection required?', { x: M, y: y - 8.5, size: 8.5, font, color: INK })
  yesNo(M + font.widthOfTextAtSize('Re-inspection required?', 8.5) + 8, form.reinspection_required)
  y -= 18
  ensure(16)
  const affected = 'Has ship / vessel visited an affected area identified by the World Health Organization?'
  page.drawText(affected, { x: M, y: y - 8.5, size: 8.5, font, color: INK })
  yesNo(M + font.widthOfTextAtSize(affected, 8.5) + 8, form.visited_affected_area)
  y -= 18
  row([['Port and date of visit', [form.affected_area_port, fmtDate(form.affected_area_date)].filter(Boolean).join(' - '), 1]])

  // ── Ports of call ─────────────────────────────────────────────────────────
  para('List ports of call from commencement of voyage with dates of departure, or within past thirty days, whichever is shorter:', { gap: 4 })
  if (ports.length === 0) para('None recorded.', { f: italic, color: MUTED, x: M + 10 })
  else {
    const colW = (W - 2 * M) / 2
    for (let i = 0; i < ports.length; i += 2) {
      ensure(18)
      for (let c = 0; c < 2 && i + c < ports.length; c++) {
        const p = ports[i + c]
        blank(M + c * colW, `${i + c + 1}.`, `${p.port}${p.departed ? `  (departed ${fmtDate(p.departed)})` : ''}`, colW - 12)
      }
      y -= 17
    }
  }
  y -= 2

  // ── Persons joined ────────────────────────────────────────────────────────
  para('Upon request of the competent authority at the port of arrival, list crew members, passengers or other persons who have joined ship / vessel since international voyage began or within past thirty days, whichever is shorter, including all ports / countries visited in this period (add additional names to the attached schedule):', { gap: 4 })
  const JOINED_ON_PAGE = 4
  if (joined.length === 0) para('None.', { f: italic, color: MUTED, x: M + 10 })
  for (const [i, p] of joined.slice(0, JOINED_ON_PAGE).entries()) {
    const from = [0, 1, 2].map((n) => p.joined_from?.[n] ?? '')
    row([[`${i + 1}. Name`, p.name, 1.3], ['joined from (1)', from[0], 1], ['(2)', from[1], 0.7], ['(3)', from[2], 0.7]], 8)
  }
  if (joined.length > JOINED_ON_PAGE) para(`${joined.length - JOINED_ON_PAGE} further person(s) listed on the attached schedule.`, { f: italic, size: 8, color: MUTED, x: M + 10 })
  row([['Number of crew members on board', form.crew_count == null ? '' : String(form.crew_count), 1], ['Number of passengers on board', form.passenger_count == null ? '' : String(form.passenger_count), 1]])

  // ── Health questions ──────────────────────────────────────────────────────
  heading('Health Questions')
  const yesNoW = 70
  HEALTH_QUESTIONS.forEach((q, i) => {
    const textW = W - 2 * M - yesNoW - 14
    const lines = wrap(`(${i + 1}) ${q.text}`, font, 8.5, textW)
    ensure(lines.length * 11 + (q.count ? 14 : 0) + 4)
    const top = y
    for (const line of lines) { page.drawText(line, { x: M, y: y - 8.5, size: 8.5, font, color: INK }); y -= 11 }
    const after = y
    y = top
    yesNo(W - M - yesNoW, answers[q.key])
    y = after
    if (q.count && answers[q.key] === 'yes') {
      blank(M + 18, `${q.count.label}`, String(answers[q.count.key] ?? ''), 200)
      y -= 14
    }
    if (answers[q.key] === 'yes') { para('If yes, details are given in the attached schedule.', { f: italic, size: 7.5, color: MUTED, x: M + 18, gap: 1 }) }
    y -= 3
  })

  para(`Note: ${SYMPTOMS_NOTE}`, { size: 7, color: MUTED, gap: 8 })

  // ── Declaration & signatures ─────────────────────────────────────────────
  ensure(125)
  para(DECLARATION_TEXT, { size: 8.5, gap: 8 })
  const sigTop = y
  const sigBoxW = 200, sigBoxH = 50
  const sw = Math.min(sigBoxW, (signature.width / signature.height) * sigBoxH)
  page.drawImage(signature, { x: M + 40, y: sigTop - sigBoxH, width: sw, height: (sw * signature.height) / signature.width })
  if (stamp) {
    const sh = 80
    const sWidth = Math.min(110, (stamp.width / stamp.height) * sh)
    page.drawImage(stamp, { x: M + 270, y: sigTop - sh + 6, width: sWidth, height: (sWidth * stamp.height) / stamp.width, opacity: 0.92 })
  }
  y = sigTop - sigBoxH - 2
  page.drawLine({ start: { x: M, y }, end: { x: M + 250, y }, thickness: 0.5, color: RULE })
  page.drawText('Signed (Master)', { x: M, y: y - 9, size: 7.5, font, color: MUTED })
  if (stamp) page.drawText("Ship's stamp", { x: M + 270, y: y - 9, size: 7.5, font, color: MUTED })
  y -= 16
  row([["Master's name", form.master_name ?? '', 1.4], ['Signed in the portal by', input.signedBy, 1.2], ['Date', fmtDate(input.submittedOn), 0.8]])
  if (!stamp) para("Ship's stamp: not provided.", { f: italic, size: 7.5, color: MUTED, gap: 4 })
  y -= 4
  row([["Countersigned (ship's surgeon, if carried)", form.surgeon_name ? `${form.surgeon_name}` : '', 2], ['Date', '', 0.8]])

  if (input.late) {
    para(`Submitted after the due date (${fmtDate(input.dueDate)}): five working days before arrival.`, { f: bold, size: 7.5, color: RED, gap: 2 })
  }

  // ── Schedule ─────────────────────────────────────────────────────────────
  const yeses = HEALTH_QUESTIONS.map((q, i) => ({ q, i })).filter(({ q }) => answers[q.key] === 'yes')
  const extraJoined = joined.slice(JOINED_ON_PAGE)
  const remarks = String(form.particulars ?? '').trim()
  if (yeses.length || extraJoined.length || remarks) {
    newPage()
    page.drawImage(logo, { x: M, y: y - 30, width: (logo.width / logo.height) * 30, height: 30 })
    const t = 'SCHEDULE - ATTACHMENT TO MARITIME DECLARATION OF HEALTH'
    page.drawText(t, { x: W - M - bold.widthOfTextAtSize(t, 10.5), y: y - 14, size: 10.5, font: bold, color: INK })
    const s2 = `${safe(form.ship_name ?? '')}${form.imo_no ? `  -  IMO ${safe(form.imo_no)}` : ''}  -  arriving ${fmtDate(form.arrival_date)}`
    page.drawText(s2, { x: W - M - font.widthOfTextAtSize(s2, 8), y: y - 26, size: 8, font, color: MUTED })
    y -= 38
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: INK })
    y -= 10
    for (const { q, i } of yeses) {
      ensure(40)
      para(`(${i + 1}) ${q.text}  -  Yes${q.count ? `  (${q.count.label.replace(/\?$/, '')}: ${answers[q.count.key] ?? ''})` : ''}`, { f: bold, size: 8.5, gap: 2 })
      para(String(answers[detailsKey(q)] ?? '') || '-', { x: M + 12, size: 8.5, gap: 8 })
    }
    if (extraJoined.length) {
      heading('Further persons joined')
      for (const [n, p] of extraJoined.entries()) {
        para(`${JOINED_ON_PAGE + n + 1}. ${p.name}  -  joined from ${(p.joined_from ?? []).filter(Boolean).join(', ') || '-'}`, { size: 8.5, gap: 2 })
      }
      y -= 6
    }
    if (remarks) { heading('Further remarks'); para(remarks, { size: 8.5 }) }
  }

  // Footer on every page.
  const pages = pdf.getPages()
  pages.forEach((p, i) => {
    const f = `Completed and signed by the master in the JLS Yachts Client Portal on ${fmtDate(input.submittedOn)}  -  page ${i + 1} of ${pages.length}`
    p.drawText(safe(f), { x: M, y: M - 18, size: 6.5, font, color: MUTED })
  })

  return pdf.save()
}
