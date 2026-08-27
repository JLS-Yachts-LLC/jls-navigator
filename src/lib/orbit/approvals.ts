/**
 * ORBIT tiered spend approvals — the chain rules.
 *
 * Adopted from the Orbit Yacht Flow demo: how many approvals a spend needs is
 * derived from its VALUE, not chosen by hand. Small spend clears itself; larger
 * spend escalates. Foreign-currency amounts are normalised to the base currency
 * (AED) first, so the limits mean one thing across every vendor.
 *
 * Pure functions — no Supabase, no React — so the rules can be reasoned about
 * and unit-tested on their own.
 */

export type OrbitApproverRole = "captain" | "technical_manager" | "owner";

export type ApprovalStatus =
  | "not_required"
  | "awaiting_approval"
  | "approved"
  | "auto_approved"
  | "rejected";

export type ApprovalPolicy = {
  /** At or below this, the spend auto-approves (no human stage). */
  captainLimit: number;
  /** At or below this, captain + technical manager. Above it, the owner too. */
  managerLimit: number;
  baseCurrency: string;
};

export const ROLE_LABELS: Record<OrbitApproverRole, string> = {
  captain: "Captain",
  technical_manager: "Technical Manager",
  owner: "Owner / Client",
};

export const STATUS_LABELS: Record<ApprovalStatus, string> = {
  not_required: "No approval needed",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  auto_approved: "Auto-approved",
  rejected: "Rejected",
};

/** Rate table: currency → how many base units one unit is worth. */
export type FxRates = Record<string, number>;

/**
 * Convert to the base currency. An unknown currency is a hard error rather than
 * a silent 1:1 — guessing a rate would corrupt the number the limits are
 * compared against, which is the one thing that must not be wrong.
 */
export function toBase(amount: number, currency: string, rates: FxRates): number {
  const rate = rates[(currency || "").toUpperCase()];
  if (!rate || !Number.isFinite(rate)) {
    throw new Error(`No exchange rate configured for ${currency || "(blank)"} — add it under ORBIT → Approvals.`);
  }
  return Math.round(amount * rate * 100) / 100;
}

/**
 * The chain a given base-currency amount requires.
 * Empty array = clears without a human approval.
 */
export function chainFor(amountBase: number, policy: ApprovalPolicy): OrbitApproverRole[] {
  if (amountBase <= policy.captainLimit) return [];
  if (amountBase <= policy.managerLimit) return ["captain", "technical_manager"];
  return ["captain", "technical_manager", "owner"];
}

/** Who is being waited on right now (1-indexed stage), or null when finished. */
export function currentApprover(
  chain: OrbitApproverRole[],
  stagesCompleted: number,
): OrbitApproverRole | null {
  return chain[stagesCompleted] ?? null;
}

export type ChainPlan = {
  amountBase: number;
  chain: OrbitApproverRole[];
  totalStages: number;
  /** Status to record the moment the spend is submitted. */
  initialStatus: Extract<ApprovalStatus, "auto_approved" | "awaiting_approval">;
  /** Plain-English reason, shown in the UI and written to the audit trail. */
  rationale: string;
};

const money = (n: number, currency: string) =>
  `${currency} ${n.toLocaleString("en-AE", { maximumFractionDigits: 2 })}`;

/** Everything the UI and the writer need to know about one submitted amount. */
export function planApproval(
  amount: number,
  currency: string,
  policy: ApprovalPolicy,
  rates: FxRates,
): ChainPlan {
  const amountBase = toBase(amount, currency, rates);
  const chain = chainFor(amountBase, policy);
  const base = policy.baseCurrency;
  const converted = currency.toUpperCase() !== base
    ? ` (${money(amount, currency.toUpperCase())} → ${money(amountBase, base)})`
    : "";

  if (chain.length === 0) {
    return {
      amountBase, chain, totalStages: 0, initialStatus: "auto_approved",
      rationale: `Auto-approved: ${money(amountBase, base)}${converted} is within the captain's limit of ${money(policy.captainLimit, base)}.`,
    };
  }
  const last = ROLE_LABELS[chain[chain.length - 1]];
  const threshold = chain.length === 2 ? policy.captainLimit : policy.managerLimit;
  return {
    amountBase, chain, totalStages: chain.length, initialStatus: "awaiting_approval",
    rationale: `${money(amountBase, base)}${converted} exceeds ${money(threshold, base)} — ${chain.length} approvals required, up to ${last}.`,
  };
}

/** Progress a chain by one approval. Returns the new status and stage. */
export function advance(
  chain: OrbitApproverRole[],
  stagesCompleted: number,
  action: "approve" | "reject",
): { status: ApprovalStatus; stage: number; complete: boolean } {
  if (action === "reject") {
    return { status: "rejected", stage: stagesCompleted, complete: true };
  }
  const stage = stagesCompleted + 1;
  const complete = stage >= chain.length;
  return { status: complete ? "approved" : "awaiting_approval", stage, complete };
}

/** Can this user act on this stage? Global admins can act on any stage. */
export function canActOnStage(
  chain: OrbitApproverRole[],
  stagesCompleted: number,
  userRoles: OrbitApproverRole[],
  isGlobalAdmin: boolean,
): boolean {
  const needed = currentApprover(chain, stagesCompleted);
  if (!needed) return false;
  return isGlobalAdmin || userRoles.includes(needed);
}
