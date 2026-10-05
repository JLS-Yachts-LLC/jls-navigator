/**
 * Orbit 2 — a single managed boat: vessel spec, document categories, DMA/FMA/RYA
 * compliance, the Jobs board, and the Inventory List. Split out of orbit2-boats.tsx
 * because that file is the fleet-level dashboard and wizard — this is everything
 * that needs a real boat_id to exist.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "@/lib/error-message";
import {
  Loader2, ArrowLeft, Plus, Search, Trash2, X, Ship, Pencil, Camera, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SignedImage, SignedAnchor } from "@/components/ui/signed-file";
import { storageRef } from "@/lib/signed-url";
import { guardUploadFile, uploadContentType } from "@/lib/upload-guard";
import {
  BOAT_TASK_STATUSES, BOAT_JOB_CATEGORIES, boatJobCategoryToKind, kindToBoatJobCategory, checklistCategoryFor,
  BOAT_INVENTORY_CONDITIONS, boatInventoryConditionColor,
} from "./orbit2-constants";
import {
  ORBIT2_BUCKET, BOAT_DOC_CATEGORY_LABEL, INVENTORY_UNITS,
  minutesToHhmm, hhmmToMinutes, suggestionsFor,
  type Orbit2Boat, type Orbit2BoatTask, type Orbit2BoatDocument, type Orbit2BoatDocCategory,
  type Orbit2BoatInventoryItem, type Orbit2Note, type Orbit2File,
} from "./orbit2-data";
import { Field, inputCls, Typeahead, TeamPicker, FileSlot, NoteLog, type UploadedFile } from "./orbit2-fields";
import { InspectionsRequired, InspectionChecklist, INSPECTION_REGIMES, ryaChecklistLabel, type InspectionRegime } from "./orbit2-boat-checklist";
import { useOrbit2Identity } from "./orbit2-identity";
import { BoatAdditionalChecklists, useChecklistForms } from "./orbit2-checklist-library";

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
  const identity = useOrbit2Identity();
  const [section, setSection] = useState<"jobs" | "inventory">("jobs");
  /** "Assign Team" pressed on one of the inspection checklists — raise a job for it. */
  const [checklistJob, setChecklistJob] = useState<InspectionRegime | null>(null);
  /** …or on one of the boat's additional (library) checklists. */
  const [formJob, setFormJob] = useState<{ id: string; name: string } | null>(null);

  /** Save fields on the boat. Returns false when the database refused, so a caller can avoid claiming success. */
  async function patchBoat(patch: Record<string, unknown>): Promise<boolean> {
    const { error } = await sb.from("orbit2_boats").update(patch).eq("id", boat.id);
    if (error) { toast.error(errorMessage(error, "Could not save")); return false; }
    await reload();
    return true;
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
    // Sits under the fleet page's filter tabs (see orbit2-boats.tsx), so no
    // padding of its own.
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={onBack} title="All boats" aria-label="All boats"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <EditableName
            value={boat.name}
            onSave={async (name) => { if (await patchBoat({ name })) toast.success(`Renamed to ${name}`); }}
          />
        </div>
        <button onClick={() => void removeBoat()} title={`Remove ${boat.name}`}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* The design's two columns: the vessel and its paperwork on the left, the
          work on it — Jobs and Inventory List — on the right. Stacks below xl. */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <div className="min-w-0 space-y-5">

      {/* ── Vessel spec ── */}
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-[160px_1fr]">
        <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-muted/30 sm:aspect-square">
          {boat.image_ref
            ? <SignedImage stored={boat.image_ref} alt={boat.name} className="h-full w-full object-cover" />
            : <Ship className="h-8 w-8 text-muted-foreground/40" />}
        </div>
        <div>
          <p className="mb-3 text-[14px] text-muted-foreground">
            {[boat.client_name].filter(Boolean).join(" · ") || "No client recorded"}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <SpecField label="Vessel Type" value={boat.boat_type} onSave={(v) => patchBoat({ boat_type: v })} />
            <SpecField label="Hull Number" value={boat.hull_number} onSave={(v) => patchBoat({ hull_number: v })} />
            <SpecField label="Hull Material" value={boat.hull_material} onSave={(v) => patchBoat({ hull_material: v })} />
            <SpecField label="Year of Build" value={boat.year_of_build} type="number" onSave={(v) => patchBoat({ year_of_build: v ? Number(v) : null })} />
            <SpecField label="Max Beam (m)" value={boat.max_beam_m} type="number" onSave={(v) => patchBoat({ max_beam_m: v ? Number(v) : null })} />
            <SpecField label="Max Length (m)" value={boat.max_length_m} type="number" onSave={(v) => patchBoat({ max_length_m: v ? Number(v) : null })} />
            <SpecField label="Max Passenger" value={boat.max_passengers} type="number" onSave={(v) => patchBoat({ max_passengers: v ? Number(v) : null })} />
            <SpecField label="MMSI" value={boat.mmsi} onSave={(v) => patchBoat({ mmsi: v })} />
            <SpecField label="IMO" value={boat.imo_no} onSave={(v) => patchBoat({ imo_no: v.trim() || null })} />
            <SpecField label={`Job number prefix (${boat.job_prefix ?? "…"}${String(new Date().getFullYear()).slice(2)}-0001 …)`}
              value={boat.job_prefix}
              onSave={async (v) => {
                const p = v.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
                if (p.length < 2 || p.length > 5) { toast.error("The prefix must be 2–5 letters or digits."); return; }
                // Existing job numbers keep their prefix; only new jobs use this one.
                await patchBoat({ job_prefix: p });
              }} />
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

      {/* ── DMA / FMA / RYA compliance — only the regimes this boat needs ── */}
      <InspectionsRequired boat={boat} onSave={patchBoat} />
      {checklistJob && (
        <JobEditor boat={boat} existing={null} technicianOptions={[]}
          preset={{
            category: checklistCategoryFor(checklistJob),
            title: `${checklistJob.toUpperCase()} inspection checklist${checklistJob === "rya" && boat.rya_checklist ? ` — ${ryaChecklistLabel(boat.rya_checklist)}` : ""}`,
          }}
          onClose={() => setChecklistJob(null)}
          onCreated={() => { setChecklistJob(null); setSection("jobs"); }}
          reload={reload} />
      )}
      {formJob && (
        <JobEditor boat={boat} existing={null} technicianOptions={[]}
          preset={{ category: "Checklist", title: formJob.name, checklist_form_id: formJob.id }}
          onClose={() => setFormJob(null)}
          onCreated={() => { setFormJob(null); setSection("jobs"); }}
          reload={reload} />
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {INSPECTION_REGIMES.filter((r) => (boat.inspections_required ?? INSPECTION_REGIMES).includes(r)).map((regime) => (
          <ComplianceCard key={regime} regime={regime} boat={boat} inventory={inventory} isAdmin={identity.isAdmin} authorName={identity.name || "Office"} onDocumentAdded={reload}
            onAssignTeam={() => setChecklistJob(regime)}
            checklist={docsFor(`${regime}_checklist` as Orbit2BoatDocCategory)}
            onUploadChecklist={(f, r) => uploadDoc(`${regime}_checklist` as Orbit2BoatDocCategory, f, r)}
            onRemoveChecklist={removeDoc}
            onSaveDate={(v) => patchBoat({ [`${regime}_last_inspection`]: v || null })}
            onUploadReport={async (_file, ref) => { await patchBoat({ [`${regime}_report_ref`]: ref }); }}
            onRemoveReport={() => patchBoat({ [`${regime}_report_ref`]: null })}
          />
        ))}
      </div>

      {/* ── Any other checklists this boat carries, from the library ── */}
      <BoatAdditionalChecklists boat={boat} inventory={inventory} isAdmin={identity.isAdmin} authorName={identity.name || "Office"}
        onDocumentAdded={reload} onAssignTeam={(f) => setFormJob({ id: f.id, name: f.name })} />

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

      </div>

      {/* ── Jobs / Inventory ── */}
      <div className="min-w-0 self-start rounded-xl border border-border bg-card">
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
    </div>
  );
}

// ── Small pieces ──────────────────────────────────────────────────────────

/** One vessel-spec field, saved on blur — the boat detail equivalent of the NOC grid's cells. */
/**
 * The boat's name as the page heading, editable in place (client request,
 * 29 Sep 2026). A pencil beside the name turns it into a field; Enter or
 * clicking away saves, Escape puts the old name back. An empty name is refused
 * rather than saved — a boat with no name cannot be found again.
 */
function EditableName({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> | void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  // Enter saves directly and blur saves too; the field closing after Enter can
  // fire blur as well, so the first to run wins and the other is a no-op.
  const done = useRef(false);
  useEffect(() => { if (!editing) setV(value); }, [value, editing]);

  function open() { done.current = false; setEditing(true); }

  async function commit() {
    if (done.current) return;
    done.current = true;
    const next = v.trim();
    setEditing(false);
    if (!next) { setV(value); toast.error("The boat needs a name."); return; }
    if (next === value) return;
    await onSave(next);
  }

  if (editing) {
    return (
      <input autoFocus value={v} aria-label="Boat name"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") { done.current = true; setV(value); setEditing(false); }
        }}
        className="min-w-0 flex-1 rounded-md border border-primary bg-background px-2 py-1 font-display text-[22px] font-semibold tracking-tight outline-none" />
    );
  }
  return (
    <button onClick={open} title="Rename this boat"
      className="group flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-accent">
      <h2 className="truncate font-display text-[22px] font-semibold tracking-tight">{value}</h2>
      <Pencil className="h-4 w-4 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" />
    </button>
  );
}

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
  regime, boat, inventory, isAdmin, authorName, checklist, onUploadChecklist, onRemoveChecklist, onSaveDate, onUploadReport, onRemoveReport, onDocumentAdded, onAssignTeam,
}: {
  regime: InspectionRegime;
  boat: Orbit2Boat;
  inventory: Orbit2BoatInventoryItem[];
  isAdmin: boolean;
  authorName: string;
  onDocumentAdded: () => Promise<void> | void;
  onAssignTeam: () => void;
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
        {/* RYA's document is its safety checklist, not a technical pass — the
            design's own wording for each regime. */}
        <SingleFileField
          label={regime === "rya" ? "Vessel Inspection and Safety Checklist" : "Technical Inspection Pass Report"}
          value={reportRef} onUpload={onUploadReport} onRemove={onRemoveReport} />
      </div>
      {/* The items this inspection requires, ticked per boat — see orbit2-boat-checklist. */}
      <div className="mb-2.5">
        <InspectionChecklist boat={boat} regime={regime} inventory={inventory} isAdmin={isAdmin} authorName={authorName} onDocumentAdded={onDocumentAdded} onAssignTeam={onAssignTeam} />
      </div>
      <FileSlot label="Completed checklist / supporting files" files={checklist} onUpload={onUploadChecklist} onRemove={onRemoveChecklist} />
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
      toast.error(errorMessage(e, "Upload failed"));
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
  /** For a "Checklist" job: the library checklist it carries. */
  checklist_form_id: string;
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
  boat, existing, technicianOptions, onClose, onCreated, reload, preset,
}: {
  boat: Orbit2Boat;
  existing: Orbit2BoatTask | null;
  technicianOptions: string[];
  /** Starting values for a new job — e.g. the category when raised from a checklist's Assign Team. */
  preset?: Partial<JobForm>;
  onClose: () => void;
  onCreated: (id: string) => void;
  reload: () => Promise<void> | void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<JobForm>(existing ? {
    category: kindToBoatJobCategory(existing.kind),
    checklist_form_id: existing.checklist_form_id ?? "",
    title: existing.title,
    schedule_date: existing.schedule_date ?? "",
    schedule_time: (existing.schedule_time ?? "").slice(0, 5),
    est: minutesToHhmm(existing.est_minutes),
    team: existing.assigned_team ?? [],
    technician: existing.technician ?? "",
    remarks: existing.remarks ?? "",
    status: existing.status,
  } : {
    category: "Maintenance", checklist_form_id: "", title: "", schedule_date: "", schedule_time: "", est: "",
    team: [], technician: "", remarks: "", status: "Pending",
    ...preset,
  });
  const [saving, setSaving] = useState(false);
  const { forms: libraryForms } = useChecklistForms();
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
      checklist_form_id: form.category === "Checklist" ? form.checklist_form_id || null : null,
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
    // An empty crew list saves fine but is invisible on every phone — the
    // field app's job query is `.contains("assigned_team", [name])`, which
    // never matches an empty array. Catch it here rather than let "Assign
    // Team" silently create a job nobody's assigned to.
    if (form.team.length === 0) { toast.error("Assign at least one crew member."); return; }
    if (form.category === "Checklist" && !form.checklist_form_id) { toast.error("Choose which checklist the job is for."); return; }
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
      toast.error(errorMessage(e, "Could not save"));
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

  async function attach(slot: "service_report" | "certificate" | "final_invoice" | "image", file: File, ref: string) {
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
  const images = files.filter((f) => f.slot === "image");
  const [lightbox, setLightbox] = useState<string | null>(null);

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
          {form.category === "Checklist" && (
            <Field label="Checklist">
              <select className={inputCls} value={form.checklist_form_id} onChange={(e) => {
                const f = libraryForms.find((x) => x.id === e.target.value);
                setForm((v) => ({ ...v, checklist_form_id: e.target.value, title: v.title.trim() ? v.title : f?.name ?? "" }));
              }}>
                <option value="">Choose a checklist from the library…</option>
                {libraryForms.filter((f) => !f.regime).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
          )}
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

              {/* Images — captured by the crew in the mobile app, or attached here. */}
              <div>
                <div className="mb-1 text-[14px] font-medium text-muted-foreground">Images</div>
                {images.length > 0 && (
                  <div className="mb-2 grid grid-cols-4 gap-2">
                    {images.map((f) => (
                      <div key={f.id} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted/20">
                        <button type="button" onClick={() => setLightbox(f.storage_ref)} className="block h-full w-full" title="View full size">
                          <SignedImage stored={f.storage_ref} alt={f.file_name} className="h-full w-full object-cover" />
                        </button>
                        <button type="button" onClick={() => void detach(f)} title="Remove image"
                          className="absolute right-1 top-1 hidden rounded bg-background/90 p-0.5 text-destructive group-hover:block">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <FileSlot label={images.length ? "Add another image" : "No images yet — photos from the mobile app appear here"} files={[]} accept="image/*"
                  onUpload={(f, r) => attach("image", f, r)} />
              </div>
            </>
          )}
        </div>

        {lightbox && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6" onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>
            <button onClick={() => setLightbox(null)} className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
              <X className="h-5 w-5" />
            </button>
            <SignedImage stored={lightbox} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
          </div>
        )}

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
  const [lightbox, setLightbox] = useState<string | null>(null);
  // null = closed · "new" = adding · a row = viewing / editing that item
  const [editor, setEditor] = useState<null | "new" | Orbit2BoatInventoryItem>(null);

  async function patch(row: Orbit2BoatInventoryItem, values: Record<string, unknown>) {
    const { error } = await sb.from("orbit2_boat_inventory").update(values).eq("id", row.id);
    if (error) { toast.error(errorMessage(error, "Could not save")); return; }
    await reload();
  }

  async function remove(row: Orbit2BoatInventoryItem) {
    const { error } = await sb.from("orbit2_boat_inventory").delete().eq("id", row.id);
    if (error) { toast.error(errorMessage(error, "Could not delete")); return; }
    await reload();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <span className="text-[15px] text-muted-foreground">{inventory.length} item{inventory.length === 1 ? "" : "s"}</span>
        <button onClick={() => setEditor("new")}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[15px] font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Add Item
        </button>
      </div>

      {inventory.length === 0 ? (
        <p className="px-4 py-8 text-center text-[15px] text-muted-foreground">Nothing logged yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-y border-border/60 bg-muted/10">
                {["Item No.", "Item", "Qty", "Unit", "Condition", "Expiry Date", "On Board", "Remarks", "Last Checked", "Image", ""].map((c) => (
                  <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-muted-foreground">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {inventory.map((r, i) => (
                <tr key={r.id} className="hover:bg-muted/10">
                  <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-1.5">
                    {/* The item name opens the full record — every detail viewable and editable in one place. */}
                    <button onClick={() => setEditor(r)} className="text-left font-medium text-primary hover:underline">{r.item}</button>
                  </td>
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
                  {/* Filled in by the crew from the field app's Inventory job — who confirmed the line, and when. */}
                  <td className="whitespace-nowrap px-3 py-1.5 text-[13px] text-muted-foreground">
                    {r.checked_at
                      ? <span className="text-emerald-600">{r.checked_by ?? "Crew"} · {new Date(r.checked_at).toLocaleDateString("en-GB")}</span>
                      : "Not yet"}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.image_ref ? (
                      <button onClick={() => setLightbox(r.image_ref)} className="block h-8 w-8 overflow-hidden rounded border border-border">
                        <SignedImage stored={r.image_ref} alt={r.item} className="h-full w-full object-cover" />
                      </button>
                    ) : (
                      <button onClick={() => setEditor(r)} className="text-[13px] text-primary hover:underline">Add</button>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    <button onClick={() => setEditor(r)} title="View / edit" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
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

      {editor && (
        <InventoryItemEditor boat={boat} existing={editor === "new" ? null : editor}
          onClose={() => setEditor(null)} onDelete={remove} reload={reload} />
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

// ── One inventory item — add, view, edit ─────────────────────────────────────

type ItemForm = { item: string; qty: string; unit: string; condition: string; expiry: string; on_board: boolean; remarks: string };
const emptyItem = (): ItemForm => ({ item: "", qty: "", unit: "Pcs", condition: BOAT_INVENTORY_CONDITIONS[0], expiry: "", on_board: true, remarks: "" });

/**
 * The full record for one inventory line. Adding offers "Save & Add Another"
 * so a stock-take runs item after item without leaving the form (Unit and
 * Condition carry over — consecutive items usually share them). Opening an
 * existing line shows everything the office and the crew have recorded, all
 * editable, including replacing or removing the photo.
 */
function InventoryItemEditor({ boat, existing, onClose, onDelete, reload }: {
  boat: Orbit2Boat;
  existing: Orbit2BoatInventoryItem | null;
  onClose: () => void;
  onDelete: (row: Orbit2BoatInventoryItem) => Promise<void>;
  reload: () => Promise<void> | void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<ItemForm>(existing ? {
    item: existing.item, qty: existing.qty != null ? String(existing.qty) : "", unit: existing.unit ?? "Pcs",
    condition: existing.condition ?? BOAT_INVENTORY_CONDITIONS[0], expiry: existing.expiry_date ?? "",
    on_board: existing.on_board, remarks: existing.remarks ?? "",
  } : emptyItem());
  // The photo: a freshly chosen file (uploaded on save), the stored reference, or nothing.
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [imageRef, setImageRef] = useState<string | null>(existing?.image_ref ?? null);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState(0);
  const itemRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.preview); }, [photo]);

  function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Use an image."); return; }
    if (!guardUploadFile(file, { accepts: "Use an image." })) return;
    setPhoto({ file, preview: URL.createObjectURL(file) });
  }

  async function uploadPhoto(file: File): Promise<string> {
    const path = `orbit2/boats/inventory/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error } = await supabase.storage.from(ORBIT2_BUCKET).upload(path, file, { contentType: uploadContentType(file), upsert: false });
    if (error) throw error;
    return storageRef(ORBIT2_BUCKET, path);
  }

  /** Save the record. `andAnother` keeps the form open, cleared for the next item. */
  async function save(andAnother = false) {
    if (!form.item.trim()) { toast.error("Give the item a name."); itemRef.current?.focus(); return; }
    setSaving(true);
    try {
      const ref = photo ? await uploadPhoto(photo.file) : imageRef;
      const values = {
        item: form.item.trim(), qty: form.qty === "" ? null : Number(form.qty), unit: form.unit, condition: form.condition,
        expiry_date: form.expiry || null, on_board: form.on_board, remarks: form.remarks.trim() || null, image_ref: ref,
      };
      const { error } = existing
        ? await sb.from("orbit2_boat_inventory").update(values).eq("id", existing.id)
        : await sb.from("orbit2_boat_inventory").insert({ ...values, boat_id: boat.id, created_by: user?.id ?? null });
      if (error) throw error;
      toast.success(`${values.item} ${existing ? "updated" : "added"}`);
      await reload();
      if (andAnother) {
        setForm((f) => ({ ...emptyItem(), unit: f.unit, condition: f.condition }));
        setPhoto(null);
        setImageRef(null);
        setAdded((n) => n + 1);
        itemRef.current?.focus();
      } else {
        onClose();
      }
    } catch (e) {
      toast.error(errorMessage(e, "Could not save the item"));
    } finally {
      setSaving(false);
    }
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); void save(!existing); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-[15px] font-semibold text-muted-foreground">
            {existing ? `Item · ${existing.item}` : added > 0 ? `New Item · ${added} added` : "New Item"} — {boat.name}
          </span>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-5" onKeyDown={onEnter}>
          <Field label="Item"><input ref={itemRef} className={inputCls} autoFocus value={form.item} onChange={(e) => set("item", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Qty"><input className={inputCls} type="number" value={form.qty} onChange={(e) => set("qty", e.target.value)} /></Field>
            <Field label="Unit">
              <select className={inputCls} value={form.unit} onChange={(e) => set("unit", e.target.value)}>
                {INVENTORY_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Condition">
              <select className={inputCls} value={form.condition} onChange={(e) => set("condition", e.target.value)}>
                {BOAT_INVENTORY_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Expiry Date"><input className={inputCls} type="date" value={form.expiry} onChange={(e) => set("expiry", e.target.value)} /></Field>
          </div>
          <Field label="On Board">
            <div className="flex gap-2">
              {[true, false].map((v) => (
                <button key={String(v)} type="button" onClick={() => set("on_board", v)}
                  className={cn("flex-1 rounded-md border px-3 py-2 text-[15px] font-medium",
                    form.on_board === v ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-accent")}>
                  {v ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Remarks">
            <textarea className={cn(inputCls, "min-h-[60px] resize-y")} value={form.remarks} onChange={(e) => set("remarks", e.target.value)} />
          </Field>
          <ImagePicker preview={photo?.preview ?? null} stored={photo ? null : imageRef} onPick={pickPhoto}
            onClear={() => { setPhoto(null); setImageRef(null); }} />
          {existing && (
            <p className="text-[14px] text-muted-foreground">
              {existing.checked_at
                ? <>Last checked by <span className="text-emerald-600">{existing.checked_by ?? "crew"}</span> on {new Date(existing.checked_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.</>
                : "Not yet checked by the crew."}
              {" "}Added {new Date(existing.created_at).toLocaleDateString("en-GB")}.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
          {existing ? (
            <button onClick={() => void onDelete(existing).then(onClose)} disabled={saving}
              className="rounded-md border border-border px-3 py-2 text-[15px] text-destructive hover:bg-destructive/10 disabled:opacity-50">Delete</button>
          ) : <span />}
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={onClose} disabled={saving} className="rounded-md bg-[#E05252] px-4 py-2 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {added > 0 ? "Done" : "Cancel"}
            </button>
            {!existing && (
              <button onClick={() => void save(true)} disabled={saving}
                className="flex items-center gap-1.5 rounded-md border border-[#3FA76A] px-4 py-2 text-[15px] font-semibold text-[#3FA76A] hover:bg-[#3FA76A]/10 disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save &amp; Add Another
              </button>
            )}
            <button onClick={() => void save(false)} disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-[#3FA76A] px-5 py-2 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The item's photo: drag one in, take one with the device camera, or upload a
 * file. `preview` is a just-picked file not yet saved; `stored` is what is on
 * record. On a laptop without a camera the Take Photo button still opens the
 * file chooser, so nothing is lost.
 */
function ImagePicker({ preview, stored, onPick, onClear }: {
  preview: string | null; stored: string | null; onPick: (f: File | undefined) => void; onClear: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const has = !!(preview || stored);

  return (
    <div>
      <div className="mb-1 text-[14px] font-medium text-muted-foreground">Image</div>
      <div
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onPick(e.dataTransfer.files?.[0]); }}
        className={cn("flex gap-3 rounded-md border border-dashed border-border bg-muted/10 p-3 transition",
          dragOver && "border-primary bg-primary/10 ring-1 ring-primary/40")}>
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
          {preview ? <img src={preview} alt="" className="h-full w-full object-cover" />
            : stored ? <SignedImage stored={stored} alt="" className="h-full w-full object-cover" />
            : <Camera className="h-6 w-6 text-muted-foreground/50" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <p className="text-[14px] text-muted-foreground">
            {dragOver ? <span className="font-medium text-primary">Drop the image here</span>
              : has ? (preview ? "New photo — saved with the item." : "On record.") : "Drag an image here, or:"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => cameraRef.current?.click()}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[14px] font-medium hover:bg-accent">
              <Camera className="h-3.5 w-3.5" /> Take Photo
            </button>
            <button type="button" onClick={() => uploadRef.current?.click()}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[14px] font-medium hover:bg-accent">
              <Upload className="h-3.5 w-3.5" /> Upload
            </button>
            {has && (
              <button type="button" onClick={onClear}
                className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[14px] font-medium text-destructive hover:bg-destructive/10">
                <X className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
    </div>
  );
}
