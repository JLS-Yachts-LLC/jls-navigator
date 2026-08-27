import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ship, ChevronDown, ChevronRight, Plus, Trash2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { syncYachtShipmentsFromMonday } from "@/lib/yacht-shipments/monday.server";

type Row = Record<string, any>;

// Monday's real status column uses the exact same five values on both the
// Import and Export boards (confirmed against the actual synced data — no
// separate "New Request"/"Completed" vocabulary on Export, and Import's
// "done" bucket is labelled "Complete" on Monday, not "Done"). One shared
// group set for both directions, 1:1 with Monday.
const STATUS_GROUPS = [
  { key: "new_lead", label: "New Lead", dot: "bg-slate-400", text: "text-slate-300" },
  { key: "in_progress", label: "In Progress", dot: "bg-blue-500", text: "text-blue-400" },
  { key: "on_hold", label: "On Hold", dot: "bg-amber-600", text: "text-amber-500" },
  { key: "done", label: "Complete", dot: "bg-emerald-500", text: "text-emerald-400" },
  { key: "cancelled", label: "Cancelled", dot: "bg-red-500", text: "text-red-400" },
] as const;

const STATUS_GROUPS_BY_DIRECTION = { import: STATUS_GROUPS, export: STATUS_GROUPS } as const;

const STATUS_BADGE: Record<string, string> = {
  new_lead: "bg-slate-500/15 text-slate-300",
  in_progress: "bg-blue-500/15 text-blue-400",
  on_hold: "bg-amber-600/20 text-amber-500",
  done: "bg-emerald-500/15 text-emerald-400",
  cancelled: "bg-red-500/15 text-red-400",
};

// Free-text "tag" columns (Customs Option) get a deterministic colour per
// distinct value, the same way Monday lets you colour arbitrary labels.
const TAG_PALETTE = [
  "bg-blue-500/15 text-blue-400",
  "bg-emerald-500/15 text-emerald-400",
  "bg-violet-500/15 text-violet-400",
  "bg-amber-500/15 text-amber-500",
  "bg-rose-500/15 text-rose-400",
  "bg-cyan-500/15 text-cyan-400",
  "bg-lime-500/15 text-lime-500",
  "bg-fuchsia-500/15 text-fuchsia-400",
];
function tagColor(v: string) {
  let h = 0;
  for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

type StatusGroup = { key: string; label: string; dot?: string; text?: string };

// A typed status matches a group if it equals that group's key or label,
// ignoring case — so typing "In Progress" or "in_progress" both land the
// row in the In Progress section.
function matchGroup(groups: readonly StatusGroup[], value: any): StatusGroup | undefined {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return undefined;
  return groups.find((g) => g.key.toLowerCase() === v || g.label.toLowerCase() === v);
}

type ColType = "text" | "number" | "date" | "url" | "status" | "tag";

interface Col {
  key: string;
  label: string;
  type: ColType;
  width: string;
  sticky?: boolean;
}

const COLS: Col[] = [
  { key: "yacht_name", label: "Yacht Name", type: "text", width: "w-56", sticky: true },
  { key: "loa", label: "LOA", type: "text", width: "w-24" },
  { key: "status", label: "Status", type: "status", width: "w-32" },
  { key: "eta", label: "ETA", type: "date", width: "w-32" },
  { key: "pol", label: "POL", type: "text", width: "w-32" },
  { key: "arrival_port", label: "Arrival Port", type: "text", width: "w-32" },
  { key: "customs_option", label: "Customs Option", type: "tag", width: "w-48" },
  { key: "vessel_name", label: "Vessel Name", type: "text", width: "w-36" },
  { key: "remarks", label: "Remarks", type: "text", width: "w-64" },
  { key: "quota", label: "Quota", type: "text", width: "w-24" },
  { key: "quotation_ref", label: "Quotation/Pro Forma No.", type: "text", width: "w-40" },
  { key: "quotations", label: "Quotations", type: "text", width: "w-32" },
  { key: "quotation_copy_url", label: "Quotation Copy", type: "url", width: "w-40" },
  { key: "formula", label: "Formula", type: "text", width: "w-32" },
  { key: "home_marina", label: "Home Marina", type: "text", width: "w-36" },
  { key: "charges", label: "Charges", type: "number", width: "w-32" },
];

const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
const fmtAED = (n: number) => `${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })} AED`;

export function YachtShipmentsBoard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState<"import" | "export">("import");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await fetchAllRows(() => (supabase as any).from("yacht_shipments").select("*").order("created_at"));
    if (error) toast.error(error.message);
    setRows(data ?? []);
    setLoading(false);
  }

  async function syncFromMonday() {
    setSyncing(true);
    try {
      const r = await (syncYachtShipmentsFromMonday as any)();
      if (!r.ok && r.synced === 0) throw new Error(r.detail);
      toast.success(r.detail);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Monday sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const rowsInTab = useMemo(() => rows.filter((r) => (r.direction ?? "import") === direction), [rows, direction]);
  const statusGroups = STATUS_GROUPS_BY_DIRECTION[direction];

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    statusGroups.forEach((g) => map.set(g.key, []));
    for (const r of rowsInTab) {
      const groupKey = matchGroup(statusGroups, r.status)?.key ?? statusGroups[0].key;
      map.get(groupKey)!.push(r);
    }
    return map;
  }, [rowsInTab, statusGroups]);

  async function patch(row: Row, key: string, value: any) {
    const cellId = `${row.id}:${key}`;
    setSavingCell(cellId);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [key]: value } : r)));
    const { error } = await (supabase as any)
      .from("yacht_shipments")
      .update({ [key]: value, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    setSavingCell(null);
    if (error) { toast.error(error.message); void load(); }
  }

  async function addRow(statusKey: string, yachtName: string) {
    const name = yachtName.trim();
    if (!name) return;
    setAddingIn(null);
    setNewName("");
    const { data, error } = await (supabase as any)
      .from("yacht_shipments")
      .insert([{ yacht_name: name, status: statusKey, direction, created_by: user?.id }])
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    setRows((prev) => [...prev, data]);
  }

  async function deleteRows(ids: string[]) {
    if (!ids.length) return;
    const { error } = await (supabase as any).from("yacht_shipments").delete().in("id", ids);
    if (error) { toast.error(error.message); return; }
    setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
    setSelected((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n; });
    toast.success(ids.length > 1 ? `${ids.length} shipments removed` : "Shipment removed");
  }

  function toggleGroup(key: string) { setCollapsed((p) => ({ ...p, [key]: !p[key] })); }
  function toggleSelect(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const totalCharges = rowsInTab.reduce((sum, r) => sum + (Number(r.charges) || 0), 0);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
            Logistics / Yacht Shipments
          </div>
          <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
            <Ship className="h-4 w-4 text-primary/80" /> Yacht Shipments
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <Button size="sm" variant="outline" onClick={() => void syncFromMonday()} disabled={syncing} className="h-9 gap-1.5 text-xs">
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync from Monday
          </Button>
          {selected.size > 0 && (
            <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs text-destructive"
              onClick={() => deleteRows([...selected])}>
              <Trash2 className="h-3.5 w-3.5" /> Delete {selected.size} selected
            </Button>
          )}
          <span className="text-xs text-muted-foreground">{rowsInTab.length} shipments · {fmtAED(totalCharges)} total</span>
        </div>
      </header>

      <div className="border-b border-border/40 bg-muted/10 px-6 py-2.5">
        <Tabs value={direction} onValueChange={(v) => { setDirection(v as "import" | "export"); setSelected(new Set()); }}>
          <TabsList>
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="pds-scroll flex-1 overflow-auto px-6 py-5">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-5">
            {statusGroups.map((g) => {
              const groupRows = grouped.get(g.key) ?? [];
              const isCollapsed = collapsed[g.key];
              const groupCharges = groupRows.reduce((s, r) => s + (Number(r.charges) || 0), 0);
              return (
                <div key={g.key} className="rounded-xl border border-border bg-card shadow-[0_2px_12px_-4px_rgba(0,0,0,0.4)]">
                  {/* No overflow-x-auto wrapper around the table: any nested
                      element with overflow-x set to a non-visible value forces
                      its own overflow-y to auto too (CSS spec coercion), which
                      would silently hijack position:sticky onto THIS box's own
                      (never-scrolling) viewport instead of the real vertical
                      scroller below — killing the sticky header. Horizontal
                      scroll for a wide table is instead handled by the outer
                      groups list (already overflow-auto on both axes). */}
                  <button onClick={() => toggleGroup(g.key)}
                    className={cn("flex w-full items-center gap-2 rounded-t-xl border-l-4 bg-muted/20 px-4 py-2.5 text-left", g.dot.replace("bg-", "border-"))}>
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    <span className={cn("h-2 w-2 rounded-full", g.dot)} />
                    <span className={cn("font-display text-sm font-semibold uppercase tracking-wide", g.text)}>{g.label}</span>
                    <span className="text-xs text-muted-foreground">{groupRows.length} {groupRows.length === 1 ? "yacht name" : "yacht names"}</span>
                    {groupCharges > 0 && <span className="ml-auto text-xs text-muted-foreground">{fmtAED(groupCharges)}</span>}
                  </button>

                  {/* table-fixed + a matching width class on every th AND td:
                      each group renders its own <table>, and browsers' default
                      auto-layout sizes columns per-table from cell content — so
                      a table with real text ("test") computed different column
                      widths than an empty one, and the sticky offsets (fixed
                      Tailwind values) stopped lining up with the real column
                      edge. Fixed layout makes widths content-independent. */}
                  {/* border-separate (not border-collapse): Chrome has a
                      long-standing bug where position:sticky on a <thead>
                      inside a border-collapse table lets the row scrolling
                      up behind it bleed through as a ghost overlap. Separate
                      borders (spacing 0) render visually the same here since
                      every border below is one-sided (border-b / border-r on
                      individual cells, never opposing borders on adjacent
                      cells), so there's no double-thickness seam. */}
                  {!isCollapsed && (
                      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                        <thead>
                          {/* box-shadow instead of border-b: with border-separate
                              (required for the sticky header cells above to
                              render clean — see note above), a border set on the
                              <tr> itself no longer paints, since the separated-
                              borders model only recognises borders on <td>/<th>,
                              not <tr>. An inset box-shadow isn't part of the
                              table border model, so it renders the same divider
                              line either way. */}
                          <tr className="bg-muted/30 shadow-[inset_0_-1px_0_0_var(--border)]">
                            {/* Every header cell is sticky top-0 too, so the header
                                row itself stays visible while scrolling down through
                                a long group — not just the yacht-name column staying
                                visible while scrolling sideways. z-20 (over the body's
                                z-10 sticky-left cells) so the header still wins where
                                the frozen column and the frozen header overlap.
                                Sticky cells need a SOLID background — the row's own
                                bg-muted/30 is translucent, which only looks opaque
                                because it sits over the opaque panel behind it. Once a
                                cell is pinned via `sticky`, other scrolled-under cells
                                paint behind it instead, and the 30%-opacity tint would
                                let their text bleed through. bg-card (solid) fixes it. */}
                            <th className="sticky left-0 top-0 z-20 w-9 border-r border-border/40 bg-card px-3 py-2 will-change-transform"></th>
                            {COLS.map((c) => (
                              <th key={c.key}
                                className={cn(
                                  "sticky top-0 z-20 bg-card px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground whitespace-nowrap will-change-transform",
                                  c.width, c.sticky && "left-9 border-r border-border/40",
                                )}>
                                {c.label}
                              </th>
                            ))}
                            <th className="sticky top-0 z-20 w-10 bg-card px-2 py-2 will-change-transform"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupRows.map((r) => (
                            <tr key={r.id} className="group shadow-[inset_0_-1px_0_0_color-mix(in_oklab,var(--border)_40%,transparent)] hover:bg-accent/10">
                              <td className="sticky left-0 z-10 w-9 border-r border-border/40 bg-card px-3 py-2 will-change-transform group-hover:bg-accent/10">
                                <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} />
                              </td>
                              {COLS.map((c) => (
                                <td key={c.key} className={cn("overflow-hidden px-1 py-1", c.width, c.sticky && "sticky left-9 z-10 border-r border-border/40 bg-card will-change-transform group-hover:bg-accent/10")}>
                                  <EditableCell
                                    col={c}
                                    row={r}
                                    saving={savingCell === `${r.id}:${c.key}`}
                                    statusGroups={statusGroups}
                                    onChange={(v) => patch(r, c.key, v)}
                                  />
                                </td>
                              ))}
                              <td className="px-2 py-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/0 hover:text-destructive group-hover:text-muted-foreground/60"
                                  onClick={() => deleteRows([r.id])}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <td className="sticky left-0 z-10 w-9 border-r border-border/40 bg-card px-3 py-2 will-change-transform"></td>
                            <td colSpan={COLS.length + 1} className="px-1 py-1">
                              {addingIn === g.key ? (
                                <div className="flex items-center gap-2 py-0.5">
                                  <Input
                                    autoFocus
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") void addRow(g.key, newName);
                                      if (e.key === "Escape") { setAddingIn(null); setNewName(""); }
                                    }}
                                    placeholder="Yacht name or model…"
                                    className="h-8 w-64 text-sm"
                                  />
                                  <Button size="sm" className="h-8 text-xs" disabled={!newName.trim()} onClick={() => void addRow(g.key, newName)}>Add</Button>
                                  <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setAddingIn(null); setNewName(""); }}>Cancel</Button>
                                </div>
                              ) : (
                                <button onClick={() => setAddingIn(g.key)}
                                  className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/30 hover:text-foreground">
                                  <Plus className="h-3.5 w-3.5" /> Add yacht name
                                </button>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EditableCell({
  col, row, saving, statusGroups, onChange,
}: {
  col: Col;
  row: Row;
  saving: boolean;
  statusGroups: readonly StatusGroup[];
  onChange: (v: any) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row[col.key] ?? "");
  const v = row[col.key];

  useEffect(() => { setDraft(v ?? ""); }, [v]);

  function commit() {
    setEditing(false);
    const next = draft === "" ? null : draft;
    if (next !== (v ?? null)) onChange(col.type === "number" ? (next == null ? null : Number(next)) : next);
  }

  // Status is always a colour-coded dropdown of the current tab's groups,
  // never free text — matches how Status works everywhere else in ShipSync.
  if (col.type === "status") {
    const match = matchGroup(statusGroups, v);
    return (
      <Select value={match?.key ?? ""} onValueChange={(val) => onChange(val)}>
        <SelectTrigger className="h-8 w-full border-none bg-transparent p-0 hover:bg-accent/40">
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : v ? (
            <span className={cn("rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold", match ? (STATUS_BADGE[match.key] ?? "bg-muted text-muted-foreground") : tagColor(String(v)))}>
              {v}
            </span>
          ) : (
            <span className="pl-2 text-muted-foreground/30">—</span>
          )}
        </SelectTrigger>
        <SelectContent>
          {statusGroups.map((g) => (
            <SelectItem key={g.key} value={g.key}>
              <span className="flex items-center gap-2">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", g.dot)} />
                <span className={g.text}>{g.label}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (!editing) {
    let content: ReactNode;
    if (v == null || v === "") content = <span className="text-muted-foreground/30">—</span>;
    else if (col.type === "date") content = fmtDate(v);
    else if (col.type === "number") content = fmtAED(Number(v));
    else if (col.type === "tag") content = <span className={cn("rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold", tagColor(String(v)))}>{v}</span>;
    else if (col.type === "url") content = (
      <a href={v} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-blue-400 hover:underline">
        <span className="max-w-[9rem] truncate">{v}</span><ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    );
    else content = <span className="truncate">{v}</span>;

    return (
      <button onClick={() => setEditing(true)} className={cn("flex h-8 w-full items-center rounded-md px-2 text-left text-sm hover:bg-accent/30", col.sticky && "font-medium")}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : content}
      </button>
    );
  }

  return (
    <input
      autoFocus
      type={col.type === "date" ? "date" : col.type === "number" ? "number" : "text"}
      value={draft ?? ""}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none ring-1 ring-primary/40"
    />
  );
}
