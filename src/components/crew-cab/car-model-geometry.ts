/**
 * Profile-based vehicle geometry (v2) — pure data, no `three` import.
 *
 * Each body type is described as a SIDE PROFILE (x = length, front +X; y = up)
 * that the client-side renderer extrudes across the width, cutting the wheel
 * arches into the sill. Silhouette accuracy is what makes the van read as a
 * Hyundai H1 and the pickup as an F-150 — not surface detail.
 */
import type { BodyType } from "./car-model-data";

export type ProfileOp =
  | { t: "l"; x: number; y: number }
  | { t: "q"; cx: number; cy: number; x: number; y: number };

export type Zone = { panel: string; x: [number, number]; y: [number, number]; z?: [number, number] };

export type VehicleGeom = {
  width: number;
  bottomY: number;
  /** Top outline from FRONT-BOTTOM over the vehicle to REAR-BOTTOM; the renderer
   *  closes it back along the sill, inserting the wheel-arch arcs. The first op
   *  is the start point. */
  outline: ProfileOp[];
  arches: { x: number; r: number }[];
  wheelR: number;
  /** Closed outline of the wrapped glazing band (windscreen + side windows). */
  glass: ProfileOp[];
  mirror?: { x: number; y: number };
  /** Vertical door/panel seam lines drawn on the body sides, at these x positions. */
  seams: number[];
  seamY: [number, number];
  /** Glass plates laid ON the outer surface (windscreen, rear screen): a
   *  profile-space segment from (x1,y1) to (x2,y2), rendered as an angled
   *  sheet across the width. The wrapped band only shows on the SIDES —
   *  these are what make the front and rear glazing visible. */
  screens?: { x1: number; y1: number; x2: number; y2: number }[];
  /** Extra dark plates (e.g. a pickup's open load bed floor). */
  darkPlates?: { panel: string; x: [number, number]; y: number; z: [number, number] }[];
  /** Tap zones, first match wins; anything unmatched is 'body'. */
  zones: Zone[];
};

const l = (x: number, y: number): ProfileOp => ({ t: "l", x, y });
const q = (cx: number, cy: number, x: number, y: number): ProfileOp => ({ t: "q", cx, cy, x, y });
/** Left/right zone pair (left = +z). */
const LR = (panel: string, x: [number, number], y: [number, number], zEdge: number): Zone[] => ([
  { panel: panel + "_left", x, y, z: [0.15, zEdge] },
  { panel: panel + "_right", x, y, z: [-zEdge, -0.15] },
]);
const wheelZones = (xf: number, xr: number, r: number, zEdge: number): Zone[] => ([
  { panel: "wheel_front_left", x: [xf - r, xf + r], y: [0, r * 2.3], z: [0.3, zEdge] },
  { panel: "wheel_front_right", x: [xf - r, xf + r], y: [0, r * 2.3], z: [-zEdge, -0.3] },
  { panel: "wheel_rear_left", x: [xr - r, xr + r], y: [0, r * 2.3], z: [0.3, zEdge] },
  { panel: "wheel_rear_right", x: [xr - r, xr + r], y: [0, r * 2.3], z: [-zEdge, -0.3] },
]);
const mirrorZones = (x: number, y: number): Zone[] => ([
  { panel: "mirror_left", x: [x - 0.2, x + 0.2], y: [y - 0.18, y + 0.18], z: [0.8, 1.3] },
  { panel: "mirror_right", x: [x - 0.2, x + 0.2], y: [y - 0.18, y + 0.18], z: [-1.3, -0.8] },
]);

export const VEHICLE_GEOMS: Record<BodyType, VehicleGeom> = {
  // Hyundai H1-class monobox: short sloped nose, raked screen flowing into a
  // long gently-curved roof, near-vertical tail.
  van: {
    width: 1.88, bottomY: 0.42, wheelR: 0.35,
    arches: [{ x: 1.72, r: 0.45 }, { x: -1.55, r: 0.45 }],
    outline: [
      l(2.5, 0.42), l(2.5, 0.88), q(2.5, 1.06, 2.3, 1.1), l(2.16, 1.13),
      q(2.02, 1.16, 1.94, 1.26), l(1.56, 1.72), q(1.44, 1.82, 1.2, 1.84),
      q(-0.6, 1.92, -2.1, 1.85), q(-2.4, 1.83, -2.44, 1.6), l(-2.46, 0.42),
    ],
    glass: [
      l(2.06, 1.18), l(1.62, 1.68), q(1.5, 1.75, 1.26, 1.76), l(-2.18, 1.74),
      q(-2.3, 1.73, -2.31, 1.6), l(-2.33, 1.2), l(-2.28, 1.17), l(2.0, 1.15),
    ],
    mirror: { x: 1.78, y: 1.34 },
    screens: [
      { x1: 1.96, y1: 1.24, x2: 1.55, y2: 1.73 },
      { x1: -2.44, y1: 1.65, x2: -2.46, y2: 1.1 },
    ],
    seams: [1.15, 0.45, -0.75], seamY: [0.46, 1.16],
    zones: [
      ...wheelZones(1.72, -1.55, 0.45, 1.2), ...mirrorZones(1.78, 1.34),
      { panel: "front_bumper", x: [2.3, 2.75], y: [0, 0.78] },
      { panel: "rear_bumper", x: [-2.75, -2.3], y: [0, 0.55] },
      { panel: "hood", x: [1.95, 2.75], y: [0.95, 1.35] },
      { panel: "windshield", x: [1.45, 2.15], y: [1.25, 1.95] },
      { panel: "roof", x: [-2.3, 1.55], y: [1.66, 2.1] },
      { panel: "rear_doors", x: [-2.75, -2.28], y: [0.55, 1.85] },
      { panel: "glass", x: [-2.28, 1.5], y: [1.16, 1.68] },
      ...LR("fender_front", [1.15, 2.3], [0.25, 1.18], 1.2),
      ...LR("door_front", [0.45, 1.15], [0.25, 1.18], 1.2),
      ...LR("sliding_door", [-0.75, 0.45], [0.25, 1.18], 1.2),
      ...LR("panel_rear", [-2.28, -0.75], [0.25, 1.18], 1.2),
    ],
  },
  sedan: {
    width: 1.82, bottomY: 0.4, wheelR: 0.33,
    arches: [{ x: 1.45, r: 0.43 }, { x: -1.45, r: 0.43 }],
    outline: [
      l(2.35, 0.4), l(2.35, 0.6), q(2.35, 0.76, 2.18, 0.8), l(1.0, 0.92),
      q(0.8, 0.95, 0.62, 1.06), l(0.28, 1.36), q(0.12, 1.44, -0.18, 1.44),
      l(-0.85, 1.42), q(-1.05, 1.4, -1.28, 1.22), l(-1.68, 1.04),
      q(-1.95, 1.0, -2.22, 0.98), q(-2.35, 0.96, -2.35, 0.8), l(-2.35, 0.4),
    ],
    glass: [
      l(0.74, 0.98), l(0.33, 1.32), q(0.15, 1.38, -0.15, 1.38), l(-0.8, 1.36),
      q(-0.98, 1.34, -1.2, 1.18), l(-1.44, 1.02), l(-1.36, 0.98),
    ],
    mirror: { x: 0.64, y: 1.02 },
    screens: [
      { x1: 0.64, y1: 1.05, x2: 0.27, y2: 1.37 },
      { x1: -0.95, y1: 1.37, x2: -1.62, y2: 1.07 },
    ],
    seams: [1.0, 0.0, -0.95], seamY: [0.44, 0.96],
    zones: [
      ...wheelZones(1.45, -1.45, 0.43, 1.15), ...mirrorZones(0.64, 1.02),
      { panel: "front_bumper", x: [2.15, 2.6], y: [0, 0.72] },
      { panel: "rear_bumper", x: [-2.6, -2.15], y: [0, 0.72] },
      { panel: "hood", x: [0.66, 2.15], y: [0.74, 1.12] },
      { panel: "windshield", x: [0.2, 0.66], y: [1.0, 1.55] },
      { panel: "roof", x: [-0.9, 0.2], y: [1.3, 1.65] },
      { panel: "rear_window", x: [-1.4, -0.9], y: [1.0, 1.55] },
      { panel: "trunk", x: [-2.15, -1.4], y: [0.85, 1.2] },
      { panel: "glass", x: [-1.44, 0.74], y: [0.97, 1.4] },
      ...LR("fender_front", [1.0, 2.15], [0.25, 0.97], 1.15),
      ...LR("door_front", [0.0, 1.0], [0.25, 0.97], 1.15),
      ...LR("door_rear", [-0.95, 0.0], [0.25, 0.97], 1.15),
      ...LR("quarter_rear", [-2.15, -0.95], [0.25, 0.97], 1.15),
    ],
  },
  // Tiida-class hatchback: short rear overhang, roof running back into a
  // steep glassed tailgate, four side doors.
  hatchback: {
    width: 1.78, bottomY: 0.38, wheelR: 0.32,
    arches: [{ x: 1.35, r: 0.42 }, { x: -1.3, r: 0.42 }],
    outline: [
      l(2.15, 0.38), l(2.15, 0.6), q(2.15, 0.76, 2.0, 0.8), l(0.95, 0.92),
      q(0.75, 0.95, 0.58, 1.06), l(0.25, 1.42), q(0.08, 1.5, -0.2, 1.5),
      l(-1.2, 1.48), q(-1.5, 1.46, -1.78, 1.2), l(-2.0, 0.95),
      q(-2.1, 0.9, -2.1, 0.72), l(-2.1, 0.38),
    ],
    glass: [
      l(0.7, 0.98), l(0.32, 1.38), q(0.15, 1.44, -0.15, 1.44), l(-1.15, 1.42),
      q(-1.42, 1.4, -1.62, 1.16), l(-1.7, 0.98), l(-1.6, 0.95),
    ],
    mirror: { x: 0.6, y: 1.02 },
    screens: [
      { x1: 0.6, y1: 1.05, x2: 0.24, y2: 1.43 },
      { x1: -1.72, y1: 1.26, x2: -1.98, y2: 0.97 },
    ],
    seams: [0.95, 0.0, -0.9], seamY: [0.42, 0.94],
    zones: [
      ...wheelZones(1.35, -1.3, 0.42, 1.12), ...mirrorZones(0.6, 1.02),
      { panel: "front_bumper", x: [1.95, 2.35], y: [0, 0.7] },
      { panel: "rear_bumper", x: [-2.35, -1.95], y: [0, 0.65] },
      { panel: "hood", x: [0.62, 1.95], y: [0.75, 1.12] },
      { panel: "windshield", x: [0.18, 0.62], y: [1.0, 1.6] },
      { panel: "roof", x: [-1.25, 0.18], y: [1.35, 1.7] },
      { panel: "rear_window", x: [-1.85, -1.25], y: [1.05, 1.6] },
      { panel: "tailgate", x: [-2.35, -1.85], y: [0.65, 1.1] },
      { panel: "glass", x: [-1.7, 0.7], y: [0.95, 1.46] },
      ...LR("fender_front", [0.95, 1.95], [0.22, 0.95], 1.12),
      ...LR("door_front", [0.0, 0.95], [0.22, 0.95], 1.12),
      ...LR("door_rear", [-0.9, 0.0], [0.22, 0.95], 1.12),
      ...LR("quarter_rear", [-1.95, -0.9], [0.22, 0.95], 1.12),
    ],
  },
  estate: {
    width: 1.82, bottomY: 0.4, wheelR: 0.34,
    arches: [{ x: 1.5, r: 0.44 }, { x: -1.5, r: 0.44 }],
    outline: [
      l(2.4, 0.4), l(2.4, 0.62), q(2.4, 0.78, 2.22, 0.82), l(1.05, 0.94),
      q(0.85, 0.97, 0.66, 1.08), l(0.34, 1.4), q(0.16, 1.48, -0.15, 1.48),
      l(-1.75, 1.46), q(-2.0, 1.44, -2.18, 1.2), l(-2.3, 0.92),
      q(-2.4, 0.88, -2.4, 0.7), l(-2.4, 0.4),
    ],
    glass: [
      l(0.8, 1.0), l(0.4, 1.36), q(0.2, 1.42, -0.1, 1.42), l(-1.7, 1.4),
      q(-1.88, 1.38, -2.02, 1.16), l(-2.1, 0.98), l(-2.0, 0.96),
    ],
    mirror: { x: 0.68, y: 1.04 },
    screens: [
      { x1: 0.68, y1: 1.07, x2: 0.33, y2: 1.41 },
      { x1: -2.14, y1: 1.24, x2: -2.31, y2: 0.95 },
    ],
    seams: [1.05, 0.05, -0.95], seamY: [0.44, 0.98],
    zones: [
      ...wheelZones(1.5, -1.5, 0.44, 1.15), ...mirrorZones(0.68, 1.04),
      { panel: "front_bumper", x: [2.2, 2.65], y: [0, 0.74] },
      { panel: "rear_bumper", x: [-2.65, -2.25], y: [0, 0.6] },
      { panel: "hood", x: [0.7, 2.2], y: [0.76, 1.14] },
      { panel: "windshield", x: [0.26, 0.7], y: [1.02, 1.58] },
      { panel: "roof", x: [-1.8, 0.26], y: [1.34, 1.7] },
      { panel: "rear_window", x: [-2.3, -1.8], y: [1.0, 1.55] },
      { panel: "tailgate", x: [-2.65, -2.25], y: [0.6, 1.1] },
      { panel: "glass", x: [-2.1, 0.8], y: [0.98, 1.42] },
      ...LR("fender_front", [1.05, 2.2], [0.25, 0.98], 1.15),
      ...LR("door_front", [0.05, 1.05], [0.25, 0.98], 1.15),
      ...LR("door_rear", [-0.95, 0.05], [0.25, 0.98], 1.15),
      ...LR("quarter_rear", [-2.25, -0.95], [0.25, 0.98], 1.15),
    ],
  },
  pickup: {
    width: 1.95, bottomY: 0.5, wheelR: 0.38,
    arches: [{ x: 1.78, r: 0.5 }, { x: -1.68, r: 0.5 }],
    outline: [
      l(2.65, 0.5), l(2.65, 0.95), q(2.65, 1.1, 2.48, 1.13), l(1.35, 1.2),
      q(1.15, 1.22, 1.02, 1.3), l(0.75, 1.68), q(0.62, 1.76, 0.35, 1.77),
      l(-0.08, 1.77), q(-0.22, 1.77, -0.24, 1.6), l(-0.26, 1.14),
      l(-2.52, 1.12), q(-2.65, 1.1, -2.65, 0.98), l(-2.65, 0.5),
    ],
    glass: [
      l(1.26, 1.26), l(0.84, 1.64), q(0.7, 1.7, 0.4, 1.7), l(-0.06, 1.7),
      l(-0.15, 1.26),
    ],
    mirror: { x: 1.32, y: 1.42 },
    screens: [
      { x1: 1.04, y1: 1.29, x2: 0.74, y2: 1.69 },
      { x1: -0.23, y1: 1.6, x2: -0.25, y2: 1.16 },
    ],
    seams: [1.25, -0.28], seamY: [0.55, 1.14],
    darkPlates: [{ panel: "bed", x: [-2.5, -0.32], y: 1.0, z: [-0.8, 0.8] }],
    zones: [
      ...wheelZones(1.78, -1.68, 0.5, 1.2), ...mirrorZones(1.32, 1.42),
      { panel: "front_bumper", x: [2.45, 2.9], y: [0, 0.85] },
      { panel: "rear_bumper", x: [-2.9, -2.55], y: [0, 0.6] },
      { panel: "hood", x: [1.05, 2.45], y: [1.02, 1.4] },
      { panel: "windshield", x: [0.7, 1.32], y: [1.25, 1.9] },
      { panel: "roof", x: [-0.3, 0.7], y: [1.58, 2.0] },
      { panel: "rear_window", x: [-0.38, -0.08], y: [1.2, 1.75] },
      { panel: "tailgate", x: [-2.9, -2.48], y: [0.6, 1.3] },
      { panel: "bed", x: [-2.48, -0.3], y: [0.9, 1.35], z: [-0.78, 0.78] },
      ...LR("bed_side", [-2.48, -0.3], [0.5, 1.3], 1.25),
      { panel: "glass", x: [-0.15, 1.28], y: [1.24, 1.72] },
      ...LR("fender_front", [1.25, 2.45], [0.3, 1.02], 1.25),
      ...LR("door", [-0.28, 1.25], [0.3, 1.25], 1.25),
    ],
  },
};

/** Classify a tapped 3D point into a panel; anything unmatched is the body. */
export function classifyPoint(geom: VehicleGeom, p: { x: number; y: number; z: number }): string {
  for (const zn of geom.zones) {
    if (p.x < Math.min(...zn.x) || p.x > Math.max(...zn.x)) continue;
    if (p.y < Math.min(...zn.y) || p.y > Math.max(...zn.y)) continue;
    if (zn.z && (p.z < Math.min(...zn.z) || p.z > Math.max(...zn.z))) continue;
    return zn.panel;
  }
  return "body";
}

/** The first zone box for a panel — where the highlight overlay renders. */
export function zoneFor(geom: VehicleGeom, panel: string): Zone | null {
  return geom.zones.find(z => z.panel === panel) ?? null;
}
