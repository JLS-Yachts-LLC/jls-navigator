/**
 * The warehouse request form — one form for all three kinds (incoming, picking, dispatch), showing only what each kind needs,
 * with documents and photos attachable. Used to raise a request and to change one.
 */
import { useRef } from "react";
import { Camera, FileUp, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { guardUploadFile } from "@/lib/upload-guard";
import {
  emptyLine, requestProblems, TYPE_LABEL, TYPE_BLURB, DOC_TYPES, UNITS,
  type RequestFormInput, type RequestLineInput,
} from "@/lib/warehouse/requests-model";
import type { PendingFile } from "@/lib/warehouse/requests";

const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-1", className)}><Label className="text-sm">{label}</Label>{children}</div>;
}

/** Documents and photos chosen on the form, waiting to be uploaded with the request. */
export function FilePicker({ files, onChange, docTypes, hint }: {
  files: PendingFile[]; onChange: (f: PendingFile[]) => void;
  /** The document types to choose from (default: the warehouse ones). */
  docTypes?: readonly string[];
  hint?: string;
}) {
  const types = (docTypes ?? DOC_TYPES.filter((t) => t !== "Photo")).filter((t) => t !== "Photo");
  const docs = useRef<HTMLInputElement>(null);
  const photos = useRef<HTMLInputElement>(null);

  function add(list: FileList | null, kind: "document" | "photo") {
    if (!list) return;
    const ok: PendingFile[] = [];
    for (const file of Array.from(list)) {
      if (!guardUploadFile(file, { accepts: kind === "photo" ? "a photo" : "a document, spreadsheet or photo" })) continue;
      ok.push({ file, kind, docType: kind === "photo" ? "Photo" : types.includes("Other") ? "Other" : types[0] });
    }
    if (ok.length) onChange([...files, ...ok]);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => docs.current?.click()}><FileUp className="h-4 w-4" /> Attach documents</Button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => photos.current?.click()}><Camera className="h-4 w-4" /> Attach photos</Button>
        <input ref={docs} type="file" multiple className="hidden" onChange={(e) => { add(e.target.files, "document"); e.target.value = ""; }} />
        <input ref={photos} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { add(e.target.files, "photo"); e.target.value = ""; }} />
      </div>
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">{hint ?? "Delivery order, packing list, invoice, shipping documents or photos — add what you have; more can be added later."}</p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.file.name}-${i}`} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{f.file.name}</span>
              {f.kind === "document" ? (
                <select className="h-8 rounded border border-input bg-background px-1.5 text-sm" value={f.docType}
                  onChange={(e) => onChange(files.map((x, j) => (j === i ? { ...x, docType: e.target.value } : x)))} aria-label="Document type">
                  {types.map((t) => <option key={t}>{t}</option>)}
                </select>
              ) : <span className="text-muted-foreground">Photo</span>}
              <button type="button" aria-label={`Remove ${f.file.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LineEditor({ line, n, onChange, onRemove, canRemove }: {
  line: RequestLineInput; n: number; onChange: (l: RequestLineInput) => void; onRemove: () => void; canRemove: boolean;
}) {
  const set = (k: keyof RequestLineInput, v: string | boolean) => onChange({ ...line, [k]: v });
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between"><span className="text-sm font-semibold">Item {n}</span>
        {canRemove && <button type="button" onClick={onRemove} aria-label={`Remove item ${n}`} className="rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>}
      </div>
      <Field label="Description"><Input value={line.description} onChange={(e) => set("description", e.target.value)} placeholder="What is it?" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Quantity"><Input type="number" inputMode="decimal" min={0} value={line.quantity} onChange={(e) => set("quantity", e.target.value)} /></Field>
        <Field label="Unit"><select className={selectCls} value={line.unit} onChange={(e) => set("unit", e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={line.oversized} onChange={(e) => set("oversized", e.target.checked)} /> Large crate or oversized cargo (give dimensions and weight)</label>
      {line.oversized && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([["length", "Length (cm)"], ["width", "Width (cm)"], ["height", "Height (cm)"], ["weight", "Weight (kg)"]] as const).map(([k, label]) => (
            <Field key={k} label={label}><Input type="number" inputMode="decimal" min={0} value={line[k]} onChange={(e) => set(k, e.target.value)} /></Field>
          ))}
        </div>
      )}
    </div>
  );
}

export function RequestForm({ value, onChange, files, onFiles, showFiles = true }: {
  value: RequestFormInput; onChange: (v: RequestFormInput) => void; files: PendingFile[]; onFiles: (f: PendingFile[]) => void; showFiles?: boolean;
}) {
  const t = value.type;
  const set = <K extends keyof RequestFormInput>(k: K, v: RequestFormInput[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{TYPE_BLURB[t]}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t === "dispatch" ? "Destination yacht" : "Yacht or project reference"}>
          <Input value={t === "dispatch" ? value.destination : value.yacht} onChange={(e) => (t === "dispatch" ? onChange({ ...value, destination: e.target.value, yacht: e.target.value }) : set("yacht", e.target.value))} />
        </Field>
        <Field label={t === "incoming" ? "Delivery order / reference (if any)" : "AWB or shipment reference (if any)"}>
          <Input value={value.reference} onChange={(e) => set("reference", e.target.value)} />
        </Field>
        {t === "incoming" && <Field label="Expected arrival (ETA)"><Input type="datetime-local" value={value.eta} onChange={(e) => set("eta", e.target.value)} /></Field>}
        {t !== "incoming" && <Field label={t === "dispatch" ? "Required delivery date and time" : "Needed by"}><Input type="datetime-local" value={value.requiredAt} onChange={(e) => set("requiredAt", e.target.value)} /></Field>}
      </div>

      {t === "dispatch" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Berth / location" className="sm:col-span-2"><Input value={value.berth} onChange={(e) => set("berth", e.target.value)} placeholder="Marina, berth or address" /></Field>
          <Field label="Recipient name"><Input value={value.recipientName} onChange={(e) => set("recipientName", e.target.value)} /></Field>
          <Field label="Recipient phone"><Input value={value.recipientPhone} onChange={(e) => set("recipientPhone", e.target.value)} /></Field>
          <Field label="Recipient email" className="sm:col-span-2"><Input type="email" value={value.recipientEmail} onChange={(e) => set("recipientEmail", e.target.value)} /></Field>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Items</h4>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => set("lines", [...value.lines, emptyLine()])}><Plus className="h-4 w-4" /> Add item</Button>
        </div>
        {value.lines.map((l, i) => (
          <LineEditor key={i} line={l} n={i + 1} canRemove={value.lines.length > 1}
            onChange={(nl) => set("lines", value.lines.map((x, j) => (j === i ? nl : x)))}
            onRemove={() => set("lines", value.lines.filter((_, j) => j !== i))} />
        ))}
      </div>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={value.urgent} onChange={(e) => set("urgent", e.target.checked)} /> This is urgent</label>
        {value.urgent && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Why is it urgent?" className="sm:col-span-2"><Input value={value.urgentReason} onChange={(e) => set("urgentReason", e.target.value)} /></Field>
            <Field label="Deadline"><Input type="datetime-local" value={value.deadline} onChange={(e) => set("deadline", e.target.value)} /></Field>
          </div>
        )}
      </div>

      <Field label="Notes (special handling, anything the Warehouse should know)"><Textarea rows={3} value={value.notes} onChange={(e) => set("notes", e.target.value)} /></Field>

      {showFiles && <div className="space-y-1.5"><h4 className="text-sm font-semibold">Documents and photos</h4><FilePicker files={files} onChange={onFiles} /></div>}
    </div>
  );
}

/** Show the problems with a form, if any; true when it is ready to send. */
export function checkForm(v: RequestFormInput): boolean {
  const problems = requestProblems(v);
  if (problems.length === 0) return true;
  toast.error(problems[0], { description: problems.length > 1 ? `…and ${problems.length - 1} more to fix.` : undefined });
  return false;
}

export { TYPE_LABEL };
