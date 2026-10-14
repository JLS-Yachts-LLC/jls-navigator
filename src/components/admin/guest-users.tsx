/**
 * Manage Users → Guests.
 *
 * Guests are outside people with a login that shows them ONLY the files and
 * folders a member of staff shares with them (Read, or Read & write) — Training
 * documents, Vessel documents (a whole vessel, a folder or one file) and Crew
 * documents (a crew member's whole file, a folder or one file). Four
 * mini tabs:
 *   · Guests        — invite (email with a set-your-password link), edit,
 *                     re-send the invite, deactivate / reactivate.
 *   · Groups        — named sets of guests, so a folder can be shared with
 *                     "Surveyors" once instead of person by person.
 *   · Shared items  — every share in one place: what, with whom, permission,
 *                     end date, last opened. Change or revoke from here.
 *   · Activity      — what guests opened, downloaded, uploaded or changed.
 *
 * Reads are direct (staff RLS on the guest tables); writes go through
 * /api/admin/guests and /api/guest-shares so emails and the audit trail follow.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, Ban, Check, Copy, File as FileIcon, Folder, Loader2, Mail, Pencil, Plus, RefreshCw, Search,
  Share2, Ship, Trash2, UserRound, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { fetchAllRows } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PERMISSION_LABEL, folderChain, shareState, type GuestShare, type TreeFolder,
} from "@/lib/guest/shares";
import { ExpiryInput, PermissionSelect, guestApi, guestLabel, type GroupRow } from "@/components/guest/share-dialog";

const db = supabase as any;

type Guest = {
  id: string; user_id: string | null; email: string; display_name: string | null; company: string | null;
  active: boolean; invited_by_name: string | null; invite_sent_at: string | null; invite_error: string | null;
  last_seen_at: string | null; created_at: string;
};
type Member = { group_id: string; guest_id: string };
type ActivityRow = {
  id: string; guest_id: string | null; action: string; resource_type: string | null; resource_id: string | null;
  resource_name: string | null; detail: string | null; created_at: string;
};
type Sub = "guests" | "groups" | "shares" | "activity";
/** Names for shared things that aren't Training folders, keyed by id. */
type Named = { name: string; folderId?: string | null; yachtId?: string | null };

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

const inputCls = "w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary/50";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

const ACTION_LABEL: Record<string, string> = {
  open: "Opened", download: "Downloaded", upload: "Uploaded", create_folder: "Created folder",
  rename: "Renamed", remove: "Removed", replace: "Replaced file",
};

export function GuestUsersPanel() {
  const { session } = useAuth();
  const token = (session as any)?.access_token ?? "";
  const [sub, setSub] = useState<Sub>("guests");
  const [loading, setLoading] = useState(true);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [shares, setShares] = useState<GuestShare[]>([]);
  const [folders, setFolders] = useState<TreeFolder[]>([]);
  const [docNames, setDocNames] = useState<Map<string, Named>>(new Map());
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  /** Shared items pre-filtered to one guest or group (from the Guests / Groups tabs). */
  const [shareFilter, setShareFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const [g, gr, m, sh, f, act] = await Promise.all([
      db.from("guest_accounts").select("*").order("created_at", { ascending: false }),
      db.from("guest_groups").select("id, name, description").order("name"),
      db.from("guest_group_members").select("group_id, guest_id"),
      fetchAllRows(() => db.from("guest_shares").select("*").order("created_at", { ascending: false })),
      fetchAllRows(() => db.from("training_document_folders").select("id, name, parent_id").order("name")),
      db.from("guest_activity").select("*").order("created_at", { ascending: false }).limit(500),
    ]);
    const shareRows = (sh.data ?? []) as GuestShare[];
    const idsOf = (t: string) => [...new Set(shareRows.filter((s) => s.resource_type === t).map((s) => s.resource_id))];
    const names = new Map<string, Named>();
    const chunks = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / 200) }, (_, i) => ids.slice(i * 200, i * 200 + 200));
    for (const c of chunks(idsOf("training_document"))) {
      const { data } = await db.from("training_documents").select("id, title, file_name, folder_id").in("id", c);
      for (const d of data ?? []) names.set(d.id, { name: d.title ?? d.file_name ?? "Document", folderId: d.folder_id });
    }
    for (const c of chunks(idsOf("yacht_document"))) {
      const { data } = await db.from("yacht_documents").select("id, title, file_name, yacht_id").in("id", c);
      for (const d of data ?? []) names.set(d.id, { name: d.title ?? d.file_name ?? "Document", yachtId: d.yacht_id });
    }
    for (const c of chunks(idsOf("yacht_folder"))) {
      const { data } = await db.from("yacht_document_folders").select("id, name, yacht_id").in("id", c);
      for (const f of data ?? []) names.set(f.id, { name: f.name, yachtId: f.yacht_id });
    }
    const yachtIds = [...new Set([...idsOf("yacht_all"), ...[...names.values()].map((n) => n.yachtId).filter(Boolean) as string[]])];
    for (const c of chunks(yachtIds)) {
      const { data } = await db.from("yachts").select("id, vessel_name").in("id", c);
      for (const y of data ?? []) names.set(y.id, { name: y.vessel_name ?? "Vessel" });
    }
    setGuests(g.data ?? []);
    setGroups(gr.data ?? []);
    setMembers(m.data ?? []);
    setShares(shareRows);
    setFolders((f.data ?? []) as TreeFolder[]);
    setDocNames(names);
    setActivity(act.data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const api = (path: string, body: unknown) => guestApi(path, token, body);

  const tabs: { key: Sub; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "guests", label: "Guests", icon: <UserRound className="h-3.5 w-3.5" />, count: guests.length },
    { key: "groups", label: "Groups", icon: <Users className="h-3.5 w-3.5" />, count: groups.length },
    { key: "shares", label: "Shared items", icon: <Share2 className="h-3.5 w-3.5" />, count: shares.filter((s) => shareState(s) === "active").length },
    { key: "activity", label: "Activity", icon: <Activity className="h-3.5 w-3.5" /> },
  ];

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Outside people with a guest login. They see nothing but the files and folders shared with them — share from
        Training → Documents (right-click, or ⋯ → Share with guests), or from the Documents card on a vessel or a crew
        profile (Share, or right-click a file or folder). They sign in at
        <span className="font-mono text-foreground/80"> /guest</span>.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setSub(t.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
              sub === t.key ? "border-primary/50 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}>
            {t.icon} {t.label}{t.count !== undefined && <span className="text-muted-foreground">· {t.count}</span>}
          </button>
        ))}
        <button onClick={() => void load()} title="Refresh" className="ml-auto rounded-md p-1.5 text-muted-foreground hover:text-foreground">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {loading && !guests.length && !groups.length ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : sub === "guests" ? (
        <GuestsTab guests={guests} groups={groups} members={members} shares={shares} api={api} reload={load}
          onShowShares={(id) => { setShareFilter(`g:${id}`); setSub("shares"); }} />
      ) : sub === "groups" ? (
        <GroupsTab guests={guests} groups={groups} members={members} shares={shares} api={api} reload={load}
          onShowShares={(id) => { setShareFilter(`G:${id}`); setSub("shares"); }} />
      ) : sub === "shares" ? (
        <SharesTab guests={guests} groups={groups} members={members} shares={shares} folders={folders} docNames={docNames}
          activity={activity} api={api} reload={load} filter={shareFilter} setFilter={setShareFilter} />
      ) : (
        <ActivityTab activity={activity} guests={guests} />
      )}
    </div>
  );
}

// ── Guests ───────────────────────────────────────────────────────────────────
function GuestsTab({ guests, groups, members, shares, api, reload, onShowShares }: {
  guests: Guest[]; groups: GroupRow[]; members: Member[]; shares: GuestShare[];
  api: (path: string, body: unknown) => Promise<any>; reload: () => Promise<void>;
  onShowShares: (guestId: string) => void;
}) {
  const [editing, setEditing] = useState<Guest | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [link, setLink] = useState<{ email: string; link: string; warning?: string } | null>(null);
  const [q, setQ] = useState("");

  const groupsOf = (guestId: string) => members.filter((m) => m.guest_id === guestId)
    .map((m) => groups.find((g) => g.id === m.group_id)?.name).filter(Boolean) as string[];
  const shareCount = (guestId: string) => {
    const gids = new Set(members.filter((m) => m.guest_id === guestId).map((m) => m.group_id));
    return shares.filter((s) => shareState(s) === "active" && (s.guest_id === guestId || (s.group_id && gids.has(s.group_id)))).length;
  };

  async function run(id: string, fn: () => Promise<any>, ok: string) {
    setBusyId(id);
    try {
      const r = await fn();
      if (r?.warning && r?.link) setLink({ email: guests.find((g) => g.id === id)?.email ?? "", link: r.link, warning: r.warning });
      else toast.success(ok);
      await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "That didn't work"); }
    finally { setBusyId(null); }
  }

  const needle = q.trim().toLowerCase();
  const shown = guests.filter((g) => !needle || [g.email, g.display_name, g.company].some((x) => (x ?? "").toLowerCase().includes(needle)));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guests…" className={cn(inputCls, "w-64 pl-8")} />
        </div>
        <Button size="sm" className="ml-auto gap-1.5" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Invite guest</Button>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          {guests.length ? "No guest matches that search." : "No guests yet. Invite one to start sharing documents with people outside JLS."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-card/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Guest</th><th className="px-3 py-2">Groups</th><th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Shared items</th><th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((g) => {
                const gs = groupsOf(g.id);
                const n = shareCount(g.id);
                return (
                  <tr key={g.id} className={cn("border-t border-border/40", !g.active && "opacity-60")}>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{g.display_name || g.email}</div>
                      <div className="text-xs text-muted-foreground">{g.display_name ? g.email : ""}{g.company ? `${g.display_name ? " · " : ""}${g.company}` : ""}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {gs.length ? gs.map((n) => (
                          <span key={n} className="rounded-full border border-border px-2 py-0.5 text-[11px]">{n}</span>
                        )) : <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {!g.active ? <span className="text-red-300">Deactivated</span>
                        : g.last_seen_at ? <span className="text-emerald-300">Active · seen {fmtDate(g.last_seen_at)}</span>
                        : g.invite_error ? <span className="text-amber-300" title={g.invite_error}>Invite not delivered</span>
                        : <span className="text-muted-foreground">Invited {fmtDate(g.invite_sent_at ?? g.created_at)} · not signed in yet</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => onShowShares(g.id)} className="text-xs text-primary hover:underline">
                        {n} item{n === 1 ? "" : "s"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        {busyId === g.id ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
                          <>
                            <IconBtn title="Edit" onClick={() => setEditing(g)}><Pencil className="h-4 w-4" /></IconBtn>
                            {g.active && (
                              <IconBtn title="Re-send invite (set-password link)"
                                onClick={() => void run(g.id, () => api("/api/admin/guests", { action: "resend-invite", guestId: g.id }), `Invite re-sent to ${g.email}`)}>
                                <Mail className="h-4 w-4" />
                              </IconBtn>
                            )}
                            {g.active ? (
                              <IconBtn title="Deactivate — blocks sign-in and all access" danger
                                onClick={() => { if (window.confirm(`Deactivate ${g.email}? They lose access to everything shared with them straight away.`)) void run(g.id, () => api("/api/admin/guests", { action: "set-active", guestId: g.id, active: false }), "Guest deactivated"); }}>
                                <Ban className="h-4 w-4" />
                              </IconBtn>
                            ) : (
                              <IconBtn title="Reactivate"
                                onClick={() => void run(g.id, () => api("/api/admin/guests", { action: "set-active", guestId: g.id, active: true }), "Guest reactivated")}>
                                <Check className="h-4 w-4" />
                              </IconBtn>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <GuestDialog guest={editing === "new" ? null : editing} groups={groups}
          memberOf={editing === "new" ? [] : members.filter((m) => m.guest_id === editing.id).map((m) => m.group_id)}
          api={api} onClose={() => setEditing(null)}
          onSaved={async (r) => {
            setEditing(null);
            if (r?.link && !r.emailSent) setLink({ email: r.email, link: r.link, warning: r.warning });
            await reload();
          }} />
      )}
      {link && <InviteLinkDialog data={link} onClose={() => setLink(null)} />}
    </div>
  );
}

function IconBtn({ title, onClick, children, danger }: { title: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button title={title} onClick={onClick}
      className={cn("rounded-md p-1.5 text-muted-foreground transition hover:bg-accent/40", danger ? "hover:text-red-300" : "hover:text-foreground")}>
      {children}
    </button>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cn("w-full space-y-4 rounded-2xl border border-border bg-card p-5", wide ? "max-w-lg" : "max-w-md")}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function GuestDialog({ guest, groups, memberOf, api, onClose, onSaved }: {
  guest: Guest | null; groups: GroupRow[]; memberOf: string[];
  api: (path: string, body: unknown) => Promise<any>;
  onClose: () => void;
  onSaved: (r: { email: string; link?: string; emailSent?: boolean; warning?: string } | null) => void;
}) {
  const [email, setEmail] = useState(guest?.email ?? "");
  const [name, setName] = useState(guest?.display_name ?? "");
  const [company, setCompany] = useState(guest?.company ?? "");
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set(memberOf));
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (guest) {
        await api("/api/admin/guests", { action: "update", guestId: guest.id, displayName: name, company, groupIds: [...groupIds] });
        toast.success("Guest updated");
        onSaved(null);
      } else {
        const r = await api("/api/admin/guests", { action: "invite", email, displayName: name, company, groupIds: [...groupIds] });
        if (r.emailSent) toast.success(`Invite sent to ${email.trim()}`);
        onSaved({ email: email.trim(), ...r });
      }
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not save"); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={guest ? "Edit guest" : "Invite a guest"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className={labelCls}>Email</label>
          <input className={inputCls} type="email" required disabled={!!guest} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="surveyor@company.com" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" />
          </div>
          <div>
            <label className={labelCls}>Company</label>
            <input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="RYA" />
          </div>
        </div>
        {groups.length > 0 && (
          <div>
            <label className={labelCls}>Groups</label>
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
              {groups.map((g) => (
                <label key={g.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={groupIds.has(g.id)} onCheckedChange={() => setGroupIds((s) => {
                    const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n;
                  })} />
                  {g.name}
                </label>
              ))}
            </div>
          </div>
        )}
        {!guest && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            They'll get an email with a link to set their password, then sign in at /guest. Until something is shared with them,
            they see an empty page.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy || (!guest && !email.trim())}>
            {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}{guest ? "Save" : "Send invite"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function InviteLinkDialog({ data, onClose }: { data: { email: string; link: string; warning?: string }; onClose: () => void }) {
  return (
    <Modal title="Send this link yourself" onClose={onClose} wide>
      <p className="text-sm text-muted-foreground">{data.warning ?? "The invite email could not be sent."}</p>
      <p className="text-sm">For <span className="font-medium">{data.email}</span> — it lets them set a password once, and expires after a short time.</p>
      <div className="flex gap-2">
        <input readOnly value={data.link} className={cn(inputCls, "font-mono text-xs")} onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="outline" className="gap-1.5" onClick={() => { void navigator.clipboard.writeText(data.link); toast.success("Link copied"); }}>
          <Copy className="h-4 w-4" /> Copy
        </Button>
      </div>
      <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
    </Modal>
  );
}

// ── Groups ───────────────────────────────────────────────────────────────────
function GroupsTab({ guests, groups, members, shares, api, reload, onShowShares }: {
  guests: Guest[]; groups: GroupRow[]; members: Member[]; shares: GuestShare[];
  api: (path: string, body: unknown) => Promise<any>; reload: () => Promise<void>;
  onShowShares: (groupId: string) => void;
}) {
  const [editing, setEditing] = useState<GroupRow | "new" | null>(null);

  async function remove(g: GroupRow) {
    const n = shares.filter((s) => s.group_id === g.id && shareState(s) === "active").length;
    if (!window.confirm(`Delete the group “${g.name}”?${n ? ` Its ${n} share${n === 1 ? "" : "s"} will be removed — members keep anything shared with them directly.` : ""}`)) return;
    try { await api("/api/admin/guests", { action: "group-delete", groupId: g.id }); toast.success("Group deleted"); await reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete"); }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New group</Button>
      </div>
      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          No groups yet. A group lets you share a folder with several guests at once — and anyone added to the group later gets it too.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {groups.map((g) => {
            const mem = members.filter((m) => m.group_id === g.id)
              .map((m) => guests.find((x) => x.id === m.guest_id)).filter(Boolean) as Guest[];
            const n = shares.filter((s) => s.group_id === g.id && shareState(s) === "active").length;
            return (
              <div key={g.id} className="rounded-xl border border-border/60 bg-card/30 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium"><Users className="h-4 w-4 text-primary" /> {g.name}</div>
                    {g.description && <p className="mt-0.5 text-xs text-muted-foreground">{g.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <IconBtn title="Edit group" onClick={() => setEditing(g)}><Pencil className="h-4 w-4" /></IconBtn>
                    <IconBtn title="Delete group" danger onClick={() => void remove(g)}><Trash2 className="h-4 w-4" /></IconBtn>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {mem.length ? mem.map((m) => (
                    <span key={m.id} className={cn("rounded-full border border-border px-2 py-0.5 text-[11px]", !m.active && "line-through opacity-60")}>{guestLabel(m)}</span>
                  )) : <span className="text-xs text-muted-foreground">No members yet</span>}
                </div>
                <button onClick={() => onShowShares(g.id)} className="mt-3 text-xs text-primary hover:underline">
                  {n} shared item{n === 1 ? "" : "s"}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {editing && (
        <GroupDialog group={editing === "new" ? null : editing} guests={guests}
          memberIds={editing === "new" ? [] : members.filter((m) => m.group_id === editing.id).map((m) => m.guest_id)}
          api={api} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />
      )}
    </div>
  );
}

function GroupDialog({ group, guests, memberIds, api, onClose, onSaved }: {
  group: GroupRow | null; guests: Guest[]; memberIds: string[];
  api: (path: string, body: unknown) => Promise<any>; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [ids, setIds] = useState<Set<string>>(new Set(memberIds));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const needle = q.trim().toLowerCase();
  const shown = guests.filter((g) => !needle || [g.email, g.display_name, g.company].some((x) => (x ?? "").toLowerCase().includes(needle)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (group) {
        await api("/api/admin/guests", { action: "group-update", groupId: group.id, name, description });
        await api("/api/admin/guests", { action: "group-members", groupId: group.id, guestIds: [...ids] });
        toast.success("Group saved");
      } else {
        await api("/api/admin/guests", { action: "group-create", name, description, guestIds: [...ids] });
        toast.success(`Group “${name.trim()}” created`);
      }
      await onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not save"); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={group ? "Edit group" : "New guest group"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className={labelCls}>Name</label>
          <input className={inputCls} required value={name} onChange={(e) => setName(e.target.value)} placeholder="RYA Inspectors" />
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className={labelCls}>Members · {ids.size}</label>
          <input className={cn(inputCls, "mb-2")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a guest…" />
          <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
            {shown.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">{guests.length ? "No match." : "Invite guests first, on the Guests tab."}</p>}
            {shown.map((g) => (
              <label key={g.id} className={cn("flex cursor-pointer items-center gap-2 text-sm", !g.active && "opacity-60")}>
                <Checkbox checked={ids.has(g.id)} onCheckedChange={() => setIds((s) => {
                  const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n;
                })} />
                <span className="truncate">{guestLabel(g)}</span>
                {g.display_name && <span className="truncate text-xs text-muted-foreground">{g.email}</span>}
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy || !name.trim()}>{busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Save</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Shared items ─────────────────────────────────────────────────────────────
function SharesTab({ guests, groups, members, shares, folders, docNames, activity, api, reload, filter, setFilter }: {
  guests: Guest[]; groups: GroupRow[]; members: Member[]; shares: GuestShare[]; folders: TreeFolder[];
  docNames: Map<string, Named>; activity: ActivityRow[];
  api: (path: string, body: unknown) => Promise<any>; reload: () => Promise<void>;
  filter: string; setFilter: (f: string) => void;
}) {
  const [status, setStatus] = useState<"active" | "expired" | "revoked" | "all">("active");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const guestById = useMemo(() => new Map(guests.map((g) => [g.id, g])), [guests]);
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  /** "Training › RYA Inspection 2026 › Cruising SMS" — where the item lives. */
  const pathOf = (folderId: string | null) =>
    ["Training documents", ...folderChain(folderId, byId).reverse().map((id) => byId.get(id)?.name ?? "…")].join(" › ");
  const vesselPath = (yachtId: string | null | undefined) => `Vessel documents › ${(yachtId && docNames.get(yachtId)?.name) || "vessel"}`;
  const itemOf = (s: GuestShare): { name: string; where: string; icon: "folder" | "file" | "vessel" | "crew" } => {
    const n = docNames.get(s.resource_id);
    switch (s.resource_type) {
      case "training_folder":
        return { name: byId.get(s.resource_id)?.name ?? "(folder removed)", where: pathOf(byId.get(s.resource_id)?.parent_id ?? null), icon: "folder" };
      case "training_document":
        return { name: n?.name ?? "(file removed)", where: pathOf(n?.folderId ?? null), icon: "file" };
      case "yacht_all":
        return { name: n ? `${n.name} — all documents` : "(vessel removed)", where: "Vessel documents", icon: "vessel" };
      case "yacht_folder":
        return { name: n?.name ?? "(folder removed)", where: vesselPath(n?.yachtId), icon: "folder" };
      case "yacht_sp_file":
        return { name: s.resource_label ?? "(SharePoint file)", where: `${vesselPath(s.resource_id)} · SharePoint`, icon: "file" };
      // Crew items are named from the label saved when they were shared — it
      // carries the crew member's name, and outlives a rename or removal.
      case "crew_all":
        return { name: s.resource_label ?? "(crew member)", where: "Crew documents", icon: "crew" };
      case "crew_folder":
        return { name: s.resource_label ?? "(folder)", where: "Crew documents", icon: "folder" };
      case "crew_document": case "crew_passport_file": case "crew_sp_file":
        return { name: s.resource_label ?? "(file)", where: s.resource_type === "crew_sp_file" ? "Crew documents · SharePoint" : "Crew documents", icon: "file" };
      default:
        return { name: n?.name ?? "(file removed)", where: vesselPath(n?.yachtId), icon: "file" };
    }
  };
  const whoOf = (s: GuestShare) => s.guest_id
    ? { label: guestById.get(s.guest_id) ? guestLabel(guestById.get(s.guest_id)!) : "Guest", group: false }
    : { label: groupById.get(s.group_id ?? "")?.name ?? "Group", group: true };

  /** Last time anyone opened or downloaded through this share. */
  const lastOpened = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of activity) {
      const sid = (a as any).share_id as string | null;
      if (sid && (a.action === "open" || a.action === "download") && !m.has(sid)) m.set(sid, a.created_at);
    }
    return m;
  }, [activity]);

  const filterGroups = useMemo(() => new Set(filter.startsWith("g:")
    ? members.filter((m) => m.guest_id === filter.slice(2)).map((m) => m.group_id) : []), [filter, members]);

  const needle = q.trim().toLowerCase();
  const rows = shares.filter((s) => {
    if (status !== "all" && shareState(s) !== status) return false;
    // A guest's view includes what reaches them through their groups.
    if (filter.startsWith("g:") && s.guest_id !== filter.slice(2) && !(s.group_id && filterGroups.has(s.group_id))) return false;
    if (filter.startsWith("G:") && s.group_id !== filter.slice(2)) return false;
    if (needle) {
      const it = itemOf(s);
      if (![it.name, it.where, whoOf(s).label, s.shared_by_name].some((x) => (x ?? "").toLowerCase().includes(needle))) return false;
    }
    return true;
  });

  async function revoke(ids: string[]) {
    if (!ids.length || !window.confirm(`Revoke ${ids.length === 1 ? "this share" : `${ids.length} shares`}? Access ends immediately.`)) return;
    setBusy(true);
    try {
      const r = await api("/api/guest-shares", { action: "revoke", shareIds: ids });
      toast.success(`${r.revoked} share${r.revoked === 1 ? "" : "s"} revoked`);
      setSelected(new Set());
      await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not revoke"); }
    finally { setBusy(false); }
  }

  async function update(s: GuestShare, patch: Record<string, unknown>) {
    setBusy(true);
    try { await api("/api/guest-shares", { action: "update", shareId: s.id, ...patch }); toast.success("Updated"); await reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not update"); }
    finally { setBusy(false); }
  }

  const liveSelected = [...selected].filter((id) => rows.some((r) => r.id === id && !r.revoked_at));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items, people…" className={cn(inputCls, "w-60 pl-8")} />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className={cn(inputCls, "w-52")}>
          <option value="all">Everyone</option>
          {groups.length > 0 && <optgroup label="Groups">{groups.map((g) => <option key={g.id} value={`G:${g.id}`}>{g.name}</option>)}</optgroup>}
          {guests.length > 0 && <optgroup label="Guests">{guests.map((g) => <option key={g.id} value={`g:${g.id}`}>{guestLabel(g)}</option>)}</optgroup>}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} className={cn(inputCls, "w-36")}>
          <option value="active">Active</option><option value="expired">Expired</option>
          <option value="revoked">Revoked</option><option value="all">All</option>
        </select>
        {liveSelected.length > 0 && (
          <Button size="sm" variant="outline" className="ml-auto gap-1.5" disabled={busy} onClick={() => void revoke(liveSelected)}>
            <Ban className="h-4 w-4" /> Revoke {liveSelected.length}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          {shares.length ? "Nothing matches these filters." : "Nothing has been shared with guests yet. Right-click a file or folder in Training → Documents, or use Share on a vessel's Documents card."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-card/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2"></th>
                <th className="px-3 py-2">Item</th><th className="px-3 py-2">Shared with</th><th className="px-3 py-2">Permission</th>
                <th className="px-3 py-2">Ends</th><th className="px-3 py-2">Shared</th><th className="px-3 py-2">Last opened</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const it = itemOf(s);
                const who = whoOf(s);
                const st = shareState(s);
                return (
                  <tr key={s.id} className={cn("border-t border-border/40 align-top", st !== "active" && "opacity-60")}>
                    <td className="px-3 py-2.5">
                      {st !== "revoked" && (
                        <Checkbox checked={selected.has(s.id)} onCheckedChange={() => setSelected((x) => {
                          const n = new Set(x); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n;
                        })} />
                      )}
                    </td>
                    <td className="max-w-[320px] px-3 py-2.5">
                      <div className="flex items-center gap-2 font-medium">
                        {it.icon === "vessel" ? <Ship className="h-4 w-4 shrink-0 text-sky-300" />
                          : it.icon === "crew" ? <UserRound className="h-4 w-4 shrink-0 text-emerald-300" />
                          : it.icon === "folder" ? <Folder className="h-4 w-4 shrink-0 text-amber-300" />
                          : <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        <span className="truncate">{it.name}</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground" title={it.where}>{it.where}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        {who.group ? <Users className="h-3.5 w-3.5 text-primary" /> : <UserRound className="h-3.5 w-3.5 text-muted-foreground" />}
                        {who.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {st === "revoked" ? <span className="text-xs">{PERMISSION_LABEL[s.permission]}</span>
                        : <PermissionSelect value={s.permission} disabled={busy} onChange={(p) => void update(s, { permission: p })} />}
                    </td>
                    <td className="px-3 py-2.5">
                      {st === "revoked"
                        ? <span className="text-xs text-red-300">Revoked {fmtDate(s.revoked_at)}{s.revoked_by_name ? ` by ${s.revoked_by_name}` : ""}</span>
                        : <ExpiryInput value={s.expires_at} disabled={busy} onCommit={(iso) => void update(s, { expiresAt: iso })} />}
                      {st === "expired" && <div className="mt-1 text-xs text-amber-300">Expired</div>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {fmtDate(s.created_at)}{s.shared_by_name ? <div>by {s.shared_by_name}</div> : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{lastOpened.get(s.id) ? fmtDateTime(lastOpened.get(s.id)) : "Never"}</td>
                    <td className="px-3 py-2.5 text-right">
                      {st !== "revoked" && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void revoke([s.id])}>Revoke</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Activity ─────────────────────────────────────────────────────────────────
function ActivityTab({ activity, guests }: { activity: ActivityRow[]; guests: Guest[] }) {
  const guestById = new Map(guests.map((g) => [g.id, g]));
  if (!activity.length) {
    return <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">No guest activity yet.</div>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full text-sm">
        <thead className="bg-card/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Guest</th><th className="px-3 py-2">Did</th><th className="px-3 py-2">Item</th></tr>
        </thead>
        <tbody>
          {activity.map((a) => {
            const g = a.guest_id ? guestById.get(a.guest_id) : null;
            return (
              <tr key={a.id} className="border-t border-border/40">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{fmtDateTime(a.created_at)}</td>
                <td className="px-3 py-2">{g ? guestLabel(g) : "—"}</td>
                <td className="px-3 py-2">{ACTION_LABEL[a.action] ?? a.action}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    {["training_folder", "yacht_folder", "yacht_all", "crew_folder", "crew_all"].includes(a.resource_type ?? "")
                      ? <Folder className="h-3.5 w-3.5 text-amber-300" /> : <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                    {a.resource_name ?? "—"}
                  </span>
                  {a.detail && <div className="text-xs text-muted-foreground">{a.detail}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
