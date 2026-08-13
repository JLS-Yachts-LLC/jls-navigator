/**
 * Generic renderer for a form definition (sections → fields).
 *
 * One component draws every form in the module, so adding or changing a form is a
 * data edit rather than new code. Handles plain fields, checkbox lists and
 * repeatable sections (the tenders/jet-ski table on the Pre-Arrival form).
 *
 * Used both by staff inside Polaris and by the public fill page a yacht opens from
 * its link — the only difference is who saves it.
 */
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FormSection, FormField } from "@/lib/forms/pre-arrival-definition";

export type FormData = Record<string, any>;

export function FormRenderer({
  sections, data, onChange, readOnly = false,
}: {
  sections: FormSection[];
  data: FormData;
  onChange: (next: FormData) => void;
  readOnly?: boolean;
}) {
  const set = (key: string, value: any) => onChange({ ...data, [key]: value });

  /** Rows for a repeatable section, always at least one so there is something to type into. */
  const rows = (key: string): FormData[] => {
    const v = data[key];
    return Array.isArray(v) && v.length ? v : [{}];
  };
  const setRows = (key: string, next: FormData[]) => set(key, next);

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const isChecklist = section.fields.every((f) => f.type === "checkbox");
        return (
          <section key={section.key} className="rounded-xl border border-border bg-card p-5">
            <header className="mb-4">
              <h3 className="font-display text-sm font-semibold">{section.title}</h3>
              {section.description && (
                <p className="mt-1 text-[12px] text-muted-foreground">{section.description}</p>
              )}
            </header>

            {section.repeatable ? (
              <RepeatableSection
                section={section}
                rows={rows(section.key)}
                onChange={(next) => setRows(section.key, next)}
                readOnly={readOnly}
              />
            ) : (
              <div className={cn("grid gap-4", isChecklist ? "grid-cols-1" : "sm:grid-cols-2")}>
                {section.fields.map((f) => (
                  <FieldControl
                    key={f.key}
                    field={f}
                    value={data[f.key]}
                    onChange={(v) => set(f.key, v)}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function FieldControl({
  field, value, onChange, readOnly,
}: {
  field: FormField;
  value: any;
  onChange: (v: any) => void;
  readOnly?: boolean;
}) {
  const id = `f-${field.key}`;

  if (field.type === "checkbox") {
    return (
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-snug">
        <Checkbox id={id} checked={!!value} disabled={readOnly}
          onCheckedChange={(c) => onChange(!!c)} className="mt-0.5" />
        <span>{field.label}</span>
      </label>
    );
  }

  return (
    <div className={cn(field.width === "full" && "sm:col-span-2")}>
      <Label htmlFor={id} className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {field.label}
        {field.required && <span className="ml-1 text-amber-400">*</span>}
      </Label>
      {field.type === "textarea" ? (
        <Textarea id={id} value={value ?? ""} disabled={readOnly} rows={3}
          onChange={(e) => onChange(e.target.value)} className="mt-1" />
      ) : field.type === "select" ? (
        <select
          id={id}
          value={value ?? ""}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">—</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <Input
          id={id}
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type}
          value={value ?? ""}
          disabled={readOnly}
          onChange={(e) => onChange(field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
          className="mt-1"
        />
      )}
      {field.help && <p className="mt-1 text-[11px] text-muted-foreground">{field.help}</p>}
    </div>
  );
}

/** A table the filler adds rows to — tenders, jet skis and other appurtenances. */
function RepeatableSection({
  section, rows, onChange, readOnly,
}: {
  section: FormSection;
  rows: FormData[];
  onChange: (next: FormData[]) => void;
  readOnly?: boolean;
}) {
  const setCell = (i: number, key: string, v: any) =>
    onChange(rows.map((r, ri) => (ri === i ? { ...r, [key]: v } : r)));

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <Fragment key={i}>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                #{i + 1}
              </span>
              {!readOnly && rows.length > 1 && (
                <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                  onClick={() => onChange(rows.filter((_, ri) => ri !== i))} title="Remove this row">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.fields.map((f) => (
                <FieldControl key={f.key} field={f} value={row[f.key]}
                  onChange={(v) => setCell(i, f.key, v)} readOnly={readOnly} />
              ))}
            </div>
          </div>
        </Fragment>
      ))}
      {!readOnly && (
        <Button type="button" variant="outline" size="sm" className="gap-1.5"
          onClick={() => onChange([...rows, {}])}>
          <Plus className="h-3.5 w-3.5" /> Add another
        </Button>
      )}
    </div>
  );
}
