/**
 * Lists — who a broadcast goes to. Members are added and removed here; removal
 * is a soft delete (removed_at + reason), so "who was on this list when we sent
 * it" can always be answered.
 *
 * Being on a list isn't consent. Each send re-checks every member, so an
 * opted-out contact on a list is simply skipped.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Users, UserMinus, Archive, Search, History, Radio, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { db, ConsentChip, fmtDate, Empty, type WaContact, type WaList } from "./wa-common";

interface Member {
  id: string;
  contact_id: string;
  added_at: string;
  removed_at: string | null;
  remove_reason: string | null;
  contact: WaContact;
}

export function WaLists({ canEdit }: { canEdit: boolean }) {
  const [lists, setLists] = useState<Array<WaList & { members: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const [{ data: ls, error }, { data: ms }] = await Promise.all([
      db().from("wa_lists").select("*").eq("archived", false).order("name"),
      db().from("wa_list_members").select("list_id").is("removed_at", null),
    ]);
    if (error) toast.error(error.message);
    const n = new Map<string, number>();
    for (const m of (ms ?? []) as any[]) n.set(m.list_id, (n.get(m.list_id) ?? 0) + 1);
    const rows = ((ls ?? []) as WaList[]).map((l) => ({ ...l, members: n.get(l.id) ?? 0 }));
    setLists(rows);
    setActiveId((cur) => cur && rows.some((r) => r.id === cur) ? cur : rows[0]?.id ?? null);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const active = lists.find((l) => l.id === activeId) ?? null;

  if (loading) return <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <aside className="space-y-2">
        {canEdit && (
          <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New list
          </Button>
        )}
        {lists.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">No lists yet.</p>
        ) : lists.map((l) => (
          <button key={l.id} onClick={() => setActiveId(l.id)}
            className={cn("w-full rounded-lg border px-3 py-2 text-left",
              activeId === l.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}>
            <div className="flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1 truncate text-sm font-medium">{l.name}</span>
              <span className="text-xs text-muted-foreground">{l.members}</span>
            </div>
            {l.description && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{l.description}</p>}
          </button>
        ))}
        <p className="px-1 text-[11px] text-muted-foreground">
          Lists are broadcast lists: each person gets the message privately. Real WhatsApp groups come later.
        </p>
      </aside>

      <section>
        {active ? <ListDetail key={active.id} list={active} canEdit={canEdit} onChanged={load} />
          : <Empty title="No list chosen">{canEdit ? "Create a list, then add opted-in contacts to it." : null}</Empty>}
      </section>

      {creating && <ListDialog onClose={() => setCreating(false)} onSaved={(id) => { setActiveId(id); void load(); }} />}
    </div>
  );
}

function ListDetail({ list, canEdit, onChanged }: { list: WaList; canEdit: boolean; onChanged: () => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [q, setQ] = useState("");

  async function load() {
    const { data, error } = await db().from("wa_list_members")
      .select("id, contact_id, added_at, removed_at, remove_reason, contact:wa_contacts(*, yacht:yachts(vessel_name))")
      .eq("list_id", list.id).order("added_at", { ascending: false });
    if (error) toast.error(error.message);
    setMembers((data ?? []) as Member[]);
  }
  useEffect(() => { void load(); }, [list.id]);

  const current = (members ?? []).filter((m) => !m.removed_at);
  const past = (members ?? []).filter((m) => m.removed_at);
  const reachable = current.filter((m) => m.contact.consent_status === "opted_in" && m.contact.phone_e164).length;
  const s = q.trim().toLowerCase();
  const shown = current.filter((m) => !s || [m.contact.name, m.contact.phone_e164, m.contact.yacht?.vessel_name]
    .some((v) => (v ?? "").toLowerCase().includes(s)));

  async function archive() {
    if (!confirm(`Archive "${list.name}"? Its history and past sends are kept.`)) return;
    const { error } = await db().from("wa_lists").update({ archived: true }).eq("id", list.id);
    if (error) toast.error(error.message); else { toast.success("List archived"); onChanged(); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 text-lg font-semibold">
            {list.name}
            {canEdit && (
              <button onClick={() => setRenaming(true)} title="Rename list"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </h2>
          {list.description && <p className="text-xs text-muted-foreground">{list.description}</p>}
          <p className="text-xs text-muted-foreground">
            {current.length} member{current.length === 1 ? "" : "s"} · {reachable} reachable now (opted in with a number)
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setAdding(true)} className="gap-1.5"><Users className="h-4 w-4" /> Add members</Button>
            <Button size="sm" variant="ghost" onClick={() => void archive()} className="gap-1.5"><Archive className="h-4 w-4" /> Archive</Button>
          </div>
        )}
      </div>

      {members === null ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        : current.length === 0 ? <Empty title="Nobody on this list yet" />
        : (
          <>
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members" className="h-8 pl-8" />
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Vessel</th><th className="px-3 py-2">WhatsApp</th><th className="px-3 py-2">Consent</th><th className="px-3 py-2">Added</th><th /></tr>
                </thead>
                <tbody>
                  {shown.map((m) => (
                    <tr key={m.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 font-medium">{m.contact.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{m.contact.yacht?.vessel_name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{m.contact.phone_e164 ?? "—"}</td>
                      <td className="px-3 py-2"><ConsentChip c={m.contact} /></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(m.added_at)}</td>
                      <td className="px-3 py-2 text-right">
                        {canEdit && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500" title="Remove from list" onClick={() => setRemoving(m)}>
                            <UserMinus className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

      {past.length > 0 && (
        <div>
          <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowHistory((v) => !v)}>
            <History className="h-3.5 w-3.5" /> {showHistory ? "Hide" : "Show"} {past.length} removed
          </button>
          {showHistory && (
            <ul className="mt-2 space-y-1 text-xs">
              {past.map((m) => (
                <li key={m.id} className="text-muted-foreground">
                  <span className="text-foreground">{m.contact.name}</span> — removed {fmtDate(m.removed_at)}{m.remove_reason ? `: ${m.remove_reason}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {adding && <AddMembersDialog list={list} existing={new Set(current.map((m) => m.contact_id))}
        onClose={() => setAdding(false)} onSaved={() => { void load(); onChanged(); }} />}
      {renaming && <ListDialog list={list} onClose={() => setRenaming(false)} onSaved={() => onChanged()} />}
      {removing && <RemoveDialog member={removing} onClose={() => setRemoving(null)} onSaved={() => { void load(); onChanged(); }} />}
    </div>
  );
}

function ListDialog({ list, onClose, onSaved }: { list?: WaList; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState(list?.name ?? "");
  const [description, setDescription] = useState(list?.description ?? "");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!name.trim()) { toast.error("Name the list"); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const fields = { name: name.trim(), description: description.trim() || null };
    const { data, error } = list
      ? await db().from("wa_lists").update(fields).eq("id", list.id).select("id").single()
      : await db().from("wa_lists").insert({ ...fields, kind: "broadcast", created_by: u.user?.id ?? null }).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onSaved(data.id);
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>{list ? "Edit list" : "New broadcast list"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Captains — Dubai Marina" /></div>
          <div className="space-y-1.5"><Label>Description</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{list ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddMembersDialog({ list, existing, onClose, onSaved }: {
  list: WaList; existing: Set<string>; onClose: () => void; onSaved: () => void;
}) {
  const [rows, setRows] = useState<WaContact[] | null>(null);
  const [q, setQ] = useState("");
  const [onlyOptedIn, setOnlyOptedIn] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void db().from("wa_contacts").select("*, yacht:yachts(vessel_name)").neq("consent_status", "opted_out").order("name")
      .then(({ data }: any) => setRows(data ?? []));
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !existing.has(r.id) && (!onlyOptedIn || r.consent_status === "opted_in") &&
      (!s || [r.name, r.phone_e164, r.yacht?.vessel_name].some((v) => (v ?? "").toLowerCase().includes(s))));
  }, [rows, q, onlyOptedIn, existing]);

  async function save() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db().from("wa_list_members").insert(
      [...picked].map((contact_id) => ({ list_id: list.id, contact_id, added_by: u.user?.id ?? null })));
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Added ${picked.size} to ${list.name}`);
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to {list.name}</DialogTitle>
          <DialogDescription>Opted-out contacts aren't offered. Anyone not yet opted in can be added, but won't be messaged until they agree.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts" className="h-8" />
          <label className="flex shrink-0 items-center gap-1.5 text-xs">
            <Checkbox checked={onlyOptedIn} onCheckedChange={(v) => setOnlyOptedIn(!!v)} /> Opted in only
          </label>
        </div>
        <div className="max-h-80 overflow-y-auto rounded-md border border-border">
          {rows === null ? <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-muted-foreground" />
            : shown.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">No contacts to add.</p>
            : (
              <>
                <label className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
                  <Checkbox checked={shown.every((r) => picked.has(r.id))}
                    onCheckedChange={(v) => setPicked(v ? new Set([...picked, ...shown.map((r) => r.id)]) : new Set())} />
                  Select all shown ({shown.length})
                </label>
                {shown.map((r) => (
                  <label key={r.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/50">
                    <Checkbox checked={picked.has(r.id)} onCheckedChange={() =>
                      setPicked((p) => { const n = new Set(p); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{r.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{[r.yacht?.vessel_name, r.phone_e164].filter(Boolean).join(" · ")}</span>
                    </span>
                    <ConsentChip c={r} />
                  </label>
                ))}
              </>
            )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || picked.size === 0}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Add {picked.size || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db().from("wa_list_members").update({
      removed_at: new Date().toISOString(), removed_by: u.user?.id ?? null, remove_reason: reason.trim() || null,
    }).eq("id", member.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${member.contact.name} removed`);
    onSaved();
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Remove {member.contact.name}?</DialogTitle>
          <DialogDescription>They come off this list only. To stop all WhatsApp messages, record an opt-out on the Contacts tab.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5"><Label>Reason (optional)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Left the vessel" /></div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Remove</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

