import { useState } from "react";
import { Ship, Navigation, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { YachtsPage } from "@/routes/_app.yachts.index";
import { YachtDetail } from "@/routes/_app.yachts.$id";
import { MyFleetPage } from "@/components/my-fleet-page";
import { VesselReportScreen } from "@/components/visa/VesselReportScreen";

/**
 * Vessels hub — Vessel Overview + Live Tracking + Vessel Reports as tabs
 * (instead of separate nav lines). Each tab renders the real page (full
 * functionality incl. SharePoint vessel images on the overview, and the live
 * map on tracking). Beta styling is inherited from the shell's pds-embed area.
 *
 * Overview keeps vessel detail INSIDE the Beta shell: clicking a vessel opens
 * it inline (list ↔ detail via state) rather than routing to /yachts/$id.
 */
const TABS = [
  { key: "overview", label: "Vessel Overview", icon: Ship },
  { key: "tracking", label: "Live Tracking", icon: Navigation },
  { key: "reports", label: "Vessel Reports", icon: BarChart3 },
] as const;

export function VesselsHub() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("overview");
  // Set when a yacht detail's "view on map" button is clicked — Live Tracking
  // opens focused on that yacht.
  const [trackFocusId, setTrackFocusId] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 bg-card/30 px-4">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "overview" ? (
          <BetaVesselOverview onTrack={(id) => { setTrackFocusId(id); setTab("tracking"); }} />
        ) : tab === "tracking" ? (
          <MyFleetPage focusYachtId={trackFocusId} />
        ) : (
          <VesselReportScreen />
        )}
      </div>
    </div>
  );
}

/** Overview tab: vessel list ↔ inline detail, both inside the Beta shell. */
function BetaVesselOverview({ onTrack }: { onTrack?: (id: string) => void }) {
  const [yachtId, setYachtId] = useState<string | null>(null);
  return yachtId ? (
    <YachtDetail yachtId={yachtId} embedded onBack={() => setYachtId(null)} onTrack={onTrack} />
  ) : (
    <YachtsPage onOpenYacht={setYachtId} />
  );
}

export default VesselsHub;
