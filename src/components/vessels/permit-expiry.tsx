/**
 * Permit expiry on the Vessel Overview (SD-0047): each vessel's current permits
 * with the days left, coloured by urgency — on the fleet cards and on the vessel
 * page. Same rules as the daily reminders (src/lib/permit-expiry.ts).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { PERMIT_META } from "@/lib/permit-types";
import {
  SHOW_EXPIRED_FOR_DAYS, TRACKED_PERMIT_TYPES, agentsFor, currentPermits, daysShort, daysText, expiryTone, todayUae,
  type CurrentPermit, type ExpiryPermitRow, type ExpiryTone, type VesselExpiryRow,
} from "@/lib/permit-expiry";
import type { AgentRow } from "./vessel-agents";

const sb = supabase as any;

const TONE: Record<ExpiryTone, string> = {
  expired: "border-red-500/40 bg-red-500/15 text-red-300",
  critical: "border-red-500/40 bg-red-500/15 text-red-300",
  soon: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  upcoming: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

async function loadPermits(yachtId?: string): Promise<ExpiryPermitRow[]> {
  const since = new Date(Date.now() - (SHOW_EXPIRED_FOR_DAYS + 1) * 86_400_000).toISOString().slice(0, 10);
  let q = sb.from("permits")
    .select("id, yacht_id, permit_type, permit_number, issuing_authority, dma_phase, expiry_date, status")
    .in("permit_type", TRACKED_PERMIT_TYPES as unknown as string[])
    .gte("expiry_date", since)
    .neq("status", "cancelled");
  if (yachtId) q = q.eq("yacht_id", yachtId);
  const { data } = await q;
  return (data ?? []) as ExpiryPermitRow[];
}

/** Current permits for every vessel passed in, keyed by vessel id. */
export function useFleetPermitExpiry(vessels: VesselExpiryRow[]): Map<string, CurrentPermit[]> {
  const [rows, setRows] = useState<ExpiryPermitRow[]>([]);
  useEffect(() => { void loadPermits().then(setRows).catch(() => {}); }, []);
  return useMemo(() => {
    const m = new Map<string, CurrentPermit[]>();
    for (const p of currentPermits(rows, vessels, todayUae())) m.set(p.yachtId, [...(m.get(p.yachtId) ?? []), p]);
    return m;
  }, [rows, vessels]);
}

/** Compact chips for a fleet card: "FMA cruising permit · 25d". */
export function PermitExpiryChips({ items, max = 3 }: { items: CurrentPermit[] | undefined; max?: number }) {
  if (!items?.length) return null;
  const shown = items.slice(0, max);
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {shown.map((p) => (
        <span key={p.key} title={`${p.label} — ${daysText(p.days)} (${fmt(p.expiryDate)})${p.fromVesselRecord ? " · from the vessel record" : ""}`}
          className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium", TONE[expiryTone(p.days)])}>
          {p.label} · <span className="tabular-nums">{daysShort(p.days)}</span>
        </span>
      ))}
      {items.length > max && <span className="self-center text-[12px] text-muted-foreground">+{items.length - max} more</span>}
    </div>
  );
}

function fmt(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** The vessel page's panel: each current permit, its expiry, days left and who's responsible. */
export function PermitExpiryPanel({
  yachtId, cruisingPermitExpiry, agents,
}: {
  yachtId: string;
  cruisingPermitExpiry: string | null;
  agents: AgentRow[];
}) {
  const [rows, setRows] = useState<ExpiryPermitRow[] | null>(null);
  useEffect(() => { void loadPermits(yachtId).then(setRows).catch(() => setRows([])); }, [yachtId]);
  const items = useMemo(
    () => (rows ? currentPermits(rows, [{ id: yachtId, cruising_permit_expiry: cruisingPermitExpiry }], todayUae()) : []),
    [rows, yachtId, cruisingPermitExpiry],
  );

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-semibold">Permit expiry</h3>
      </div>
      <p className="text-[13px] text-muted-foreground">
        Reminders go to the responsible agent at 60, 30 and 7 days, and on the day it expires.
      </p>
      {rows === null ? null : !items.length ? (
        <p className="mt-3 text-[13px] text-muted-foreground">No permits with an expiry date on file.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((p) => {
            const who = agentsFor(p.permitType, agents) as AgentRow[];
            const route = PERMIT_META[p.permitType as keyof typeof PERMIT_META]?.route;
            return (
              <li key={p.key} className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-background/40 p-2.5">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium">
                    {route ? <Link to={route as any} className="hover:underline">{p.label}</Link> : p.label}
                  </div>
                  <div className="text-[13px] text-muted-foreground">
                    Expires {fmt(p.expiryDate)}{p.permitNumber ? ` · ${p.permitNumber}` : ""}{p.fromVesselRecord ? " · from the vessel record" : ""}
                  </div>
                  <div className={cn("text-[13px]", who.length ? "text-muted-foreground" : "text-amber-400/90")}>
                    {who.length ? `Agent: ${who.map((a) => a.name).join(", ")}` : "No agent responsible"}
                  </div>
                </div>
                <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[13px] font-semibold tabular-nums", TONE[expiryTone(p.days)])}>
                  {daysText(p.days)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
