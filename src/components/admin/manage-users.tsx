/**
 * Manage Users — Settings panel with two mini tabs:
 *   · Internal Staff — invite/manage Polaris staff logins + roles (reuses the
 *     existing /api/admin/users RBAC flow and UserTable UI).
 *   · Vessel Users — captain-portal logins, one per yacht: create the captain
 *     record first, attach an email/login when ready (temp password shown once),
 *     reset passwords, deactivate. Captains sign in at /portal with mandatory MFA.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Anchor, Check, Copy, KeyRound, Link2, Loader2, Plus, ShieldCheck, Trash2, UserRound, Users, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UserTable } from "@/components/admin/users/UserTable";
import type { UserRole, RoleOption } from "@/lib/admin/types";

const db = supabase as any;

type CaptainRow = {
  id: string; user_id: string | null; yacht_id: string; display_name: string | null;
  email: string | null; active: boolean; position: string; created_at: string;
  yachts?: { vessel_name: string } | null;
};
type YachtOpt = { id: string; vessel_name: string };

export const PORTAL_POSITIONS = ["captain", "owner", "representative", "purser", "other"] as const;
const positionLabel = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

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
        <UserTable users={users} total={total} roles={roles} onRefresh={load} />
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
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [reveal, setReveal] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: accounts }, { data: ys }] = await Promise.all([
      db.from("captain_accounts")
        .select("id, user_id, yacht_id, display_name, email, active, position, created_at, yachts(vessel_name)")
        .order("created_at", { ascending: false }),
      db.from("yachts").select("id, vessel_name").order("vessel_name"),
    ]);
    setRows(accounts ?? []);
    setYachts(ys ?? []);
    setLoading(false);
  }, []);
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
      email = prompt(`Login email for ${r.display_name ?? "this captain"} (${r.yachts?.vessel_name ?? ""})`)?.trim() || null;
      if (!email) return;
    }
    setBusyId(r.id);
    try {
      const data = await api({ action: "create-login", accountId: r.id, email });
      if (data.tempPassword) setReveal({ email, password: data.tempPassword });
      toast.success("Portal login ready");
      void load();
    } catch (e: any) { toast.error(e.message); } finally { setBusyId(null); }
  };

  const resetPassword = async (r: CaptainRow) => {
    if (!confirm(`Reset the portal password for ${r.email}?`)) return;
    setBusyId(r.id);
    try {
      const data = await api({ action: "reset-password", accountId: r.id });
      setReveal({ email: r.email ?? "", password: data.tempPassword });
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

  // Group by vessel — one section per yacht, alphabetical.
  const grouped = useMemo(() => {
    const m = new Map<string, { vessel: string; rows: CaptainRow[] }>();
    for (const r of rows) {
      const key = r.yacht_id;
      if (!m.has(key)) m.set(key, { vessel: r.yachts?.vessel_name ?? "Unknown vessel", rows: [] });
      m.get(key)!.rows.push(r);
    }
    return [...m.values()].sort((a, b) => a.vessel.localeCompare(b.vessel));
  }, [rows]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Client Portal logins (<span className="font-mono text-foreground/80">/portal</span>) — captains today; owners,
          representatives and pursers later. Each account is locked to its own vessel by the database and requires
          two-factor authentication. You can add a person now and attach their email/login later.
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

      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          No portal users yet.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <div key={g.vessel} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border/60 bg-card/60 px-4 py-2.5">
                <Anchor className="h-3.5 w-3.5 text-primary/70" />
                <span className="text-sm font-semibold">{g.vessel}</span>
                <span className="text-xs text-muted-foreground">· {g.rows.length} user{g.rows.length === 1 ? "" : "s"}</span>
              </div>
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
                      <td className="text-foreground/75">{r.email ?? <span className="text-muted-foreground/50">not set</span>}</td>
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

      {addOpen && <AddVesselUserDialog yachts={yachts} onClose={() => setAddOpen(false)}
                                       onCreated={(revealData) => { setAddOpen(false); if (revealData) setReveal(revealData); void load(); }}
                                       api={api} />}
      {reveal && <TempPasswordDialog data={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}

function AddVesselUserDialog({ yachts, onClose, onCreated, api }: {
  yachts: YachtOpt[]; onClose: () => void;
  onCreated: (reveal: { email: string; password: string } | null) => void;
  api: (payload: Record<string, unknown>) => Promise<any>;
}) {
  const [yachtId, setYachtId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("captain");
  const [createNow, setCreateNow] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!yachtId || !name.trim()) return;
    setBusy(true);
    try {
      const { data: inserted, error } = await db.from("captain_accounts")
        .insert({ yacht_id: yachtId, display_name: name.trim(), email: email.trim() || null, position, active: true })
        .select("id").single();
      if (error) throw new Error(error.message);
      if (createNow && email.trim()) {
        const data = await api({ action: "create-login", accountId: inserted.id, email: email.trim() });
        toast.success("Vessel user created with login");
        onCreated(data.tempPassword ? { email: email.trim(), password: data.tempPassword } : null);
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
          <select className={inputCls} required value={yachtId} onChange={(e) => setYachtId(e.target.value)}>
            <option value="">Select a yacht…</option>
            {yachts.map((y) => <option key={y.id} value={y.id}>{y.vessel_name}</option>)}
          </select>
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
        <Button type="submit" disabled={busy || !yachtId || !name.trim()} className="w-full gap-1.5">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add portal user
        </Button>
      </form>
    </div>
  );
}

function TempPasswordDialog({ data, onClose }: { data: { email: string; password: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(`Portal: ${window.location.origin}/portal\nEmail: ${data.email}\nTemporary password: ${data.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5">
        <h3 className="font-semibold">Temporary password — shown once</h3>
        <p className="text-xs text-muted-foreground">
          Pass these to the captain securely. They sign in at <span className="font-mono text-foreground/80">/portal</span>,
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
