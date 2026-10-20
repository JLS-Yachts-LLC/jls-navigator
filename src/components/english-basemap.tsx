import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import type { Map as MaplibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Basemap with every place name in English, for the Leaflet maps (Live Tracking, GPS fleet, /wall).
 *
 * Why not plain raster tiles: OSM's own tiles label places in the local language (Arabic across
 * the Gulf), Esri's free tiles are Arabic + English, and CARTO's now return "API KEY REQUIRED".
 * OpenFreeMap is free, keyless OSM vector tiles, so we draw them with MapLibre inside Leaflet and
 * rewrite each label to the English name (falling back to the Latin spelling, then the local one).
 */
const STYLE = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

// No WebGL (some TV browsers) → unlabelled Esri raster, so the map is never blank.
const FALLBACK = {
  light: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  dark: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
} as const;

const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

const ENGLISH_NAME = ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]];

function englishLabels(m: MaplibreMap) {
  for (const layer of m.getStyle().layers ?? []) {
    if (layer.type !== "symbol") continue;
    const field = m.getLayoutProperty(layer.id, "text-field");
    // Only place/feature names — leave road-shield refs and house numbers alone.
    if (field && JSON.stringify(field).includes("name")) {
      m.setLayoutProperty(layer.id, "text-field", ENGLISH_NAME);
    }
  }
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function EnglishBasemap({ theme = "light", maxZoom }: { theme?: "light" | "dark"; maxZoom?: number }) {
  const map = useMap();

  useEffect(() => {
    if (!webglAvailable()) {
      const raster = L.tileLayer(FALLBACK[theme], { maxZoom: maxZoom ?? 16 }).addTo(map);
      return () => { map.removeLayer(raster); };
    }
    const layer = maplibreGL({ style: STYLE[theme], attributionControl: false }).addTo(map);
    map.attributionControl?.addAttribution(ATTRIBUTION);
    const gl = layer.getMaplibreMap();
    if (gl.isStyleLoaded()) englishLabels(gl);
    else gl.once("style.load", () => englishLabels(gl));
    return () => {
      map.attributionControl?.removeAttribution(ATTRIBUTION);
      map.removeLayer(layer);
    };
  }, [map, theme, maxZoom]);

  return null;
}
