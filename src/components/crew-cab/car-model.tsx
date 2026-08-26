/**
 * Parametric 3D vehicle for the Maintenance screen — the actual react-three-fiber
 * render, built entirely from primitives (no downloaded model), so it works
 * offline, loads instantly, and every mesh can be a NAMED PANEL: tap the
 * bonnet and the app knows it's the bonnet. `bodySpec(type)` (in
 * ./car-model-data, no `three` import) reshapes the same component into a
 * coupe, sedan, estate, pickup or van — recognisable silhouettes, not CAD.
 *
 * Front of the vehicle is +X. Units are roughly metres.
 *
 * This file (and ./vehicle-3d-viewport.tsx, which renders it) must stay
 * client-only — `three` / `@react-three/fiber` blew up the SSR build's
 * memory when pulled in there. Import types/constants from ./car-model-data
 * instead of here wherever `three` isn't actually needed.
 */
import { useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { Edges } from "@react-three/drei";
import type * as THREE from "three";
import {
  bodySpec, KIND_COLORS,
  type BodyType, type Marker, type Role, type Severity,
} from "./car-model-data";

export function VehicleModel({
  bodyType, paint, markers, damagedPanels, onPanelTap, selectedPanel,
}: {
  bodyType: BodyType
  paint: string
  markers: Marker[]
  /** panel id → worst open severity, for the amber/red tint */
  damagedPanels: Record<string, Severity>
  onPanelTap: (panel: string, point: THREE.Vector3) => void
  selectedPanel: string | null
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const parts = useMemo(() => bodySpec(bodyType), [bodyType])
  const downAt = useRef<{ x: number; y: number } | null>(null)

  // Enterprise schematic: the vehicle is always matte white with drawn panel
  // lines — the visual language of an insurance condition-report diagram.
  // State is shown as a pastel FILL of the panel, not a glow: damage severity
  // in amber→red, hover/selection in blue. The real paint colour is ignored.
  void paint
  const roleColor: Record<Role, string> = {
    paint: "#eef1f4", glass: "#c5d4de", dark: "#d5dbe2", trim: "#dee4ea",
  }
  const SEVERITY_FILL: Record<Severity, string> = {
    minor: "#fde68a", moderate: "#fdba74", severe: "#fca5a5",
  }

  function fillFor(panel: string, base: string): string {
    if (panel === selectedPanel) return "#7dd3fc"
    if (hovered === panel) return "#bae6fd"
    const sev = damagedPanels[panel]
    if (sev) return SEVERITY_FILL[sev]
    return base
  }

  // A tap is a click only if the pointer barely moved — otherwise it was an
  // orbit drag. Works identically for touch and mouse.
  const handlers = (panel: string) => ({
    onPointerDown: (e: ThreeEvent<PointerEvent>) => { downAt.current = { x: e.clientX, y: e.clientY } },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      const d = downAt.current
      if (!d) return
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y)
      downAt.current = null
      if (moved > 8) return
      e.stopPropagation()
      onPanelTap(panel, e.point.clone())
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(panel); document.body.style.cursor = "pointer" },
    onPointerOut: () => { setHovered(h => (h === panel ? null : h)); document.body.style.cursor = "auto" },
  })

  return (
    <group>
      {parts.map((p, i) => {
        if (p.kind === "wheel") {
          return (
            <mesh key={i} position={p.pos} rotation={[Math.PI / 2, 0, 0]} {...handlers(p.panel)}>
              <cylinderGeometry args={[p.radius, p.radius, 0.26, 24]} />
              <meshStandardMaterial color={fillFor(p.panel, "#adb7c2")} metalness={0} roughness={0.85} />
              <Edges threshold={30} color="#64748b" />
            </mesh>
          )
        }
        return (
          <mesh key={i} position={p.pos} rotation={[0, 0, p.rotZ ?? 0]} {...handlers(p.panel)}>
            <boxGeometry args={p.size} />
            <meshStandardMaterial
              color={fillFor(p.panel, roleColor[p.role])}
              metalness={0}
              roughness={0.9}
              transparent={p.role === "glass"}
              opacity={p.role === "glass" ? 0.92 : 1}
            />
            {/* Drawn panel lines — the schematic look */}
            <Edges threshold={15} color="#64748b" />
          </mesh>
        )
      })}
      {/* Damage markers at the exact touched point */}
      {markers.filter(m => m.point).map(m => (
        <mesh key={m.id} position={[m.point!.x, m.point!.y, m.point!.z]}>
          <sphereGeometry args={[0.055, 16, 16]} />
          <meshStandardMaterial color={KIND_COLORS[m.kind] ?? "#a78bfa"} emissive={KIND_COLORS[m.kind] ?? "#a78bfa"} emissiveIntensity={0.8} />
        </mesh>
      ))}
    </group>
  )
}
