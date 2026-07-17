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
let mapsKey: string | null = null; // cached for the Routes API REST calls

async function fetchApiKey(): Promise<string | null> {
  if (mapsKey) return mapsKey;
  try {
    const { data } = await (supabase as any)
      .from("integration_settings")
      .select("enabled, config")
      .eq("integration_name", "google_maps")
      .maybeSingle();
    if (!data?.enabled) return null;
    const key = data?.config?.api_key;
    mapsKey = typeof key === "string" && key.trim() ? key.trim() : null;
    return mapsKey;
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
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&libraries=places,geometry&callback=${cb}`;
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

// Routes API waypoint: coordinates when we have them, else a plain address.
function toRoutesWaypoint(p: RoutePoint): Record<string, unknown> {
  return p.lat != null && p.lng != null
    ? { location: { latLng: { latitude: Number(p.lat), longitude: Number(p.lng) } } }
    : { address: String(p.address ?? "") };
}

export type ComputedRoute = {
  /** decoded polyline for the whole route (drawn as a Polyline) */
  path: google.maps.LatLngLiteral[];
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
  // Google Routes API (v2) — the current replacement for the legacy
  // DirectionsService. Uses the same browser key (HTTP-referrer restricted); the
  // project must have the "Routes API" enabled.
  const key = await fetchApiKey();
  if (!key) throw new Error("Google Maps isn't configured.");

  const durSec = (d: unknown) => Number(String(d ?? "0").replace(/s$/, "")) || 0; // Routes durations look like "123s"
  let data: any;
  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": [
          "routes.distanceMeters", "routes.duration", "routes.polyline.encodedPolyline",
          "routes.legs.distanceMeters", "routes.legs.duration", "routes.optimizedIntermediateWaypointIndex",
        ].join(","),
      },
      body: JSON.stringify({
        origin: toRoutesWaypoint(origin),
        destination: toRoutesWaypoint(destination),
        intermediates: waypoints.map(toRoutesWaypoint),
        travelMode: "DRIVE",
        optimizeWaypointOrder: optimize,
        polylineEncoding: "ENCODED_POLYLINE",
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      let reason = "";
      try { reason = JSON.parse(text)?.error?.message ?? ""; } catch { /* non-JSON */ }
      // Surface the real cause to the console for diagnosis.
      console.error(`Routes API ${res.status}:`, reason || text.slice(0, 400));
      if (/SERVICE_DISABLED|has not been used|is disabled|not been used in project/i.test(text))
        throw new Error("Enable the Routes API on the Google Maps project (APIs & Services → Library → Routes API), then retry.");
      if (/referer|referrer|API keys with referer/i.test(text))
        throw new Error("The Maps key's referrer restriction is blocking the Routes API — confirm this domain is on the key's allowed referrers.");
      throw new Error(reason ? `Route error: ${reason}` : "Couldn't calculate the route.");
    }
    data = JSON.parse(text);
  } catch (e: any) {
    if (e instanceof Error && e.message.startsWith("Map isn't") ) throw e;
    throw new Error("Couldn't calculate the route.");
  }

  const route = data?.routes?.[0];
  if (!route) throw new Error("No driving route found between these stops.");
  const encoded: string | undefined = route.polyline?.encodedPolyline;
  const path = encoded
    ? maps.geometry.encoding.decodePath(encoded).map((ll) => ({ lat: ll.lat(), lng: ll.lng() }))
    : [];
  const legs = (route.legs ?? []).map((l: any) => ({
    distanceMeters: l.distanceMeters ?? 0,
    durationSeconds: durSec(l.duration),
    endAddress: "",
  }));
  return {
    path,
    waypointOrder: route.optimizedIntermediateWaypointIndex ?? waypoints.map((_, i) => i),
    distanceMeters: route.distanceMeters ?? legs.reduce((s: number, l: any) => s + l.distanceMeters, 0),
    durationSeconds: durSec(route.duration) || legs.reduce((s: number, l: any) => s + l.durationSeconds, 0),
    legs,
  };
}

export const fmtKm = (meters: number) => `${(meters / 1000).toFixed(meters >= 100_000 ? 0 : 1)} km`;
export const fmtDuration = (seconds: number) => {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")} min`;
};
