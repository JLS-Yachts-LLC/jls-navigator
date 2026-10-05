/**
 * Manage Users — Settings panel with two mini tabs:
 *   · Internal Staff — invite/manage Polaris staff logins + roles (reuses the
 *     existing /api/admin/users RBAC flow and UserTable UI).
 *   · Vessel Users — client-portal logins, each linked to one yacht OR one Orbit 2
 *     managed boat (small-boat owners): create the record first, attach an
 *     email/login when ready (temp password shown once), reset passwords,
 *     deactivate, preview. Everyone signs in at /portal with mandatory MFA. A boat
 *     owner with several boats has one row per boat, all on the same login.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Anchor, Check, ChevronDown, Copy, Eye, KeyRound, Link2, Loader2, Plus, ShieldCheck, Ship, Trash2, UserRound, Users, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { PORTAL_POSITIONS, positionLabel } from "@/lib/portal/portal-positions";
import { PortalAlertRecipients } from "@/components/admin/portal-alert-recipients";
import { PORTAL_THEMES } from "@/lib/portal/portal-theme";
import { PORTAL_MODULES, moduleState, type PortalModuleKey, type PortalModuleRow } from "@/lib/portal/portal-modules";
import { PortalAddresses } from "./portal-addresses";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UserTable } from "@/components/admin/users/UserTable";
import type { UserRole, RoleOption } from "@/lib/admin/types";

const db = supabase as any;

type CaptainRow = {
  id: string; user_id: string | null; yacht_id: string | null; boat_id: string | null;
  display_name: string | null;
  email: string | null; active: boolean; position: string; created_at: string;
  yachts?: { vessel_name: string } | null;
  orbit2_boats?: { name: string } | null;
};
type YachtOpt = { id: string; vessel_name: string; preferred_document_delivery?: string | null };
type VesselModuleRow = PortalModuleRow & { id: string; yacht_id: string | null; boat_id: string | null };
type BoatOpt = { id: string; name: string; client_name: string | null };

/** The yacht or managed boat a portal row is linked to. */
const vesselNameOf = (r: CaptainRow) => r.yachts?.vessel_name ?? r.orbit2_boats?.name ?? "";

/** Open a portal user's portal read-only, as they would see it. */
const openPreview = (r: CaptainRow) =>
  window.open(`/portal?previewCaptain=${encodeURIComponent(r.id)}`, "_blank");


export function ManageUsers() {
  const [tab, setTab] = useState<"staff" | "vessel">("staff");

  return (
    <div className="dark pds-embed rounded-xl border border-border/60 overflow-hidden" style={{ background: "transparent" }}>
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 bg-card/30 px-4">
        <button
          onClick={() => setTab("staff")}
          className={cn(
            "flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
            tab === "staff" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Users className="h-4 w-4" /> Internal Staff
        </button>
        <button
          onClick={() => setTab("vessel")}
          className={cn(
            "flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
            tab === "vessel" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Anchor className="h-4 w-4" /> Client Portal
        </button>
      </div>
      <div className="p-4">
        {tab === "staff" ? <StaffPanel /> : <VesselUsersPanel />}
      </div>
    </div>
  );
}

// ── Internal Staff (existing RBAC invite flow) ────────────────────────────────
function StaffPanel() {
  const { session } = useAuth();
  const token = (session as any)?.access_token ?? "";
  const [users, setUsers] = useState<UserRole[]>([]);
  const [total, setTotal] = useState(0);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [departments, setDepartments] = useState<{ slug: string; name: string; description?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users?pageSize=100", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
      setRoles(data.roles ?? []);
      setDepartments(data.departments ?? []);
    } finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Staff logins for the Polaris app. Inviting sends a set-your-password email; roles drive what each person can see.
      </p>
      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <UserTable users={users} total={total} roles={roles} departments={departments} onRefresh={load} />
      )}
    </div>
  );
}

// ── Portal look per vessel ───────────────────────────────────────────────────
/** The vessel's default portal look; each person can still pick their own in the portal. */
function VesselThemeSelect({ yachtId }: { yachtId: string }) {
  const [theme, setTheme] = useState<string>("bridge");
  useEffect(() => {
    void db.from("portal_vessel_settings").select("theme").eq("yacht_id", yachtId).maybeSingle()
      .then(({ data }: any) => { if (data?.theme) setTheme(data.theme); });
  }, [yachtId]);
  const save = async (value: string) => {
    setTheme(value);
    const { error } = await db.from("portal_vessel_settings").upsert({ yacht_id: yachtId, theme: value, updated_at: new Date().toISOString() });
    if (error) toast.error(error.message); else toast.success("Portal look updated for this vessel");
  };
  return (
    <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground" title="How the portal looks for this vessel's people, unless they pick their own">
      Look
      <select value={theme} onChange={(e) => void save(e.target.value)}
              className="rounded-lg border border-border bg-background/40 px-2 py-1 text-xs outline-none focus:border-primary/50">
        {PORTAL_THEMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
    </label>
  );
}

// ── Portal modules per vessel ────────────────────────────────────────────────
/**
 * The two portal modules for one vessel. Core (Agency with JLS) is always on —
 * staff can only hide features. Management (On board) is off until switched on.
 * Changes save straight away.
 */
function VesselModules({ rows, onSave }: {
  rows: VesselModuleRow[];
  onSave: (module: PortalModuleKey, patch: Partial<Pick<VesselModuleRow, "enabled" | "features">>) => void;
}) {
  const [open, setOpen] = useState<PortalModuleKey | null>(null);
  const state = moduleState(rows);
  const toggleFeature = (module: PortalModuleKey, key: string, on: boolean) => {
    const features = { ...(rows.find((r) => r.module === module)?.features ?? {}) };
    if (on) delete features[key]; else features[key] = false;
    onSave(module, { features });
  };

  return (
    <div className="border-b border-border/60 bg-background/20 px-4 py-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {/* Core */}
        <button type="button" onClick={() => setOpen(open === "core" ? null : "core")}
                className="inline-flex items-center gap-2 text-left hover:text-foreground" title={PORTAL_MODULES.core.blurb}>
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="font-semibold text-primary">{PORTAL_MODULES.core.short}</span>
          <span className="text-muted-foreground">· {PORTAL_MODULES.core.label} · included</span>
          {state.core.hidden.size > 0 && <span className="text-muted-foreground">· {state.core.hidden.size} hidden</span>}
          <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition", open === "core" && "rotate-180")} />
        </button>

        {/* Management */}
        <div className="inline-flex items-center gap-2">
          <button type="button" role="switch" aria-checked={state.management.enabled}
                  aria-label="Management module"
                  onClick={() => onSave("management", { enabled: !state.management.enabled })}
                  title={state.management.enabled ? "Switch Management off for this vessel" : "Switch Management on for this vessel"}
                  className={cn("relative h-5 w-9 rounded-full transition", state.management.enabled ? "bg-teal-500" : "bg-border")}>
            <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition", state.management.enabled ? "left-[18px]" : "left-0.5")} />
          </button>
          <button type="button" onClick={() => setOpen(open === "management" ? null : "management")}
                  className="inline-flex items-center gap-2 text-left hover:text-foreground" title={PORTAL_MODULES.management.blurb}>
            <span className={cn("font-semibold", state.management.enabled ? "text-teal-300" : "text-muted-foreground")}>{PORTAL_MODULES.management.short}</span>
            <span className="text-muted-foreground">· {PORTAL_MODULES.management.label}</span>
            <span className="text-muted-foreground">· {state.management.enabled ? "on" : "off"}</span>
            <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition", open === "management" && "rotate-180")} />
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {PORTAL_MODULES[open].features.map((f) => {
            const on = !state[open].hidden.has(f.key);
            return (
              <label key={f.key} title={f.blurb}
                     className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5", on ? "border-border bg-background/40" : "border-border/40 text-muted-foreground")}>
                <input type="checkbox" checked={on} onChange={(e) => toggleFeature(open, f.key, e.target.checked)} className="h-3.5 w-3.5" />
                <span className="truncate">{f.label}</span>
              </label>
            );
          })}
          <div className="col-span-full text-[11px] text-muted-foreground">
            Untick a feature to hide it from everyone on this vessel. What each person sees inside is still decided by their position.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Vessel Users (captain portal accounts) ───────────────────────────────────
function VesselUsersPanel() {
  const { session } = useAuth();
  const token = (session as any)?.access_token ?? "";
  const [rows, setRows] = useState<CaptainRow[]>([]);
  const [yachts, setYachts] = useState<YachtOpt[]>([]);
  const [boats, setBoats] = useState<BoatOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [reveal, setReveal] = useState<{ email: string; password: string; portalUrl?: string } | null>(null);

  const [moduleRows, setModuleRows] = useState<VesselModuleRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: accounts }, { data: ys }, { data: bs }, { data: mods }] = await Promise.all([
      db.from("captain_accounts")
        .select("id, user_id, yacht_id, boat_id, display_name, email, active, position, created_at, yachts(vessel_name), orbit2_boats(name)")
        .order("created_at", { ascending: false }),
      db.from("yachts").select("id, vessel_name, preferred_document_delivery").order("vessel_name"),
      db.from("orbit2_boats").select("id, name, client_name").eq("active", true).order("name"),
      db.from("yacht_portal_modules").select("id, yacht_id, boat_id, module, enabled, features"),
    ]);
    setRows(accounts ?? []);
    setYachts(ys ?? []);
    setBoats(bs ?? []);
    setModuleRows(mods ?? []);
    setLoading(false);
  }, []);

  /** Rows for one vessel (a yacht or a managed boat). */
  const modulesFor = (yachtId: string | null, boatId: string | null) =>
    moduleRows.filter((m) => (yachtId ? m.yacht_id === yachtId : m.boat_id === boatId));

  /**
   * Switch a module on/off, or hide/show a feature for
   * one vessel. One row per vessel+module; writing the whole row keeps it simple.
   */
  async function saveModule(yachtId: string | null, boatId: string | null, module: PortalModuleKey,
                            patch: Partial<Pick<VesselModuleRow, "enabled" | "features">>) {
    const existing = modulesFor(yachtId, boatId).find((m) => m.module === module);
    const row = {
      yacht_id: yachtId, boat_id: boatId, module,
      enabled: existing?.enabled ?? (module === "core"),
      features: existing?.features ?? {},
      ...patch,
      updated_by: (session as any)?.user?.id ?? null,
    };
    const { data, error } = existing
      ? await db.from("yacht_portal_modules").update(row).eq("id", existing.id).select().single()
      : await db.from("yacht_portal_modules").insert(row).select().single();
    if (error) { toast.error(error.message); return; }
    setModuleRows((prev) => existing ? prev.map((m) => (m.id === existing.id ? data : m)) : [...prev, data]);
  }
  useEffect(() => { void load(); }, [load]);

  const api = useCallback(async (payload: Record<string, unknown>): Promise<any> => {
    const res = await fetch("/api/admin/portal-users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error ?? "Request failed");
    return data;
  }, [token]);

  const createLogin = async (r: CaptainRow) => {
    let email = r.email;
    if (!email) {
      email = prompt(`Login email for ${r.display_name ?? "this user"} (${vesselNameOf(r)})`)?.trim() || null;
      if (!email) return;
    }
    setBusyId(r.id);
    try {
      const data = await api({ action: "create-login", accountId: r.id, email });
      if (data.tempPassword) setReveal({ email, password: data.tempPassword, portalUrl: data.portalUrl });
      toast.success(data.linkedExisting
        ? `Linked to ${email}'s existing login — their password is unchanged`
        : "Portal login ready");
      void load();
    } catch (e: any) { toast.error(e.message); } finally { setBusyId(null); }
  };

  const changeEmail = async (r: CaptainRow) => {
    const email = prompt(
      `New login email for ${r.display_name ?? "this user"}${r.email ? ` (currently ${r.email})` : ""}:`,
      r.email ?? "",
    )?.trim();
    if (!email || email === r.email) return;
    setBusyId(r.id);
    try {
      await api({ action: "change-email", accountId: r.id, email });
      toast.success(`Login email updated to ${email}`);
      void load();
    } catch (e: any) { toast.error(e.message); } finally { setBusyId(null); }
  };

  /** Lost or replaced phone: clear their authenticator; they scan a new QR at next sign-in. */
  const resetMfa = async (r: CaptainRow) => {
    if (!confirm(`Reset the authenticator for ${r.email}? They'll set up a new one the next time they sign in.`)) return;
    setBusyId(r.id);
    try {
      const data = await api({ action: "reset-mfa", accountId: r.id });
      toast.success(data.removed ? `Authenticator reset — ${r.email} will set up a new one at next sign-in` : "No authenticator was set up yet");
    } catch (e: any) { toast.error(e.message); } finally { setBusyId(null); }
  };

  const resetPassword = async (r: CaptainRow) => {
    if (!confirm(`Reset the portal password for ${r.email}?`)) return;
    setBusyId(r.id);
    try {
      const data = await api({ action: "reset-password", accountId: r.id });
      setReveal({ email: r.email ?? "", password: data.tempPassword, portalUrl: data.portalUrl });
    } catch (e: any) { toast.error(e.message); } finally { setBusyId(null); }
  };

  const unlink = async (r: CaptainRow) => {
    if (!confirm(`Deactivate portal access for ${r.display_name ?? r.email}? The record is kept; the login stops working.`)) return;
    setBusyId(r.id);
    try { await api({ action: "unlink", accountId: r.id }); toast.success("Deactivated"); void load(); }
    catch (e: any) { toast.error(e.message); } finally { setBusyId(null); }
  };

  const toggleActive = async (r: CaptainRow) => {
    await db.from("captain_accounts").update({ active: !r.active }).eq("id", r.id);
    void load();
  };

  const removeRow = async (r: CaptainRow) => {
    if (!confirm(`Delete the captain record for ${r.display_name ?? r.email}? (The auth login, if any, is kept but loses portal access.)`)) return;
    await db.from("captain_accounts").delete().eq("id", r.id);
    void load();
  };

  const setPosition = async (r: CaptainRow, position: string) => {
    await db.from("captain_accounts").update({ position }).eq("id", r.id);
    void load();
  };

  const deliveryOf = (yachtId: string) =>
    yachts.find((y) => y.id === yachtId)?.preferred_document_delivery === "portal"
      ? "portal"
      : "secure_link";

  /**
   * Record where this client wants their documents. 'secure_link' emails the
   * branded expiring link; 'portal' emails no link at all and points them at the
   * portal, where the file is scoped to their vessel.
   */
  async function setDelivery(yachtId: string, value: string) {
    const { error } = await db.from("yachts")
      .update({ preferred_document_delivery: value }).eq("id", yachtId);
    if (error) { toast.error(error.message); return; }
    setYachts((prev) => prev.map((y) => (y.id === yachtId ? { ...y, preferred_document_delivery: value } : y)));
    toast.success(value === "portal" ? "Documents will be shared in the portal only" : "Documents will be sent by secure link");
  }

  // Group by vessel — one section per yacht or managed boat, alphabetical.
  const grouped = useMemo(() => {
    const m = new Map<string, { key: string; yachtId: string | null; isBoat: boolean; vessel: string; rows: CaptainRow[] }>();
    for (const r of rows) {
      const key = r.yacht_id ? `y:${r.yacht_id}` : `b:${r.boat_id}`;
      if (!m.has(key)) {
        m.set(key, {
          key, yachtId: r.yacht_id, isBoat: !r.yacht_id,
          vessel: vesselNameOf(r) || (r.yacht_id ? "Unknown vessel" : "Unknown boat"), rows: [],
        });
      }
      m.get(key)!.rows.push(r);
    }
    return [...m.values()].sort((a, b) => a.vessel.localeCompare(b.vessel));
  }, [rows]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Client Portal logins (<span className="font-mono text-foreground/80">/portal</span>) — yacht captains, owners,
          representatives and pursers, and owners of the small boats JLS manages in Orbit 2. Each account is locked to
          its own vessel and requires two-factor authentication. You can add a person now and attach their email/login
          later; Preview shows their portal exactly as they will see it.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.open("/portal", "_blank")}>
            <Anchor className="h-3.5 w-3.5" /> Open portal
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add portal user
          </Button>
        </div>
      </div>

      <PortalAddresses />
      <PortalAlertRecipients />

      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          No portal users yet.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <div key={g.key} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-card/60 px-4 py-2.5">
                {g.isBoat ? <Ship className="h-3.5 w-3.5 text-primary/70" /> : <Anchor className="h-3.5 w-3.5 text-primary/70" />}
                <span className="text-sm font-semibold">{g.vessel}</span>
                {g.isBoat && (
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    Managed boat
                  </span>
                )}
                <span className="text-xs text-muted-foreground">· {g.rows.length} user{g.rows.length === 1 ? "" : "s"}</span>
                {/* How this client asked to receive documents — the permit and
                    visa senders read it, so it belongs next to their logins.
                    Yachts only: managed boats have no permit/visa sends. */}
                {g.yachtId && <VesselThemeSelect yachtId={g.yachtId} />}
                {g.yachtId && <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Documents
                  <select
                    value={deliveryOf(g.yachtId)}
                    onChange={(e) => void setDelivery(g.yachtId!, e.target.value)}
                    className="rounded-lg border border-border bg-background/40 px-2 py-1 text-xs outline-none focus:border-primary/50"
                    title="Where this client is sent their documents"
                  >
                    <option value="secure_link">by secure link</option>
                    <option value="portal">in the portal only</option>
                  </select>
                </label>}
              </div>
              <VesselModules
                rows={modulesFor(g.yachtId, g.isBoat ? g.key.slice(2) : null)}
                onSave={(module, patch) => saveModule(g.yachtId, g.isBoat ? g.key.slice(2) : null, module, patch)}
              />
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th><th>Position</th><th>Login email</th><th>Login</th><th>Active</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="font-medium">
                        <span className="inline-flex items-center gap-2">
                          <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                          {r.display_name ?? "—"}
                        </span>
                      </td>
                      <td>
                        <select value={r.position ?? "captain"} onChange={(e) => void setPosition(r, e.target.value)}
                                className="rounded-lg border border-border bg-background/40 px-2 py-1 text-xs outline-none focus:border-primary/50">
                          {PORTAL_POSITIONS.map((p) => <option key={p} value={p}>{positionLabel(p)}</option>)}
                        </select>
                      </td>
                      <td className="text-foreground/75">
                        <button onClick={() => void changeEmail(r)}
                                title="Change the login email (e.g. lost access / new address)"
                                className="group inline-flex items-center gap-1.5 hover:text-foreground">
                          {r.email ?? <span className="text-muted-foreground/50">not set</span>}
                          <KeyRound className="h-3 w-3 opacity-0 transition group-hover:opacity-60" />
                        </button>
                      </td>
                      <td>
                        {r.user_id ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                            <ShieldCheck className="h-3 w-3" /> Linked
                          </span>
                        ) : (
                          <span className="rounded-full border border-border bg-background/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">No login</span>
                        )}
                      </td>
                      <td>
                        <button onClick={() => void toggleActive(r)}
                                className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold transition",
                                              r.active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-border text-muted-foreground")}>
                          {r.active ? "Active" : "Disabled"}
                        </button>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="inline-flex items-center gap-1">
                          {busyId === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          ) : (
                            <>
                              {r.active && (
                                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" title="Open their portal read-only"
                                        onClick={() => openPreview(r)}>
                                  <Eye className="h-3 w-3" /> Preview
                                </Button>
                              )}
                              {!r.user_id && (
                                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-primary" onClick={() => void createLogin(r)}>
                                  <Link2 className="h-3 w-3" /> Create login
                                </Button>
                              )}
                              {r.user_id && (
                                <>
                                  <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" title="Reset password"
                                          onClick={() => void resetPassword(r)}>
                                    <KeyRound className="h-3 w-3" /> Reset
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" title="Reset authenticator (lost or new phone)"
                                          onClick={() => void resetMfa(r)}>
                                    <ShieldCheck className="h-3 w-3" /> 2FA
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-muted-foreground" title="Deactivate portal access"
                                          onClick={() => void unlink(r)}>
                                    <X className="h-3 w-3" /> Revoke
                                  </Button>
                                </>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-muted-foreground/60 hover:text-destructive" onClick={() => void removeRow(r)}>
                                <Trash2 className="h-3 w-3" /> Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {addOpen && <AddVesselUserDialog yachts={yachts} boats={boats} onClose={() => setAddOpen(false)}
                                       onCreated={(revealData) => { setAddOpen(false); if (revealData) setReveal(revealData); void load(); }}
                                       api={api} />}
      {reveal && <TempPasswordDialog data={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}

function AddVesselUserDialog({ yachts, boats, onClose, onCreated, api }: {
  yachts: YachtOpt[]; boats: BoatOpt[]; onClose: () => void;
  onCreated: (reveal: { email: string; password: string; portalUrl?: string } | null) => void;
  api: (payload: Record<string, unknown>) => Promise<any>;
}) {
  // "y:<yacht id>" or "b:<orbit2 boat id>" — a portal user is linked to one or the other.
  const [vessel, setVessel] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("captain");
  const [createNow, setCreateNow] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vessel || !name.trim()) return;
    const [kind, vesselId] = [vessel.slice(0, 1), vessel.slice(2)];
    setBusy(true);
    try {
      const { data: inserted, error } = await db.from("captain_accounts")
        .insert({
          yacht_id: kind === "y" ? vesselId : null,
          boat_id: kind === "b" ? vesselId : null,
          display_name: name.trim(), email: email.trim() || null, position, active: true,
        })
        .select("id").single();
      if (error) throw new Error(error.message);
      if (createNow && email.trim()) {
        const data = await api({ action: "create-login", accountId: inserted.id, email: email.trim() });
        toast.success(data.linkedExisting
          ? `Added to ${email.trim()}'s existing login — their password is unchanged`
          : "Vessel user created with login");
        onCreated(data.tempPassword ? { email: email.trim(), password: data.tempPassword, portalUrl: data.portalUrl } : null);
      } else {
        toast.success("Vessel user added — attach a login when ready");
        onCreated(null);
      }
    } catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  };

  const inputCls = "w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Add Client Portal user</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Vessel</label>
          <select className={inputCls} required value={vessel}
                  onChange={(e) => {
                    setVessel(e.target.value);
                    // A managed boat's portal user is its owner, almost always.
                    if (e.target.value.startsWith("b:") && position === "captain") setPosition("owner");
                  }}>
            <option value="">Select a yacht or managed boat…</option>
            <optgroup label="Yachts">
              {yachts.map((y) => <option key={y.id} value={`y:${y.id}`}>{y.vessel_name}</option>)}
            </optgroup>
            {boats.length > 0 && (
              <optgroup label="Managed boats (Orbit 2)">
                {boats.map((b) => (
                  <option key={b.id} value={`b:${b.id}`}>{b.name}{b.client_name ? ` — ${b.client_name}` : ""}</option>
                ))}
              </optgroup>
            )}
          </select>
          {vessel.startsWith("b:") && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Owns more than one boat? Add them once per boat with the same email — they get one login and a boat picker.
            </p>
          )}
        </div>
        <div className="grid grid-cols-[1fr_140px] gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Name</label>
            <input className={inputCls} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Captain John Smith" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Position</label>
            <select className={inputCls} value={position} onChange={(e) => setPosition(e.target.value)}>
              {PORTAL_POSITIONS.map((p) => <option key={p} value={p}>{positionLabel(p)}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Login email (optional — can be added later)</label>
          <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="captain@vessel.com" />
        </div>
        {email.trim() && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={createNow} onChange={(e) => setCreateNow(e.target.checked)} />
            Create the login now and show a temporary password
          </label>
        )}
        <Button type="submit" disabled={busy || !vessel || !name.trim()} className="w-full gap-1.5">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add portal user
        </Button>
      </form>
    </div>
  );
}

function TempPasswordDialog({ data, onClose }: { data: { email: string; password: string; portalUrl?: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(`Portal: ${data.portalUrl ?? `${window.location.origin}/portal`}\nEmail: ${data.email}\nTemporary password: ${data.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5">
        <h3 className="font-semibold">Temporary password — shown once</h3>
        <p className="text-xs text-muted-foreground">
          Pass these to the captain securely. They sign in at <span className="font-mono text-foreground/80">{data.portalUrl ?? "/portal"}</span>,
          set up two-factor authentication on first login, and should change the password.
        </p>
        <div className="space-y-2 rounded-xl border border-border bg-background/50 p-4 text-sm">
          <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{data.email}</span></div>
          <div><span className="text-muted-foreground">Password:</span> <span className="font-mono text-base font-semibold text-primary">{data.password}</span></div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void copy()} className="flex-1 gap-1.5">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy details"}
          </Button>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}
