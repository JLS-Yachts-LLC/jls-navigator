/**
 * OrbitBoatsHub — ORBIT Small Boat Management entry point for the New
 * View. The go-live spec shipped BoatStatusHome/DailyChecklistForm/
 * DefectReportForm assuming a boatId is already chosen, but never built
 * the picker itself, or any way to create a boat (only update/log-hours
 * functions existed). Both are added here: a boat list (from
 * v_orbit_boat_home) with a quick-create dialog, then list <-> status
 * <-> (checklist | defect report) via local state, mirroring
 * PortCallsHub/OrbitHub's list<->detail pattern.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Ship, Plus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BoatStatusHome } from "./boat-status-home";
import { DailyChecklistForm } from "./daily-checklist-form";
import { DefectReportForm } from "./defect-report-form";

const db = () => supabase as any;

const BOAT_TYPES = ["tender", "chase_boat", "rib", "crew_boat", "work_boat", "patrol_vessel", "day_boat", "sailing_yacht", "owner_tender"];
const FUEL_TYPES = ["petrol", "diesel", "electric", "hybrid"];
const BOAT_TYPE_LABEL: Record<string, string> = {
  tender: "Tender", chase_boat: "Chase Boat", rib: "RIB", crew_boat: "Crew Boat", work_boat: "Work Boat",
  patrol_vessel: "Patrol Vessel", day_boat: "Day Boat", sailing_yacht: "Sailing Yacht", owner_tender: "Owner Tender",
};
const STATUS_DOT: Record<string, string> = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500" };

type Boat = {
  boat_id: string; name: string; boat_type: string | null; engine_hours: number;
  open_jobs: number; outstanding_defects: number; status: "green" | "amber" | "red";
};

type View =
  | { mode: "list" }
  | { mode: "status"; boatId: string; hasTrailer: boolean }
  | { mode: "checklist"; boatId: string; hasTrailer: boolean }
  | { mode: "defect"; boatId: string; hasTrailer: boolean };

const EMPTY_FORM = {
  name: "", boat_type: "Tender", length_m: "", manufacturer: "", model: "", year: "",
  engine: "", fuel_type: "diesel", has_trailer: false, assigned_department: "",
};

/**
 * The nine types below are suggestions, not the whole world — the list of tender
 * and vessel types is effectively endless, so the field takes free text. Anything
 * matching a known type (by slug or by label) is stored as that type's slug so it
 * still groups with the existing boats; anything else is kept exactly as typed.
 */
function normaliseBoatType(input: string): string {
  const v = input.trim();
  if (!v) return "";
  const known = BOAT_TYPES.find(
    (t) => t === v.toLowerCase() || BOAT_TYPE_LABEL[t].toLowerCase() === v.toLowerCase(),
  );
  return known ?? v;
}

export function OrbitBoatsHub() {
  const [view, setView] = useState<View>({ mode: "list" });
  const [boats, setBoats] = useState<Boat[]>([]);
  const [trailerFlags, setTrailerFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState(false);

  useEffect(() => { void load(); }, []);
  async function load() {
    setLoading(true);
    const [home, boatsRaw] = await Promise.all([
      db().from("v_orbit_boat_home").select("*").order("name"),
      db().from("orbit_boats").select("id, has_trailer"),
    ]);
    if (home.error) toast.error(home.error.message); else setBoats(home.data ?? []);
    setTrailerFlags(Object.fromEntries((boatsRaw.data ?? []).map((b: any) => [b.id, b.has_trailer])));
    setLoading(false);
  }

  /**
   * Retire, not delete: the boat drops off the hub (v_orbit_boat_home filters on
   * is_active) while its jobs, defects and checklist history stay in place. Boats
   * previously had no removal at all, so one added in error was stuck for good.
   */
  async function handleRetire(b: Boat) {
    if (!confirm(`Remove "${b.name}" from the boats hub?\n\nIts jobs, defects and checklist history are kept, and an admin can put it back.`)) return;
    const { error } = await db().rpc("retire_orbit_boat", { p_boat_id: b.boat_id });
    if (error) { toast.error(error.message); return; }
    toast.success(`${b.name} removed`);
    await load();
  }

  async function handleCreate() {
    if (!form.name.trim()) { toast.error("Boat name is required"); return; }
    setBusy(true);
    const { error } = await db().rpc("create_orbit_boat", {
      p_boat: {
        name: form.name.trim(), boat_type: normaliseBoatType(form.boat_type), length_m: form.length_m,
        manufacturer: form.manufacturer, model: form.model, year: form.year,
        engine: form.engine, fuel_type: form.fuel_type, has_trailer: form.has_trailer,
        assigned_department: form.assigned_department,
      },
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Boat added");
    setCreateOpen(false);
    setForm({ ...EMPTY_FORM });
    await load();
  }

  if (view.mode === "status") {
    return (
      <BoatStatusHome
        boatId={view.boatId}
        onBack={() => { setView({ mode: "list" }); void load(); }}
        onStartChecklist={() => setView({ mode: "checklist", boatId: view.boatId, hasTrailer: view.hasTrailer })}
        onReportDefect={() => setView({ mode: "defect", boatId: view.boatId, hasTrailer: view.hasTrailer })}
      />
    );
  }
  if (view.mode === "checklist") {
    return (
      <DailyChecklistForm
        boatId={view.boatId}
        hasTrailer={view.hasTrailer}
        onBack={() => setView({ mode: "status", boatId: view.boatId, hasTrailer: view.hasTrailer })}
        onSubmitted={() => setView({ mode: "status", boatId: view.boatId, hasTrailer: view.hasTrailer })}
      />
    );
  }
  if (view.mode === "defect") {
    return (
      <DefectReportForm
        boatId={view.boatId}
        onBack={() => setView({ mode: "status", boatId: view.boatId, hasTrailer: view.hasTrailer })}
        onSubmitted={() => setView({ mode: "status", boatId: view.boatId, hasTrailer: view.hasTrailer })}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Operations</div>
          <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
            <Ship className="h-5 w-5 text-primary" /> Small Boats
          </h1>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="h-9 gap-1.5 px-3.5 font-medium shadow-sm">
          <Plus className="h-3.5 w-3.5" /> Add Boat
        </Button>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5">
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : boats.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Ship className="h-8 w-8 opacity-30" />
            <p className="text-sm">No boats yet. Add your first tender, RIB, or workboat.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {boats.map((b) => (
              <div key={b.boat_id} className="group relative">
              <button
                onClick={() => setView({ mode: "status", boatId: b.boat_id, hasTrailer: trailerFlags[b.boat_id] ?? false })}
                className="w-full rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/30 hover:shadow-sm"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium">{b.name}</span>
                  <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_DOT[b.status])} />
                </div>
                <p className="mb-2 text-xs text-muted-foreground">{BOAT_TYPE_LABEL[b.boat_type ?? ""] ?? b.boat_type ?? "—"}</p>
                <div className="flex gap-4 text-[11px] text-muted-foreground">
                  <span>{b.engine_hours.toFixed(0)} hrs</span>
                  <span>{b.open_jobs} job{b.open_jobs === 1 ? "" : "s"}</span>
                  <span>{b.outstanding_defects} defect{b.outstanding_defects === 1 ? "" : "s"}</span>
                </div>
              </button>
              {/* Sibling, not nested — a button inside the card button is invalid
                  markup and would swallow the click that opens the boat. */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRetire(b)}
                title={`Remove ${b.name} from the hub`}
                className="absolute bottom-2 right-2 h-7 w-7 p-0 text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add boat</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Name <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="h-9" placeholder="e.g. Tender 1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Boat type</Label>
                <Input
                  value={form.boat_type}
                  onChange={(e) => setForm((f) => ({ ...f, boat_type: e.target.value }))}
                  list="orbit-boat-types"
                  className="h-9"
                  placeholder="Pick one or type your own"
                  autoComplete="off"
                />
                <datalist id="orbit-boat-types">
                  {BOAT_TYPES.map((t) => <option key={t} value={BOAT_TYPE_LABEL[t]} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fuel type</Label>
                <Select value={form.fuel_type} onValueChange={(v) => setForm((f) => ({ ...f, fuel_type: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{FUEL_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Length (m)</Label>
                <Input type="number" step="0.1" value={form.length_m} onChange={(e) => setForm((f) => ({ ...f, length_m: e.target.value }))} className="h-9" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Manufacturer</Label>
                <Input value={form.manufacturer} onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))} className="h-9" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Model</Label>
                <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} className="h-9" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Year</Label>
                <Input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} className="h-9" /></div>
              <div className="space-y-1.5 col-span-2"><Label className="text-xs">Engine</Label>
                <Input value={form.engine} onChange={(e) => setForm((f) => ({ ...f, engine: e.target.value }))} className="h-9" placeholder="e.g. Twin Yamaha 350hp" /></div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Assigned department</Label>
              <Input value={form.assigned_department} onChange={(e) => setForm((f) => ({ ...f, assigned_department: e.target.value }))} className="h-9" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.has_trailer} onChange={(e) => setForm((f) => ({ ...f, has_trailer: e.target.checked }))} className="h-4 w-4" />
              Has trailer
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleCreate} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Add boat</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default OrbitBoatsHub;
