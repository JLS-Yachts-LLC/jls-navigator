/**
 * The actual 3D canvas for Vehicle Maintenance — split out from
 * vehicle-maintenance-page.tsx so it can be `React.lazy`-loaded and rendered
 * client-only. `three` / `@react-three/fiber` / `@react-three/drei` have no
 * business in a server render (no WebGL context exists there) and blew up
 * the SSR build's memory when imported at the page's top level. Keep this
 * file's imports client-only-safe.
 */
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import type * as THREE from "three";
import { VehicleModel } from "./car-model";
import type { BodyType, Marker, Severity } from "./car-model-data";

export default function Vehicle3DViewport({
  bodyType, paint, markers, damagedPanels, selectedPanel, onPanelTap,
}: {
  bodyType: BodyType
  paint: string
  markers: Marker[]
  damagedPanels: Record<string, Severity>
  selectedPanel: string | null
  onPanelTap: (panel: string, point: THREE.Vector3) => void
}) {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [4.6, 2.8, 4.6], fov: 42 }} style={{ touchAction: "none" }}>
      <ambientLight intensity={0.65} />
      <directionalLight position={[6, 9, 4]} intensity={1.3} />
      <directionalLight position={[-6, 4, -5]} intensity={0.4} />
      <VehicleModel
        bodyType={bodyType}
        paint={paint}
        markers={markers}
        damagedPanels={damagedPanels}
        selectedPanel={selectedPanel}
        onPanelTap={onPanelTap}
      />
      <ContactShadows position={[0, 0.01, 0]} opacity={0.5} scale={12} blur={2.2} far={3} />
      <OrbitControls enablePan={false} minDistance={3.2} maxDistance={10} maxPolarAngle={1.5} />
    </Canvas>
  );
}
