/**
 * Yacht IT Network — every system aboard each vessel, as a register and a map.
 *
 * A vessel's IT estate is much wider than its network: WAN/comms (VSAT,
 * Starlink, bonded 4G/5G), core switching, AV (Crestron, Kaleidescape),
 * lighting (KNX), bespoke platforms (YachtEye), bridge/nav, CCTV, PBX, crew IT.
 * Each system is a real row, and the map is a view of those rows — enter the
 * detail once, get both.
 *
 * Ported like-for-like from the New Horizon-IT service desk, where the module
 * was built (src/routes/yacht-it.tsx and yacht-it.$mapId.tsx there), and kept
 * in two-way sync with it every five minutes — see lib/yacht-network/sync.server.
 * What differs here, and why:
 *   • one component with a list and a vessel view, not two routes, because it
 *     lives as a tab of Yacht IT Solutions like every other section there;
 *   • a vessel is linked to an IT Yachts record rather than a client and site,
 *     which are New Horizon's model;
 *   • Datto RMM is New Horizon's account, so device status is read live from
 *     them, limited on their side to JLS's own Datto sites;
 *   • view-only access (operations, orbit) is a real mode — New Horizon's copy
 *     has no need of one, since only their staff can reach it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAccess } from "@/lib/auth/useAccess";
import { toast } from "sonner";
import {
  Ship, Plus, Search, X, Loader2, Trash2, ArrowLeft, Table2, Share2, Boxes, ShieldAlert,
  AlertTriangle, CalendarClock, Pencil, ServerCog, RefreshCw, Eye, Anchor,
} from "lucide-react";
import { YachtRegister } from "@/components/yacht-network/YachtRegister";
import { YachtCanvas } from "@/components/yacht-network/YachtCanvas";
import { YachtSystemPanel } from "@/components/yacht-network/YachtSystemPanel";
import { YachtDattoMatch, type ProposedLink } from "@/components/yacht-network/YachtDattoMatch";
import { useConfirm } from "@/components/yacht-network/confirm";
import {
  DISCIPLINES, STARTER_TEMPLATE, tierPositions, daysUntil, inputCls, CONTRACT_WARN_DAYS,
  type YachtMap, type YachtSystem, type YachtZone, type YachtLink,
  type Discipline, type LinkType, type DattoDevice,
} from "@/components/yacht-network/taxonomy";

const db = () => supabase as any;

interface ItYachtOption { id: string; name: string }

/** Per-vessel counts, worked out client-side from one systems query. */
interface MapStats { total: number; critical: number; faults: number; expiring: number }
const EMPTY_STATS: MapStats = { total: 0, critical: 0, faults: 0, expiring: 0 };

// ─── Entry ────────────────────────────────────────────────────────────────────

export function YachtNetworkPage() {
  const [openMapId, setOpenMapId] = useState<string | null>(null);
  const { canAccessModule, loading } = useAccess();
  // Until claims resolve, assume view-only: a button that appears is better
  // than one that vanishes after someone reached for it.
  const canEdit = !loading && canAccessModule("yacht_it", "edit");

  return openMapId
    ? <VesselView mapId={openMapId} canEdit={canEdit} onBack={() => setOpenMapId(null)} />
    : <VesselList canEdit={canEdit} onOpen={setOpenMapId} />;
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function useToken() {
  const { session } = useAuth();
  return (session as any)?.access_token ?? "";
}

/** Live Datto devices, via New Horizon. An error leaves the register usable. */
async function loadDatto(token: string): Promise<{ devices: DattoDevice[]; error: string | null }> {
  try {
    const res = await fetch("/api/yacht-network/datto", { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) return { devices: [], error: body?.error ?? `HTTP ${res.status}` };
    return { devices: (body.devices ?? []) as DattoDevice[], error: null };
  } catch {
    return { devices: [], error: "New Horizon could not be reached" };
  }
}

function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Where the New Horizon sync stands, and a way to run it now rather than wait
 * up to five minutes — the thing you reach for right after changing something
 * the other desk needs to see.
 */
function SyncStatus({ canEdit, onSynced }: { canEdit: boolean; onSynced?: () => void }) {
  const token = useToken();
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await db().rpc("yacht_it_sync_status");
    setStatus(data ?? null);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const syncNow = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/yacht-network/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        toast.error("Sync with New Horizon failed", { description: body?.error ?? `HTTP ${res.status}` });
      } else {
        toast.success("Synced with New Horizon-IT");
        onSynced?.();
      }
    } finally {
      setBusy(false);
      void load();
    }
  };

  if (!status) return null;
  const failing = !!status.last_error;
  // The sync runs every five minutes, but a tick can be dropped (a redeploy
  // landing on it drops the invocation outright, leaving nothing to log). One
  // miss is harmless; a long silence means it has stopped, and should say so.
  const stale = !failing && status.enabled !== false &&
    (!status.last_ok_at || Date.now() - Date.parse(status.last_ok_at) > 30 * 60_000);

  return (
    <div className="inline-flex items-center gap-2 text-[11px]">
      <span
        className={failing || stale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}
        title={failing ? status.last_error : stale ? "It normally runs every five minutes." : undefined}
      >
        {status.enabled === false
          ? "New Horizon sync is switched off"
          : failing
            ? `Last sync with New Horizon failed · ${ago(status.last_run_at)}`
            : stale
              ? `Not synced with New Horizon-IT since ${ago(status.last_ok_at)}`
              : `Synced with New Horizon-IT · ${ago(status.last_ok_at)}`}
      </span>
      {canEdit && status.enabled !== false && (
        <button
          onClick={syncNow}
          disabled={busy}
          title="Sync with New Horizon-IT now"
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} /> Sync now
        </button>
      )}
    </div>
  );
}

function Chip({ icon: Icon, label, tone }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: "amber" | "red";
}) {
  const cls =
    tone === "red"   ? "bg-destructive/10 text-destructive"
  : tone === "amber" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
  :                    "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${cls}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

// ─── Vessel list ──────────────────────────────────────────────────────────────

function VesselList({ canEdit, onOpen }: { canEdit: boolean; onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const { confirm, dialog } = useConfirm();

  const [maps, setMaps] = useState<YachtMap[]>([]);
  const [itYachts, setItYachts] = useState<ItYachtOption[]>([]);
  const [stats, setStats] = useState<Record<string, MapStats>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: mapRows, error }, { data: yachtRows }, { data: systemRows }] = await Promise.all([
      db().from("yacht_it_maps").select("*").order("name"),
      db().from("it_yachts").select("id, name").eq("active", true).order("name"),
      db().from("yacht_it_systems").select("map_id, criticality, status, support_contract_end"),
    ]);
    if (error) toast.error("Failed to load vessels", { description: error.message });

    const tally: Record<string, MapStats> = {};
    for (const s of (systemRows ?? []) as any[]) {
      const row = (tally[s.map_id] ??= { ...EMPTY_STATS });
      row.total += 1;
      if (s.criticality === "critical") row.critical += 1;
      if (s.status === "fault") row.faults += 1;
      const left = daysUntil(s.support_contract_end);
      if (left !== null && left <= CONTRACT_WARN_DAYS) row.expiring += 1;
    }

    setMaps((mapRows ?? []) as YachtMap[]);
    setItYachts((yachtRows ?? []) as ItYachtOption[]);
    setStats(tally);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const yachtName = useMemo(() => Object.fromEntries(itYachts.map((y) => [y.id, y.name])), [itYachts]);

  const filtered = useMemo(() => {
    if (!search.trim()) return maps;
    const q = search.toLowerCase();
    return maps.filter((m) =>
      m.name.toLowerCase().includes(q) ||
      (m.it_yacht_id ? (yachtName[m.it_yacht_id] ?? "").toLowerCase().includes(q) : false) ||
      (m.builder ?? "").toLowerCase().includes(q) ||
      (m.imo ?? "").toLowerCase().includes(q),
    );
  }, [maps, search, yachtName]);

  const removeMap = async (map: YachtMap) => {
    const ok = await confirm({
      title: `Delete "${map.name}"?`,
      description:
        "Every system, zone and link recorded against this vessel is deleted with it — here and, at the " +
        "next sync, on New Horizon-IT's desk too. This cannot be undone.",
      confirmLabel: "Delete vessel",
    });
    if (!ok) return;
    const { error } = await db().from("yacht_it_maps").delete().eq("id", map.id);
    if (error) { toast.error("Could not delete", { description: error.message }); return; }
    setMaps((prev) => prev.filter((m) => m.id !== map.id));
    toast.success(`"${map.name}" deleted`);
  };

  return (
    <div className="h-full overflow-y-auto p-5 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Ship className="h-5 w-5 text-primary" /> Network
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            The full IT estate of each vessel — WAN and comms, core network, AV, lighting,
            bridge systems and bespoke platforms — as a register and as a map.
          </p>
          <div className="mt-1.5"><SyncStatus canEdit={canEdit} onSynced={load} /></div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vessels…"
              className="w-56 rounded-lg border border-border bg-background pl-9 pr-8 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          {canEdit && (
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
            >
              <Plus className="h-4 w-4" /> New Vessel
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Ship className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">
            {maps.length === 0 ? "No vessels yet" : "Nothing matches that search"}
          </p>
          {maps.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
              Start a vessel and seed it with the systems a yacht this size normally carries, then work
              through them filling in what's actually aboard. Vessels New Horizon-IT has mapped appear here
              after the next sync.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((map) => {
            const st = stats[map.id] ?? EMPTY_STATS;
            return (
              <div key={map.id} className="group relative rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors">
                <button onClick={() => onOpen(map.id)} className="block w-full text-left">
                  <div className="flex items-start gap-2">
                    <Ship className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{map.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {map.it_yacht_id && yachtName[map.it_yacht_id] ? (
                          <span className="inline-flex items-center gap-1">
                            <Anchor className="h-3 w-3" /> {yachtName[map.it_yacht_id]}
                          </span>
                        ) : (
                          "Not linked to an IT Yacht"
                        )}
                        {map.builder ? ` · ${map.builder}` : ""}
                        {map.length_m ? ` · ${map.length_m}m` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                    <Chip icon={Boxes} label={`${st.total} system${st.total === 1 ? "" : "s"}`} />
                    {st.critical > 0 && <Chip icon={ShieldAlert} label={`${st.critical} critical`} tone="amber" />}
                    {st.faults > 0 && <Chip icon={AlertTriangle} label={`${st.faults} fault${st.faults === 1 ? "" : "s"}`} tone="red" />}
                    {st.expiring > 0 && <Chip icon={CalendarClock} label={`${st.expiring} contract${st.expiring === 1 ? "" : "s"} due`} tone="amber" />}
                  </div>
                </button>

                {canEdit && (
                  <button
                    onClick={() => removeMap(map)}
                    title="Delete vessel"
                    className="absolute top-3 right-3 p-1 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showNew && (
        <NewVesselModal
          itYachts={itYachts}
          userId={user?.id ?? null}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); void load(); }}
        />
      )}
      {dialog}
    </div>
  );
}

function NewVesselModal({ itYachts, userId, onClose, onCreated }: {
  itYachts: ItYachtOption[];
  userId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [itYachtId, setItYachtId] = useState("");
  const [imo, setImo] = useState("");
  const [builder, setBuilder] = useState("");
  const [flag, setFlag] = useState("");
  const [lengthM, setLengthM] = useState("");
  const [seed, setSeed] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const create = async () => {
    if (!name.trim()) { toast.error("Give the vessel a name"); return; }
    setSaving(true);

    const { data: map, error } = await db()
      .from("yacht_it_maps")
      .insert({
        name: name.trim(),
        it_yacht_id: itYachtId || null,
        imo: imo.trim() || null,
        builder: builder.trim() || null,
        flag: flag.trim() || null,
        length_m: lengthM.trim() ? Number(lengthM) : null,
        created_by: userId,
      })
      .select("id")
      .single();

    if (error || !map) {
      setSaving(false);
      toast.error("Could not create vessel", { description: error?.message });
      return;
    }

    if (seed) {
      const positions = tierPositions(STARTER_TEMPLATE);
      const rows = STARTER_TEMPLATE.map((t, i) => ({
        map_id: map.id,
        discipline: t.discipline,
        name: t.name,
        manufacturer: t.manufacturer ?? null,
        criticality: t.criticality ?? "medium",
        // Seeded kit is what we expect to find, not what we've confirmed.
        status: "planned",
        position_x: positions[i].x,
        position_y: positions[i].y,
        sort_order: i,
        created_by: userId,
      }));
      const { error: seedError } = await db().from("yacht_it_systems").insert(rows);
      if (seedError) {
        toast.error("Vessel created, but the starter systems failed", { description: seedError.message });
      }
    }

    setSaving(false);
    toast.success(`"${name.trim()}" created`, {
      description: seed ? `Seeded with ${STARTER_TEMPLATE.length} placeholder systems — edit them to match the vessel.` : undefined,
    });
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-semibold inline-flex items-center gap-2">
            <Ship className="h-4 w-4 text-primary" /> New vessel
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <Field label="Vessel name">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="M/Y …" className={inputCls} />
          </Field>

          <Field label="IT Yacht">
            <select value={itYachtId} onChange={(e) => setItYachtId(e.target.value)} className={inputCls}>
              <option value="">— not linked —</option>
              {itYachts.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="IMO"><input value={imo} onChange={(e) => setImo(e.target.value)} className={inputCls} /></Field>
            <Field label="Flag"><input value={flag} onChange={(e) => setFlag(e.target.value)} className={inputCls} /></Field>
            <Field label="Builder"><input value={builder} onChange={(e) => setBuilder(e.target.value)} className={inputCls} /></Field>
            <Field label="Length (m)">
              <input type="number" step="0.1" value={lengthM} onChange={(e) => setLengthM(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 cursor-pointer">
            <input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} className="mt-0.5" />
            <span className="text-xs">
              <span className="font-medium">Seed with the standard yacht systems</span>
              <span className="block text-muted-foreground mt-0.5">
                Adds {STARTER_TEMPLATE.length} placeholders — VSAT, Starlink, firewall, core switch, Crestron,
                Kaleidescape, KNX gateway, YachtEye, NVR, PBX, UPS and the rest — marked
                “planned”. Edit or delete as you confirm what's actually aboard.
              </span>
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted">Cancel</button>
          <button
            onClick={create}
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create vessel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── One vessel ───────────────────────────────────────────────────────────────
//
// Owns all the data for a map (systems, zones, links) and hands it to the two
// views: the register, which is where detail gets entered, and the map, which
// is the same rows laid out and cabled together. Both write through the same
// mutators here, so a change made on one shows on the other without a reload.

function VesselView({ mapId, canEdit, onBack }: { mapId: string; canEdit: boolean; onBack: () => void }) {
  const { user } = useAuth();
  const token = useToken();
  const { confirm, dialog } = useConfirm();
  const readOnly = !canEdit;

  const [tab, setTab] = useState<"register" | "map">("register");
  const [map, setMap] = useState<YachtMap | null>(null);
  const [systems, setSystems] = useState<YachtSystem[]>([]);
  const [zones, setZones] = useState<YachtZone[]>([]);
  const [links, setLinks] = useState<YachtLink[]>([]);
  const [itYachts, setItYachts] = useState<ItYachtOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingVessel, setEditingVessel] = useState(false);
  const [dattoDevices, setDattoDevices] = useState<DattoDevice[]>([]);
  const [dattoError, setDattoError] = useState<string | null>(null);
  const [showDattoMatch, setShowDattoMatch] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // ── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [
        { data: mapRow }, { data: systemRows }, { data: zoneRows }, { data: linkRows }, { data: yachtRows },
      ] = await Promise.all([
        db().from("yacht_it_maps").select("*").eq("id", mapId).maybeSingle(),
        db().from("yacht_it_systems").select("*").eq("map_id", mapId).order("sort_order"),
        db().from("yacht_it_zones").select("*").eq("map_id", mapId).order("sort_order"),
        db().from("yacht_it_links").select("*").eq("map_id", mapId),
        db().from("it_yachts").select("id, name").eq("active", true).order("name"),
      ]);
      if (cancelled) return;
      if (!mapRow) { setNotFound(true); setLoading(false); return; }
      setMap(mapRow as YachtMap);
      setSystems((systemRows ?? []) as YachtSystem[]);
      setZones((zoneRows ?? []) as YachtZone[]);
      setLinks((linkRows ?? []) as YachtLink[]);
      setItYachts((yachtRows ?? []) as ItYachtOption[]);
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [mapId, reloadKey]);

  // Datto separately: it crosses to New Horizon, and the register must not
  // wait on — or fail with — another company's service.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void loadDatto(token).then(({ devices, error }) => {
      if (cancelled) return;
      setDattoDevices(devices);
      setDattoError(error);
    });
    return () => { cancelled = true; };
  }, [token, reloadKey]);

  // ── Mutators ───────────────────────────────────────────────────────────────

  // Position drags fire constantly; coalesce writes per system so a drag
  // across the canvas is one round trip rather than thirty.
  const positionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Same reason as linksRef below: mutators need the latest systems without
  // being rebuilt whenever one changes.
  const systemsRef = useRef<YachtSystem[]>([]);
  useEffect(() => { systemsRef.current = systems; }, [systems]);

  // Reconciliation reads the latest links without making every mutator depend
  // on them (and so be rebuilt on every edge change).
  const linksRef = useRef<YachtLink[]>([]);
  useEffect(() => { linksRef.current = links; }, [links]);

  /**
   * Keep the map's cabling in step with a system's uplink.
   *
   * Direction follows the sentence: "X uplinks to Y" stores X → Y, so the
   * arrow leaves the device that owns the uplink. Which handles it uses is a
   * separate, purely geometric decision made on the canvas.
   */
  const reconcileUplinkLink = useCallback(async (
    systemId: string,
    previousUplinkId: string | null,
    nextUplinkId: string | null,
  ) => {
    if (previousUplinkId === nextUplinkId) return;
    const current = linksRef.current;

    // Withdraw the link the old uplink created — never a hand-drawn one.
    const stale = current.find(
      (l) => l.from_uplink && l.from_system_id === systemId && l.to_system_id === previousUplinkId,
    );
    if (stale) {
      setLinks((prev) => prev.filter((l) => l.id !== stale.id));
      await db().from("yacht_it_links").delete().eq("id", stale.id);
    }

    if (!nextUplinkId) return;

    // A cable already drawn between these two, either way round, is the
    // connection — don't lay a second one beside it.
    const existing = current.some(
      (l) => l.id !== stale?.id &&
        ((l.from_system_id === nextUplinkId && l.to_system_id === systemId) ||
         (l.from_system_id === systemId && l.to_system_id === nextUplinkId)),
    );
    if (existing) return;

    const { data, error } = await db()
      .from("yacht_it_links")
      .insert({
        map_id: mapId,
        from_system_id: systemId,
        to_system_id: nextUplinkId,
        link_type: "ethernet",
        from_uplink: true,
      })
      .select("*")
      .single();
    if (error || !data) {
      toast.error("Uplink saved, but the map link failed", { description: error?.message });
      return;
    }
    setLinks((prev) => [...prev, data as YachtLink]);
  }, [mapId]);

  const updateSystem = useCallback(async (id: string, patch: Partial<YachtSystem>) => {
    // Captured before the optimistic write, so reconciliation knows what the
    // uplink was a moment ago.
    const previousUplinkId = systemsRef.current.find((s) => s.id === id)?.uplink_system_id ?? null;

    setSystems((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const { error } = await db().from("yacht_it_systems").update(patch).eq("id", id);
    if (error) { toast.error("Change not saved", { description: error.message }); return; }

    if ("uplink_system_id" in patch) {
      await reconcileUplinkLink(id, previousUplinkId, patch.uplink_system_id ?? null);
    }
  }, [reconcileUplinkLink]);

  const moveSystem = useCallback((id: string, x: number, y: number) => {
    setSystems((prev) => prev.map((s) => (s.id === id ? { ...s, position_x: x, position_y: y } : s)));
    clearTimeout(positionTimers.current[id]);
    positionTimers.current[id] = setTimeout(() => {
      db().from("yacht_it_systems").update({ position_x: x, position_y: y }).eq("id", id);
    }, 400);
  }, []);

  const addSystem = useCallback(async (discipline: Discipline) => {
    const meta = DISCIPLINES.find((d) => d.key === discipline)!;
    const { data, error } = await db()
      .from("yacht_it_systems")
      .insert({
        map_id: mapId,
        discipline,
        name: `New ${meta.label.toLowerCase()} system`,
        // Drop it clear of the seeded layout rather than on top of it.
        position_x: 0,
        position_y: (meta.tier + 1) * 200 + 60,
        sort_order: systems.length,
        created_by: user?.id ?? null,
      })
      .select("*")
      .single();
    if (error || !data) { toast.error("Could not add system", { description: error?.message }); return; }
    setSystems((prev) => [...prev, data as YachtSystem]);
    setSelectedId(data.id);
  }, [mapId, systems.length, user?.id]);

  const deleteSystem = useCallback(async (id: string) => {
    const target = systems.find((s) => s.id === id);
    const ok = await confirm({
      title: `Delete "${target?.name ?? "this system"}"?`,
      description: "Its links are removed with it.",
      confirmLabel: "Delete system",
    });
    if (!ok) return;
    const { error } = await db().from("yacht_it_systems").delete().eq("id", id);
    if (error) { toast.error("Could not delete", { description: error.message }); return; }
    setSystems((prev) => prev.filter((s) => s.id !== id));
    setLinks((prev) => prev.filter((l) => l.from_system_id !== id && l.to_system_id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [systems, selectedId, confirm]);

  const addZone = useCallback(async () => {
    const name = window.prompt("Zone name (e.g. Bridge, Tech space, AV rack room)")?.trim();
    if (!name) return;
    const { data, error } = await db()
      .from("yacht_it_zones")
      .insert({
        map_id: mapId,
        name,
        // Stagger new zones so a second one isn't hidden under the first.
        position_x: -300 + zones.length * 40,
        position_y: -220 + zones.length * 40,
        sort_order: zones.length,
      })
      .select("*")
      .single();
    if (error || !data) { toast.error("Could not add zone", { description: error?.message }); return; }
    setZones((prev) => [...prev, data as YachtZone]);
  }, [mapId, zones.length]);

  // Zone drags and resizes fire as continuously as system drags do — and a
  // resize emits both at once, so the pending patch is merged rather than
  // replaced. Replacing it would silently drop the new position.
  const zoneTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const zonePending = useRef<Record<string, Partial<YachtZone>>>({});

  const updateZone = useCallback((id: string, patch: Partial<YachtZone>) => {
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, ...patch } : z)));
    zonePending.current[id] = { ...(zonePending.current[id] ?? {}), ...patch };
    clearTimeout(zoneTimers.current[id]);
    zoneTimers.current[id] = setTimeout(() => {
      const pending = zonePending.current[id];
      delete zonePending.current[id];
      if (pending) db().from("yacht_it_zones").update(pending).eq("id", id);
    }, 400);
  }, []);

  const deleteZone = useCallback(async (id: string) => {
    const ok = await confirm({
      title: "Delete this zone?",
      description: "The systems drawn inside it are left where they are.",
      confirmLabel: "Delete zone",
    });
    if (!ok) return;
    setZones((prev) => prev.filter((z) => z.id !== id));
    await db().from("yacht_it_zones").delete().eq("id", id);
  }, [confirm]);

  const addLink = useCallback(async (from: string, to: string, linkType: LinkType) => {
    if (from === to) return;
    const exists = links.some(
      (l) => (l.from_system_id === from && l.to_system_id === to) ||
             (l.from_system_id === to && l.to_system_id === from),
    );
    if (exists) { toast.info("Those systems are already linked"); return; }
    const { data, error } = await db()
      .from("yacht_it_links")
      .insert({ map_id: mapId, from_system_id: from, to_system_id: to, link_type: linkType })
      .select("*")
      .single();
    if (error || !data) { toast.error("Could not link", { description: error?.message }); return; }
    setLinks((prev) => [...prev, data as YachtLink]);
  }, [links, mapId]);

  const updateLink = useCallback(async (id: string, patch: Partial<YachtLink>) => {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const { error } = await db().from("yacht_it_links").update(patch).eq("id", id);
    if (error) toast.error("Change not saved", { description: error.message });
  }, []);

  const deleteLink = useCallback(async (id: string) => {
    const link = linksRef.current.find((l) => l.id === id);
    setLinks((prev) => prev.filter((l) => l.id !== id));
    await db().from("yacht_it_links").delete().eq("id", id);

    // Removing the cable an uplink drew means the uplink is no longer true —
    // leaving it set would put the register and the map back out of step, the
    // very thing the auto-link exists to prevent.
    if (link?.from_uplink) {
      setSystems((prev) => prev.map((s) =>
        s.id === link.from_system_id ? { ...s, uplink_system_id: null } : s,
      ));
      await db().from("yacht_it_systems")
        .update({ uplink_system_id: null })
        .eq("id", link.from_system_id);
    }
  }, []);

  const saveLayout = useCallback(async (positions: Array<{ id: string; x: number; y: number }>) => {
    setSystems((prev) => prev.map((s) => {
      const p = positions.find((q) => q.id === s.id);
      return p ? { ...s, position_x: p.x, position_y: p.y } : s;
    }));
    await Promise.all(positions.map((p) =>
      db().from("yacht_it_systems").update({ position_x: p.x, position_y: p.y }).eq("id", p.id),
    ));
  }, []);

  /**
   * Uplinks recorded before auto-linking existed (or whose cable was later
   * removed) have nothing on the map. Offered as a button rather than run on
   * load: writing rows to the database just because someone opened a page is
   * the kind of surprise that makes people distrust the map.
   */
  const missingUplinks = useMemo(
    () => systems.filter((s) =>
      s.uplink_system_id &&
      systems.some((o) => o.id === s.uplink_system_id) &&
      !links.some(
        (l) => (l.from_system_id === s.uplink_system_id && l.to_system_id === s.id) ||
               (l.from_system_id === s.id && l.to_system_id === s.uplink_system_id),
      ),
    ),
    [systems, links],
  );

  const drawMissingUplinks = useCallback(async () => {
    if (missingUplinks.length === 0) return;
    const rows = missingUplinks.map((s) => ({
      map_id: mapId,
      from_system_id: s.id,
      to_system_id: s.uplink_system_id,
      link_type: "ethernet",
      from_uplink: true,
    }));
    const { data, error } = await db().from("yacht_it_links").insert(rows).select("*");
    if (error) { toast.error("Could not draw uplinks", { description: error.message }); return; }
    setLinks((prev) => [...prev, ...((data ?? []) as YachtLink[])]);
    toast.success(`Drew ${rows.length} uplink${rows.length === 1 ? "" : "s"} on the map`);
  }, [missingUplinks, mapId]);

  // ── Datto RMM links ────────────────────────────────────────────────────────

  const applyDattoLinks = useCallback(async (proposed: ProposedLink[]) => {
    const linkedAt = new Date().toISOString();
    const results = await Promise.all(proposed.map(({ systemId, dattoUid }) =>
      db().from("yacht_it_systems")
        .update({ datto_uid: dattoUid, datto_linked_at: linkedAt })
        .eq("id", systemId),
    ));
    const failed = results.filter((r: any) => r.error);
    const applied = proposed.filter((_, i) => !(results[i] as any).error);

    setSystems((prev) => prev.map((s) => {
      const hit = applied.find((l) => l.systemId === s.id);
      return hit ? { ...s, datto_uid: hit.dattoUid, datto_linked_at: linkedAt } : s;
    }));

    setShowDattoMatch(false);
    if (failed.length > 0) {
      toast.error(`${failed.length} link${failed.length === 1 ? "" : "s"} failed`, {
        description: (failed[0] as any).error?.message,
      });
    }
    if (applied.length > 0) {
      toast.success(`Linked ${applied.length} system${applied.length === 1 ? "" : "s"} to Datto RMM`);
    }
  }, []);

  const unlinkDatto = useCallback(async (systemId: string) => {
    setSystems((prev) => prev.map((s) =>
      s.id === systemId ? { ...s, datto_uid: null, datto_linked_at: null } : s,
    ));
    const { error } = await db().from("yacht_it_systems")
      .update({ datto_uid: null, datto_linked_at: null })
      .eq("id", systemId);
    if (error) toast.error("Could not unlink", { description: error.message });
  }, []);

  /**
   * Copy what Datto knows into the register's own fields. Deliberately manual
   * and deliberately non-destructive: it only fills blanks, so a hand-written
   * hostname someone verified aboard is never overwritten by Datto's guess.
   */
  const pullFromDatto = useCallback(async (system: YachtSystem) => {
    const device = dattoDevices.find((d) => d.datto_uid === system.datto_uid);
    if (!device) return;
    const patch: Partial<YachtSystem> = {};
    if (!system.hostname && device.hostname) patch.hostname = device.hostname;
    if (!system.ip_address && device.int_ip) patch.ip_address = device.int_ip;
    if (!system.firmware_version && device.operating_system) patch.firmware_version = device.operating_system;
    if (Object.keys(patch).length === 0) {
      toast.info("Nothing to fill — those fields already have values");
      return;
    }
    await updateSystem(system.id, patch);
    toast.success(`Filled ${Object.keys(patch).length} field${Object.keys(patch).length === 1 ? "" : "s"} from Datto`);
  }, [dattoDevices, updateSystem]);

  const updateMap = useCallback(async (patch: Partial<YachtMap>) => {
    setMap((prev) => (prev ? { ...prev, ...patch } : prev));
    const { error } = await db().from("yacht_it_maps").update(patch).eq("id", mapId);
    if (error) toast.error("Change not saved", { description: error.message });
  }, [mapId]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    let critical = 0, faults = 0, expiring = 0;
    for (const s of systems) {
      if (s.criticality === "critical") critical += 1;
      if (s.status === "fault") faults += 1;
      const left = daysUntil(s.support_contract_end);
      if (left !== null && left <= CONTRACT_WARN_DAYS) expiring += 1;
    }
    return { total: systems.length, critical, faults, expiring };
  }, [systems]);

  const dattoByUid = useMemo(
    () => new Map(dattoDevices.map((d) => [d.datto_uid, d])),
    [dattoDevices],
  );

  const linkedCount = useMemo(
    // "Live" means Datto still returns it, not just that a link was once made.
    () => systems.filter((s) => s.datto_uid && dattoByUid.get(s.datto_uid) && !dattoByUid.get(s.datto_uid)!.removed_from_datto_at).length,
    [systems, dattoByUid],
  );

  /** Datto sites this vessel is already linked into — steers the matcher. */
  const expectedSites = useMemo(() => {
    const names = new Set<string>();
    for (const s of systems) {
      const d = s.datto_uid ? dattoByUid.get(s.datto_uid) : null;
      if (d?.site_name) names.add(d.site_name);
    }
    return [...names];
  }, [systems, dattoByUid]);

  const selected = systems.find((s) => s.id === selectedId) ?? null;
  const yachtLabel = map?.it_yacht_id ? itYachts.find((y) => y.id === map.it_yacht_id)?.name : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-full grid place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (notFound || !map) {
    return (
      <div className="h-full grid place-items-center text-center p-10">
        <div>
          <Ship className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">That vessel no longer exists</p>
          <p className="mt-1 text-xs text-muted-foreground">It may have been deleted here or on New Horizon-IT's desk.</p>
          <button onClick={onBack} className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to all vessels
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">

      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card/60 px-5 py-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <button onClick={onBack} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> All vessels
            </button>
            <h1 className="mt-0.5 text-lg font-semibold inline-flex items-center gap-2">
              <Ship className="h-5 w-5 text-primary shrink-0" />
              <span className="truncate">{map.name}</span>
              {canEdit && (
                <button
                  onClick={() => setEditingVessel(true)}
                  title="Edit vessel details"
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {readOnly && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <Eye className="h-3 w-3" /> View only
                </span>
              )}
            </h1>
            <p className="text-[11px] text-muted-foreground">
              {yachtLabel ? <><Anchor className="inline h-3 w-3" /> {yachtLabel}</> : "Not linked to an IT Yacht"}
              {map.builder ? ` · ${map.builder}` : ""}
              {map.length_m ? ` · ${map.length_m}m` : ""}
              {map.flag ? ` · ${map.flag}` : ""}
              {map.imo ? ` · IMO ${map.imo}` : ""}
            </p>
            <div className="mt-1"><SyncStatus canEdit={canEdit} onSynced={() => setReloadKey((k) => k + 1)} /></div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <Chip icon={Boxes} label={`${stats.total} system${stats.total === 1 ? "" : "s"}`} />
              {stats.critical > 0 && <Chip icon={ShieldAlert} label={`${stats.critical} critical`} tone="amber" />}
              {stats.faults > 0 && <Chip icon={AlertTriangle} label={`${stats.faults} fault${stats.faults === 1 ? "" : "s"}`} tone="red" />}
              {stats.expiring > 0 && <Chip icon={CalendarClock} label={`${stats.expiring} contract${stats.expiring === 1 ? "" : "s"} due`} tone="amber" />}
              {linkedCount > 0 && <Chip icon={ServerCog} label={`${linkedCount} live from Datto`} />}
              {dattoError && (
                <span title={dattoError}>
                  <Chip icon={ServerCog} label="Datto status unavailable" tone="amber" />
                </span>
              )}
            </div>

            {canEdit && (
              <button
                onClick={() => setShowDattoMatch(true)}
                disabled={!!dattoError}
                title={dattoError ? `Datto is unavailable: ${dattoError}` : "Find Datto RMM devices whose IP matches a system here"}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-50"
              >
                <ServerCog className="h-3.5 w-3.5" /> Match from Datto
              </button>
            )}

            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              {([["register", "Register", Table2], ["map", "Map", Share2]] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                    tab === key ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
          {tab === "map" ? (
            <YachtCanvas
              systems={systems}
              zones={zones}
              links={links}
              selectedId={selectedId}
              vesselName={map.name}
              dattoByUid={dattoByUid}
              onSelect={setSelectedId}
              onMove={moveSystem}
              onAddLink={addLink}
              onDeleteLink={deleteLink}
              onSaveLayout={saveLayout}
              onAddZone={addZone}
              onUpdateZone={updateZone}
              onDeleteZone={deleteZone}
              missingUplinkCount={missingUplinks.length}
              onDrawUplinks={drawMissingUplinks}
              readOnly={readOnly}
            />
          ) : (
            <YachtRegister
              systems={systems}
              dattoByUid={dattoByUid}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAddSystem={addSystem}
              readOnly={readOnly}
            />
          )}
        </div>

        {selected && (
          <YachtSystemPanel
            system={selected}
            systems={systems}
            links={links}
            datto={selected.datto_uid ? dattoByUid.get(selected.datto_uid) ?? null : null}
            readOnly={readOnly}
            onChange={updateSystem}
            onDelete={deleteSystem}
            onUpdateLink={updateLink}
            onDeleteLink={deleteLink}
            onUnlinkDatto={unlinkDatto}
            onPullFromDatto={pullFromDatto}
            onClose={() => setSelectedId(null)}
            onSelect={setSelectedId}
          />
        )}
      </div>

      {showDattoMatch && (
        <YachtDattoMatch
          systems={systems}
          devices={dattoDevices}
          expectedSites={expectedSites}
          onApply={applyDattoLinks}
          onClose={() => setShowDattoMatch(false)}
        />
      )}

      {editingVessel && (
        <VesselDetailsModal
          map={map}
          itYachts={itYachts}
          onSave={async (patch) => { await updateMap(patch); setEditingVessel(false); }}
          onClose={() => setEditingVessel(false)}
        />
      )}
      {dialog}
    </div>
  );
}

// ─── Vessel details ───────────────────────────────────────────────────────────

function VesselDetailsModal({ map, itYachts, onSave, onClose }: {
  map: YachtMap;
  itYachts: ItYachtOption[];
  onSave: (patch: Partial<YachtMap>) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(map.name);
  const [itYachtId, setItYachtId] = useState(map.it_yacht_id ?? "");
  const [imo, setImo] = useState(map.imo ?? "");
  const [builder, setBuilder] = useState(map.builder ?? "");
  const [flag, setFlag] = useState(map.flag ?? "");
  const [lengthM, setLengthM] = useState(map.length_m != null ? String(map.length_m) : "");
  const [notes, setNotes] = useState(map.notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    if (!name.trim()) { toast.error("Give the vessel a name"); return; }
    setSaving(true);
    await onSave({
      name: name.trim(),
      it_yacht_id: itYachtId || null,
      imo: imo.trim() || null,
      builder: builder.trim() || null,
      flag: flag.trim() || null,
      length_m: lengthM.trim() ? Number(lengthM) : null,
      notes: notes.trim() || null,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-semibold inline-flex items-center gap-2">
            <Ship className="h-4 w-4 text-primary" /> Vessel details
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <Field label="Vessel name">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>

          <Field label="IT Yacht">
            <select value={itYachtId} onChange={(e) => setItYachtId(e.target.value)} className={inputCls}>
              <option value="">— not linked —</option>
              {itYachts.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="IMO"><input value={imo} onChange={(e) => setImo(e.target.value)} className={inputCls} /></Field>
            <Field label="Flag"><input value={flag} onChange={(e) => setFlag(e.target.value)} className={inputCls} /></Field>
            <Field label="Builder"><input value={builder} onChange={(e) => setBuilder(e.target.value)} className={inputCls} /></Field>
            <Field label="Length (m)">
              <input type="number" step="0.1" value={lengthM} onChange={(e) => setLengthM(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} resize-y`} />
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-muted">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default YachtNetworkPage;
