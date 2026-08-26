/**
 * Vehicle Maintenance — tap the 3D vehicle to record damage, and complete the
 * JLS Vehicle Condition Report digitally (the paper template's damage key,
 * service checklist and signature, verbatim).
 *
 * Touch-first: one finger orbits, pinch zooms, a tap on a panel opens the
 * damage form (bottom sheet on phones, side panel on desktop). The model
 * reshapes to the vehicle's body type — coupe, sedan, estate, pickup or van.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import type * as THREE from "three";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Car, Loader2, X, Check, Wrench, ClipboardCheck, Camera, RotateCcw, CircleDot, Eraser, FileDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  VehicleModel, DAMAGE_KEY, PANEL_LABELS, SEVERITY_COLORS,
  type BodyType, type DamageKind, type Severity, type Marker,
} from "./car-model";

type Vehicle = {
  id: string; make: string; model: string; registration: string | null;
  color: string | null; mileage: number; body_type: BodyType; chassis_no: string | null;
};
type Damage = {
  id: string; vehicle_id: string; panel: string; point: { x: number; y: number; z: number } | null;
  kind: DamageKind; severity: Severity; note: string | null; photo_url: string | null;
  resolved_at: string | null; created_at: string; condition_report_id: string | null;
};
type ServiceRequest = {
  id: string; vehicle_id: string; driver_name: string; request_type: string;
  urgency: string; description: string | null; photo_url: string | null;
  status: "open" | "in_progress" | "done"; created_at: string;
};
type Report = {
  id: string; vehicle_id: string; driver_name: string; mileage: number | null;
  date_in: string; date_out: string | null; next_service: string | null;
  services: string[]; comments: string | null; signature: string | null;
  status: "open" | "completed"; created_at: string;
};

const BODY_TYPES: { key: BodyType; label: string }[] = [
  { key: "coupe", label: "Coupé" }, { key: "sedan", label: "Sedan" }, { key: "estate", label: "Estate" },
  { key: "pickup", label: "Pickup" }, { key: "van", label: "Van" },
];

// The paper template's "Service Needed" checklist, verbatim.
const SERVICES = [
  "Change Oil & Filter", "Service Brakes", "Repair Tyres", "Replace Fuel Filter",
  "Replace Brakes", "Replace Battery", "Replace Air Filter", "Replace Lights/Indicators",
  "10,000 KM Service", "Check all Fluids", "Rotate Tyres", "Replace Wiper Blades",
  "Check Belts/Hoses", "Replace Tyres", "Other (see comments)",
];

const REQUEST_TYPES = [
  { key: "mechanical", label: "Mechanical" }, { key: "electrical", label: "Electrical" },
  { key: "bodywork", label: "Bodywork" }, { key: "tyres", label: "Tyres" },
  { key: "service", label: "Service / Maintenance" }, { key: "legal", label: "Registration / Legal" },
  { key: "other", label: "Other" },
];
// The old PowerApp's urgency options, kept verbatim.
const URGENCIES = [
  { key: "asap", label: "ASAP", color: "#ef4444" },
  { key: "when_available", label: "When available", color: "#38bdf8" },
  { key: "next_service", label: "Next service", color: "#eab308" },
  { key: "legal_requirement", label: "Legal Requirement", color: "#a855f7" },
];

const PAINT: Record<string, string> = {
  white: "#e8eaed", black: "#23262b", silver: "#aab3bd", grey: "#78828c", gray: "#78828c",
  blue: "#2563eb", red: "#dc2626", green: "#16a34a", yellow: "#f59e0b", orange: "#ea580c",
  brown: "#8b5e3c", gold: "#d4a017", maroon: "#7f1d1d",
};
const paintFor = (color: string | null) => {
  const c = (color ?? "").toLowerCase();
  for (const [name, hex] of Object.entries(PAINT)) if (c.includes(name)) return hex;
  return "#7d98b3";
};
const fmtDate = (d: string) => new Date(d.length === 10 ? d + "T00:00" : d)
  .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

// ── Signature pad ───────────────────────────────────────────────────────────────

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (ref.current!.width / r.width), y: (e.clientY - r.top) * (ref.current!.height / r.height) };
  };
  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    ref.current!.setPointerCapture(e.pointerId);
    const ctx = ref.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    ctx.strokeStyle = "#e5f0fb"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    const { x, y } = pos(e);
    ctx.lineTo(x, y); ctx.stroke();
    hasInk.current = true;
  };
  const end = () => {
    drawing.current = false;
    if (hasInk.current) onChange(ref.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    hasInk.current = false;
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={ref} width={560} height={160}
        className="w-full rounded-lg border border-dashed border-border bg-background"
        style={{ touchAction: "none", height: 120 }}
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
      />
      <button type="button" onClick={clear}
        className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
        <Eraser className="h-3 w-3" /> Clear signature
      </button>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export function VehicleMaintenancePage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string>("");
  const [damage, setDamage] = useState<Damage[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Tap → pending damage entry
  const [pending, setPending] = useState<{ panel: string; point: THREE.Vector3 } | null>(null);
  const [kind, setKind] = useState<DamageKind>("scratch");
  const [severity, setSeverity] = useState<Severity>("minor");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  // Condition report form
  const [reportOpen, setReportOpen] = useState(false);
  const [rDriver, setRDriver] = useState("");
  const [rMileage, setRMileage] = useState("");
  const [rNextService, setRNextService] = useState("");
  const [rServices, setRServices] = useState<Set<string>>(new Set());
  const [rComments, setRComments] = useState("");
  const [rSignature, setRSignature] = useState<string | null>(null);

  // Service request form
  const [srOpen, setSrOpen] = useState(false);
  const [srType, setSrType] = useState("mechanical");
  const [srUrgency, setSrUrgency] = useState("when_available");
  const [srDesc, setSrDesc] = useState("");
  const [srDriver, setSrDriver] = useState("");
  const [srPhoto, setSrPhoto] = useState<File | null>(null);

  const vehicle = vehicles.find(v => v.id === vehicleId) ?? null;
  const openReport = reports.find(r => r.status === "open") ?? null;

  const load = useCallback(async () => {
    const db = supabase as any;
    const { data: v } = await db.from("crew_vehicles")
      .select("id, make, model, registration, color, mileage, body_type, chassis_no").order("make");
    setVehicles((v ?? []) as Vehicle[]);
    setVehicleId(prev => prev || (v?.[0]?.id ?? ""));
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const loadVehicleData = useCallback(async () => {
    if (!vehicleId) return;
    const db = supabase as any;
    const [{ data: d }, { data: r }, { data: sr }] = await Promise.all([
      db.from("vehicle_damage_reports").select("*").eq("vehicle_id", vehicleId).order("created_at", { ascending: false }),
      db.from("vehicle_condition_reports").select("*").eq("vehicle_id", vehicleId).order("created_at", { ascending: false }).limit(20),
      db.from("vehicle_service_requests").select("*").eq("vehicle_id", vehicleId).order("created_at", { ascending: false }).limit(30),
    ]);
    setDamage((d ?? []) as Damage[]);
    setReports((r ?? []) as Report[]);
    setRequests((sr ?? []) as ServiceRequest[]);
  }, [vehicleId]);
  useEffect(() => { void loadVehicleData(); }, [loadVehicleData]);

  const openDamage = useMemo(() => damage.filter(d => !d.resolved_at), [damage]);
  const markers: Marker[] = useMemo(
    () => openDamage.map(d => ({ id: d.id, panel: d.panel, point: d.point, kind: d.kind, severity: d.severity })),
    [openDamage],
  );
  const damagedPanels = useMemo(() => {
    const rank = { minor: 1, moderate: 2, severe: 3 };
    const m: Record<string, Severity> = {};
    for (const d of openDamage) if (!m[d.panel] || rank[d.severity] > rank[m[d.panel]]) m[d.panel] = d.severity;
    return m;
  }, [openDamage]);

  function onPanelTap(panel: string, point: THREE.Vector3) {
    setPending({ panel, point });
    setKind("scratch"); setSeverity("minor"); setNote(""); setPhoto(null);
  }

  async function saveDamage() {
    if (!pending || !vehicle) return;
    setSaving(true);
    try {
      let photoUrl: string | null = null;
      if (photo) {
        const path = `vehicles/damage/${vehicle.id}/${Date.now()}-${photo.name}`;
        const { error } = await supabase.storage.from("permit-documents").upload(path, photo, { upsert: true });
        if (error) throw error;
        photoUrl = supabase.storage.from("permit-documents").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await (supabase as any).from("vehicle_damage_reports").insert([{
        vehicle_id: vehicle.id, panel: pending.panel,
        point: { x: pending.point.x, y: pending.point.y, z: pending.point.z },
        kind, severity, note: note.trim() || null, photo_url: photoUrl,
        reported_by: user?.id ?? null,
        condition_report_id: openReport?.id ?? null,
      }]);
      if (error) throw error;
      toast.success(`${DAMAGE_KEY[kind].label} recorded on ${PANEL_LABELS[pending.panel] ?? pending.panel}`);
      setPending(null);
      await loadVehicleData();
    } catch (e: any) { toast.error(e?.message ?? "Could not save"); }
    finally { setSaving(false); }
  }

  async function resolveDamage(d: Damage) {
    const { error } = await (supabase as any).from("vehicle_damage_reports")
      .update({ resolved_at: new Date().toISOString() }).eq("id", d.id);
    if (error) toast.error(error.message); else { toast.success("Marked as fixed"); await loadVehicleData(); }
  }

  function startReport() {
    setRDriver(user?.email?.split("@")[0] ?? "");
    setRMileage(vehicle?.mileage ? String(vehicle.mileage) : "");
    setRNextService(""); setRServices(new Set()); setRComments(""); setRSignature(null);
    setReportOpen(true);
  }

  async function saveReport() {
    if (!vehicle || !rDriver.trim()) { toast.error("Driver name is required"); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("vehicle_condition_reports").insert([{
        vehicle_id: vehicle.id, driver_name: rDriver.trim(),
        mileage: rMileage ? Number(rMileage) : null,
        next_service: rNextService.trim() || null,
        services: [...rServices], comments: rComments.trim() || null,
        signature: rSignature, created_by: user?.id ?? null,
      }]);
      if (error) throw error;
      if (rMileage && Number(rMileage) > (vehicle.mileage ?? 0)) {
        await (supabase as any).from("crew_vehicles").update({ mileage: Number(rMileage) }).eq("id", vehicle.id);
      }
      toast.success("Condition report started — tap the vehicle to record any damage, then complete it");
      setReportOpen(false);
      await loadVehicleData();
    } catch (e: any) { toast.error(e?.message ?? "Could not save the report"); }
    finally { setSaving(false); }
  }

  async function completeReport() {
    if (!openReport) return;
    const { error } = await (supabase as any).from("vehicle_condition_reports").update({
      status: "completed", date_out: new Date().toISOString().slice(0, 10), completed_at: new Date().toISOString(),
    }).eq("id", openReport.id);
    if (error) toast.error(error.message);
    else { toast.success("Condition report completed"); await loadVehicleData(); }
  }

  async function saveServiceRequest() {
    if (!vehicle || !srDriver.trim()) { toast.error("Driver name is required"); return; }
    setSaving(true);
    try {
      let photoUrl: string | null = null;
      if (srPhoto) {
        const path = `vehicles/service-requests/${vehicle.id}/${Date.now()}-${srPhoto.name}`;
        const { error } = await supabase.storage.from("permit-documents").upload(path, srPhoto, { upsert: true });
        if (error) throw error;
        photoUrl = supabase.storage.from("permit-documents").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await (supabase as any).from("vehicle_service_requests").insert([{
        vehicle_id: vehicle.id, driver_name: srDriver.trim(), request_type: srType,
        urgency: srUrgency, description: srDesc.trim() || null, photo_url: photoUrl,
        created_by: user?.id ?? null,
      }]);
      if (error) throw error;
      toast.success("Service request submitted");
      setSrOpen(false); setSrDesc(""); setSrPhoto(null);
      await loadVehicleData();
    } catch (e: any) { toast.error(e?.message ?? "Could not submit the request"); }
    finally { setSaving(false); }
  }

  async function advanceRequest(r: ServiceRequest) {
    const next = r.status === "open" ? "in_progress" : "done";
    const { error } = await (supabase as any).from("vehicle_service_requests").update({
      status: next, ...(next === "done" ? { closed_at: new Date().toISOString() } : {}),
    }).eq("id", r.id);
    if (error) toast.error(error.message); else await loadVehicleData();
  }

  async function downloadReportPdf(r: Report) {
    if (!vehicle) return;
    try {
      // pdf-lib loads on demand — keeps it out of the page bundle until used.
      const { buildConditionReportPdf } = await import("@/lib/crew-cab/condition-report-pdf");
      const linked = damage.filter(d => d.condition_report_id === r.id);
      const bytes = await buildConditionReportPdf({
        vehicle: {
          make: vehicle.make, model: vehicle.model, registration: vehicle.registration,
          color: vehicle.color, mileage: r.mileage, chassis_no: vehicle.chassis_no,
        },
        report: r,
        damage: linked.map(d => ({
          panelLabel: PANEL_LABELS[d.panel] ?? d.panel,
          code: DAMAGE_KEY[d.kind]?.code ?? "?",
          kindLabel: DAMAGE_KEY[d.kind]?.label ?? d.kind,
          severity: d.severity, note: d.note,
        })),
        serviceChecklist: SERVICES,
        damageKey: Object.values(DAMAGE_KEY).filter(k => k.code !== "O").map(k => ({ code: k.code, label: k.label })),
      });
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Condition Report - ${vehicle.make} ${vehicle.model} - ${r.date_in}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) { toast.error(e?.message ?? "Could not build the PDF"); }
  }

  async function setBodyType(bt: BodyType) {
    if (!vehicle) return;
    setVehicles(prev => prev.map(v => (v.id === vehicle.id ? { ...v, body_type: bt } : v)));
    const { error } = await (supabase as any).from("crew_vehicles").update({ body_type: bt }).eq("id", vehicle.id);
    if (error) toast.error(error.message);
  }

  // ── Sub-views ────────────────────────────────────────────────────────────────

  const damageForm = pending && (
    <div className={cn(
      "border border-border bg-card p-4",
      isMobile ? "fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl shadow-2xl" : "rounded-xl",
    )}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {PANEL_LABELS[pending.panel] ?? pending.panel}
          <span className="ml-2 text-[11px] font-normal text-muted-foreground">record damage</span>
        </h3>
        <button onClick={() => setPending(null)} className="p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      {/* Damage key — the paper form's letters */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {(Object.keys(DAMAGE_KEY) as DamageKind[]).map(k => (
          <button key={k} onClick={() => setKind(k)}
            className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition",
              kind === k ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground")}>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-bold text-black"
              style={{ background: DAMAGE_KEY[k].color }}>{DAMAGE_KEY[k].code}</span>
            {DAMAGE_KEY[k].label}
          </button>
        ))}
      </div>
      <div className="mb-2 flex gap-1.5">
        {(["minor", "moderate", "severe"] as Severity[]).map(s => (
          <button key={s} onClick={() => setSeverity(s)}
            className={cn("flex-1 rounded-lg border px-2 py-2 text-xs font-medium capitalize transition",
              severity === s ? "border-primary bg-primary/15" : "border-border text-muted-foreground")}
            style={severity === s ? { color: SEVERITY_COLORS[s] } : undefined}>
            {s}
          </button>
        ))}
      </div>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Notes (optional)"
        className="mb-2 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm" />
      <div className="mb-3 flex items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
          <Camera className="h-3.5 w-3.5" /> {photo ? photo.name.slice(0, 24) : "Add photo"}
          <input type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => setPhoto(e.target.files?.[0] ?? null)} />
        </label>
        {photo && <button onClick={() => setPhoto(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>}
      </div>
      <div className="flex gap-2">
        <Button className="h-11 flex-1" disabled={saving} onClick={() => void saveDamage()}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />} Save damage
        </Button>
        <Button variant="outline" className="h-11" onClick={() => setPending(null)}>Cancel</Button>
      </div>
    </div>
  );

  const reportForm = reportOpen && (
    <div className={cn(
      "border border-border bg-card p-4",
      isMobile ? "fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl shadow-2xl" : "rounded-xl",
    )}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Vehicle Condition Report</h3>
        <button onClick={() => setReportOpen(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div><label className="text-[11px] text-muted-foreground">Driver's name *</label>
          <Input className="h-10" value={rDriver} onChange={e => setRDriver(e.target.value)} /></div>
        <div><label className="text-[11px] text-muted-foreground">Mileage (km)</label>
          <Input className="h-10" type="number" inputMode="numeric" value={rMileage} onChange={e => setRMileage(e.target.value)} /></div>
      </div>
      <div className="mb-2"><label className="text-[11px] text-muted-foreground">Next service due (mechanic)</label>
        <Input className="h-10" value={rNextService} onChange={e => setRNextService(e.target.value)} placeholder="e.g. 165,000 km or Oct 2026" /></div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Service needed</p>
      <div className="mb-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {SERVICES.map(sv => (
          <label key={sv} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition",
            rServices.has(sv) ? "border-primary/60 bg-primary/10" : "border-border text-muted-foreground")}>
            <input type="checkbox" checked={rServices.has(sv)}
              onChange={e => setRServices(prev => { const n = new Set(prev); e.target.checked ? n.add(sv) : n.delete(sv); return n; })} />
            {sv}
          </label>
        ))}
      </div>
      <textarea value={rComments} onChange={e => setRComments(e.target.value)} rows={2} placeholder="Comments"
        className="mb-2 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm" />
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Signature</p>
      <SignaturePad onChange={setRSignature} />
      <div className="mt-3 flex gap-2">
        <Button className="h-11 flex-1" disabled={saving} onClick={() => void saveReport()}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-1.5 h-4 w-4" />} Save report
        </Button>
        <Button variant="outline" className="h-11" onClick={() => setReportOpen(false)}>Cancel</Button>
      </div>
    </div>
  );

  const requestForm = srOpen && (
    <div className={cn(
      "border border-border bg-card p-4",
      isMobile ? "fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl shadow-2xl" : "rounded-xl",
    )}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Service Request</h3>
        <button onClick={() => setSrOpen(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="mb-2"><label className="text-[11px] text-muted-foreground">Driver reporting fault *</label>
        <Input className="h-10" value={srDriver} onChange={e => setSrDriver(e.target.value)} /></div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Type of request</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {REQUEST_TYPES.map(t => (
          <button key={t.key} onClick={() => setSrType(t.key)}
            className={cn("rounded-lg border px-2.5 py-2 text-xs font-medium transition",
              srType === t.key ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground")}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">When required to be addressed</p>
      <div className="mb-2 grid grid-cols-2 gap-1.5">
        {URGENCIES.map(u => (
          <button key={u.key} onClick={() => setSrUrgency(u.key)}
            className={cn("rounded-lg border px-2 py-2 text-xs font-medium transition",
              srUrgency === u.key ? "border-primary bg-primary/15" : "border-border text-muted-foreground")}
            style={srUrgency === u.key ? { color: u.color } : undefined}>
            {u.label}
          </button>
        ))}
      </div>
      <textarea value={srDesc} onChange={e => setSrDesc(e.target.value)} rows={3} placeholder="Description & comments"
        className="mb-2 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm" />
      <div className="mb-3 flex items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
          <Camera className="h-3.5 w-3.5" /> {srPhoto ? srPhoto.name.slice(0, 24) : "Add photo"}
          <input type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => setSrPhoto(e.target.files?.[0] ?? null)} />
        </label>
        {srPhoto && <button onClick={() => setSrPhoto(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>}
      </div>
      <div className="flex gap-2">
        <Button className="h-11 flex-1" disabled={saving} onClick={() => void saveServiceRequest()}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wrench className="mr-1.5 h-4 w-4" />} Submit request
        </Button>
        <Button variant="outline" className="h-11" onClick={() => setSrOpen(false)}>Cancel</Button>
      </div>
    </div>
  );

  const sidePanel = (
    <div className="space-y-3">
      {!isMobile && damageForm}
      {!isMobile && reportForm}
      {!isMobile && requestForm}

      {/* Condition report status */}
      {!reportOpen && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Condition Report</h3>
          </div>
          {openReport ? (
            <div className="mt-2 space-y-2 text-xs">
              <p className="text-muted-foreground">
                In progress — {openReport.driver_name}, started {fmtDate(openReport.date_in)}.
                {openReport.services.length > 0 && ` ${openReport.services.length} service item(s) flagged.`}
                {" "}Damage recorded now attaches to this report.
              </p>
              <Button size="sm" className="h-10 w-full" onClick={() => void completeReport()}>
                <Check className="mr-1.5 h-4 w-4" /> Complete report (vehicle checked out)
              </Button>
            </div>
          ) : (
            <div className="mt-2">
              <p className="mb-2 text-xs text-muted-foreground">
                Start the driver's check: details, service checklist and signature — then tap the model to mark any damage.
              </p>
              <Button size="sm" className="h-10 w-full" onClick={startReport} disabled={!vehicle}>
                <ClipboardCheck className="mr-1.5 h-4 w-4" /> Start Condition Report
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Open damage */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <CircleDot className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold">Open damage</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{openDamage.length}</span>
        </div>
        {openDamage.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing recorded — tap a panel on the vehicle to add damage.</p>
        ) : openDamage.map(d => (
          <div key={d.id} className="mb-1.5 flex items-center gap-2 rounded-lg bg-muted/30 px-2.5 py-2 text-xs">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-bold text-black"
              style={{ background: DAMAGE_KEY[d.kind]?.color ?? "#a78bfa" }}>{DAMAGE_KEY[d.kind]?.code ?? "?"}</span>
            <div className="min-w-0 flex-1">
              <span className="font-medium">{PANEL_LABELS[d.panel] ?? d.panel}</span>
              <span className="ml-1.5 capitalize" style={{ color: SEVERITY_COLORS[d.severity] }}>{d.severity}</span>
              {d.note && <p className="truncate text-muted-foreground">{d.note}</p>}
            </div>
            {d.photo_url && <a href={d.photo_url} target="_blank" rel="noreferrer" className="text-primary"><Camera className="h-3.5 w-3.5" /></a>}
            <button onClick={() => void resolveDamage(d)} title="Mark fixed"
              className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition hover:border-emerald-500/50 hover:text-emerald-400">
              Fixed
            </button>
          </div>
        ))}
      </div>

      {/* Service requests */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <Wrench className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Service Requests</h3>
          <Button size="sm" variant="outline" className="ml-auto h-8 gap-1 px-2 text-[11px]"
            onClick={() => { setSrDriver(user?.email?.split("@")[0] ?? ""); setSrOpen(true); }} disabled={!vehicle}>
            <Wrench className="h-3 w-3" /> New request
          </Button>
        </div>
        {requests.filter(r => r.status !== "done").length === 0 ? (
          <p className="text-xs text-muted-foreground">No open requests for this vehicle.</p>
        ) : requests.filter(r => r.status !== "done").map(r => {
          const u = URGENCIES.find(x => x.key === r.urgency);
          return (
            <div key={r.id} className="mb-1.5 rounded-lg bg-muted/30 px-2.5 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-medium capitalize">{REQUEST_TYPES.find(t => t.key === r.request_type)?.label ?? r.request_type}</span>
                {u && <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: u.color, background: u.color + "22" }}>{u.label}</span>}
                {r.status === "in_progress" && <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400">In progress</span>}
                <button onClick={() => void advanceRequest(r)}
                  className="ml-auto rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition hover:border-emerald-500/50 hover:text-emerald-400">
                  {r.status === "open" ? "Start" : "Done"}
                </button>
              </div>
              <p className="mt-0.5 text-muted-foreground">{r.driver_name} · {fmtDate(r.created_at)}</p>
              {r.description && <p className="mt-0.5">{r.description}</p>}
              {r.photo_url && <a href={r.photo_url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-primary"><Camera className="h-3 w-3" /> photo</a>}
            </div>
          );
        })}
      </div>

      {/* Report history */}
      {reports.filter(r => r.status === "completed").length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">Previous reports</h3>
          {reports.filter(r => r.status === "completed").slice(0, 8).map(r => (
            <div key={r.id} className="mb-1.5 rounded-lg bg-muted/30 px-2.5 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.driver_name}</span>
                <span className="text-muted-foreground">{fmtDate(r.date_in)}{r.date_out ? ` → ${fmtDate(r.date_out)}` : ""}</span>
                {r.mileage != null && <span className="ml-auto tabular-nums text-muted-foreground">{r.mileage.toLocaleString()} km</span>}
                <button onClick={() => void downloadReportPdf(r)} title="Download PDF"
                  className={cn("rounded-md border border-border p-1 text-muted-foreground transition hover:border-primary/50 hover:text-primary", r.mileage == null && "ml-auto")}>
                  <FileDown className="h-3.5 w-3.5" />
                </button>
              </div>
              {r.services.length > 0 && <p className="mt-0.5 text-muted-foreground">{r.services.join(" · ")}</p>}
              {r.comments && <p className="mt-0.5 italic text-muted-foreground">{r.comments}</p>}
              {r.signature && <img src={r.signature} alt="signature" className="mt-1 h-8 rounded bg-background/50" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col p-3 sm:p-4">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Wrench className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm font-semibold">Vehicle Maintenance</h2>
        <select value={vehicleId} onChange={e => setVehicleId(e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm sm:max-w-xs">
          {vehicles.map(v => (
            <option key={v.id} value={v.id}>{v.make} {v.model}{v.registration ? ` — ${v.registration}` : ""}</option>
          ))}
        </select>
        <div className="flex gap-1 overflow-x-auto">
          {BODY_TYPES.map(bt => (
            <button key={bt.key} onClick={() => void setBodyType(bt.key)}
              className={cn("shrink-0 rounded-lg border px-2.5 py-2 text-xs font-medium transition",
                vehicle?.body_type === bt.key ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground")}>
              {bt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
      ) : !vehicle ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Car className="h-10 w-10 opacity-30" /><p className="text-sm">No vehicles yet — add one under Vehicles.</p>
        </div>
      ) : (
        <div className={cn("min-h-0 flex-1 gap-3", isMobile ? "flex flex-col overflow-y-auto" : "grid grid-cols-[1fr_400px]")}>
          {/* 3D viewport */}
          <div className={cn("relative overflow-hidden rounded-xl border border-border bg-[#0a1017]",
            isMobile ? "h-[46vh] shrink-0" : "min-h-[560px]")}>
            <Canvas dpr={[1, 2]} camera={{ position: [4.6, 2.8, 4.6], fov: 42 }} style={{ touchAction: "none" }}>
              <ambientLight intensity={0.65} />
              <directionalLight position={[6, 9, 4]} intensity={1.3} />
              <directionalLight position={[-6, 4, -5]} intensity={0.4} />
              <VehicleModel
                bodyType={vehicle.body_type ?? "sedan"}
                paint={paintFor(vehicle.color)}
                markers={markers}
                damagedPanels={damagedPanels}
                selectedPanel={pending?.panel ?? null}
                onPanelTap={onPanelTap}
              />
              <ContactShadows position={[0, 0.01, 0]} opacity={0.5} scale={12} blur={2.2} far={3} />
              <OrbitControls enablePan={false} minDistance={3.2} maxDistance={10} maxPolarAngle={1.5} />
            </Canvas>
            <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/45 px-2.5 py-1.5 text-[11px] text-white/85 backdrop-blur">
              <RotateCcw className="mr-1 inline h-3 w-3" /> Drag to rotate · pinch/scroll to zoom · <b>tap a panel</b> to record damage
            </div>
          </div>

          {/* Panels: below on phone, right column on desktop */}
          <div className={cn(!isMobile && "min-h-0 overflow-y-auto pr-0.5")}>{sidePanel}</div>
        </div>
      )}

      {/* Mobile bottom sheets */}
      {isMobile && damageForm}
      {isMobile && reportForm}
      {isMobile && requestForm}
    </div>
  );
}
