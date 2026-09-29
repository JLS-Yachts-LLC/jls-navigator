/**
 * Managed Boats — inspection checklists.
 *
 * A boat needs some or all of the DMA / FMA / RYA inspections, and the RYA
 * checklist depends on the craft's classification: Personal Water Craft
 * (a jet ski), Powerboat or Cruising. The profile shows the required items for
 * each inspection and lets the team tick them off per boat; the office keeps the
 * item lists themselves up to date from the same card.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, ListChecks, Loader2, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/error-message";
import { Field, inputCls, stamp } from "./orbit2-fields";
import type { Orbit2Boat } from "./orbit2-data";

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
  id: string; regime: InspectionRegime; category: RyaChecklist | null; item: string; sort_order: number; active: boolean;
};
export type BoatChecklistState = {
  id: string; boat_id: string; template_id: string; checked: boolean; checked_at: string | null; checked_by: string | null; remarks: string | null;
};

/** Which inspections this boat needs, and which RYA list applies. Saved straight to the boat. */
export function InspectionsRequired({ boat, onSave }: { boat: Orbit2Boat; onSave: (patch: Record<string, unknown>) => Promise<boolean> }) {
  const required = boat.inspections_required ?? [];
  const toggle = (r: InspectionRegime) => {
    const next = required.includes(r) ? required.filter((x) => x !== r) : [...INSPECTION_REGIMES.filter((x) => required.includes(x) || x === r)];
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

/**
 * The checklist for one inspection on one boat: the template's items with this
 * boat's ticks. Admins can switch to editing the item list itself.
 */
export function InspectionChecklist({ boat, regime, isAdmin, authorName }: {
  boat: Orbit2Boat; regime: InspectionRegime; isAdmin: boolean; authorName: string;
}) {
  const category: RyaChecklist | null = regime === "rya" ? (boat.rya_checklist as RyaChecklist | null) : null;
  const [items, setItems] = useState<ChecklistTemplateItem[]>([]);
  const [states, setStates] = useState<BoatChecklistState[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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
  const done = items.filter((i) => stateFor.get(i.id)?.checked).length;

  async function toggle(item: ChecklistTemplateItem) {
    const cur = stateFor.get(item.id);
    const checked = !cur?.checked;
    setBusyId(item.id);
    const { error } = await sb.from("orbit2_boat_checklist").upsert({
      boat_id: boat.id, template_id: item.id, checked,
      checked_at: checked ? new Date().toISOString() : null, checked_by: checked ? authorName : null,
    }, { onConflict: "boat_id,template_id" });
    setBusyId(null);
    if (error) { toast.error(errorMessage(error, "Could not save")); return; }
    await load();
  }

  /** New inspection — clear every tick for this regime on this boat. */
  async function reset() {
    if (!confirm(`Clear all ${regime.toUpperCase()} ticks for ${boat.name}? Use this when starting a new inspection.`)) return;
    const ids = items.map((i) => i.id);
    const { error } = await sb.from("orbit2_boat_checklist").delete().eq("boat_id", boat.id).in("template_id", ids);
    if (error) { toast.error(errorMessage(error, "Could not reset")); return; }
    toast.success(`${regime.toUpperCase()} checklist reset`);
    await load();
  }

  if (regime === "rya" && !category) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-3 text-[14px] text-muted-foreground">
        Choose the RYA checklist classification above (Personal Water Craft, Powerboat or Cruising) to see the items required.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-muted/10">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2 text-[14px] font-medium">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          Checklist{category ? ` — ${ryaChecklistLabel(category)}` : ""}
          {!loading && items.length > 0 && (
            <span className={cn("rounded-full px-2 py-0.5 text-[13px] font-semibold", done === items.length ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground")}>
              {done} / {items.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {done > 0 && !editing && (
            <button type="button" onClick={() => void reset()} title="Clear all ticks for a new inspection"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><RotateCcw className="h-3.5 w-3.5" /></button>
          )}
          {isAdmin && (
            <button type="button" onClick={() => setEditing((v) => !v)} title={editing ? "Done editing" : "Edit the checklist items"}
              className={cn("flex items-center gap-1 rounded px-1.5 py-1 text-[13px] font-medium", editing ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
              {editing ? <><Check className="h-3.5 w-3.5" /> Done</> : <><Pencil className="h-3.5 w-3.5" /> Edit items</>}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex h-16 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : editing ? (
        <TemplateEditor items={items} regime={regime} category={category} onChanged={load} />
      ) : items.length === 0 ? (
        <p className="px-3 py-4 text-center text-[14px] text-muted-foreground">
          No items in this checklist yet{isAdmin ? " — use Edit items to add them." : "."}
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {items.map((it) => {
            const s = stateFor.get(it.id);
            const on = !!s?.checked;
            return (
              <li key={it.id}>
                <button type="button" onClick={() => void toggle(it)} disabled={busyId === it.id}
                  className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-accent/40 disabled:opacity-60">
                  <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition",
                    on ? "border-emerald-500 bg-emerald-500 text-white" : "border-border")}>
                    {busyId === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : on && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[14px]", on && "text-muted-foreground line-through")}>{it.item}</span>
                    {on && s?.checked_at && <span className="block text-[13px] text-emerald-600">{s.checked_by ?? "Checked"} · {stamp(s.checked_at)}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Admin: add, rename, reorder and remove the items of one checklist template. */
function TemplateEditor({ items, regime, category, onChanged }: {
  items: ChecklistTemplateItem[]; regime: InspectionRegime; category: RyaChecklist | null; onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(label: string, fn: () => Promise<{ error: any }>) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) { toast.error(errorMessage(error, `Could not ${label}`)); return; }
    await onChanged();
  }

  const add = () => {
    const item = draft.trim();
    if (!item) return;
    const sort_order = (items.at(-1)?.sort_order ?? 0) + 1;
    void run("add the item", () => sb.from("orbit2_checklist_templates").insert({ regime, category, item, sort_order })).then(() => setDraft(""));
  };
  const rename = () => {
    if (!renaming) return;
    const value = renaming.value.trim();
    if (!value) return;
    void run("rename", () => sb.from("orbit2_checklist_templates").update({ item: value }).eq("id", renaming.id)).then(() => setRenaming(null));
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

  return (
    <div>
      <ul className="divide-y divide-border/40">
        {items.map((it, i) => (
          <li key={it.id} className="flex items-center gap-1.5 px-2 py-1.5">
            {renaming?.id === it.id ? (
              <>
                <input autoFocus className={cn(inputCls, "h-8 flex-1 py-1 text-[14px]")} value={renaming.value}
                  onChange={(e) => setRenaming({ id: it.id, value: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") setRenaming(null); }} />
                <button type="button" onClick={rename} disabled={busy} className="rounded p-1 text-primary hover:bg-primary/10"><Check className="h-4 w-4" /></button>
                <button type="button" onClick={() => setRenaming(null)} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
              </>
            ) : (
              <>
                <span className="flex-1 text-[14px]">{it.item}</span>
                <button type="button" onClick={() => move(i, -1)} disabled={busy || i === 0} className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={busy || i === items.length - 1} className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => setRenaming({ id: it.id, value: it.item })} disabled={busy} className="rounded p-1 text-muted-foreground hover:bg-accent"><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => remove(it)} disabled={busy} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5 border-t border-border/60 p-2">
        <input className={cn(inputCls, "h-9 flex-1 py-1 text-[14px]")} value={draft} placeholder="New checklist item…"
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button type="button" onClick={add} disabled={busy || !draft.trim()}
          className="flex items-center gap-1 rounded-md bg-primary px-3 text-[14px] font-medium text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
        </button>
      </div>
      <p className="px-3 pb-2 text-[13px] text-muted-foreground">
        Changes apply to every boat using this {regime.toUpperCase()}{category ? ` ${ryaChecklistLabel(category)}` : ""} checklist.
      </p>
    </div>
  );
}
