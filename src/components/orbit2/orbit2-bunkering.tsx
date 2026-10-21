/**
 * Orbit 2 — the Bunkering Request record (spec "Bunkering Request Module",
 * Method 1, section 1.5).
 *
 * The Project List keeps its single-page panel; a bunkering record has grown
 * enough to need the spec's four tabs:
 *
 *   Details          vessel (from Vessels), the request, the fuel the client
 *                    confirms, supplier and bunker timeline, the job itself
 *   Additional Jobs  ad-hoc jobs done alongside — every row stays editable
 *   Notes            Remarks, Team Comments and images, each with who and when
 *   Documents        named documents, supplier quote and invoice
 *
 * A record being created shows Details only: the other three hang off a saved
 * record, and a Task ID does not exist until Save.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fmtDMY } from "@/lib/format-date";
import { errorMessage } from "@/lib/error-message";
import { SignedImage, SignedAnchor } from "@/components/ui/signed-file";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  QUANTITY_UNITS, DELIVERY_PORTS, CAMLOCK_TYPES, MANIFOLD_POSITIONS, FUEL_GRADES, unitLabel,
} from "./orbit2-constants";
import { type Orbit2Project, type Orbit2Note, type Orbit2File, minutesToHhmm, hhmmToMinutes } from "./orbit2-data";
import { Field, inputCls, Typeahead, TeamPicker, FileSlot, NoteLog, stamp } from "./orbit2-fields";
import { EmailThread } from "./orbit2-email-thread";

const sb = supabase as any;

type Draft = Partial<Orbit2Project> & { assigned_team: string[] };

/** What the Vessels module holds that a bunkering request copies onto itself. */
export type BunkerYacht = {
  id: string;
  vessel_name: string;
  imo_no: string | null;
  flag: string | null;
  official_no: string | null;
  length_overall_m: number | null;
  draught_m: number | null;
  berth: string | null;
};

export const BUNKER_YACHT_COLUMNS = "id, vessel_name, imo_no, flag, official_no, length_overall_m, draught_m, berth";

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** The port as it reads — the custom text when "Others" was picked. */
export function portLabel(p: Pick<Orbit2Project, "delivery_port" | "delivery_port_other">): string | null {
  if (p.delivery_port === "Others") return p.delivery_port_other?.trim() || "Others";
  return p.delivery_port ?? null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s().-]{7,20}$/;

/** Why this draft cannot be saved, or null. Section 1.3's format rules. */
export function bunkeringProblem(d: Draft): string | null {
  if (!d.client_name?.trim()) return "Boat / Client Name is required.";
  if (d.delivery_port === "Others" && !d.delivery_port_other?.trim()) return "Say where the delivery is — Delivery Port is set to Others.";
  if (d.email?.trim() && !EMAIL.test(d.email.trim())) return "Email doesn't look like an email address.";
  if (d.whatsapp?.trim() && !PHONE.test(d.whatsapp.trim())) return "WhatsApp must be a phone number, e.g. +971 50 123 4567.";
  if (d.supplier_email?.trim() && !EMAIL.test(d.supplier_email.trim())) return "Supplier Email doesn't look like an email address.";
  return null;
}

/** The bunkering-only columns as they go to the database. */
export function bunkeringPayload(d: Draft): Record<string, unknown> {
  const t = (v: string | null | undefined) => v?.trim() || null;
  const port = portLabel(d);
  return {
    yacht_id: d.yacht_id ?? null,
    imo_no: t(d.imo_no), flag: t(d.flag), official_no: t(d.official_no),
    loa_m: d.loa_m ?? null, draught_m: d.draught_m ?? null, berth_no: t(d.berth_no),
    delivery_port: d.delivery_port ?? null,
    delivery_port_other: d.delivery_port === "Others" ? t(d.delivery_port_other) : null,
    // The calendar, the field app and the client notification all read
    // `location`, so it stays filled with where the delivery actually is.
    location: [port, t(d.berth_no)].filter(Boolean).join(", ") || t(d.location),
    camlock_type: d.camlock_type ?? null,
    camlock_size_in: d.camlock_size_in ?? null,
    hose_length_m: d.hose_length_m ?? null,
    manifold_position: d.manifold_position ?? null,
    product_grade: t(d.product_grade),
    quantity: d.quantity ?? null,
    quantity_unit: d.quantity_unit ?? "L",
    max_sulphur: t(d.max_sulphur), specification: t(d.specification), description: t(d.description),
    admin_remarks: t(d.admin_remarks),
    supplier_contact_person: t(d.supplier_contact_person),
    supplier_contact_number: t(d.supplier_contact_number),
    supplier_email: t(d.supplier_email),
    supplier_arrival_date: d.supplier_arrival_date || null, supplier_arrival_time: d.supplier_arrival_time || null,
    bunker_commence_date: d.bunker_commence_date || null, bunker_commence_time: d.bunker_commence_time || null,
    bunker_complete_date: d.bunker_complete_date || null, bunker_complete_time: d.bunker_complete_time || null,
  };
}

/**
 * A saved record as the form edits it. Records logged before Delivery Port
 * existed have only free-text Location; it is shown as "Others" with that text,
 * so saving one again keeps where it was rather than blanking it.
 */
export function bunkeringDraftOf(p: Orbit2Project): Draft {
  const d: Draft = { ...p, assigned_team: p.assigned_team ?? [] };
  if (!p.delivery_port && p.location) {
    d.delivery_port = "Others";
    d.delivery_port_other = p.location;
  }
  return d;
}

type Tab = "details" | "jobs" | "notes" | "documents" | "emails";
const TABS: { key: Tab; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "jobs", label: "Additional Jobs" },
  { key: "notes", label: "Notes" },
  { key: "documents", label: "Documents" },
  { key: "emails", label: "Email Threads" },
];

export function BunkeringPanel({
  creating, draft, setDraft, selected, saving, isAdmin, notes, files, yachts, history,
  clientOptions, supplierOptions, statusControl, notify,
  onSave, onCancel, onDelete, onAddNote, onEditNote, onAttach, onDetach, onReloadFiles,
}: {
  creating: boolean;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  selected: Orbit2Project | null;
  saving: boolean;
  isAdmin: boolean;
  notes: Orbit2Note[];
  files: Orbit2File[];
  yachts: BunkerYacht[];
  /** Every bunkering record — where the supplier's contact details are remembered from. */
  history: Orbit2Project[];
  clientOptions: string[];
  supplierOptions: string[];
  statusControl: React.ReactNode;
  /** The client-notification block, shown on a saved record. */
  notify: React.ReactNode;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: (p: Orbit2Project) => void;
  onAddNote: (kind: "remark" | "team_comment", body: string) => Promise<void>;
  onEditNote: (id: string, body: string) => Promise<void>;
  onAttach: (slot: Orbit2File["slot"], file: File, ref: string, docName?: string) => Promise<void>;
  onDetach: (f: { id: string }) => void;
  /** Email replies bring files in from the server — re-read the record's files. */
  onReloadFiles: () => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("details");
  useEffect(() => { setTab("details"); }, [selected?.id, creating]);
  const saved = !!selected && !creating;

  return (
    <div className="space-y-4 p-5">
      {/* Task ID — generated, read-only, always the first thing on the panel. */}
      <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3.5 py-2.5">
        <div>
          <div className="text-[14px] text-muted-foreground">Task ID</div>
          <div className="font-display text-[22px] font-bold tracking-tight">
            {creating ? <span className="text-muted-foreground">Generated on save</span> : selected?.task_id}
          </div>
        </div>
        <div className="w-48">
          <div className="mb-1 text-[14px] text-muted-foreground">Status</div>
          {statusControl}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border/50">
        {TABS.map((t) => {
          const off = !saved && t.key !== "details";
          return (
            <button key={t.key} type="button" disabled={off} onClick={() => setTab(t.key)}
              title={off ? "Save the request first" : undefined}
              className={cn("-mb-px border-b-2 px-3 py-2 text-[15px] font-medium transition disabled:opacity-40",
                tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "details" && (
        <DetailsTab
          draft={draft} setDraft={setDraft} selected={saved ? selected : null} files={files}
          yachts={yachts} history={history} clientOptions={clientOptions} supplierOptions={supplierOptions}
          notify={notify} onAttach={onAttach} onDetach={onDetach}
        />
      )}
      {tab === "jobs" && saved && <AdditionalJobsTab projectId={selected.id} />}
      {tab === "notes" && saved && (
        <NotesTab notes={notes} files={files} isAdmin={isAdmin}
          onAddNote={onAddNote} onEditNote={onEditNote} onAttach={onAttach} onDetach={onDetach} />
      )}
      {tab === "documents" && saved && <DocumentsTab files={files} onAttach={onAttach} onDetach={onDetach} />}
      {tab === "emails" && saved && <EmailThread projectId={selected.id} files={files} onFilesChanged={onReloadFiles} />}

      {/* Delete | Cancel | Save, per spec. Delete sits apart on the far left. */}
      {tab === "details" && (
        <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-3">
          {saved && onDelete ? (
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
            <button onClick={onSave} disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-[#3FA76A] px-5 py-2 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Details ─────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** A value copied from the vessel profile — shown, not typed. */
function ReadOnly({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <Field label={label}>
      <input className={inputCls} value={value ?? ""} placeholder="—" disabled readOnly />
    </Field>
  );
}

const num = (v: string) => (v === "" ? null : Number(v));

function DetailsTab({
  draft, setDraft, selected, files, yachts, history, clientOptions, supplierOptions, notify, onAttach, onDetach,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  selected: Orbit2Project | null;
  files: Orbit2File[];
  yachts: BunkerYacht[];
  history: Orbit2Project[];
  clientOptions: string[];
  supplierOptions: string[];
  notify: React.ReactNode;
  onAttach: (slot: Orbit2File["slot"], file: File, ref: string) => Promise<void>;
  onDetach: (f: { id: string }) => void;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const [etc, setEtc] = useState(minutesToHhmm(draft.etc_minutes));
  useEffect(() => { setEtc(minutesToHhmm(draft.etc_minutes)); }, [draft.id, draft.etc_minutes]);

  const vesselOptions = useMemo(
    () => [...new Set([...yachts.map((y) => y.vessel_name), ...clientOptions])],
    [yachts, clientOptions],
  );

  /**
   * Picking a vessel that is in Vessels fills its particulars; typing a name
   * that is not clears them, so a record never carries one boat's IMO under
   * another boat's name. Berth No. is only a starting value — it stays editable.
   */
  function pickVessel(name: string) {
    const y = yachts.find((v) => norm(v.vessel_name) === norm(name));
    setDraft((d) => {
      if (y) {
        if (d.yacht_id === y.id) return { ...d, client_name: name };
        return {
          ...d, client_name: name, yacht_id: y.id,
          imo_no: y.imo_no, flag: y.flag, official_no: y.official_no,
          loa_m: y.length_overall_m, draught_m: y.draught_m,
          berth_no: y.berth ?? d.berth_no ?? null,
        };
      }
      if (!d.yacht_id) return { ...d, client_name: name };
      return { ...d, client_name: name, yacht_id: null, imo_no: null, flag: null, official_no: null, loa_m: null, draught_m: null };
    });
  }

  /** Contact details last used with each supplier, newest record first. */
  const supplierContacts = useMemo(() => {
    const m = new Map<string, Pick<Orbit2Project, "supplier_contact_person" | "supplier_contact_number" | "supplier_email">>();
    const sorted = [...history].sort((a, b) => b.created_at.localeCompare(a.created_at));
    for (const p of sorted) {
      const k = norm(p.supplier);
      if (!k) continue;
      const prev = m.get(k) ?? {};
      m.set(k, {
        supplier_contact_person: prev.supplier_contact_person ?? p.supplier_contact_person ?? undefined,
        supplier_contact_number: prev.supplier_contact_number ?? p.supplier_contact_number ?? undefined,
        supplier_email: prev.supplier_email ?? p.supplier_email ?? undefined,
      });
    }
    return m;
  }, [history]);

  /** A known supplier fills the contact fields that are still empty — never overwrites. */
  function pickSupplier(name: string) {
    const known = supplierContacts.get(norm(name));
    setDraft((d) => ({
      ...d, supplier: name,
      ...(known ? {
        supplier_contact_person: d.supplier_contact_person || known.supplier_contact_person || null,
        supplier_contact_number: d.supplier_contact_number || known.supplier_contact_number || null,
        supplier_email: d.supplier_email || known.supplier_email || null,
      } : {}),
    }));
  }

  const linked = !!draft.yacht_id;
  // A grade typed before the list existed stays selectable rather than vanishing.
  const grades: string[] = [...FUEL_GRADES];
  if (draft.product_grade && !grades.includes(draft.product_grade)) grades.push(draft.product_grade);
  const filledForm = files.filter((f) => f.slot === "filled_form")
    .map((f) => ({ id: f.id, file_name: f.file_name, storage_ref: f.storage_ref }));

  return (
    <div className="space-y-6">
      <Section title="Vessel">
        <Field label="Boat / Client Name" className="sm:col-span-2"
          hint={draft.client_name?.trim()
            ? linked ? "Particulars taken from Vessels" : "Not in Vessels — particulars can't be filled in"
            : "Pick a vessel to fill in its particulars"}>
          <Typeahead value={draft.client_name ?? ""} onChange={pickVessel}
            options={vesselOptions} placeholder="Start typing a vessel name" />
        </Field>
        <ReadOnly label="IMO No." value={draft.imo_no} />
        <ReadOnly label="Flag" value={draft.flag} />
        <ReadOnly label="Official No." value={draft.official_no} />
        <ReadOnly label="LOA (m)" value={draft.loa_m} />
        <ReadOnly label="Draft (m)" value={draft.draught_m} />
        <Field label="Berth No.">
          <input className={inputCls} value={draft.berth_no ?? ""} onChange={(e) => set("berth_no", e.target.value)} />
        </Field>
      </Section>

      <Section title="Request">
        <Field label="Delivery Port">
          <select className={inputCls} value={draft.delivery_port ?? ""}
            onChange={(e) => set("delivery_port", e.target.value || null)}>
            <option value="">Select…</option>
            {DELIVERY_PORTS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        {draft.delivery_port === "Others" ? (
          <Field label="Other location">
            <input className={inputCls} value={draft.delivery_port_other ?? ""} placeholder="Where the delivery is"
              onChange={(e) => set("delivery_port_other", e.target.value)} />
          </Field>
        ) : <span className="hidden sm:block" />}

        <Field label="Service Category" hint="Locked for bunkering records">
          <input className={inputCls} value="Bunkering" disabled readOnly />
        </Field>
        <Field label="Requestor Name">
          <input className={inputCls} value={draft.requestor_name ?? ""} onChange={(e) => set("requestor_name", e.target.value)} />
        </Field>
        <Field label="Email">
          <input className={inputCls} type="email" value={draft.email ?? ""} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="WhatsApp">
          <input className={inputCls} type="tel" value={draft.whatsapp ?? ""} placeholder="+971 50 123 4567"
            onChange={(e) => set("whatsapp", e.target.value)} />
        </Field>
        <Field label="Supply Date">
          <input className={inputCls} type="date" value={draft.schedule_date ?? ""}
            onChange={(e) => set("schedule_date", e.target.value || null)} />
        </Field>
        <Field label="Supply Time" hint="24-hour">
          <input className={inputCls} type="time" value={(draft.schedule_time ?? "").slice(0, 5)}
            onChange={(e) => set("schedule_time", e.target.value || null)} />
        </Field>
        <Field label="Camlock Type">
          <select className={inputCls} value={draft.camlock_type ?? ""} onChange={(e) => set("camlock_type", e.target.value || null)}>
            <option value="">Select…</option>
            {CAMLOCK_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Camlock Size (Inches)">
          <input className={inputCls} type="number" min="0" step="any" value={draft.camlock_size_in ?? ""}
            onChange={(e) => set("camlock_size_in", num(e.target.value))} />
        </Field>
        <Field label="Hose Length (M)">
          <input className={inputCls} type="number" min="0" step="any" value={draft.hose_length_m ?? ""}
            onChange={(e) => set("hose_length_m", num(e.target.value))} />
        </Field>
        <Field label="Location — FWD | MID | AFT">
          <select className={inputCls} value={draft.manifold_position ?? ""}
            onChange={(e) => set("manifold_position", e.target.value || null)}>
            <option value="">Select…</option>
            {MANIFOLD_POSITIONS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Fuel Grade">
          <select className={inputCls} value={draft.product_grade ?? ""} onChange={(e) => set("product_grade", e.target.value || null)}>
            <option value="">Select…</option>
            {grades.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Quantity">
          <div className="flex gap-2">
            <input className={inputCls} type="number" min="0" step="any" value={draft.quantity ?? ""}
              onChange={(e) => set("quantity", num(e.target.value))} />
            <select className={cn(inputCls, "w-24")} aria-label="Units" value={draft.quantity_unit ?? "L"}
              onChange={(e) => set("quantity_unit", e.target.value)}>
              {QUANTITY_UNITS.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
            </select>
          </div>
        </Field>
      </Section>

      <Section title="Fuel confirmation">
        <Field label="Max. Sulfur Content">
          <input className={inputCls} value={draft.max_sulphur ?? ""} placeholder="e.g. 10 ppm"
            onChange={(e) => set("max_sulphur", e.target.value)} />
        </Field>
        <span className="hidden sm:block" />
        <Field label="Specification" className="sm:col-span-2">
          <textarea className={cn(inputCls, "min-h-[72px] resize-y")} value={draft.specification ?? ""}
            onChange={(e) => set("specification", e.target.value)} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea className={cn(inputCls, "min-h-[72px] resize-y")} value={draft.description ?? ""}
            onChange={(e) => set("description", e.target.value)} />
        </Field>
      </Section>

      <Section title="Supplier">
        <Field label="Supplier Name" className="sm:col-span-2" hint="A supplier used before fills in their contact details">
          <Typeahead value={draft.supplier ?? ""} onChange={pickSupplier} options={supplierOptions} />
        </Field>
        <Field label="Contact Person">
          <input className={inputCls} value={draft.supplier_contact_person ?? ""}
            onChange={(e) => set("supplier_contact_person", e.target.value)} />
        </Field>
        <Field label="Supplier Contact Number">
          <input className={inputCls} type="tel" value={draft.supplier_contact_number ?? ""}
            onChange={(e) => set("supplier_contact_number", e.target.value)} />
        </Field>
        <Field label="Supplier Email" className="sm:col-span-2">
          <input className={inputCls} type="email" value={draft.supplier_email ?? ""}
            onChange={(e) => set("supplier_email", e.target.value)} />
        </Field>
        <DateTime label="Supplier Arrival" date={draft.supplier_arrival_date} time={draft.supplier_arrival_time}
          onDate={(v) => set("supplier_arrival_date", v)} onTime={(v) => set("supplier_arrival_time", v)} />
        <DateTime label="Bunker Commence" date={draft.bunker_commence_date} time={draft.bunker_commence_time}
          onDate={(v) => set("bunker_commence_date", v)} onTime={(v) => set("bunker_commence_time", v)} />
        <DateTime label="Bunker Complete" date={draft.bunker_complete_date} time={draft.bunker_complete_time}
          onDate={(v) => set("bunker_complete_date", v)} onTime={(v) => set("bunker_complete_time", v)} />
      </Section>

      <Section title="Job">
        <Field label="Assign Team" className="sm:col-span-2">
          <TeamPicker value={draft.assigned_team ?? []} onChange={(v) => set("assigned_team", v)} />
        </Field>
        <Field label="JLS Quote">
          <input className={inputCls} value={draft.jls_quote ?? ""} onChange={(e) => set("jls_quote", e.target.value)} />
        </Field>
        <Field label="Invoice Number">
          <input className={inputCls} value={draft.invoice_number ?? ""} onChange={(e) => set("invoice_number", e.target.value)} />
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
        <span className="hidden sm:block" />
        <Field label="Admin Remarks and Description Related to Job" className="sm:col-span-2"
          hint="Internal — for the JLS operations team only, never shown to the client">
          <textarea className={cn(inputCls, "min-h-[84px] resize-y")} value={draft.admin_remarks ?? ""}
            onChange={(e) => set("admin_remarks", e.target.value)} />
        </Field>
      </Section>

      <div>
        {selected ? (
          <FileSlot label="Filled form from PDF (returned by the client)" files={filledForm}
            onUpload={(f, r) => onAttach("filled_form", f, r)} onRemove={onDetach} />
        ) : (
          <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-[14px] text-muted-foreground">
            The client's filled-in form can be attached once the request is saved.
          </p>
        )}
      </div>

      <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
        <div className="text-[14px] text-muted-foreground">Work Completion Date &amp; Time</div>
        <div className="text-[15px] font-medium">
          {selected?.work_completed_at
            ? stamp(selected.work_completed_at)
            : <span className="text-muted-foreground">Set automatically when the record reaches Complete</span>}
        </div>
      </div>

      {selected && notify}
    </div>
  );
}

function DateTime({
  label, date, time, onDate, onTime,
}: {
  label: string;
  date: string | null | undefined;
  time: string | null | undefined;
  onDate: (v: string | null) => void;
  onTime: (v: string | null) => void;
}) {
  return (
    <>
      <Field label={`${label} Date`}>
        <input className={inputCls} type="date" value={date ?? ""} onChange={(e) => onDate(e.target.value || null)} />
      </Field>
      <Field label={`${label} Time`} hint="24-hour">
        <input className={inputCls} type="time" value={(time ?? "").slice(0, 5)} onChange={(e) => onTime(e.target.value || null)} />
      </Field>
    </>
  );
}

// ── Additional Jobs ─────────────────────────────────────────────────────────

type BunkerJob = {
  id: string;
  project_id: string;
  job_date: string | null;
  description: string | null;
  requestor: string | null;
  created_at: string;
};

/**
 * Ad-hoc jobs done alongside the bunkering. Every cell stays editable (spec:
 * "everything here must remain mutable") and saves when you leave it.
 */
function AdditionalJobsTab({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<BunkerJob[] | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    const { data, error } = await sb.from("orbit2_bunker_jobs").select("*")
      .eq("project_id", projectId).order("job_date", { nullsFirst: false }).order("created_at");
    if (error) { toast.error(errorMessage(error, "Could not load the additional jobs")); setJobs([]); return; }
    setJobs((data ?? []) as BunkerJob[]);
  }
  useEffect(() => { setJobs(null); void load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    setAdding(true);
    const { error } = await sb.from("orbit2_bunker_jobs").insert({
      project_id: projectId, job_date: new Date().toISOString().slice(0, 10), created_by: user?.id ?? null,
    });
    setAdding(false);
    if (error) { toast.error(errorMessage(error, "Could not add a job")); return; }
    await load();
  }

  async function save(id: string, patch: Partial<BunkerJob>) {
    setJobs((list) => list?.map((j) => (j.id === id ? { ...j, ...patch } : j)) ?? list);
    const { error } = await sb.from("orbit2_bunker_jobs").update(patch).eq("id", id);
    if (error) { toast.error(errorMessage(error, "Could not save the job")); await load(); }
  }

  async function remove(j: BunkerJob) {
    if (!confirm(`Remove this job${j.description ? ` — "${j.description}"` : ""}?`)) return;
    const { error } = await sb.from("orbit2_bunker_jobs").delete().eq("id", j.id);
    if (error) { toast.error(errorMessage(error, "Could not remove the job")); return; }
    setJobs((list) => list?.filter((x) => x.id !== j.id) ?? list);
  }

  if (!jobs) return <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] text-muted-foreground">Jobs done alongside this bunkering. Changes save as you leave each field.</p>
        <button onClick={() => void add()} disabled={adding}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[15px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add job
        </button>
      </div>
      {jobs.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[14px] text-muted-foreground">
          No additional jobs logged.
        </p>
      ) : (
        <table className="w-full border-separate border-spacing-0 text-[14px]">
          <thead>
            <tr>
              {["Date", "Job Description", "Requestor", ""].map((c) => (
                <th key={c} className="border-b border-border bg-muted/40 px-2 py-2 text-left font-semibold text-muted-foreground">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => <JobRow key={j.id} job={j} onSave={(p) => void save(j.id, p)} onRemove={() => void remove(j)} />)}
          </tbody>
        </table>
      )}
    </div>
  );
}

function JobRow({ job, onSave, onRemove }: { job: BunkerJob; onSave: (p: Partial<BunkerJob>) => void; onRemove: () => void }) {
  const [desc, setDesc] = useState(job.description ?? "");
  const [req, setReq] = useState(job.requestor ?? "");
  useEffect(() => { setDesc(job.description ?? ""); setReq(job.requestor ?? ""); }, [job.description, job.requestor]);
  const cell = "border-b border-border/40 px-2 py-1.5 align-top";
  return (
    <tr>
      <td className={cn(cell, "w-40")}>
        <input className={cn(inputCls, "py-1.5")} type="date" value={job.job_date ?? ""} aria-label="Date"
          onChange={(e) => onSave({ job_date: e.target.value || null })} />
      </td>
      <td className={cell}>
        <input className={cn(inputCls, "py-1.5")} value={desc} aria-label="Job Description"
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => { if (desc !== (job.description ?? "")) onSave({ description: desc.trim() || null }); }} />
      </td>
      <td className={cn(cell, "w-44")}>
        <input className={cn(inputCls, "py-1.5")} value={req} aria-label="Requestor"
          onChange={(e) => setReq(e.target.value)}
          onBlur={() => { if (req !== (job.requestor ?? "")) onSave({ requestor: req.trim() || null }); }} />
      </td>
      <td className={cn(cell, "w-10 text-right")}>
        <button onClick={onRemove} title="Remove job"
          className="mt-1.5 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

// ── Notes ───────────────────────────────────────────────────────────────────

function NotesTab({
  notes, files, isAdmin, onAddNote, onEditNote, onAttach, onDetach,
}: {
  notes: Orbit2Note[];
  files: Orbit2File[];
  isAdmin: boolean;
  onAddNote: (kind: "remark" | "team_comment", body: string) => Promise<void>;
  onEditNote: (id: string, body: string) => Promise<void>;
  onAttach: (slot: Orbit2File["slot"], file: File, ref: string) => Promise<void>;
  onDetach: (f: { id: string }) => void;
}) {
  const images = files.filter((f) => f.slot === "image");
  return (
    <div className="space-y-4">
      <NoteLog title="Remarks" notes={notes.filter((n) => n.kind === "remark")}
        placeholder="Add a remark — your name, the date and the time are added automatically"
        onAdd={(b) => onAddNote("remark", b)} onEdit={onEditNote} canEdit={isAdmin} />
      <NoteLog title="Team Comments" notes={notes.filter((n) => n.kind === "team_comment")}
        emptyText="Nothing from the field team yet — comments logged in the mobile app appear here."
        placeholder="Add a note on the team's behalf"
        onAdd={(b) => onAddNote("team_comment", b)} />
      <div>
        <div className="mb-1 text-[14px] font-medium text-muted-foreground">Images</div>
        {images.length > 0 && (
          <div className="mb-2 grid grid-cols-3 gap-2">
            {images.map((f) => (
              <figure key={f.id} className="group relative">
                <div className="aspect-square overflow-hidden rounded-md border border-border bg-muted/20">
                  <SignedImage stored={f.storage_ref} alt={f.file_name} className="h-full w-full object-cover" />
                </div>
                <figcaption className="mt-0.5 text-[14px] text-muted-foreground">{stamp(f.created_at)}</figcaption>
                <button onClick={() => onDetach(f)} title="Remove image"
                  className="absolute right-1 top-1 hidden rounded bg-background/90 p-0.5 text-destructive group-hover:block">
                  <X className="h-3.5 w-3.5" />
                </button>
              </figure>
            ))}
          </div>
        )}
        <FileSlot label={images.length ? "Add another image" : "No images yet"} files={[]} accept="image/*"
          onUpload={(f, r) => onAttach("image", f, r)} />
      </div>
    </div>
  );
}

// ── Documents ───────────────────────────────────────────────────────────────

function DocumentsTab({
  files, onAttach, onDetach,
}: {
  files: Orbit2File[];
  onAttach: (slot: Orbit2File["slot"], file: File, ref: string, docName?: string) => Promise<void>;
  onDetach: (f: { id: string }) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [name, setName] = useState("");
  const docs = files.filter((f) => f.slot === "document");
  const slot = (s: Orbit2File["slot"]) =>
    files.filter((f) => f.slot === s).map((f) => ({ id: f.id, file_name: f.file_name, storage_ref: f.storage_ref }));

  function open() { setName(""); setAsking(true); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-semibold">Documents</span>
        <button onClick={open}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[15px] font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Add document
        </button>
      </div>

      {docs.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[14px] text-muted-foreground">
          No documents yet.
        </p>
      ) : (
        <ul className="divide-y divide-border/40 rounded-md border border-border">
          {docs.map((f) => (
            <li key={f.id} className="flex items-center gap-2.5 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <SignedAnchor stored={f.storage_ref} className="block truncate text-[15px] font-medium text-primary hover:underline"
                  title={f.file_name}>
                  {f.doc_name || f.file_name}
                </SignedAnchor>
                <div className="truncate text-[14px] text-muted-foreground">
                  {f.doc_name ? `${f.file_name} · ` : ""}{fmtDMY(f.created_at)}{f.email_id ? " · by email" : ""}
                </div>
              </div>
              <button onClick={() => onDetach(f)} title="Remove document"
                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2.5 sm:grid-cols-2">
        <FileSlot label="Supplier Quote" files={slot("supplier_quote")}
          onUpload={(f, r) => onAttach("supplier_quote", f, r)} onRemove={onDetach} />
        <FileSlot label="Invoice" files={slot("invoice")}
          onUpload={(f, r) => onAttach("invoice", f, r)} onRemove={onDetach} />
      </div>

      {/* "+ Add document" asks for the name first, then takes the file — picked or dropped. */}
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add document</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Document name">
              <input className={inputCls} value={name} autoFocus placeholder="e.g. Bunker delivery note"
                onChange={(e) => setName(e.target.value)} />
            </Field>
            <FileSlot label={name.trim() ? "File" : "Name the document first"} files={[]} disabled={!name.trim()}
              onUpload={async (f, r) => {
                await onAttach("document", f, r, name.trim());
                setAsking(false);
              }} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
