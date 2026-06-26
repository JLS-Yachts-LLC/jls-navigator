import { useState } from "react";
import { Headset, Ship, KeyRound, Boxes, FileText, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceDeskPage } from "@/components/service-desk/service-desk-page";
import { ItYachtsPage } from "@/components/yacht-it/it-yachts-page";
import { LicensingPage } from "@/components/licensing-page";
import { InternalServicesPage } from "@/components/yacht-it/internal-services-page";
import { YachtItPage } from "@/components/yacht-it/yacht-it-page";

/**
 * Yacht IT Solutions — single sidebar entry that surfaces its sections as tabs
 * (instead of expanding the nav with nested lines). Each tab renders the existing
 * page component; the underlying routes (/it-tickets, /licensing, …) still work
 * for deep links. Only the active tab's component mounts (lazy data loads).
 */
const TABS = [
  { key: "service-desk", label: "Service Desk", icon: Headset, Comp: ServiceDeskPage },
  { key: "it-yachts", label: "IT Yachts", icon: Ship, Comp: ItYachtsPage },
  { key: "licensing", label: "Licensing", icon: KeyRound, Comp: LicensingPage },
  { key: "internal", label: "Internal Services", icon: Boxes, Comp: InternalServicesPage },
  { key: "client", label: "Client Services & Subscriptions", icon: FileText, Comp: YachtItPage },
] as const;

export function YachtItSolutionsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("service-desk");
  const Active = TABS.find((t) => t.key === tab)?.Comp ?? ServiceDeskPage;

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar (doubles as the module header) */}
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

export default YachtItSolutionsPage;
