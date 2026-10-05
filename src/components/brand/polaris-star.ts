/**
 * The Polaris star — the single definition behind every place it appears:
 * the browser favicon and home-screen icon (scripts/make-favicons.mjs), the
 * login logo (PolarisLogo) and the app's top bar (PolarisMark).
 *
 * An eight-point north star, elongated north–south, in the official brand
 * colours — #07435E Teal Blue · #4590BA Dodger Blue · #96CBC7 Jamaica Bay — on a
 * Teal Blue tile. Lit from the top-left: on each main point the facet facing
 * up/left is white and the other Jamaica Bay. Every facet is a solid shape and
 * nothing overlaps at partial opacity, so it stays crisp down to 16 px.
 *
 * Pure data with no imports, so Node can load it as-is for the favicon build.
 * Change it here, then run `node scripts/make-favicons.mjs` so the icon files
 * match what the app draws.
 */
export const POLARIS_STAR = {
  /** Square grid the coordinates live on, centred on (32,32). */
  size: 64,
  tileRadius: 14,
  /** A gentle top-to-bottom shade around Teal Blue #07435E. */
  tileGradient: { top: "#0A5272", bottom: "#063A52" },
  polygons: [
    // Diagonal points (Dodger Blue), drawn first so the main star sits on top.
    { points: "45.4,18.6 35.2,32 45.4,45.4 32,35.2 18.6,45.4 28.8,32 18.6,18.6 32,28.8", fill: "#4590BA" },
    // North
    { points: "32,5 27.5,27.5 32,32", fill: "#FFFFFF" },
    { points: "32,5 36.5,27.5 32,32", fill: "#96CBC7" },
    // East
    { points: "54,32 36.5,27.5 32,32", fill: "#FFFFFF" },
    { points: "54,32 36.5,36.5 32,32", fill: "#96CBC7" },
    // South
    { points: "32,59 27.5,36.5 32,32", fill: "#FFFFFF" },
    { points: "32,59 36.5,36.5 32,32", fill: "#96CBC7" },
    // West
    { points: "10,32 27.5,27.5 32,32", fill: "#FFFFFF" },
    { points: "10,32 27.5,36.5 32,32", fill: "#96CBC7" },
  ],
} as const;
