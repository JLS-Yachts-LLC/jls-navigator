/**
 * Inventory (On board) — the register of what the vessel owns: tableware and
 * linen, electronics, tenders and toys, tools, safety kit, art. Consumables
 * (what runs down and gets re-ordered) live in Stock & requisitions instead.
 *
 * Each item has a location, quantity and condition, make/model/serial, value
 * and warranty, photos and receipts, and when it was last seen. "Checked"
 * stamps today against an item, so a stock-take is a walk round the boat
 * tapping each one. Reads `onboard_inventory_items` through RLS; writes go
 * through /api/portal/onboard (kind=inventory_item). Values are only shown to
 * positions that see the vessel's accounts.
 *
 * Two views: Grid (the default) is a spreadsheet — edit in place, add rows at
 * the bottom, paste rows from Excel; List groups items by place, category or
 * department with their photos. Many items at once come in by CSV import
 * (inventory-import.tsx), with a template to download; the export uses the
 * same headings so a register can go out to Excel and back.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { focusNext, takeFocus } from "@/lib/portal/portal-focus";
import { AlertTriangle, Boxes, Check, ChevronDown, ChevronRight, Download, FileUp, LayoutList, Loader2, Pencil, Search, ShieldAlert, ShoppingCart, SquareKanban, Table2, X } from "lucide-react";
import { INV_COLUMNS, csvCell, downloadText, templateCsv, type ImportRow } from "@/lib/portal/inventory";
import { InventoryGrid } from "./inventory-grid";
import { InventoryImportDialog } from "./inventory-import";
import {
  AddButton, AttachedFiles, RecordFormModal, SectionCard, SectionEmpty, SectionHeader, SectionLoading, StatusBadge,
  daysUntil, fmtDate, onboardRequest, type FormField,
} from "./section-ui";

const db = supabase as any;

type Item = {
  id: string; name: string; category: string | null; department: string; location: string | null;
  quantity: number; condition: string; make: string | null; model: string | null; serial_number: string | null;
  supplier: string | null; purchase_date: string | null; purchase_price: number | null; currency: string | null;
  warranty_expiry: string | null; last_checked: string | null; last_checked_by_name: string | null; notes: string | null;
};

const DEPARTMENTS: Array<[string, string]> = [
  ["interior", "Interior"], ["deck", "Deck"], ["engine", "Engineering"], ["galley", "Galley"],
  ["bar", "Bar"], ["safety", "Safety"], ["other", "Other"],
];
const deptLabel = (d: string) => DEPARTMENTS.find(([k]) => k === d)?.[1] ?? d;

const CONDITIONS: Array<[string, string, "green" | "sky" | "amber" | "red" | "slate"]> = [
  ["new", "New", "green"], ["good", "Good", "green"], ["fair", "Fair", "sky"],
  ["poor", "Poor", "amber"], ["damaged", "Damaged", "red"], ["missing", "Missing", "red"],
];
const condition = (c: string) => CONDITIONS.find(([k]) => k === c) ?? CONDITIONS[1];
const NEEDS_ATTENTION = new Set(["poor", "damaged", "missing"]);

/** An item not seen for this long is due a check. */
const CHECK_EVERY_DAYS = 180;
const WARRANTY_SOON_DAYS = 60;

const CATEGORY_HINTS = "e.g. Tableware, Linen, Glassware, Electronics, Tenders & toys, Tools, Art";

function itemFields(showValue: boolean): FormField[] {
  return [
    { key: "name", label: "Item", required: true, wide: true, placeholder: "e.g. Christofle dinner plates, Seabob F5, Fluke multimeter" },
    { key: "category", label: "Category", placeholder: CATEGORY_HINTS },
    { key: "department", label: "Department", type: "select", required: true, options: DEPARTMENTS.map(([value, label]) => ({ value, label })) },
    { key: "location", label: "Where it's kept", placeholder: "e.g. Main saloon, Lazarette, Crew mess locker 3" },
    { key: "quantity", label: "Quantity", type: "number", required: true },
    { key: "condition", label: "Condition", type: "select", required: true, options: CONDITIONS.map(([value, label]) => ({ value, label })) },
    { key: "make", label: "Make / brand" },
    { key: "model", label: "Model" },
    { key: "serial_number", label: "Serial number" },
    { key: "supplier", label: "Supplier" },
    { key: "purchase_date", label: "Bought", type: "date" },
    ...(showValue ? [
      { key: "purchase_price", label: "Value (each)", type: "number" as const },
      { key: "currency", label: "Currency", type: "select" as const, options: ["EUR", "USD", "AED", "GBP"].map((c) => ({ value: c, label: c })) },
    ] : []),
    { key: "warranty_expiry", label: "Warranty until", type: "date" },
    { key: "last_checked", label: "Last checked", type: "date" },
    { key: "notes", label: "Notes", type: "textarea", placeholder: "Care instructions, set details, who supplied it…" },
  ];
}

type GroupBy = "location" | "category" | "department";
type View = "grid" | "list";
const VIEW_KEY = "polaris.portal.inventoryView";

/** What happened, with an optional next step (open the task board, create a task…). */
type Notice = { text: string; tone?: "good" | "warn"; action?: { label: string; run: () => void } };

export function InventorySection({ yachtId, canEdit, showValue, canTask = false, canRequisition = false, onOpen }: {
  yachtId: string; canEdit: boolean; showValue: boolean;
  /** This person sees Tasks / Stock & requisitions, so the shortcuts into them can show. */
  canTask?: boolean; canRequisition?: boolean;
  onOpen?: (tab: "tasks" | "stock") => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("all");
  const [focus, setFocus] = useState<"all" | "attention" | "warranty" | "unchecked">("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("location");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [view, setViewState] = useState<View>(() => {
    try { return (localStorage.getItem(VIEW_KEY) as View) || "grid"; } catch { return "grid"; }
  });
  // A spreadsheet doesn't fit a phone: there the List (cards) is the view, with a quick-add bar.
  const narrow = useNarrow();
  const shownView: View = narrow ? "list" : view;
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };
  const [importing, setImporting] = useState<{ rows: ImportRow[] | null } | null>(null);
  const [filesFor, setFilesFor] = useState<Item | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [linkedTasks, setLinkedTasks] = useState<Record<string, string>>({});
  const [linkedTaskIds, setLinkedTaskIds] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [{ data }, tasks] = await Promise.all([
      db.from("onboard_inventory_items").select("*").eq("yacht_id", yachtId).order("name"),
      canTask
        ? db.from("onboard_tasks").select("id, reference, inventory_item_id").eq("yacht_id", yachtId).neq("status", "done").not("inventory_item_id", "is", null)
        : Promise.resolve({ data: [] }),
    ]);
    setItems(data ?? []);
    setLinkedTasks(Object.fromEntries(((tasks as any).data ?? []).map((t: any) => [t.inventory_item_id, t.reference])));
    setLinkedTaskIds(Object.fromEntries(((tasks as any).data ?? []).map((t: any) => [t.inventory_item_id, t.id])));
    // Opened from a task ("Open item"): show just that item, opened up.
    const focus = takeFocus("inventory");
    const hit = focus ? ((data ?? []) as Item[]).find((x) => x.id === focus) : null;
    if (hit) { setViewState("list"); setSearch(hit.name); setExpanded(hit.id); }
    setLoading(false);
  }, [yachtId, canTask]);

  const describe = (i: Item) => [i.name, [i.make, i.model].filter(Boolean).join(" ")].filter(Boolean).join(" — ");

  /** A task on the crew's board to repair or replace this item, linked back to it. */
  const createTask = async (i: Item) => {
    try {
      const res = await portalFetch("/api/portal/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${i.condition === "missing" ? "Find or replace" : "Repair or replace"}: ${i.name}`.slice(0, 200),
          status: "todo",
          priority: i.condition === "missing" || i.condition === "damaged" ? "high" : "normal",
          department: i.department,
          labels: ["Inventory"],
          inventory_item_id: i.id,
          description: [
            describe(i),
            i.serial_number && `Serial: ${i.serial_number}`,
            i.location && `Kept: ${i.location}`,
            `Condition: ${condition(i.condition)[1]}`,
            i.warranty_expiry && `Warranty until ${fmtDate(i.warranty_expiry)}`,
          ].filter(Boolean).join("\n"),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not create the task.");
      setLinkedTasks((m) => ({ ...m, [i.id]: body.reference }));
      setLinkedTaskIds((m) => ({ ...m, [i.id]: body.id }));
      setNotice({ text: `${body.reference} added to To do on the task board.`, action: onOpen ? { label: "Open the task", run: () => openTask(body.id) } : undefined });
    } catch (e) { setNotice({ text: e instanceof Error ? e.message : "Could not create the task.", tone: "warn" }); }
  };

  /** Switch to the task board with this card open. */
  const openTask = (taskId: string) => { focusNext("task", taskId); onOpen?.("tasks"); };

  /** A draft requisition to replace this item, for the approver to send to JLS. */
  const raiseRequisition = async (i: Item) => {
    try {
      const res = await portalFetch("/api/portal/requisitions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Replace: ${i.name}`.slice(0, 160),
          department: i.department,
          notes: [`Raised from the inventory — ${condition(i.condition)[1].toLowerCase()}`, i.location && `kept: ${i.location}`].filter(Boolean).join(", "),
          items: [{
            description: describe(i).slice(0, 300),
            quantity: 1,
            notes: [i.serial_number && `S/N ${i.serial_number}`, i.supplier && `Supplier: ${i.supplier}`].filter(Boolean).join(" · ") || null,
          }],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not raise the requisition.");
      setNotice({ text: `${body.reference} raised as a draft — check the quantity, then submit it for approval.`, action: onOpen ? { label: "Open requisitions", run: () => onOpen("stock") } : undefined });
    } catch (e) { setNotice({ text: e instanceof Error ? e.message : "Could not raise the requisition.", tone: "warn" }); }
  };
  useEffect(() => { void load(); }, [load]);

  const unchecked = (i: Item) => !i.last_checked || (daysUntil(i.last_checked) ?? 0) < -CHECK_EVERY_DAYS;
  const warrantySoon = (i: Item) => { const d = daysUntil(i.warranty_expiry); return d != null && d >= 0 && d <= WARRANTY_SOON_DAYS; };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (dept !== "all" && i.department !== dept) return false;
      if (focus === "attention" && !NEEDS_ATTENTION.has(i.condition)) return false;
      if (focus === "warranty" && !warrantySoon(i)) return false;
      if (focus === "unchecked" && !unchecked(i)) return false;
      if (!q) return true;
      return [i.name, i.category, i.location, i.make, i.model, i.serial_number, i.supplier, i.notes]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [items, search, dept, focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const key = (i: Item) => groupBy === "department" ? deptLabel(i.department) : (i[groupBy] || (groupBy === "location" ? "Location not set" : "Uncategorised"));
    const map = new Map<string, Item[]>();
    for (const i of filtered) map.set(key(i), [...(map.get(key(i)) ?? []), i]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, groupBy]);

  // Value totals by currency (an item's value is per unit).
  const totals = useMemo(() => {
    const t = new Map<string, number>();
    for (const i of items) if (i.purchase_price != null) t.set(i.currency ?? "EUR", (t.get(i.currency ?? "EUR") ?? 0) + Number(i.purchase_price) * (i.quantity || 0));
    return [...t.entries()];
  }, [items]);

  const markChecked = async (i: Item) => {
    setChecking(i.id);
    try {
      const res = await onboardRequest("inventory_item", { method: "POST", id: i.id, action: "checked", body: JSON.stringify({}) });
      setItems((all) => all.map((x) => x.id === i.id ? { ...x, last_checked: res.last_checked, last_checked_by_name: res.last_checked_by_name } : x));
    } catch (e) { alert(e instanceof Error ? e.message : "Could not record that."); }
    finally { setChecking(null); }
  };

  // Same headings as the import template, so an export can be edited in Excel and imported back.
  const exportCsv = () => {
    const cols = INV_COLUMNS.filter((c) => showValue || !c.money);
    const csv = [
      [...cols.map((c) => c.label), "Checked by"].join(","),
      ...filtered.map((i) => [...cols.map((c) => csvCell((i as any)[c.key])), csvCell(i.last_checked_by_name)].join(",")),
    ].join("\n");
    downloadText(`Inventory ${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  /** Rows saved in the grid: keep the list in step without a reload. */
  const onPatched = (id: string, fields: Partial<Item>) =>
    setItems((all) => all.map((x) => x.id === id ? { ...x, ...fields } : x));

  const remove = async (i: Item) => {
    if (!confirm(`Remove "${i.name}" from the inventory? This can't be undone.`)) return;
    try { await onboardRequest("inventory_item", { method: "DELETE", id: i.id }); setItems((all) => all.filter((x) => x.id !== i.id)); }
    catch (e) { alert(e instanceof Error ? e.message : "Could not remove it."); }
  };

  if (loading) return <SectionLoading />;

  const attention = items.filter((i) => NEEDS_ATTENTION.has(i.condition)).length;
  const warranty = items.filter(warrantySoon).length;
  const due = items.filter(unchecked).length;
  const money = (n: number, ccy: string) => `${ccy} ${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

  const Focus = ({ k, label, n, tone }: { k: typeof focus; label: string; n: number; tone: string }) => (
    <button type="button" onClick={() => setFocus((f) => f === k ? "all" : k)}
            className={cn("rounded-2xl border px-4 py-3 text-left transition",
              focus === k ? "border-primary/60 bg-primary/10" : "border-border bg-card/60 hover:border-primary/40")}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-lg font-bold tabular-nums", n > 0 && tone)}>{n}</div>
    </button>
  );

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Inventory"
        subtitle={`${items.length} item${items.length === 1 ? "" : "s"} on the register${showValue && totals.length ? ` · ${totals.map(([c, n]) => money(n, c)).join(" + ")} recorded value` : ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            {items.length > 0 && (
              <button type="button" onClick={exportCsv} title="Download the register (as filtered) to open in Excel"
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium transition hover:border-primary/50">
                <Download className="h-3.5 w-3.5" /> Export
              </button>
            )}
            {canEdit && (
              <button type="button" onClick={() => setImporting({ rows: null })}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium transition hover:border-primary/50">
                <FileUp className="h-3.5 w-3.5" /> Import CSV
              </button>
            )}
            {canEdit && <AddButton onClick={() => setEditing("new")}>Add item</AddButton>}
          </div>
        }
      />

      {notice && (
        <div className={cn("flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm",
          notice.tone === "warn" ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200")}>
          <span className="min-w-0 flex-1">{notice.text}</span>
          {notice.action && (
            <button type="button" onClick={() => { const a = notice.action!; setNotice(null); a.run(); }}
                    className="rounded-lg border border-current/30 px-2.5 py-1 text-xs font-semibold hover:bg-white/5">{notice.action.label}</button>
          )}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}

      {items.length === 0 && !canEdit ? (
        <SectionEmpty icon={Boxes} message="No items on the register yet." />
      ) : items.length === 0 ? (
        <>
          {/* Three ways in: type into the grid, import a sheet, or one at a time. */}
          <SectionCard className="p-5">
            <div className="flex items-start gap-3">
              <Boxes className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground/60" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Start the register — whatever's quickest for you</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Type straight into the table below (Enter adds the row), paste rows copied from Excel into it,
                  or import a whole spreadsheet. Only the item's name is required.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => downloadText("Inventory import template.csv", templateCsv(showValue))}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium transition hover:border-primary/50">
                    <Download className="h-3.5 w-3.5" /> Download CSV template
                  </button>
                  <button type="button" onClick={() => setImporting({ rows: null })}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground">
                    <FileUp className="h-3.5 w-3.5" /> Import CSV
                  </button>
                </div>
              </div>
            </div>
          </SectionCard>
          {narrow ? <QuickAddBar locations={[]} onAdded={() => void load()} /> : <InventoryGrid items={[]} showValue={showValue} canEdit={canEdit} checking={checking}
                         onPatched={onPatched} onCreated={() => void load()}
                         onPasteRows={(rows) => setImporting({ rows })}
                         onCheck={(i) => void markChecked(i as Item)} onFiles={(i) => setFilesFor(i as Item)} onDelete={(i) => void remove(i as Item)}
                               linkedTasks={linkedTasks} onOpenTask={(id) => linkedTaskIds[id] && openTask(linkedTaskIds[id])}
                               onTask={canTask ? (i) => void createTask(i as Item) : undefined}
                               onRequisition={canRequisition ? (i) => void raiseRequisition(i as Item) : undefined}
                               onBadCondition={canTask ? (i) => setNotice({ text: `${i.name} marked ${i.condition} — create a task to repair or replace it?`, action: { label: "Create task", run: () => void createTask(i as Item) } }) : undefined} />}
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:max-w-xl">
            <Focus k="attention" label="Needs attention" n={attention} tone="text-red-300" />
            <Focus k="warranty" label={`Warranty ≤ ${WARRANTY_SOON_DAYS} days`} n={warranty} tone="text-amber-300" />
            <Focus k="unchecked" label="Due a check" n={due} tone="text-amber-300" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items, serials, places…"
                     className="w-full rounded-xl border border-border bg-background/50 py-2 pl-8 pr-3 text-sm outline-none focus:border-primary/60" />
            </div>
            <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department"
                    className="rounded-xl border border-border bg-background/50 px-3 py-2 text-sm outline-none">
              <option value="all">All departments</option>
              {DEPARTMENTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {!narrow && <div className="inline-flex rounded-xl border border-border p-1 text-xs">
              {([["grid", "Grid", Table2], ["list", "List", LayoutList]] as const).map(([v, label, Icon]) => (
                <button key={v} type="button" onClick={() => setView(v)}
                        className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium transition",
                          view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>}
            {shownView === "list" && <div className="inline-flex rounded-xl border border-border p-1 text-xs">
              {(["location", "category", "department"] as const).map((g) => (
                <button key={g} type="button" onClick={() => { setGroupBy(g); setCollapsed(new Set()); }}
                        className={cn("rounded-lg px-2.5 py-1 font-medium capitalize transition",
                          groupBy === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  By {g}
                </button>
              ))}
            </div>}
          </div>

          {canEdit && shownView === "list" && (
            <QuickAddBar locations={[...new Set(items.map((i) => i.location).filter(Boolean) as string[])].sort()}
                         department={dept !== "all" ? dept : undefined} onAdded={() => void load()} />
          )}

          {shownView === "grid" ? (
            filtered.length === 0 && !canEdit
              ? <SectionCard className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing matches — try another filter.</SectionCard>
              : <InventoryGrid items={filtered} showValue={showValue} canEdit={canEdit} checking={checking}
                               onPatched={onPatched} onCreated={() => void load()}
                               onPasteRows={(rows) => setImporting({ rows })}
                               onCheck={(i) => void markChecked(i as Item)} onFiles={(i) => setFilesFor(i as Item)} onDelete={(i) => void remove(i as Item)}
                               linkedTasks={linkedTasks} onOpenTask={(id) => linkedTaskIds[id] && openTask(linkedTaskIds[id])}
                               onTask={canTask ? (i) => void createTask(i as Item) : undefined}
                               onRequisition={canRequisition ? (i) => void raiseRequisition(i as Item) : undefined}
                               onBadCondition={canTask ? (i) => setNotice({ text: `${i.name} marked ${i.condition} — create a task to repair or replace it?`, action: { label: "Create task", run: () => void createTask(i as Item) } }) : undefined} />
          ) : groups.length === 0 ? (
            <SectionCard className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing matches — try another filter.</SectionCard>
          ) : groups.map(([name, rows]) => {
            const shut = collapsed.has(name);
            return (
              <div key={name} className="space-y-1.5">
                <button type="button" onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; })}
                        className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
                  {shut ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} {name}
                  <span className="text-xs font-normal">({rows.reduce((n, r) => n + (r.quantity || 0), 0)})</span>
                </button>
                {!shut && (
                  <SectionCard className="divide-y divide-border/60 overflow-hidden">
                    {rows.map((i) => {
                      const [, condLabel, tone] = condition(i.condition);
                      const open = expanded === i.id;
                      const wd = daysUntil(i.warranty_expiry);
                      return (
                        <div key={i.id}>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                            <button type="button" onClick={() => setExpanded(open ? null : i.id)} className="min-w-0 flex-1 text-left">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">{i.name}</span>
                                <span className="text-xs tabular-nums text-muted-foreground">× {i.quantity}</span>
                                {i.condition !== "good" && <StatusBadge label={condLabel} tone={tone} />}
                                {warrantySoon(i) && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300"><ShieldAlert className="h-3 w-3" /> warranty {wd === 0 ? "ends today" : `${wd}d`}</span>}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {[[i.make, i.model].filter(Boolean).join(" "), i.serial_number && `S/N ${i.serial_number}`,
                                  groupBy !== "location" && i.location, groupBy !== "category" && i.category]
                                  .filter(Boolean).join(" · ") || deptLabel(i.department)}
                              </div>
                            </button>
                            <span className={cn("text-[11px]", unchecked(i) ? "text-amber-300" : "text-muted-foreground")}>
                              {i.last_checked ? `Checked ${fmtDate(i.last_checked)}` : "Never checked"}
                            </span>
                            {canEdit && (
                              <button type="button" onClick={() => void markChecked(i)} disabled={checking === i.id}
                                      title="Seen it and it's where it should be"
                                      className={cn("inline-flex min-h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition disabled:opacity-50",
                                        i.last_checked === new Date().toISOString().slice(0, 10)
                                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                          : "border-border hover:border-primary/50")}>
                                {checking === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Checked
                              </button>
                            )}
                          </div>
                          {open && (
                            <div className="space-y-3 border-t border-border/40 bg-background/30 px-3 py-3 text-sm">
                              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                                {([
                                  ["Department", deptLabel(i.department)], ["Category", i.category], ["Location", i.location],
                                  ["Condition", condLabel], ["Supplier", i.supplier], ["Bought", i.purchase_date && fmtDate(i.purchase_date)],
                                  ...(showValue ? [["Value", i.purchase_price != null ? `${i.currency ?? "EUR"} ${Number(i.purchase_price).toLocaleString("en-GB")} each` : null]] : []),
                                  ["Warranty until", i.warranty_expiry && fmtDate(i.warranty_expiry)],
                                  ["Last checked", i.last_checked ? `${fmtDate(i.last_checked)}${i.last_checked_by_name ? ` · ${i.last_checked_by_name}` : ""}` : null],
                                ] as Array<[string, string | null]>).map(([k, v]) => (
                                  <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>
                                ))}
                              </dl>
                              {i.notes && <p className="whitespace-pre-wrap text-xs text-foreground/80">{i.notes}</p>}
                              {(wd != null && wd < 0) && <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><AlertTriangle className="h-3 w-3" /> Out of warranty since {fmtDate(i.warranty_expiry)}</p>}
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <AttachedFiles refTable="onboard_inventory_items" refId={i.id} target="inventory_file" canEdit={canEdit}
                                               accept="image/*,application/pdf" label="Photo / receipt" />
                                {canEdit && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {canTask && (linkedTasks[i.id]
                                      ? <button type="button" onClick={() => openTask(linkedTaskIds[i.id])} className="rounded-lg bg-primary/15 px-2.5 py-1 font-mono text-xs text-primary">{linkedTasks[i.id]} ›</button>
                                      : <button type="button" onClick={() => void createTask(i)}
                                                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:border-primary/50">
                                          <SquareKanban className="h-3 w-3" /> Create task
                                        </button>)}
                                    {canRequisition && (
                                      <button type="button" onClick={() => void raiseRequisition(i)}
                                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:border-primary/50">
                                        <ShoppingCart className="h-3 w-3" /> Requisition
                                      </button>
                                    )}
                                    <button type="button" onClick={() => setEditing(i)}
                                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:border-primary/50">
                                      <Pencil className="h-3 w-3" /> Edit
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </SectionCard>
                )}
              </div>
            );
          })}
        </>
      )}

      {importing && (
        <InventoryImportDialog initialRows={importing.rows} showValue={showValue}
                               onClose={() => setImporting(null)}
                               onDone={({ added, updated }) => {
                                 setImporting(null);
                                 setNotice({ text: [added && `${added} item${added === 1 ? "" : "s"} added`, updated && `${updated} updated`].filter(Boolean).join(", ") + " — the register is up to date." });
                                 void load();
                               }} />
      )}

      {filesFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
             onMouseDown={(e) => { if (e.target === e.currentTarget) setFilesFor(null); }}>
          <div className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold">{filesFor.name}</h2>
                <p className="text-xs text-muted-foreground">Photos, receipts and warranty documents</p>
              </div>
              <button type="button" onClick={() => setFilesFor(null)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4">
              <AttachedFiles refTable="onboard_inventory_items" refId={filesFor.id} target="inventory_file" canEdit={canEdit}
                             accept="image/*,application/pdf" label="Photo / receipt" />
            </div>
          </div>
        </div>
      )}

      {editing && (
        <RecordFormModal
          title={editing === "new" ? "Add to the inventory" : `Edit ${editing.name}`}
          kind="inventory_item" fields={itemFields(showValue)}
          initial={editing === "new" ? { department: dept !== "all" ? dept : "interior", quantity: 1, condition: "good", currency: "EUR" } : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
          onDelete={editing === "new" ? undefined : async () => {
            await onboardRequest("inventory_item", { method: "DELETE", id: (editing as Item).id });
            setEditing(null); setExpanded(null); void load();
          }}
          deleteLabel="Remove from inventory"
        />
      )}
    </div>
  );
}

/** Phone-width screens (Tailwind's sm breakpoint), tracked live. */
function useNarrow() {
  const query = "(max-width: 639px)";
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

/**
 * Add an item in one line: name, how many, where it's kept. The rest can be
 * filled in later (tap the item). Remembers the last location, so a walk
 * round one cabin is name, Enter, name, Enter…
 */
function QuickAddBar({ locations, department, onAdded }: { locations: string[]; department?: string; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const q = Number(qty || "1");
    if (!Number.isInteger(q) || q < 0) { setError("Quantity must be a whole number"); return; }
    setBusy(true); setError(null);
    try {
      await onboardRequest("inventory_item", { method: "POST", body: JSON.stringify({
        name: n, quantity: q, location: location.trim() || null, department: department ?? "interior", condition: "good",
      }) });
      setAdded(n); setName(""); setQty("1");
      onAdded();
      setTimeout(() => setAdded((a) => (a === n ? null : a)), 2500);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not add it."); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={add} className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quick add</div>
      <div className="grid grid-cols-[minmax(0,1fr)_64px] gap-2 sm:grid-cols-[minmax(0,2fr)_72px_minmax(0,1fr)_auto]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item, e.g. Riedel wine glass" maxLength={160}
               className="col-span-1 rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
        <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" aria-label="Quantity"
               className="rounded-xl border border-border bg-background/60 px-3 py-2.5 text-center text-sm outline-none focus:border-primary/60" />
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where it's kept" list="inv-locations" maxLength={160}
               className="col-span-2 rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm outline-none focus:border-primary/60 sm:col-span-1" />
        <datalist id="inv-locations">{locations.map((l) => <option key={l} value={l} />)}</datalist>
        <button type="submit" disabled={busy || !name.trim()}
                className="col-span-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:col-span-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Add
        </button>
      </div>
      {(error || added) && (
        <p className={cn("mt-2 text-xs", error ? "text-red-300" : "text-emerald-300")}>{error ?? `Added "${added}" — tap it below to fill in the rest.`}</p>
      )}
    </form>
  );
}
