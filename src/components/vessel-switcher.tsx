import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Ship, ChevronsUpDown, Check, Anchor } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Yacht = { id: string; vessel_name: string; vessel_type: string | null; flag: string | null };

const STORAGE_KEY = "polaris.activeVessel";
const EVENT_KEY = "polaris:vessel-change";

/** Read the active vessel id from localStorage (other pages can use this). */
export function getActiveVessel(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("aquila.activeVessel");
  } catch { return null; }
}

/** Reactive hook — returns the active vessel id and updates when it changes. */
export function useActiveVessel(): string | null {
  const [id, setId] = useState<string | null>(() =>
    typeof window !== "undefined" ? getActiveVessel() : null,
  );
  useEffect(() => {
    const handler = (e: Event) => setId((e as CustomEvent).detail ?? null);
    window.addEventListener(EVENT_KEY, handler);
    return () => window.removeEventListener(EVENT_KEY, handler);
  }, []);
  return id;
}

export function VesselSwitcher() {
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("yachts")
        .select("id, vessel_name, vessel_type, flag")
        .order("vessel_name");
      setYachts((data ?? []) as Yacht[]);
    })();
    setActiveId(getActiveVessel());
  }, []);

  function select(id: string | null) {
    setActiveId(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: id }));
  }

  const active = yachts.find((y) => y.id === activeId) ?? null;

  return (
    <div className="px-2.5 pt-2.5 pb-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-2.5 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/30 px-2.5 py-2 text-left transition hover:bg-sidebar-accent/60">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary/20 text-sidebar-primary">
              {active ? <Ship className="h-4 w-4" /> : <Anchor className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold text-sidebar-foreground">
                {active ? active.vessel_name : "All Vessels"}
              </div>
              <div className="truncate text-[10px] text-sidebar-foreground/45">
                {active
                  ? [active.vessel_type, active.flag].filter(Boolean).join(" · ") || "Vessel"
                  : `${yachts.length} vessels`}
              </div>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60 max-h-80 overflow-auto">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Active Vessel
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => select(null)} className="gap-2">
            <Anchor className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1">All Vessels</span>
            {!activeId && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {yachts.map((y) => (
            <DropdownMenuItem key={y.id} onClick={() => select(y.id)} className="gap-2">
              <Ship className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1 truncate">{y.vessel_name}</span>
              {activeId === y.id && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
