/**
 * On board crew rota & certificates — the kinds of time away and the
 * certificate types, shared by the portal screen, /api/portal/rota, Alerts,
 * the Compliance calendar and Hours of rest.
 */

export const AWAY_KINDS = [
  { key: "leave", label: "Leave", tone: "bg-sky-500/70" },
  { key: "training", label: "Training", tone: "bg-violet-500/70" },
  { key: "travel", label: "Travel", tone: "bg-amber-500/70" },
  { key: "sick", label: "Sick", tone: "bg-red-500/70" },
  { key: "other", label: "Away", tone: "bg-slate-500/70" },
] as const;
export type AwayKind = (typeof AWAY_KINDS)[number]["key"];
export const awayLabel = (k: string) => AWAY_KINDS.find((a) => a.key === k)?.label ?? "Away";

export type RotationEntry = {
  id: string; crew_member_id: string; kind: AwayKind; start_date: string; end_date: string;
  status: "planned" | "confirmed"; notes: string | null; jls_request_id: string | null; created_by_name: string | null;
};

/** The entry covering this crew member on this day, if they're away. */
export function awayOn<T extends { crew_member_id: string; start_date: string; end_date: string }>(entries: T[], crewId: string, day: string): T | null {
  return entries.find((e) => e.crew_member_id === crewId && e.start_date <= day && e.end_date >= day) ?? null;
}

/** Certificate types a yacht crew typically holds. */
export const CERT_TYPES = [
  { key: "stcw_basic", label: "STCW Basic Safety" },
  { key: "stcw_aff", label: "STCW Advanced Fire Fighting" },
  { key: "stcw_medical", label: "Medical First Aid / Medical Care" },
  { key: "stcw_security", label: "Security Awareness / PDSD" },
  { key: "eng1", label: "ENG1 Medical" },
  { key: "coc", label: "Certificate of Competency (CoC)" },
  { key: "gmdss", label: "GMDSS / Radio" },
  { key: "yachtmaster", label: "Yachtmaster" },
  { key: "powerboat", label: "Powerboat / Tender" },
  { key: "food_hygiene", label: "Food Hygiene" },
  { key: "ships_cook", label: "Ship's Cook" },
  { key: "pwc", label: "PWC / Jet Ski" },
  { key: "dive", label: "Dive" },
  { key: "other", label: "Other" },
] as const;
export const certTypeLabel = (k: string | null | undefined) => CERT_TYPES.find((c) => c.key === k)?.label ?? (k || "Certificate");

/** Expiring soon = within this many days. */
export const CERT_WARN_DAYS = 90;
