import { describe, it, expect } from "vitest";
import {
  requiresQuotationForEmail,
  PERMIT_RENEWAL_REMINDER_TYPES,
  type PermitType,
} from "@/lib/permit-types";

// SD-0070: Feature request - FMA Cruising Permit renewal reminder + quotation.
// These are pure-function tests only; no Supabase rows are created or
// touched, so there is no live data to clean up.
describe("SD-0070: FMA Cruising Permit renewal reminder gating", () => {
  it("flags Cruising Permit types (mothership & tenders) as needing a quotation + expiry date", () => {
    expect(requiresQuotationForEmail("cruising_mothership")).toBe(true);
    expect(requiresQuotationForEmail("cruising_tenders")).toBe(true);
  });

  it("leaves other permit types unaffected (no behaviour change for them)", () => {
    const unaffected: PermitType[] = [
      "exit_entry",
      "sanitation",
      "gate_pass",
      "tdra",
      "navigation_license",
      "dma",
      "abu_dhabi",
    ];
    for (const t of unaffected) {
      expect(requiresQuotationForEmail(t)).toBe(false);
    }
  });

  it("keeps PERMIT_RENEWAL_REMINDER_TYPES consistent with the helper", () => {
    expect(PERMIT_RENEWAL_REMINDER_TYPES).toEqual(["cruising_mothership", "cruising_tenders"]);
    for (const t of PERMIT_RENEWAL_REMINDER_TYPES) {
      expect(requiresQuotationForEmail(t)).toBe(true);
    }
  });
});
