/**
 * Vessel Operation Services — the Orbit 2 Project List, Bunkering and EHS NOC
 * Record boards, shown as a tab of the Permits hub (after Abu Dhabi) so the Port
 * Agency team works them there. Same tables, same screens as before the move;
 * only Internal Request stays under Orbit 2 → Project.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useOrbit2, suggestionsFor } from "./orbit2-data";
import { Orbit2Projects, type Orbit2Prefill } from "./orbit2-projects";
import { Orbit2Noc } from "./orbit2-noc";

type Sub = "list" | "bunkering" | "noc";

const SUBS: { key: Sub; label: string }[] = [
  { key: "list", label: "Project List" },
  { key: "bunkering", label: "Bunkering" },
  { key: "noc", label: "EHS NOC Record" },
];

export function Orbit2VesselOps({ prefill = null }: { prefill?: Orbit2Prefill | null }) {
  const [sub, setSub] = useState<Sub>("list");
  const { projects, noc, boats, loading, reload } = useOrbit2();

  // Managed boats feed the client typeahead everywhere a boat can be named.
  const boatNames = suggestionsFor(boats.map((b) => b.name));

  return (
    <div className="flex h-full flex-col">
      <nav className="flex items-center gap-1 border-b border-border/40 px-6 py-2">
        {SUBS.map(({ key, label }) => (
          <button key={key} onClick={() => setSub(key)}
            className={cn("rounded-md px-3 py-1 text-[15px] font-medium transition",
              sub === key ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60")}>
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-auto">
        {sub === "noc" ? (
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
