import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/status-pill";
import { YACHT_COLUMNS, DEFAULT_VISIBLE_COLUMNS, type YachtColumnKey } from "@/lib/yacht-fields";
import {
  Plus, LayoutGrid, List, Search, SlidersHorizontal, Anchor, Ship, MapPin, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_app/yachts/")({
  component: YachtsPage,
  head: () => ({ meta: [{ title: "Yachts — JLS Yachts CRM" }] }),
});

type Yacht = Record<string, unknown> & { id: string; vessel_name: string; vessel_image?: string | null };

function YachtsPage() {
  const [view, setView] = useState<"list" | "cards">("list");
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [visible, setVisible] = useState<YachtColumnKey[]>(DEFAULT_VISIBLE_COLUMNS);

  useEffect(() => { void load(); }, []);
  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("yachts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setYachts((data ?? []) as Yacht[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!q.trim()) return yachts;
    const s = q.toLowerCase();
    return yachts.filter((y) =>
      Object.values(y).some((v) => String(v ?? "").toLowerCase().includes(s)),
    );
  }, [yachts, q]);

  const stats = useMemo(() => {
    const total = yachts.length;
    const inPort = yachts.filter((y) => String(y.status ?? "").toLowerCase().includes("active") || String(y.status ?? "").toLowerCase().includes("port")).length;
    const archived = yachts.filter((y) => y.archive === true).length;
    return { total, inPort, archived };
  }, [yachts]);

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-border bg-card/40 px-6 py-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Anchor className="h-3.5 w-3.5" /> Port & Operations
            <span className="opacity-40">/</span>
            <span className="text-foreground">Yachts</span>
          </div>
          <h1 className="font-display text-xl font-semibold tracking-tight">Yacht Registry</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search yachts…" className="h-9 w-64 pl-8" />
          </div>
          <div className="flex h-9 rounded-md border border-border bg-card p-0.5">
            <button onClick={() => setView("list")} className={`flex items-center gap-1 rounded px-2.5 text-xs ${view === "list" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button onClick={() => setView("cards")} className={`flex items-center gap-1 rounded px-2.5 text-xs ${view === "cards" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Cards
            </button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5" /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-96 overflow-y-auto w-64">
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {YACHT_COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={visible.includes(c.key)}
                  onCheckedChange={(v) =>
                    setVisible((prev) => (v ? [...prev, c.key] : prev.filter((k) => k !== c.key)))
                  }
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button asChild size="sm" className="h-9 gap-1.5">
            <Link to="/yachts/new"><Plus className="h-3.5 w-3.5" /> Add Yacht</Link>
          </Button>
        </div>
      </header>

      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-3 px-6 py-4">
        <Stat label="Total Vessels" value={stats.total} icon={Ship} accent="text-primary" />
        <Stat label="Active / In Port" value={stats.inPort} icon={MapPin} accent="text-success" />
        <Stat label="Archived" value={stats.archived} icon={Calendar} accent="text-muted-foreground" />
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : view === "list" ? (
          <ListView rows={filtered} visible={visible} />
        ) : (
          <CardsView rows={filtered} />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, accent }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; accent: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`font-display text-2xl font-bold tabular-nums ${accent}`}>{value}</div>
      </div>
      <Icon className={`h-7 w-7 ${accent} opacity-60`} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
      <Ship className="h-10 w-10 text-muted-foreground/60" />
      <h3 className="mt-3 font-display text-lg font-semibold">No yachts yet</h3>
      <p className="text-sm text-muted-foreground">Add your first vessel to get started.</p>
      <Button asChild className="mt-4 gap-1.5"><Link to="/yachts/new"><Plus className="h-4 w-4" /> Add Yacht</Link></Button>
    </div>
  );
}

function fmt(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function ListView({ rows, visible }: { rows: Yacht[]; visible: YachtColumnKey[] }) {
  const cols = YACHT_COLUMNS.filter((c) => visible.includes(c.key));
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
          <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">●</th>
            {cols.map((c) => (
              <th key={c.key} className="whitespace-nowrap px-3 py-2 text-left font-medium">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((y, i) => (
            <tr key={y.id} className="border-b border-border/50 transition hover:bg-accent/30">
              <td className="px-3 py-2 text-muted-foreground tabular-nums text-xs">{String(i + 1).padStart(3, "0")}</td>
              {cols.map((c) => (
                <td key={c.key} className="whitespace-nowrap px-3 py-2">
                  {c.key === "vessel_name" ? (
                    <Link to="/yachts/$id" params={{ id: y.id }} className="font-medium text-foreground hover:text-primary">
                      {fmt(y[c.key])}
                    </Link>
                  ) : c.key === "status" ? (
                    <StatusPill status={y[c.key] as string | null} />
                  ) : (
                    <span className="text-foreground/80">{fmt(y[c.key])}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardsView({ rows }: { rows: Yacht[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((y) => (
        <Link
          key={y.id}
          to="/yachts/$id"
          params={{ id: y.id }}
          className="group overflow-hidden rounded-lg border border-border bg-card transition hover:border-primary/50 hover:shadow-[0_8px_30px_-10px_oklch(0.62_0.18_245/.35)]"
        >
          <div className="aspect-[16/9] overflow-hidden bg-muted">
            {y.vessel_image ? (
              <img src={y.vessel_image as string} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
            ) : (
              <div className="flex h-full w-full items-center justify-center"><Ship className="h-10 w-10 text-muted-foreground/40" /></div>
            )}
          </div>
          <div className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display font-semibold leading-tight">{fmt(y.vessel_name)}</h3>
              <StatusPill status={y.status as string | null} />
            </div>
            <div className="text-xs text-muted-foreground">{fmt(y.vessel_type)} · {fmt(y.flag)}</div>
            <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
              <div><div className="text-muted-foreground">Berth</div><div className="font-medium">{fmt(y.berth)}</div></div>
              <div><div className="text-muted-foreground">LOA</div><div className="font-medium tabular-nums">{fmt(y.length_overall_m)} m</div></div>
              <div><div className="text-muted-foreground">ETA</div><div className="font-medium tabular-nums">{fmt(y.eta)}</div></div>
              <div><div className="text-muted-foreground">ETD</div><div className="font-medium tabular-nums">{fmt(y.etd)}</div></div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
