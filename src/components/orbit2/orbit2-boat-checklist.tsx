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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, Camera, Check, FileDown, Link2, Link2Off, ListChecks, Loader2, MessageSquare, Pencil, Plus, RefreshCw, RotateCcw, Trash2, Upload, UserPlus, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/error-message";
import { SignedImage } from "@/components/ui/signed-file";
import { useAuth } from "@/lib/auth";
import { storageRef } from "@/lib/signed-url";
import { fillRyaForm, RYA_FORM_FILE, type RyaFormKey, type RyaAppendixRow } from "@/lib/orbit2/rya-form";
import { compressImageToMaxKB } from "@/lib/image-compress";
import { guardUploadFile, uploadContentType } from "@/lib/upload-guard";
import { ORBIT2_BUCKET } from "./orbit2-data";
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
  /** Where this item's Check cell is on the RYA's own PDF (page, PDF points). */
  pdf_page: number | null; pdf_x: number | null; pdf_y: number | null;
  sort_order: number; active: boolean;
};
export type BoatChecklistState = {
  id: string; boat_id: string; template_id: string; checked: boolean; checked_at: string | null; checked_by: string | null;
  remarks: string | null; inventory_item_id: string | null;
  /** A photo taken against this line during the check. */
  image_ref: string | null;
  /** The team has said this line has no inventory item — no automatic match, no sync. */
  inventory_unlinked: boolean;
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
export function InspectionChecklist({ boat, regime, inventory, isAdmin, authorName, onDocumentAdded, onAssignTeam }: {
  boat: Orbit2Boat; regime: InspectionRegime; inventory: Orbit2BoatInventoryItem[]; isAdmin: boolean; authorName: string;
  /** Called after a generated RYA form has been filed against the boat. */
  onDocumentAdded?: () => Promise<void> | void;
  /** "Assign Team" on the checklist — the caller opens a new job of the matching Checklist category. */
  onAssignTeam?: () => void;
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
          cl={cl} onClose={() => setOpen(false)} onDocumentAdded={onDocumentAdded} onAssignTeam={onAssignTeam} />
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

/** Inventory rows for an item — the hand-made link wins, otherwise matched by name. */
export function linkedRows(it: ChecklistTemplateItem, state: BoatChecklistState | undefined, inventory: Orbit2BoatInventoryItem[]): { rows: Orbit2BoatInventoryItem[]; manual: boolean; unlinked: boolean } {
  if (state?.inventory_item_id) {
    const row = inventory.find((r) => r.id === state.inventory_item_id);
    return { rows: row ? [row] : [], manual: true, unlinked: false };
  }
  // "Unlink" on a by-name match: the team has said this is not the item, so stay unmatched.
  if (state?.inventory_unlinked) return { rows: [], manual: false, unlinked: true };
  return { rows: matchInventory(it.item, inventory), manual: false, unlinked: false };
}

type ChecklistFilter = "all" | "open" | "missing" | "noted";
const hasNote = (s: BoatChecklistState | undefined) => !!(s?.remarks || s?.image_ref);

/** Upload a photo taken against a checklist line — small enough for mobile data. */
async function uploadChecklistPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That isn't a photo.");
  const { file: small } = await compressImageToMaxKB(file, 1500);
  if (!guardUploadFile(small)) throw new Error("That photo can't be uploaded.");
  const path = `orbit2/boats/checklist/${crypto.randomUUID()}-${small.name.replace(/[^\w.-]+/g, "_")}`;
  const { error } = await supabase.storage.from(ORBIT2_BUCKET).upload(path, small, { contentType: uploadContentType(small), upsert: false });
  if (error) throw new Error(error.message);
  return storageRef(ORBIT2_BUCKET, path);
}

function ChecklistModal({ boat, regime, inventory, isAdmin, authorName, cl, onClose, onDocumentAdded, onAssignTeam }: {
  boat: Orbit2Boat; regime: InspectionRegime; inventory: Orbit2BoatInventoryItem[]; isAdmin: boolean; authorName: string;
  cl: ReturnType<typeof useChecklist>; onClose: () => void; onDocumentAdded?: () => Promise<void> | void; onAssignTeam?: () => void;
}) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<ChecklistFilter>("all");
  const { items, stateFor, reload } = cl;

  const done = items.filter((i) => stateFor.get(i.id)?.checked).length;
  const covered = items.filter((i) => linkedRows(i, stateFor.get(i.id), inventory).rows.length > 0).length;
  const noted = items.filter((i) => hasNote(stateFor.get(i.id))).length;

  /** Tick every item the inventory already covers. */
  async function syncFromInventory() {
    const todo = items.filter((i) => !stateFor.get(i.id)?.checked && linkedRows(i, stateFor.get(i.id), inventory).rows.length > 0);
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
    if (!confirm(`Clear all ${regime.toUpperCase()} ticks for ${boat.name}? Remarks, photos and inventory links are kept. Use this when starting a new inspection.`)) return;
    const { error } = await sb.from("orbit2_boat_checklist").update({ checked: false, checked_at: null, checked_by: null })
      .eq("boat_id", boat.id).in("template_id", items.map((i) => i.id));
    if (error) { toast.error(errorMessage(error, "Could not reset")); return; }
    toast.success(`${regime.toUpperCase()} checklist reset`);
    await reload();
  }

  const filters: [ChecklistFilter, string][] = [
    ["all", `All · ${items.length}`], ["open", `Not checked · ${items.length - done}`],
    ["missing", `Not in inventory · ${items.length - covered}`], ["noted", `With notes · ${noted}`],
  ];

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
          <div className="flex flex-wrap gap-1 rounded-lg border border-border p-0.5">
            {filters.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFilter(k)}
                className={cn("rounded-md px-2.5 py-1 text-[13px] font-medium", filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {!editing && onAssignTeam && (
              <button type="button" onClick={onAssignTeam} title="Raise a checklist job for the crew — it goes on the Jobs board and their phones"
                className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-[13px] font-semibold text-white hover:opacity-90">
                <UserPlus className="h-3.5 w-3.5" /> Assign Team
              </button>
            )}
            {!editing && regime === "rya" && cl.category && items.length > 0 && (
              <button type="button" onClick={() => setGenerating(true)} title="Fill the RYA's own checklist PDF from these ticks"
                className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90">
                <FileDown className="h-3.5 w-3.5" /> Generate RYA form
              </button>
            )}
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
          ) : (
            <ChecklistBody boat={boat} cl={cl} inventory={inventory} authorName={authorName} userId={user?.id ?? null} editable filter={filter} />
          )}
        </div>
      </div>
      {generating && cl.category && (
        <RyaFormDialog boat={boat} form={cl.category} items={items} stateFor={stateFor} inventory={inventory} authorName={authorName}
          onClose={() => setGenerating(false)} onFiled={onDocumentAdded} />
      )}
    </div>
  );
}

/**
 * The checklist lines themselves — grouped by section, each with its tick,
 * inventory match, remark and photo. Shared by the office's View checklist and
 * the crew's checklist job on the phone, so both work the same rows.
 */
export function ChecklistBody({ boat, cl, inventory, authorName, userId, editable, filter, padX = "px-5" }: {
  boat: Orbit2Boat; cl: ReturnType<typeof useChecklist>; inventory: Orbit2BoatInventoryItem[]; authorName: string; userId: string | null;
  editable: boolean; filter: ChecklistFilter; padX?: string;
}) {
  const { items, stateFor, reload } = cl;
  const [busyId, setBusyId] = useState<string | null>(null);

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
  const link = (it: ChecklistTemplateItem, choice: string | null) =>
    save(it, choice === "auto" ? { inventory_item_id: null, inventory_unlinked: false }
      : choice === null ? { inventory_item_id: null, inventory_unlinked: true }
      : { inventory_item_id: choice, inventory_unlinked: false });
  const remark = (it: ChecklistTemplateItem, text: string) => save(it, { remarks: text.trim() || null });
  async function photo(it: ChecklistTemplateItem, file: File | undefined) {
    if (!file) return;
    setBusyId(it.id);
    try {
      const ref = await uploadChecklistPhoto(file);
      await save(it, { image_ref: ref });
      toast.success("Photo added to the line");
    } catch (e) { toast.error(errorMessage(e, "Could not upload the photo")); setBusyId(null); }
  }
  void userId;

  const visible = items.filter((i) => {
    const st = stateFor.get(i.id);
    if (filter === "open") return !st?.checked;
    if (filter === "missing") return linkedRows(i, st, inventory).rows.length === 0;
    if (filter === "noted") return hasNote(st);
    return true;
  });
  const grouped: { section: string | null; items: ChecklistTemplateItem[] }[] = [];
  for (const it of visible) {
    const last = grouped.at(-1);
    if (last && last.section === (it.section ?? null)) last.items.push(it); else grouped.push({ section: it.section ?? null, items: [it] });
  }

  if (visible.length === 0) return <p className={cn("py-10 text-center text-[15px] text-muted-foreground", padX)}>Nothing matches this filter.</p>;
  return (
    <>
      {grouped.map((g, gi) => (
        <div key={`${g.section ?? ""}-${gi}`}>
          {g.section && (
            <div className={cn("sticky top-0 z-10 border-y border-border/60 bg-muted/40 py-1.5 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur", padX)}>
              {g.section}
            </div>
          )}
          <ul className="divide-y divide-border/40">
            {g.items.map((it) => (
              <ChecklistRow key={it.id} item={it} state={stateFor.get(it.id)} inventory={inventory} match={linkedRows(it, stateFor.get(it.id), inventory)}
                busy={busyId === it.id} editable={editable} padX={padX}
                onToggle={() => void toggle(it)} onLink={(id) => void link(it, id)} onRemark={(t) => void remark(it, t)}
                onPhoto={(file) => void photo(it, file)} onRemovePhoto={() => void save(it, { image_ref: null })} />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

/**
 * The checklist as the crew work it on the phone, inside an RYA / DMA / FMA
 * Checklist job: progress, a couple of filters, and the lines to tick, remark
 * and photograph. Read-only until the job is attended.
 */
export function ChecklistWork({ boat, regime, editable, authorName, userId }: {
  boat: Orbit2Boat; regime: InspectionRegime; editable: boolean; authorName: string; userId: string | null;
}) {
  const cl = useChecklist(boat, regime);
  const [inventory, setInventory] = useState<Orbit2BoatInventoryItem[]>([]);
  const [filter, setFilter] = useState<ChecklistFilter>("all");
  useEffect(() => {
    void sb.from("orbit2_boat_inventory").select("*").eq("boat_id", boat.id).order("item")
      .then(({ data }: { data: Orbit2BoatInventoryItem[] | null }) => setInventory(data ?? []));
  }, [boat.id]);
  const done = cl.items.filter((i) => cl.stateFor.get(i.id)?.checked).length;
  const noted = cl.items.filter((i) => hasNote(cl.stateFor.get(i.id))).length;

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2 text-[15px] font-semibold">
          <ListChecks className="h-4 w-4 text-muted-foreground" /> {regime.toUpperCase()} checklist{cl.category ? ` — ${ryaChecklistLabel(cl.category)}` : ""}
        </div>
        <div className="text-[14px] text-muted-foreground">
          {cl.loading ? "Loading…" : `${done} of ${cl.items.length} checked · ${noted} with notes`}
          {!editable && !cl.loading && " · press Attend to start"}
        </div>
        {!cl.loading && cl.items.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {([["all", "All"], ["open", "Not checked"], ["noted", "With notes"]] as [ChecklistFilter, string][]).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFilter(k)}
                className={cn("rounded-full border px-3 py-1 text-[14px] font-medium", filter === k ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}>{label}</button>
            ))}
          </div>
        )}
      </div>
      {cl.loading ? (
        <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : regime === "rya" && !cl.category ? (
        <p className="px-4 py-6 text-center text-[15px] text-muted-foreground">The office has not set this boat's RYA classification yet.</p>
      ) : cl.items.length === 0 ? (
        <p className="px-4 py-6 text-center text-[15px] text-muted-foreground">No items in the {regime.toUpperCase()} checklist yet.</p>
      ) : (
        <ChecklistBody boat={boat} cl={cl} inventory={inventory} authorName={authorName} userId={userId} editable={editable} filter={filter} padX="px-4" />
      )}
    </section>
  );
}

// ── Generate the RYA's own PDF from the ticks ────────────────────────────────

const fmtDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB") : "");

function RyaFormDialog({ boat, form, items, stateFor, inventory, authorName, onClose, onFiled }: {
  boat: Orbit2Boat; form: RyaFormKey; items: ChecklistTemplateItem[]; stateFor: Map<string, BoatChecklistState>; inventory: Orbit2BoatInventoryItem[];
  authorName: string; onClose: () => void; onFiled?: () => Promise<void> | void;
}) {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    rtcName: "JLS Yacht Training Institute",
    boatName: boat.name,
    boatType: boat.boat_type ?? "",
    persons: boat.max_passengers != null ? String(boat.max_passengers) : "",
    inspectionDate: boat.rya_last_inspection ?? today,
    inspectionPlace: "Dubai, UAE",
    inspectorName: authorName,
    crossUnchecked: false,
    notes: true,
    file: true,
  });
  // The lines that carry evidence: a remark, or a photo taken on the check. A remarked
  // line without its own photo borrows the matched inventory item's picture.
  const appendix: RyaAppendixRow[] = items.flatMap((i) => {
    const st = stateFor.get(i.id);
    if (!st?.remarks && !st?.image_ref) return [];
    const inv = linkedRows(i, st, inventory).rows.find((r) => r.image_ref);
    return [{ section: i.section, item: i.item, checked: !!st.checked, checkedBy: st.checked_by ?? null, remarks: st.remarks ?? null, imageRef: st.image_ref ?? inv?.image_ref ?? null }];
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const checked = items.filter((i) => stateFor.get(i.id)?.checked).length;
  const unplaced = items.filter((i) => i.pdf_page == null).length;

  async function generate() {
    setBusy(true);
    try {
      const bytes = await fillRyaForm(form, {
        rtcName: f.rtcName, boatName: f.boatName, boatType: f.boatType, persons: f.persons,
        inspectionDate: fmtDate(f.inspectionDate), inspectionPlace: f.inspectionPlace, inspectorName: f.inspectorName,
      }, items.map((i) => ({ pdf_page: i.pdf_page, pdf_x: i.pdf_x, pdf_y: i.pdf_y, checked: !!stateFor.get(i.id)?.checked })),
      { crossUnchecked: f.crossUnchecked, appendix: f.notes ? appendix : [] });
      const name = `${RYA_FORM_FILE[form]} — ${boat.name} — ${f.inspectionDate}.pdf`.replace(/[\\/:*?"<>|]+/g, "-");
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });

      // Download for the inspector…
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      // …and file a copy under the boat's RYA checklist documents.
      if (f.file) {
        const path = `orbit2/boats/${boat.id}/rya/${crypto.randomUUID()}-${name.replace(/[^\w.-]+/g, "_")}`;
        const up = await supabase.storage.from(ORBIT2_BUCKET).upload(path, blob, { contentType: "application/pdf", upsert: false });
        if (up.error) throw new Error(up.error.message);
        const { error } = await sb.from("orbit2_boat_documents").insert({
          boat_id: boat.id, category: "rya_checklist", file_name: name, storage_ref: storageRef(ORBIT2_BUCKET, path), uploaded_by: user?.id ?? null,
        });
        if (error) throw new Error(error.message);
        await onFiled?.();
      }
      toast.success(`${RYA_FORM_FILE[form]} generated — ${checked} of ${items.length} items ticked`);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, "Could not generate the form"));
    } finally {
      setBusy(false);
    }
  }

  const field = (label: string, k: keyof typeof f, type = "text") => (
    <Field label={label}>
      <input className={cn(inputCls, "h-9 py-1 text-[14px]")} type={type} value={String(f[k])} onChange={(e) => set(k, e.target.value)} />
    </Field>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <div className="font-semibold">Generate {RYA_FORM_FILE[form]}</div>
            <div className="text-[13px] text-muted-foreground">The RYA's own PDF, with the header filled and {checked} of {items.length} items ticked from Polaris.</div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          {field("RTC name", "rtcName")}
          <div className="grid grid-cols-2 gap-3">
            {field("Name of boat", "boatName")}
            {field("Inspection date", "inspectionDate", "date")}
            {form !== "pwc" && field("Boat type", "boatType")}
            {form !== "pwc" && field("No. of persons", "persons")}
            {form !== "pwc" && field("Inspection place", "inspectionPlace")}
            {field("Inspector's name", "inspectorName")}
          </div>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={f.crossUnchecked} onChange={(e) => set("crossUnchecked", e.target.checked)} />
            Mark items not ticked with an ✗ (otherwise left blank)
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={f.notes} onChange={(e) => set("notes", e.target.checked)} disabled={appendix.length === 0} />
            Append the inspection notes &amp; photos page{appendix.length ? ` (${appendix.length} line${appendix.length === 1 ? "" : "s"} with remarks or photos)` : " (no remarks or photos yet)"}
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={f.file} onChange={(e) => set("file", e.target.checked)} />
            File a copy under this boat's RYA checklist documents
          </label>
          {unplaced > 0 && (
            <p className="text-[13px] text-warning">{unplaced} item{unplaced === 1 ? "" : "s"} added in Polaris {unplaced === 1 ? "has" : "have"} no position on the RYA form and will not appear on it.</p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md border border-border px-4 py-2 text-[14px] font-medium hover:bg-accent disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void generate()} disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[14px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Generate & download
          </button>
        </div>
      </div>
    </div>
  );
}

function ChecklistRow({ item, state, inventory, match, busy, editable, padX, onToggle, onLink, onRemark, onPhoto, onRemovePhoto }: {
  item: ChecklistTemplateItem; state: BoatChecklistState | undefined; inventory: Orbit2BoatInventoryItem[];
  match: { rows: Orbit2BoatInventoryItem[]; manual: boolean; unlinked: boolean }; busy: boolean; editable: boolean; padX: string;
  onToggle: () => void; onLink: (id: string | null) => void; onRemark: (text: string) => void; onPhoto: (file: File | undefined) => void; onRemovePhoto: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null); // null = not editing the remark
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const on = !!state?.checked;
  const spec = [item.qty != null ? `${item.qty}${item.unit ? ` ${item.unit}` : ""}` : null].filter(Boolean).join("");
  // The matched inventory rows' photos — what the boat actually carries, at a glance.
  const photos = match.rows.filter((r) => r.image_ref);
  const commitRemark = () => { if (draft !== null && draft.trim() !== (state?.remarks ?? "")) onRemark(draft); setDraft(null); };

  return (
    <li className={cn("flex items-start gap-3 py-2.5", padX, on && "bg-emerald-500/[0.04]")}>
      <button type="button" onClick={onToggle} disabled={busy || !editable} aria-label={on ? "Untick" : "Tick"}
        className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 transition disabled:cursor-default",
          on ? "border-emerald-500 bg-emerald-500 text-white" : "border-border", editable && !on && "hover:border-emerald-500")}>
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
            <span className="text-muted-foreground">Not in inventory{match.unlinked ? " · unlinked" : ""}</span>
          )}
          {on && state?.checked_at && <span className="text-emerald-600">{state.checked_by ?? "Checked"} · {stamp(state.checked_at)}</span>}
          {editable && (picking ? (
            <select autoFocus className={cn(inputCls, "h-7 w-auto max-w-[18rem] py-0 text-[13px]")} defaultValue={state?.inventory_item_id ?? (match.unlinked ? "" : "auto")}
              onChange={(e) => { onLink(e.target.value || null); setPicking(false); }} onBlur={() => setPicking(false)}>
              <option value="">— no inventory item —</option>
              <option value="auto">— match by name automatically —</option>
              {inventory.map((r) => <option key={r.id} value={r.id}>{r.item}{r.qty != null ? ` · ${r.qty} ${r.unit ?? ""}` : ""}</option>)}
            </select>
          ) : (
            <button type="button" onClick={() => setPicking(true)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground" title="Link to an inventory item">
              <Link2 className="h-3.5 w-3.5" /> {match.manual ? "Change link" : match.rows.length ? "Change" : "Link inventory item"}
            </button>
          ))}
          {editable && match.rows.length > 0 && (
            <button type="button" onClick={() => onLink(null)} className="flex items-center gap-1 text-muted-foreground hover:text-destructive"
              title={match.manual ? "Remove the link" : "This is not the item — stop matching it by name"}>
              <Link2Off className="h-3.5 w-3.5" /> Unlink
            </button>
          )}
          {editable && match.unlinked && (
            <button type="button" onClick={() => onLink("auto")} className="flex items-center gap-1 text-muted-foreground hover:text-foreground" title="Match by name again">
              <RefreshCw className="h-3.5 w-3.5" /> Match automatically
            </button>
          )}
        </div>

        {/* Remark — what the inspector found. Logged against the line and printed on the RYA form's notes page. */}
        {draft !== null ? (
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commitRemark}
            onKeyDown={(e) => { if (e.key === "Enter") commitRemark(); if (e.key === "Escape") setDraft(null); }}
            placeholder="Remark for this line…" className={cn(inputCls, "mt-1.5 h-9 py-1 text-[14px]")} />
        ) : state?.remarks ? (
          <button type="button" disabled={!editable} onClick={() => setDraft(state.remarks ?? "")}
            className="mt-1.5 flex w-full items-start gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-left text-[14px] text-amber-700 dark:text-amber-300 disabled:cursor-default">
            <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="whitespace-pre-wrap">{state.remarks}</span>
          </button>
        ) : editable ? (
          <button type="button" onClick={() => setDraft("")} className="mt-1 flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
            <MessageSquare className="h-3.5 w-3.5" /> Add remark
          </button>
        ) : null}
      </div>

      {/* Photos: the line's own photo first, then the matched inventory items'. */}
      <div className="flex shrink-0 items-start gap-1.5">
        {state?.image_ref && (
          <div className="group relative">
            <button type="button" onClick={() => setLightbox(state.image_ref)} title="Photo taken on the check — click to enlarge"
              className="h-12 w-12 overflow-hidden rounded-md border-2 border-amber-500/60 bg-muted/20 transition hover:border-primary/60">
              <SignedImage stored={state.image_ref} alt={item.item} className="h-full w-full object-cover" />
            </button>
            {editable && (
              <button type="button" onClick={onRemovePhoto} title="Remove photo"
                className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-background p-0.5 text-destructive shadow group-hover:block"><X className="h-3 w-3" /></button>
            )}
          </div>
        )}
        {photos.map((r) => (
          <button key={r.id} type="button" onClick={() => setLightbox(r.image_ref)} title={`${r.item} — click to enlarge`}
            className="h-12 w-12 overflow-hidden rounded-md border border-border bg-muted/20 transition hover:border-primary/60">
            <SignedImage stored={r.image_ref!} alt={r.item} className="h-full w-full object-cover" />
          </button>
        ))}
        {editable && !state?.image_ref && (
          <div className="flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-border text-muted-foreground">
            <div className="flex gap-1">
              <button type="button" onClick={() => cameraRef.current?.click()} disabled={busy} title="Take a photo" className="rounded p-0.5 hover:bg-accent hover:text-foreground"><Camera className="h-4 w-4" /></button>
              <button type="button" onClick={() => uploadRef.current?.click()} disabled={busy} title="Upload a photo" className="rounded p-0.5 hover:bg-accent hover:text-foreground"><Upload className="h-4 w-4" /></button>
            </div>
            <span className="text-[9px] leading-none">photo</span>
          </div>
        )}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6" onMouseDown={(e) => { e.stopPropagation(); setLightbox(null); }}>
          <button type="button" onClick={() => setLightbox(null)} className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
          <SignedImage stored={lightbox} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
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
