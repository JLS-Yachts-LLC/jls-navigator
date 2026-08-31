import { Fragment, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from "react-leaflet";
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

/** ais_eta is whatever string the AIS provider sent — usually parseable, but
 *  shown verbatim if it isn't (still better than dropping it silently). */
const fmtEta = (raw: string | null) => {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? raw : fmtTime(d.toISOString());
};

/** Same "is this vessel moving" call the sync jobs use (myshiptracking.server.ts
 *  / vesselfinder.server.ts) — so "Underway since" / "Last arrived" agrees with
 *  the status line and the marker's moving/stopped colour above it. */
function isMoving(y: AisYacht): boolean {
  if (y.navstat === 0 || y.navstat === 8) return true;
  if (y.navstat === 1 || y.navstat === 5) return false;
  return (y.speed ?? 0) > 0.5;
}

/** "Underway since 3 Jul, 08:34" while moving, "Arrived 3 Jul, 13:58" once
 *  stopped — the closest thing to "where it's coming from" AIS actually
 *  gives us: it broadcasts a destination, never an origin. */
function voyageLine(y: AisYacht): string | null {
  if (isMoving(y)) return y.underwaySince ? `Underway since ${fmtTime(y.underwaySince)}` : null;
  return y.lastArrivedAt ? `Arrived ${fmtTime(y.lastArrivedAt)}` : null;
}

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
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitBounds yachts={located} once={fitOnce} />
      <FocusController focus={focus} />
      {located.map(y => {
        const moving = isMoving(y);
        const hasRoute = y.destLat != null && y.destLon != null;
        return (
          <Fragment key={y.id}>
            {hasRoute && (
              <>
                <Polyline
                  positions={[[y.lat!, y.lon!], [y.destLat!, y.destLon!]]}
                  pathOptions={{ color: moving ? "#0ea5e9" : "#94a3b8", weight: 2, dashArray: "6 6", opacity: 0.75 }}
                />
                <CircleMarker center={[y.destLat!, y.destLon!]} radius={4}
                  pathOptions={{ color: "#fff", weight: 1.5, fillColor: moving ? "#0ea5e9" : "#94a3b8", fillOpacity: 0.9 }}>
                  <Popup><strong>{y.vessel_name}</strong> — planned destination{y.destination ? `: ${y.destination}` : ""}{fmtEta(y.eta) ? ` (ETA ${fmtEta(y.eta)})` : ""}</Popup>
                </CircleMarker>
              </>
            )}
            <Marker position={[y.lat!, y.lon!]} icon={vesselIcon(y)}>
              <Popup>
                <div style={{ minWidth: 220 }}>
                  <div style={{ fontWeight: 700 }}>{y.vessel_name}</div>
                  {(y.vesselType || y.flag || y.lengthOverallM) && (
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                      {[y.vesselType, y.flag, y.lengthOverallM ? `${y.lengthOverallM}m` : null].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", rowGap: 2, fontSize: 12, color: "#475569" }}>
                    {y.mmsi ? <><span>MMSI</span><span>{y.mmsi}</span></> : null}
                    {y.imo ? <><span>IMO</span><span>{y.imo}</span></> : null}
                    {y.callSign ? <><span>Call sign</span><span>{y.callSign}</span></> : null}
                    {y.portOfRegistry ? <><span>Registered</span><span>{y.portOfRegistry}</span></> : null}
                    <span>Speed</span><span>{y.speed != null ? `${y.speed.toFixed(1)} kn` : "—"}</span>
                    <span>Course</span><span>{y.course != null ? `${Math.round(y.course)}°` : "—"}</span>
                    <span>Status</span><span>{y.navstat != null ? (NAVSTAT[y.navstat] ?? `#${y.navstat}`) : "—"}</span>
                    {y.destination ? <><span>Dest</span><span>{y.destination}</span></> : null}
                    {fmtEta(y.eta) ? <><span>ETA</span><span>{fmtEta(y.eta)}</span></> : null}
                    <span>Updated</span><span>{fmtTime(y.positionAt)}</span>
                  </div>
                  {voyageLine(y) ? <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>{voyageLine(y)}</div> : null}
                  {!hasRoute && y.destination && (
                    <div style={{ fontSize: 10.5, color: "#cbd5e1", marginTop: 6 }}>Route line unavailable — destination couldn't be located on the map.</div>
                  )}
                </div>
              </Popup>
            </Marker>
          </Fragment>
        );
      })}
    </MapContainer>
  );
}
