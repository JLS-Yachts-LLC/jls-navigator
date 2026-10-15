import { useState } from "react";
import { getFormDef, type FormField } from "@/lib/anchor-forms/definitions";
import { AGENT_KEYS } from "@/lib/anchor-forms/prefill";
import { cn } from "@/lib/utils";
import { ChevronDown, ClipboardList, CheckCircle2 } from "lucide-react";

// The forms in a campaign pack that the vessel completes before signing. What we
// already hold is pre-filled (and can be corrected); the empty fields come first.
// JLS's own agent details are never shown for editing. Light, explicit colours —
// this sits on the public signing page.

export type PackForm = { index: number; key: string; title: string; signs: boolean; values: Record<string, string> };
export type PackValues = Record<string, Record<string, string>>;

const inputCls = "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40";

const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function FieldInput({ field, value, onChange }: { field: FormField; value: string; onChange: (v: string) => void }) {
  if (field.type === "textarea") return <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} className={inputCls} />;
  if (field.type === "select") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">Select…</option>
        {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  // A date we pre-filled in letter style ("14-Oct-26") stays as text.
  const type = field.type === "date" ? (!value || isIsoDate(value) ? "date" : "text")
    : field.type === "time" ? "time" : field.type === "number" ? "number" : field.type === "email" ? "email" : "text";
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} className={inputCls} />;
}

/** Required fields still empty across the pack, as "Form: Field" labels. */
export function missingPackFields(forms: PackForm[], values: PackValues): string[] {
  const out: string[] = [];
  for (const f of forms) {
    const def = getFormDef(f.key);
    if (!def) continue;
    for (const fld of def.sections.flatMap((s) => s.fields)) {
      if (fld.required && !AGENT_KEYS.has(fld.key) && !String(values[f.index]?.[fld.key] ?? "").trim()) out.push(`${f.title}: ${fld.label}`);
    }
  }
  return out;
}

function OneForm({ form, values, onChange }: { form: PackForm; values: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const def = getFormDef(form.key);
  const [showFilled, setShowFilled] = useState(false);
  if (!def) return null;
  const fields = def.sections.flatMap((s) => s.fields).filter((f) => !AGENT_KEYS.has(f.key));
  // Split on what we pre-filled (not on what they've typed since), so fields don't jump around.
  const prefilled = fields.filter((f) => String(form.values[f.key] ?? "").trim());
  const toDo = fields.filter((f) => !String(form.values[f.key] ?? "").trim());
  const done = toDo.filter((f) => String(values[f.key] ?? "").trim()).length;
  const set = (k: string, v: string) => onChange({ ...values, [k]: v });
  const grid = (list: FormField[]) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {list.map((f) => (
        <label key={f.key} className={cn("block", (f.full || f.type === "textarea") && "sm:col-span-2")}>
          <span className="mb-1 block text-xs font-medium text-slate-600">{f.label}{f.required && <span className="text-red-600"> *</span>}</span>
          <FieldInput field={f} value={values[f.key] ?? ""} onChange={(v) => set(f.key, v)} />
        </label>
      ))}
    </div>
  );

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-slate-900">{form.title}</h3>
        <span className="text-xs text-slate-500">
          {toDo.length ? `${done} of ${toDo.length} to complete` : "Nothing left to fill in"}
          {!form.signs && " · signed by JLS as your agent"}
        </span>
      </div>
      {toDo.length > 0 && <div className="mt-3">{grid(toDo)}</div>}
      {prefilled.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowFilled((v) => !v)} className="flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> We filled in {prefilled.length} detail{prefilled.length === 1 ? "" : "s"} from our records — {showFilled ? "hide" : "check them"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition", showFilled && "rotate-180")} />
          </button>
          {showFilled && <div className="mt-3">{grid(prefilled)}</div>}
        </div>
      )}
    </div>
  );
}

export function PackForms({ forms, values, onChange }: { forms: PackForm[]; values: PackValues; onChange: (v: PackValues) => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold text-slate-900"><ClipboardList className="h-4 w-4 text-slate-500" /> Complete the details</h2>
      <p className="mt-1 text-sm text-slate-500">We've filled in what we already hold for your vessel. Please complete the rest and check our details, then preview and sign below.</p>
      <div className="mt-4 space-y-3">
        {forms.map((f) => (
          <OneForm key={f.index} form={f} values={values[f.index] ?? {}} onChange={(v) => onChange({ ...values, [f.index]: v })} />
        ))}
      </div>
    </div>
  );
}
