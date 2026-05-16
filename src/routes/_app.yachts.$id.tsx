import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/status-pill";
import { YACHT_COLUMNS } from "@/lib/yacht-fields";
import { ArrowLeft, Trash2, Ship, Pencil, Save, X, Upload } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const doPushToSharePoint = createServerFn({ method: 'POST' })
  .handler(async (ctx: { data: { yachtId: string } }) => {
    try {
      const { pushYachtToSharePoint } = await import('@/lib/sharepoint-sync.server')
      await pushYachtToSharePoint(ctx.data.yachtId)
    } catch {
      // SharePoint push is non-critical — log but don't surface to user
    }
  })

const currentYear = new Date().getFullYear();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => !Number.isNaN(new Date(s).getTime()), "Invalid date");

const optStr = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const optDate = isoDate.optional().or(z.literal(""));
const optNum = (min: number, max: number, label: string) =>
  z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => v === undefined || v === "" || !Number.isNaN(Number(v)), `${label} must be a number`)
    .refine(
      (v) => v === undefined || v === "" || (Number(v) >= min && Number(v) <= max),
      `${label} must be between ${min} and ${max}`,
    );

const yachtSchema = z.object({
  vessel_name: z.string().trim().min(1, "Vessel name is required").max(120),
  vessel_type: optStr(80),
  flag: optStr(80),
  imo_no: z.string().trim().max(20).regex(/^[A-Za-z0-9]*$/, "IMO must be alphanumeric").optional().or(z.literal("")),
  official_no: optStr(40),
  port_of_registry: optStr(120),
  built_year: optNum(1800, currentYear + 5, "Built year"),
  builders_name: optStr(120),
  built_place: optStr(120),
  gross_tonnage: optNum(0, 1_000_000, "Gross tonnage"),
  net_tonnage: optNum(0, 1_000_000, "Net tonnage"),
  length_overall_m: optNum(0, 1000, "LOA"),
  breadth_m: optNum(0, 200, "Breadth"),
  draught_m: optNum(0, 50, "Draught"),
  air_draft_m: optNum(0, 200, "Air draft"),
  max_crew: optNum(0, 1000, "Max crew"),
  max_guests: optNum(0, 1000, "Max guests"),
  email_address: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  eta: optDate,
  etd: optDate,
  cruising_permit_expiry: optDate,
  departed_date: optDate,
}).passthrough();

export const Route = createFileRoute("/_app/yachts/$id")({
  component: YachtDetail,
});

const NUMERIC_KEYS = new Set([
  "built_year", "gross_tonnage", "net_tonnage", "length_overall_m",
  "breadth_m", "draught_m", "air_draft_m", "max_crew", "max_guests",
]);
const DATE_KEYS = new Set(["eta", "etd", "cruising_permit_expiry", "departed_date"]);

const SECTIONS: { title: string; keys: string[] }[] = [
  { title: "Identity & Build", keys: ["vessel_name", "vessel_type", "flag", "imo_no", "official_no", "port_of_registry", "built_year", "builders_name", "built_place"] },
  { title: "Dimensions", keys: ["gross_tonnage", "net_tonnage", "length_overall_m", "breadth_m", "draught_m", "air_draft_m"] },
  { title: "Communications", keys: ["radio_call_sign", "frequency", "equipment_model", "manufacturer", "serial_no", "mmsi"] },
  { title: "Capacity & Engine", keys: ["max_crew", "max_guests", "engine"] },
  { title: "Owner & Contact", keys: ["owners_name", "owners_nationality", "owners_address", "company_name", "contact_person", "email_address", "contact_no", "billing_address", "link_to_folder"] },
  { title: "Permits & Status", keys: ["status", "berth", "location", "eta", "etd", "cruising_permit_expiry", "departed_date", "dma_permit_phase_status", "planner_id"] },
];

function labelFor(key: string) {
  return YACHT_COLUMNS.find((c) => c.key === key)?.label ?? key;
}

function YachtDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [y, setY] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { void load(); }, [id]);
  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("yachts").select("*").eq("id", id).maybeSingle();
    if (error) toast.error(error.message);
    setY(data as Record<string, unknown> | null);
    setLoading(false);
  }

  function startEdit() {
    if (!y) return;
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(y)) {
      if (v === null || v === undefined) continue;
      next[k] = String(v);
    }
    setForm(next);
    setImageFile(null);
    setImagePreview(null);
    setErrors({});
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setImageFile(null);
    setImagePreview(null);
    setErrors({});
  }

  function set(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => {
      if (!e[key]) return e;
      const { [key]: _, ...rest } = e;
      return rest;
    });
  }

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  }

  async function save() {
    if (!user || !y) return;
    const parsed = yachtSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = String(issue.path[0] ?? "");
        if (k && !fieldErrors[k]) fieldErrors[k] = issue.message;
      }
      setErrors(fieldErrors);
      toast.error("Please fix the highlighted fields");
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {};
      const allKeys = new Set<string>([...SECTIONS.flatMap((s) => s.keys), ...Object.keys(form)]);
      for (const k of allKeys) {
        const v = form[k];
        if (v === undefined || v === "") { payload[k] = null; continue; }
        if (NUMERIC_KEYS.has(k)) payload[k] = Number(v);
        else payload[k] = v;
      }
      // Don't overwrite system fields
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.created_by;
      delete payload.vessel_image;

      if (imageFile) {
        const path = `${user.id}/${Date.now()}-${imageFile.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("vessel-images").upload(path, imageFile);
        if (upErr) throw upErr;
        payload.vessel_image = supabase.storage.from("vessel-images").getPublicUrl(path).data.publicUrl;
      }

      const { error } = await supabase.from("yachts").update(payload as never).eq("id", id);
      if (error) throw error;
      toast.success("Yacht updated");
      // Non-blocking push to SharePoint (fire and forget)
      doPushToSharePoint({ data: { yachtId: id } }).catch(() => {});
      setEditing(false);
      setImageFile(null);
      setImagePreview(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!confirm("Delete this yacht?")) return;
    const { error } = await supabase.from("yachts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    navigate({ to: "/yachts" });
  }

  if (loading) return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  if (!y) return <div className="p-6 text-sm text-muted-foreground">Not found.</div>;

  const displayImage = imagePreview ?? (y.vessel_image ? String(y.vessel_image) : null);
  const [imgLoadError, setImgLoadError] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card/40 px-6 py-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/yachts"><ArrowLeft className="h-3.5 w-3.5" /> Yachts</Link>
          </Button>
          <div>
            <h1 className="font-display text-xl font-semibold">{String(y.vessel_name ?? "")}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {String(y.vessel_type ?? "—")} · {String(y.flag ?? "—")} · IMO {String(y.imo_no ?? "—")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={y.status as string | null} />
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={busy} className="gap-1.5">
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={busy} className="gap-1.5">
                <Save className="h-3.5 w-3.5" /> {busy ? "Saving…" : "Save"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={startEdit} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={del} className="gap-1.5 text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-4">
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="aspect-video bg-muted">
                {displayImage && !imgLoadError ? (
                  <img
                    src={displayImage}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => setImgLoadError(true)}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center"><Ship className="h-12 w-12 text-muted-foreground/40" /></div>
                )}
              </div>
              {editing && (
                <div className="border-t border-border p-3">
                  <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-accent">
                    <Upload className="h-3.5 w-3.5" /> Replace image
                    <input type="file" accept="image/*" className="hidden" onChange={pickImage} />
                  </label>
                </div>
              )}
              <div className="p-4 text-sm space-y-2">
                {editing ? (
                  <>
                    <EditField k="berth" form={form} set={set} errors={errors} />
                    <EditField k="location" form={form} set={set} errors={errors} />
                    <EditField k="eta" form={form} set={set} errors={errors} />
                    <EditField k="etd" form={form} set={set} errors={errors} />
                  </>
                ) : (
                  <>
                    <Field label="Berth" value={y.berth} />
                    <Field label="Location" value={y.location} />
                    <Field label="ETA" value={y.eta} />
                    <Field label="ETD" value={y.etd} />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {SECTIONS.map((s) => (
              <Card key={s.title} title={s.title}>
                {editing ? <EditGrid keys={s.keys} form={form} set={set} errors={errors} /> : <Grid keys={s.keys} y={y} />}
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="font-display text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value ? String(value) : "—"}</span>
    </div>
  );
}

function Grid({ keys, y }: { keys: string[]; y: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {keys.map((k) => {
        const label = YACHT_COLUMNS.find((c) => c.key === k)?.label ?? k;
        return (
          <div key={k}>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="text-sm font-medium tabular-nums">{y[k] ? String(y[k]) : "—"}</div>
          </div>
        );
      })}
    </div>
  );
}

function EditGrid({ keys, form, set, errors }: { keys: string[]; form: Record<string, string>; set: (k: string, v: string) => void; errors: Record<string, string> }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {keys.map((k) => {
        const err = errors[k];
        return (
          <div key={k} className="space-y-1.5">
            <Label htmlFor={`edit-${k}`} className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {labelFor(k)}{k === "vessel_name" ? " *" : ""}
            </Label>
            <Input
              id={`edit-${k}`}
              type={DATE_KEYS.has(k) ? "date" : NUMERIC_KEYS.has(k) ? "number" : "text"}
              step={NUMERIC_KEYS.has(k) ? "any" : undefined}
              value={form[k] ?? ""}
              onChange={(e) => set(k, e.target.value)}
              required={k === "vessel_name"}
              aria-invalid={!!err}
              className={err ? "border-destructive focus-visible:ring-destructive" : undefined}
            />
            {err && <p className="text-[11px] text-destructive">{err}</p>}
          </div>
        );
      })}
    </div>
  );
}

function EditField({ k, form, set, errors }: { k: string; form: Record<string, string>; set: (k: string, v: string) => void; errors: Record<string, string> }) {
  const err = errors[k];
  return (
    <div className="space-y-1">
      <Label htmlFor={`edit-side-${k}`} className="text-[10px] uppercase tracking-wider text-muted-foreground">{labelFor(k)}</Label>
      <Input
        id={`edit-side-${k}`}
        type={DATE_KEYS.has(k) ? "date" : "text"}
        value={form[k] ?? ""}
        onChange={(e) => set(k, e.target.value)}
        aria-invalid={!!err}
        className={`h-8 text-xs ${err ? "border-destructive focus-visible:ring-destructive" : ""}`}
      />
      {err && <p className="text-[10px] text-destructive">{err}</p>}
    </div>
  );
}
