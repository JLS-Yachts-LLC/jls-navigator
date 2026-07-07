import { useState } from "react";
import { Shield, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { PermitCommandCentre } from "@/components/permit-command-centre";
import { PermitsPage } from "@/components/permits-page";
import { PERMIT_META, type PermitType } from "@/lib/permit-types";

/**
 * Permits hub — the Command Centre plus every permit type as mini tabs
 * (same pattern as the Vessels / Immigration hubs). Only the active tab
 * mounts; the command centre's quick links switch tabs instead of routing.
 */
const TYPE_TABS = Object.keys(PERMIT_META) as PermitType[];

// Short tab labels — the full PERMIT_META labels are too long for a tab strip.
const SHORT_LABEL: Record<string, string> = {
  exit_entry: "Exit & Entry",
  sanitation: "Sanitation",
  cruising_mothership: "Cruising — Mothership",
  cruising_tenders: "Cruising — Tenders",
  gate_pass: "Gate Pass",
  tdra: "TDRA",
  navigation_license: "Navigation License",
  dma: "DMA",
  abu_dhabi: "Abu Dhabi",
};

export function PermitsHub() {
  const [tab, setTab] = useState<"centre" | PermitType>("centre");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 bg-card/30 px-4">
        <button
          onClick={() => setTab("centre")}
          className={cn(
            "flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
            tab === "centre"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Shield className="h-4 w-4" /> Command Centre
        </button>
        {TYPE_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <FileText className="h-3.5 w-3.5" /> {SHORT_LABEL[t] ?? PERMIT_META[t].label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "centre" ? (
          <PermitCommandCentre onOpenType={(t) => setTab(t)} />
        ) : (
          <PermitsPage key={tab} permitType={tab} />
        )}
      </div>
    </div>
  );
}

export default PermitsHub;
