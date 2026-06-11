import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AisYacht } from "@/lib/aisstream.server";

const NAVSTAT: Record<number, string> = {
  0: "Under way (engine)", 1: "At anchor", 2: "Not under command", 3: "Restricted manoeuvrability",
  4: "Constrained by draught", 5: "Moored", 6: "Aground", 7: "Fishing", 8: "Under way (sailing)",
  15: "Undefined",
};

function vesselIcon(y: AisYacht) {
  const moving = (y.speed ?? 0) > 0.5;
  const color = moving ? "#0ea5e9" : "#64748b";
  const rot = y.heading ?? y.course ?? 0;
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="width:28px;height:28px;transform:rotate(${rot}deg);display:flex;align-items:center;justify-content:center;">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));">
        <path d="M12 2 L19 21 L12 17 L5 21 Z"/>
      </svg>
    </div>`,
  });
}

function FitBounds({ yachts, once }: { yachts: AisYacht[]; once: React.MutableRefObject<boolean> }) {
  const map = useMap();
  useEffect(() => {
    if (once.current) return;
    const pts = yachts.map(y => [y.lat!, y.lon!] as [number, number]);
    if (pts.length) { map.fitBounds(pts, { padding: [60, 60], maxZoom: 11 }); once.current = true; }
  }, [yachts, map, once]);
  return null;
}

function FocusController({ focus }: { focus: { id: string; lat: number; lon: number } | null }) {
  const map = useMap();
  useEffect(() => { if (focus) map.flyTo([focus.lat, focus.lon], 12, { duration: 0.8 }); }, [focus, map]);
  return null;
}

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function AisFleetMap({
  yachts, focus, fitOnce,
}: {
  yachts: AisYacht[];
  focus: { id: string; lat: number; lon: number } | null;
  fitOnce: React.MutableRefObject<boolean>;
}) {
  const located = useMemo(() => yachts.filter(y => y.lat != null && y.lon != null), [yachts]);
  return (
    <MapContainer center={[25.2, 55.3]} zoom={8} className="h-full w-full" style={{ background: "#aadaff" }}>
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitBounds yachts={located} once={fitOnce} />
      <FocusController focus={focus} />
      {located.map(y => (
        <Marker key={y.id} position={[y.lat!, y.lon!]} icon={vesselIcon(y)}>
          <Popup>
            <div style={{ minWidth: 180 }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{y.vessel_name}</div>
              <div style={{ fontSize: 12, color: "#475569" }}>
                {y.mmsi ? <div>MMSI: {y.mmsi}</div> : null}
                <div>Speed: {y.speed != null ? `${y.speed.toFixed(1)} kn` : "—"}</div>
                <div>Course: {y.course != null ? `${Math.round(y.course)}°` : "—"}</div>
                <div>Status: {y.navstat != null ? (NAVSTAT[y.navstat] ?? `#${y.navstat}`) : "—"}</div>
                {y.destination ? <div>Dest: {y.destination}</div> : null}
                <div>Updated: {fmtTime(y.positionAt)}</div>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
