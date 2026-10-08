/**
 * Client Portal modules — what a VESSEL has switched on. (What a PERSON sees
 * inside those modules is decided by their position: portal-positions.ts.)
 *
 *   core        "Agency with JLS" — everything JLS does for the vessel as its
 *               agent. Included for every client; staff can hide features.
 *   management  "On board" — the crew's own tools. Off until staff switch it on
 *               for the vessel.
 *
 * Rows live in yacht_portal_modules; no row means the default (core on,
 * management off). `features` records only the features switched OFF for that
 * vessel, so anything new is on everywhere until someone hides it.
 */
export type PortalModuleKey = "core" | "management";

export type PortalFeature = { key: string; label: string; blurb: string };

export const PORTAL_MODULES: Record<PortalModuleKey, {
  label: string; short: string; blurb: string; features: PortalFeature[];
}> = {
  core: {
    label: "Agency with JLS",
    short: "Core",
    blurb: "Everything JLS does for the vessel as its agent. Included for every client.",
    features: [
      { key: "brief",     label: "Today's brief",              blurb: "Today on board, what needs the vessel and the week ahead — plus the owner's monthly summary with the agent's note" },
      { key: "alerts",    label: "Alerts",                     blurb: "Expiring permits, visas and passports; overdue invoices; deliveries" },
      { key: "calendar",  label: "Compliance calendar",        blurb: "Every expiry JLS tracks for the vessel, month by month" },
      { key: "positions", label: "Positions",                  blurb: "AIS position and voyage" },
      { key: "crew",      label: "Crew, visas & immigration",  blurb: "Crew list, visa status, sign-on and sign-off" },
      { key: "movements", label: "Arrivals & departures",      blurb: "Pre-arrival / cruising permit form and seaport sign-on / sign-off requests" },
      { key: "gatepasses", label: "Gate passes",               blurb: "Request and renew quay access for contractors, visitors, vehicles, crew and deliveries" },
      { key: "documents", label: "Documents",                  blurb: "Vessel papers, permits and visas" },
      { key: "finance",   label: "Invoices & balances",        blurb: "QuickBooks invoices, quotations and statement" },
      { key: "requests",  label: "Requests & orders",          blurb: "Provisioning, bunkering, uniform, permits and more" },
      { key: "logistics", label: "Deliveries & logistics",     blurb: "Live driver position, deliveries and proof of delivery" },
      { key: "chat",      label: "Chat & directory",           blurb: "Live chat with JLS and key contacts" },
    ],
  },
  management: {
    label: "On board",
    short: "Management",
    blurb: "The crew's own tools for running the vessel. JLS sees nothing here unless the crew send it across.",
    features: [
      { key: "tasks",   label: "Tasks & backlog",      blurb: "The crew's task board — backlog, to do, in progress, waiting and done" },
      { key: "rota", label: "Crew rota & certificates", blurb: "Who's on board and who's away, leave planning, and every crew certificate with its expiry" },
      { key: "expenses", label: "Expenses & APA",      blurb: "Petty cash, crew cards and charter APA — receipts scanned, budgets against actual" },
      { key: "inventory", label: "Inventory",          blurb: "Everything the vessel owns — where it is, its condition, serials, value and warranty" },
      { key: "stock",   label: "Stock & requisitions", blurb: "What's on board, minimum levels, and requisitions sent to JLS" },
      { key: "checklists", label: "Checklists", blurb: "Departure, arrival, daily rounds, guest turnaround — the crew's own" },
      { key: "hours",   label: "Hours of rest",       blurb: "Daily rest per crew member, with the MLC minimums flagged" },
      { key: "handover", label: "Handover log",       blurb: "Notes the crew leave for the relief and the next watch" },
      { key: "pms",     label: "Jobs & maintenance", blurb: "Planned maintenance, running hours and defects" },
      { key: "charter", label: "Guests & charter",   blurb: "Bookings, itineraries and guest preferences" },
      { key: "ism",     label: "ISM & safety",       blurb: "Certificates, drills and the safety-management record" },
    ],
  },
};

/** Which module + feature each portal section (tab key) belongs to. */
export const SECTION_FEATURE: Record<string, { module: PortalModuleKey; feature: string }> = {
  brief:     { module: "core", feature: "brief" },
  alerts:    { module: "core", feature: "alerts" },
  calendar:  { module: "core", feature: "calendar" },
  positions: { module: "core", feature: "positions" },
  crew:      { module: "core", feature: "crew" },
  movements: { module: "core", feature: "movements" },
  gatepasses: { module: "core", feature: "gatepasses" },
  documents: { module: "core", feature: "documents" },
  balances:  { module: "core", feature: "finance" },
  invoices:  { module: "core", feature: "finance" },
  finances:  { module: "core", feature: "finance" },
  requests:  { module: "core", feature: "requests" },
  orders:    { module: "core", feature: "requests" },
  logistics: { module: "core", feature: "logistics" },
  chat:      { module: "core", feature: "chat" },
  directory: { module: "core", feature: "chat" },
  tasks:     { module: "management", feature: "tasks" },
  inventory: { module: "management", feature: "inventory" },
  expenses:  { module: "management", feature: "expenses" },
  rota:      { module: "management", feature: "rota" },
  stock:     { module: "management", feature: "stock" },
  checklists: { module: "management", feature: "checklists" },
  hours:     { module: "management", feature: "hours" },
  handover:  { module: "management", feature: "handover" },
  pms:       { module: "management", feature: "pms" },
  charter:   { module: "management", feature: "charter" },
  ism:       { module: "management", feature: "ism" },
};

export type PortalModuleRow = {
  module: PortalModuleKey;
  enabled: boolean;
  features: Record<string, boolean> | null;
};

export type ModuleState = {
  /** Switched on for this vessel. */
  enabled: boolean;
  /** Feature keys hidden for this vessel. */
  hidden: Set<string>;
};
export type PortalModuleState = Record<PortalModuleKey, ModuleState>;

const DEFAULT_ENABLED: Record<PortalModuleKey, boolean> = { core: true, management: false };

/** Fold the vessel's rows (or none) into one state per module. */
export function moduleState(rows: PortalModuleRow[] | null | undefined): PortalModuleState {
  const out = {} as PortalModuleState;
  for (const key of Object.keys(PORTAL_MODULES) as PortalModuleKey[]) {
    const row = rows?.find((r) => r.module === key);
    const enabled = row ? row.enabled : DEFAULT_ENABLED[key];
    const hidden = new Set(Object.entries(row?.features ?? {}).filter(([, on]) => on === false).map(([k]) => k));
    out[key] = { enabled, hidden };
  }
  return out;
}

/** Whether the vessel has this portal section switched on. Unknown sections (e.g. "home") are always on. */
export function sectionEnabled(section: string, state: PortalModuleState): boolean {
  const map = SECTION_FEATURE[section];
  if (!map) return true;
  const m = state[map.module];
  return m.enabled && !m.hidden.has(map.feature);
}

/**
 * Small-boat owners' portal sections. A managed boat has no Core / Management
 * split — it's one set of sections, any of which staff can switch off for the
 * boat. Stored like a vessel's: the boat's "core" row, `features` holding only
 * the keys switched OFF. Home is always on.
 */
export const BOAT_FEATURES: PortalFeature[] = [
  { key: "compliance", label: "Compliance",    blurb: "DMA / FMA / RYA inspections — last done and next due" },
  { key: "documents",  label: "Documents",     blurb: "The boat's papers and inspection reports" },
  { key: "jobs",       label: "Jobs",          blurb: "Work JLS has scheduled or done on the boat" },
  { key: "safety",     label: "Safety kit",    blurb: "Flares, extinguishers, life jackets — expiry dates" },
  { key: "requests",   label: "Requests",      blurb: "Ask JLS for anything, and follow it through" },
  { key: "chat",       label: "Chat with JLS", blurb: "Live chat with the team" },
];

/** The boat's switched-off sections, from its rows (none = everything on). */
export function boatHiddenSections(rows: PortalModuleRow[] | null | undefined): Set<string> {
  return moduleState(rows).core.hidden;
}
