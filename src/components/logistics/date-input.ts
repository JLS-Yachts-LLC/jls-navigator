/**
 * Typing a date on a phone. Dates are shown and typed as DD/MM/YYYY (how people here write them) and kept as
 * YYYY-MM-DD everywhere else, which is what every screen and table already stores.
 */

/** Digits only, laid out as DD/MM/YYYY while typing: "1310" -> "13/10", "13102026" -> "13/10/2026". */
export function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "13/10/2026" -> "2026-10-13"; null for anything incomplete or not a real calendar date (31/02/2026). */
export function parseDate(text: string): string | null {
  const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  if (y < 1900 || y > 2100) return null;
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** "2026-10-13" -> "13/10/2026"; "" for an empty or unreadable value. */
export function formatDate(iso: string): string {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
