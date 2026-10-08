/**
 * "Open this record" across portal sections: one section notes what to open,
 * switches tab, and the next section picks it up when it loads. Kept in
 * sessionStorage for a minute so it never reopens something on a later visit.
 */
type FocusKind = "task" | "inventory";
const KEY = "polaris.portal.focus";
const TTL_MS = 60_000;

/** Ask the next section to open this record. */
export function focusNext(kind: FocusKind, id: string) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ kind, id, at: Date.now() })); } catch { /* private mode */ }
}

/** The record this section was asked to open, if any (read once). */
export function takeFocus(kind: FocusKind): string | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) || "null") as { kind: FocusKind; id: string; at: number } | null;
    if (!raw || raw.kind !== kind) return null;
    sessionStorage.removeItem(KEY);
    return Date.now() - raw.at < TTL_MS ? raw.id : null;
  } catch { return null; }
}
