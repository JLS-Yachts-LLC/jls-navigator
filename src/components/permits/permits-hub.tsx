import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Shield, FileText, Inbox, Ship } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PermitInbox } from "@/components/permits/permit-inbox";
import { cn } from "@/lib/utils";
import { PermitCommandCentre } from "@/components/permit-command-centre";
import { PermitsPage } from "@/components/permits-page";
import { PERMIT_META, type PermitType } from "@/lib/permit-types";
import { Orbit2VesselOps } from "@/components/orbit2/orbit2-vessel-ops";
import type { Orbit2Prefill } from "@/components/orbit2/orbit2-projects";

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
  // ?tab=vessel-ops (optionally &date=&time=) opens Vessel Operation Services —
  // the Orbit 2 calendar uses it to start a new project on the clicked slot.
  const link = useRouterState({ select: (s) => s.location.search as { tab?: unknown; date?: unknown; time?: unknown } });
  const linkVesselOps = link?.tab === "vessel-ops";
  const linkDate = typeof link?.date === "string" ? link.date : null;
  const linkTime = typeof link?.time === "string" ? link.time : "";
  const [tab, setTab] = useState<"centre" | "inbox" | "vessel_ops" | PermitType>(linkVesselOps ? "vessel_ops" : "centre");
  const [prefill, setPrefill] = useState<Orbit2Prefill | null>(null);
  useEffect(() => {
    if (!linkVesselOps) return;
    setTab("vessel_ops");
    if (linkDate) setPrefill({ schedule_date: linkDate, schedule_time: linkTime, nonce: Date.now() });
  }, [linkVesselOps, linkDate, linkTime]);
  // Emailed permits waiting for the Agency team — shown on the Inbox tab.
  const [inboxCount, setInboxCount] = useState(0);
  useEffect(() => {
    void (supabase as any).from("permit_inbox").select("id", { count: "exact", head: true })
      .in("status", ["pending", "error"]).then(({ count }: any) => setInboxCount(count ?? 0));
  }, []);

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
        <button
          onClick={() => setTab("inbox")}
          className={cn(
            "flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
            tab === "inbox"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Inbox className="h-4 w-4" /> Inbox
          {inboxCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{inboxCount}</span>
          )}
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
        {/* Orbit 2 Project List, Bunkering and EHS NOC Record, worked by the Port Agency team. */}
        <button
          onClick={() => setTab("vessel_ops")}
          className={cn(
            "flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
            tab === "vessel_ops"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Ship className="h-3.5 w-3.5" /> Vessel Operation Services
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "centre" ? (
          <PermitCommandCentre onOpenType={(t) => setTab(t)} />
        ) : tab === "inbox" ? (
          <PermitInbox onCountChange={setInboxCount} />
        ) : tab === "vessel_ops" ? (
          <Orbit2VesselOps prefill={prefill} />
        ) : (
          <PermitsPage key={tab} permitType={tab} />
        )}
      </div>
    </div>
  );
}

export default PermitsHub;
