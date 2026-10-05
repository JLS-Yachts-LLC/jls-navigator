/**
 * On board checklists — how often each is due, whether it's due now, and a
 * starter library a vessel can copy and adapt. Shared by the portal screen and
 * /api/portal/checklists.
 */

export type ChecklistItem = { id: string; label: string; section?: string | null };
export type ChecklistResult = { done: boolean; note?: string | null; by?: string | null; at?: string | null };

export const CHECKLIST_FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "before_departure", label: "Before departure" },
  { value: "on_arrival", label: "On arrival" },
  { value: "guest_turnaround", label: "Guest turnaround" },
  { value: "as_needed", label: "As needed" },
] as const;
export const frequencyLabel = (f: string) => CHECKLIST_FREQUENCIES.find((x) => x.value === f)?.label ?? f;

/** Days a completed run covers, for the frequencies that recur on the calendar. */
const PERIOD_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };

/**
 * Whether a calendar checklist is due now, from when it was last completed.
 * Daily means "not yet completed today"; event checklists (before departure,
 * on arrival…) are never "due" by the calendar — the crew start them when the
 * event comes round.
 */
export function checklistDue(frequency: string, lastCompletedAt: string | null, now = new Date()): boolean {
  const days = PERIOD_DAYS[frequency];
  if (!days) return false;
  if (!lastCompletedAt) return true;
  const last = new Date(lastCompletedAt);
  if (days === 1) return last.toDateString() !== now.toDateString();
  return now.getTime() - last.getTime() >= days * 86400000;
}

/** A short, stable id for a new checklist item. */
export function newItemId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Item progress on a run. */
export function runProgress(items: ChecklistItem[], results: Record<string, ChecklistResult>): { done: number; total: number } {
  return { done: items.filter((i) => results[i.id]?.done).length, total: items.length };
}

type LibraryEntry = { key: string; title: string; department: string; frequency: string; items: Array<[section: string, label: string]> };

/**
 * Starter checklists. Copied into the vessel's own list when chosen, so each
 * vessel edits its copy freely. Written as general good practice — the vessel's
 * own SMS procedures take precedence.
 */
export const CHECKLIST_LIBRARY: LibraryEntry[] = [
  {
    key: "departure", title: "Pre-departure", department: "deck", frequency: "before_departure",
    items: [
      ["Bridge", "Passage plan prepared and briefed"], ["Bridge", "Weather and NAVTEX checked"],
      ["Bridge", "Navigation lights, horn and nav equipment tested"], ["Bridge", "VHF / DSC radios checked"],
      ["Engine room", "Engines and generators checked, fluid levels correct"], ["Engine room", "Fuel quantity confirmed for the passage"],
      ["Engine room", "Bilges dry and alarms tested"], ["Deck", "Lines, fenders and anchor ready"],
      ["Deck", "Tender and toys secured for sea"], ["Deck", "Hatches, doors and portholes closed"],
      ["Interior", "Loose items stowed throughout"], ["Safety", "Crew and guest count confirmed"],
      ["Safety", "Port clearance and exit documents on board"],
    ],
  },
  {
    key: "arrival", title: "On arrival", department: "deck", frequency: "on_arrival",
    items: [
      ["Deck", "Lines and fenders set, springs adjusted"], ["Deck", "Gangway rigged and safe"],
      ["Engine room", "Shore power connected and checked"], ["Engine room", "Engines shut down and logged"],
      ["Bridge", "Arrival logged with time and position"], ["Agency", "JLS notified of arrival"],
      ["Agency", "Arrival / entry documents ready for authorities"], ["Safety", "Security watch set"],
    ],
  },
  {
    key: "engine-daily", title: "Engine room daily rounds", department: "engine", frequency: "daily",
    items: [
      ["Generators", "Running hours recorded"], ["Generators", "Oil and coolant levels"],
      ["Machinery", "Leaks, unusual noise or vibration"], ["Machinery", "Bilge levels and pumps"],
      ["Systems", "Fresh water and black/grey tank levels"], ["Systems", "Watermaker running correctly"],
      ["Systems", "AC and refrigeration temperatures"], ["Safety", "Fire detection panel clear"],
    ],
  },
  {
    key: "guest-turnaround", title: "Guest turnaround", department: "interior", frequency: "guest_turnaround",
    items: [
      ["Cabins", "Cabins cleaned and made up"], ["Cabins", "Linen and towels changed"],
      ["Cabins", "Amenities restocked"], ["Guest areas", "Saloon and decks detailed"],
      ["Guest areas", "Flowers and welcome touches in place"], ["Galley", "Preference sheet reviewed and allergies briefed"],
      ["Galley", "Provisioning complete for the menu"], ["Bar", "Bar stocked to the preference sheet"],
      ["Crew", "Crew briefed on guests and itinerary"],
    ],
  },
  {
    key: "safety-weekly", title: "Weekly safety walk", department: "safety", frequency: "weekly",
    items: [
      ["Fire", "Extinguishers in place and in date"], ["Fire", "Fire doors and dampers working"],
      ["Life-saving", "Liferafts secure, service dates in date"], ["Life-saving", "Lifejackets and lights in place"],
      ["Life-saving", "EPIRB and SART tested and in date"], ["Medical", "First aid kits stocked"],
      ["General", "Emergency lighting tested"], ["General", "Escape routes clear"],
    ],
  },
  {
    key: "galley-daily", title: "Galley daily", department: "galley", frequency: "daily",
    items: [
      ["Hygiene", "Fridge and freezer temperatures recorded"], ["Hygiene", "Surfaces sanitised"],
      ["Hygiene", "Date labels checked, out-of-date stock removed"], ["Equipment", "Gas / induction and extraction safe"],
      ["Stock", "Low items noted for the next requisition"],
    ],
  },
];

/** A library entry as the template rows the API stores. */
export function libraryItems(entry: LibraryEntry): ChecklistItem[] {
  return entry.items.map(([section, label], i) => ({ id: `${entry.key}-${i + 1}`, label, section }));
}
