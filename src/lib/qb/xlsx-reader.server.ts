/**
 * Minimal, dependency-free .xlsx reader for the Cloudflare Worker.
 *
 * Unzips a workbook using the platform DecompressionStream ('deflate-raw' for
 * DEFLATE entries, stored entries copied as-is) — reading the ZIP central
 * directory so it works with real Excel files (which use data descriptors, so
 * local-header sizes are unreliable). Parses sharedStrings + each worksheet into
 * a simple string grid (rows × columns, 1 based columns collapsed to a dense
 * array). Enough to drive the label-based QB import parser; not a general XLSX lib.
 */

const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength)

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Response(bytes as unknown as BodyInit).body!.pipeThrough(ds)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

type ZipEntry = { name: string; method: number; compSize: number; offset: number }

/** Parse the ZIP central directory → entry table. */
function readCentralDirectory(buf: Uint8Array): ZipEntry[] {
  const view = dv(buf)
  // Find End Of Central Directory (0x06054b50), scanning back from the end.
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65536; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Not a zip (no EOCD)')
  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true) // central directory offset
  const entries: ZipEntry[] = []
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break
    const method = view.getUint16(p + 10, true)
    const compSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const offset = view.getUint32(p + 42, true)
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen))
    entries.push({ name, method, compSize, offset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

async function readEntry(buf: Uint8Array, e: ZipEntry): Promise<Uint8Array> {
  const view = dv(buf)
  if (view.getUint32(e.offset, true) !== 0x04034b50) throw new Error('Bad local header')
  const nameLen = view.getUint16(e.offset + 26, true)
  const extraLen = view.getUint16(e.offset + 28, true)
  const start = e.offset + 30 + nameLen + extraLen
  const data = buf.subarray(start, start + e.compSize)
  if (e.method === 0) return data.slice()
  if (e.method === 8) return inflateRaw(data)
  throw new Error(`Unsupported zip method ${e.method}`)
}

const decode = (b: Uint8Array) => new TextDecoder().decode(b)

/** Parse sharedStrings.xml → array of plain strings (rich-text runs concatenated). */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = []
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g
  let m: RegExpExecArray | null
  while ((m = siRe.exec(xml))) {
    const inner = m[1]
    let text = ''
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g
    let t: RegExpExecArray | null
    while ((t = tRe.exec(inner))) text += unescapeXml(t[1])
    out.push(text)
  }
  return out
}

function unescapeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
}

const colToIndex = (ref: string): number => {
  const m = /^([A-Z]+)\d+$/.exec(ref)
  if (!m) return 0
  let n = 0
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Parse a worksheet XML into a dense string grid. */
function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = []
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g
  let rm: RegExpExecArray | null
  while ((rm = rowRe.exec(xml))) {
    const cells: string[] = []
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g
    let cm: RegExpExecArray | null
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1] ?? cm[3] ?? ''
      const inner = cm[2] ?? ''
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1]
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1]
      const ci = ref ? colToIndex(ref) : cells.length
      let value = ''
      if (type === 'inlineStr') {
        const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g; let t: RegExpExecArray | null
        while ((t = tRe.exec(inner))) value += unescapeXml(t[1])
      } else {
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1]
        if (v != null) value = type === 's' ? (shared[Number(v)] ?? '') : unescapeXml(v)
      }
      cells[ci] = value
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] == null) cells[i] = ''
    rows.push(cells)
  }
  return rows
}

export type XlsxSheet = { name: string; rows: string[][] }

/** Read every worksheet of an .xlsx into { name, rows } grids. */
export async function readXlsx(bytes: Uint8Array): Promise<XlsxSheet[]> {
  const entries = readCentralDirectory(bytes)
  const byName = new Map(entries.map((e) => [e.name, e]))

  const textOf = async (name: string): Promise<string> => {
    const e = byName.get(name)
    return e ? decode(await readEntry(bytes, e)) : ''
  }

  const shared = parseSharedStrings(await textOf('xl/sharedStrings.xml'))
  const workbookXml = await textOf('xl/workbook.xml')
  const relsXml = await textOf('xl/_rels/workbook.xml.rels')

  // rId -> target path
  const relMap = new Map<string, string>()
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
    relMap.set(m[1], m[2].replace(/^\/?xl\//, '').replace(/^\//, ''))
  }

  const sheets: XlsxSheet[] = []
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const tag = m[0]
    const name = /\bname="([^"]+)"/.exec(tag)?.[1] ?? `Sheet${sheets.length + 1}`
    const rid = /r:id="([^"]+)"/.exec(tag)?.[1]
    const target = rid ? relMap.get(rid) : undefined
    const path = target ? (target.startsWith('xl/') ? target : `xl/${target}`) : `xl/worksheets/sheet${sheets.length + 1}.xml`
    const xml = await textOf(path)
    sheets.push({ name: unescapeXml(name), rows: xml ? parseSheet(xml, shared) : [] })
  }
  return sheets
}
