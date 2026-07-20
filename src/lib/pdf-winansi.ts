/**
 * WinAnsi-safe text for pdf-lib StandardFonts (Helvetica etc.).
 *
 * pdf-lib's standard fonts use WinAnsi (Windows-1252) encoding and THROW on any
 * character outside it — e.g. Turkish "İ" (U+0130), "ş", Polish "ł". Customer /
 * crew names and free-text descriptions routinely contain these, which would
 * crash the whole PDF. This transliterates the un-encodable characters to safe
 * equivalents while KEEPING the accented Latin-1 letters WinAnsi supports
 * (é, ü, ñ, ç, ø via map, …). Lossless for anything already WinAnsi-encodable.
 */

// Letters that do NOT NFKD-decompose to ASCII — map them explicitly.
const SPECIAL: Record<string, string> = {
  'ı': 'i', 'İ': 'I', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D',
  'œ': 'oe', 'Œ': 'OE', 'ẞ': 'SS', 'ĳ': 'ij', 'Ĳ': 'IJ',
  '“': '"', '”': '"', '‘': "'", '’': "'", '–': '-', '—': '-', '…': '...',
}

export function winAnsiSafe(input?: string | number | null): string {
  if (input == null) return ''
  let s = String(input)
  s = s.replace(/[ıİłŁđĐœŒẞĳĲ“”‘’–—…]/g, (ch) => SPECIAL[ch] ?? ch)
  let out = ''
  for (const ch of s) {
    const code = ch.charCodeAt(0)
    // ASCII and the Latin-1 supplement (0xA0–0xFF) are all WinAnsi-encodable.
    if (code <= 0x7f || (code >= 0xa0 && code <= 0xff)) { out += ch; continue }
    // Decompose (é→e+́) and drop combining marks; keep only what lands in Latin-1.
    const d = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '')
    for (const c of d) if (c.charCodeAt(0) <= 0xff) out += c
  }
  return out
}

/** Recursively WinAnsi-clean every string in an object/array (numbers/bools untouched). */
export function deepWinAnsiSafe<T>(value: T): T {
  if (typeof value === 'string') return winAnsiSafe(value) as unknown as T
  if (Array.isArray(value)) return value.map((v) => deepWinAnsiSafe(v)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = deepWinAnsiSafe(v)
    return out as T
  }
  return value
}
