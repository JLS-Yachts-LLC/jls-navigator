import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { FleetVehicle } from "@/lib/mygps.server";

// Default Leaflet marker assets break under bundlers; we use custom divIcons anyway.
function vehicleIcon(v: FleetVehicle) {
  const color = v.online ? "#1e40af" : "#94a3b8";
  return L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div style="position:relative;width:30px;height:30px;">
      <div style="position:absolute;inset:0;transform:rotate(${v.course}deg);display:flex;align-items:center;justify-content:center;">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.4));">
          <path d="M12 2 L19 21 L12 17 L5 21 Z"/>
        </svg>
      </div>
    </div>`,
  });
}

function FitBounds({ vehicles, once }: { vehicles: FleetVehicle[]; once: React.MutableRefObject<boolean> }) {
  const map = useMap();
  useEffect(() => {
    if (once.current) return;
    const pts = vehicles.filter(v => v.lat != null && v.lon != null).map(v => [v.lat!, v.lon!] as [number, number]);
    if (pts.length) { map.fitBounds(pts, { padding: [50, 50], maxZoom: 12 }); once.current = true; }
  }, [vehicles, map, once]);
  return null;
}

function FocusController({ focus }: { focus: { id: number; lat: number; lon: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lon], 15, { duration: 0.8 });
  }, [focus, map]);
  return null;
}

const fmtTime = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function FleetMap({
  vehicles, focus, fitOnce,
}: {
  vehicles: FleetVehicle[];
  focus: { id: number; lat: number; lon: number } | null;
  fitOnce: React.MutableRefObject<boolean>;
}) {
  const located = useMemo(() => vehicles.filter(v => v.lat != null && v.lon != null), [vehicles]);
  return (
    <MapContainer center={[25.2, 55.3]} zoom={9} className="h-full w-full" style={{ background: "#aadaff" }}>
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds vehicles={located} once={fitOnce} />
      <FocusController focus={focus} />
      {located.map(v => (
        <Marker key={v.id} position={[v.lat!, v.lon!]} icon={vehicleIcon(v)}>
          <Popup>
            <div style={{ minWidth: 160 }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{v.name}</div>
              <div style={{ fontSize: 12, color: "#475569" }}>
                {v.driver ? <div>Driver: {v.driver}</div> : null}
                {v.driverPhone ? <div>{v.driverPhone}</div> : null}
                <div>Status: {v.status ?? "—"}</div>
                <div>Updated: {fmtTime(v.lastUpdate)}</div>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
