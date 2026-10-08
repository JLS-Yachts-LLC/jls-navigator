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
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { AlertTriangle, Boxes, Check, ChevronDown, ChevronRight, Download, Loader2, Pencil, Search, ShieldAlert } from "lucide-react";
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

export function InventorySection({ yachtId, canEdit, showValue }: { yachtId: string; canEdit: boolean; showValue: boolean }) {
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

  const load = useCallback(async () => {
    const { data } = await db.from("onboard_inventory_items").select("*").eq("yacht_id", yachtId).order("name");
    setItems(data ?? []); setLoading(false);
  }, [yachtId]);
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

  const exportCsv = () => {
    const cols: Array<[string, (i: Item) => unknown]> = [
      ["Item", (i) => i.name], ["Category", (i) => i.category], ["Department", (i) => deptLabel(i.department)],
      ["Location", (i) => i.location], ["Quantity", (i) => i.quantity], ["Condition", (i) => condition(i.condition)[1]],
      ["Make", (i) => i.make], ["Model", (i) => i.model], ["Serial", (i) => i.serial_number], ["Supplier", (i) => i.supplier],
      ["Bought", (i) => i.purchase_date],
      ...(showValue ? [["Value each", (i: Item) => i.purchase_price], ["Currency", (i: Item) => i.currency]] as Array<[string, (i: Item) => unknown]> : []),
      ["Warranty until", (i) => i.warranty_expiry], ["Last checked", (i) => i.last_checked], ["Checked by", (i) => i.last_checked_by_name], ["Notes", (i) => i.notes],
    ];
    const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [cols.map(([h]) => h).join(","), ...filtered.map((i) => cols.map(([, f]) => cell(f(i))).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `Inventory ${new Date().toISOString().slice(0, 10)}.csv` });
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
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
          <div className="flex gap-2">
            {items.length > 0 && (
              <button type="button" onClick={exportCsv}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium transition hover:border-primary/50">
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
            )}
            {canEdit && <AddButton onClick={() => setEditing("new")}>Add item</AddButton>}
          </div>
        }
      />

      {items.length === 0 ? (
        <SectionEmpty icon={Boxes} message={canEdit
          ? "Nothing on the register yet. Add what the vessel owns — tableware, linen, electronics, tenders and toys, tools — with where it's kept and its condition."
          : "No items on the register yet."} />
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
            <div className="inline-flex rounded-xl border border-border p-1 text-xs">
              {(["location", "category", "department"] as const).map((g) => (
                <button key={g} type="button" onClick={() => { setGroupBy(g); setCollapsed(new Set()); }}
                        className={cn("rounded-lg px-2.5 py-1 font-medium capitalize transition",
                          groupBy === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  By {g}
                </button>
              ))}
            </div>
          </div>

          {groups.length === 0 ? (
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
                                  <button type="button" onClick={() => setEditing(i)}
                                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:border-primary/50">
                                    <Pencil className="h-3 w-3" /> Edit
                                  </button>
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
