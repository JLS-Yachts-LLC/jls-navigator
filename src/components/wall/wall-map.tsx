import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { WallMapPoint } from "@/lib/wall-types";

/** Dot for a vessel sitting still, arrow for one under way. */
function icon(p: WallMapPoint) {
  const color = p.stale ? "#5B6B82" : p.moving ? "#F5B83D" : p.inCountry ? "#96CBC7" : "#4590BA";
  if (!p.moving) {
    return L.divIcon({
      className: "", iconSize: [12, 12], iconAnchor: [6, 6],
      html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #0A1A2B;box-shadow:0 0 0 1px ${color}66"></div>`,
    });
  }
  return L.divIcon({
    className: "", iconSize: [26, 26], iconAnchor: [13, 13],
    html: `<div style="width:26px;height:26px;transform:rotate(${p.heading ?? 0}deg);display:flex;align-items:center;justify-content:center">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="${color}" stroke="#0A1A2B" stroke-width="1.5"><path d="M12 2 L19 21 L12 17 L5 21 Z"/></svg></div>`,
  });
}

/** Re-frames the map only when the set of vessels changes, not on every refresh. */
function Frame({ points }: { points: WallMapPoint[] }) {
  const map = useMap();
  const last = useRef("");
  useEffect(() => {
    const sig = points.map((p) => p.id).sort().join(",");
    if (sig === last.current) return;
    last.current = sig;
    // Frame the UAE coast — the boats that are here. One inbound vessel off
    // Jeddah would otherwise zoom the whole board out to the Arabian peninsula.
    const uae = points.filter((p) => p.lat > 23.5 && p.lat < 26.6 && p.lon > 52 && p.lon < 56.6);
    const pts = uae.map((p) => [p.lat, p.lon] as [number, number]);
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 11 });
    else map.setView([25.15, 55.2], 9);
  }, [points, map]);
  // TVs often lay the page out after the map mounts — make sure tiles fill it.
  useEffect(() => { const t = setTimeout(() => map.invalidateSize(), 500); return () => clearTimeout(t); }, [map]);
  return null;
}

export default function WallMap({ points }: { points: WallMapPoint[] }) {
  const sorted = useMemo(() => [...points].sort((a, b) => Number(a.moving) - Number(b.moving)), [points]);
  return (
    <MapContainer
      center={[25.15, 55.2]} zoom={9} zoomControl={false} attributionControl={false}
      dragging={false} scrollWheelZoom={false} doubleClickZoom={false} keyboard={false} touchZoom={false} boxZoom={false}
      style={{ height: "100%", width: "100%", background: "#0A1A2B" }}
    >
      {/* Esri dark canvas — keyless (CARTO's dark tiles now refuse this domain without an API key). */}
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" maxZoom={16} />
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}" maxZoom={16} />
      <Frame points={points} />
      {sorted.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lon]} icon={icon(p)} interactive={false}>
          {/* Labels only for the boats on the move — 70+ labels in a marina is noise. */}
          {p.moving && (
            <Tooltip permanent direction="right" offset={[12, 0]} className="wall-map-label">{p.name}</Tooltip>
          )}
        </Marker>
      ))}
    </MapContainer>
  );
}
