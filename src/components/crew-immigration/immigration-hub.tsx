import { useState } from "react";
import { FileText, LogIn, IdCard } from "lucide-react";
import { cn } from "@/lib/utils";
import VisaDashboard from "@/components/visa/VisaDashboard";
import { SignOnOffPage } from "@/components/crew-immigration/sign-on-off-page";

/**
 * Immigration hub — single entry that surfaces Visa + Sign On/Off as tabs
 * (instead of separate nav lines). Each tab renders the real, fully-functional
 * page from the standard app, so behaviour matches the original view exactly.
 * Only the active tab mounts.
 */
const TABS = [
  { key: "visa", label: "Visa", icon: FileText, Comp: VisaDashboard },
  { key: "soso", label: "Sign On / Off", icon: LogIn, Comp: SignOnOffPage },
] as const;

export function ImmigrationHub() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("visa");
  const Active = TABS.find((t) => t.key === tab)?.Comp ?? VisaDashboard;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 bg-card/30 px-4">
        <span className="mr-3 flex shrink-0 items-center gap-1.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
          <IdCard className="h-3.5 w-3.5 text-primary/70" /> Immigration
        </span>
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

export default ImmigrationHub;
