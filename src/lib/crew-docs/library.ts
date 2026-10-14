/**
 * A crew member's document list — shared by the crew profile's Documents card
 * and the guest API, so a guest is shown exactly what staff see on the card.
 *
 * Two sources become one list:
 *   • passport files — COLUMNS on crew_passports (cover, inside pages, headshot,
 *     seaman's book, verification letter), keyed "passport:<id>:<column>";
 *   • crew_documents rows, keyed "doc:<id>".
 * Then `matchSharePoint` works out which of them already exist in the crew
 * member's SharePoint folder, and which SharePoint files exist only there.
 *
 * Pure — no I/O — so it runs in the browser and on the Worker alike.
 */

export type CrewDocInput = {
  id: string; doc_type: string | null; title: string | null; file_url: string | null;
  file_name: string | null; issue_date?: string | null; expiry_date: string | null;
};

export type CrewItem = {
  /** Stable key used for folder placement + SharePoint mirror bookkeeping. */
  docKey: string;
  label: string;
  meta: string;
  stored: string;
  /** Name the file should carry in SharePoint (storage names are unreadable). */
  spName: string;
  /** Highlight the meta line — an expiry inside 90 days. */
  warn?: boolean;
  /** Belongs to a passport that has since been replaced. */
  superseded?: boolean;
  /** Name-matching hints for spotting the same file in SharePoint. */
  match?: { anyOf: string[][]; exclude?: string[]; rank: number };
};

export type CrewSpFile = { id: string; name: string; folder: string | null; isFolder: boolean; webUrl: string | null; size?: number | null; lastModified?: string | null };

export const fmtCrewDate = (d: string | null) =>
  d ? new Date(d + (d.length === 10 ? "T00:00" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const titleCase = (s: string | null | undefined) =>
  s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";
const isSoon = (d: string | null, days = 90) => !!d && new Date(d) < new Date(Date.now() + days * 86400000);
export const crewNameKey = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const extOf = (url: string, fallback = "pdf") => {
  const clean = url.split("?")[0];
  const dot = clean.lastIndexOf(".");
  const ext = dot > 0 ? clean.slice(dot + 1) : "";
  return /^[a-z0-9]{2,5}$/i.test(ext) ? ext.toLowerCase() : fallback;
};
/** Storage names look like "data_1782975609871.jpg" — give SharePoint something readable. */
const spFileName = (crewName: string, label: string, stored: string) =>
  `${crewName} - ${label}`.replace(/[\\/:*?"<>|]/g, "-").trim() + "." + extOf(stored);

/**
 * SharePoint copies of these files were named by hand over the years
 * ("Jovan Cavor Passport.jpg", "… SDB.jpg", "… Photo.jpg"), so an exact filename
 * comparison would report everything as Polaris-only. Each passport slot instead
 * carries the words its SharePoint counterpart is likely to contain. Higher rank
 * wins first so "… Passport External Cover.jpg" is claimed by the cover slot
 * before the inside-pages slot can take it.
 */
export const PASSPORT_SLOTS: { col: string; label: string; match: CrewItem["match"] }[] = [
  { col: "cover_url", label: "Passport — front cover", match: { anyOf: [["cover"]], rank: 3 } },
  { col: "headshot_url", label: "Headshot photo", match: { anyOf: [["photo"], ["headshot"], ["picture"]], rank: 3 } },
  { col: "seamans_book_url", label: "Seaman's book", match: { anyOf: [["sdb"], ["srb"], ["seaman"]], rank: 3 } },
  { col: "crew_verification_letter_url", label: "Crew verification letter", match: { anyOf: [["verification"]], rank: 3 } },
  { col: "document_url", label: "Passport — inside pages", match: { anyOf: [["passport"]], exclude: ["cover"], rank: 1 } },
];
export const PASSPORT_COLUMNS = PASSPORT_SLOTS.map((s) => s.col);

/**
 * The unified file list. Passports must be sorted newest/primary first (as the
 * profile page loads them): the first is the active passport, the rest have
 * been superseded.
 */
export function buildCrewItems(passports: any[], docs: CrewDocInput[], crewName: string): CrewItem[] {
  const out: CrewItem[] = [];
  passports.forEach((pp: any, pi: number) => {
    const superseded = pi > 0;
    const suffix = superseded ? ` (${pp.passport_number || "previous passport"})` : "";
    for (const slot of PASSPORT_SLOTS) {
      const stored = pp[slot.col];
      if (!stored) continue;
      // The verification letter replaces the seaman's book slot when present.
      if (slot.col === "seamans_book_url" && pp.crew_verification_letter_url) continue;
      out.push({
        docKey: `passport:${pp.id}:${slot.col}`,
        label: slot.label + suffix,
        meta: superseded
          ? `Previous passport${pp.expiry_date ? ` · Expired ${fmtCrewDate(pp.expiry_date)}` : ""}`
          : "Passport file",
        stored,
        spName: spFileName(crewName, slot.label, stored),
        superseded,
        // Only the active passport competes for the hand-named SharePoint files.
        match: superseded ? undefined : slot.match,
      });
    }
  });
  for (const d of docs) {
    if (!d.file_url) continue;
    const label = d.title || d.file_name || titleCase(d.doc_type);
    out.push({
      docKey: `doc:${d.id}`,
      label,
      meta: `${titleCase(d.doc_type)}${d.expiry_date ? ` · Expires ${fmtCrewDate(d.expiry_date)}` : ""}`,
      stored: d.file_url,
      spName: d.file_name || spFileName(crewName, label, d.file_url),
      warn: isSoon(d.expiry_date),
    });
  }
  return out;
}

/**
 * Which files exist in SharePoint. A recorded push is proof; otherwise fall
 * back to filename matching so files put there before Polaris (or by hand)
 * still register. Each SharePoint file is claimed by at most one document,
 * most specific slot first. Whatever is left over lives only in SharePoint.
 */
export function matchSharePoint(
  items: CrewItem[],
  links: Record<string, { webUrl: string | null }>,
  spItems: CrewSpFile[],
): { byDoc: Record<string, { inSp: boolean; webUrl: string | null }>; unclaimed: CrewSpFile[] } {
  const out: Record<string, { inSp: boolean; webUrl: string | null }> = {};
  const files = spItems.filter((i) => !i.isFolder);
  const claimed = new Set<string>();

  for (const it of items) {
    const recorded = links[it.docKey];
    if (recorded) out[it.docKey] = { inSp: true, webUrl: recorded.webUrl };
  }
  // Exact names first (crew_documents rows carry their real filename).
  const storedName = (it: CrewItem) => decodeURIComponent(it.stored.split("?")[0].split("/").pop() ?? "");
  for (const it of items) {
    if (out[it.docKey]) continue;
    const wanted = [crewNameKey(it.spName), crewNameKey(storedName(it))];
    const hit = files.find((f) => !claimed.has(f.id) && wanted.includes(crewNameKey(f.name)));
    if (hit) { claimed.add(hit.id); out[it.docKey] = { inSp: true, webUrl: hit.webUrl }; }
  }
  // Then the hand-named passport files, most specific slot first.
  for (const it of [...items].filter((i) => i.match && !out[i.docKey]).sort((a, b) => (b.match!.rank - a.match!.rank))) {
    const m = it.match!;
    const hit = files.find((f) => {
      if (claimed.has(f.id)) return false;
      const k = crewNameKey(f.name);
      if (m.exclude?.some((x) => k.includes(x))) return false;
      return m.anyOf.some((tokens) => tokens.every((t) => k.includes(t)));
    });
    if (hit) { claimed.add(hit.id); out[it.docKey] = { inSp: true, webUrl: hit.webUrl }; }
  }
  for (const it of items) if (!out[it.docKey]) out[it.docKey] = { inSp: false, webUrl: null };
  const recordedUrls = new Set(Object.values(links).map((l) => l?.webUrl).filter(Boolean) as string[]);
  const unclaimed = files.filter((f) => !claimed.has(f.id) && !(f.webUrl && recordedUrls.has(f.webUrl)));
  return { byDoc: out, unclaimed };
}
