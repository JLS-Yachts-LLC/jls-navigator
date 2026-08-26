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
  coupe: {
    width: 1.84, bottomY: 0.36, wheelR: 0.33,
    arches: [{ x: 1.42, r: 0.43 }, { x: -1.42, r: 0.43 }],
    outline: [
      l(2.25, 0.36), l(2.25, 0.56), q(2.25, 0.72, 2.08, 0.75), l(0.95, 0.85),
      q(0.75, 0.88, 0.55, 1.0), l(0.2, 1.24), q(0.0, 1.31, -0.35, 1.3),
      l(-0.7, 1.26), q(-1.3, 1.14, -1.75, 0.88), q(-2.05, 0.82, -2.18, 0.78),
      q(-2.25, 0.74, -2.25, 0.6), l(-2.25, 0.36),
    ],
    glass: [
      l(0.68, 0.92), l(0.28, 1.2), q(0.05, 1.26, -0.3, 1.25), l(-0.62, 1.21),
      q(-1.1, 1.1, -1.48, 0.9), l(-1.36, 0.86),
    ],
    mirror: { x: 0.58, y: 0.95 },
    seams: [0.95, -0.55], seamY: [0.4, 0.88],
    zones: [
      ...wheelZones(1.42, -1.42, 0.43, 1.15), ...mirrorZones(0.58, 0.95),
      { panel: "front_bumper", x: [2.05, 2.5], y: [0, 0.65] },
      { panel: "rear_bumper", x: [-2.5, -2.05], y: [0, 0.65] },
      { panel: "hood", x: [0.6, 2.05], y: [0.68, 1.05] },
      { panel: "windshield", x: [0.14, 0.6], y: [0.95, 1.4] },
      { panel: "roof", x: [-0.7, 0.14], y: [1.15, 1.5] },
      { panel: "rear_window", x: [-1.6, -0.7], y: [0.88, 1.35] },
      { panel: "trunk", x: [-2.05, -1.6], y: [0.72, 0.95] },
      { panel: "glass", x: [-1.48, 0.68], y: [0.86, 1.3] },
      ...LR("fender_front", [0.95, 2.05], [0.22, 0.88], 1.15),
      ...LR("door", [-0.55, 0.95], [0.22, 0.88], 1.15),
      ...LR("quarter_rear", [-2.05, -0.55], [0.22, 0.88], 1.15),
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
