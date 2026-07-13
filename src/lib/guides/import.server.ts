/**
 * Import a PDF or Word document into a Knowledge Base guide.
 *
 *   1. Extract the document's content — PDFs are read natively by Claude
 *      (document content block); Word .docx is unzipped and its text pulled out
 *      and sent as text.
 *   2. Claude reformats it into the app's guide shape: { title, category,
 *      summary, body(markdown) }.
 *   3. A Polaris / JLS-branded PDF is rendered from that content (pdf-lib) and,
 *      together with the original upload, stored in the esign-documents bucket.
 *   4. A guides row is created linking both files.
 */
import { createClient } from '@supabase/supabase-js'
import { unzipSync, strFromU8 } from 'fflate'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { QB_DOC_IMAGES } from '@/lib/qb/invoice-assets'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'
const BUCKET = 'esign-documents'

function admin() {
  return createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'guide'

/** Pull readable text out of a .docx (it's a zip of XML). */
function extractDocxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes)
  const doc = files['word/document.xml']
  if (!doc) throw new Error('Not a valid Word document (no word/document.xml)')
  const xml = strFromU8(doc)
  return xml
    .replace(/<w:p\b[^>]*>/g, '\n')       // paragraphs → newlines
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<[^>]+>/g, '')               // strip all remaining tags
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type Extracted = { title: string; category: string; summary: string; body: string }

const EXTRACT_PROMPT =
  'You are formatting a source document into a knowledge-base guide for the Polaris platform (JLS Yachts).\n' +
  'Return ONLY a JSON object (no prose, no code fences) with exactly these keys:\n' +
  '  "title": a concise guide title,\n' +
  '  "category": a short category label (e.g. "Visas", "Onboarding", "Safety"); infer a sensible one,\n' +
  '  "summary": a one-line description,\n' +
  '  "body": the full guide in clean GitHub-flavoured Markdown — use "## " section headings, "- " bullet lists, short paragraphs. Preserve all substantive detail, steps and lists from the source, but drop letterhead, page numbers and boilerplate.\n' +
  'Do not invent content that is not in the source.'

async function callClaude(apiKey: string, userContent: any[]): Promise<Extracted> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: userContent }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
  const j: any = await res.json()
  const text = (j?.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
  const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  let parsed: any
  try { parsed = JSON.parse(jsonStr) } catch { throw new Error('Could not parse the extracted guide content') }
  return {
    title: String(parsed.title ?? 'Untitled guide').trim(),
    category: String(parsed.category ?? '').trim(),
    summary: String(parsed.summary ?? '').trim(),
    body: String(parsed.body ?? '').trim(),
  }
}

// ── Branded PDF rendering ─────────────────────────────────────────────────────
const A4 = { w: 595.28, h: 841.89 }
const M = 48
const NAVY = rgb(0.05, 0.15, 0.27)
const INK = rgb(0.12, 0.14, 0.18)
const GREY = rgb(0.42, 0.45, 0.5)
const ACCENT = rgb(0.15, 0.42, 0.72)

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    if (!words.length) { out.push(''); continue }
    let line = ''
    for (const w of words) {
      const trial = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(trial, size) <= maxW) line = trial
      else { if (line) out.push(line); line = w }
    }
    if (line) out.push(line)
  }
  return out
}

async function renderBrandedPdf(g: Extracted): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const logo = await doc.embedPng(QB_DOC_IMAGES.logo)

  let page = doc.addPage([A4.w, A4.h])
  const Y = (top: number) => A4.h - top
  const contentW = A4.w - 2 * M

  // Header band
  page.drawRectangle({ x: 0, y: Y(96), width: A4.w, height: 96, color: NAVY })
  page.drawText('POLARIS', { x: M, y: Y(46), size: 20, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Knowledge Base', { x: M, y: Y(66), size: 9, font, color: rgb(0.7, 0.78, 0.88) })
  const logoW = 104, logoH = logoW * (103 / 391)
  page.drawImage(logo, { x: A4.w - M - logoW, y: Y(58) - logoH / 2 + 4, width: logoW, height: logoH })

  let y = 128
  // Title + meta
  for (const line of wrap(g.title, bold, 20, contentW)) { page.drawText(line, { x: M, y: Y(y), size: 20, font: bold, color: INK }); y += 26 }
  const meta = [g.category, g.summary].filter(Boolean).join('  ·  ')
  if (meta) { for (const line of wrap(meta, font, 10.5, contentW)) { page.drawText(line, { x: M, y: Y(y), size: 10.5, font, color: GREY }); y += 15 } }
  y += 6
  page.drawLine({ start: { x: M, y: Y(y) }, end: { x: A4.w - M, y: Y(y) }, thickness: 1, color: ACCENT }); y += 18

  const newPageIfNeeded = (needed: number) => {
    if (y + needed > A4.h - M) {
      page.drawText('Generated by Polaris · JLS Yachts', { x: M, y: M - 12, size: 8, font, color: GREY })
      page = doc.addPage([A4.w, A4.h]); y = M
    }
  }

  // Lightweight markdown rendering
  for (const raw of g.body.split('\n')) {
    const t = raw.trimEnd()
    if (!t.trim()) { y += 7; continue }
    if (/^#{1,2}\s+/.test(t)) {
      const txt = t.replace(/^#{1,2}\s+/, '')
      y += 6; newPageIfNeeded(20)
      for (const line of wrap(txt, bold, 13, contentW)) { page.drawText(line, { x: M, y: Y(y), size: 13, font: bold, color: NAVY }); y += 18 }
      y += 2
    } else if (/^\s*[-*]\s+/.test(t)) {
      const txt = t.replace(/^\s*[-*]\s+/, '')
      const lines = wrap(txt, font, 10.5, contentW - 16)
      lines.forEach((line, i) => {
        newPageIfNeeded(14)
        if (i === 0) page.drawText('•', { x: M + 3, y: Y(y), size: 10.5, font, color: ACCENT })
        page.drawText(line, { x: M + 16, y: Y(y), size: 10.5, font, color: INK }); y += 14
      })
    } else {
      for (const line of wrap(t, font, 10.5, contentW)) { newPageIfNeeded(14); page.drawText(line, { x: M, y: Y(y), size: 10.5, font, color: INK }); y += 14 }
      y += 3
    }
  }
  page.drawText('Generated by Polaris · JLS Yachts', { x: M, y: M - 12, size: 8, font, color: GREY })
  return doc.save()
}

export type GuideImportResult = { ok: boolean; guideId?: string; title?: string; error?: string }

export async function importGuideDocument(opts: {
  fileBase64: string; fileName: string; mimeType: string; departmentLabel: string;
  categoryHint?: string; createdBy?: string | null; published?: boolean;
}): Promise<GuideImportResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY not configured' }

  const bytes = Uint8Array.from(atob(opts.fileBase64), (c) => c.charCodeAt(0))
  const isPdf = opts.mimeType === 'application/pdf' || /\.pdf$/i.test(opts.fileName)
  const isDocx = /officedocument\.wordprocessingml|\.docx$/i.test(opts.mimeType + ' ' + opts.fileName)
  if (!isPdf && !isDocx) return { ok: false, error: 'Only PDF or Word (.docx) files are supported' }

  // 1 + 2. Extract → structured guide.
  let extracted: Extracted
  try {
    if (isPdf) {
      extracted = await callClaude(apiKey, [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: opts.fileBase64 } },
        { type: 'text', text: EXTRACT_PROMPT },
      ])
    } else {
      const text = extractDocxText(bytes)
      if (!text.trim()) return { ok: false, error: 'The Word document appears to be empty' }
      extracted = await callClaude(apiKey, [{ type: 'text', text: `${EXTRACT_PROMPT}\n\n--- SOURCE DOCUMENT ---\n${text.slice(0, 120000)}` }])
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Extraction failed' }
  }
  if (opts.categoryHint?.trim()) extracted.category = opts.categoryHint.trim()

  const sb = admin() as any
  const slug = `${slugify(extracted.title)}-${Math.random().toString(36).slice(2, 6)}`

  // 3. Store the original upload + render and store the branded PDF.
  const ext = isPdf ? 'pdf' : 'docx'
  const srcPath = `guides/source/${slug}.${ext}`
  const pdfPath = `guides/branded/${slug}.pdf`
  try {
    await sb.storage.from(BUCKET).upload(srcPath, bytes, { contentType: opts.mimeType || (isPdf ? 'application/pdf' : 'application/octet-stream'), upsert: true })
    const branded = await renderBrandedPdf(extracted)
    await sb.storage.from(BUCKET).upload(pdfPath, branded, { contentType: 'application/pdf', upsert: true })
  } catch (e: any) {
    return { ok: false, error: `Storage failed: ${e?.message ?? e}` }
  }

  // 4. Create the guide.
  const { data, error } = await sb.from('guides').insert([{
    department: opts.departmentLabel,
    category: extracted.category || null,
    slug,
    title: extracted.title,
    summary: extracted.summary || null,
    body: extracted.body,
    published: opts.published ?? true,
    created_by: opts.createdBy ?? null,
    source_file_path: srcPath,
    pdf_path: pdfPath,
    updated_at: new Date().toISOString(),
  }]).select('id').single()
  if (error) return { ok: false, error: error.message }

  return { ok: true, guideId: data.id, title: extracted.title }
}
