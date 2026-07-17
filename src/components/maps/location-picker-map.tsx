/**
 * LocationPickerMap — pick an exact point by searching an address, clicking the
 * map, or dragging the marker. Reports { lat, lng, address? } back to the caller.
 *
 * Uses the same Google Maps integration as the route planner (Places for the
 * search box, a Geocoder for reverse-geocoding a dropped pin). Callers should
 * check useGoogleMaps().maps first and fall back to plain lat/lng number inputs
 * when Google Maps isn't configured.
 */
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { GMaps } from "@/lib/google-maps";
import { cn } from "@/lib/utils";

const DUBAI = { lat: 25.1972, lng: 55.2744 };

export type PickedPoint = { lat: number; lng: number; address?: string; source: "search" | "pin" };

export function LocationPickerMap({
  maps, value, onChange, onClear, className,
}: {
  maps: GMaps;
  value: { lat: number | null; lng: number | null };
  onChange: (p: PickedPoint) => void;
  onClear?: () => void;
  className?: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [hint, setHint] = useState<string | null>(null);

  const hasPin = value.lat != null && value.lng != null;

  // Place / move the single marker and pan to it.
  function placeMarker(pos: google.maps.LatLngLiteral) {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      markerRef.current = new maps.Marker({ map, position: pos, draggable: true, animation: maps.Animation.DROP });
      markerRef.current.addListener("dragend", () => {
        const p = markerRef.current!.getPosition();
        if (p) reverseAndReport(p.lat(), p.lng());
      });
    } else {
      markerRef.current.setPosition(pos);
      markerRef.current.setMap(map);
    }
  }

  // Report a dropped/dragged pin, then reverse-geocode for a readable address.
  function reverseAndReport(lat: number, lng: number) {
    onChangeRef.current({ lat, lng, source: "pin" });
    geocoderRef.current?.geocode({ location: { lat, lng } }, (res, status) => {
      if (status === "OK" && res?.[0]) onChangeRef.current({ lat, lng, address: res[0].formatted_address, source: "pin" });
    });
  }

  // One-time map + autocomplete + geocoder setup.
  useEffect(() => {
    if (!holder.current || mapRef.current) return;
    const center = hasPin ? { lat: value.lat as number, lng: value.lng as number } : DUBAI;
    const map = new maps.Map(holder.current, {
      center, zoom: hasPin ? 15 : 10,
      mapTypeControl: false, streetViewControl: false, fullscreenControl: true,
      clickableIcons: false, gestureHandling: "greedy",
    });
    mapRef.current = map;
    geocoderRef.current = new maps.Geocoder();
    if (hasPin) placeMarker(center);

    // Click anywhere to drop / move the pin.
    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      placeMarker({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      reverseAndReport(e.latLng.lat(), e.latLng.lng());
    });

    // Address search box.
    if (searchRef.current && maps.places?.Autocomplete) {
      const ac = new maps.places.Autocomplete(searchRef.current, { fields: ["geometry", "formatted_address", "name"] });
      ac.bindTo("bounds", map);
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const loc = place.geometry?.location;
        if (!loc) { setHint("No location for that result — try clicking the map."); return; }
        const pos = { lat: loc.lat(), lng: loc.lng() };
        map.panTo(pos); map.setZoom(16);
        placeMarker(pos);
        const address = place.formatted_address || place.name || undefined;
        onChangeRef.current({ ...pos, address, source: "search" });
        setHint(null);
      });
    }

    // Maps rendered inside a dialog can init at 0×0 — nudge once laid out.
    requestAnimationFrame(() => {
      maps.event.trigger(map, "resize");
      map.setCenter(center);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps]);

  // Keep the marker in sync when the parent clears / sets coordinates externally.
  useEffect(() => {
    if (!mapRef.current) return;
    if (hasPin) placeMarker({ lat: value.lat as number, lng: value.lng as number });
    else if (markerRef.current) { markerRef.current.setMap(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.lat, value.lng]);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
        <input
          ref={searchRef}
          placeholder="Search an address or place to drop a pin…"
          className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none focus:border-primary/60"
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
        />
      </div>
      <div ref={holder} className="w-full rounded-md border border-border" style={{ height: 260 }} />
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{hint ?? "Search, click the map, or drag the pin to set the exact point."}</span>
        {hasPin && (
          <span className="flex items-center gap-2">
            <span className="font-mono text-primary/80">{(value.lat as number).toFixed(6)}, {(value.lng as number).toFixed(6)}</span>
            {onClear && (
              <button type="button" onClick={onClear} className="flex items-center gap-0.5 text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" /> Clear pin
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
