/**
 * Orbit 2 — the service categories, and the colour each one carries.
 *
 * One colour per category, used by the donut, the calendar blocks and anywhere
 * else a category appears, so a colour always means the same service wherever
 * you see it. Taken from the client's own dashboard.
 */
export const ORBIT2_CATEGORIES = [
  "Vessel Services",
  "Vessel Equipment",
  "Bunkering",
  "Technical Support",
  "Port Compliance",
] as const;

export type Orbit2Category = (typeof ORBIT2_CATEGORIES)[number];

export const CATEGORY_COLOR: Record<string, string> = {
  "Vessel Services": "#7C8FE8",
  "Vessel Equipment": "#9A70E8",
  "Bunkering": "#E8559F",
  "Technical Support": "#E87050",
  "Port Compliance": "#E8C020",
};

/** Anything entered outside the five known services still needs a colour. */
export const OTHER_COLOR = "#4A7090";
export const colorFor = (category: string) => CATEGORY_COLOR[category] ?? OTHER_COLOR;

/** Complete / Pending, as shown on Client Project Status. */
export const COMPLETE_COLOR = "#4C7DF0";
export const PENDING_COLOR = "#B07CF0";
