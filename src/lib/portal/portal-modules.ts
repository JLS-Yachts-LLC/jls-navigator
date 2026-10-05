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
      { key: "alerts",    label: "Alerts",                     blurb: "Expiring permits, visas and passports; overdue invoices; deliveries" },
      { key: "positions", label: "Positions",                  blurb: "AIS position and voyage" },
      { key: "crew",      label: "Crew, visas & immigration",  blurb: "Crew list, visa status, sign-on and sign-off" },
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
      { key: "stock",   label: "Stock & requisitions", blurb: "What's on board, minimum levels, and requisitions sent to JLS" },
      { key: "pms",     label: "Jobs & maintenance", blurb: "Planned maintenance, running hours and defects" },
      { key: "charter", label: "Guests & charter",   blurb: "Bookings, itineraries and guest preferences" },
      { key: "ism",     label: "ISM & safety",       blurb: "Certificates, drills and the safety-management record" },
    ],
  },
};

/** Which module + feature each portal section (tab key) belongs to. */
export const SECTION_FEATURE: Record<string, { module: PortalModuleKey; feature: string }> = {
  alerts:    { module: "core", feature: "alerts" },
  positions: { module: "core", feature: "positions" },
  crew:      { module: "core", feature: "crew" },
  documents: { module: "core", feature: "documents" },
  balances:  { module: "core", feature: "finance" },
  invoices:  { module: "core", feature: "finance" },
  finances:  { module: "core", feature: "finance" },
  requests:  { module: "core", feature: "requests" },
  logistics: { module: "core", feature: "logistics" },
  chat:      { module: "core", feature: "chat" },
  directory: { module: "core", feature: "chat" },
  stock:     { module: "management", feature: "stock" },
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
