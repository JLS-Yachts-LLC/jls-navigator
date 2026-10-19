import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { WallMapPoint } from "@/lib/wall-types";

/** Dot for a vessel sitting still, arrow for one under way. Interactive boards get a finger-sized hit area. */
function icon(p: WallMapPoint, interactive: boolean, selected: boolean) {
  const color = p.stale ? "#5B6B82" : p.moving ? "#F5B83D" : p.inCountry ? "#96CBC7" : "#4590BA";
  const box = interactive ? 36 : p.moving ? 26 : 12;
  const ring = selected ? `outline:3px solid #F5B83D;outline-offset:3px;border-radius:50%;` : "";
  const wrap = (inner: string) =>
    `<div style="width:${box}px;height:${box}px;display:flex;align-items:center;justify-content:center">${inner}</div>`;
  if (!p.moving) {
    const d = selected ? 18 : 12;
    return L.divIcon({
      className: "", iconSize: [box, box], iconAnchor: [box / 2, box / 2],
      html: wrap(`<div style="width:${d}px;height:${d}px;border-radius:50%;background:${color};border:2px solid #0A1A2B;box-shadow:0 0 0 1px ${color}66;${ring}"></div>`),
    });
  }
  const s = selected ? 26 : 20;
  return L.divIcon({
    className: "", iconSize: [box, box], iconAnchor: [box / 2, box / 2],
    html: wrap(`<div style="width:26px;height:26px;transform:rotate(${p.heading ?? 0}deg);display:flex;align-items:center;justify-content:center;${ring}">
      <svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="${color}" stroke="#0A1A2B" stroke-width="1.5"><path d="M12 2 L19 21 L12 17 L5 21 Z"/></svg></div>`),
  });
}

/** Frame the UAE coast — the boats that are here. One inbound vessel off
 *  Jeddah would otherwise zoom the whole board out to the Arabian peninsula. */
function frame(map: L.Map, points: WallMapPoint[]) {
  const uae = points.filter((p) => p.lat > 23.5 && p.lat < 26.6 && p.lon > 52 && p.lon < 56.6);
  const pts = uae.map((p) => [p.lat, p.lon] as [number, number]);
  if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 11 });
  else map.setView([25.15, 55.2], 9);
}

/**
 * Re-frames the map when the set of vessels changes — but never while someone
 * is using the board (`hold`); it re-frames once they leave it alone.
 */
function Frame({ points, hold }: { points: WallMapPoint[]; hold: boolean }) {
  const map = useMap();
  const last = useRef("");
  const wasHeld = useRef(hold);
  useEffect(() => {
    const sig = points.map((p) => p.id).sort().join(",");
    const released = wasHeld.current && !hold;
    wasHeld.current = hold;
    if (hold || (sig === last.current && !released)) return;
    last.current = sig;
    frame(map, points);
  }, [points, map, hold]);
  // TVs often lay the page out after the map mounts — make sure tiles fill it.
  useEffect(() => { const t = setTimeout(() => map.invalidateSize(), 500); return () => clearTimeout(t); }, [map]);
  return null;
}

/** Turns drag / pinch / wheel / double-tap on and off with the screen's setting. */
function Handlers({ on }: { on: boolean }) {
  const map = useMap();
  useEffect(() => {
    for (const h of [map.dragging, map.touchZoom, map.scrollWheelZoom, map.doubleClickZoom]) {
      if (on) h.enable(); else h.disable();
    }
  }, [map, on]);
  return null;
}

/** Glides to the vessel that was just opened, if it has a position. */
function FlyTo({ points, selectedId }: { points: WallMapPoint[]; selectedId: string | null }) {
  const map = useMap();
  useEffect(() => {
    const p = selectedId ? points.find((x) => x.id === selectedId) : null;
    if (p) map.flyTo([p.lat, p.lon], Math.max(map.getZoom(), 12), { duration: 0.8 });
    // Only when the selection changes — not on every minute's refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, map]);
  return null;
}

export default function WallMap({
  points, interactive = false, active = false, selectedId = null, onSelect,
}: {
  points: WallMapPoint[];
  interactive?: boolean;
  /** Someone is using the board right now — hold the view where they put it. */
  active?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const [map, setMap] = useState<L.Map | null>(null);
  const sorted = useMemo(
    () => [...points].sort((a, b) => Number(a.moving) - Number(b.moving) || Number(a.id === selectedId) - Number(b.id === selectedId)),
    [points, selectedId],
  );
  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <MapContainer
        ref={setMap}
        center={[25.15, 55.2]} zoom={9} zoomControl={false} attributionControl={false}
        dragging={interactive} scrollWheelZoom={interactive} doubleClickZoom={interactive} touchZoom={interactive}
        keyboard={false} boxZoom={false}
        style={{ height: "100%", width: "100%", background: "#0A1A2B" }}
      >
        {/* Esri dark canvas — keyless (CARTO's dark tiles now refuse this domain without an API key). */}
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" maxZoom={16} />
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}" maxZoom={16} />
        <Frame points={points} hold={active} />
        <Handlers on={interactive} />
        {interactive && <FlyTo points={points} selectedId={selectedId} />}
        {sorted.map((p) => {
          const selected = p.id === selectedId;
          return (
            <Marker
              key={p.id} position={[p.lat, p.lon]} icon={icon(p, interactive, selected)}
              interactive={interactive} keyboard={false} zIndexOffset={selected ? 1000 : 0}
              eventHandlers={interactive && onSelect ? { click: () => onSelect(p.id) } : undefined}
            >
              {/* Labels only for the boats on the move (and the one that's open) — 70+ labels in a marina is noise. */}
              {(p.moving || selected) && (
                <Tooltip permanent direction="right" offset={[interactive ? 16 : 12, 0]} className="wall-map-label">{p.name}</Tooltip>
              )}
            </Marker>
          );
        })}
      </MapContainer>
      {interactive && map && (
        <div style={{ position: "absolute", right: ".6em", top: ".6em", zIndex: 500, display: "flex", flexDirection: "column", gap: ".4em" }}>
          <button type="button" className="wall-tap wall-map-btn" data-wall-focus aria-label="Zoom in" onClick={() => map.zoomIn()}>+</button>
          <button type="button" className="wall-tap wall-map-btn" data-wall-focus aria-label="Zoom out" onClick={() => map.zoomOut()}>−</button>
          <button type="button" className="wall-tap wall-map-btn" data-wall-focus aria-label="Show all boats" title="Show all boats" onClick={() => frame(map, points)}>⤢</button>
        </div>
      )}
    </div>
  );
}
