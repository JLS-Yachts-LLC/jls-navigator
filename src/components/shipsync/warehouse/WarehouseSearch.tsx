import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, MapPin, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISPLAY_STATUS_STYLE, deriveStatus, locationCode, type StorageLocation } from "@/components/shipsync/warehouse/warehouse-constants";
import type { WarehouseData } from "@/components/shipsync/ShipSyncWarehouse";

interface SearchResult extends StorageLocation {
  refNo: string;
  ownerLabel: string; // "Client or Department"
  description: string;
  status: ReturnType<typeof deriveStatus>;
}

function StatusPill({ label, style }: { label: string; style: string }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", style)}>{label}</span>;
}

export function WarehouseSearch({ data }: { data: WarehouseData }) {
  const [q, setQ] = useState("");
  const [expandedRef, setExpandedRef] = useState<string | null>(null);

  const allItems = useMemo<SearchResult[]>(() => [
    ...data.clientItems.map((i) => ({
      refNo: i.ref_no, ownerLabel: i.client_name, description: i.description, zone: i.zone, bay: i.bay, shelf: i.shelf,
      status: deriveStatus(i.due_date, i.status),
    })),
    ...data.internalItems.map((i) => ({
      refNo: i.ref_no, ownerLabel: i.department, description: i.description, zone: i.zone, bay: i.bay, shelf: i.shelf,
      status: deriveStatus(i.destruction_date, i.status),
    })),
  ], [data]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return allItems.filter((i) =>
      [i.refNo, i.ownerLabel, i.description, locationCode(i)].join(" ").toLowerCase().includes(s));
  }, [allItems, q]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setExpandedRef(null); }}
          placeholder="Search by reference number, client/department, or description…"
          className="h-11 pl-9 text-sm"
          autoFocus
        />
      </div>

      {!q.trim() ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
          <Search className="h-6 w-6 text-muted-foreground/40" />
          Start typing to find a package or item and its exact storage location.
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">No match for "{q}".</div>
      ) : (
        <div className="flex flex-col gap-2">
          {results.map((r) => {
            const isOpen = expandedRef === r.refNo;
            const contents = data.packageContents.filter((c) => c.ref_no === r.refNo);
            return (
              <div key={r.refNo} className="rounded-xl border border-border bg-card">
                <button onClick={() => setExpandedRef(isOpen ? null : r.refNo)}
                  className="flex w-full flex-wrap items-center gap-3 p-3 text-left">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"><MapPin className="h-4 w-4 text-primary/80" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[12.5px] font-semibold">{r.refNo}</span>
                      <span className="text-sm text-muted-foreground">{r.ownerLabel}</span>
                      <StatusPill label={r.status} style={DISPLAY_STATUS_STYLE[r.status]} />
                    </div>
                    <div className="truncate text-[12.5px] text-muted-foreground">{r.description}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-1.5 text-[12px]">
                    <span><span className="text-muted-foreground">Zone</span> <strong>{r.zone ?? "—"}</strong></span>
                    <span className="text-muted-foreground/40">·</span>
                    <span><span className="text-muted-foreground">Bay</span> <strong>{r.bay ?? "—"}</strong></span>
                    <span className="text-muted-foreground/40">·</span>
                    <span><span className="text-muted-foreground">Shelf</span> <strong>{r.shelf ?? "—"}</strong></span>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="border-t border-border/60 px-3 py-3">
                    <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Package Contents</div>
                    {contents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No packing list available for <span className="font-mono">{r.refNo}</span>.</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {contents.map((c) => (
                          <div key={c.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-[12.5px]">
                            <span className="font-medium">{c.item_name}</span>
                            <span className="text-muted-foreground">{c.quantity} {c.unit}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
