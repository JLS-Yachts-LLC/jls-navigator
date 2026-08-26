/**
 * Pure data for the parametric 3D vehicle — types, the damage key, panel
 * labels, and the geometry spec generator (`bodySpec`). No `three` /
 * `@react-three/fiber` import here on purpose: this file is safe to import
 * from anywhere (including server-rendered code), unlike ./car-model.tsx and
 * ./vehicle-3d-viewport.tsx, which pull in the actual 3D rendering libraries
 * and must stay client-only (see vehicle-maintenance-page.tsx).
 */

export type BodyType = "coupe" | "sedan" | "estate" | "pickup" | "van";

// The paper Vehicle Condition Report's damage key, digitised verbatim.
export type DamageKind =
  | "scratch" | "bent" | "broken" | "cracked" | "chipped"
  | "dented" | "holed" | "missing" | "torn" | "other";
export type Severity = "minor" | "moderate" | "severe";

export const DAMAGE_KEY: Record<DamageKind, { code: string; label: string; color: string }> = {
  scratch: { code: "S",  label: "Scratch", color: "#eab308" },
  bent:    { code: "B",  label: "Bent",    color: "#f59e0b" },
  broken:  { code: "BR", label: "Broken",  color: "#ef4444" },
  cracked: { code: "C",  label: "Cracked", color: "#f97316" },
  chipped: { code: "CH", label: "Chipped", color: "#eab308" },
  dented:  { code: "D",  label: "Dented",  color: "#f59e0b" },
  holed:   { code: "H",  label: "Holed",   color: "#ef4444" },
  missing: { code: "M",  label: "Missing", color: "#dc2626" },
  torn:    { code: "T",  label: "Torn",    color: "#ef4444" },
  other:   { code: "O",  label: "Other",   color: "#a78bfa" },
};

export const KIND_COLORS = Object.fromEntries(
  Object.entries(DAMAGE_KEY).map(([k, v]) => [k, v.color]),
) as Record<DamageKind, string>;

export const SEVERITY_COLORS: Record<Severity, string> = {
  minor: "#eab308", moderate: "#f97316", severe: "#ef4444",
};

export const PANEL_LABELS: Record<string, string> = {
  body: "Body", front_bumper: "Front Bumper", rear_bumper: "Rear Bumper",
  hood: "Bonnet", roof: "Roof", trunk: "Boot Lid", tailgate: "Tailgate",
  windshield: "Windscreen", rear_window: "Rear Window", glass: "Side Glass",
  door_front_left: "Front Left Door", door_front_right: "Front Right Door",
  door_rear_left: "Rear Left Door", door_rear_right: "Rear Right Door",
  door_left: "Left Door", door_right: "Right Door",
  sliding_door_left: "Left Sliding Door", sliding_door_right: "Right Sliding Door",
  panel_rear_left: "Rear Left Panel", panel_rear_right: "Rear Right Panel",
  fender_front_left: "Front Left Wing", fender_front_right: "Front Right Wing",
  quarter_rear_left: "Rear Left Quarter", quarter_rear_right: "Rear Right Quarter",
  mirror_left: "Left Mirror", mirror_right: "Right Mirror",
  wheel_front_left: "Front Left Wheel", wheel_front_right: "Front Right Wheel",
  wheel_rear_left: "Rear Left Wheel", wheel_rear_right: "Rear Right Wheel",
  bed: "Load Bed", bed_side_left: "Left Bed Side", bed_side_right: "Right Bed Side",
  rear_doors: "Rear Doors",
};

export type Role = "paint" | "glass" | "dark" | "trim";
export type Part =
  | { panel: string; kind: "box"; pos: [number, number, number]; size: [number, number, number]; rotZ?: number; role: Role }
  | { panel: string; kind: "wheel"; pos: [number, number, number]; radius: number };

const sidePair = (panel: string, pos: [number, number, number], size: [number, number, number], role: Role = "paint"): Part[] => ([
  { panel: `${panel}_left`, kind: "box", pos: [pos[0], pos[1], pos[2]], size, role },
  { panel: `${panel}_right`, kind: "box", pos: [pos[0], pos[1], -pos[2]], size, role },
])
const wheels = (x1: number, x2: number, r: number, z = 0.82): Part[] => ([
  { panel: "wheel_front_left", kind: "wheel", pos: [x1, r, z], radius: r },
  { panel: "wheel_front_right", kind: "wheel", pos: [x1, r, -z], radius: r },
  { panel: "wheel_rear_left", kind: "wheel", pos: [x2, r, z], radius: r },
  { panel: "wheel_rear_right", kind: "wheel", pos: [x2, r, -z], radius: r },
])
const mirrors = (x: number, y: number): Part[] => sidePair("mirror", [x, y, 1.0], [0.14, 0.1, 0.16], "trim")

export function bodySpec(type: BodyType): Part[] {
  switch (type) {
    case "sedan": return [
      { panel: "body", kind: "box", pos: [0, 0.65, 0], size: [4.2, 0.6, 1.7], role: "paint" },
      { panel: "front_bumper", kind: "box", pos: [2.22, 0.6, 0], size: [0.35, 0.5, 1.78], role: "trim" },
      { panel: "rear_bumper", kind: "box", pos: [-2.22, 0.6, 0], size: [0.35, 0.5, 1.78], role: "trim" },
      { panel: "hood", kind: "box", pos: [1.45, 0.99, 0], size: [1.35, 0.1, 1.66], role: "paint" },
      { panel: "trunk", kind: "box", pos: [-1.65, 0.99, 0], size: [1.0, 0.1, 1.66], role: "paint" },
      { panel: "glass", kind: "box", pos: [-0.08, 1.22, 0], size: [1.62, 0.52, 1.42], role: "glass" },
      { panel: "windshield", kind: "box", pos: [0.78, 1.26, 0], size: [0.06, 0.68, 1.48], rotZ: -0.6, role: "glass" },
      { panel: "rear_window", kind: "box", pos: [-0.94, 1.24, 0], size: [0.06, 0.62, 1.48], rotZ: 0.55, role: "glass" },
      { panel: "roof", kind: "box", pos: [-0.1, 1.5, 0], size: [1.4, 0.08, 1.5], role: "paint" },
      ...sidePair("fender_front", [1.4, 0.66, 0.88], [0.9, 0.56, 0.06]),
      ...sidePair("door_front", [0.45, 0.66, 0.88], [0.95, 0.56, 0.06]),
      ...sidePair("door_rear", [-0.52, 0.66, 0.88], [0.95, 0.56, 0.06]),
      ...sidePair("quarter_rear", [-1.45, 0.66, 0.88], [0.85, 0.56, 0.06]),
      ...mirrors(0.88, 1.12), ...wheels(1.45, -1.45, 0.34),
    ]
    case "coupe": return [
      { panel: "body", kind: "box", pos: [0, 0.62, 0], size: [4.1, 0.55, 1.72], role: "paint" },
      { panel: "front_bumper", kind: "box", pos: [2.16, 0.56, 0], size: [0.35, 0.45, 1.8], role: "trim" },
      { panel: "rear_bumper", kind: "box", pos: [-2.16, 0.56, 0], size: [0.35, 0.45, 1.8], role: "trim" },
      { panel: "hood", kind: "box", pos: [1.4, 0.93, 0], size: [1.4, 0.1, 1.68], role: "paint" },
      { panel: "trunk", kind: "box", pos: [-1.8, 0.93, 0], size: [0.7, 0.1, 1.68], role: "paint" },
      { panel: "glass", kind: "box", pos: [-0.2, 1.12, 0], size: [1.5, 0.44, 1.4], role: "glass" },
      { panel: "windshield", kind: "box", pos: [0.66, 1.12, 0], size: [0.06, 0.72, 1.46], rotZ: -0.78, role: "glass" },
      { panel: "rear_window", kind: "box", pos: [-1.12, 1.1, 0], size: [0.06, 0.8, 1.46], rotZ: 0.8, role: "glass" },
      { panel: "roof", kind: "box", pos: [-0.22, 1.36, 0], size: [1.1, 0.08, 1.46], role: "paint" },
      ...sidePair("fender_front", [1.35, 0.62, 0.89], [0.95, 0.5, 0.06]),
      ...sidePair("door", [0.15, 0.62, 0.89], [1.4, 0.5, 0.06]),
      ...sidePair("quarter_rear", [-1.3, 0.62, 0.89], [1.4, 0.5, 0.06]),
      ...mirrors(0.78, 1.02), ...wheels(1.42, -1.42, 0.34),
    ]
    case "estate": return [
      { panel: "body", kind: "box", pos: [0, 0.65, 0], size: [4.3, 0.6, 1.7], role: "paint" },
      { panel: "front_bumper", kind: "box", pos: [2.27, 0.6, 0], size: [0.35, 0.5, 1.78], role: "trim" },
      { panel: "rear_bumper", kind: "box", pos: [-2.27, 0.6, 0], size: [0.35, 0.5, 1.78], role: "trim" },
      { panel: "hood", kind: "box", pos: [1.5, 0.99, 0], size: [1.35, 0.1, 1.66], role: "paint" },
      { panel: "glass", kind: "box", pos: [-0.5, 1.24, 0], size: [2.6, 0.55, 1.42], role: "glass" },
      { panel: "windshield", kind: "box", pos: [0.86, 1.27, 0], size: [0.06, 0.68, 1.48], rotZ: -0.6, role: "glass" },
      { panel: "rear_window", kind: "box", pos: [-1.86, 1.28, 0], size: [0.06, 0.6, 1.48], rotZ: 0.22, role: "glass" },
      { panel: "roof", kind: "box", pos: [-0.5, 1.53, 0], size: [2.5, 0.08, 1.5], role: "paint" },
      { panel: "tailgate", kind: "box", pos: [-2.12, 1.05, 0], size: [0.08, 0.75, 1.6], rotZ: 0.12, role: "paint" },
      ...sidePair("fender_front", [1.45, 0.66, 0.88], [0.9, 0.56, 0.06]),
      ...sidePair("door_front", [0.5, 0.66, 0.88], [0.95, 0.56, 0.06]),
      ...sidePair("door_rear", [-0.47, 0.66, 0.88], [0.95, 0.56, 0.06]),
      ...sidePair("quarter_rear", [-1.5, 0.66, 0.88], [1.0, 0.56, 0.06]),
      ...mirrors(0.95, 1.12), ...wheels(1.5, -1.5, 0.34),
    ]
    case "pickup": return [
      { panel: "body", kind: "box", pos: [0.15, 0.72, 0], size: [4.5, 0.65, 1.8], role: "paint" },
      { panel: "front_bumper", kind: "box", pos: [2.5, 0.65, 0], size: [0.35, 0.5, 1.88], role: "trim" },
      { panel: "rear_bumper", kind: "box", pos: [-2.2, 0.65, 0], size: [0.3, 0.45, 1.88], role: "trim" },
      { panel: "hood", kind: "box", pos: [1.72, 1.09, 0], size: [1.3, 0.12, 1.76], role: "paint" },
      { panel: "windshield", kind: "box", pos: [0.98, 1.4, 0], size: [0.06, 0.66, 1.56], rotZ: -0.5, role: "glass" },
      { panel: "glass", kind: "box", pos: [0.42, 1.35, 0], size: [1.0, 0.5, 1.5], role: "glass" },
      { panel: "roof", kind: "box", pos: [0.42, 1.64, 0], size: [1.05, 0.08, 1.58], role: "paint" },
      { panel: "rear_window", kind: "box", pos: [-0.14, 1.35, 0], size: [0.06, 0.55, 1.56], rotZ: 0.12, role: "glass" },
      ...sidePair("fender_front", [1.68, 0.74, 0.93], [1.15, 0.6, 0.06]),
      ...sidePair("door", [0.5, 0.74, 0.93], [1.15, 0.6, 0.06]),
      ...sidePair("bed_side", [-1.15, 0.98, 0.87], [1.9, 0.42, 0.1]),
      { panel: "bed", kind: "box", pos: [-1.15, 0.78, 0], size: [1.9, 0.06, 1.62], role: "dark" },
      { panel: "tailgate", kind: "box", pos: [-2.14, 0.98, 0], size: [0.1, 0.42, 1.62], role: "paint" },
      ...mirrors(1.05, 1.32), ...wheels(1.7, -1.5, 0.4, 0.86),
    ]
    case "van": return [
      { panel: "body", kind: "box", pos: [-0.1, 0.95, 0], size: [4.4, 1.3, 1.8], role: "paint" },
      { panel: "front_bumper", kind: "box", pos: [2.18, 0.6, 0], size: [0.35, 0.55, 1.86], role: "trim" },
      { panel: "rear_bumper", kind: "box", pos: [-2.38, 0.6, 0], size: [0.3, 0.5, 1.86], role: "trim" },
      { panel: "hood", kind: "box", pos: [2.0, 1.28, 0], size: [0.55, 0.1, 1.76], role: "paint" },
      { panel: "windshield", kind: "box", pos: [1.92, 1.62, 0], size: [0.06, 0.62, 1.6], rotZ: -0.32, role: "glass" },
      { panel: "roof", kind: "box", pos: [-0.25, 1.92, 0], size: [3.9, 0.09, 1.72], role: "paint" },
      { panel: "glass", kind: "box", pos: [0.6, 1.55, 0], size: [1.6, 0.5, 1.74], role: "glass" },
      { panel: "rear_doors", kind: "box", pos: [-2.28, 1.15, 0], size: [0.1, 1.45, 1.7], role: "paint" },
      ...sidePair("fender_front", [1.55, 0.72, 0.93], [0.85, 0.65, 0.06]),
      ...sidePair("door_front", [0.85, 0.95, 0.93], [0.55, 1.1, 0.06]),
      ...sidePair("sliding_door", [-0.05, 0.95, 0.93], [1.2, 1.1, 0.06]),
      ...sidePair("panel_rear", [-1.45, 0.95, 0.93], [1.55, 1.1, 0.06]),
      ...mirrors(1.95, 1.5), ...wheels(1.5, -1.55, 0.36, 0.84),
    ]
  }
}

export type Marker = { id: string; panel: string; point: { x: number; y: number; z: number } | null; kind: DamageKind; severity: Severity }
