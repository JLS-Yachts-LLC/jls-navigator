import { useState } from "react";
import { Ship, Navigation, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { YachtsPage } from "@/routes/_app.yachts.index";
import { MyFleetPage } from "@/components/my-fleet-page";
import { VesselReportScreen } from "@/components/visa/VesselReportScreen";

/**
 * Vessels hub — Vessel Overview + Live Tracking as tabs (instead of separate nav
 * lines). Each tab renders the real page (full functionality incl. SharePoint
 * vessel images on the overview, and the live map on tracking). Only the active
 * tab mounts. Beta styling is inherited from the shell's pds-embed area.
 */
const TABS = [
  { key: "overview", label: "Vessel Overview", icon: Ship, Comp: YachtsPage },
  { key: "tracking", label: "Live Tracking", icon: Navigation, Comp: MyFleetPage },
  { key: "reports", label: "Vessel Reports", icon: BarChart3, Comp: VesselReportScreen },
] as const;

export function VesselsHub() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("overview");
  const Active = TABS.find((t) => t.key === tab)?.Comp ?? YachtsPage;

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
        <Active />
      </div>
    </div>
  );
}

export default VesselsHub;
