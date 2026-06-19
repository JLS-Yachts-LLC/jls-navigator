/**
 * formatName — apply title-case capitalisation to a crew member name segment.
 *
 * Rules:
 *  - Trim whitespace; collapse internal runs to single space
 *  - Capitalise the first letter of each word (split on space and hyphen)
 *  - Preserve apostrophe-prefixed particles: O'Brien → O'Brien
 *  - Preserve hyphenated compounds:          Mary-Jane → Mary-Jane
 *  - Prefix particles (van, de, von, etc.) stay lower-case only when
 *    they appear mid-name (not at the start)
 *  - Empty / null / whitespace → ''
 */

const LOWERCASE_PARTICLES = new Set([
  'van', 'de', 'der', 'den', 'von', 'el', 'al', 'bin', 'bint', 'abu',
])

function capitaliseWord(word: string, isFirst: boolean): string {
  if (!word) return word

  // Hyphenated compound — recurse on each part
  if (word.includes('-')) {
    return word
      .split('-')
      .map((part, i) => capitaliseWord(part, i === 0 && isFirst))
      .join('-')
  }

  // Apostrophe (e.g. O'Brien) — capitalise both sides
  if (word.includes("'")) {
    const [a, ...rest] = word.split("'")
    const rejoined = [a, ...rest].join("'")
    // Capitalise first char of each apostrophe segment
    return rejoined
      .split("'")
      .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase())
      .join("'")
  }

  const lower = word.toLowerCase()

  // Particles stay lower-case unless they start the whole name
  if (!isFirst && LOWERCASE_PARTICLES.has(lower)) return lower

  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

export function formatName(value: string | null | undefined): string {
  if (!value) return ''
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed) return ''

  return trimmed
    .split(' ')
    .map((word, i) => capitaliseWord(word, i === 0))
    .join(' ')
}
