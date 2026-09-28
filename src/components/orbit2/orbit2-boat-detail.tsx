/**
 * Orbit 2 — a single managed boat: vessel spec, document categories, DMA/FMA/RYA
 * compliance, the Jobs board, and the Inventory List. Split out of orbit2-boats.tsx
 * because that file is the fleet-level dashboard and wizard — this is everything
 * that needs a real boat_id to exist.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Loader2, ArrowLeft, Plus, Search, Trash2, X, Ship,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SignedImage, SignedAnchor } from "@/components/ui/signed-file";
import { storageRef } from "@/lib/signed-url";
import { guardUploadFile, uploadContentType } from "@/lib/upload-guard";
import {
  BOAT_TASK_STATUSES, BOAT_JOB_CATEGORIES, boatJobCategoryToKind, kindToBoatJobCategory,
  BOAT_INVENTORY_CONDITIONS, boatInventoryConditionColor,
} from "./orbit2-constants";
import {
  ORBIT2_BUCKET, BOAT_DOC_CATEGORY_LABEL, INVENTORY_UNITS,
  minutesToHhmm, hhmmToMinutes, suggestionsFor,
  type Orbit2Boat, type Orbit2BoatTask, type Orbit2BoatDocument, type Orbit2BoatDocCategory,
  type Orbit2BoatInventoryItem, type Orbit2Note, type Orbit2File,
} from "./orbit2-data";
import { Field, inputCls, Typeahead, TeamPicker, FileSlot, NoteLog, type UploadedFile } from "./orbit2-fields";

const sb = supabase as any;

const CORE_DOC_CATEGORIES: Orbit2BoatDocCategory[] = [
  "vessel_invoice", "builders_certificate", "customs_clearance", "marine_insurance",
  "vhf_radio_licensing", "marine_vessel_license", "berth_agreement",
];
const SUPPLEMENTARY_DOC_CATEGORIES: Orbit2BoatDocCategory[] = [
  "liferaft_certificate", "fire_extinguisher_certificate", "other",
];

export function Orbit2BoatDetail({
  boat, tasks, documents, inventory, onBack, reload,
}: {
  boat: Orbit2Boat;
  tasks: Orbit2BoatTask[];
  documents: Orbit2BoatDocument[];
  inventory: Orbit2BoatInventoryItem[];
  onBack: () => void;
  reload: () => Promise<void> | void;
}) {
  const { user } = useAuth();
  const [section, setSection] = useState<"jobs" | "inventory">("jobs");

  async function patchBoat(patch: Record<string, unknown>) {
    const { error } = await sb.from("orbit2_boats").update(patch).eq("id", boat.id);
    if (error) { toast.error(error.message); return; }
    await reload();
  }

  async function removeBoat() {
    if (!confirm(`Remove ${boat.name}? Its jobs, documents and inventory go with it.`)) return;
    const { error } = await sb.from("orbit2_boats").delete().eq("id", boat.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${boat.name} removed`);
    onBack();
    await reload();
  }

  const docsFor = (cat: Orbit2BoatDocCategory): UploadedFile[] =>
    documents.filter((d) => d.category === cat).map((d) => ({ id: d.id, file_name: d.file_name, storage_ref: d.storage_ref }));

  async function uploadDoc(category: Orbit2BoatDocCategory, file: File, ref: string) {
    const { error } = await sb.from("orbit2_boat_documents").insert({
      boat_id: boat.id, category, file_name: file.name, storage_ref: ref, uploaded_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    await reload();
  }

  async function removeDoc(f: { id: string }) {
    const { error } = await sb.from("orbit2_boat_documents").delete().eq("id", f.id);
    if (error) { toast.error(error.message); return; }
    await reload();
  }

  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[14px] font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All boats
        </button>
        <button onClick={() => void removeBoat()} title={`Remove ${boat.name}`}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* ── Vessel spec ── */}
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-[160px_1fr]">
        <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-muted/30 sm:aspect-square">
          {boat.image_ref
            ? <SignedImage stored={boat.image_ref} alt={boat.name} className="h-full w-full object-cover" />
            : <Ship className="h-8 w-8 text-muted-foreground/40" />}
        </div>
        <div>
          <h2 className="font-display text-[22px] font-semibold tracking-tight">{boat.name}</h2>
          <p className="mb-3 text-[14px] text-muted-foreground">
            {[boat.client_name].filter(Boolean).join(" · ") || "No client recorded"}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-4">
            <SpecField label="Vessel Type" value={boat.boat_type} onSave={(v) => patchBoat({ boat_type: v })} />
            <SpecField label="Hull Number" value={boat.hull_number} onSave={(v) => patchBoat({ hull_number: v })} />
            <SpecField label="Hull Material" value={boat.hull_material} onSave={(v) => patchBoat({ hull_material: v })} />
            <SpecField label="Year of Build" value={boat.year_of_build} type="number" onSave={(v) => patchBoat({ year_of_build: v ? Number(v) : null })} />
            <SpecField label="Max Beam (m)" value={boat.max_beam_m} type="number" onSave={(v) => patchBoat({ max_beam_m: v ? Number(v) : null })} />
            <SpecField label="Max Length (m)" value={boat.max_length_m} type="number" onSave={(v) => patchBoat({ max_length_m: v ? Number(v) : null })} />
            <SpecField label="Max Passenger" value={boat.max_passengers} type="number" onSave={(v) => patchBoat({ max_passengers: v ? Number(v) : null })} />
            <SpecField label="MMSI" value={boat.mmsi} onSave={(v) => patchBoat({ mmsi: v })} />
          </div>
        </div>
      </div>

      {/* ── Document categories ── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 text-[15px] font-semibold">Documents</div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {CORE_DOC_CATEGORIES.map((cat) => (
            <FileSlot key={cat} label={BOAT_DOC_CATEGORY_LABEL[cat]} files={docsFor(cat)}
              onUpload={(f, r) => uploadDoc(cat, f, r)} onRemove={removeDoc} />
          ))}
        </div>
      </div>

      {/* ── DMA / FMA / RYA compliance ── */}
      <div className="grid gap-3 lg:grid-cols-3">
        {(["dma", "fma", "rya"] as const).map((regime) => (
          <ComplianceCard key={regime} regime={regime} boat={boat}
            checklist={docsFor(`${regime}_checklist` as Orbit2BoatDocCategory)}
            onUploadChecklist={(f, r) => uploadDoc(`${regime}_checklist` as Orbit2BoatDocCategory, f, r)}
            onRemoveChecklist={removeDoc}
            onSaveDate={(v) => patchBoat({ [`${regime}_last_inspection`]: v || null })}
            onUploadReport={async (file, ref) => patchBoat({ [`${regime}_report_ref`]: ref })}
            onRemoveReport={() => patchBoat({ [`${regime}_report_ref`]: null })}
          />
        ))}
      </div>

      {/* ── Supplementary documentation ── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 text-[15px] font-semibold">Supplementary Documentation</div>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {SUPPLEMENTARY_DOC_CATEGORIES.map((cat) => (
            <FileSlot key={cat} label={BOAT_DOC_CATEGORY_LABEL[cat]} files={docsFor(cat)}
              onUpload={(f, r) => uploadDoc(cat, f, r)} onRemove={removeDoc} />
          ))}
        </div>
      </div>

      {/* ── Jobs / Inventory ── */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-1 border-b border-border/60 px-4 py-2.5">
          {(["jobs", "inventory"] as const).map((s) => (
            <button key={s} onClick={() => setSection(s)}
              className={cn("rounded-md px-3 py-1.5 text-[15px] font-semibold transition",
                section === s ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent")}>
              {s === "jobs" ? "Jobs" : "Inventory List"}
            </button>
          ))}
        </div>
        {section === "jobs"
          ? <JobsBoard boat={boat} tasks={tasks} reload={reload} />
          : <InventoryBoard boat={boat} inventory={inventory} reload={reload} />}
      </div>
    </div>
  );
}

// ── Small pieces ──────────────────────────────────────────────────────────

/** One vessel-spec field, saved on blur — the boat detail equivalent of the NOC grid's cells. */
function SpecField({
  label, value, onSave, type = "text",
}: { label: string; value: string | number | null; onSave: (v: string) => void; type?: "text" | "number" }) {
  const [v, setV] = useState(value != null ? String(value) : "");
  return (
    <Field label={label}>
      <input className={cn(inputCls, "h-9 py-1 text-[14px]")} type={type} value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== (value != null ? String(value) : "")) onSave(v); }} />
    </Field>
  );
}

function ComplianceCard({
  regime, boat, checklist, onUploadChecklist, onRemoveChecklist, onSaveDate, onUploadReport, onRemoveReport,
}: {
  regime: "dma" | "fma" | "rya";
  boat: Orbit2Boat;
  checklist: UploadedFile[];
  onUploadChecklist: (f: File, ref: string) => Promise<void> | void;
  onRemoveChecklist: (f: UploadedFile) => void;
  onSaveDate: (v: string) => void;
  onUploadReport: (f: File, ref: string) => Promise<void> | void;
  onRemoveReport: () => void;
}) {
  const lastInspection = (boat[`${regime}_last_inspection` as keyof Orbit2Boat] as string | null) ?? "";
  const reportRef = (boat[`${regime}_report_ref` as keyof Orbit2Boat] as string | null) ?? null;
  const [date, setDate] = useState(lastInspection);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 text-[15px] font-semibold uppercase tracking-wide">{regime}</div>
      <Field label="Last Inspection Date" className="mb-2.5">
        <input className={cn(inputCls, "h-9 py-1 text-[14px]")} type="date" value={date}
          onChange={(e) => setDate(e.target.value)}
          onBlur={() => { if (date !== lastInspection) onSaveDate(date); }} />
      </Field>
      <div className="mb-2.5">
        <SingleFileField label="Technical Inspection Pass Report" value={reportRef}
          onUpload={onUploadReport} onRemove={onRemoveReport} />
      </div>
      <FileSlot label="Checklist" files={checklist} onUpload={onUploadChecklist} onRemove={onRemoveChecklist} />
    </div>
  );
}

/** One document reference stored directly on a row (not orbit2_boat_documents) — for
 *  the DMA/FMA/RYA Pass Report, which is one file per regime, not a list. */
function SingleFileField({
  label, value, onUpload, onRemove,
}: { label: string; value: string | null; onUpload: (f: File, ref: string) => Promise<void> | void; onRemove: () => void }) {
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!guardUploadFile(file, { accepts: "Use a PDF or an image." })) return;
    setBusy(true);
    try {
      const path = `orbit2/boats/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await supabase.storage.from(ORBIT2_BUCKET).upload(path, file, { contentType: uploadContentType(file), upsert: false });
      if (error) throw error;
      await onUpload(file, storageRef(ORBIT2_BUCKET, path));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-muted/10 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[14px] font-medium text-muted-foreground">{label}</span>
        <label className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[14px] font-medium text-primary hover:bg-primary/10">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Attach"}
          <input type="file" accept="application/pdf,image/*" className="hidden" disabled={busy} onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
      </div>
      {value ? (
        <div className="flex items-center gap-1.5">
          <SignedAnchor stored={value} className="flex-1 truncate text-[14px] text-primary hover:underline">View report</SignedAnchor>
          <button onClick={onRemove} className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : <p className="text-[14px] text-muted-foreground/70">None attached</p>}
    </div>
  );
}

// ── Jobs board ────────────────────────────────────────────────────────────

function JobsBoard({ boat, tasks, reload }: { boat: Orbit2Boat; tasks: Orbit2BoatTask[]; reload: () => Promise<void> | void }) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  const technicianOptions = useMemo(() => suggestionsFor(tasks.map((t) => t.technician)), [tasks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) =>
      [t.job_no, t.title, t.technician, ...(t.assigned_team ?? [])].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [tasks, query]);

  const editing = editingId && editingId !== "new" ? tasks.find((t) => t.id === editingId) ?? null : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input className={cn(inputCls, "h-9 w-64 py-1 pl-8 text-[15px]")} placeholder="Search jobs"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button onClick={() => setEditingId("new")}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[15px] font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Add Jobs
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-8 text-center text-[15px] text-muted-foreground">
          {tasks.length === 0 ? "No jobs logged yet." : "Nothing matches that search."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-y border-border/60 bg-muted/10">
                {["Job No.", "Category", "Description", "Date", "Time", "Est Time Required", "Assigned Crew", "Technician", "Status"].map((c) => (
                  <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-muted-foreground">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((t) => (
                <tr key={t.id} onClick={() => setEditingId(t.id)} className="cursor-pointer hover:bg-muted/20">
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-primary">{t.job_no ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{kindToBoatJobCategory(t.kind)}</td>
                  <td className="max-w-[16rem] px-3 py-2"><span className="line-clamp-2">{t.title}</span></td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {t.schedule_date ? new Date(`${t.schedule_date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{t.schedule_time?.slice(0, 5) ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{minutesToHhmm(t.est_minutes) || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{(t.assigned_team ?? []).join(", ") || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.technician ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[13px] font-medium",
                      t.status === "Complete" ? "bg-emerald-500/15 text-emerald-600"
                        : t.status === "Ongoing" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingId && (
        <JobEditor boat={boat} existing={editing} technicianOptions={technicianOptions}
          onClose={() => setEditingId(null)}
          onCreated={(id) => setEditingId(id)}
          reload={reload} />
      )}
    </div>
  );
}

type JobForm = {
  category: (typeof BOAT_JOB_CATEGORIES)[number];
  title: string;
  schedule_date: string;
  schedule_time: string;
  est: string;
  team: string[];
  technician: string;
  remarks: string;
  status: string;
};

function JobEditor({
  boat, existing, technicianOptions, onClose, onCreated, reload,
}: {
  boat: Orbit2Boat;
  existing: Orbit2BoatTask | null;
  technicianOptions: string[];
  onClose: () => void;
  onCreated: (id: string) => void;
  reload: () => Promise<void> | void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<JobForm>(existing ? {
    category: kindToBoatJobCategory(existing.kind),
    title: existing.title,
    schedule_date: existing.schedule_date ?? "",
    schedule_time: (existing.schedule_time ?? "").slice(0, 5),
    est: minutesToHhmm(existing.est_minutes),
    team: existing.assigned_team ?? [],
    technician: existing.technician ?? "",
    remarks: existing.remarks ?? "",
    status: existing.status,
  } : {
    category: "Maintenance", title: "", schedule_date: "", schedule_time: "", est: "",
    team: [], technician: "", remarks: "", status: "Pending",
  });
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<Orbit2Note[]>([]);
  const [files, setFiles] = useState<Orbit2File[]>([]);

  useEffect(() => {
    let on = true;
    if (!existing) { setNotes([]); setFiles([]); return; }
    void (async () => {
      const [n, f] = await Promise.all([
        sb.from("orbit2_notes").select("*").eq("boat_task_id", existing.id).order("created_at"),
        sb.from("orbit2_files").select("*").eq("boat_task_id", existing.id).order("created_at"),
      ]);
      if (!on) return;
      setNotes((n.data ?? []) as Orbit2Note[]);
      setFiles((f.data ?? []) as Orbit2File[]);
    })();
    return () => { on = false; };
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof JobForm>(k: K, v: JobForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  function payload() {
    return {
      boat_id: boat.id,
      kind: boatJobCategoryToKind(form.category),
      title: form.title.trim(),
      schedule_date: form.schedule_date || null,
      schedule_time: form.schedule_time || null,
      est_minutes: form.est.trim() ? hhmmToMinutes(form.est.trim()) : null,
      assigned_team: form.team,
      technician: form.technician.trim() || null,
      remarks: form.remarks.trim() || null,
      status: form.status,
    };
  }

  async function save() {
    if (!form.title.trim()) { toast.error("Give the job a description."); return; }
    setSaving(true);
    try {
      if (existing) {
        const { error } = await sb.from("orbit2_boat_tasks").update(payload()).eq("id", existing.id);
        if (error) throw error;
        toast.success(`${existing.job_no} saved`);
        await reload();
      } else {
        const { data, error } = await sb.from("orbit2_boat_tasks").insert({ ...payload(), created_by: user?.id ?? null }).select("*").single();
        if (error) throw error;
        toast.success(`${data.job_no} added`);
        await reload();
        onCreated(data.id);
        return;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing || !confirm(`Delete ${existing.job_no}? This cannot be undone.`)) return;
    const { error } = await sb.from("orbit2_boat_tasks").delete().eq("id", existing.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${existing.job_no} deleted`);
    await reload();
    onClose();
  }

  async function addNote(kind: "remark" | "team_comment", body: string) {
    if (!existing) return;
    const { error } = await sb.from("orbit2_notes").insert({ boat_task_id: existing.id, kind, author: user?.email?.split("@")[0] ?? "Polaris", body, created_by: user?.id ?? null });
    if (error) { toast.error(error.message); return; }
    const { data } = await sb.from("orbit2_notes").select("*").eq("boat_task_id", existing.id).order("created_at");
    setNotes((data ?? []) as Orbit2Note[]);
  }

  async function attach(slot: "service_report" | "certificate" | "final_invoice", file: File, ref: string) {
    if (!existing) return;
    const { error } = await sb.from("orbit2_files").insert({ boat_task_id: existing.id, slot, file_name: file.name, storage_ref: ref, uploaded_by: user?.id ?? null });
    if (error) { toast.error(error.message); return; }
    const { data } = await sb.from("orbit2_files").select("*").eq("boat_task_id", existing.id).order("created_at");
    setFiles((data ?? []) as Orbit2File[]);
  }

  async function detach(f: { id: string }) {
    const { error } = await sb.from("orbit2_files").delete().eq("id", f.id);
    if (error) { toast.error(error.message); return; }
    setFiles((list) => list.filter((x) => x.id !== f.id));
  }

  const slot = (s: Orbit2File["slot"]) => files.filter((f) => f.slot === s).map((f) => ({ id: f.id, file_name: f.file_name, storage_ref: f.storage_ref }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-[15px] font-semibold text-muted-foreground">{existing ? existing.job_no : "New Job"}</span>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-5">
          <Field label="Category">
            <select className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value as JobForm["category"])}>
              {BOAT_JOB_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Description">
            <textarea className={cn(inputCls, "min-h-[72px] resize-y")} value={form.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Date"><input className={inputCls} type="date" value={form.schedule_date} onChange={(e) => set("schedule_date", e.target.value)} /></Field>
            <Field label="Time" hint="24-hour"><input className={inputCls} type="time" value={form.schedule_time} onChange={(e) => set("schedule_time", e.target.value)} /></Field>
          </div>
          <Field label="Est Time Required" hint="hh:mm">
            <input className={inputCls} placeholder="03:40" value={form.est} onChange={(e) => set("est", e.target.value)} />
          </Field>
          <Field label="Assign Crew"><TeamPicker value={form.team} onChange={(v) => set("team", v)} /></Field>
          <Field label="Technician"><Typeahead value={form.technician} onChange={(v) => set("technician", v)} options={technicianOptions} /></Field>
          <Field label="Remarks"><textarea className={cn(inputCls, "min-h-[60px] resize-y")} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>
          <Field label="Status">
            <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value)}>
              {BOAT_TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          {existing && (
            <>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <FileSlot label="Service Report" files={slot("service_report")} onUpload={(f, r) => attach("service_report", f, r)} onRemove={detach} />
                <FileSlot label="Certificate" files={slot("certificate")} onUpload={(f, r) => attach("certificate", f, r)} onRemove={detach} />
                <FileSlot label="Final Tax Invoice" files={slot("final_invoice")} onUpload={(f, r) => attach("final_invoice", f, r)} onRemove={detach} />
              </div>
              <NoteLog title="Team Comments" notes={notes.filter((n) => n.kind === "team_comment")}
                emptyText="Nothing from the field team yet." placeholder="Add a note on the crew's behalf"
                onAdd={(b) => addNote("team_comment", b)} />
            </>
          )}
        </div>

        <div className="flex justify-between gap-2 border-t border-border px-5 py-3">
          {existing ? (
            <button onClick={() => void remove()} className="rounded-md border border-border px-3 py-2 text-[15px] text-destructive hover:bg-destructive/10">Delete</button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving} className="rounded-md bg-[#E05252] px-5 py-2 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50">Cancel</button>
            <button onClick={() => void save()} disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-[#3FA76A] px-5 py-2 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} {existing ? "Save" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Inventory List board ─────────────────────────────────────────────────────

function InventoryBoard({ boat, inventory, reload }: { boat: Orbit2Boat; inventory: Orbit2BoatInventoryItem[]; reload: () => Promise<void> | void }) {
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [form, setForm] = useState({ item: "", qty: "", unit: "Pcs", condition: BOAT_INVENTORY_CONDITIONS[0] as string, expiry: "", remarks: "" });

  async function patch(row: Orbit2BoatInventoryItem, values: Record<string, unknown>) {
    const { error } = await sb.from("orbit2_boat_inventory").update(values).eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    await reload();
  }

  async function addItem() {
    if (!form.item.trim()) { toast.error("Give the item a name."); return; }
    const { error } = await sb.from("orbit2_boat_inventory").insert({
      boat_id: boat.id, item: form.item.trim(), qty: form.qty ? Number(form.qty) : null, unit: form.unit,
      condition: form.condition, expiry_date: form.expiry || null, remarks: form.remarks.trim() || null,
      created_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    setForm({ item: "", qty: "", unit: "Pcs", condition: BOAT_INVENTORY_CONDITIONS[0], expiry: "", remarks: "" });
    setAdding(false);
    await reload();
  }

  async function uploadImage(row: Orbit2BoatInventoryItem, file: File | undefined) {
    if (!file) return;
    if (!guardUploadFile(file, { accepts: "Use an image." })) return;
    try {
      const path = `orbit2/boats/inventory/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await supabase.storage.from(ORBIT2_BUCKET).upload(path, file, { contentType: uploadContentType(file), upsert: false });
      if (error) throw error;
      await patch(row, { image_ref: storageRef(ORBIT2_BUCKET, path) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  }

  async function remove(row: Orbit2BoatInventoryItem) {
    const { error } = await sb.from("orbit2_boat_inventory").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    await reload();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <span className="text-[15px] text-muted-foreground">{inventory.length} item{inventory.length === 1 ? "" : "s"}</span>
        <button onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[15px] font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Add Item
        </button>
      </div>

      {adding && (
        <div className="grid gap-2.5 border-b border-border/50 bg-muted/15 p-4 sm:grid-cols-3">
          <Field label="Item"><input className={inputCls} autoFocus value={form.item} onChange={(e) => setForm((f) => ({ ...f, item: e.target.value }))} /></Field>
          <Field label="Qty"><input className={inputCls} type="number" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} /></Field>
          <Field label="Unit">
            <select className={inputCls} value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}>
              {INVENTORY_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
          <Field label="Condition">
            <select className={inputCls} value={form.condition} onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}>
              {BOAT_INVENTORY_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Expiry Date"><input className={inputCls} type="date" value={form.expiry} onChange={(e) => setForm((f) => ({ ...f, expiry: e.target.value }))} /></Field>
          <Field label="Remarks"><input className={inputCls} value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} /></Field>
          <div className="flex items-end justify-end gap-2 sm:col-span-3">
            <button onClick={() => setAdding(false)} className="rounded-md border border-border px-3 py-1.5 text-[15px] hover:bg-accent">Cancel</button>
            <button onClick={() => void addItem()} className="rounded-md bg-primary px-3 py-1.5 text-[15px] font-medium text-primary-foreground hover:opacity-90">Add</button>
          </div>
        </div>
      )}

      {inventory.length === 0 ? (
        <p className="px-4 py-8 text-center text-[15px] text-muted-foreground">Nothing logged yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-y border-border/60 bg-muted/10">
                {["Item No.", "Item", "Qty", "Unit", "Condition", "Expiry Date", "On Board", "Remarks", "Image", ""].map((c) => (
                  <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-muted-foreground">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {inventory.map((r, i) => (
                <tr key={r.id} className="hover:bg-muted/10">
                  <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-1.5">{r.item}</td>
                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{r.qty ?? "—"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.unit ?? "—"}</td>
                  <td className="px-3 py-1.5">
                    <select className="rounded border border-border bg-background px-1.5 py-1 text-[13px] font-medium"
                      style={{ color: boatInventoryConditionColor(r.condition) }}
                      value={r.condition ?? BOAT_INVENTORY_CONDITIONS[0]} onChange={(e) => patch(r, { condition: e.target.value })}>
                      {BOAT_INVENTORY_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                    {r.expiry_date ? new Date(`${r.expiry_date}T00:00:00`).toLocaleDateString("en-GB") : "N/A"}
                  </td>
                  <td className="px-3 py-1.5">
                    <select className="rounded border border-border bg-background px-1.5 py-1 text-[13px]"
                      value={r.on_board ? "yes" : "no"} onChange={(e) => patch(r, { on_board: e.target.value === "yes" })}>
                      <option value="yes">Yes</option><option value="no">No</option>
                    </select>
                  </td>
                  <td className="max-w-[12rem] px-3 py-1.5 text-muted-foreground"><span className="line-clamp-2">{r.remarks || "—"}</span></td>
                  <td className="px-3 py-1.5">
                    {r.image_ref ? (
                      <button onClick={() => setLightbox(r.image_ref)} className="block h-8 w-8 overflow-hidden rounded border border-border">
                        <SignedImage stored={r.image_ref} alt={r.item} className="h-full w-full object-cover" />
                      </button>
                    ) : (
                      <label className="cursor-pointer text-[13px] text-primary hover:underline">
                        Add
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => void uploadImage(r, e.target.files?.[0])} />
                      </label>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button onClick={() => void remove(r)} title="Delete" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
          <SignedImage stored={lightbox} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
