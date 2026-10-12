/**
 * Orbit 2 — a managed boat's Service Calendar (Maintenance Schedule tab,
 * client request, 12 Oct 2026).
 *
 * Tracks safety equipment and engine services: when each was last done, when
 * it's next due by date and/or by engine running hours, the current hours
 * reading, and the service reports. Rows live in orbit2_boat_services, reports
 * in orbit2_boat_service_files (migration 20261012100000).
 *
 * Inventory List items with an expiry date (the liferaft, flares, extinguishers…)
 * join the calendar automatically, read from the inventory — their expiry is
 * changed on the Inventory List, so there's one place to keep it.
 *
 * Anything overdue shows red; due within 30 days or 25 running hours, amber.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/error-message";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { SignedAnchor } from "@/components/ui/signed-file";
import { suggestionsFor, type Orbit2Boat, type Orbit2BoatInventoryItem } from "./orbit2-data";
import { Field, inputCls, Typeahead, FileSlot, type UploadedFile } from "./orbit2-fields";

const sb = supabase as any;

export type Orbit2BoatService = {
  id: string;
  boat_id: string;
  service: string;
  last_service_date: string | null;
  next_service_date: string | null;
  current_run_hours: number | null;
  next_service_run_hours: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
type ServiceFile = UploadedFile & { service_id: string };

/** Offered in the Services field alongside anything already used on the boat. */
const COMMON_SERVICES = [
  "Engine Service (Port)", "Engine Service (Starboard)", "Outboard Service", "Generator Service",
  "Liferaft Service", "Flares", "Fire Extinguishers", "EPIRB Battery", "Antifouling", "Impeller Change",
];
const DUE_SOON_DAYS = 30;
const DUE_SOON_HOURS = 25;
const COLUMNS = ["Services", "Date of Service", "Next Service Date", "Current Run Hrs", "Next Serv Run Hrs", "Documents"];

type Due = "overdue" | "soon" | "ok";
const today = () => new Date().toISOString().slice(0, 10);
const ukDate = (iso: string | null) => iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const hrs = (n: number | null) => n == null ? "—" : Number(n).toLocaleString("en-GB", { maximumFractionDigits: 1 });

function dateDue(next: string | null): Due {
  if (!next) return "ok";
  const days = (new Date(`${next}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / 86_400_000;
  return days < 0 ? "overdue" : days <= DUE_SOON_DAYS ? "soon" : "ok";
}
function hoursDue(current: number | null, next: number | null): Due {
  if (current == null || next == null) return "ok";
  return current >= next ? "overdue" : next - current <= DUE_SOON_HOURS ? "soon" : "ok";
}
const dueCls = (d: Due) => d === "overdue" ? "font-semibold text-[#E87050]" : d === "soon" ? "font-semibold text-[#E8A020]" : "text-muted-foreground";
const rank = (d: Due) => (d === "overdue" ? 0 : d === "soon" ? 1 : 2);

type Row =
  | { kind: "service"; key: string; s: Orbit2BoatService; dDue: Due; hDue: Due }
  | { kind: "inventory"; key: string; item: Orbit2BoatInventoryItem; dDue: Due };

export function ServiceCalendar({ boat, inventory, query, adding, setAdding }: {
  boat: Orbit2Boat;
  inventory: Orbit2BoatInventoryItem[];
  query: string;
  adding: boolean;
  setAdding: (v: boolean) => void;
}) {
  const [services, setServices] = useState<Orbit2BoatService[]>([]);
  const [files, setFiles] = useState<ServiceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Orbit2BoatService | null>(null);

  async function load() {
    const { data, error } = await sb.from("orbit2_boat_services").select("*").eq("boat_id", boat.id);
    if (error) { toast.error(errorMessage(error, "Could not load the service calendar")); setLoading(false); return; }
    const rows = (data ?? []) as Orbit2BoatService[];
    const ids = rows.map((r) => r.id);
    const f = ids.length
      ? await sb.from("orbit2_boat_service_files").select("id, service_id, file_name, storage_ref").in("service_id", ids).order("created_at")
      : { data: [] };
    setServices(rows);
    setFiles((f.data ?? []) as ServiceFile[]);
    setLoading(false);
  }
  useEffect(() => { setLoading(true); void load(); }, [boat.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filesFor = (id: string) => files.filter((f) => f.service_id === id);

  // Most urgent first: overdue, then due soon, then by next date (undated last).
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all: Row[] = [
      ...services.map((s) => ({ kind: "service" as const, key: s.id, s, dDue: dateDue(s.next_service_date), hDue: hoursDue(s.current_run_hours, s.next_service_run_hours) })),
      ...inventory.filter((i) => i.expiry_date).map((item) => ({ kind: "inventory" as const, key: `inv-${item.id}`, item, dDue: dateDue(item.expiry_date) })),
    ];
    const name = (r: Row) => (r.kind === "service" ? r.s.service : r.item.item);
    const next = (r: Row) => (r.kind === "service" ? r.s.next_service_date : r.item.expiry_date) ?? "9999-12-31";
    const worst = (r: Row) => Math.min(rank(r.dDue), r.kind === "service" ? rank(r.hDue) : 2);
    return all
      .filter((r) => !q || name(r).toLowerCase().includes(q))
      .sort((a, b) => worst(a) - worst(b) || next(a).localeCompare(next(b)) || name(a).localeCompare(name(b)));
  }, [services, inventory, query]);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-y border-border/60 bg-muted/10">
              {COLUMNS.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-muted-foreground">{c}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {(loading || rows.length === 0) && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-[15px] text-muted-foreground">
                  {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    : query.trim() ? "Nothing matches that search."
                    : "Nothing scheduled yet — press Add for an engine or safety equipment service. Inventory items with an expiry date appear here by themselves."}
                </td>
              </tr>
            )}
            {!loading && rows.map((r) => r.kind === "service" ? (
              <tr key={r.key} onClick={() => setEditing(r.s)} className="cursor-pointer hover:bg-muted/20">
                <td className="px-3 py-2 font-medium text-primary">{r.s.service}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{ukDate(r.s.last_service_date)}</td>
                <td className={cn("whitespace-nowrap px-3 py-2", dueCls(r.dDue))}>{ukDate(r.s.next_service_date)}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">{hrs(r.s.current_run_hours)}</td>
                <td className={cn("whitespace-nowrap px-3 py-2 tabular-nums", dueCls(r.hDue))}>{hrs(r.s.next_service_run_hours)}</td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  {filesFor(r.s.id).length === 0 ? (
                    <button onClick={() => setEditing(r.s)} className="text-[13px] text-primary hover:underline">Attach</button>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {filesFor(r.s.id).map((d) => (
                        <SignedAnchor key={d.id} stored={d.storage_ref} title={d.file_name}
                          className="flex max-w-[10rem] items-center gap-1 truncate text-[13px] text-primary hover:underline">
                          <Paperclip className="h-3 w-3 shrink-0" /> <span className="truncate">{d.file_name}</span>
                        </SignedAnchor>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              <tr key={r.key} title="From the Inventory List — change the expiry date there">
                <td className="px-3 py-2">
                  <span className="font-medium">{r.item.item}</span>
                  <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[12px] text-muted-foreground">Inventory</span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">—</td>
                <td className={cn("whitespace-nowrap px-3 py-2", dueCls(r.dDue))}>{ukDate(r.item.expiry_date)}</td>
                <td className="px-3 py-2 text-muted-foreground">—</td>
                <td className="px-3 py-2 text-muted-foreground">—</td>
                <td className="px-3 py-2 text-muted-foreground">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(adding || editing) && (
        <ServiceEditor boat={boat} existing={editing} existingFiles={editing ? filesFor(editing.id) : []}
          suggestions={suggestionsFor(services.map((s) => s.service), COMMON_SERVICES)}
          onClose={() => { setEditing(null); setAdding(false); }} reload={load} />
      )}
    </>
  );
}

// ── One service line — add, view, edit ───────────────────────────────────────

type ServiceForm = { service: string; last: string; next: string; current: string; nextHours: string; notes: string };

function ServiceEditor({ boat, existing, existingFiles, suggestions, onClose, reload }: {
  boat: Orbit2Boat;
  existing: Orbit2BoatService | null;
  existingFiles: ServiceFile[];
  suggestions: string[];
  onClose: () => void;
  reload: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<ServiceForm>(existing ? {
    service: existing.service, last: existing.last_service_date ?? "", next: existing.next_service_date ?? "",
    current: existing.current_run_hours != null ? String(existing.current_run_hours) : "",
    nextHours: existing.next_service_run_hours != null ? String(existing.next_service_run_hours) : "",
    notes: existing.notes ?? "",
  } : { service: "", last: "", next: "", current: "", nextHours: "", notes: "" });
  // Reports: an existing line saves them as they're attached; a new line holds
  // them (already uploaded) until it is saved.
  const [docs, setDocs] = useState<UploadedFile[]>(existingFiles);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ServiceForm>(k: K, v: ServiceForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/,/g, "")));

  async function attach(file: File, ref: string) {
    if (!existing) { setDocs((d) => [...d, { id: `new-${crypto.randomUUID()}`, file_name: file.name, storage_ref: ref }]); return; }
    const { data, error } = await sb.from("orbit2_boat_service_files")
      .insert({ service_id: existing.id, file_name: file.name, storage_ref: ref, uploaded_by: user?.id ?? null })
      .select("id, file_name, storage_ref").single();
    if (error) { toast.error(errorMessage(error, "Could not attach")); return; }
    setDocs((d) => [...d, data as UploadedFile]);
    await reload();
  }

  async function detach(f: UploadedFile) {
    if (f.id.startsWith("new-")) { setDocs((d) => d.filter((x) => x.id !== f.id)); return; }
    const { error } = await sb.from("orbit2_boat_service_files").delete().eq("id", f.id);
    if (error) { toast.error(errorMessage(error, "Could not remove")); return; }
    setDocs((d) => d.filter((x) => x.id !== f.id));
    await reload();
  }

  async function save() {
    if (!form.service.trim()) { toast.error("Name the service."); return; }
    const current = num(form.current), nextHours = num(form.nextHours);
    if ([current, nextHours].some((n) => n != null && (!Number.isFinite(n) || n < 0))) { toast.error("Running hours must be numbers."); return; }
    if (form.last && form.next && form.next < form.last) { toast.error("The next service date is before the last one."); return; }
    setSaving(true);
    try {
      const values = {
        service: form.service.trim(), last_service_date: form.last || null, next_service_date: form.next || null,
        current_run_hours: current, next_service_run_hours: nextHours, notes: form.notes.trim() || null,
      };
      if (existing) {
        const { error } = await sb.from("orbit2_boat_services").update(values).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("orbit2_boat_services")
          .insert({ ...values, boat_id: boat.id, created_by: user?.id ?? null }).select("id").single();
        if (error) throw error;
        if (docs.length) {
          const { error: fe } = await sb.from("orbit2_boat_service_files").insert(docs.map((d) => ({
            service_id: data.id, file_name: d.file_name, storage_ref: d.storage_ref, uploaded_by: user?.id ?? null,
          })));
          if (fe) toast.error(errorMessage(fe, "The service saved, but its documents did not — attach them again"));
        }
      }
      toast.success(`${values.service} ${existing ? "saved" : "added"}`);
      await reload();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, "Could not save the service"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing || !confirm(`Remove ${existing.service} from the service calendar? Its documents go with it.`)) return;
    const { error } = await sb.from("orbit2_boat_services").delete().eq("id", existing.id);
    if (error) { toast.error(errorMessage(error, "Could not remove")); return; }
    toast.success(`${existing.service} removed`);
    await reload();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-[15px] font-semibold text-muted-foreground">{existing ? existing.service : "New Service"} — {boat.name}</span>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-5">
          <Field label="Service" hint="e.g. Engine Service (Port), Liferaft Service, Flares">
            <Typeahead value={form.service} onChange={(v) => set("service", v)} options={suggestions} />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Date of Service"><input className={inputCls} type="date" value={form.last} onChange={(e) => set("last", e.target.value)} /></Field>
            <Field label="Next Service Date"><input className={inputCls} type="date" value={form.next} onChange={(e) => set("next", e.target.value)} /></Field>
            <Field label="Current Run Hrs"><input className={inputCls} inputMode="decimal" placeholder="e.g. 412" value={form.current} onChange={(e) => set("current", e.target.value)} /></Field>
            <Field label="Next Serv Run Hrs"><input className={inputCls} inputMode="decimal" placeholder="e.g. 500" value={form.nextHours} onChange={(e) => set("nextHours", e.target.value)} /></Field>
          </div>
          <p className="text-[14px] text-muted-foreground">
            Fill in the dates, the running hours, or both — whichever comes first is flagged: red when overdue, amber within {DUE_SOON_DAYS} days or {DUE_SOON_HOURS} hours.
          </p>
          <Field label="Notes">
            <textarea className={cn(inputCls, "min-h-[60px] resize-y")} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          <FileSlot label="Documents — service reports, certificates" files={docs} onUpload={attach} onRemove={(f) => void detach(f)} />
        </div>

        <div className="flex justify-between gap-2 border-t border-border px-5 py-3">
          {existing ? (
            <button onClick={() => void remove()} disabled={saving} className="rounded-md border border-border px-3 py-2 text-[15px] text-destructive hover:bg-destructive/10 disabled:opacity-50">Remove</button>
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
