/**
 * Managed Boats — inspection checklists.
 *
 * A boat needs some or all of the DMA / FMA / RYA inspections, and the RYA
 * checklist depends on the craft's classification: Personal Water Craft
 * (a jet ski), Powerboat or Cruising. The RYA lists are the client's own
 * "OPS Checklist" workbook, item for item, with the RYA section, quantity and
 * TC reference kept.
 *
 * "View checklist" opens the full list for one inspection on one boat. Each
 * item is ticked per boat, and matched against the boat's Inventory List —
 * automatically by name, or linked by hand — so the team can see at a glance
 * what the boat already carries and what is missing. "Sync from inventory"
 * ticks everything the inventory already covers. Orbit admins keep the item
 * lists themselves up to date from the same screen.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, Check, Link2, Link2Off, ListChecks, Loader2, Pencil, Plus, RefreshCw, RotateCcw, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/error-message";
import { Field, inputCls, stamp } from "./orbit2-fields";
import type { Orbit2Boat, Orbit2BoatInventoryItem } from "./orbit2-data";

const sb = supabase as any;

export type InspectionRegime = "dma" | "fma" | "rya";
export type RyaChecklist = "pwc" | "powerboat" | "cruising";

export const INSPECTION_REGIMES: InspectionRegime[] = ["dma", "fma", "rya"];
export const RYA_CHECKLISTS: { key: RyaChecklist; label: string; hint: string }[] = [
  { key: "pwc", label: "Personal Water Craft", hint: "Jet skis and similar" },
  { key: "powerboat", label: "Powerboat", hint: "Open and cabin powerboats" },
  { key: "cruising", label: "Cruising", hint: "Cruising yachts and larger craft" },
];
export const ryaChecklistLabel = (k: string | null) => RYA_CHECKLISTS.find((c) => c.key === k)?.label ?? "Not set";

export type ChecklistTemplateItem = {
  id: string; regime: InspectionRegime; category: RyaChecklist | null;
  section: string | null; item: string; qty: number | null; unit: string | null; ref: string | null;
  sort_order: number; active: boolean;
};
export type BoatChecklistState = {
  id: string; boat_id: string; template_id: string; checked: boolean; checked_at: string | null; checked_by: string | null;
  remarks: string | null; inventory_item_id: string | null;
};

// ── Matching checklist items to the boat's inventory ─────────────────────────

const STOP = new Set(["and", "the", "for", "with", "or", "of", "to", "in", "on", "per", "each", "x", "any", "all", "if", "is", "are", "be", "as", "at", "by", "kit", "set", "pcs", "min", "minimum", "means", "other", "alternate", "suitable", "sufficient", "good", "condition"]);
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t)));

/** Inventory rows that look like this checklist item — by name, not by guesswork about meaning. */
export function matchInventory(item: string, inventory: Orbit2BoatInventoryItem[]): Orbit2BoatInventoryItem[] {
  const it = tokens(item);
  if (!it.size) return [];
  return inventory.filter((row) => {
    const inv = tokens(row.item);
    if (!inv.size) return false;
    const shared = [...inv].filter((t) => it.has(t) || [...it].some((w) => w.length >= 5 && (w.startsWith(t) || t.startsWith(w))));
    if (shared.length >= 2) return true;
    // One shared word is enough when it is the whole inventory name ("Anchor", "Towline") or a distinctive long word.
    return shared.length === 1 && (inv.size === 1 || shared[0].length >= 6);
  });
}

// ── Which inspections a boat needs ───────────────────────────────────────────

export function InspectionsRequired({ boat, onSave }: { boat: Orbit2Boat; onSave: (patch: Record<string, unknown>) => Promise<boolean> }) {
  const required = boat.inspections_required ?? [];
  const toggle = (r: InspectionRegime) => {
    const next = required.includes(r) ? required.filter((x) => x !== r) : INSPECTION_REGIMES.filter((x) => required.includes(x) || x === r);
    void onSave({ inspections_required: next });
  };
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card px-4 py-3">
      <Field label="Inspections required">
        <div className="flex gap-2">
          {INSPECTION_REGIMES.map((r) => {
            const on = required.includes(r);
            return (
              <button key={r} type="button" onClick={() => toggle(r)}
                className={cn("flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[14px] font-semibold uppercase tracking-wide transition",
                  on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-accent")}>
                <span className={cn("flex h-4 w-4 items-center justify-center rounded-sm border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                {r}
              </button>
            );
          })}
        </div>
      </Field>
      {required.includes("rya") && (
        <Field label="RYA checklist for this craft">
          <select className={cn(inputCls, "h-9 min-w-[16rem] py-1 text-[14px]")} value={boat.rya_checklist ?? ""}
            onChange={(e) => void onSave({ rya_checklist: e.target.value || null })}>
            <option value="">Choose the classification…</option>
            {RYA_CHECKLISTS.map((c) => <option key={c.key} value={c.key}>{c.label} — {c.hint}</option>)}
          </select>
        </Field>
      )}
      <span className="pb-2 text-[14px] text-muted-foreground">Only the inspections ticked here appear below.</span>
    </div>
  );
}

// ── Loading one checklist for one boat ───────────────────────────────────────

function useChecklist(boat: Orbit2Boat, regime: InspectionRegime) {
  const category: RyaChecklist | null = regime === "rya" ? (boat.rya_checklist as RyaChecklist | null) : null;
  const [items, setItems] = useState<ChecklistTemplateItem[]>([]);
  const [states, setStates] = useState<BoatChecklistState[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    let q = sb.from("orbit2_checklist_templates").select("*").eq("regime", regime).eq("active", true).order("sort_order");
    q = category ? q.eq("category", category) : q.is("category", null);
    const [t, s] = await Promise.all([q, sb.from("orbit2_boat_checklist").select("*").eq("boat_id", boat.id)]);
    if (t.error) toast.error(errorMessage(t.error, "Could not load the checklist"));
    setItems((t.data ?? []) as ChecklistTemplateItem[]);
    setStates((s.data ?? []) as BoatChecklistState[]);
    setLoading(false);
  }, [regime, category, boat.id]);
  useEffect(() => { void load(); }, [load]);

  const stateFor = useMemo(() => new Map(states.map((s) => [s.template_id, s])), [states]);
  return { category, items, states, stateFor, loading, reload: load };
}

/** The compact card content: progress, inventory coverage, and the button to the full list. */
export function InspectionChecklist({ boat, regime, inventory, isAdmin, authorName }: {
  boat: Orbit2Boat; regime: InspectionRegime; inventory: Orbit2BoatInventoryItem[]; isAdmin: boolean; authorName: string;
}) {
  const cl = useChecklist(boat, regime);
  const [open, setOpen] = useState(false);
  const done = cl.items.filter((i) => cl.stateFor.get(i.id)?.checked).length;
  const covered = cl.items.filter((i) => cl.stateFor.get(i.id)?.inventory_item_id || matchInventory(i.item, inventory).length).length;

  if (regime === "rya" && !cl.category) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-3 text-[14px] text-muted-foreground">
        Choose the RYA checklist classification above (Personal Water Craft, Powerboat or Cruising) to see the items required.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-muted/10 px-3 py-2.5">
      <div className="flex items-center gap-2 text-[14px] font-medium">
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        Checklist{cl.category ? ` — ${ryaChecklistLabel(cl.category)}` : ""}
      </div>
      {cl.loading ? (
        <div className="flex h-10 items-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : cl.items.length === 0 ? (
        <p className="mt-1 text-[14px] text-muted-foreground">No items yet{isAdmin ? " — open the checklist to add them." : "."}</p>
      ) : (
        <div className="mt-1.5 space-y-1 text-[14px]">
          <Progress label="Checked" value={done} total={cl.items.length} tone="bg-emerald-500" />
          <Progress label="In inventory" value={covered} total={cl.items.length} tone="bg-sky-500" />
        </div>
      )}
      <button type="button" onClick={() => setOpen(true)}
        className="mt-2.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 text-[14px] font-semibold text-primary hover:bg-primary/15">
        <ListChecks className="h-4 w-4" /> View checklist
      </button>
      {open && (
        <ChecklistModal boat={boat} regime={regime} inventory={inventory} isAdmin={isAdmin} authorName={authorName}
          cl={cl} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

function Progress({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-semibold tabular-nums", value === total ? "text-emerald-500" : "text-foreground")}>{value} / {total}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-border/60"><div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

// ── The full checklist ───────────────────────────────────────────────────────

function ChecklistModal({ boat, regime, inventory, isAdmin, authorName, cl, onClose }: {
  boat: Orbit2Boat; regime: InspectionRegime; inventory: Orbit2BoatInventoryItem[]; isAdmin: boolean; authorName: string;
  cl: ReturnType<typeof useChecklist>; onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "missing">("all");
  const { items, stateFor, reload } = cl;

  /** Inventory rows for an item — the hand-made link wins, otherwise matched by name. */
  const linked = useCallback((it: ChecklistTemplateItem): { rows: Orbit2BoatInventoryItem[]; manual: boolean } => {
    const s = stateFor.get(it.id);
    if (s?.inventory_item_id) {
      const row = inventory.find((r) => r.id === s.inventory_item_id);
      return { rows: row ? [row] : [], manual: true };
    }
    return { rows: matchInventory(it.item, inventory), manual: false };
  }, [stateFor, inventory]);

  const done = items.filter((i) => stateFor.get(i.id)?.checked).length;
  const covered = items.filter((i) => linked(i).rows.length > 0).length;

  async function save(it: ChecklistTemplateItem, values: Partial<BoatChecklistState>) {
    setBusyId(it.id);
    const { error } = await sb.from("orbit2_boat_checklist").upsert(
      { boat_id: boat.id, template_id: it.id, ...values }, { onConflict: "boat_id,template_id" });
    setBusyId(null);
    if (error) { toast.error(errorMessage(error, "Could not save")); return; }
    await reload();
  }
  const toggle = (it: ChecklistTemplateItem) => {
    const checked = !stateFor.get(it.id)?.checked;
    return save(it, { checked, checked_at: checked ? new Date().toISOString() : null, checked_by: checked ? authorName : null });
  };
  const link = (it: ChecklistTemplateItem, inventory_item_id: string | null) => save(it, { inventory_item_id });

  /** Tick every item the inventory already covers. */
  async function syncFromInventory() {
    const todo = items.filter((i) => !stateFor.get(i.id)?.checked && linked(i).rows.length > 0);
    if (!todo.length) { toast.info("Everything the inventory covers is already ticked."); return; }
    setSyncing(true);
    const now = new Date().toISOString();
    const { error } = await sb.from("orbit2_boat_checklist").upsert(
      todo.map((i) => ({ boat_id: boat.id, template_id: i.id, checked: true, checked_at: now, checked_by: `${authorName} · from inventory` })),
      { onConflict: "boat_id,template_id" });
    setSyncing(false);
    if (error) { toast.error(errorMessage(error, "Could not sync")); return; }
    toast.success(`${todo.length} item${todo.length === 1 ? "" : "s"} ticked from the inventory list`);
    await reload();
  }

  async function reset() {
    if (!confirm(`Clear all ${regime.toUpperCase()} ticks for ${boat.name}? Inventory links are kept. Use this when starting a new inspection.`)) return;
    const { error } = await sb.from("orbit2_boat_checklist").update({ checked: false, checked_at: null, checked_by: null })
      .eq("boat_id", boat.id).in("template_id", items.map((i) => i.id));
    if (error) { toast.error(errorMessage(error, "Could not reset")); return; }
    toast.success(`${regime.toUpperCase()} checklist reset`);
    await reload();
  }

  const visible = items.filter((i) => {
    if (filter === "open") return !stateFor.get(i.id)?.checked;
    if (filter === "missing") return linked(i).rows.length === 0;
    return true;
  });
  // Section headings, in sheet order.
  const grouped: { section: string | null; items: ChecklistTemplateItem[] }[] = [];
  for (const it of visible) {
    const last = grouped.at(-1);
    if (last && last.section === (it.section ?? null)) last.items.push(it); else grouped.push({ section: it.section ?? null, items: [it] });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <div className="text-[14px] uppercase tracking-wide text-muted-foreground">{regime} inspection checklist{cl.category ? ` · ${ryaChecklistLabel(cl.category)}` : ""}</div>
            <div className="font-display text-[22px] font-bold leading-tight">{boat.name}</div>
          </div>
          <div className="flex items-center gap-4 text-[14px]">
            <span><span className="font-semibold text-emerald-500">{done}</span> <span className="text-muted-foreground">/ {items.length} checked</span></span>
            <span><span className="font-semibold text-sky-500">{covered}</span> <span className="text-muted-foreground">/ {items.length} in inventory</span></span>
            <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-5 py-2">
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {([["all", `All · ${items.length}`], ["open", `Not checked · ${items.length - done}`], ["missing", `Not in inventory · ${items.length - covered}`]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFilter(k)}
                className={cn("rounded-md px-2.5 py-1 text-[13px] font-medium", filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>{label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {!editing && (
              <>
                <button type="button" onClick={() => void syncFromInventory()} disabled={syncing} title="Tick every item the Inventory List already covers"
                  className="flex items-center gap-1 rounded-md border border-sky-500/50 bg-sky-500/10 px-2.5 py-1.5 text-[13px] font-semibold text-sky-500 hover:bg-sky-500/20 disabled:opacity-50">
                  {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync from inventory
                </button>
                {done > 0 && (
                  <button type="button" onClick={() => void reset()} title="Clear all ticks for a new inspection"
                    className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </button>
                )}
              </>
            )}
            {isAdmin && (
              <button type="button" onClick={() => setEditing((v) => !v)}
                className={cn("flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[13px] font-medium",
                  editing ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground")}>
                {editing ? <><Check className="h-3.5 w-3.5" /> Done editing</> : <><Pencil className="h-3.5 w-3.5" /> Edit items</>}
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {editing ? (
            <TemplateEditor items={items} regime={regime} category={cl.category} onChanged={reload} />
          ) : items.length === 0 ? (
            <p className="px-5 py-10 text-center text-[15px] text-muted-foreground">
              No items in this checklist yet{isAdmin ? " — use Edit items to add them, or send the official list to be loaded." : "."}
            </p>
          ) : visible.length === 0 ? (
            <p className="px-5 py-10 text-center text-[15px] text-muted-foreground">Nothing matches this filter.</p>
          ) : grouped.map((g, gi) => (
            <div key={`${g.section ?? ""}-${gi}`}>
              {g.section && (
                <div className="sticky top-0 z-10 border-y border-border/60 bg-muted/40 px-5 py-1.5 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                  {g.section}
                </div>
              )}
              <ul className="divide-y divide-border/40">
                {g.items.map((it) => (
                  <ChecklistRow key={it.id} item={it} state={stateFor.get(it.id)} inventory={inventory} match={linked(it)}
                    busy={busyId === it.id} onToggle={() => void toggle(it)} onLink={(id) => void link(it, id)} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChecklistRow({ item, state, inventory, match, busy, onToggle, onLink }: {
  item: ChecklistTemplateItem; state: BoatChecklistState | undefined; inventory: Orbit2BoatInventoryItem[];
  match: { rows: Orbit2BoatInventoryItem[]; manual: boolean }; busy: boolean; onToggle: () => void; onLink: (id: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  const on = !!state?.checked;
  const spec = [item.qty != null ? `${item.qty}${item.unit ? ` ${item.unit}` : ""}` : null].filter(Boolean).join("");

  return (
    <li className={cn("flex items-start gap-3 px-5 py-2.5", on && "bg-emerald-500/[0.04]")}>
      <button type="button" onClick={onToggle} disabled={busy} aria-label={on ? "Untick" : "Tick"}
        className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 transition",
          on ? "border-emerald-500 bg-emerald-500 text-white" : "border-border hover:border-emerald-500")}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : on && <Check className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={cn("text-[15px]", on && "text-muted-foreground line-through")}>{item.item}</span>
          {spec && <span className="rounded bg-muted px-1.5 py-0.5 text-[12px] font-medium tabular-nums text-muted-foreground">{spec}</span>}
          {item.ref && <span className="rounded border border-border px-1.5 py-0.5 text-[12px] font-medium text-muted-foreground" title="RYA reference">{item.ref}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px]">
          {match.rows.length > 0 ? (
            <span className="text-sky-500">
              In inventory: {match.rows.map((r) => `${r.item}${r.qty != null ? ` · ${r.qty}${r.unit ? ` ${r.unit}` : ""}` : ""}${r.on_board ? "" : " (not on board)"}`).join(", ")}
              {match.manual && <span className="text-muted-foreground"> · linked</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">Not in inventory</span>
          )}
          {on && state?.checked_at && <span className="text-emerald-600">{state.checked_by ?? "Checked"} · {stamp(state.checked_at)}</span>}
          {picking ? (
            <select autoFocus className={cn(inputCls, "h-7 w-auto max-w-[18rem] py-0 text-[13px]")} defaultValue={state?.inventory_item_id ?? ""}
              onChange={(e) => { onLink(e.target.value || null); setPicking(false); }} onBlur={() => setPicking(false)}>
              <option value="">— no inventory item —</option>
              {inventory.map((r) => <option key={r.id} value={r.id}>{r.item}{r.qty != null ? ` · ${r.qty} ${r.unit ?? ""}` : ""}</option>)}
            </select>
          ) : (
            <button type="button" onClick={() => setPicking(true)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground" title="Link to an inventory item">
              <Link2 className="h-3.5 w-3.5" /> {match.manual ? "Change link" : match.rows.length ? "Change" : "Link inventory item"}
            </button>
          )}
          {match.manual && (
            <button type="button" onClick={() => onLink(null)} className="flex items-center gap-1 text-muted-foreground hover:text-destructive" title="Remove the link">
              <Link2Off className="h-3.5 w-3.5" /> Unlink
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

// ── Admin: the item list itself ──────────────────────────────────────────────

function TemplateEditor({ items, regime, category, onChanged }: {
  items: ChecklistTemplateItem[]; regime: InspectionRegime; category: RyaChecklist | null; onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState({ section: items.at(-1)?.section ?? "", item: "", qty: "", unit: "", ref: "" });
  const [renaming, setRenaming] = useState<{ id: string; item: string; section: string; qty: string; unit: string; ref: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(label: string, fn: () => Promise<{ error: any }>) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) { toast.error(errorMessage(error, `Could not ${label}`)); return false; }
    await onChanged();
    return true;
  }
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const add = async () => {
    const item = draft.item.trim();
    if (!item) return;
    const sort_order = (items.at(-1)?.sort_order ?? 0) + 1;
    if (await run("add the item", () => sb.from("orbit2_checklist_templates").insert({
      regime, category, item, section: draft.section.trim() || null, qty: num(draft.qty), unit: draft.unit.trim() || null, ref: draft.ref.trim() || null, sort_order,
    }))) setDraft((d) => ({ ...d, item: "", qty: "", unit: "", ref: "" }));
  };
  const saveRename = async () => {
    if (!renaming || !renaming.item.trim()) return;
    if (await run("save", () => sb.from("orbit2_checklist_templates").update({
      item: renaming.item.trim(), section: renaming.section.trim() || null, qty: num(renaming.qty), unit: renaming.unit.trim() || null, ref: renaming.ref.trim() || null,
    }).eq("id", renaming.id))) setRenaming(null);
  };
  // Removing keeps history: the row is deactivated, so past ticks still point at a real item.
  const remove = (it: ChecklistTemplateItem) => {
    if (!confirm(`Remove "${it.item}" from this checklist?`)) return;
    void run("remove", () => sb.from("orbit2_checklist_templates").update({ active: false }).eq("id", it.id));
  };
  const move = (idx: number, dir: -1 | 1) => {
    const a = items[idx], b = items[idx + dir];
    if (!a || !b) return;
    void run("reorder", async () => {
      const r1 = await sb.from("orbit2_checklist_templates").update({ sort_order: b.sort_order }).eq("id", a.id);
      if (r1.error) return r1;
      return sb.from("orbit2_checklist_templates").update({ sort_order: a.sort_order }).eq("id", b.id);
    });
  };
  const small = cn(inputCls, "h-8 py-1 text-[13px]");

  return (
    <div>
      <p className="border-b border-border/60 bg-muted/20 px-5 py-2 text-[13px] text-muted-foreground">
        Changes here apply to every boat using the {regime.toUpperCase()}{category ? ` ${ryaChecklistLabel(category)}` : ""} checklist.
      </p>
      <ul className="divide-y divide-border/40">
        {items.map((it, i) => (
          <li key={it.id} className="flex items-center gap-1.5 px-4 py-1.5">
            {renaming?.id === it.id ? (
              <div className="grid flex-1 grid-cols-[1fr_2fr_4rem_5rem_5rem] gap-1.5">
                <input className={small} value={renaming.section} placeholder="Section" onChange={(e) => setRenaming({ ...renaming, section: e.target.value })} />
                <input autoFocus className={small} value={renaming.item} placeholder="Item" onChange={(e) => setRenaming({ ...renaming, item: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") void saveRename(); if (e.key === "Escape") setRenaming(null); }} />
                <input className={small} value={renaming.qty} placeholder="Qty" inputMode="decimal" onChange={(e) => setRenaming({ ...renaming, qty: e.target.value })} />
                <input className={small} value={renaming.unit} placeholder="Unit" onChange={(e) => setRenaming({ ...renaming, unit: e.target.value })} />
                <input className={small} value={renaming.ref} placeholder="RYA ref" onChange={(e) => setRenaming({ ...renaming, ref: e.target.value })} />
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 items-baseline gap-2 text-[14px]">
                {it.section && <span className="shrink-0 text-[12px] uppercase tracking-wide text-muted-foreground">{it.section}</span>}
                <span className="min-w-0 flex-1">{it.item}</span>
                {it.qty != null && <span className="text-[12px] text-muted-foreground">{it.qty} {it.unit ?? ""}</span>}
                {it.ref && <span className="text-[12px] text-muted-foreground">{it.ref}</span>}
              </div>
            )}
            {renaming?.id === it.id ? (
              <>
                <button type="button" onClick={() => void saveRename()} disabled={busy} className="rounded p-1 text-primary hover:bg-primary/10"><Check className="h-4 w-4" /></button>
                <button type="button" onClick={() => setRenaming(null)} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => move(i, -1)} disabled={busy || i === 0} className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={busy || i === items.length - 1} className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => setRenaming({ id: it.id, item: it.item, section: it.section ?? "", qty: it.qty != null ? String(it.qty) : "", unit: it.unit ?? "", ref: it.ref ?? "" })}
                  disabled={busy} className="rounded p-1 text-muted-foreground hover:bg-accent"><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => remove(it)} disabled={busy} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="sticky bottom-0 grid grid-cols-[1fr_2fr_4rem_5rem_5rem_auto] gap-1.5 border-t border-border bg-card px-4 py-2.5">
        <input className={small} value={draft.section} placeholder="Section" onChange={(e) => setDraft({ ...draft, section: e.target.value })} />
        <input className={small} value={draft.item} placeholder="New checklist item…" onChange={(e) => setDraft({ ...draft, item: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
        <input className={small} value={draft.qty} placeholder="Qty" inputMode="decimal" onChange={(e) => setDraft({ ...draft, qty: e.target.value })} />
        <input className={small} value={draft.unit} placeholder="Unit" onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
        <input className={small} value={draft.ref} placeholder="RYA ref" onChange={(e) => setDraft({ ...draft, ref: e.target.value })} />
        <button type="button" onClick={() => void add()} disabled={busy || !draft.item.trim()}
          className="flex items-center gap-1 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
        </button>
      </div>
    </div>
  );
}
