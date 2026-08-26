/**
 * Pure data for the parametric 3D vehicle — types, the damage key, panel
 * labels. No `three` /
 * `@react-three/fiber` import here on purpose: this file is safe to import
 * from anywhere (including server-rendered code), unlike ./car-model.tsx and
 * ./vehicle-3d-viewport.tsx, which pull in the actual 3D rendering libraries
 * and must stay client-only (see vehicle-maintenance-page.tsx).
 */

export type BodyType = "hatchback" | "sedan" | "estate" | "pickup" | "van";

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


export type Marker = { id: string; panel: string; point: { x: number; y: number; z: number } | null; kind: DamageKind; severity: Severity }
