/**
 * Where a vessel record came from, and when — so two vessels with the same name
 * can be told apart.
 *
 * On 30 Sep 2026 (SD-0039) the Agency lead had "Amara" (synced from SharePoint
 * in May, with all its documents) and "AMARA" (added in Polaris that morning)
 * side by side, set out to archive the duplicate, and archived the original:
 * every card and every confirmation showed nothing but the name. The SharePoint
 * link and the date added are the two facts that tell a long-standing record
 * from a fresh duplicate at a glance.
 */
import { Cloud, PlusCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type VesselLike = {
  id?: string;
  vessel_name?: unknown;
  sharepoint_item_id?: unknown;
  created_at?: unknown;
  imo_no?: unknown;
  eta?: unknown;
  archive?: unknown;
};

export const normVesselName = (v: unknown) => String(v ?? "").trim().toLowerCase();

function added(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** "SharePoint #265 · added 15 May 2026" or "Added in Polaris · 30 Sep 2026". */
export function provenanceText(y: VesselLike): string {
  const when = added(y.created_at);
  return y.sharepoint_item_id
    ? `SharePoint #${y.sharepoint_item_id}${when ? ` · added ${when}` : ""}`
    : `Added in Polaris${when ? ` · ${when}` : ""}`;
}

export function VesselProvenance({ y, className }: { y: VesselLike; className?: string }) {
  const Icon = y.sharepoint_item_id ? Cloud : PlusCircle;
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground", className)}
      title={y.sharepoint_item_id
        ? "Synced from the SharePoint Yachts list"
        : "Created in Polaris — not linked to a SharePoint list item"}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{provenanceText(y)}</span>
    </span>
  );
}

/** Amber flag for a vessel whose name another record also uses. */
export function SameNameBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400",
        className,
      )}
      title="Another vessel has the same name — check which one you mean"
    >
      <AlertTriangle className="h-3 w-3" /> Same name as another vessel
    </span>
  );
}

/**
 * What an archive or delete confirmation shows about the vessel it will act on,
 * and — the point of it — the other records sharing its name.
 */
export function VesselConfirmDetails({ y, sameName }: { y: VesselLike; sameName: VesselLike[] }) {
  return (
    <span className="mt-3 block space-y-2 text-left">
      <span className="block rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
        <span className="block font-medium">{String(y.vessel_name ?? "This vessel")}</span>
        <span className="mt-0.5 block text-muted-foreground">
          {provenanceText(y)}
          {y.imo_no ? ` · IMO ${String(y.imo_no)}` : ""}
          {y.eta ? ` · ETA ${String(y.eta)}` : ""}
        </span>
      </span>
      {sameName.length > 0 && (
        <span className="block rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <span className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            {sameName.length === 1 ? "Another vessel has this name" : `${sameName.length} other vessels have this name`}
            {" "}— make sure this is the one you mean.
          </span>
          {sameName.map((o) => (
            <span key={String(o.id)} className="mt-1 block">
              {String(o.vessel_name ?? "")}: {provenanceText(o)}
              {o.imo_no ? ` · IMO ${String(o.imo_no)}` : ""}
              {o.archive ? " · archived" : ""}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
