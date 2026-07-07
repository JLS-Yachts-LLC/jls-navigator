/**
 * ShipSync route planner — plots a run's delivery stops on Google Maps,
 * lets Google optimize the stop order (round trip from the JLS office),
 * and shows per-leg distance/ETA plus a deep link to open the optimized
 * route in the Google Maps app for navigation.
 *
 * Falls back to a plain Google Maps link when the Google Maps integration
 * (Settings → Integrations → Google Maps) isn't configured.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Ship } from "lucide-react";
import { useGoogleMaps, fmtDuration, fmtKm, type ComputedRoute } from "@/lib/google-maps";
import { GoogleRouteMap } from "@/components/maps/google-route-map";
import { googleMapsDirectionsUrl } from "@/lib/shipsync/model";

export const JLS_OFFICE_ADDRESS =
  "Office 58-2, Leader Sport Compound, Plot 598-1000, Dubai Investment Park 1, Dubai, United Arab Emirates";

export type RouteStop = { boat: string; address?: string | null; lat?: number | null; lng?: number | null };

const stopPoint = (s: RouteStop) => (s.lat != null && s.lng != null ? `${s.lat},${s.lng}` : (s.address ?? "").trim());

export function RouteMapDialog({
  open, onOpenChange, title, stops,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  stops: RouteStop[];
}) {
  const { maps, ready } = useGoogleMaps();
  const [route, setRoute] = useState<ComputedRoute | null>(null);

  const usable = stops.filter((s) => stopPoint(s));
  const skipped = stops.length - usable.length;

  // Optimized stop order (falls back to the given order until routed).
  const order = route?.waypointOrder ?? usable.map((_, i) => i);
  const orderedStops = order.map((i) => usable[i]).filter(Boolean);

  // Deep link for turn-by-turn navigation in the optimized order.
  const navUrl = (() => {
    if (!orderedStops.length) return null;
    const pts = orderedStops.map(stopPoint);
    const params = new URLSearchParams({ api: "1", travelmode: "driving", origin: JLS_OFFICE_ADDRESS, destination: pts[pts.length - 1] });
    if (pts.length > 1) params.set("waypoints", pts.slice(0, -1).join("|"));
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  })();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setRoute(null); onOpenChange(o); }}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Navigation className="h-3.5 w-3.5 text-primary" /> {title}
          </DialogTitle>
        </DialogHeader>

        {usable.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            None of the stops on this run have an address or coordinates yet — set berth addresses on the boats' destinations first.
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Stop list */}
            <div className="w-72 shrink-0 border-r border-border overflow-y-auto">
              <div className="px-4 py-2.5 border-b border-border/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {route ? "Optimized stop order" : "Stops"} ({usable.length})
              </div>
              <ol className="divide-y divide-border/40">
                {orderedStops.map((s, i) => {
                  const leg = route?.legs[i];
                  return (
                    <li key={`${s.boat}-${i}`} className="flex items-start gap-2.5 px-4 py-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">{i + 1}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-semibold"><Ship className="h-3 w-3 text-muted-foreground" /> {s.boat}</div>
                        {s.address && <div className="truncate text-[11px] text-muted-foreground">{s.address}</div>}
                        {leg && <div className="text-[10px] text-primary/80 font-medium">{fmtKm(leg.distanceMeters)} · {fmtDuration(leg.durationSeconds)} from previous</div>}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {skipped > 0 && (
                <div className="px-4 py-2 text-[10px] text-amber-400/90">{skipped} stop{skipped > 1 ? "s" : ""} skipped — no address or coordinates.</div>
              )}
              {route && (
                <div className="border-t border-border px-4 py-3 text-xs">
                  <div className="font-semibold">Round trip from the office</div>
                  <div className="text-muted-foreground">{fmtKm(route.distanceMeters)} · {fmtDuration(route.durationSeconds)} driving</div>
                </div>
              )}
            </div>

            {/* Map */}
            <div className="flex-1 flex flex-col">
              <div className="flex-1 p-3">
                {maps ? (
                  <GoogleRouteMap
                    maps={maps}
                    origin={{ address: JLS_OFFICE_ADDRESS }}
                    destination={{ address: JLS_OFFICE_ADDRESS }}
                    waypoints={usable.map((s) => ({ lat: s.lat, lng: s.lng, address: s.address }))}
                    optimize
                    onRoute={setRoute}
                    className="h-full"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border text-center text-muted-foreground">
                    <MapPin className="h-8 w-8 opacity-20" />
                    <p className="max-w-xs text-xs leading-relaxed">
                      {ready
                        ? "Google Maps isn't configured — add the API key under Settings → Integrations → Google Maps to see the route and optimized stop order here."
                        : "Loading map…"}
                    </p>
                    {googleMapsDirectionsUrl(usable) && (
                      <a href={googleMapsDirectionsUrl(usable)!} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary hover:underline">
                        Open route in Google Maps ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
                {navUrl && (
                  <Button asChild size="sm" className="h-8 gap-1.5">
                    <a href={navUrl} target="_blank" rel="noopener noreferrer">
                      <Navigation className="h-3.5 w-3.5" /> Open in Google Maps
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
