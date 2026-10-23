/**
 * Orbit 2 — entry point.
 *
 * Three modules across the top, per the specification:
 *
 *   Dashboard      analytics, the calendar and workforce scheduling
 *   Project        Internal Request
 *   Managed Boats  small-boat operations and maintenance
 *
 * Project List, Bunkering and EHS NOC Record moved to Permits → Vessel Operation
 * Services (orbit2-vessel-ops.tsx), where the Port Agency team works them. They
 * read the same tables, so the dashboard still counts every record.
 */
import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FolderKanban, Ship } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrbit2 } from "./orbit2-data";
import { Orbit2Dashboard } from "./orbit2-dashboard";
import { Orbit2InternalRequests } from "./orbit2-internal-requests";
import { Orbit2Boats } from "./orbit2-boats";

type Tab = "dashboard" | "project" | "boats";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "project", label: "Project", icon: FolderKanban },
  { key: "boats", label: "Managed Boats", icon: Ship },
];

export function Orbit2Hub() {
  const [tab, setTab] = useState<Tab>("dashboard");
  // A link to one managed boat (?boat=<id>, optionally &view=services — the
  // service-due alerts use it) opens Managed Boats on that boat.
  const link = useRouterState({ select: (s) => s.location.search as { boat?: unknown; view?: unknown } });
  const linkBoat = typeof link?.boat === "string" ? link.boat : null;
  const linkView = typeof link?.view === "string" ? link.view : null;
  useEffect(() => { if (linkBoat) setTab("boats"); }, [linkBoat]);
  const navigate = useNavigate();

  const {
    projects, noc, boats, boatTasks, boatDocuments, boatInventory, schedule, loading, reload,
  } = useOrbit2();

  /**
   * Quick Task Initialization — a click on an empty calendar slot lands on the
   * Project List (Permits → Vessel Operation Services) with the date and time
   * already filled in.
   */
  function createAt(date: string, time: string) {
    navigate({ to: "/polaris-redesign", search: { screen: "permits", tab: "vessel-ops", date, time } as any });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div className="text-[14px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">Operations</div>
        <h1 className="mt-0.5 font-display text-[28px] font-bold leading-tight tracking-tight">Orbit 2</h1>
      </header>

      <nav className="flex items-center gap-1 border-b border-border/40 bg-muted/10 px-6 py-2.5">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[15px] font-semibold transition",
              tab === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "dashboard" ? (
          <Orbit2Dashboard
            projects={projects} noc={noc} boats={boats} boatTasks={boatTasks}
            schedule={schedule} loading={loading} reload={reload} onCreateAt={createAt}
          />
        ) : tab === "boats" ? (
          <Orbit2Boats
            boats={boats} boatTasks={boatTasks} boatDocuments={boatDocuments} boatInventory={boatInventory}
            loading={loading} reload={reload}
            focusBoatId={linkBoat} focusServices={linkView === "services"}
          />
        ) : (
          <Orbit2InternalRequests />
        )}
      </div>
    </div>
  );
}
