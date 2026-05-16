import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/status-pill";
import { YACHT_COLUMNS, DEFAULT_VISIBLE_COLUMNS, type YachtColumnKey } from "@/lib/yacht-fields";
import {
  Plus, LayoutGrid, List, Search, SlidersHorizontal, Anchor, Ship, MapPin, LogOut, RefreshCcw,
  ChevronUp, ChevronDown, ChevronsUpDown, Pencil, Radar,
  ChevronLeft, ChevronRight, BookMarked, X, Check,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuCheckboxItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_app/yachts/")({
  component: YachtsPage,
  head: () => ({ meta: [{ title: "Yachts — JLS Yachts CRM" }] }),
});

// ── Types ──────────────────────────────────────────────────────────────────────
type Yacht = Record<string, unknown> & { id: string; vessel_name: string; vessel_image?: string | null };
type StatusFilter = "all" | "in_country" | "departed" | "change_agency";
type SortDir = "asc" | "desc";

type ViewPreset = {
  id: string;
  name: string;
  columns: YachtColumnKey[];
  builtin?: boolean;
};

// ── Built-in view presets ──────────────────────────────────────────────────────
const BUILTIN_VIEWS: ViewPreset[] = [
  {
    id: "default",
    name: "Default",
    columns: DEFAULT_VISIBLE_COLUMNS,
    builtin: true,
  },
  {
    id: "compact",
    name: "Compact",
    columns: ["vessel_name", "flag", "status", "berth", "eta", "etd"],
    builtin: true,
  },
  {
    id: "operations",
    name: "Operations",
    columns: [
      "vessel_name", "vessel_type", "flag", "status",
      "berth", "location", "eta", "etd", "departed_date", "cruising_permit_expiry",
    ],
    builtin: true,
  },
  {
    id: "registry",
    name: "Registry",
    columns: [
      "vessel_name", "vessel_type", "flag", "imo_no", "official_no",
      "port_of_registry", "built_year", "builders_name", "gross_tonnage", "owners_name",
    ],
    builtin: true,
  },
];

// ── localStorage keys ──────────────────────────────────────────────────────────
const LS_VIEW_KEY      = "jls-yachts-view";           // "list" | "cards"
const LS_VISIBLE_KEY   = "jls-yachts-visible-columns"; // YachtColumnKey[]
const LS_CUSTOM_KEY    = "jls-yachts-custom-views";    // ViewPreset[]
const LS_ACTIVE_KEY    = "jls-yachts-active-view";     // string | null

// ── Helpers ────────────────────────────────────────────────────────────────────
function loadView(): "list" | "cards" {
  try { return localStorage.getItem(LS_VIEW_KEY) === "cards" ? "cards" : "list"; }
  catch { return "list"; }
}

function loadVisibleCols(): YachtColumnKey[] {
  try {
    const raw = localStorage.getItem(LS_VISIBLE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as YachtColumnKey[];
      const valid = YACHT_COLUMNS.map((c) => c.key);
      const filtered = parsed.filter((k) => valid.includes(k));
      if (filtered.length > 0) return filtered;
    }
  } catch { /* ignore */ }
  return DEFAULT_VISIBLE_COLUMNS;
}

function loadCustomViews(): ViewPreset[] {
  try {
    const raw = localStorage.getItem(LS_CUSTOM_KEY);
    return raw ? (JSON.parse(raw) as ViewPreset[]) : [];
  } catch { return []; }
}

function loadActiveViewId(): string | null {
  try { return localStorage.getItem(LS_ACTIVE_KEY); }
  catch { return null; }
}

/** One-time init: resolves active view columns → visible cols */
function initViewState() {
  const customViews = loadCustomViews();
  const activeViewId = loadActiveViewId();
  let visible: YachtColumnKey[];
  if (activeViewId) {
    const all = [...BUILTIN_VIEWS, ...customViews];
    const match = all.find((v) => v.id === activeViewId);
    visible = match
      ? (match.columns.filter((k) => YACHT_COLUMNS.some((c) => c.key === k)) as YachtColumnKey[])
      : loadVisibleCols();
  } else {
    visible = loadVisibleCols();
  }
  return { customViews, activeViewId, visible };
}

// ── Page component ─────────────────────────────────────────────────────────────
function YachtsPage() {
  // Init from localStorage (runs once)
  const [init] = useState(initViewState);

  const [view, setView] = useState<"list" | "cards">(loadView);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [visible, setVisible] = useState<YachtColumnKey[]>(init.visible);
  const [sortKey, setSortKey] = useState<YachtColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [quickEditId, setQuickEditId] = useState<string | null>(null);

  // View management state
  const [customViews, setCustomViews] = useState<ViewPreset[]>(init.customViews);
  const [activeViewId, setActiveViewId] = useState<string | null>(init.activeViewId);
  const [newViewName, setNewViewName] = useState("");

  useEffect(() => { void load(); }, []);

  // Persist list/cards choice
  useEffect(() => { localStorage.setItem(LS_VIEW_KEY, view); }, [view]);

  // Persist column visibility
  useEffect(() => { localStorage.setItem(LS_VISIBLE_KEY, JSON.stringify(visible)); }, [visible]);

  // Persist custom views
  useEffect(() => { localStorage.setItem(LS_CUSTOM_KEY, JSON.stringify(customViews)); }, [customViews]);

  // Persist active view id
  useEffect(() => {
    if (activeViewId) localStorage.setItem(LS_ACTIVE_KEY, activeViewId);
    else localStorage.removeItem(LS_ACTIVE_KEY);
  }, [activeViewId]);

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

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from("yachts").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else setYachts((prev) => prev.map((y) => (y.id === id ? { ...y, status } : y)));
    setQuickEditId(null);
  }

  // ── View preset functions ────────────────────────────────────────────────────
  const allViews = useMemo(() => [...BUILTIN_VIEWS, ...customViews], [customViews]);
  const activeView = allViews.find((v) => v.id === activeViewId) ?? null;

  function applyView(v: ViewPreset) {
    const validCols = v.columns.filter((k) =>
      YACHT_COLUMNS.some((c) => c.key === k),
    ) as YachtColumnKey[];
    setVisible(validCols);
    setActiveViewId(v.id);
  }

  function cycleView(dir: 1 | -1) {
    if (allViews.length === 0) return;
    const idx = allViews.findIndex((v) => v.id === activeViewId);
    const next = (idx + dir + allViews.length) % allViews.length;
    applyView(allViews[next]);
  }

  function saveCurrentView() {
    const name = newViewName.trim();
    if (!name) return;
    const id = `custom-${Date.now()}`;
    const preset: ViewPreset = { id, name, columns: [...visible] };
    setCustomViews((prev) => [...prev, preset]);
    setActiveViewId(id);
    setNewViewName("");
    toast.success(`View "${name}" saved`);
  }

  function deleteCustomView(id: string) {
    setCustomViews((prev) => prev.filter((v) => v.id !== id));
    if (activeViewId === id) setActiveViewId(null);
  }

  // ── Column toggle (clears active view if user customises manually) ───────────
  function toggleVisible(key: YachtColumnKey, checked: boolean) {
    setVisible((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)));
    setActiveViewId(null); // manually adjusted — no longer a named view
  }

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total      = yachts.length;
    const inCountry  = yachts.filter((y) => String(y.status ?? "").toLowerCase() === "in country").length;
    const departed   = yachts.filter((y) => String(y.status ?? "").toLowerCase() === "departed").length;
    const changeAgency = yachts.filter((y) => String(y.status ?? "").toLowerCase() === "change agency").length;
    return { total, inCountry, departed, changeAgency };
  }, [yachts]);

  const STATUS_TARGETS: Record<Exclude<StatusFilter, "all">, string> = {
    in_country: "in country",
    departed: "departed",
    change_agency: "change agency",
  };

  const filtered = useMemo(() => {
    let rows = yachts;
    if (statusFilter !== "all") {
      const target = STATUS_TARGETS[statusFilter];
      rows = rows.filter((y) => String(y.status ?? "").toLowerCase() === target);
    }
    if (q.trim()) {
      const s = q.toLowerCase();
      rows = rows.filter((y) =>
        Object.values(y).some((v) => String(v ?? "").toLowerCase().includes(s)),
      );
    }
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = String(a[sortKey] ?? "").toLowerCase();
        const bv = String(b[sortKey] ?? "").toLowerCase();
        const cmp = av.localeCompare(bv, undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [yachts, q, statusFilter, sortKey, sortDir]);

  function toggleSort(key: YachtColumnKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function toggleStatFilter(filter: StatusFilter) {
    setStatusFilter((prev) => (prev === filter ? "all" : filter));
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-border bg-card/40 px-5 py-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Anchor className="h-3.5 w-3.5" /> Port & Operations
            <span className="opacity-40">/</span>
            <span className="text-foreground">Yachts</span>
          </div>
          <h1 className="font-display text-base font-semibold tracking-tight">Yacht Registry</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search yachts…"
              className="h-8 w-56 pl-8"
            />
          </div>

          {/* List / Cards toggle */}
          <div className="flex h-8 rounded-md border border-border bg-card p-0.5">
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1 rounded px-2.5 text-xs ${view === "list" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button
              onClick={() => setView("cards")}
              className={`flex items-center gap-1 rounded px-2.5 text-xs ${view === "cards" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Cards
            </button>
          </div>

          {/* View cycle control */}
          <div className="flex h-8 items-center rounded-md border border-border bg-card overflow-hidden">
            <button
              onClick={() => cycleView(-1)}
              title="Previous view"
              className="flex h-full items-center px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 text-[11px] font-medium text-foreground/80 min-w-[72px] text-center select-none">
              {activeView?.name ?? "Custom"}
            </span>
            <button
              onClick={() => cycleView(1)}
              title="Next view"
              className="flex h-full items-center px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Views & Columns dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <BookMarked className="h-3.5 w-3.5" /> Views
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 max-h-[520px] overflow-y-auto">

              {/* Built-in views */}
              <DropdownMenuLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
                <BookMarked className="h-3 w-3" /> Built-in Views
              </DropdownMenuLabel>
              {BUILTIN_VIEWS.map((v) => (
                <DropdownMenuCheckboxItem
                  key={v.id}
                  checked={activeViewId === v.id}
                  onCheckedChange={() => applyView(v)}
                >
                  {v.name}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {v.columns.length} cols
                  </span>
                </DropdownMenuCheckboxItem>
              ))}

              {/* Custom views */}
              {customViews.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">My Views</DropdownMenuLabel>
                  {customViews.map((v) => (
                    <div key={v.id} className="flex items-center pr-1">
                      <DropdownMenuCheckboxItem
                        className="flex-1"
                        checked={activeViewId === v.id}
                        onCheckedChange={() => applyView(v)}
                      >
                        {v.name}
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {v.columns.length} cols
                        </span>
                      </DropdownMenuCheckboxItem>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteCustomView(v.id); }}
                        className="ml-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
                        title={`Delete "${v.name}"`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {/* Save current as */}
              <DropdownMenuSeparator />
              <div
                className="px-2 py-1.5 flex gap-1.5"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Input
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") saveCurrentView();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Save current as…"
                  className="h-7 text-xs flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={(e) => { e.stopPropagation(); saveCurrentView(); }}
                  disabled={!newViewName.trim()}
                >
                  <Check className="h-3 w-3" /> Save
                </Button>
              </div>

              {/* Columns */}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
                <SlidersHorizontal className="h-3 w-3" /> Columns
              </DropdownMenuLabel>
              {YACHT_COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={visible.includes(c.key)}
                  onCheckedChange={(v) => toggleVisible(c.key, v)}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
            <Link to="/yachts/new"><Plus className="h-3.5 w-3.5" /> Add Yacht</Link>
          </Button>
        </div>
      </header>

      {/* Stat strip — clickable to filter */}
      <div className="grid grid-cols-4 gap-3 px-5 py-3">
        <StatCard
          label="Total Vessels" value={stats.total} icon={Ship} accent="text-primary"
          active={statusFilter === "all"} onClick={() => setStatusFilter("all")}
        />
        <StatCard
          label="In Country" value={stats.inCountry} icon={MapPin} accent="text-success"
          active={statusFilter === "in_country"} onClick={() => toggleStatFilter("in_country")}
        />
        <StatCard
          label="Departed" value={stats.departed} icon={LogOut} accent="text-muted-foreground"
          active={statusFilter === "departed"} onClick={() => toggleStatFilter("departed")}
        />
        <StatCard
          label="Change Agency" value={stats.changeAgency} icon={RefreshCcw} accent="text-warning"
          active={statusFilter === "change_agency"} onClick={() => toggleStatFilter("change_agency")}
        />
      </div>

      {statusFilter !== "all" && (
        <div className="px-5 pb-1 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Filtering by: <strong className="text-foreground capitalize">{statusFilter.replace("_", " ")}</strong>
          </span>
          <button onClick={() => setStatusFilter("all")} className="text-xs text-primary hover:underline">
            Clear
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto px-5 pb-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState hasFilter={!!q || statusFilter !== "all"} />
        ) : view === "list" ? (
          <ListView
            rows={filtered}
            visible={visible}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            quickEditId={quickEditId}
            setQuickEditId={setQuickEditId}
            updateStatus={updateStatus}
          />
        ) : (
          <CardsView rows={filtered} />
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, accent, active, onClick,
}: {
  label: string; value: number; icon: React.ComponentType<{ className?: string }>;
  accent: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition hover:border-primary/40 hover:bg-card/80 ${
        active ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card"
      }`}
    >
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`font-display text-2xl font-bold tabular-nums ${accent}`}>{value}</div>
      </div>
      <Icon className={`h-7 w-7 ${accent} opacity-60`} />
    </button>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: YachtColumnKey; sortKey: YachtColumnKey | null; sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 opacity-30" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3 w-3 text-primary" />
    : <ChevronDown className="h-3 w-3 text-primary" />;
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
      <Ship className="h-10 w-10 text-muted-foreground/60" />
      <h3 className="mt-3 font-display text-lg font-semibold">
        {hasFilter ? "No matching yachts" : "No yachts yet"}
      </h3>
      <p className="text-sm text-muted-foreground">
        {hasFilter ? "Try adjusting your search or filter." : "Add your first vessel to get started."}
      </p>
      {!hasFilter && (
        <Button asChild className="mt-4 gap-1.5">
          <Link to="/yachts/new"><Plus className="h-4 w-4" /> Add Yacht</Link>
        </Button>
      )}
    </div>
  );
}

function fmt(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

/** Returns a MarineTraffic deep-link using IMO → MMSI → name as fallback */
function trackUrl(y: Yacht): string {
  const imo = String(y.imo_no ?? "").trim();
  if (imo && imo !== "—") return `https://www.marinetraffic.com/en/ais/details/ships/imo:${imo}`;
  const mmsi = String(y.mmsi ?? "").trim();
  if (mmsi && mmsi !== "—") return `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${mmsi}`;
  return `https://www.marinetraffic.com/en/ais/index/search/all/keyword:${encodeURIComponent(String(y.vessel_name ?? ""))}`;
}

function ListView({
  rows, visible, sortKey, sortDir, onSort, quickEditId, setQuickEditId, updateStatus,
}: {
  rows: Yacht[];
  visible: YachtColumnKey[];
  sortKey: YachtColumnKey | null;
  sortDir: SortDir;
  onSort: (key: YachtColumnKey) => void;
  quickEditId: string | null;
  setQuickEditId: (id: string | null) => void;
  updateStatus: (id: string, status: string) => Promise<void>;
}) {
  const cols = YACHT_COLUMNS.filter((c) => visible.includes(c.key));
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
          <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">●</th>
            {cols.map((c) => (
              <th
                key={c.key}
                className="whitespace-nowrap px-3 py-2 text-left font-medium cursor-pointer select-none hover:text-foreground transition"
                onClick={() => onSort(c.key)}
              >
                <span className="flex items-center gap-1">
                  {c.label}
                  <SortIcon col={c.key} sortKey={sortKey} sortDir={sortDir} />
                </span>
              </th>
            ))}
            <th className="px-3 py-2 text-left font-medium w-8">
              <Radar className="h-3 w-3 opacity-40" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((y, i) => (
            <tr key={y.id} className="border-b border-border/50 transition hover:bg-accent/30">
              <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{String(i + 1).padStart(3, "0")}</td>
              {cols.map((c) => (
                <td key={c.key} className="whitespace-nowrap px-3 py-1.5">
                  {c.key === "vessel_name" ? (
                    <Link
                      to="/yachts/$id"
                      params={{ id: y.id }}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {fmt(y[c.key])}
                    </Link>
                  ) : c.key === "status" ? (
                    quickEditId === y.id ? (
                      <select
                        autoFocus
                        defaultValue={y.status as string ?? ""}
                        onBlur={(e) => updateStatus(y.id, e.target.value)}
                        onChange={(e) => updateStatus(y.id, e.target.value)}
                        className="h-6 w-full rounded border border-border bg-card text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {["In Country", "Departed", "Change Agency", "Active", "Inactive", "Arrived", "Pending"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-1 group/status cursor-pointer" onClick={() => setQuickEditId(y.id)}>
                        <StatusPill status={y[c.key] as string | null} />
                        <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover/status:opacity-60 transition-opacity" />
                      </div>
                    )
                  ) : (
                    <span className="text-foreground/80">{fmt(y[c.key])}</span>
                  )}
                </td>
              ))}
              {/* Fleet tracking button */}
              <td className="px-2 py-1.5">
                <a
                  href={trackUrl(y)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Track on MarineTraffic"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex h-6 w-6 items-center justify-center rounded transition hover:bg-primary/10 hover:text-primary text-muted-foreground/50"
                >
                  <Radar className="h-3.5 w-3.5" />
                </a>
              </td>
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
              <div className="flex h-full w-full items-center justify-center">
                <Ship className="h-10 w-10 text-muted-foreground/40" />
              </div>
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
            {/* Fleet tracking */}
            <div className="border-t border-border/50 pt-2">
              <a
                href={trackUrl(y)}
                target="_blank"
                rel="noopener noreferrer"
                title="Track on MarineTraffic"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
              >
                <Radar className="h-3 w-3" />
                Track on MarineTraffic
              </a>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
