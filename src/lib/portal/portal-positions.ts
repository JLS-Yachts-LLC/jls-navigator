/**
 * Client-portal positions (captain_accounts.position, stored lowercase) and which
 * portal sections each one is NOT shown. Shared by the admin screen, the portal
 * menu and the portal APIs, so a hidden section is refused by the server too —
 * not just left out of the menu.
 *
 * The Captain, Relief Captain and deck officers (and any unknown/blank position)
 * see everything. Owner / Representative don't get the operational sections
 * (PMS, ISM); the Purser is finance/paperwork-focused; interior crew (Chief
 * Stewardess, Chef) keep the day-to-day sections but not the vessel's accounts.
 */
export const PORTAL_POSITIONS = [
  "captain", "relief_captain", "chief_officer", "second_officer",
  "chief_stewardess", "chef", "purser", "owner", "representative", "other",
] as const;

const POSITION_LABELS: Record<string, string> = {
  relief_captain: "Relief Captain",
  chief_officer: "Chief Officer",
  second_officer: "Second Officer",
  chief_stewardess: "Chief Stewardess",
};
export const positionLabel = (p: string) => POSITION_LABELS[p] ?? p.charAt(0).toUpperCase() + p.slice(1);

const HIDDEN_BY_POSITION: Record<string, string[]> = {
  owner: ["pms", "ism", "stock", "checklists"],
  representative: ["pms", "ism", "stock", "checklists"],
  purser: ["pms", "ism", "positions", "charter"],
  chief_stewardess: ["pms", "ism", "balances", "invoices"],
  chef: ["pms", "ism", "balances", "invoices"],
};

/** Portal section keys hidden from this position. */
export function hiddenSections(position: string | null | undefined): Set<string> {
  return new Set(HIDDEN_BY_POSITION[(position ?? "").trim().toLowerCase()] ?? []);
}

/** Whether this position may see the vessel's invoices, quotations and balances. */
export function canSeeFinance(position: string | null | undefined): boolean {
  const hidden = hiddenSections(position);
  return !hidden.has("invoices") && !hidden.has("balances");
}

/**
 * Positions that only view the crew list. Interior crew (Chief Stewardess, Chef)
 * see their shipmates but adding, editing and removing crew is left to the
 * Captain, officers and the vessel's management.
 */
const CREW_VIEW_ONLY = new Set(["chief_stewardess", "chef"]);

/** Whether this position may add, edit and remove the vessel's crew. */
export function canManageCrew(position: string | null | undefined): boolean {
  return !CREW_VIEW_ONLY.has((position ?? "").trim().toLowerCase());
}

/** Whether this position may change the vessel's own profile (its logo). Same people as crew. */
export function canManageVessel(position: string | null | undefined): boolean {
  return canManageCrew(position);
}

/**
 * Positions that approve requisitions raised on board and send them to JLS.
 * Anyone who can see Stock can raise one; the Captain, Relief Captain, Chief
 * Officer and Purser (and a blank position, which is treated as the Captain)
 * sign them off. Approving is what turns a crew list into an order with JLS.
 */
const REQUISITION_APPROVERS = new Set(["", "captain", "relief_captain", "chief_officer", "purser"]);

/** Whether this position may approve a requisition and send it to JLS. */
export function canApproveRequisition(position: string | null | undefined): boolean {
  return REQUISITION_APPROVERS.has((position ?? "").trim().toLowerCase());
}
