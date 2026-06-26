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
  ChevronLeft, ChevronRight, BookMarked, X, Check, Grid3x3, Archive, ArchiveRestore,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuCheckboxItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/yachts/")({
  component: YachtsPage,
  head: () => ({ meta: [{ title: "Yachts — Polaris" }] }),
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
function loadView(): "list" | "cards" | "small" {
  try {
    const v = localStorage.getItem(LS_VIEW_KEY);
    return v === "list" || v === "small" ? v : "cards";
  } catch { return "list"; }
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
export function YachtsPage() {
  // Init from localStorage (runs once)
  const [init] = useState(initViewState);

  const [view, setView] = useState<"list" | "cards" | "small">(loadView);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [activityMap, setActivityMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [archiveView, setArchiveView] = useState<"active" | "archived">("active");
  const [archiveTarget, setArchiveTarget] = useState<Yacht | null>(null);
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
    if (error) { toast.error(error.message); setLoading(false); return; }
    const rows = (data ?? []) as Yacht[];
    setYachts(rows);
    setLoading(false);
    // "Last activity" per yacht = newest of the yacht record + any visa activity
    // linked to it. (Other entities — sign-on, docs, permits — can be folded in later.)
    const map: Record<string, string> = {};
    for (const r of rows) {
      const u = (r.updated_at as string) ?? (r.created_at as string);
      if (u) map[r.id] = u;
    }
    try {
      const { data: visas } = await (supabase as any)
        .from("visa_applications").select("yacht_id, updated_at").not("yacht_id", "is", null);
      for (const v of (visas ?? []) as { yacht_id: string; updated_at: string }[]) {
        if (!v.yacht_id || !v.updated_at) continue;
        if (!map[v.yacht_id] || v.updated_at > map[v.yacht_id]) map[v.yacht_id] = v.updated_at;
      }
    } catch { /* visa activity is best-effort */ }
    setActivityMap(map);
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from("yachts").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else setYachts((prev) => prev.map((y) => (y.id === id ? { ...y, status } : y)));
    setQuickEditId(null);
  }

  async function applyArchive(y: Yacht) {
    const next = !y.archive;
    const { error } = await supabase.from("yachts").update({ archive: next } as never).eq("id", y.id);
    if (error) { toast.error(error.message); return; }
    setYachts((prev) => prev.map((r) => (r.id === y.id ? { ...r, archive: next } : r)));
    setArchiveTarget(null);
    toast.success(next ? "Yacht archived" : "Yacht restored to active fleet");
  }

  const archivedCount = useMemo(() => yachts.filter((y) => y.archive).length, [yachts]);

  // Active vs Archived split — the rest of the page (stats, filters, sort) runs on this base.
  const baseRows = useMemo(
    () => yachts.filter((y) => (archiveView === "archived" ? !!y.archive : !y.archive)),
    [yachts, archiveView],
  );

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
    const total      = baseRows.length;
    const inCountry  = baseRows.filter((y) => String(y.status ?? "").toLowerCase() === "in country").length;
    const departed   = baseRows.filter((y) => String(y.status ?? "").toLowerCase() === "departed").length;
    const changeAgency = baseRows.filter((y) => String(y.status ?? "").toLowerCase() === "change agency").length;
    return { total, inCountry, departed, changeAgency };
  }, [baseRows]);

  const STATUS_TARGETS: Record<Exclude<StatusFilter, "all">, string> = {
    in_country: "in country",
    departed: "departed",
    change_agency: "change agency",
  };

  const lastActivityOf = (y: Yacht): string =>
    activityMap[y.id] ?? (y.updated_at as string) ?? (y.created_at as string) ?? "";
  const isStale = (y: Yacht): boolean => {
    const la = lastActivityOf(y);
    return !!la && Date.now() - new Date(la).getTime() > 30 * 86400000;
  };

  const filtered = useMemo(() => {
    let rows = baseRows;
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
    } else {
      // Default: most-recently-active yachts first, least-active last.
      rows = [...rows].sort((a, b) => lastActivityOf(b).localeCompare(lastActivityOf(a)));
    }
    return rows;
  }, [baseRows, q, statusFilter, sortKey, sortDir, activityMap]);

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

          {/* Active / Archived toggle */}
          <div className="flex h-8 rounded-md border border-border bg-card p-0.5">
            <button
              onClick={() => setArchiveView("active")}
              className={`flex items-center gap-1 rounded px-2.5 text-xs ${archiveView === "active" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              <Ship className="h-3.5 w-3.5" /> Active
            </button>
            <button
              onClick={() => setArchiveView("archived")}
              title={`${archivedCount} archived`}
              className={`flex items-center gap-1 rounded px-2.5 text-xs ${archiveView === "archived" ? "bg-amber-500/15 text-amber-500" : "text-muted-foreground"}`}
            >
              <Archive className="h-3.5 w-3.5" /> Archived{archivedCount > 0 ? ` (${archivedCount})` : ""}
            </button>
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
            <button
              onClick={() => setView("small")}
              className={`flex items-center gap-1 rounded px-2.5 text-xs ${view === "small" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              <Grid3x3 className="h-3.5 w-3.5" /> Small
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

          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Link to="/my-fleet"><Radar className="h-3.5 w-3.5" /> Live Fleet Map</Link>
          </Button>

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
          <EmptyState hasFilter={!!q || statusFilter !== "all" || archiveView === "archived"} />
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
            onArchive={setArchiveTarget}
          />
        ) : (
          <CardsView rows={filtered} staleIds={new Set(filtered.filter(isStale).map((y) => y.id))} small={view === "small"} onArchive={setArchiveTarget} />
        )}
      </div>

      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => { if (!o) setArchiveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{archiveTarget?.archive ? "Restore yacht?" : "Archive yacht?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.archive ? (
                <><strong>{String(archiveTarget?.vessel_name ?? "This yacht")}</strong> will return to the active fleet and reappear in lists, dashboards and vessel pickers.</>
              ) : (
                <><strong>{String(archiveTarget?.vessel_name ?? "This yacht")}</strong> will be hidden from the active fleet — it won’t appear in the Yachts list, dashboard counts, or vessel pickers. Nothing is deleted, and you can restore it any time from the Archived view.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveTarget && applyArchive(archiveTarget)}
              className={archiveTarget?.archive ? "" : "bg-amber-500 text-white hover:bg-amber-500/90"}
            >
              {archiveTarget?.archive ? "Restore" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

const NAVSTAT_LABEL: Record<number, string> = {
  0: "Under way", 1: "At anchor", 2: "Not under command", 3: "Restricted",
  4: "Constrained", 5: "Moored", 6: "Aground", 7: "Fishing", 8: "Sailing",
};

/** Relative "Xm ago / Xh ago / date" for AIS timestamps. */
function relWhen(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return "—";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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
  rows, visible, sortKey, sortDir, onSort, quickEditId, setQuickEditId, updateStatus, onArchive,
}: {
  rows: Yacht[];
  visible: YachtColumnKey[];
  sortKey: YachtColumnKey | null;
  sortDir: SortDir;
  onSort: (key: YachtColumnKey) => void;
  quickEditId: string | null;
  setQuickEditId: (id: string | null) => void;
  updateStatus: (id: string, status: string) => Promise<void>;
  onArchive: (y: Yacht) => void;
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
                  ) : c.key === "ais_location" ? (
                    (y.ais_lat != null && y.ais_lon != null) ? (
                      <a
                        href={`https://www.google.com/maps?q=${y.ais_lat},${y.ais_lon}`}
                        target="_blank" rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 hover:underline"
                        title={y.ais_destination ? `Destination: ${y.ais_destination}` : undefined}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${y.ais_synced_at && (Date.now() - new Date(String(y.ais_synced_at)).getTime()) < 3600000 ? "bg-emerald-500" : "bg-slate-400"}`} />
                        <span className="text-foreground/80">{NAVSTAT_LABEL[Number(y.ais_navstat)] ?? "Tracked"}</span>
                        <span className="text-muted-foreground">{relWhen(y.ais_position_at)}</span>
                      </a>
                    ) : <span className="text-muted-foreground/40">—</span>
                  ) : (c.key === "underway_since" || c.key === "last_departed_at" || c.key === "last_arrived_at") ? (
                    <span className="text-foreground/80">{relWhen(y[c.key])}</span>
                  ) : (
                    <span className="text-foreground/80">{fmt(y[c.key])}</span>
                  )}
                </td>
              ))}
              {/* Fleet tracking + archive buttons */}
              <td className="px-2 py-1.5">
                <div className="flex items-center gap-0.5">
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
                  <button
                    onClick={(e) => { e.stopPropagation(); onArchive(y); }}
                    title={y.archive ? "Restore to active fleet" : "Archive yacht"}
                    className="inline-flex h-6 w-6 items-center justify-center rounded transition hover:bg-amber-500/10 hover:text-amber-500 text-muted-foreground/50"
                  >
                    {y.archive ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardsView({ rows, staleIds, small, onArchive }: { rows: Yacht[]; staleIds: Set<string>; small?: boolean; onArchive: (y: Yacht) => void }) {
  return (
    <div
      className={
        small
          ? "grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6"
          : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      }
    >
      {rows.map((y) => (
        <Link
          key={y.id}
          to="/yachts/$id"
          params={{ id: y.id }}
          className="group overflow-hidden rounded-lg border border-border bg-card transition hover:border-primary/50 hover:shadow-[0_8px_30px_-10px_oklch(0.62_0.18_245/.35)]"
        >
          <div className="relative aspect-[16/9] overflow-hidden bg-muted">
            {typeof y.vessel_image === "string" && /^https?:\/\//.test(y.vessel_image) ? (
              <img src={y.vessel_image} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Ship className={small ? "h-7 w-7 text-muted-foreground/40" : "h-10 w-10 text-muted-foreground/40"} />
              </div>
            )}
            {staleIds.has(y.id) && !small && (
              <span
                title="No activity in over 30 days"
                className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold text-black shadow"
              >
                ⚠ 30d+ inactive
              </span>
            )}
            {staleIds.has(y.id) && small && (
              <span title="No activity in over 30 days" className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-amber-500/90 shadow" />
            )}
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onArchive(y); }}
              title={y.archive ? "Restore to active fleet" : "Archive yacht"}
              className={`absolute left-1.5 top-1.5 inline-flex items-center justify-center rounded-md bg-black/45 text-white/90 backdrop-blur transition hover:bg-black/65 ${small ? "h-6 w-6" : "h-7 w-7"}`}
            >
              {y.archive ? <ArchiveRestore className={small ? "h-3.5 w-3.5" : "h-4 w-4"} /> : <Archive className={small ? "h-3.5 w-3.5" : "h-4 w-4"} />}
            </button>
          </div>
          {small ? (
            <div className="space-y-1 p-2.5">
              <div className="flex items-start justify-between gap-1.5">
                <h3 className="line-clamp-1 font-display text-[13px] font-semibold leading-tight">{fmt(y.vessel_name)}</h3>
                <StatusPill status={y.status as string | null} />
              </div>
              <div className="line-clamp-1 text-[11px] text-muted-foreground">{fmt(y.vessel_type)} · {fmt(y.flag)}</div>
            </div>
          ) : (
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
          )}
        </Link>
      ))}
    </div>
  );
}
