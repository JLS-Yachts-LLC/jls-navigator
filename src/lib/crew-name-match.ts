/**
 * Crew name normalisation + fuzzy matching.
 *
 * Shared by the server (SharePoint folder resolution, duplicate scanning) and the
 * client (duplicate review screen), so a name is judged identically everywhere.
 * Pure functions only — no server imports — so it is safe in the browser bundle.
 */

/**
 * Fold accented letters to plain ASCII: "JOVAN ČAVOR" → "JOVAN CAVOR".
 *
 * Passport OCR reads the diacritics on a name exactly as printed, which then ends
 * up in folder names staff can't type or search for. Any remaining non-ASCII
 * (e.g. non-Latin scripts) is dropped rather than left to become an unsearchable
 * folder name.
 */
export function toTypeableName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    // Ligatures and stroked letters carry no combining mark, so map them by hand.
    .replace(/[ØøŒœÆæÐðÞþŁłĐđŊŋŦŧ]/g, (c) =>
      ({ Ø: "O", ø: "o", Œ: "OE", œ: "oe", Æ: "AE", æ: "ae", Ð: "D", ð: "d",
         Þ: "TH", þ: "th", Ł: "L", ł: "l", Đ: "D", đ: "d", Ŋ: "N", ŋ: "n",
         Ŧ: "T", ŧ: "t" })[c] ?? c)
    .replace(/ß/g, "ss")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Case- and accent-insensitive key: "JOVAN ČAVOR" and "Jovan Cavor" must match. */
export const nameKey = (s: string) =>
  toTypeableName(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Levenshtein edit distance. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * 0–1 similarity between two people's names, order-insensitive.
 *
 * Compares the sorted word sets so "Cavor Jovan" scores the same as "Jovan
 * Cavor", and takes the better of (whole-string ratio, shared-word ratio) so an
 * extra middle name or a "(Deck)" suffix doesn't sink an obvious match.
 */
export function nameSimilarity(a: string, b: string): number {
  const ka = nameKey(a), kb = nameKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;

  const wa = ka.split(" ").filter(Boolean), wb = kb.split(" ").filter(Boolean);
  const sortedA = [...wa].sort().join(" "), sortedB = [...wb].sort().join(" ");
  const maxLen = Math.max(sortedA.length, sortedB.length);
  const whole = maxLen ? 1 - levenshtein(sortedA, sortedB) / maxLen : 0;

  // Shared-word ratio against the SHORTER name, so "Jovan Cavor" vs
  // "Jovan James Cavor" scores 1.0 on this measure.
  const setB = new Set(wb);
  const shared = wa.filter((w) => setB.has(w)).length;
  const words = shared / Math.max(1, Math.min(wa.length, wb.length));

  // A single shared word ("John" vs "John Smith") is far too weak on its own.
  const wordScore = shared >= 2 || (shared === 1 && Math.min(wa.length, wb.length) === 1) ? words : words * 0.5;
  return Math.max(whole, wordScore);
}

/** Group items whose names are similar enough to be the same person. Only
 *  real groups (2 or more) are returned. */
export function groupSimilar<T>(items: T[], label: (t: T) => string, threshold = 0.82): T[][] {
  const groups: T[][] = [];
  const used = new Set<number>();
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const group = [items[i]];
    used.add(i);
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue;
      // Compare against every member so a chain (A~B, B~C) lands in one group.
      if (group.some((g) => nameSimilarity(label(g), label(items[j])) >= threshold)) {
        group.push(items[j]);
        used.add(j);
      }
    }
    if (group.length > 1) groups.push(group);
  }
  return groups;
}
