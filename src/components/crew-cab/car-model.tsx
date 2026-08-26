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
import type * as THREE from "three";
import {
  bodySpec, KIND_COLORS, SEVERITY_COLORS,
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

  const roleColor: Record<Role, string> = {
    paint, glass: "#1d3040", dark: "#20262e", trim: "#2c333c",
  }

  function emissiveFor(panel: string): { color: string; intensity: number } {
    if (panel === selectedPanel) return { color: "#22d3ee", intensity: 0.55 }
    if (hovered === panel) return { color: "#22d3ee", intensity: 0.3 }
    const sev = damagedPanels[panel]
    if (sev) return { color: SEVERITY_COLORS[sev], intensity: 0.4 }
    return { color: "#000000", intensity: 0 }
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
        const em = emissiveFor(p.panel)
        if (p.kind === "wheel") {
          return (
            <mesh key={i} position={p.pos} rotation={[Math.PI / 2, 0, 0]} {...handlers(p.panel)}>
              <cylinderGeometry args={[p.radius, p.radius, 0.26, 24]} />
              <meshStandardMaterial color="#15181d" roughness={0.9} emissive={em.color} emissiveIntensity={em.intensity} />
            </mesh>
          )
        }
        return (
          <mesh key={i} position={p.pos} rotation={[0, 0, p.rotZ ?? 0]} {...handlers(p.panel)}>
            <boxGeometry args={p.size} />
            <meshStandardMaterial
              color={roleColor[p.role]}
              metalness={p.role === "paint" ? 0.55 : p.role === "glass" ? 0.1 : 0.3}
              roughness={p.role === "paint" ? 0.35 : p.role === "glass" ? 0.15 : 0.7}
              transparent={p.role === "glass"}
              opacity={p.role === "glass" ? 0.85 : 1}
              emissive={em.color}
              emissiveIntensity={em.intensity}
            />
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
