import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/status-pill";
import { YACHT_COLUMNS } from "@/lib/yacht-fields";
import { ArrowLeft, Trash2, Ship, Pencil, Save, X, Upload, RefreshCw, FileCheck2, Route as RouteIcon, Package, ExternalLink, Archive, ArchiveRestore } from "lucide-react";
import { PERMIT_META } from "@/lib/permit-types";
import { SeaportImmigrationSection } from "@/components/seaport/SeaportImmigrationSection";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const doPushToSharePoint = createServerFn({ method: 'POST' })
  .handler(async (ctx: { data: { yachtId: string } }) => {
    try {
      const { pushYachtToSharePoint } = await import('@/lib/sharepoint-sync.server')
      await pushYachtToSharePoint(ctx.data.yachtId)
    } catch {
      // SharePoint push is non-critical — log but don't surface to user
    }
  })

const doSyncImage = createServerFn({ method: 'POST' })
  .handler(async (ctx: { data: { yachtId: string } }) => {
    try {
      const { downloadYachtImage } = await import('@/lib/sharepoint-sync.server')
      return await downloadYachtImage(ctx.data.yachtId)
    } catch (e) {
      return { url: null, reason: e instanceof Error ? e.message : 'Unexpected error during sync.' }
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

export function YachtDetail({
  yachtId,
  embedded = false,
  onBack,
  onTrack,
}: {
  /** When provided, used instead of the route param (Beta-embedded mode). */
  yachtId?: string;
  embedded?: boolean;
  onBack?: () => void;
  /** Jump to Live Tracking focused on this yacht (Vessels hub wires this). */
  onTrack?: (id: string) => void;
} = {}) {
  // strict:false so this works both on its own route and embedded in the Beta shell.
  const params = useParams({ strict: false }) as { id?: string };
  const id = yachtId ?? params.id!;
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
  const [imgLoadError, setImgLoadError] = useState(false);
  const [syncingImage, setSyncingImage] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [tab, setTab] = useState<"details" | "finance">("details");

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
    const { error } = await supabase.from("yachts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    if (embedded) onBack?.(); else navigate({ to: "/yachts" });
  }

  async function toggleArchive() {
    const next = !y?.archive;
    const { error } = await supabase.from("yachts").update({ archive: next } as never).eq("id", id);
    if (error) return toast.error(error.message);
    setConfirmArchive(false);
    toast.success(next ? "Yacht archived" : "Yacht restored to active fleet");
    await load();
  }

  if (loading) return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  if (!y) return <div className="p-6 text-sm text-muted-foreground">Not found.</div>;

  const yachtName = String(y.vessel_name ?? "this yacht");

  // Only render real http(s) URLs — legacy rows can hold a raw SharePoint image
  // descriptor (JSON) in vessel_image, which is not directly displayable.
  const storedImage = typeof y.vessel_image === "string" && /^https?:\/\//.test(y.vessel_image) ? y.vessel_image : null;
  const displayImage = imagePreview ?? storedImage;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card/40 px-6 py-3">
        <div className="flex items-center gap-3">
          {embedded ? (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
              <ArrowLeft className="h-3.5 w-3.5" /> Yachts
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link to="/yachts"><ArrowLeft className="h-3.5 w-3.5" /> Yachts</Link>
            </Button>
          )}
          <div>
            <h1 className="font-display text-xl font-semibold">{String(y.vessel_name ?? "")}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {String(y.vessel_type ?? "—")} · {String(y.flag ?? "—")} · IMO {String(y.imo_no ?? "—")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {Boolean(y.archive) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
              <Archive className="h-3 w-3" /> Archived
            </span>
          )}
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
              {Boolean(y.archive) ? (
                <Button variant="outline" size="sm" onClick={toggleArchive} className="gap-1.5">
                  <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setConfirmArchive(true)} className="gap-1.5 text-amber-500 hover:text-amber-500">
                  <Archive className="h-3.5 w-3.5" /> Archive
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)} className="gap-1.5 text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Details / Finance tabs */}
      <div className="flex items-center gap-1 border-b border-border/60 bg-card/20 px-6">
        {([["details", "Details"], ["finance", "Finance"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition",
              tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "finance" ? (
        <YachtFinance yachtId={String(y.id)} qboCustomerId={(y as any).qbo_customer_id ?? null} />
      ) : (
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
              <div className="border-t border-border p-3 flex flex-col gap-2">
                {!editing && (!displayImage || imgLoadError) && (
                  <button
                    type="button"
                    disabled={syncingImage}
                    onClick={async () => {
                      setSyncingImage(true);
                      try {
                        const result = await doSyncImage({ data: { yachtId: id } });
                        if (result?.url) {
                          setImgLoadError(false);
                          await load();
                          toast.success("Image synced from SharePoint");
                        } else {
                          toast.error(result?.reason ?? "No image found in SharePoint for this yacht");
                        }
                      } catch {
                        toast.error("Failed to sync image");
                      } finally {
                        setSyncingImage(false);
                      }
                    }}
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-accent disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncingImage ? "animate-spin" : ""}`} />
                    {syncingImage ? "Syncing…" : "Sync Image from SharePoint"}
                  </button>
                )}
                {editing && (
                  <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-accent">
                    <Upload className="h-3.5 w-3.5" /> Replace image
                    <input type="file" accept="image/*" className="hidden" onChange={pickImage} />
                  </label>
                )}
              </div>
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
                    <LiveLocation y={y as Record<string, any>} onTrack={onTrack ? () => onTrack(id) : undefined} />
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

        {/* Related records */}
        {!editing && <YachtRelatedRecords yachtId={id} />}
      </div>
      )}

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive yacht?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{yachtName}</strong> will be hidden from the active fleet — it won’t appear in the Yachts
              list (Active view), the dashboard counts, or vessel pickers across the app. None of its data is
              deleted, and you can restore it any time from the Archived view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={toggleArchive} className="bg-amber-500 text-white hover:bg-amber-500/90">
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete yacht?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{yachtName}</strong> and all its data will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={del}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Related Records Panel ────────────────────────────────────────────────────

type RelatedPermit = { id: string; permit_type: string; permit_number: string | null; expiry_date: string | null; status: string };
type RelatedTrip   = { id: string; trip_type: string; pickup_datetime: string | null; passenger_name: string | null; status: string };
type RelatedPkg    = { id: string; tracking_number: string | null; description: string | null; status: string; received_date: string | null };

function YachtRelatedRecords({ yachtId }: { yachtId: string }) {
  const [permits, setPermits] = useState<RelatedPermit[]>([]);
  const [trips,   setTrips]   = useState<RelatedTrip[]>([]);
  const [pkgs,    setPkgs]    = useState<RelatedPkg[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const db = supabase as any;
      const [pRes, tRes, kRes] = await Promise.all([
        db.from("permits").select("id, permit_type, permit_number, expiry_date, status").eq("yacht_id", yachtId).order("expiry_date", { ascending: true }).limit(8),
        db.from("crew_cab_trips").select("id, trip_type, pickup_datetime, passenger_name, status").eq("yacht_id", yachtId).order("pickup_datetime", { ascending: false }).limit(8),
        db.from("packages").select("id, tracking_number, description, status, received_date").eq("yacht_id", yachtId).order("received_date", { ascending: false }).limit(6),
      ]);
      setPermits(pRes.data ?? []);
      setTrips(tRes.data ?? []);
      setPkgs(kRes.data ?? []);
      setLoading(false);
    })();
  }, [yachtId]);

  const TRIP_LABEL: Record<string, string> = {
    arrival_transport: "Arrival", departure_transport: "Departure", crew_pickup: "Crew Pickup",
    inhouse: "In-House", airport_transfer: "Airport", delivery_collection: "Delivery",
    seaport_crew_change: "Seaport", shorebased: "Shorebased",
  };

  const statusColor: Record<string, string> = {
    active: "text-emerald-400", pending: "text-amber-400", expired: "text-red-400",
    cancelled: "text-slate-400", completed: "text-emerald-400", in_progress: "text-blue-400",
  };

  if (loading) return null;
  if (!permits.length && !trips.length && !pkgs.length) return null;

  return (
    <div className="mx-auto max-w-6xl mt-2 pb-6">
      <h2 className="font-display text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider px-1">Related Records</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Permits */}
        {permits.length > 0 && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <FileCheck2 className="h-3.5 w-3.5 text-primary/70" />
              <span className="text-xs font-semibold text-foreground">Permits</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{permits.length}</span>
            </div>
            <div className="divide-y divide-border/50">
              {permits.map(p => (
                <Link key={p.id} to={PERMIT_META[p.permit_type as keyof typeof PERMIT_META]?.route ?? "/permits/exit-entry" as any} className="flex items-center gap-2 px-4 py-2 hover:bg-accent/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{PERMIT_META[p.permit_type as keyof typeof PERMIT_META]?.label ?? p.permit_type}</div>
                    <div className="text-[10px] text-muted-foreground">{p.expiry_date ? `Expires ${new Date(p.expiry_date + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "No expiry"}</div>
                  </div>
                  <span className={cn("text-[10px] font-semibold uppercase", statusColor[p.status] ?? "text-muted-foreground")}>{p.status}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Trips */}
        {trips.length > 0 && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <RouteIcon className="h-3.5 w-3.5 text-primary/70" />
              <span className="text-xs font-semibold text-foreground">Recent Trips</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{trips.length}</span>
            </div>
            <div className="divide-y divide-border/50">
              {trips.map(t => (
                <div key={t.id} className="flex items-center gap-2 px-4 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium">{t.passenger_name ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground">{TRIP_LABEL[t.trip_type] ?? t.trip_type} · {t.pickup_datetime ? new Date(t.pickup_datetime).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}</div>
                  </div>
                  <span className={cn("text-[10px] font-semibold uppercase", statusColor[t.status] ?? "text-muted-foreground")}>{t.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Packages */}
        {pkgs.length > 0 && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <Package className="h-3.5 w-3.5 text-primary/70" />
              <span className="text-xs font-semibold text-foreground">Packages</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{pkgs.length}</span>
            </div>
            <div className="divide-y divide-border/50">
              {pkgs.map(p => (
                <div key={p.id} className="flex items-center gap-2 px-4 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{p.description ?? p.tracking_number ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground">{p.received_date ? new Date(p.received_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Pending"}</div>
                  </div>
                  <span className={cn("text-[10px] font-semibold uppercase", statusColor[p.status] ?? "text-muted-foreground")}>{p.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Seaport Immigration (#127) */}
        <SeaportImmigrationSection vesselId={yachtId} />

      </div>
    </div>
  );
}

// ─── Static sub-components ────────────────────────────────────────────────────

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

function liveAgo(d: Date): string {
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** "Actual location" — the yacht's live AIS position from the fleet tracker.
 *  Reverse-geocoded to a place name (best-effort via OpenStreetMap; falls back
 *  to coordinates) and linked to the position on a map. */
function LiveLocation({ y, onTrack }: { y: Record<string, any>; onTrack?: () => void }) {
  const lat = y.ais_lat != null ? Number(y.ais_lat) : null;
  const lon = y.ais_lon != null ? Number(y.ais_lon) : null;
  const [place, setPlace] = useState<string | null>(null);
  useEffect(() => {
    setPlace(null);
    if (lat == null || lon == null) return;
    const ctrl = new AbortController();
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14`, {
      signal: ctrl.signal, headers: { Accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: any) => {
        if (!j) return;
        const a = j.address ?? {};
        const parts = [a.harbour ?? a.suburb ?? a.neighbourhood ?? a.quarter, a.city ?? a.town ?? a.village ?? a.county, a.country].filter(Boolean);
        setPlace(parts.length ? parts.join(", ") : (j.display_name ?? null));
      })
      .catch(() => { /* fall back to coordinates */ });
    return () => ctrl.abort();
  }, [lat, lon]);

  if (lat == null || lon == null) return <Field label="Actual (live)" value={null} />;

  const speed = y.ais_speed != null ? Number(y.ais_speed) : null;
  const moving = (speed ?? 0) > 0.5;
  const at = y.ais_position_at ? new Date(y.ais_position_at) : null;
  return (
    <div className="flex justify-between gap-3">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        Actual (live)
        {onTrack && (
          <button
            onClick={onTrack}
            title="View on the Live Tracking map"
            className="inline-flex h-4.5 w-4.5 items-center justify-center rounded border border-border text-muted-foreground/70 transition hover:border-primary hover:text-primary"
            style={{ height: 18, width: 18 }}
          >
            <RouteIcon className="h-3 w-3" />
          </button>
        )}
      </span>
      <span className="text-right">
        <a
          href={`https://www.google.com/maps?q=${lat},${lon}`}
          target="_blank" rel="noreferrer"
          title="Open the live position on a map"
          className="text-xs font-medium text-primary hover:underline"
        >
          {place ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`}
        </a>
        <div className="text-[10px] text-muted-foreground">
          {moving ? `${(speed ?? 0).toFixed(1)} kn${y.ais_destination ? ` → ${y.ais_destination}` : ""}` : "In port / moored"}
          {at && !isNaN(at.getTime()) ? ` · ${liveAgo(at)}` : ""}
        </div>
      </span>
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

// ── Finance tab — this yacht's QuickBooks invoices (paid / pending / outstanding) ──
type QboInvoiceRow = {
  id: string; doc_number: string | null; txn_date: string | null; due_date: string | null;
  total_amt: number | null; balance: number | null; status: string | null; currency: string | null;
};

const INVOICE_STATUS_CLS: Record<string, string> = {
  Paid: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  Unpaid: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  Overdue: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  Pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  Accepted: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
};

function YachtFinance({ yachtId, qboCustomerId }: { yachtId: string; qboCustomerId: string | null }) {
  const { session } = useAuth();
  const [docType, setDocType] = useState<"invoice" | "estimate">("invoice");
  const [rows, setRows] = useState<QboInvoiceRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    setBusy(true);
    setStatusFilter("all");
    void (async () => {
      let q = (supabase as any)
        .from("qbo_invoices")
        .select("id, doc_number, txn_date, due_date, total_amt, balance, status, currency")
        .eq("doc_type", docType);
      // Match by direct yacht link, plus by the yacht's QBO customer for older rows.
      q = qboCustomerId ? q.or(`yacht_id.eq.${yachtId},customer_ref.eq.${qboCustomerId}`) : q.eq("yacht_id", yachtId);
      const { data } = await q.order("txn_date", { ascending: false }).limit(300);
      setRows((data ?? []) as QboInvoiceRow[]);
      setBusy(false);
    })();
  }, [yachtId, qboCustomerId, docType]);

  const money = (n: number | null | undefined) =>
    n == null ? "—" : `AED ${Number(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const dt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

  const totals = {
    invoiced: rows.reduce((s, r) => s + (r.total_amt ?? 0), 0),
    outstanding: rows.reduce((s, r) => s + (r.balance ?? 0), 0),
    paid: rows.filter((r) => r.status === "Paid").length,
    unpaid: rows.filter((r) => r.status === "Unpaid").length,
    overdue: rows.filter((r) => r.status === "Overdue").length,
  };
  const filtered = statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter);

  async function viewPdf(id: string) {
    toast.loading("Fetching PDF…", { id: "yfpdf" });
    try {
      const r = await fetch(`/api/qb/doc-pdf?id=${id}`, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
      const j = await r.json();
      toast.dismiss("yfpdf");
      if (j.ok && j.url) window.open(j.url, "_blank");
      else toast.error(j.error ?? "No PDF available");
    } catch (e: any) { toast.dismiss("yfpdf"); toast.error(String(e?.message ?? e)); }
  }

  const isEstimates = docType === "estimate";
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        {/* Invoices ⇄ Quotes toggle */}
        <div className="flex items-center gap-1.5">
          {([["invoice", "Invoices"], ["estimate", "Quotes (estimates)"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setDocType(key)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-semibold transition",
                docType === key ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
              )}>
              {label}
            </button>
          ))}
        </div>

        {/* KPI cards */}
        <div className={cn("grid grid-cols-2 gap-3", isEstimates ? "md:grid-cols-3" : "md:grid-cols-5")}>
          {(isEstimates ? [
            { label: "Quoted (total)", value: money(totals.invoiced) },
            { label: "Quotes", value: String(rows.length) },
            { label: "Pending", value: String(rows.filter((r) => r.status === "Pending").length), cls: "text-amber-600 dark:text-amber-400" },
          ] : [
            { label: "Invoiced (total)", value: money(totals.invoiced) },
            { label: "Outstanding", value: money(totals.outstanding), cls: totals.outstanding > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400" },
            { label: "Paid", value: String(totals.paid), cls: "text-emerald-600 dark:text-emerald-400" },
            { label: "Pending (unpaid)", value: String(totals.unpaid), cls: "text-amber-600 dark:text-amber-400" },
            { label: "Overdue", value: String(totals.overdue), cls: totals.overdue > 0 ? "text-red-600 dark:text-red-400" : "" },
          ]).map((k) => (
            <div key={k.label} className="rounded-lg border border-border bg-card p-3.5">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</div>
              <div className={cn("mt-1 font-display text-lg font-bold tabular-nums", (k as any).cls)}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1.5">
          {["all", ...new Set(rows.map((r) => r.status).filter(Boolean) as string[])].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                statusFilter === s ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "all" ? `All (${rows.length})` : s}
            </button>
          ))}
        </div>

        {busy ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Loading invoices…</div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
            <FileCheck2 className="mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {rows.length === 0 ? `No QuickBooks ${isEstimates ? "quotes" : "invoices"} found for this yacht.` : `No ${isEstimates ? "quotes" : "invoices"} match this filter.`}
            </p>
            {rows.length === 0 && !qboCustomerId && (
              <p className="mt-1 text-xs text-muted-foreground/70">Tip: link the yacht to its QuickBooks customer to pick up older invoices.</p>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {[isEstimates ? "Quote" : "Invoice", "Date", isEstimates ? "Expires" : "Due", "Total", "Balance", "Status", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="group border-b border-border/40 hover:bg-accent/20">
                    <td className="px-4 py-2.5 font-medium text-foreground">{r.doc_number ?? "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{dt(r.txn_date)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{dt(r.due_date)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-foreground/80">{money(r.total_amt)}</td>
                    <td className={cn("px-4 py-2.5 tabular-nums", (r.balance ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>{money(r.balance)}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", INVOICE_STATUS_CLS[r.status ?? ""] ?? "bg-slate-500/15 text-slate-500 border-slate-500/20")}>
                        {r.status ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => viewPdf(r.id)}
                        title="View the QuickBooks PDF"
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"
                      >
                        <ExternalLink className="h-3 w-3" /> PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
