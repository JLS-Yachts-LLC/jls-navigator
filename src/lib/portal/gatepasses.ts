/** Gate pass request types and statuses — shared by the portal screen and /api/portal/gatepasses. */

export const GATE_PASS_TYPES = [
  { value: "contractor", label: "Contractors", blurb: "Engineers, technicians, cleaners working on board" },
  { value: "visitor", label: "Visitors", blurb: "Guests, surveyors, brokers coming aboard" },
  { value: "vehicle", label: "Vehicle", blurb: "A car or van coming onto the quay" },
  { value: "crew", label: "Crew", blurb: "Crew who need quay access" },
  { value: "delivery", label: "Delivery", blurb: "A supplier dropping off" },
] as const;

/** The client-facing status of a pass request, from its JLS request's status. */
export function gatePassStatus(requestStatus: string | null | undefined): { label: string; tone: "green" | "amber" | "red" | "sky" | "slate" } {
  switch (requestStatus) {
    case "acknowledged": return { label: "With JLS", tone: "sky" };
    case "in_progress": return { label: "Applied", tone: "sky" };
    case "completed": return { label: "Issued", tone: "green" };
    case "cancelled": return { label: "Cancelled", tone: "red" };
    default: return { label: "Requested", tone: "amber" };
  }
}
