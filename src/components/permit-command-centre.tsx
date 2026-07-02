import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PERMIT_META, daysUntil, expiryVariant } from "@/lib/permit-types";
import type { Permit, PermitType } from "@/lib/permit-types";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle, CheckCircle2, Clock, FileCheck2, Loader2,
  ArrowRight, Search, Shield, ExternalLink, ChevronDown, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Yacht = { id: string; vessel_name: string };

type EnrichedPermit = Permit & {
  vessel_name: string;
  days: number | null;
};

type UrgencyBand = {
  key: string;
  label: string;
  description: string;
  accent: string;
  bgAccent: string;
  borderAccent: string;
  iconColor: string;
  Icon: React.ComponentType<{ className?: string }>;
  filter: (days: number | null) => boolean;
};

const BANDS: UrgencyBand[] = [
  {
    key: "overdue",
    label: "Overdue",
    description: "Already expired",
    accent: "text-destructive",
    bgAccent: "bg-destructive/8",
    borderAccent: "border-destructive/30",
    iconColor: "text-destructive",
    Icon: AlertTriangle,
    filter: (d) => d !== null && d < 0,
  },
  {
    key: "critical",
    label: "Critical",
    description: "Expires within 7 days",
    accent: "text-orange-400",
    bgAccent: "bg-orange-500/8",
    borderAccent: "border-orange-400/30",
    iconColor: "text-orange-400",
    Icon: AlertTriangle,
    filter: (d) => d !== null && d >= 0 && d <= 7,
  },
  {
    key: "warning",
    label: "Expiring Soon",
    description: "8 – 30 days",
    accent: "text-warning",
    bgAccent: "bg-warning/8",
    borderAccent: "border-warning/30",
    iconColor: "text-warning",
    Icon: Clock,
    filter: (d) => d !== null && d > 7 && d <= 30,
  },
  {
    key: "upcoming",
    label: "Upcoming",
    description: "31 – 90 days",
    accent: "text-sky-400",
    bgAccent: "bg-sky-500/8",
    borderAccent: "border-sky-400/30",
    iconColor: "text-sky-400",
    Icon: Clock,
    filter: (d) => d !== null && d > 30 && d <= 90,
  },
  {
    key: "ok",
    label: "Valid",
    description: "More than 90 days",
    accent: "text-success",
    bgAccent: "bg-success/8",
    borderAccent: "border-success/30",
    iconColor: "text-success",
    Icon: CheckCircle2,
    filter: (d) => d !== null && d > 90,
  },
  {
    key: "no-expiry",
    label: "No Expiry Set",
    description: "Missing expiry date",
    accent: "text-muted-foreground",
    bgAccent: "bg-muted/30",
    borderAccent: "border-border/50",
    iconColor: "text-muted-foreground",
    Icon: FileCheck2,
    filter: (d) => d === null,
  },
];

function dayLabel(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days}d`;
}

function StatCard({
  label, value, sub, accent, Icon,
}: {
  label: string; value: number; sub?: string;
  accent: string; Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className={cn("flex items-center justify-between rounded-xl border bg-card px-4 py-3.5 transition-colors hover:bg-card/80", accent.replace("text-", "border-").replace("/400", "/20").replace("/foreground", "/20").replace("muted", "border"))}>
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/70">{label}</div>
        <div className={cn("mt-1 font-display text-[1.625rem] font-bold leading-none tabular-nums", accent)}>{value}</div>
        {sub && <div className="mt-0.5 text-[10px] text-muted-foreground/50">{sub}</div>}
      </div>
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", accent.replace("text-", "bg-") + "/10")}>
        <Icon className={cn("h-[1.125rem] w-[1.125rem] opacity-80", accent)} />
      </div>
    </div>
  );
}

function BandSection({
  band, permits, defaultOpen,
}: {
  band: UrgencyBand;
  permits: EnrichedPermit[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { Icon } = band;

  if (permits.length === 0) return null;

  return (
    <div className={cn("rounded-xl border overflow-hidden", band.borderAccent)}>
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/20",
          band.bgAccent,
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", band.iconColor)} />
        <span className={cn("font-semibold text-sm", band.accent)}>{band.label}</span>
        <span className="text-[11px] text-muted-foreground/70">{band.description}</span>
        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums", band.bgAccent, band.accent, "border", band.borderAccent)}>
          {permits.length}
        </span>
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />}
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-border/40 bg-card/60 text-[10.5px] uppercase tracking-wider text-muted-foreground/60">
                <th className="px-4 py-2 text-left font-medium">Permit Type</th>
                <th className="px-4 py-2 text-left font-medium">Vessel</th>
                <th className="px-4 py-2 text-left font-medium">Permit #</th>
                <th className="px-4 py-2 text-left font-medium">Holder</th>
                <th className="px-4 py-2 text-left font-medium">Expiry</th>
                <th className="px-4 py-2 text-right font-medium">Time Left</th>
                <th className="px-4 py-2 text-right font-medium">Go to</th>
              </tr>
            </thead>
            <tbody>
              {permits.map((p) => {
                const meta = PERMIT_META[p.permit_type as PermitType];
                const variant = expiryVariant(p.days);
                return (
                  <tr
                    key={p.id}
                    className="border-t border-border/30 transition-colors hover:bg-accent/20"
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground/90">{meta?.label ?? p.permit_type}</td>
                    <td className="px-4 py-2.5 text-foreground/75">{p.vessel_name}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-foreground/60">
                      {p.permit_number ?? <span className="text-muted-foreground/35">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-foreground/65">
                      {p.holder_name ?? <span className="text-muted-foreground/35">—</span>}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-foreground/65">
                      {p.expiry_date ?? <span className="text-muted-foreground/35">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={cn("pill", variant)}>{dayLabel(p.days)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {meta && (
                        <Link
                          to={meta.route as any}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground/60 hover:bg-accent hover:text-foreground transition-colors"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ALL_PERMIT_TYPES = Object.keys(PERMIT_META) as PermitType[];

export function PermitCommandCentre({ onOpenType }: { onOpenType?: (t: PermitType) => void } = {}) {
  const [permits, setPermits] = useState<Permit[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [vesselFilter, setVesselFilter] = useState("__all");
  const [typeFilter, setTypeFilter] = useState("__all");

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    // Supabase/PostgREST caps a single response at 1000 rows — page through so
    // every permit is loaded (there are several thousand).
    const PAGE = 1000;
    const allPermits: Permit[] = [];
    let from = 0;
    let permitErr: string | null = null;
    for (;;) {
      const { data, error } = await (supabase as any)
        .from("permits")
        .select("*")
        .order("expiry_date", { ascending: true, nullsFirst: false })
        .range(from, from + PAGE - 1);
      if (error) { permitErr = error.message; break; }
      const batch = (data ?? []) as Permit[];
      allPermits.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    const yachtsRes = await supabase.from("yachts").select("id, vessel_name").order("vessel_name");
    if (permitErr) toast.error(permitErr);
    if (yachtsRes.error) toast.error(yachtsRes.error.message);
    setPermits(allPermits);
    setYachts((yachtsRes.data ?? []) as Yacht[]);
    setLoading(false);
  }

  const yachtMap = useMemo(
    () => new Map(yachts.map((y) => [y.id, y.vessel_name])),
    [yachts],
  );

  const enriched = useMemo<EnrichedPermit[]>(() => {
    return permits.map((p) => ({
      ...p,
      vessel_name: p.yacht_id ? (yachtMap.get(p.yacht_id) ?? "Unknown") : "—",
      days: daysUntil(p.expiry_date),
    }));
  }, [permits, yachtMap]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (vesselFilter !== "__all") list = list.filter((p) => p.yacht_id === vesselFilter);
    if (typeFilter !== "__all") list = list.filter((p) => p.permit_type === typeFilter);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((p) =>
        [p.permit_number, p.holder_name, p.vessel_name, p.issuing_authority, p.notes]
          .some((v) => String(v ?? "").toLowerCase().includes(s)),
      );
    }
    return list;
  }, [enriched, vesselFilter, typeFilter, q]);

  const summary = useMemo(() => {
    let overdue = 0, critical = 0, warning = 0, noExpiry = 0;
    for (const p of enriched) {
      if (p.days === null) noExpiry++;
      else if (p.days < 0) overdue++;
      else if (p.days <= 7) critical++;
      else if (p.days <= 30) warning++;
    }
    return { overdue, critical, warning, noExpiry, total: enriched.length };
  }, [enriched]);

  const banded = useMemo(() =>
    BANDS.map((band) => ({
      band,
      permits: filtered.filter((p) => band.filter(p.days)),
    })),
    [filtered],
  );

  const urgentCount = summary.overdue + summary.critical;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 backdrop-blur-sm px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
            Port &amp; Operations / Permits
          </div>
          <h1 className="mt-0.5 font-display text-[1.25rem] font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary/70" />
            Permit Command Centre
          </h1>
        </div>
        {urgentCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold text-destructive">{urgentCount} urgent</span>
            <span className="text-xs text-muted-foreground">— immediate attention required</span>
          </div>
        )}
      </header>

      {/* Stat bar */}
      <div className="grid grid-cols-5 gap-3 border-b border-border/40 px-6 py-4">
        <StatCard label="Total Permits" value={summary.total} accent="text-primary" Icon={FileCheck2} />
        <StatCard label="Overdue" value={summary.overdue} accent="text-destructive" Icon={AlertTriangle} sub="already expired" />
        <StatCard label="Critical" value={summary.critical} accent="text-orange-400" Icon={AlertTriangle} sub="≤ 7 days" />
        <StatCard label="Expiring Soon" value={summary.warning} accent="text-warning" Icon={Clock} sub="8 – 30 days" />
        <StatCard label="No Expiry Set" value={summary.noExpiry} accent="text-muted-foreground" Icon={FileCheck2} sub="needs attention" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 border-b border-border/40 bg-card/20 px-6 py-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by number, holder, vessel…"
            className="h-8 pl-8 text-[13px] bg-background/50 border-border/60"
          />
        </div>
        <Select value={vesselFilter} onValueChange={setVesselFilter}>
          <SelectTrigger className="h-8 w-52 text-[13px] bg-background/50 border-border/60">
            <SelectValue placeholder="All vessels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All vessels</SelectItem>
            {yachts.map((y) => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-60 text-[13px] bg-background/50 border-border/60">
            <SelectValue placeholder="All permit types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All permit types</SelectItem>
            {ALL_PERMIT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{PERMIT_META[t].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(vesselFilter !== "__all" || typeFilter !== "__all" || q) && (
          <Button
            variant="ghost" size="sm"
            className="h-8 px-3 text-[13px] text-muted-foreground"
            onClick={() => { setVesselFilter("__all"); setTypeFilter("__all"); setQ(""); }}
          >
            Clear filters
          </Button>
        )}
        <div className="ml-auto text-[12px] text-muted-foreground/60">
          {filtered.length} of {enriched.length} permits
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
        {loading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading all permits…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
            <CheckCircle2 className="h-10 w-10 text-success/60" />
            <h3 className="mt-3 font-display text-lg font-semibold">All clear</h3>
            <p className="text-sm text-muted-foreground">No permits match your current filters.</p>
          </div>
        ) : (
          banded.map(({ band, permits: bandPermits }) => (
            <BandSection
              key={band.key}
              band={band}
              permits={bandPermits}
              defaultOpen={band.key === "overdue" || band.key === "critical" || band.key === "warning"}
            />
          ))
        )}
      </div>

      {/* Footer legend */}
      <div className="flex items-center gap-4 border-t border-border/40 bg-card/20 px-6 py-2">
        <span className="text-[11px] text-muted-foreground/50 font-medium uppercase tracking-wider">Quick links:</span>
        {ALL_PERMIT_TYPES.map((t) => (
          onOpenType ? (
            <button
              key={t}
              onClick={() => onOpenType(t)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              {PERMIT_META[t].label} <ArrowRight className="h-2.5 w-2.5" />
            </button>
          ) : (
            <Link
              key={t}
              to={PERMIT_META[t].route as any}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              {PERMIT_META[t].label} <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          )
        ))}
      </div>
    </div>
  );
}
