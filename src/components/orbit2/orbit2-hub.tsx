/**
 * Orbit 2 — entry point.
 *
 * Three tabs, matching the client's own layout: Dashboard, Project, Small Boats.
 * The Dashboard is built and reads from the tasks entered here. Project and
 * Small Boats are deliberately empty until their detail is specified — an
 * invented version of either would only have to be unpicked later.
 */
import { useState } from "react";
import { LayoutDashboard, FolderKanban, Ship } from "lucide-react";
import { cn } from "@/lib/utils";
import { Orbit2Dashboard } from "./orbit2-dashboard";
import { Orbit2TaskDialog } from "./orbit2-task-dialog";
import { useOrbit2 } from "./orbit2-data";

type Tab = "dashboard" | "project" | "boats";
const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "project", label: "Project", icon: FolderKanban },
  { key: "boats", label: "Small Boats", icon: Ship },
];

export function Orbit2Hub() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [adding, setAdding] = useState(false);
  // The hub owns the vessel list and the reload, so adding a task from any tab
  // refreshes the dashboard behind it.
  const { yachts, reload } = useOrbit2();
  const [nonce, setNonce] = useState(0);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Operations</div>
        <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight">Orbit 2</h1>
      </header>

      <div className="flex items-center gap-1 border-b border-border/40 bg-muted/10 px-6 py-2.5">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
              tab === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "dashboard" ? (
          <Orbit2Dashboard key={nonce} onAddTask={() => setAdding(true)} />
        ) : (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <p className="font-display text-base font-semibold">
              {tab === "project" ? "Project" : "Small Boats"}
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              Not built yet — waiting on the detail for this tab. The Dashboard is live and
              fills in as tasks are added.
            </p>
          </div>
        )}
      </div>

      <Orbit2TaskDialog
        open={adding}
        editing={null}
        yachts={yachts}
        onClose={() => setAdding(false)}
        onSaved={() => { void reload(); setNonce((n) => n + 1); }}
      />
    </div>
  );
}
