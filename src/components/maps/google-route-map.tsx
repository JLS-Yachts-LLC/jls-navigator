/**
 * GoogleRouteMap — renders a driving route between two or more points on a
 * Google Map (DirectionsService + DirectionsRenderer), reporting distance,
 * duration and the (optionally optimized) stop order back to the caller.
 *
 * Callers should check useGoogleMaps().maps first and fall back to an OSM
 * embed / plain link when Google Maps isn't configured.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  type GMaps, type RoutePoint, type ComputedRoute,
  computeRoute, fmtDuration, fmtKm,
} from "@/lib/google-maps";
import { cn } from "@/lib/utils";

export function GoogleRouteMap({
  maps, origin, destination, waypoints = [], optimize = false, onRoute, className, showSummary = true,
}: {
  maps: GMaps;
  origin: RoutePoint;
  destination: RoutePoint;
  waypoints?: RoutePoint[];
  optimize?: boolean;
  onRoute?: (r: ComputedRoute) => void;
  className?: string;
  showSummary?: boolean;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const lineRef = useRef<google.maps.Polyline | null>(null);
  const [summary, setSummary] = useState<{ km: string; time: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const onRouteRef = useRef(onRoute);
  onRouteRef.current = onRoute;

  // Key the route request so we only re-route when inputs actually change.
  const routeKey = JSON.stringify([origin, destination, waypoints, optimize]);

  useEffect(() => {
    if (!holder.current) return;
    if (!mapRef.current) {
      mapRef.current = new maps.Map(holder.current, {
        center: { lat: 25.07, lng: 55.14 }, // Dubai
        zoom: 10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });
    }
    let alive = true;
    setBusy(true);
    setError(null);
    computeRoute(maps, origin, destination, waypoints, optimize)
      .then((r) => {
        if (!alive || !mapRef.current) return;
        // Draw the route polyline ourselves (Routes API returns the geometry).
        lineRef.current?.setMap(null);
        const line = new maps.Polyline({
          path: r.path,
          map: mapRef.current,
          strokeColor: "#00C4CC",
          strokeOpacity: 0.9,
          strokeWeight: 5,
        });
        lineRef.current = line;
        if (r.path.length) {
          const bounds = new maps.LatLngBounds();
          for (const p of r.path) bounds.extend(p);
          mapRef.current.fitBounds(bounds, 48);
        }
        setSummary({ km: fmtKm(r.distanceMeters), time: fmtDuration(r.durationSeconds) });
        onRouteRef.current?.(r);
      })
      .catch((e: any) => {
        if (!alive) return;
        setError(e?.message ?? "Route not found");
        setSummary(null);
      })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps, routeKey]);

  return (
    <div className={cn("relative w-full h-full", className)} style={{ minHeight: 260 }}>
      <div ref={holder} className="w-full h-full rounded-md border border-border" style={{ minHeight: 260 }} />
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/40">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {showSummary && summary && !busy && (
        <div className="absolute top-2 left-2 rounded-md bg-background/90 border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur-sm">
          {summary.km} · {summary.time}
        </div>
      )}
      {error && !busy && (
        <div className="absolute bottom-2 left-2 right-2 rounded-md bg-destructive/10 border border-destructive/30 px-2.5 py-1 text-[11px] text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
