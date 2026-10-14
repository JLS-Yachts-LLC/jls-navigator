/**
 * Share a file or folder with guests — and see / change / revoke who already
 * has it. Used by Training documents and by the Documents card on a vessel.
 *
 * Lists the live shares on this item, plus the ones it inherits from what holds
 * it (a parent folder, or the whole vessel) — those are managed up there. Adding people creates or updates one share per
 * guest or group, then optionally emails them.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, Share2, UserRound, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  PERMISSION_HELP, PERMISSION_LABEL, isContainer, shareState,
  type GuestShare, type SharePermission, type ShareResourceType,
} from "@/lib/guest/shares";

const db = supabase as any;

export type ShareTarget = {
  type: ShareResourceType; id: string; name: string;
  /** What holds this item, nearest first — their shares reach it too. */
  parents: { type: ShareResourceType; id: string; name: string }[];
  /** An extra line under the title, e.g. about SharePoint-only files. */
  note?: string;
  /** Which piece of the item: a passport file's column, or a SharePoint item id. */
  part?: string | null;
  /** Personal data (crew documents): show a warning and start with an end date. */
  sensitive?: boolean;
};

/** Crew documents start with this end date; it can be changed or cleared. */
const SENSITIVE_DEFAULT_DAYS = 30;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const samePart = (s: GuestShare, part: string | null | undefined) => (s.resource_part ?? null) === (part ?? null);
export type GuestRow = { id: string; email: string; display_name: string | null; company: string | null; active: boolean };
export type GroupRow = { id: string; name: string; description: string | null };

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

export const guestLabel = (g: Pick<GuestRow, "display_name" | "email">) => g.display_name || g.email;

/** POST to a guest API with the staff member's token. Throws the server's message. */
export async function guestApi(path: string, token: string, body: unknown): Promise<any> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data;
}

export function PermissionSelect({ value, onChange, disabled }: {
  value: SharePermission; onChange: (p: SharePermission) => void; disabled?: boolean;
}) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as SharePermission)}
      className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground">
      <option value="read">{PERMISSION_LABEL.read}</option>
      <option value="read_write">{PERMISSION_LABEL.read_write}</option>
    </select>
  );
}

/**
 * An existing share's end date. Saves on blur, not on every change — typing a
 * year digit by digit passes through dates like 0002-…, which would each be sent.
 */
export function ExpiryInput({ value, disabled, onCommit }: {
  value: string | null; disabled?: boolean; onCommit: (iso: string | null) => void;
}) {
  const initial = value ? value.slice(0, 10) : "";
  const [v, setV] = useState(initial);
  useEffect(() => { setV(initial); }, [initial]);
  return (
    <Input type="date" min={new Date().toISOString().slice(0, 10)} className="h-8 w-[9.5rem]" disabled={disabled}
      value={v} title="Access ends (blank = no end date)"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== initial) onCommit(v ? new Date(`${v}T23:59:59`).toISOString() : null); }} />
  );
}

export function ShareDialog({ target, onClose, onChanged }: {
  target: ShareTarget | null;
  onClose: () => void;
  /** Called after anything changes, so the page can refresh its "shared" markers. */
  onChanged?: () => void;
}) {
  const { session } = useAuth();
  const token = (session as any)?.access_token ?? "";
  const [loading, setLoading] = useState(true);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [memberCount, setMemberCount] = useState<Record<string, number>>({});
  const [shares, setShares] = useState<GuestShare[]>([]);
  const [busy, setBusy] = useState(false);

  // The "add people" form
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set()); // "g:<id>" guest, "G:<id>" group
  const [permission, setPermission] = useState<SharePermission>("read");
  const [expires, setExpires] = useState("");
  const [notify, setNotify] = useState(true);
  const [message, setMessage] = useState("");

  const parents = target?.parents ?? [];

  const load = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    const above = target.parents;
    const [g, gr, m, own, inh] = await Promise.all([
      db.from("guest_accounts").select("id, email, display_name, company, active").order("display_name"),
      db.from("guest_groups").select("id, name, description").order("name"),
      db.from("guest_group_members").select("group_id"),
      (target.part
        ? db.from("guest_shares").select("*").eq("resource_type", target.type).eq("resource_id", target.id).eq("resource_part", target.part)
        : db.from("guest_shares").select("*").eq("resource_type", target.type).eq("resource_id", target.id).is("resource_part", null))
        .is("revoked_at", null).order("created_at"),
      above.length
        ? db.from("guest_shares").select("*").in("resource_id", above.map((p) => p.id)).is("revoked_at", null)
        : Promise.resolve({ data: [] }),
    ]);
    setGuests((g.data ?? []) as GuestRow[]);
    setGroups((gr.data ?? []) as GroupRow[]);
    const counts: Record<string, number> = {};
    for (const r of m.data ?? []) counts[r.group_id] = (counts[r.group_id] ?? 0) + 1;
    setMemberCount(counts);
    const inherited = ((inh.data ?? []) as GuestShare[])
      .filter((s) => !s.resource_part && above.some((p) => p.type === s.resource_type && p.id === s.resource_id));
    setShares([...(own.data ?? []), ...inherited] as GuestShare[]);
    setLoading(false);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    setPicked(new Set()); setQuery(""); setPermission("read"); setNotify(true); setMessage("");
    setExpires(target.sensitive ? isoDay(new Date(Date.now() + SENSITIVE_DEFAULT_DAYS * 86400000)) : "");
    void load();
  }, [target, load]);

  const guestById = useMemo(() => new Map(guests.map((g) => [g.id, g])), [guests]);
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const nameOf = (s: GuestShare) => s.guest_id
    ? (guestById.get(s.guest_id) ? guestLabel(guestById.get(s.guest_id)!) : "Guest")
    : (groupById.get(s.group_id ?? "")?.name ?? "Group");

  const isOwn = (s: GuestShare) => s.resource_type === target?.type && s.resource_id === target?.id && samePart(s, target?.part);
  const own = shares.filter(isOwn);
  const inherited = shares.filter((s) => !isOwn(s));

  const q = query.trim().toLowerCase();
  const matches = (...xs: (string | null | undefined)[]) => !q || xs.some((x) => (x ?? "").toLowerCase().includes(q));
  const groupOptions = groups.filter((g) => matches(g.name, g.description));
  const guestOptions = guests.filter((g) => g.active && matches(g.display_name, g.email, g.company));

  const toggle = (key: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  async function share() {
    if (!target || !picked.size) return;
    setBusy(true);
    try {
      const targets = [...picked].map((k) => (k.startsWith("G:") ? { groupId: k.slice(2) } : { guestId: k.slice(2) }));
      const r = await guestApi("/api/guest-shares", token, {
        action: "share", resourceType: target.type, resourceId: target.id, resourcePart: target.part ?? null, targets, permission,
        expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
        notify, message,
      });
      if (r.warning) toast.warning(r.warning);
      else toast.success(notify && r.notified ? `Shared — ${r.notified} ${r.notified === 1 ? "person" : "people"} emailed` : "Shared");
      setPicked(new Set()); setMessage("");
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not share");
    } finally { setBusy(false); }
  }

  async function update(s: GuestShare, patch: { permission?: SharePermission; expiresAt?: string | null }) {
    setBusy(true);
    try {
      await guestApi("/api/guest-shares", token, { action: "update", shareId: s.id, ...patch });
      toast.success("Updated");
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
    } finally { setBusy(false); }
  }

  async function revoke(s: GuestShare) {
    setBusy(true);
    try {
      await guestApi("/api/guest-shares", token, { action: "revoke", shareIds: [s.id] });
      toast.success(`Access removed for ${nameOf(s)}`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke");
    } finally { setBusy(false); }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Share2 className="h-4 w-4" /> Share “{target?.name}”</DialogTitle>
          <DialogDescription>
            Guests see only what is shared with them.{" "}
            {target && isContainer(target.type) ? "Sharing a folder shares everything inside it, including anything added later." : ""}
            {target?.note ? <span className="mt-1 block">{target.note}</span> : null}
            {target?.sensitive && (
              <span className="mt-2 block rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Personal data — passports, ID and other crew records. Only share with someone entitled to see them, for as
                long as they need. Access ends in {SENSITIVE_DEFAULT_DAYS} days unless you change the date below.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid gap-5">
            {/* ── Add people ─────────────────────────────── */}
            <section className="grid gap-3">
              {guests.length === 0 && groups.length === 0 ? (
                <p className="rounded-lg border border-border/60 bg-card/40 p-3 text-sm text-muted-foreground">
                  There are no guests yet. An admin, or anyone with the Guest Access permission, can add them in <span className="text-foreground">Settings → Manage Users → Guests</span>.
                </p>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a guest or group…" className="pl-8" />
                  </div>
                  {picked.size > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {[...picked].map((k) => {
                        const label = k.startsWith("G:") ? groupById.get(k.slice(2))?.name : (guestById.get(k.slice(2)) ? guestLabel(guestById.get(k.slice(2))!) : "");
                        return (
                          <span key={k} className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs text-foreground">
                            {k.startsWith("G:") ? <Users className="h-3 w-3" /> : <UserRound className="h-3 w-3" />} {label}
                            <button onClick={() => toggle(k)} aria-label="Remove"><X className="h-3 w-3" /></button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border/60">
                    {groupOptions.map((g) => (
                      <label key={g.id} className="flex cursor-pointer items-center gap-3 border-b border-border/40 px-3 py-2 text-sm last:border-0 hover:bg-accent/30">
                        <Checkbox checked={picked.has(`G:${g.id}`)} onCheckedChange={() => toggle(`G:${g.id}`)} />
                        <Users className="h-4 w-4 text-primary" />
                        <span className="flex-1 truncate">{g.name}</span>
                        <span className="text-xs text-muted-foreground">group · {memberCount[g.id] ?? 0} member{memberCount[g.id] === 1 ? "" : "s"}</span>
                      </label>
                    ))}
                    {guestOptions.map((g) => (
                      <label key={g.id} className="flex cursor-pointer items-center gap-3 border-b border-border/40 px-3 py-2 text-sm last:border-0 hover:bg-accent/30">
                        <Checkbox checked={picked.has(`g:${g.id}`)} onCheckedChange={() => toggle(`g:${g.id}`)} />
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">
                          {guestLabel(g)}
                          {g.display_name && <span className="ml-2 text-xs text-muted-foreground">{g.email}</span>}
                        </span>
                        {g.company && <span className="truncate text-xs text-muted-foreground">{g.company}</span>}
                      </label>
                    ))}
                    {groupOptions.length + guestOptions.length === 0 && (
                      <p className="px-3 py-3 text-sm text-muted-foreground">No guest or group matches “{query.trim()}”.</p>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">Permission</div>
                      <div className="flex items-center gap-2">
                        <PermissionSelect value={permission} onChange={setPermission} />
                        <span className="text-xs text-muted-foreground">{PERMISSION_HELP[permission]}</span>
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">Access ends (optional)</div>
                      <Input type="date" min={today} value={expires} onChange={(e) => setExpires(e.target.value)} className="h-8" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={notify} onCheckedChange={(v) => setNotify(v === true)} /> Email them that it has been shared
                  </label>
                  {notify && (
                    <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2}
                      placeholder="Add a message (optional)" />
                  )}
                </>
              )}
            </section>

            {/* ── Who has access ─────────────────────────── */}
            <section>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Who has access</div>
              {own.length === 0 && inherited.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not shared with any guest.</p>
              ) : (
                <ul className="divide-y divide-border/40 rounded-lg border border-border/60">
                  {own.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                      {s.group_id ? <Users className="h-4 w-4 text-primary" /> : <UserRound className="h-4 w-4 text-muted-foreground" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{nameOf(s)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {s.shared_by_name ? `by ${s.shared_by_name} · ` : ""}{fmtDate(s.created_at)}
                          {shareState(s) === "expired" ? " · expired" : s.expires_at ? ` · until ${fmtDate(s.expires_at)}` : ""}
                        </span>
                      </span>
                      <PermissionSelect value={s.permission} disabled={busy} onChange={(p) => void update(s, { permission: p })} />
                      <ExpiryInput value={s.expires_at} disabled={busy} onCommit={(iso) => void update(s, { expiresAt: iso })} />
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void revoke(s)}>Revoke</Button>
                    </li>
                  ))}
                  {inherited.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm opacity-80">
                      {s.group_id ? <Users className="h-4 w-4 text-primary" /> : <UserRound className="h-4 w-4 text-muted-foreground" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{nameOf(s)}</span>
                        <span className="block text-xs text-muted-foreground">
                          Through “{parents.find((p) => p.id === s.resource_id)?.name ?? "the folder above"}” — change it there
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">{PERMISSION_LABEL[s.permission]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
          {(guests.length > 0 || groups.length > 0) && (
            <Button onClick={() => void share()} disabled={!picked.size || busy}>
              {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Share{picked.size ? ` with ${picked.size}` : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
