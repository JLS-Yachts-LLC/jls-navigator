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
  { key: "visa", label: "Visa", icon: FileText },
  { key: "soso", label: "Sign On / Off", icon: LogIn },
] as const;

export function ImmigrationHub() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("visa");

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
        {/* Embedded: the visa flow (New Application, detail) renders inline so it
            stays inside the Beta shell instead of navigating to /_app routes. */}
        {tab === "visa" ? <VisaDashboard embedded /> : <SignOnOffPage />}
      </div>
    </div>
  );
}

export default ImmigrationHub;
