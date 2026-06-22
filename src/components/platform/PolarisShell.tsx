/**
 * POLARIS — dashboard shell + panel primitives.  Ticket #143.
 *
 * Shared chrome and building blocks for the role/workspace dashboards
 * (#139–#142). Each dashboard declares a set of panels and renders them through
 * these primitives; panels can be permission-gated via the access layer.
 */
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useBranding } from "@/lib/platform/branding";

export function PolarisShell({
  label, title, workspace, actions, children, brandOrgId,
}: {
  label: string;
  title: string;
  workspace?: { type: string; label: string } | null;
  actions?: ReactNode;
  children: ReactNode;
  /** Override which org's branding to show (defaults to the viewer's org). */
  brandOrgId?: string | null;
}) {
  const brand = useBranding(brandOrgId);
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          {brand.logoUrl && (
            <img src={brand.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
              {label}
              {brand.displayName && <span className="text-muted-foreground/40">· {brand.displayName}</span>}
            </div>
            <h1 className="mt-0.5 truncate font-display text-[1.25rem] font-semibold tracking-tight"
              style={brand.primaryColor ? { color: brand.primaryColor } : undefined}>{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {workspace && (
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
              <span className="capitalize text-muted-foreground/70">{workspace.type}</span>
              <span className="font-medium text-foreground">{workspace.label}</span>
            </span>
          )}
          {actions}
        </div>
      </header>
      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto max-w-6xl space-y-5">{children}</div>
      </div>
    </div>
  );
}

/** Responsive auto-fit grid. */
export function PanelGrid({ children, min = 220 }: { children: ReactNode; min?: number }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}>
      {children}
    </div>
  );
}

export function MetricCard({
  label, value, sub, icon, loading, locked,
}: {
  label: string; value: ReactNode; sub?: string; icon?: ReactNode; loading?: boolean; locked?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-[0_2px_12px_-6px_rgba(0,0,0,0.4)]">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[14px] font-semibold uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className="mt-2 font-display text-[28px] font-bold tabular-nums leading-tight">
        {locked ? <span className="text-base text-muted-foreground/60">Restricted</span>
          : loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          : value}
      </div>
      {sub && !locked && <div className="mt-0.5 text-[13px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Panel({
  title, action, children, span,
}: {
  title: string; action?: ReactNode; children: ReactNode; span?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card ${span ? "" : ""}`}>
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/** A list panel with a graceful empty state — never fabricates data. */
export function ListPanel<T>({
  title, items, loading, empty = "Nothing to show yet", render, action,
}: {
  title: string; items: T[] | undefined; loading?: boolean; empty?: string;
  render: (item: T, i: number) => ReactNode; action?: ReactNode;
}) {
  return (
    <Panel title={title} action={action}>
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : !items || items.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted-foreground/70">{empty}</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {items.map((it, i) => <li key={i} className="py-2 text-sm">{render(it, i)}</li>)}
        </ul>
      )}
    </Panel>
  );
}

export function VesselBanner({
  name, sub, flag,
}: { name: string; sub?: string; flag?: string | null }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-[#0D1520] to-[#0D1A24] p-5">
      <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_85%_120%,rgba(0,196,204,0.30),transparent_55%)]" />
      <div className="relative flex items-center gap-3">
        {flag && <span className="text-2xl">{flag}</span>}
        <div>
          <div className="font-display text-xl font-semibold text-[#E8EDF5]">{name}</div>
          {sub && <div className="text-xs text-[#7B93AD]">{sub}</div>}
        </div>
      </div>
    </div>
  );
}
