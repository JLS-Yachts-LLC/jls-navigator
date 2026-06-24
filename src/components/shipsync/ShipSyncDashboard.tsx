import { useMemo } from "react";
import { STATUS_META, ACTIVE_STATUSES, type PackageStatus } from "@/lib/shipsync/model";
import { StatusBadge } from "@/components/shipsync/shared";
import type { ShipSyncData } from "@/components/shipsync-page";

export function ShipSyncDashboard({ data }: { data: ShipSyncData }) {
  const s = useMemo(() => {
    const pkgs = data.packages;
    const active = pkgs.filter((p) => ACTIVE_STATUSES.includes(p.status)).length;
    const inStorage = pkgs.filter((p) => p.status === "in_storage").length;
    const out = pkgs.filter((p) => p.status === "out_for_delivery" || p.status === "assigned").length;
    const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
    const deliveredMonth = pkgs.filter((p) => p.delivered_at && new Date(p.delivered_at) >= startMonth).length;

    const byStatus = new Map<string, number>();
    for (const p of pkgs) byStatus.set(p.status, (byStatus.get(p.status) ?? 0) + 1);

    const byBoat = new Map<string, number>();
    for (const p of pkgs) if (ACTIVE_STATUSES.includes(p.status) && p.boat_name) byBoat.set(p.boat_name, (byBoat.get(p.boat_name) ?? 0) + 1);
    const topBoats = [...byBoat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    const byDriver = new Map<string, number>();
    for (const p of pkgs) if (["assigned", "out_for_delivery"].includes(p.status) && p.driver_id) byDriver.set(p.driver_id, (byDriver.get(p.driver_id) ?? 0) + 1);

    return { active, inStorage, out, deliveredMonth, byStatus, topBoats, byDriver };
  }, [data]);

  const cards = [
    { label: "Active packages", value: s.active },
    { label: "In storage", value: s.inStorage },
    { label: "Assigned / out for delivery", value: s.out },
    { label: "Delivered this month", value: s.deliveredMonth },
  ];
  const maxBoat = Math.max(1, ...s.topBoats.map(([, n]) => n));

  return (
    <div className="px-6 py-5">
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</div>
            <div className="mt-1 font-display text-2xl font-bold tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* By status */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 text-sm font-semibold">By status</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STATUS_META) as PackageStatus[]).map((st) => (
              <div key={st} className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5">
                <StatusBadge status={st} /><span className="font-display text-sm font-bold tabular-nums">{s.byStatus.get(st) ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top boats (active) */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 text-sm font-semibold">Active packages by boat</div>
          {s.topBoats.length === 0 ? <div className="text-sm text-muted-foreground">Nothing active.</div> : (
            <div className="flex flex-col gap-2">
              {s.topBoats.map(([boat, n]) => (
                <div key={boat} className="flex items-center gap-3">
                  <span className="w-32 truncate text-[13px]">{boat}</span>
                  <div className="h-3 flex-1 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${(n / maxBoat) * 100}%` }} /></div>
                  <span className="w-6 text-right text-[12px] tabular-nums text-muted-foreground">{n}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By driver (in flight) */}
        <div className="rounded-xl border border-border bg-card p-4 md:col-span-2">
          <div className="mb-3 text-sm font-semibold">On the road — packages per driver</div>
          {data.drivers.filter((d) => (s.byDriver.get(d.id) ?? 0) > 0).length === 0 ? (
            <div className="text-sm text-muted-foreground">No packages assigned to drivers right now.</div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {data.drivers.filter((d) => (s.byDriver.get(d.id) ?? 0) > 0).map((d) => (
                <div key={d.id} className="rounded-lg border border-border/60 px-3 py-2">
                  <div className="text-[13px] font-medium">{d.name}</div>
                  <div className="font-display text-xl font-bold tabular-nums">{s.byDriver.get(d.id)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
