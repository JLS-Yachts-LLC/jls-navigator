/**
 * Orbit 2 — entry point.
 *
 * Three modules across the top, per the specification:
 *
 *   Dashboard      analytics, the calendar and workforce scheduling
 *   Project        the master registry — Project List, Bunkering, EHS NOC Record
 *   Managed Boats  small-boat operations and maintenance
 *
 * The hub owns the data. All three screens read the same load, so a record added
 * in Bunkering shows on the dashboard the moment it is saved without either
 * screen knowing the other exists.
 */
import { useState } from "react";
import { LayoutDashboard, FolderKanban, Ship } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrbit2, suggestionsFor } from "./orbit2-data";
import { Orbit2Dashboard } from "./orbit2-dashboard";
import { Orbit2Projects, type Orbit2Prefill } from "./orbit2-projects";
import { Orbit2Noc } from "./orbit2-noc";
import { Orbit2Boats } from "./orbit2-boats";

type Tab = "dashboard" | "project" | "boats";
type Sub = "list" | "bunkering" | "noc";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "project", label: "Project", icon: FolderKanban },
  { key: "boats", label: "Managed Boats", icon: Ship },
];

const SUBS: { key: Sub; label: string }[] = [
  { key: "list", label: "Project List" },
  { key: "bunkering", label: "Bunkering" },
  { key: "noc", label: "EHS NOC Record" },
];

export function Orbit2Hub() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [sub, setSub] = useState<Sub>("list");
  const [prefill, setPrefill] = useState<Orbit2Prefill | null>(null);

  const {
    projects, noc, boats, boatTasks, boatDocuments, boatInventory, schedule, loading, reload,
  } = useOrbit2();

  // Managed boats feed the client typeahead everywhere a boat can be named.
  const boatNames = suggestionsFor(boats.map((b) => b.name));

  /**
   * Quick Task Initialization — a click on an empty calendar slot lands on the
   * Project List with the date and time already filled in.
   */
  function createAt(date: string, time: string) {
    setPrefill({ schedule_date: date, schedule_time: time, nonce: Date.now() });
    setSub("list");
    setTab("project");
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

      {tab === "project" && (
        <nav className="flex items-center gap-1 border-b border-border/40 px-6 py-2">
          {SUBS.map(({ key, label }) => (
            <button key={key} onClick={() => setSub(key)}
              className={cn("rounded-md px-3 py-1 text-[15px] font-medium transition",
                sub === key ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60")}>
              {label}
            </button>
          ))}
        </nav>
      )}

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
          />
        ) : sub === "noc" ? (
          <Orbit2Noc
            rows={noc} loading={loading} reload={reload}
            clientPool={[...boatNames, ...suggestionsFor(projects.map((p) => p.client_name))]}
          />
        ) : (
          <Orbit2Projects
            key={sub}
            recordType={sub === "bunkering" ? "bunkering" : "project"}
            projects={projects} loading={loading} reload={reload} boatNames={boatNames}
            prefill={sub === "list" ? prefill : null}
          />
        )}
      </div>
    </div>
  );
}
