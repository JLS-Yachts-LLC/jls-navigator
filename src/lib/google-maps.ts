/**
 * Google Maps JS API loader (client-side).
 *
 * The API key lives in integration_settings (integration_name 'google_maps',
 * config.api_key) — paste it under Settings → Integrations → Google Maps and
 * flip the toggle on. It is a browser key: restrict it by HTTP referrer in the
 * Google Cloud console and enable Maps JavaScript API, Places API and
 * Directions API.
 *
 * Everything degrades gracefully: when the key is missing or the script fails
 * to load, loadGoogleMaps() resolves null and callers fall back to
 * OpenStreetMap embeds / plain Google Maps links.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type GMaps = typeof google.maps;

let loadPromise: Promise<GMaps | null> | null = null;

async function fetchApiKey(): Promise<string | null> {
  try {
    const { data } = await (supabase as any)
      .from("integration_settings")
      .select("enabled, config")
      .eq("integration_name", "google_maps")
      .maybeSingle();
    if (!data?.enabled) return null;
    const key = data?.config?.api_key;
    return typeof key === "string" && key.trim() ? key.trim() : null;
  } catch {
    return null;
  }
}

/** Load the Google Maps JS API once; resolves null when not configured. */
export function loadGoogleMaps(): Promise<GMaps | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const w = window as any;
  if (w.google?.maps?.Map) return Promise.resolve(w.google.maps);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const key = await fetchApiKey();
    if (!key) return null;
    await new Promise<void>((resolve, reject) => {
      const cb = "__polarisGmapsReady";
      w[cb] = () => resolve();
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&libraries=places,geometry&callback=${cb}`;
      s.async = true;
      s.onerror = () => reject(new Error("Google Maps failed to load"));
      document.head.appendChild(s);
    });
    return (w.google?.maps as GMaps) ?? null;
  })().catch(() => {
    loadPromise = null; // allow a retry after transient failures
    return null;
  });
  return loadPromise;
}

/** React hook: `maps` is the google.maps namespace once loaded, null while
 *  loading or when the integration isn't configured (check `ready`). */
export function useGoogleMaps(): { maps: GMaps | null; ready: boolean } {
  const [maps, setMaps] = useState<GMaps | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    loadGoogleMaps().then((m) => {
      if (!alive) return;
      setMaps(m);
      setReady(true);
    });
    return () => { alive = false; };
  }, []);
  return { maps, ready };
}

export type RoutePoint = { lat?: number | null; lng?: number | null; address?: string | null; label?: string };

function toDirectionsPlace(p: RoutePoint): string | google.maps.LatLngLiteral {
  return p.lat != null && p.lng != null ? { lat: Number(p.lat), lng: Number(p.lng) } : String(p.address ?? "");
}

export type ComputedRoute = {
  result: google.maps.DirectionsResult;
  /** stop order (indices into the waypoints array as passed in) */
  waypointOrder: number[];
  distanceMeters: number;
  durationSeconds: number;
  legs: { distanceMeters: number; durationSeconds: number; endAddress: string }[];
};

/** Compute a driving route (optionally optimizing the waypoint order). */
export async function computeRoute(
  maps: GMaps,
  origin: RoutePoint,
  destination: RoutePoint,
  waypoints: RoutePoint[] = [],
  optimize = false,
): Promise<ComputedRoute> {
  const svc = new maps.DirectionsService();
  const result = await svc.route({
    origin: toDirectionsPlace(origin),
    destination: toDirectionsPlace(destination),
    waypoints: waypoints.map((w) => ({ location: toDirectionsPlace(w) as any, stopover: true })),
    optimizeWaypoints: optimize,
    travelMode: maps.TravelMode.DRIVING,
  });
  const route = result.routes[0];
  const legs = (route?.legs ?? []).map((l) => ({
    distanceMeters: l.distance?.value ?? 0,
    durationSeconds: l.duration?.value ?? 0,
    endAddress: l.end_address ?? "",
  }));
  return {
    result,
    waypointOrder: route?.waypoint_order ?? waypoints.map((_, i) => i),
    distanceMeters: legs.reduce((s, l) => s + l.distanceMeters, 0),
    durationSeconds: legs.reduce((s, l) => s + l.durationSeconds, 0),
    legs,
  };
}

export const fmtKm = (meters: number) => `${(meters / 1000).toFixed(meters >= 100_000 ? 0 : 1)} km`;
export const fmtDuration = (seconds: number) => {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")} min`;
};
