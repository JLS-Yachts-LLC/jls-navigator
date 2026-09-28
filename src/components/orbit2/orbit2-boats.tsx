/**
 * Orbit 2 — Managed Boats.
 *
 * The dashboard: three filter tabs over the fleet (Total Vessels / Maintenance
 * / Defects & Repairs), a vessel card grid, and the "+ Add New Boat" wizard.
 * Selecting a boat hands off to Orbit2BoatDetail (its own file — the detail
 * screen, with the vessel spec, documents, DMA/FMA/RYA compliance, Jobs board
 * and Inventory List, is a page in its own right, not a tab of this one).
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Ship } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SignedImage } from "@/components/ui/signed-file";
import { storageRef } from "@/lib/signed-url";
import { guardUploadFile, uploadContentType } from "@/lib/upload-guard";
import { fetchAllRows } from "@/lib/fetch-all";
import { ACTIVE_BOAT_STATUSES } from "./orbit2-constants";
import {
  ORBIT2_BUCKET, INVENTORY_UNITS,
  type Orbit2Boat, type Orbit2BoatTask, type Orbit2BoatDocument, type Orbit2BoatInventoryItem,
} from "./orbit2-data";
import { Field, inputCls } from "./orbit2-fields";
import { Orbit2BoatDetail } from "./orbit2-boat-detail";

const sb = supabase as any;

/** The yacht row a new boat can inherit its spec fields from — Vessel Overview. */
type YachtOption = {
  id: string;
  vessel_name: string;
  vessel_type: string | null;
  mmsi: string | null;
  built_year: number | null;
  breadth_m: number | null;
  length_overall_m: number | null;
  max_guests: number | null;
  vessel_image: string | null;
};

type Filter = "all" | "maintenance" | "defect";

export function Orbit2Boats({
  boats, boatTasks, boatDocuments, boatInventory, loading, reload,
}: {
  boats: Orbit2Boat[];
  boatTasks: Orbit2BoatTask[];
  boatDocuments: Orbit2BoatDocument[];
  boatInventory: Orbit2BoatInventoryItem[];
  loading: boolean;
  reload: () => Promise<void> | void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);

  const activeByBoat = useMemo(() => {
    const m = new Map<string, { maintenance: number; defect: number }>();
    for (const t of boatTasks) {
      if (!ACTIVE_BOAT_STATUSES.includes(t.status)) continue;
      const c = m.get(t.boat_id) ?? { maintenance: 0, defect: 0 };
      c[t.kind === "defect" ? "defect" : "maintenance"] += 1;
      m.set(t.boat_id, c);
    }
    return m;
  }, [boatTasks]);

  const counts = useMemo(() => {
    let maintenance = 0, defect = 0;
    for (const c of activeByBoat.values()) {
      if (c.maintenance > 0) maintenance += 1;
      if (c.defect > 0) defect += 1;
    }
    return { all: boats.length, maintenance, defect };
  }, [activeByBoat, boats.length]);

  const filtered = useMemo(() => {
    if (filter === "all") return boats;
    return boats.filter((b) => (activeByBoat.get(b.id)?.[filter] ?? 0) > 0);
  }, [boats, activeByBoat, filter]);

  const selected = selectedId ? boats.find((b) => b.id === selectedId) ?? null : null;

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (selected) {
    return (
      <Orbit2BoatDetail
        boat={selected}
        tasks={boatTasks.filter((t) => t.boat_id === selected.id)}
        documents={boatDocuments.filter((d) => d.boat_id === selected.id)}
        inventory={boatInventory.filter((i) => i.boat_id === selected.id)}
        onBack={() => setSelectedId(null)}
        reload={reload}
      />
    );
  }

  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card/50 p-1">
          {([
            ["all", `Total Vessel: ${counts.all}`],
            ["maintenance", `Maintenance: ${counts.maintenance}`],
            ["defect", `Defects & Repairs: ${counts.defect}`],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={cn("rounded-md px-3 py-1.5 text-[15px] font-medium transition",
                filter === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[15px] font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Add New Boat
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-[15px] text-muted-foreground">
          <Ship className="h-8 w-8 opacity-40" />
          {boats.length === 0 ? "No boats under management yet." : "No boats match this filter."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((b) => {
            const c = activeByBoat.get(b.id) ?? { maintenance: 0, defect: 0 };
            return (
              <button key={b.id} onClick={() => setSelectedId(b.id)}
                className="flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition hover:border-primary/50 hover:shadow-sm">
                <div className="flex aspect-video items-center justify-center bg-muted/30">
                  {b.image_ref
                    ? <SignedImage stored={b.image_ref} alt={b.name} className="h-full w-full object-cover" />
                    : <Ship className="h-8 w-8 text-muted-foreground/40" />}
                </div>
                <div className="space-y-1.5 p-3">
                  <div className="truncate text-[15px] font-semibold">{b.name}</div>
                  <div className="truncate text-[14px] text-muted-foreground">
                    {[b.client_name, b.boat_type].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {(c.maintenance > 0 || c.defect > 0) ? (
                    <div className="flex flex-wrap gap-1.5 pt-0.5 text-[13px]">
                      {c.maintenance > 0 && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-600">{c.maintenance} maintenance</span>
                      )}
                      {c.defect > 0 && (
                        <span className="rounded-full bg-orange-500/15 px-2 py-0.5 font-medium text-orange-600">{c.defect} defect{c.defect === 1 ? "" : "s"}</span>
                      )}
                    </div>
                  ) : (
                    <div className="pt-0.5 text-[13px] text-emerald-600">No open jobs</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {adding && (
        <AddBoatWizard
          onDone={() => setAdding(false)}
          onCreated={(id) => { setAdding(false); void reload(); setSelectedId(id); }}
          reload={reload}
        />
      )}
    </div>
  );
}

// ── Add New Boat wizard ──────────────────────────────────────────────────────

type SpecForm = {
  name: string;
  client_name: string;
  boat_type: string;
  hull_number: string;
  hull_material: string;
  year_of_build: string;
  max_beam_m: string;
  max_length_m: string;
  max_passengers: string;
  mmsi: string;
  image_ref: string | null;
  inherited_yacht_id: string | null;
};

const emptySpec: SpecForm = {
  name: "", client_name: "", boat_type: "", hull_number: "", hull_material: "",
  year_of_build: "", max_beam_m: "", max_length_m: "", max_passengers: "", mmsi: "",
  image_ref: null, inherited_yacht_id: null,
};

/**
 * Details → creates the boat; Inventory List → bulk-initializes stock against
 * it. Documents, DMA/FMA/RYA compliance and the Jobs board all need a real
 * boat_id to attach to, so — same as every other Orbit 2 record — they live
 * on the detail page once the boat exists, not crammed into this modal.
 */
function AddBoatWizard({
  onDone, onCreated, reload,
}: { onDone: () => void; onCreated: (boatId: string) => void; reload: () => Promise<void> | void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<"details" | "inventory">("details");
  const [form, setForm] = useState<SpecForm>(emptySpec);
  const [yachts, setYachts] = useState<YachtOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [rows, setRows] = useState<{ item: string; qty: string; unit: string }[]>([{ item: "", qty: "", unit: "Pcs" }]);
  const [busyImage, setBusyImage] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await fetchAllRows<YachtOption>(() =>
        sb.from("yachts").select("id, vessel_name, vessel_type, mmsi, built_year, breadth_m, length_overall_m, max_guests, vessel_image")
          .eq("archive", false).order("vessel_name"));
      setYachts((data ?? []) as YachtOption[]);
    })();
  }, []);

  const set = <K extends keyof SpecForm>(k: K, v: SpecForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  /** Selecting a yacht fills the spec fields — still editable afterward, per spec. */
  function inheritFrom(yachtId: string) {
    const y = yachts.find((x) => x.id === yachtId);
    if (!y) { set("inherited_yacht_id", null); return; }
    setForm((f) => ({
      ...f,
      name: f.name || y.vessel_name,
      boat_type: y.vessel_type ?? f.boat_type,
      mmsi: y.mmsi ?? f.mmsi,
      year_of_build: y.built_year != null ? String(y.built_year) : f.year_of_build,
      max_beam_m: y.breadth_m != null ? String(y.breadth_m) : f.max_beam_m,
      max_length_m: y.length_overall_m != null ? String(y.length_overall_m) : f.max_length_m,
      max_passengers: y.max_guests != null ? String(y.max_guests) : f.max_passengers,
      image_ref: f.image_ref ?? (y.vessel_image || null),
      inherited_yacht_id: y.id,
    }));
  }

  async function pickImage(file: File | undefined) {
    if (!file) return;
    if (!guardUploadFile(file, { accepts: "Use an image." })) return;
    if (!/^image\//.test(file.type || "")) { toast.error("Use an image file."); return; }
    setBusyImage(true);
    try {
      const path = `orbit2/boats/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await supabase.storage.from(ORBIT2_BUCKET).upload(path, file, { contentType: uploadContentType(file), upsert: false });
      if (error) throw error;
      set("image_ref", storageRef(ORBIT2_BUCKET, path));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusyImage(false);
    }
  }

  async function createBoat() {
    if (!form.name.trim()) { toast.error("The boat needs a name."); return; }
    setSaving(true);
    try {
      const { data, error } = await sb.from("orbit2_boats").insert({
        name: form.name.trim(),
        client_name: form.client_name.trim() || null,
        boat_type: form.boat_type.trim() || null,
        hull_number: form.hull_number.trim() || null,
        hull_material: form.hull_material.trim() || null,
        year_of_build: form.year_of_build ? Number(form.year_of_build) : null,
        max_beam_m: form.max_beam_m ? Number(form.max_beam_m) : null,
        max_length_m: form.max_length_m ? Number(form.max_length_m) : null,
        max_passengers: form.max_passengers ? Number(form.max_passengers) : null,
        mmsi: form.mmsi.trim() || null,
        image_ref: form.image_ref,
        inherited_yacht_id: form.inherited_yacht_id,
        created_by: user?.id ?? null,
      }).select("id").single();
      if (error) throw error;
      toast.success(`${form.name} added`);
      setCreatedId(data.id);
      await reload();
      setTab("inventory");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function finishWithInventory() {
    if (!createdId) { onDone(); return; }
    const items = rows.filter((r) => r.item.trim());
    if (items.length === 0) { onCreated(createdId); return; }
    setSaving(true);
    try {
      const payload = items.map((r) => ({
        boat_id: createdId, item: r.item.trim(),
        qty: r.qty ? Number(r.qty) : null, unit: r.unit || null,
      }));
      const { error } = await sb.from("orbit2_boat_inventory").insert(payload);
      if (error) throw error;
      onCreated(createdId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the inventory rows");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={createdId ? undefined : onDone}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 border-b border-border px-5 pt-4">
          {(["details", "inventory"] as const).map((t) => (
            <button key={t} disabled={t === "inventory" && !createdId} onClick={() => createdId && setTab(t)}
              className={cn("rounded-t-md px-3 py-2 text-[15px] font-semibold transition disabled:opacity-40",
                tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:bg-accent")}>
              {t === "details" ? "Details" : "Inventory List"}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {tab === "details" ? (
            <div className="space-y-4">
              <Field label="Select Vessel" hint="Inherits its spec from Vessel Overview — still editable after">
                <select className={inputCls} value={form.inherited_yacht_id ?? ""} onChange={(e) => inheritFrom(e.target.value)}>
                  <option value="">— Enter manually —</option>
                  {yachts.map((y) => <option key={y.id} value={y.id}>{y.vessel_name}</option>)}
                </select>
              </Field>

              <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Boat name *">
                    <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} />
                  </Field>
                  <Field label="Client">
                    <input className={inputCls} value={form.client_name} onChange={(e) => set("client_name", e.target.value)} />
                  </Field>
                </div>
                <Field label="Image">
                  <label className="flex h-[76px] cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/20 hover:bg-muted/30">
                    {busyImage ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      : form.image_ref ? <SignedImage stored={form.image_ref} alt="" className="h-full w-full object-cover" />
                      : <span className="text-[13px] text-muted-foreground">Upload</span>}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => void pickImage(e.target.files?.[0])} />
                  </label>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Vessel Type"><input className={inputCls} value={form.boat_type} onChange={(e) => set("boat_type", e.target.value)} /></Field>
                <Field label="Hull Number"><input className={inputCls} value={form.hull_number} onChange={(e) => set("hull_number", e.target.value)} /></Field>
                <Field label="Hull Material"><input className={inputCls} value={form.hull_material} onChange={(e) => set("hull_material", e.target.value)} /></Field>
                <Field label="Year of Build"><input className={inputCls} type="number" value={form.year_of_build} onChange={(e) => set("year_of_build", e.target.value)} /></Field>
                <Field label="Maximum Beam (m)"><input className={inputCls} type="number" step="any" value={form.max_beam_m} onChange={(e) => set("max_beam_m", e.target.value)} /></Field>
                <Field label="Maximum Length (m)"><input className={inputCls} type="number" step="any" value={form.max_length_m} onChange={(e) => set("max_length_m", e.target.value)} /></Field>
                <Field label="Max Passenger"><input className={inputCls} type="number" value={form.max_passengers} onChange={(e) => set("max_passengers", e.target.value)} /></Field>
                <Field label="MMSI"><input className={inputCls} value={form.mmsi} onChange={(e) => set("mmsi", e.target.value)} /></Field>
              </div>

              <p className="text-[14px] text-muted-foreground">
                Document categories, DMA/FMA/RYA compliance and supplementary documents are added on the boat's page once it's created.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[14px] text-muted-foreground">Bulk-initialize on-board equipment and stores. You can add more later from the boat's page.</p>
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_110px] gap-2">
                    <input className={inputCls} placeholder="Item" value={r.item}
                      onChange={(e) => setRows((prev) => prev.map((x, j) => j === i ? { ...x, item: e.target.value } : x))} />
                    <input className={inputCls} placeholder="Qty" type="number" value={r.qty}
                      onChange={(e) => setRows((prev) => prev.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
                    <select className={inputCls} value={r.unit}
                      onChange={(e) => setRows((prev) => prev.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))}>
                      {INVENTORY_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setRows((prev) => [...prev, { item: "", qty: "", unit: "Pcs" }])}
                className="text-[14px] font-medium text-primary hover:underline">+ Add More Item</button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onDone} disabled={saving} className="rounded-md bg-[#E05252] px-5 py-2 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50">Cancel</button>
          {tab === "details" ? (
            <button onClick={() => void createBoat()} disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-[#3FA76A] px-5 py-2 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          ) : (
            <button onClick={() => void finishWithInventory()} disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-[#3FA76A] px-5 py-2 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
