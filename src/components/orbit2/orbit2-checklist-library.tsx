/**
 * Managed Boats — the checklist library.
 *
 * Every checklist form Polaris can fill: the three RYA forms, and any other
 * checklist an admin adds by dropping its PDF here (see the form editor).
 * An added checklist is either used as a boat's DMA / FMA checklist or is an
 * "additional" checklist that individual boats carry — each boat profile
 * picks which ones it needs, and each then works exactly like the RYA one:
 * View checklist, tick / remark / photograph, Assign Team, Generate form.
 */
import { useCallback, useEffect, useState } from "react";
import { FileDown, FileUp, Library, ListChecks, Loader2, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/error-message";
import { fillChecklistForm, type ChecklistFormDef } from "@/lib/orbit2/checklist-form";
import { ChecklistFormEditor } from "./orbit2-checklist-form-editor";
import { InspectionChecklist, ryaChecklistLabel } from "./orbit2-boat-checklist";
import type { Orbit2Boat, Orbit2BoatInventoryItem } from "./orbit2-data";

const sb = supabase as any;

type FormRow = ChecklistFormDef & { items: number; placed: number };

/** Every active checklist form, with how many items it has and how many are placed on the PDF. */
export function useChecklistForms() {
  const [forms, setForms] = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const [f, t] = await Promise.all([
      sb.from("orbit2_checklist_forms").select("*").eq("active", true).order("name"),
      sb.from("orbit2_checklist_templates").select("form_id, pdf_page").eq("active", true).not("form_id", "is", null),
    ]);
    if (f.error) toast.error(errorMessage(f.error, "Could not load the checklists"));
    const counts = new Map<string, { items: number; placed: number }>();
    for (const r of (t.data ?? []) as { form_id: string; pdf_page: number | null }[]) {
      const c = counts.get(r.form_id) ?? { items: 0, placed: 0 };
      c.items += 1; if (r.pdf_page != null) c.placed += 1;
      counts.set(r.form_id, c);
    }
    setForms(((f.data ?? []) as ChecklistFormDef[]).map((x) => ({ ...x, ...(counts.get(x.id) ?? { items: 0, placed: 0 }) })));
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { forms, loading, reload: load };
}

const formUse = (f: ChecklistFormDef) =>
  f.regime === "rya" ? `RYA · ${ryaChecklistLabel(f.category)}` : f.regime ? `${f.regime.toUpperCase()} checklist` : "Additional checklist";

/** Download the form with every box ticked and every header field labelled — to check the layout on paper. */
async function testFill(f: ChecklistFormDef) {
  const { data } = await sb.from("orbit2_checklist_templates").select("pdf_page, pdf_x, pdf_y, pdf_no_x").eq("form_id", f.id).eq("active", true);
  const values: Record<string, string> = {};
  for (const h of f.header_fields ?? []) values[h.key === "custom" ? `custom:${h.label}` : h.key] = `[${h.label}]`;
  const bytes = await fillChecklistForm(f, values, ((data ?? []) as any[]).map((r) => ({ ...r, checked: true })));
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function ChecklistLibrary({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const { forms, loading, reload } = useChecklistForms();
  const [editing, setEditing] = useState<{ file: File } | { form: ChecklistFormDef } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  function pick(file: File | undefined) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      toast.error(/\.(docx?|xlsx?)$/i.test(file.name)
        ? "Save the checklist as a PDF first (File → Save As → PDF), then drop the PDF here."
        : "Drop the checklist as a PDF.");
      return;
    }
    setEditing({ file });
  }

  async function retire(f: FormRow) {
    if (!confirm(`Remove "${f.name}" from the library? Boats stop showing it; past ticks and generated forms are kept.`)) return;
    const { error } = await sb.from("orbit2_checklist_forms").update({ active: false }).eq("id", f.id);
    if (error) { toast.error(errorMessage(error, "Could not remove it")); return; }
    toast.success(`${f.name} removed`);
    await reload();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <div className="flex items-center gap-2 font-display text-[20px] font-bold"><Library className="h-5 w-5 text-primary" /> Checklist library</div>
            <div className="text-[14px] text-muted-foreground">Every checklist Polaris can tick and fill. Add one by dropping its PDF below.</div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-5 w-5" /></button>
        </div>

        {isAdmin && (
          <label
            onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files?.[0]); }}
            className={cn("mx-5 mt-4 flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition",
              dragOver ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-accent/40")}>
            <FileUp className="h-7 w-7 text-primary" />
            <div className="text-[15px] font-semibold">{dragOver ? "Drop to read the checklist" : "Drop a checklist PDF here, or click to choose"}</div>
            <div className="max-w-md text-[13px] text-muted-foreground">
              Polaris reads the items, where each tick goes and the header fields, then shows them on the page for you to check before saving.
              Works with forms that have a "Check" column — Word or Excel checklists: save as PDF first.
            </div>
            <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <ul className="divide-y divide-border/50 rounded-xl border border-border">
              {forms.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <ListChecks className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{f.name}{f.code ? <span className="ml-2 text-[13px] font-normal text-muted-foreground">{f.code}</span> : null}</div>
                    <div className="text-[13px] text-muted-foreground">
                      {formUse(f)} · {f.items} items · <span className={f.placed === f.items ? "text-emerald-600" : "text-warning"}>{f.placed} placed on the form</span> · {f.header_fields?.length ?? 0} header fields
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { setBusy(f.id); void testFill(f).catch((e) => toast.error(errorMessage(e, "Could not build the test form"))).finally(() => setBusy(null)); }}
                      className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[13px] font-medium hover:bg-accent" title="Every box ticked, every header field labelled">
                      {busy === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} Test fill
                    </button>
                    {isAdmin && f.pdf_ref && (
                      <button onClick={() => setEditing({ form: f })} className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[13px] font-medium hover:bg-accent">
                        <Pencil className="h-3.5 w-3.5" /> Edit layout
                      </button>
                    )}
                    {isAdmin && f.regime !== "rya" && (
                      <button onClick={() => void retire(f)} title="Remove from the library" className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {editing && <ChecklistFormEditor input={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
    </div>
  );
}

/**
 * The boat profile's "Additional checklists": the library checklists this boat
 * carries, each worked like the RYA one, plus a picker to add another.
 */
export function BoatAdditionalChecklists({ boat, inventory, isAdmin, authorName, onDocumentAdded, onAssignTeam }: {
  boat: Orbit2Boat; inventory: Orbit2BoatInventoryItem[]; isAdmin: boolean; authorName: string;
  onDocumentAdded?: () => Promise<void> | void;
  onAssignTeam: (form: ChecklistFormDef) => void;
}) {
  const { forms, reload: reloadForms } = useChecklistForms();
  const [assigned, setAssigned] = useState<string[]>([]);
  const [library, setLibrary] = useState(false);
  const load = useCallback(async () => {
    const { data } = await sb.from("orbit2_boat_checklist_forms").select("form_id").eq("boat_id", boat.id);
    setAssigned(((data ?? []) as { form_id: string }[]).map((r) => r.form_id));
  }, [boat.id]);
  useEffect(() => { void load(); }, [load]);

  const additional = forms.filter((f) => !f.regime);
  const mine = additional.filter((f) => assigned.includes(f.id));
  const available = additional.filter((f) => !assigned.includes(f.id));

  async function add(formId: string) {
    if (!formId) return;
    const { error } = await sb.from("orbit2_boat_checklist_forms").insert({ boat_id: boat.id, form_id: formId });
    if (error) { toast.error(errorMessage(error, "Could not add the checklist")); return; }
    await load();
  }
  async function drop(f: ChecklistFormDef) {
    if (!confirm(`Stop using "${f.name}" on ${boat.name}? Its ticks are kept if you add it back.`)) return;
    const { error } = await sb.from("orbit2_boat_checklist_forms").delete().eq("boat_id", boat.id).eq("form_id", f.id);
    if (error) { toast.error(errorMessage(error, "Could not remove it")); return; }
    await load();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[15px] font-semibold uppercase tracking-wide">Additional checklists</div>
        <div className="flex items-center gap-2">
          {available.length > 0 && (
            <select value="" onChange={(e) => void add(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-[14px]">
              <option value="">+ Add a checklist to this boat…</option>
              {available.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          <button onClick={() => setLibrary(true)} className="flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[14px] font-medium hover:bg-accent">
            <Library className="h-4 w-4" /> Library{isAdmin ? " / add new" : ""}
          </button>
        </div>
      </div>
      {mine.length === 0 ? (
        <p className="text-[14px] text-muted-foreground">
          {additional.length ? "None on this boat yet — add one from the list." : `No additional checklists in the library yet${isAdmin ? " — open the Library and drop a checklist PDF in." : "."}`}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {mine.map((f) => (
            <div key={f.id} className="rounded-xl border border-border bg-background/40 p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold">{f.name}</div>
                  {f.code && <div className="text-[13px] text-muted-foreground">{f.code}</div>}
                </div>
                <button onClick={() => void drop(f)} title="Stop using on this boat" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="h-4 w-4" /></button>
              </div>
              <InspectionChecklist boat={boat} formId={f.id} inventory={inventory} isAdmin={isAdmin} authorName={authorName}
                onDocumentAdded={onDocumentAdded} onAssignTeam={() => onAssignTeam(f)} />
            </div>
          ))}
        </div>
      )}
      {library && <ChecklistLibrary isAdmin={isAdmin} onClose={() => { setLibrary(false); void reloadForms(); }} />}
    </div>
  );
}

/** A plain "+" button for places that just need to open the library. */
export function ChecklistLibraryButton({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-[15px] font-medium hover:bg-accent">
        <Library className="h-4 w-4" /> Checklists
      </button>
      {open && <ChecklistLibrary isAdmin={isAdmin} onClose={() => setOpen(false)} />}
    </>
  );
}

