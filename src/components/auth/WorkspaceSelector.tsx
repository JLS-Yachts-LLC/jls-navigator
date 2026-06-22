import { MapPin, Ship, LayoutGrid, ChevronRight } from "lucide-react";
import type { WorkspaceContext } from "@/lib/auth/workspace";

/**
 * Post-auth workspace chooser (POLARIS_PLATFORM_UX.md §1.3). Only rendered when
 * a user has access to more than one workspace; single-workspace users are
 * routed directly without seeing this.
 */
export function WorkspaceSelector({
  workspaces, onSelect,
}: {
  workspaces: WorkspaceContext[];
  onSelect: (ws: WorkspaceContext) => void;
}) {
  const groups: { key: WorkspaceContext["type"]; heading: string; Icon: typeof MapPin }[] = [
    { key: "organisation", heading: "Organisations", Icon: MapPin },
    { key: "vessel", heading: "Vessels", Icon: Ship },
    { key: "module", heading: "Module Access", Icon: LayoutGrid },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Select workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">Choose where you'd like to start.</p>
      </div>

      {groups.map(({ key, heading, Icon }) => {
        const items = workspaces.filter((w) => w.type === key);
        if (!items.length) return null;
        return (
          <div key={key} className="space-y-1.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{heading}</p>
            <div className="space-y-1.5">
              {items.map((ws) => (
                <button
                  key={`${ws.type}:${ws.id}`}
                  onClick={() => onSelect(ws)}
                  className="group flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 text-left transition hover:border-primary/40 hover:bg-accent"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{ws.label}</span>
                    {ws.sub && <span className="block truncate text-xs text-muted-foreground">{ws.sub}</span>}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
