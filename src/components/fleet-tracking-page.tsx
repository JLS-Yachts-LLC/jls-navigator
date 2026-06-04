import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MapPin, ExternalLink, RefreshCw, Loader2, Navigation } from "lucide-react";

// Live GPS monitoring — shareable read-only monitor token from tracking.mygps.ae.
// This is a purpose-built live-tracking view (map + vehicle list + speeds + addresses)
// maintained by the GPS provider. Swap the token here if it ever changes.
const MONITOR_TOKEN = "fd25f0cce7423608b3fa820bb6a92931";
const MONITOR_URL = `https://tracking.mygps.ae/backend/monitor_token.php?token=${MONITOR_TOKEN}`;

export function FleetTrackingPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState(false);

  function refresh() {
    setLoaded(false);
    setReloadKey((k) => k + 1);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
            ShipSync / Transport &amp; Fleet
          </div>
          <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
            <Navigation className="h-4 w-4 text-primary/80" />
            Live Fleet Tracking
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={refresh}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" asChild>
            <a href={MONITOR_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Open Full View
            </a>
          </Button>
        </div>
      </header>

      {/* Live map embed */}
      <div className="relative flex-1 min-h-0">
        {!loaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background">
            <Loader2 className="h-6 w-6 animate-spin text-primary/70" />
            <p className="text-sm text-muted-foreground">Loading live vehicle positions…</p>
            <p className="text-xs text-muted-foreground/50">Powered by mygps.ae</p>
          </div>
        )}
        <iframe
          key={reloadKey}
          src={MONITOR_URL}
          title="Live Fleet Tracking"
          className="h-full w-full border-0"
          onLoad={() => setLoaded(true)}
          allow="geolocation"
        />
      </div>

      {/* Footer note */}
      <div className="border-t border-border/40 bg-muted/10 px-6 py-2 flex items-center gap-2">
        <MapPin className="h-3 w-3 text-muted-foreground/50" />
        <span className="text-[11px] text-muted-foreground/60">
          Real-time GPS positions, speed, and trip history from the JLS vehicle fleet · mygps.ae
        </span>
      </div>
    </div>
  );
}
