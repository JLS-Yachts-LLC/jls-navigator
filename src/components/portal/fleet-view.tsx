/**
 * Client portal — the Fleet.
 *
 * A login linked to more than one vessel (yachts and/or Orbit 2 managed boats,
 * one captain_accounts row each) gets a "Fleet" button in the sidebar in place
 * of "Your vessel". It opens this page: a tile per vessel, and a tap opens that
 * vessel's portal (the yacht app, or the small-boat portal for a boat).
 *
 * Photos: a yacht's from `yachts` (portal RLS already limits the login to its
 * own yachts); a boat's from /api/portal/boats, which is scoped server-side to
 * the boats on the login.
 */
import { useEffect, useState } from "react";
import { Anchor, ChevronRight, Eye, LayoutGrid, LogOut, Ship } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PolarisMark } from "@/components/brand/PolarisMark";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";

export type FleetVessel = {
  /** "y:<yacht id>" or "b:<captain_accounts id>" — unique across the fleet. */
  key: string;
  name: string;
  kind: "yacht" | "boat";
  yachtId?: string;
  boatId?: string;
};

type Look = { photo: string | null; logo: string | null; detail: string | null };

/** The sidebar card: "Fleet · N vessels" over the vessel on screen; opens the Fleet. */
export function FleetButton({ count, current, onOpen }: { count: number; current: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} title="See all your vessels"
            className="group -mx-1 mt-0.5 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded-lg px-1 py-1 text-left transition hover:bg-background/60">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
          <LayoutGrid className="h-3 w-3" /> Fleet · {count} vessels
        </div>
        <div className="mt-0.5 truncate text-sm font-bold text-foreground">{current}</div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}

export function FleetView({ vessels, currentKey, displayName, preview, onOpen, onBack, onSignOut }: {
  vessels: FleetVessel[];
  /** The vessel that was on screen — marked, and where Back returns to. */
  currentKey: string | null;
  displayName: string;
  preview: boolean;
  onOpen: (v: FleetVessel) => void;
  onBack: () => void;
  onSignOut: () => void;
}) {
  const [looks, setLooks] = useState<Record<string, Look>>({});

  useEffect(() => {
    let alive = true;
    const yachtIds = vessels.flatMap((v) => (v.yachtId ? [v.yachtId] : []));
    void (async () => {
      const next: Record<string, Look> = {};
      if (yachtIds.length) {
        const { data } = await (supabase as any).from("yachts")
          .select("id, vessel_image, logo_url, vessel_type, berth, location").in("id", yachtIds);
        for (const y of data ?? []) {
          next[`y:${y.id}`] = {
            photo: y.vessel_image ?? null, logo: y.logo_url ?? null,
            detail: [y.vessel_type, y.berth ? `Berth ${y.berth}` : y.location].filter(Boolean).join(" · ") || null,
          };
        }
      }
      if (vessels.some((v) => v.boatId)) {
        try {
          const res = await portalFetch("/api/portal/boats");
          const body = res.ok ? await res.json() : { boats: [] };
          for (const v of vessels) {
            const b = (body.boats ?? []).find((x: any) => x.id === v.boatId);
            if (b) next[v.key] = { photo: b.photoUrl ?? null, logo: null, detail: b.boatType ?? null };
          }
        } catch { /* tiles fall back to an icon */ }
      }
      if (alive) setLooks(next);
    })();
    return () => { alive = false; };
  }, [vessels]);

  const yachts = vessels.filter((v) => v.kind === "yacht").length;
  const boats = vessels.length - yachts;
  const summary = [
    yachts ? `${yachts} yacht${yachts === 1 ? "" : "s"}` : null,
    boats ? `${boats} managed boat${boats === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");
  const current = vessels.find((v) => v.key === currentKey) ?? null;

  return (
    <div className={cn("min-h-screen w-full", preview && "pt-7")}>
      {preview && (
        <div className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-sm font-semibold text-black">
          <Eye className="h-3.5 w-3.5" />
          Previewing {displayName}’s portal — read only
          <button onClick={() => window.location.assign("/polaris-redesign")} className="rounded bg-black/15 px-2 py-0.5 hover:bg-black/25">Exit preview</button>
        </div>
      )}

      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <PolarisMark size={36} title="" />
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-wide text-foreground">JLS YACHTS</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Client Portal</div>
          </div>
        </div>
        <button onClick={onSignOut}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-8">
        {current && (
          <button onClick={onBack}
                  className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground">
            <ChevronRight className="h-4 w-4 rotate-180" /> Back to {current.name}
          </button>
        )}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your fleet</div>
            <h1 className="text-3xl font-bold text-foreground">{vessels.length} vessels</h1>
            <p className="mt-1 text-sm text-muted-foreground">{summary} — choose one to open it.</p>
          </div>
          <div className="text-base font-medium text-primary">Welcome {displayName}</div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vessels.map((v) => {
            const look = looks[v.key];
            const isCurrent = v.key === currentKey;
            const Icon = v.kind === "yacht" ? Anchor : Ship;
            return (
              <button key={v.key} type="button" onClick={() => onOpen(v)}
                      className={cn(
                        "group overflow-hidden rounded-2xl border bg-card/80 text-left shadow-[0_4px_20px_-8px_rgba(0,0,0,0.5)] transition hover:-translate-y-0.5 hover:border-primary/60",
                        isCurrent ? "border-primary/70 ring-1 ring-primary/40" : "border-border",
                      )}>
                <div className="relative aspect-[16/9] w-full bg-background/60">
                  {look?.photo ? (
                    <img src={look.photo} alt={v.name} className="h-full w-full object-cover" />
                  ) : look?.logo ? (
                    <div className="flex h-full w-full items-center justify-center bg-white p-6">
                      <img src={look.logo} alt={`${v.name} logo`} className="max-h-full max-w-full object-contain" />
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                      <Icon className="h-14 w-14" />
                    </div>
                  )}
                  {isCurrent && (
                    <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-0.5 text-sm font-semibold text-primary-foreground">
                      Open now
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-bold text-foreground">{v.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm font-medium",
                        v.kind === "yacht" ? "border-primary/30 bg-primary/10 text-primary" : "border-teal-400/30 bg-teal-400/10 text-teal-300",
                      )}>
                        <Icon className="h-3.5 w-3.5" /> {v.kind === "yacht" ? "Yacht" : "Managed boat"}
                      </span>
                      {look?.detail && <span className="truncate">{look.detail}</span>}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
