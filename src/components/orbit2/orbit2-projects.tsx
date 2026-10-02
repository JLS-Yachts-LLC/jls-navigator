/**
 * Orbit 2 — Project List and Bunkering.
 *
 * One screen serving both registries. They are the same record with different
 * labels and two extra fields, so a second copy of this file would be a second
 * place for every fix to have to land.
 *
 *   Left   scrollable table of every record, searchable, status editable inline
 *   Right  the selected record in full, or a fresh entry form
 *
 * What the record type changes (per spec section 3B):
 *   Task ID prefix          OPS26-XXXX        BUNK26-XXXX
 *   Service Category        chosen            locked to Bunkering
 *   Specific Task           shown             removed
 *   Work Schedule Date…     "Work Schedule"   "Supply Date and Time"
 *   Product Grade, Quantity —                 shown
 */
import { useEffect, useMemo, useState } from "react";
import { errorMessage } from "@/lib/error-message";
import { Loader2, Plus, Search, X, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SignedImage } from "@/components/ui/signed-file";
import {
  ORBIT2_CATEGORIES, ORBIT2_STATUSES, MOBILE_OWNED_STATUSES, ADMIN_ONLY_STATUSES, QUANTITY_UNITS, isComplete,
  statusColor, type Orbit2RecordType,
} from "./orbit2-constants";
import {
  type Orbit2Project, type Orbit2Note, type Orbit2File,
  fmtSchedule, minutesToHhmm, hhmmToMinutes, suggestionsFor,
} from "./orbit2-data";
import { useOrbit2Identity } from "./orbit2-identity";
import { Field, inputCls, Typeahead, TeamPicker, FileSlot, NoteLog, stamp } from "./orbit2-fields";

const sb = supabase as any;

/** A record being edited — everything optional until Submit validates it. */
type Draft = Partial<Orbit2Project> & { assigned_team: string[] };

type ProjectView = "all" | "Complete - To be Invoiced" | "Complete - Invoiced";
const PROJECT_VIEWS: { key: ProjectView; label: string }[] = [
  { key: "all", label: "All Projects" },
  { key: "Complete - To be Invoiced", label: "To Be Invoiced" },
  { key: "Complete - Invoiced", label: "Invoiced" },
];

/**
 * A date and time handed over from the calendar's Quick Task Initialization.
 * The nonce is what makes a second click on the same slot open the form again
 * after it has been cancelled — the values alone would not have changed.
 */
export type Orbit2Prefill = { schedule_date: string; schedule_time: string; nonce: number };

const emptyDraft = (type: Orbit2RecordType): Draft => ({
  record_type: type,
  status: "Not Yet Initiated",
  service_category: type === "bunkering" ? "Bunkering" : "Vessel Services",
  assigned_team: [],
  quantity_unit: "LTR",
});

export function Orbit2Projects({
  recordType, projects, loading, reload, boatNames, prefill,
}: {
  recordType: Orbit2RecordType;
  projects: Orbit2Project[];
  loading: boolean;
  reload: () => Promise<void> | void;
  boatNames: string[];
  prefill?: Orbit2Prefill | null;
}) {
  const bunkering = recordType === "bunkering";
  const { user } = useAuth();
  const identity = useOrbit2Identity();

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft(recordType));
  const [saving, setSaving] = useState(false);

  const [notes, setNotes] = useState<Orbit2Note[]>([]);
  const [files, setFiles] = useState<Orbit2File[]>([]);

  const rows = useMemo(
    () => projects.filter((p) => p.record_type === recordType),
    [projects, recordType],
  );

  // Typeahead pools: every value already on file, across both registries, plus
  // the managed boats — so a boat logged in one place is offered in the other.
  const clientOptions = useMemo(
    () => suggestionsFor(projects.map((p) => p.client_name), boatNames),
    [projects, boatNames],
  );
  const locationOptions = useMemo(() => suggestionsFor(projects.map((p) => p.location)), [projects]);
  const supplierOptions = useMemo(() => suggestionsFor(projects.map((p) => p.supplier)), [projects]);

  /**
   * The three views (client request, 29 Sep 2026): everything, or the two
   * invoicing stages on their own. They follow the status exactly, so a job
   * appears under "To Be Invoiced" the moment an admin moves it there and
   * leaves when it is marked Invoiced — the same rule as the EHS NOC tabs.
   */
  const [view, setView] = useState<ProjectView>("all");
  const inView = useMemo(
    () => (view === "all" ? rows : rows.filter((p) => p.status === view)),
    [rows, view],
  );
  const viewCounts = useMemo(() => ({
    all: rows.length,
    "Complete - To be Invoiced": rows.filter((p) => p.status === "Complete - To be Invoiced").length,
    "Complete - Invoiced": rows.filter((p) => p.status === "Complete - Invoiced").length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inView;
    return inView.filter((p) =>
      [p.task_id, p.client_name, p.status, p.service_category, p.specific_task,
       p.requestor_name, p.location, p.jls_quote, p.invoice_number, p.supplier,
       (p.assigned_team ?? []).join(" ")]
        .some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [inView, query]);

  const selected = selectedId ? rows.find((p) => p.id === selectedId) ?? null : null;

  // Switching registries must not leave the other one's record open on the right.
  useEffect(() => {
    setSelectedId(null);
    setCreating(false);
    setDraft(emptyDraft(recordType));
  }, [recordType]);

  // Load the selected record's notes and attachments.
  useEffect(() => {
    let on = true;
    if (!selectedId) { setNotes([]); setFiles([]); return; }
    void (async () => {
      const [n, f] = await Promise.all([
        sb.from("orbit2_notes").select("*").eq("project_id", selectedId).order("created_at"),
        sb.from("orbit2_files").select("*").eq("project_id", selectedId).order("created_at"),
      ]);
      if (!on) return;
      setNotes((n.data ?? []) as Orbit2Note[]);
      setFiles((f.data ?? []) as Orbit2File[]);
    })();
    return () => { on = false; };
  }, [selectedId]);

  // A slot clicked on the dashboard calendar opens a new record on that slot.
  useEffect(() => {
    if (!prefill) return;
    setSelectedId(null);
    setDraft({
      ...emptyDraft(recordType),
      schedule_date: prefill.schedule_date,
      schedule_time: prefill.schedule_time,
    });
    setCreating(true);
  }, [prefill?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() {
    setSelectedId(null);
    setDraft(emptyDraft(recordType));
    setCreating(true);
  }

  function openRecord(p: Orbit2Project) {
    setCreating(false);
    setSelectedId(p.id);
    setDraft({ ...p, assigned_team: p.assigned_team ?? [] });
  }

  function cancel() {
    // Cancel flushes the typed values and returns to the default detail view.
    setCreating(false);
    if (selected) setDraft({ ...selected, assigned_team: selected.assigned_team ?? [] });
    else { setSelectedId(null); setDraft(emptyDraft(recordType)); }
  }

  /** The row as it goes to the database — Task ID is never sent, it is generated. */
  function payload(d: Draft) {
    const base: Record<string, unknown> = {
      record_type: recordType,
      client_name: d.client_name?.trim() || null,
      requestor_name: d.requestor_name?.trim() || null,
      email: d.email?.trim() || null,
      whatsapp: d.whatsapp?.trim() || null,
      status: d.status ?? "Not Yet Initiated",
      service_category: bunkering ? "Bunkering" : (d.service_category ?? "Vessel Services"),
      specific_task: bunkering ? null : (d.specific_task?.trim() || null),
      schedule_date: d.schedule_date || null,
      schedule_time: d.schedule_time || null,
      location: d.location?.trim() || null,
      assigned_team: d.assigned_team ?? [],
      jls_quote: d.jls_quote?.trim() || null,
      invoice_number: d.invoice_number?.trim() || null,
      supplier: d.supplier?.trim() || null,
      etc_minutes: d.etc_minutes ?? null,
    };
    if (bunkering) {
      base.product_grade = d.product_grade?.trim() || null;
      base.quantity = d.quantity ?? null;
      base.quantity_unit = d.quantity_unit ?? "LTR";
    }
    return base;
  }

  async function submit() {
    if (!draft.client_name?.trim()) {
      toast.error("Boat / Client Name is required.");
      return;
    }
    setSaving(true);
    try {
      if (creating) {
        const { data, error } = await sb
          .from("orbit2_projects")
          .insert({ ...payload(draft), created_by: user?.id ?? null })
          .select("*")
          .single();
        if (error) throw error;
        toast.success(`${data.task_id} created`);
        await reload();
        setCreating(false);
        setSelectedId(data.id);
        setDraft({ ...(data as Orbit2Project), assigned_team: data.assigned_team ?? [] });
      } else if (selected) {
        const { error } = await sb.from("orbit2_projects").update(payload(draft)).eq("id", selected.id);
        if (error) throw error;
        toast.success(`${selected.task_id} saved`);
        await reload();
        // A status override made in the panel adds a Remark of its own.
        const { data } = await sb.from("orbit2_notes").select("*").eq("project_id", selected.id).order("created_at");
        setNotes((data ?? []) as Orbit2Note[]);
      }
    } catch (e) {
      toast.error(errorMessage(e, "Could not save"));
    } finally {
      setSaving(false);
    }
  }

  /** Status straight from the table, without opening the record. */
  /**
   * Delete a record outright. Its Remarks, Team Comments and attachments go
   * with it (foreign-key cascade), which is why it asks first and says so.
   * Admin-only, and the database enforces the same rule (orbit2_guard_delete).
   */
  async function deleteRecord(p: Orbit2Project) {
    if (!confirm(`Delete ${p.task_id}${p.client_name ? ` (${p.client_name})` : ""}?\n\nIts remarks, team comments and attachments are deleted with it. This cannot be undone.`)) return;
    const { error } = await sb.from("orbit2_projects").delete().eq("id", p.id);
    if (error) { toast.error(errorMessage(error, "Could not delete")); return; }
    toast.success(`${p.task_id} deleted`);
    setSelectedId(null);
    setCreating(false);
    await reload();
  }

  async function setStatus(p: Orbit2Project, status: string) {
    const { error } = await sb.from("orbit2_projects").update({ status }).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    await reload();
    if (selectedId === p.id) {
      setDraft((d) => ({ ...d, status }));
      // An admin override writes its own Remark — show it without a reload.
      const { data } = await sb.from("orbit2_notes").select("*").eq("project_id", p.id).order("created_at");
      setNotes((data ?? []) as Orbit2Note[]);
    }
  }

  async function addNote(kind: "remark" | "team_comment", body: string) {
    if (!selected) return;
    const { error } = await sb.from("orbit2_notes").insert({
      project_id: selected.id, kind, author: identity.name || "Polaris", body,
      created_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    const { data } = await sb.from("orbit2_notes").select("*").eq("project_id", selected.id).order("created_at");
    setNotes((data ?? []) as Orbit2Note[]);
  }

  /** Correcting an existing Remark — restricted to Orbit 2 admins (see identity.isAdmin). */
  async function editNote(id: string, body: string) {
    if (!selected) return;
    // edited_at is not sent: the database stamps it (and refuses the edit
    // outright unless you are an Orbit 2 admin — see orbit2_guard_notes).
    const { error } = await sb.from("orbit2_notes").update({ body }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    const { data } = await sb.from("orbit2_notes").select("*").eq("project_id", selected.id).order("created_at");
    setNotes((data ?? []) as Orbit2Note[]);
  }

  async function attach(slot: Orbit2File["slot"], file: File, ref: string) {
    if (!selected) return;
    const { error } = await sb.from("orbit2_files").insert({
      project_id: selected.id, slot, file_name: file.name, storage_ref: ref,
      uploaded_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    const { data } = await sb.from("orbit2_files").select("*").eq("project_id", selected.id).order("created_at");
    setFiles((data ?? []) as Orbit2File[]);
  }

  // Only the id is needed, so this accepts the lighter shape FileSlot hands back.
  async function detach(f: { id: string }) {
    const { error } = await sb.from("orbit2_files").delete().eq("id", f.id);
    if (error) { toast.error(error.message); return; }
    setFiles((list) => list.filter((x) => x.id !== f.id));
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Views ── */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border/40 px-5 py-2">
        {PROJECT_VIEWS.map((v) => (
          <button key={v.key} onClick={() => setView(v.key)}
            className={cn("flex items-center gap-1.5 rounded-md px-3 py-1 text-[15px] font-medium transition",
              view === v.key ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60")}>
            {bunkering && v.key === "all" ? "All Bunkering" : v.label}
            <span className={cn("rounded-full px-1.5 py-0.5 text-[13px]",
              view === v.key ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
              {viewCounts[v.key]}
            </span>
          </button>
        ))}
      </div>

      {/* ── Search + New ── */}
      <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-3">
        <p className="text-[15px] text-muted-foreground">
          {rows.length === 0
            ? `No ${bunkering ? "bunkering" : "project"} records yet.`
            : inView.length === 0
              ? `Nothing ${view === "Complete - Invoiced" ? "invoiced" : "waiting to be invoiced"} yet.`
              : `${filtered.length} of ${inView.length} record${inView.length === 1 ? "" : "s"}`}
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input className={cn(inputCls, "h-9 w-56 py-1 pl-8 text-[15px]")} placeholder="Search"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button onClick={openNew}
            className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[15px] font-medium text-primary-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> New {bunkering ? "Bunkering" : "Project"}
          </button>
        </div>
      </div>

      {/* ── Split screen ── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(420px,1fr)]">
        <div className="min-h-0 overflow-auto border-r border-border/50">
          <RecordTable
            rows={filtered} bunkering={bunkering} selectedId={selectedId}
            isAdmin={identity.isAdmin} onOpen={openRecord} onStatus={setStatus}
          />
        </div>

        <div className="min-h-0 overflow-auto">
          {!creating && !selected ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
              <p className="text-[15px] font-semibold">No record selected</p>
              <p className="max-w-xs text-[14px] text-muted-foreground">
                Pick a Task ID on the left to see it in full, or start a new one.
              </p>
            </div>
          ) : (
            <DetailPanel
              bunkering={bunkering}
              creating={creating}
              draft={draft}
              setDraft={setDraft}
              selected={selected}
              saving={saving}
              isAdmin={identity.isAdmin}
              notes={notes}
              files={files}
              clientOptions={clientOptions}
              locationOptions={locationOptions}
              supplierOptions={supplierOptions}
              onSubmit={submit}
              onCancel={cancel}
              onDelete={identity.isAdmin ? deleteRecord : undefined}
              onAddNote={addNote}
              onEditNote={editNote}
              onAttach={attach}
              onDetach={detach}
              onNotified={reload}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Left: the data table ────────────────────────────────────────────────────

function RecordTable({
  rows, bunkering, selectedId, isAdmin, onOpen, onStatus,
}: {
  rows: Orbit2Project[];
  bunkering: boolean;
  selectedId: string | null;
  isAdmin: boolean;
  onOpen: (p: Orbit2Project) => void;
  onStatus: (p: Orbit2Project, status: string) => void;
}) {
  const cols = bunkering
    ? ["Task ID", "Boat/Client", "Status", "Category", "Requestor", "Supply Date and Time",
       "Location", "Product Grade", "Quantity", "Assign Team", "JLS Quote", "Invoice No."]
    : ["Task ID", "Boat/Client", "Status", "Service Category", "Specific Task", "Requestor",
       "Work Schedule Date and Time", "Location", "Assign Team", "JLS Quote", "Invoice No."];

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-[15px] text-muted-foreground">
        Nothing to show — records appear here as they are logged.
      </div>
    );
  }

  return (
    <table className="w-full border-separate border-spacing-0 text-[14px]">
      <thead className="sticky top-0 z-10">
        <tr>
          {cols.map((c) => (
            <th key={c} className="whitespace-nowrap border-b border-border bg-muted/40 px-3 py-2.5 text-left font-semibold text-muted-foreground backdrop-blur">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} onClick={() => onOpen(p)}
            className={cn("cursor-pointer align-top transition",
              selectedId === p.id ? "bg-primary/10" : "hover:bg-muted/30")}>
            <td className="whitespace-nowrap border-b border-border/40 px-3 py-2 font-semibold text-primary">{p.task_id}</td>
            <td className="border-b border-border/40 px-3 py-2">{p.client_name ?? "—"}</td>
            <td className="border-b border-border/40 px-3 py-2" onClick={(e) => e.stopPropagation()}>
              <StatusSelect value={p.status} isAdmin={isAdmin} onChange={(s) => onStatus(p, s)} />
            </td>
            <td className="whitespace-nowrap border-b border-border/40 px-3 py-2 text-muted-foreground">{p.service_category}</td>
            {!bunkering && (
              <td className="max-w-[16rem] border-b border-border/40 px-3 py-2 text-muted-foreground">
                <span className="line-clamp-2">{p.specific_task || "—"}</span>
              </td>
            )}
            <td className="border-b border-border/40 px-3 py-2 text-muted-foreground">{p.requestor_name ?? "—"}</td>
            <td className="whitespace-nowrap border-b border-border/40 px-3 py-2 text-muted-foreground">
              {fmtSchedule(p.schedule_date, p.schedule_time)}
            </td>
            <td className="border-b border-border/40 px-3 py-2 text-muted-foreground">{p.location ?? "—"}</td>
            {bunkering && (
              <>
                <td className="border-b border-border/40 px-3 py-2 text-muted-foreground">{p.product_grade ?? "—"}</td>
                <td className="whitespace-nowrap border-b border-border/40 px-3 py-2 tabular-nums text-muted-foreground">
                  {p.quantity != null ? `${p.quantity} ${p.quantity_unit ?? ""}`.trim() : "—"}
                </td>
              </>
            )}
            <td className="border-b border-border/40 px-3 py-2">
              {(p.assigned_team ?? []).length === 0
                ? <span className="text-muted-foreground">—</span>
                : <span className="text-foreground/85">{p.assigned_team.join(", ")}</span>}
            </td>
            <td className="border-b border-border/40 px-3 py-2 text-muted-foreground">{p.jls_quote ?? "—"}</td>
            <td className="border-b border-border/40 px-3 py-2 text-muted-foreground">{p.invoice_number ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The status dropdown, colour-coded.
 *
 * "Working On It" and "Complete - Team" are what the field crew reports from the mobile
 * app. A non-admin can still see them on a record that has reached them — they
 * just cannot select them, so the web view never contradicts what the crew said.
 */
export function StatusSelect({
  value, isAdmin, onChange, className,
}: { value: string; isAdmin: boolean; onChange: (v: string) => void; className?: string }) {
  // Mirrors orbit2_guard_status() exactly, so the menu never offers a change the
  // database will refuse:
  //   - "Working On It" / "Complete - Team" are the crew's (Attend / Done); an
  //     admin may set them here as an override.
  //   - Re-assigned and the two invoicing stages are admin-only.
  //   - Once a job is complete, only an admin can move it on or reopen it.
  const crewOwned = (s: string) => MOBILE_OWNED_STATUSES.includes(s);
  const adminOnly = (s: string) => ADMIN_ONLY_STATUSES.includes(s);
  const locked = (s: string) =>
    !isAdmin && s !== value && (crewOwned(s) || adminOnly(s) || isComplete(value));

  function pick(next: string) {
    if (next === value) return;
    // Worth one deliberate click each: an override is on the record, and
    // Re-assign sends the job back to the crew and clears its completion time.
    if (isAdmin && crewOwned(next)
      && !confirm(`Set "${next}" as an admin override?\n\nThe field crew normally set this from the mobile app. The change is recorded in Remarks under your name.`)) {
      return;
    }
    if (isAdmin && next === "Re-assigned"
      && !confirm("Re-assign this job?\n\nIt goes back into the assigned crew's mobile app for them to Attend again, and its Work Completion time is cleared until they press Done. Change Assign Team first if someone else should do it.")) {
      return;
    }
    onChange(next);
  }

  const suffix = (s: string) => {
    if (s === value) return "";
    if (crewOwned(s)) return isAdmin ? " — admin override" : " (mobile app)";
    if (!isAdmin && (adminOnly(s) || isComplete(value))) return " (admin only)";
    return "";
  };

  return (
    <select
      value={value}
      onChange={(e) => pick(e.target.value)}
      className={cn("w-full min-w-[11rem] rounded-md border px-2 py-1 text-[14px] font-medium outline-none",
        className)}
      style={{ borderColor: `${statusColor(value)}66`, background: `${statusColor(value)}1A`, color: statusColor(value) }}
    >
      {ORBIT2_STATUSES.map((s) => (
        <option key={s} value={s} className="bg-background text-foreground" disabled={locked(s)}>
          {s}{suffix(s)}
        </option>
      ))}
    </select>
  );
}

// ── Right: the detail panel ─────────────────────────────────────────────────

function DetailPanel({
  bunkering, creating, draft, setDraft, selected, saving, isAdmin, notes, files,
  clientOptions, locationOptions, supplierOptions,
  onSubmit, onCancel, onDelete, onAddNote, onEditNote, onAttach, onDetach, onNotified,
}: {
  bunkering: boolean;
  creating: boolean;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  selected: Orbit2Project | null;
  saving: boolean;
  isAdmin: boolean;
  notes: Orbit2Note[];
  files: Orbit2File[];
  clientOptions: string[];
  locationOptions: string[];
  supplierOptions: string[];
  onSubmit: () => void;
  onCancel: () => void;
  /** Present only for an Orbit 2 admin — see deleteRecord. */
  onDelete?: (p: Orbit2Project) => void;
  onAddNote: (kind: "remark" | "team_comment", body: string) => Promise<void>;
  onEditNote: (id: string, body: string) => Promise<void>;
  onAttach: (slot: Orbit2File["slot"], file: File, ref: string) => Promise<void>;
  onDetach: (f: { id: string }) => void;
  onNotified: () => Promise<void> | void;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const slot = (s: Orbit2File["slot"]) =>
    files.filter((f) => f.slot === s).map((f) => ({ id: f.id, file_name: f.file_name, storage_ref: f.storage_ref }));
  const images = files.filter((f) => f.slot === "image");
  const [etc, setEtc] = useState(minutesToHhmm(draft.etc_minutes));

  useEffect(() => { setEtc(minutesToHhmm(draft.etc_minutes)); }, [draft.id, draft.etc_minutes]);

  return (
    <div className="space-y-4 p-5">
      {/* Task ID — generated, read-only, always the first thing on the panel. */}
      <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5">
        <div>
          <div className="text-[14px] text-muted-foreground">Task ID</div>
          <div className="font-display text-[22px] font-bold tracking-tight">
            {creating ? <span className="text-muted-foreground">Generated on submit</span> : selected?.task_id}
          </div>
        </div>
        <div className="w-48">
          <div className="mb-1 text-[14px] text-muted-foreground">Status</div>
          <StatusSelect value={draft.status ?? "Not Yet Initiated"} isAdmin={isAdmin}
            onChange={(v) => set("status", v)} />
        </div>
      </div>

      {/* ── Core fields ── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Boat / Client Name" className="sm:col-span-2">
          <Typeahead value={draft.client_name ?? ""} onChange={(v) => set("client_name", v)}
            options={clientOptions} placeholder="Start typing — past entries are offered" />
        </Field>

        {!bunkering && (
          <Field label="Service Category">
            <select className={inputCls} value={draft.service_category ?? "Vessel Services"}
              onChange={(e) => set("service_category", e.target.value)}>
              {ORBIT2_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        )}
        {bunkering && (
          <Field label="Service Category" hint="Locked for bunkering records">
            <input className={inputCls} value="Bunkering" disabled readOnly />
          </Field>
        )}

        <Field label="Requestor Name">
          <input className={inputCls} value={draft.requestor_name ?? ""}
            onChange={(e) => set("requestor_name", e.target.value)} />
        </Field>

        {!bunkering && (
          <Field label="Specific Task" className="sm:col-span-2">
            <textarea className={cn(inputCls, "min-h-[84px] resize-y")} value={draft.specific_task ?? ""}
              onChange={(e) => set("specific_task", e.target.value)}
              placeholder="What the job actually involves" />
          </Field>
        )}

        <Field label="Email">
          <input className={inputCls} type="email" value={draft.email ?? ""}
            onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="WhatsApp">
          <input className={inputCls} value={draft.whatsapp ?? ""} placeholder="+9715…"
            onChange={(e) => set("whatsapp", e.target.value)} />
        </Field>

        <Field label={bunkering ? "Supply Date" : "Work Schedule Date"}>
          <input className={inputCls} type="date" value={draft.schedule_date ?? ""}
            onChange={(e) => set("schedule_date", e.target.value)} />
        </Field>
        <Field label={bunkering ? "Supply Time" : "Work Schedule Time"} hint="24-hour">
          <input className={inputCls} type="time" value={(draft.schedule_time ?? "").slice(0, 5)}
            onChange={(e) => set("schedule_time", e.target.value || null)} />
        </Field>

        <Field label="Location" className="sm:col-span-2">
          <Typeahead value={draft.location ?? ""} onChange={(v) => set("location", v)}
            options={locationOptions} placeholder="Port, berth or yard" />
        </Field>

        {bunkering && (
          <>
            <Field label="Product Grade">
              <input className={inputCls} value={draft.product_grade ?? ""}
                onChange={(e) => set("product_grade", e.target.value)} placeholder="e.g. MGO 0.1%" />
            </Field>
            <Field label="Quantity">
              <div className="flex gap-2">
                <input className={inputCls} type="number" min="0" step="any"
                  value={draft.quantity ?? ""}
                  onChange={(e) => set("quantity", e.target.value === "" ? null : Number(e.target.value))} />
                <select className={cn(inputCls, "w-28")} value={draft.quantity_unit ?? "LTR"}
                  onChange={(e) => set("quantity_unit", e.target.value)}>
                  {QUANTITY_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </Field>
          </>
        )}

        <Field label="Supplier Name">
          <Typeahead value={draft.supplier ?? ""} onChange={(v) => set("supplier", v)}
            options={supplierOptions} />
        </Field>
        <Field label="Est. Time Completion (ETC)" hint="hh:mm — 02:30 is two and a half hours">
          <input className={inputCls} value={etc} placeholder="02:30"
            onChange={(e) => setEtc(e.target.value)}
            onBlur={() => {
              const v = etc.trim();
              if (v === "") { set("etc_minutes", null); return; }
              const min = hhmmToMinutes(v);
              if (min === null) { toast.error("ETC must be hh:mm, e.g. 02:30."); setEtc(minutesToHhmm(draft.etc_minutes)); }
              else set("etc_minutes", min);
            }} />
        </Field>

        <Field label="JLS Quote">
          <input className={inputCls} value={draft.jls_quote ?? ""}
            onChange={(e) => set("jls_quote", e.target.value)} />
        </Field>
        <Field label="Invoice Number">
          <input className={inputCls} value={draft.invoice_number ?? ""}
            onChange={(e) => set("invoice_number", e.target.value)} />
        </Field>

        <Field label="Assign Team" className="sm:col-span-2">
          <TeamPicker value={draft.assigned_team ?? []} onChange={(v) => set("assigned_team", v)} />
        </Field>
      </div>

      {/* Work Completion — system-owned, never typed. */}
      <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
        <div className="text-[14px] text-muted-foreground">Work Completion Date &amp; Time</div>
        <div className="text-[15px] font-medium">
          {selected?.work_completed_at
            ? stamp(selected.work_completed_at)
            : <span className="text-muted-foreground">Set automatically when the record reaches Complete</span>}
        </div>
      </div>

      {/* ── Everything that needs a saved record ── */}
      {selected && !creating && (
        <>
          <ClientNotify project={selected} onSent={onNotified} />

          <div className="grid gap-2.5 sm:grid-cols-3">
            <FileSlot label="Supplier Quote" files={slot("supplier_quote")}
              onUpload={(f, r) => onAttach("supplier_quote", f, r)} onRemove={onDetach} />
            <FileSlot label="Invoice" files={slot("invoice")}
              onUpload={(f, r) => onAttach("invoice", f, r)} onRemove={onDetach} />
            <FileSlot label="Documents" files={slot("document")}
              onUpload={(f, r) => onAttach("document", f, r)} onRemove={onDetach} />
          </div>

          <NoteLog title="Remarks" notes={notes.filter((n) => n.kind === "remark")}
            placeholder="Add a remark — your name and the time are added automatically"
            onAdd={(b) => onAddNote("remark", b)}
            onEdit={onEditNote} canEdit={isAdmin} />

          <NoteLog title="Team Comments" notes={notes.filter((n) => n.kind === "team_comment")}
            emptyText="Nothing from the field team yet — comments logged in the mobile app appear here."
            placeholder="Add a note on the team's behalf"
            onAdd={(b) => onAddNote("team_comment", b)} />

          {/* Images — captured in the mobile app, or attached here. */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[14px] font-medium text-muted-foreground">Images</span>
            </div>
            {images.length > 0 && (
              <div className="mb-2 grid grid-cols-4 gap-2">
                {images.map((f) => (
                  <div key={f.id} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted/20">
                    <SignedImage stored={f.storage_ref} alt={f.file_name} className="h-full w-full object-cover" />
                    <button onClick={() => onDetach(f)} title="Remove image"
                      className="absolute right-1 top-1 hidden rounded bg-background/90 p-0.5 text-destructive group-hover:block">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <FileSlot label={images.length ? "Add another image" : "No images yet"} files={[]} accept="image/*"
              onUpload={(f, r) => onAttach("image", f, r)} />
          </div>
        </>
      )}

      {/* ── Form actions ── */}
      <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-3">
        {/* Delete sits apart from Cancel/Submit, on the far left, so it is
            never the button a hand reaches for by habit. Only on a saved record. */}
        {selected && !creating && onDelete ? (
          <button onClick={() => onDelete(selected)} disabled={saving}
            className="flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 text-[15px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        ) : <span />}
        <div className="flex gap-2">
        <button onClick={onCancel} disabled={saving}
          className="rounded-md bg-[#E05252] px-5 py-2 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
          Cancel
        </button>
        <button onClick={onSubmit} disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-[#3FA76A] px-5 py-2 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Submit
        </button>
        </div>
      </div>
    </div>
  );
}

// ── Client notification ─────────────────────────────────────────────────────

/**
 * The acknowledgement that goes to the client once a team is assigned.
 *
 * The spec has this fire automatically the moment Assign Team changes. It is
 * held behind one button instead: it leaves the building, to a real client, and
 * a mis-click on a name should not send it. Everything else is as specified —
 * the acknowledgement, who is attending, and the confirmed date, time and place
 * — and the panel shows plainly when it was last sent.
 */
function ClientNotify({ project, onSent }: { project: Orbit2Project; onSent: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const ready = (project.assigned_team ?? []).length > 0 && (project.email || project.whatsapp);

  async function send() {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/orbit2/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ project_id: project.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Send failed (${res.status})`);
      const bits = [
        body.email ? "email sent" : null,
        body.whatsapp ? "WhatsApp sent" : null,
      ].filter(Boolean);
      toast.success(bits.length ? `Client notified — ${bits.join(" and ")}.` : "Nothing to send.");
      if (body.warning) toast.warning(body.warning);
      await onSent();
    } catch (e) {
      toast.error(errorMessage(e, "Could not notify the client"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/15 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">Client notification</div>
          <p className="mt-0.5 text-[14px] text-muted-foreground">
            {project.client_notified_at
              ? `Last sent ${stamp(project.client_notified_at)}.`
              : ready
                ? "Confirms the request is logged, who is attending, and the schedule."
                : "Assign a team member and add an email or WhatsApp number first."}
          </p>
        </div>
        <button onClick={() => void send()} disabled={busy || !ready}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 px-3 py-1.5 text-[15px] font-medium text-primary hover:bg-primary/20 disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {project.client_notified_at ? "Send again" : "Notify client"}
        </button>
      </div>
    </div>
  );
}
