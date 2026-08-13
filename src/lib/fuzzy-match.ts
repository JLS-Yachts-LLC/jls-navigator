/**
 * Fuzzy filename matching, for spotting the same document stored twice.
 *
 * Real yacht paperwork is named by hand over years, so the same certificate turns
 * up as "Registry Certificate.pdf", "Registry Cert 2026.pdf", "AMYRA - registry
 * certificate (signed).PDF". Exact-name comparison sees three unrelated files.
 *
 * The score combines two views so neither can dominate:
 *   • Dice coefficient over character bigrams — tolerant of typos and reordering.
 *   • Token containment — one name being a subset of the other ("Registry Cert"
 *     inside "Registry Certificate 2026") scores highly even though the bigram
 *     overlap is diluted by the extra words.
 *
 * Noise that says nothing about identity is stripped first: the extension, the
 * vessel name, years, dates, and words like "copy", "final", "signed", "scan".
 */

const NOISE_WORDS = new Set([
  'copy', 'final', 'signed', 'scan', 'scanned', 'new', 'old', 'updated', 'revised',
  'draft', 'version', 'ver', 'v', 'the', 'and', 'of', 'for', 'doc', 'document', 'pdf',
])

/** Strip the extension, punctuation, accents, dates, years and noise words. */
export function normaliseFileName(name: string, extra: string[] = []): string {
  const noExt = name.replace(/\.[a-z0-9]{1,5}$/i, '')
  const extraKeys = extra
    .filter(Boolean)
    .map(e => e.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase())
  let s = noExt.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  for (const e of extraKeys) if (e.length > 2) s = s.split(e).join(' ')
  s = s
    .replace(/\b(19|20)\d{2}\b/g, ' ')                    // years
    .replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, ' ') // dates
    .replace(/\b\d{6,}\b/g, ' ')                          // timestamps / long ids
    .replace(/[^a-z0-9]+/g, ' ')
  return s.split(' ').filter(w => w && !NOISE_WORDS.has(w)).join(' ').trim()
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>()
  const t = s.replace(/\s+/g, '')
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2)
    out.set(g, (out.get(g) ?? 0) + 1)
  }
  return out
}

/** Dice coefficient over character bigrams: 0 (nothing shared) → 1 (identical). */
export function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const ga = bigrams(a), gb = bigrams(b)
  let shared = 0, total = 0
  for (const [g, n] of ga) { total += n; shared += Math.min(n, gb.get(g) ?? 0) }
  for (const [, n] of gb) total += n
  return total === 0 ? 0 : (2 * shared) / total
}

/** How much of the shorter name's words appear in the longer one. */
export function tokenContainment(a: string, b: string): number {
  const wa = new Set(a.split(' ').filter(Boolean))
  const wb = new Set(b.split(' ').filter(Boolean))
  if (!wa.size || !wb.size) return 0
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa]
  let hit = 0
  for (const w of small) if (large.has(w)) hit++
  return hit / small.size
}

export interface SimilarityResult {
  /** 0–1. Above ~0.55 is worth showing a human; 1 means the names match exactly. */
  score: number
  /** Plain-English reason, shown next to the pair so the judgement is inspectable. */
  reason: string
}

/**
 * Compare two filenames. `context` holds words to discount on both sides — pass the
 * vessel name, since "AMYRA - Registry.pdf" and "Registry.pdf" are the same document.
 */
export function compareFileNames(a: string, b: string, context: string[] = []): SimilarityResult {
  const na = normaliseFileName(a, context)
  const nb = normaliseFileName(b, context)
  if (!na || !nb) return { score: 0, reason: 'not enough of a name to compare' }
  if (na === nb) {
    return {
      score: 1,
      reason: a.toLowerCase() === b.toLowerCase() ? 'identical names' : 'same name once dates and wording are ignored',
    }
  }
  const dice = diceCoefficient(na, nb)
  const contain = tokenContainment(na, nb)
  // Containment is the stronger signal when one name is clearly inside the other.
  const score = Math.max(dice, contain >= 1 ? 0.9 : contain * 0.85 + dice * 0.15)
  const extA = (a.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? '').toLowerCase()
  const extB = (b.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? '').toLowerCase()
  const bits: string[] = []
  if (contain >= 1) bits.push('one name contains the other')
  else if (contain >= 0.6) bits.push(`${Math.round(contain * 100)}% of the words match`)
  if (dice >= 0.6) bits.push(`${Math.round(dice * 100)}% character overlap`)
  if (extA && extB && extA !== extB) bits.push(`different file types (.${extA} / .${extB})`)
  return { score, reason: bits.join(', ') || `${Math.round(score * 100)}% similar` }
}

/** The threshold above which a pair is worth a human's attention. */
export const DUPLICATE_THRESHOLD = 0.55

/**
 * Group names that look like the same document as each other — used to spot
 * duplicates WITHIN one system, not just across two.
 *
 * A yacht's SharePoint folder is where this matters most: "MY Amyra - COR_31Oct2025"
 * and "MY Amyra - COR_12Nov2030" are the same certificate reissued, and
 * "TJ Emirates ID front (1)" is a straight copy. Neither has a Polaris counterpart
 * to be compared against, so cross-system matching never sees them.
 *
 * Single-file groups are dropped — only real clusters are returned, largest first.
 */
export function groupSimilarNames<T>(
  entries: T[],
  nameOf: (t: T) => string,
  context: string[] = [],
  threshold: number = DUPLICATE_THRESHOLD,
): Array<{ members: T[]; score: number; reason: string }> {
  const used = new Set<number>()
  const groups: Array<{ members: T[]; score: number; reason: string }> = []

  for (let i = 0; i < entries.length; i++) {
    if (used.has(i)) continue
    const members = [entries[i]]
    let best = 0
    let reason = ''
    for (let j = i + 1; j < entries.length; j++) {
      if (used.has(j)) continue
      const cmp = compareFileNames(nameOf(entries[i]), nameOf(entries[j]), context)
      if (cmp.score < threshold) continue
      members.push(entries[j])
      used.add(j)
      if (cmp.score > best) { best = cmp.score; reason = cmp.reason }
    }
    if (members.length > 1) {
      used.add(i)
      groups.push({ members, score: best, reason })
    }
  }
  return groups.sort((a, b) => b.members.length - a.members.length || b.score - a.score)
}
