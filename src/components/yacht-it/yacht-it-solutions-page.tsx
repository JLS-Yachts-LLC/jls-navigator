import { useState } from "react";
import { Headset, Ship, KeyRound, Boxes, FileText, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceDeskPage } from "@/components/service-desk/service-desk-page";
import { ItYachtsPage } from "@/components/yacht-it/it-yachts-page";
import { LicensingPage } from "@/components/licensing-page";
import { InternalServicesPage } from "@/components/yacht-it/internal-services-page";
import { SimCardsPage } from "@/components/yacht-it/sim-cards-page";

/**
 * Yacht IT Solutions — single sidebar entry that surfaces its sections as tabs.
 * Each tab renders the existing page component; the underlying routes still work
 * for deep links. Only the active tab mounts (lazy data loads).
 *
 * Subscriptions register (internal_services) is split by scope:
 *   - Client Subscriptions and Services → subscriptions managed for client yachts
 *   - JLS Yachts Internal Services       → JLS Yachts LLC's own vendor subscriptions
 */
const TABS = [
  { key: "service-desk", label: "Service Desk", icon: Headset },
  { key: "it-yachts", label: "IT Yachts", icon: Ship },
  { key: "licensing", label: "Licensing", icon: KeyRound },
  { key: "sim-cards", label: "SIM Cards", icon: Smartphone },
  { key: "client", label: "Client Subscriptions and Services", icon: FileText },
  { key: "internal", label: "JLS Yachts Internal Services", icon: Boxes },
] as const;

export function YachtItSolutionsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("service-desk");

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
        {tab === "service-desk" && <ServiceDeskPage />}
        {tab === "it-yachts" && <ItYachtsPage />}
        {tab === "licensing" && <LicensingPage />}
        {tab === "sim-cards" && <SimCardsPage />}
        {tab === "client" && <InternalServicesPage scope="client" />}
        {tab === "internal" && <InternalServicesPage scope="internal" />}
      </div>
    </div>
  );
}

export default YachtItSolutionsPage;
