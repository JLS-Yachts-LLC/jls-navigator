/**
 * Saved contact groups for Signature Campaigns — e.g. "Tariff renewal fleet",
 * "Abu Dhabi vessels", "Management companies". A member is a yacht (its contact
 * email is used at send time) or a person with an email.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderHeart, Plus, Trash2, Loader2, Ship, User, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { RecipientPicker, recipientKey } from "./recipient-picker";
import { parseEmails } from "@/lib/esign/campaign-client";

const db = () => supabase as any;

type Member = { id: string; yacht_id: string | null; name: string | null; email: string | null; role: string | null; yachts: { vessel_name: string; email_address: string | null } | null };
type Group = { id: string; name: string; description: string | null; members: Member[] };

export function ContactGroups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [pickerFor, setPickerFor] = useState<Group | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => { void load(); }, []);
  async function load() {
    const { data, error } = await db().from("esign_contact_groups")
      .select("id, name, description, members:esign_contact_group_members(id, yacht_id, name, email, role, yachts:yacht_id(vessel_name, email_address))")
      .order("name");
    if (error) toast.error(error.message);
    setGroups((data ?? []) as Group[]);
    setLoading(false);
  }

  async function create() {
    if (!newName.trim()) return;
    const { data, error } = await db().from("esign_contact_groups").insert({ name: newName.trim(), created_by: user?.id ?? null }).select("id").single();
    if (error) { toast.error(error.message); return; }
    setNewName(""); setOpenId(data.id); await load();
  }

  async function rename() {
    if (!renaming?.name.trim()) return;
    const { error } = await db().from("esign_contact_groups").update({ name: renaming.name.trim() }).eq("id", renaming.id);
    if (error) toast.error(error.message); else { setRenaming(null); await load(); }
  }

  async function removeGroup(g: Group) {
    if (!confirm(`Delete the group "${g.name}"? Campaigns already sent are not affected.`)) return;
    const { error } = await db().from("esign_contact_groups").delete().eq("id", g.id);
    if (error) toast.error(error.message); else await load();
  }

  async function removeMember(id: string) {
    const { error } = await db().from("esign_contact_group_members").delete().eq("id", id);
    if (error) toast.error(error.message); else await load();
  }

  const existingFor = (g: Group) => new Set(g.members.map((m) => recipientKey(parseEmails(m.email ?? m.yachts?.email_address)[0] ?? "", m.yacht_id)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-72">
          <label className="text-xs font-medium text-muted-foreground">New group</label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void create(); }} placeholder="e.g. Tariff renewal — Dubai fleet" className="mt-1" />
        </div>
        <Button size="sm" className="h-9 gap-1.5" onClick={create} disabled={!newName.trim()}><Plus className="h-3.5 w-3.5" /> Create group</Button>
      </div>

      {loading ? <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> :
        groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 py-12 text-center text-sm text-muted-foreground">
            <FolderHeart className="mx-auto mb-2 h-6 w-6 opacity-50" />
            No groups yet. Groups are saved lists of yachts and people you can send campaigns to in one click.
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => {
              const open = openId === g.id;
              return (
                <div key={g.id} className="rounded-xl border border-border/60 bg-card/40">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <FolderHeart className="h-4 w-4 text-primary/70" />
                    {renaming?.id === g.id ? (
                      <div className="flex flex-1 items-center gap-1">
                        <Input value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} className="h-8" autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter") void rename(); if (e.key === "Escape") setRenaming(null); }} />
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={rename}><Check className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setRenaming(null)}><X className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <button className="flex-1 text-left" onClick={() => setOpenId(open ? null : g.id)}>
                        <span className="font-medium">{g.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{g.members.length} member{g.members.length === 1 ? "" : "s"}</span>
                      </button>
                    )}
                    <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setPickerFor(g)}><Plus className="h-3.5 w-3.5" /> Add</Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2" title="Rename" onClick={() => setRenaming({ id: g.id, name: g.name })}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground hover:text-red-600" title="Delete group" onClick={() => removeGroup(g)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                  {open && (
                    <div className="border-t border-border/50 px-4 py-2">
                      {g.members.length === 0 ? <p className="py-3 text-sm text-muted-foreground">Empty — use Add to put yachts or people in this group.</p> : (
                        <ul className="divide-y divide-border/40">
                          {g.members.map((m) => (
                            <li key={m.id} className="flex items-center gap-2 py-2 text-sm">
                              {m.yacht_id ? <Ship className="h-3.5 w-3.5 text-muted-foreground" /> : <User className="h-3.5 w-3.5 text-muted-foreground" />}
                              <span className="flex-1">
                                <span className="font-medium">{m.yachts?.vessel_name ?? m.name ?? m.email}</span>
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {m.yacht_id ? `${m.name ? `${m.name} · ` : ""}${m.email ?? m.yachts?.email_address ?? "no email on vessel record"}` : m.email}
                                </span>
                              </span>
                              <button onClick={() => removeMember(m.id)} className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      {pickerFor && (
        <RecipientPicker open hideGroups existing={existingFor(pickerFor)} onClose={() => setPickerFor(null)}
          onAdd={async (rs) => {
            if (!rs.length) return;
            const { error } = await db().from("esign_contact_group_members").insert(rs.map((r) => ({
              group_id: pickerFor.id, yacht_id: r.yacht_id,
              // A vessel picked from the Yachts tab follows its record's contact; a named person keeps their own address.
              name: r.fromVessel ? null : r.name, email: r.fromVessel ? null : r.email, role: r.fromVessel ? null : r.role,
            })));
            if (error) toast.error(error.message); else { toast.success(`Added ${rs.length} to ${pickerFor.name}`); setOpenId(pickerFor.id); await load(); }
          }} />
      )}
    </div>
  );
}
