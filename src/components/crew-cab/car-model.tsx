/**
 * The 3D vehicle render for the Maintenance screen — an extruded side-profile
 * shell per body type (see ./car-model-geometry), so the van reads as an H1 and
 * the pickup as an F-150: curved rooflines, raked windscreens, wheel arches cut
 * into the sill, a wrapped glazing band, and drawn door seams.
 *
 * Styled as an enterprise condition-report schematic: matte white, panel lines,
 * zone highlights as translucent fills (damage amber→red, hover/selected blue).
 *
 * Tap detection is geometric: the tapped point classifies into a named panel
 * zone (classifyPoint). Front of the vehicle is +X; units roughly metres.
 *
 * This file must stay client-only — `three` blows up the SSR build's memory.
 */
import { useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { KIND_COLORS, type BodyType, type Marker, type Severity } from "./car-model-data";
import { VEHICLE_GEOMS, classifyPoint, zoneFor, type ProfileOp, type VehicleGeom, type Zone } from "./car-model-geometry";

const SEVERITY_FILL: Record<Severity, string> = {
  minor: "#eab308", moderate: "#f97316", severe: "#ef4444",
};

function tracePath(shape: THREE.Shape, ops: ProfileOp[], close = false): void {
  ops.forEach((op, i) => {
    if (i === 0) shape.moveTo(op.t === "l" ? op.x : op.x, op.y);
    else if (op.t === "l") shape.lineTo(op.x, op.y);
    else shape.quadraticCurveTo(op.cx, op.cy, op.x, op.y);
  });
  if (close) shape.closePath();
}

/** Body shell: the side profile, closed along the sill with wheel-arch arcs.
 *  The glazing band is cut out as a hole so the (wider) glass extrusion shows
 *  through from every angle — including the windscreen face. */
function shellShape(g: VehicleGeom): THREE.Shape {
  const s = new THREE.Shape();
  tracePath(s, g.outline);
  // Close along the sill rear → front, lifting over each arch.
  const sorted = [...g.arches].sort((a, b) => a.x - b.x); // rear first when walking +x
  for (const a of sorted) {
    s.lineTo(a.x - a.r, g.bottomY);
    s.absarc(a.x, g.bottomY, a.r, Math.PI, 0, true);
  }
  s.closePath();
  const hole = new THREE.Path();
  tracePath(hole as unknown as THREE.Shape, g.glass, true);
  s.holes.push(hole);
  return s;
}

function extrude(shape: THREE.Shape, width: number, bevel: number): THREE.ExtrudeGeometry {
  const depth = width - bevel * 2;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 3, curveSegments: 20,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

export function VehicleModel({
  bodyType, paint, markers, damagedPanels, onPanelTap, selectedPanel,
}: {
  bodyType: BodyType
  paint: string
  markers: Marker[]
  /** panel id → worst open severity, drives the amber/red zone fill */
  damagedPanels: Record<string, Severity>
  onPanelTap: (panel: string, point: THREE.Vector3) => void
  selectedPanel: string | null
}) {
  void paint // schematic: always matte white, whatever the real paint colour
  const [hovered, setHovered] = useState<string | null>(null)
  const downAt = useRef<{ x: number; y: number } | null>(null)

  const geom = VEHICLE_GEOMS[bodyType] ?? VEHICLE_GEOMS.sedan
  const shellGeo = useMemo(() => extrude(shellShape(geom), geom.width, 0.05), [geom])
  const glassGeo = useMemo(() => {
    const s = new THREE.Shape()
    tracePath(s, geom.glass, true)
    // Slightly wider than the shell so the band wraps the sides visibly.
    return extrude(s, geom.width + 0.03, 0.015)
  }, [geom])

  // A tap is a click only if the pointer barely moved; otherwise it was an orbit drag.
  const groupHandlers = {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => { downAt.current = { x: e.clientX, y: e.clientY } },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      const d = downAt.current
      downAt.current = null
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return
      e.stopPropagation()
      onPanelTap(classifyPoint(geom, e.point), e.point.clone())
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      const p = classifyPoint(geom, e.point)
      setHovered(h => (h === p ? h : p))
      document.body.style.cursor = "pointer"
    },
    onPointerOut: () => { setHovered(null); document.body.style.cursor = "auto" },
  }

  // Highlight overlays: selected (blue), hover (pale blue), damaged (severity).
  const overlays = useMemo(() => {
    const out: Array<{ key: string; zone: Zone | null; color: string; opacity: number }> = []
    for (const [panel, sev] of Object.entries(damagedPanels)) {
      out.push({ key: `dmg-${panel}`, zone: zoneFor(geom, panel), color: SEVERITY_FILL[sev], opacity: 0.28 })
    }
    if (hovered && hovered !== "body" && hovered !== selectedPanel) {
      out.push({ key: "hover", zone: zoneFor(geom, hovered), color: "#7dd3fc", opacity: 0.22 })
    }
    if (selectedPanel && selectedPanel !== "body") {
      out.push({ key: "sel", zone: zoneFor(geom, selectedPanel), color: "#38bdf8", opacity: 0.4 })
    }
    return out.filter(o => o.zone)
  }, [geom, damagedPanels, hovered, selectedPanel])

  const zEdge = geom.width / 2

  return (
    <group {...groupHandlers}>
      {/* Body shell */}
      <mesh geometry={shellGeo}>
        <meshStandardMaterial color="#eef1f4" metalness={0.05} roughness={0.75} />
      </mesh>
      {/* Wrapped glazing band */}
      <mesh geometry={glassGeo}>
        <meshStandardMaterial color="#8aa4b5" metalness={0.15} roughness={0.3} transparent opacity={0.96} />
      </mesh>
      {/* Windscreen / rear-screen sheets — the wrapped band only shows on the
          sides, so the front and rear glazing are laid on the surface as thin
          angled plates, slightly proud of the shell. */}
      {(geom.screens ?? []).map((sc, i) => {
        const dx = sc.x2 - sc.x1, dy = sc.y2 - sc.y1
        const len = Math.hypot(dx, dy)
        const ang = Math.atan2(dy, dx)
        // Outward normal: rotate the direction -90° and flip so it points away
        // from the body centre (positive x for front screens, negative for rear).
        let nx = dy / len, ny = -dx / len
        const midX = (sc.x1 + sc.x2) / 2
        if ((midX >= 0 && nx < 0) || (midX < 0 && nx > 0)) { nx = -nx; ny = -ny }
        return (
          <mesh key={"screen-" + i}
            position={[midX + nx * 0.03, (sc.y1 + sc.y2) / 2 + ny * 0.03, 0]}
            rotation={[0, 0, ang]}>
            <boxGeometry args={[len, 0.03, geom.width - 0.22]} />
            <meshStandardMaterial color="#8aa4b5" metalness={0.15} roughness={0.3} />
          </mesh>
        )
      })}
      {/* Door / panel seam lines on both sides */}
      {geom.seams.map((x, i) => (
        <group key={`seam-${i}`}>
          <mesh position={[x, (geom.seamY[0] + geom.seamY[1]) / 2, zEdge + 0.012]}>
            <boxGeometry args={[0.014, geom.seamY[1] - geom.seamY[0], 0.01]} />
            <meshBasicMaterial color="#9aa7b4" />
          </mesh>
          <mesh position={[x, (geom.seamY[0] + geom.seamY[1]) / 2, -zEdge - 0.012]}>
            <boxGeometry args={[0.014, geom.seamY[1] - geom.seamY[0], 0.01]} />
            <meshBasicMaterial color="#9aa7b4" />
          </mesh>
        </group>
      ))}
      {/* Wheels: tyre + hub, tucked into the arches */}
      {geom.arches.map((a, i) => ([1, -1] as const).map(side => (
        <group key={`wheel-${i}-${side}`} position={[a.x, geom.wheelR + 0.02, side * (zEdge - 0.14)]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[geom.wheelR, geom.wheelR, 0.24, 28]} />
            <meshStandardMaterial color="#454d57" roughness={0.9} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, side * 0.005]}>
            <cylinderGeometry args={[geom.wheelR * 0.55, geom.wheelR * 0.55, 0.25, 24]} />
            <meshStandardMaterial color="#c6cdd4" roughness={0.5} />
          </mesh>
        </group>
      )))}
      {/* Mirrors on stalks */}
      {geom.mirror && ([1, -1] as const).map(side => (
        <group key={`mirror-${side}`} position={[geom.mirror!.x, geom.mirror!.y, side * (zEdge - 0.02)]}>
          {/* stalk grows outward from the door skin, head on its end */}
          <mesh position={[0, 0, side * 0.09]}>
            <boxGeometry args={[0.05, 0.04, 0.16]} />
            <meshStandardMaterial color="#dfe4e9" roughness={0.7} />
          </mesh>
          <mesh position={[-0.01, 0.03, side * 0.19]}>
            <boxGeometry args={[0.09, 0.15, 0.06]} />
            <meshStandardMaterial color="#eef1f4" roughness={0.7} />
          </mesh>
        </group>
      ))}
      {/* Dark plates (pickup bed floor) */}
      {(geom.darkPlates ?? []).map((pl, i) => (
        <mesh key={`plate-${i}`} position={[(pl.x[0] + pl.x[1]) / 2, pl.y, (pl.z[0] + pl.z[1]) / 2]}>
          <boxGeometry args={[Math.abs(pl.x[1] - pl.x[0]), 0.04, Math.abs(pl.z[1] - pl.z[0])]} />
          <meshStandardMaterial color="#5d6772" roughness={0.9} />
        </mesh>
      ))}
      {/* Zone highlights — translucent fills over the affected panel */}
      {overlays.map(o => {
        const zn = o.zone!
        const zr = zn.z ?? [-zEdge - 0.06, zEdge + 0.06]
        const cx = (zn.x[0] + zn.x[1]) / 2, cy = (zn.y[0] + zn.y[1]) / 2, cz = (zr[0] + zr[1]) / 2
        return (
          <mesh key={o.key} position={[cx, cy, cz]} renderOrder={2}>
            <boxGeometry args={[Math.abs(zn.x[1] - zn.x[0]), Math.abs(zn.y[1] - zn.y[0]), Math.abs(zr[1] - zr[0])]} />
            <meshBasicMaterial color={o.color} transparent opacity={o.opacity} depthWrite={false} />
          </mesh>
        )
      })}
      {/* Damage markers at the exact touched point */}
      {markers.filter(m => m.point).map(m => (
        <mesh key={m.id} position={[m.point!.x, m.point!.y, m.point!.z]} renderOrder={3}>
          <sphereGeometry args={[0.055, 16, 16]} />
          <meshStandardMaterial color={KIND_COLORS[m.kind] ?? "#a78bfa"} emissive={KIND_COLORS[m.kind] ?? "#a78bfa"} emissiveIntensity={0.8} />
        </mesh>
      ))}
    </group>
  )
}

