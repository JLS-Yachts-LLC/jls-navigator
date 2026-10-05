/** Order categories — shared by the portal screen and /api/portal/orders. */
export const ORDER_CATEGORIES = [
  { value: "provisioning", label: "Provisioning", blurb: "Food, drinks, galley & interior supplies", requestCategory: "provisioning" },
  { value: "bunkering", label: "Fuel & lubricants", blurb: "Bunkering, oils, AdBlue", requestCategory: "bunkering" },
  { value: "uniform", label: "Uniform", blurb: "Crew uniform & workwear", requestCategory: "uniform" },
  { value: "spares", label: "Spares & parts", blurb: "Engineering spares and parts", requestCategory: "general" },
  { value: "chandlery", label: "Chandlery", blurb: "Deck, safety & general chandlery", requestCategory: "general" },
  { value: "other", label: "Something else", blurb: "Anything else you need", requestCategory: "general" },
] as const;

/** The client-facing status of an order, from its JLS request's status. */
export function orderStatus(requestStatus: string | null | undefined): { label: string; tone: "green" | "amber" | "red" | "sky" | "slate" } {
  switch (requestStatus) {
    case "acknowledged": return { label: "With JLS", tone: "sky" };
    case "in_progress": return { label: "Being sourced", tone: "sky" };
    case "completed": return { label: "Delivered", tone: "green" };
    case "cancelled": return { label: "Cancelled", tone: "red" };
    default: return { label: "Placed", tone: "amber" };
  }
}
