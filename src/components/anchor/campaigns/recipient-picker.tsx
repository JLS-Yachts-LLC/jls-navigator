/**
 * Pick campaign recipients — from yachts (their contact email), contacts
 * (WhatsApp/contact book, Client Portal logins, agency contacts), saved groups,
 * or typed in. Every pick becomes one recipient = one personal email.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Ship, Users, FolderHeart, Keyboard, Search, Loader2, AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseEmails } from "@/lib/esign/campaign-client";

export type RecipientDraft = {
  key: string;
  yacht_id: string | null;
  vessel: string | null;
  name: string;
  email: string;
  role: string | null;
  /** Taken straight from the vessel record (saved groups then follow the record's current email). */
  fromVessel?: boolean;
};

export const recipientKey = (email: string, yachtId: string | null) => `${email.trim().toLowerCase()}|${yachtId ?? ""}`;

type YachtRow = { id: string; vessel_name: string; email_address: string | null; contact_person: string | null; status: string | null };
type ContactRow = { name: string; email: string; yacht_id: string | null; vessel: string | null; role: string | null; source: string };
type GroupRow = { id: string; name: string; members: { yacht_id: string | null; name: string | null; email: string | null; role: string | null }[] };

const db = () => supabase as any;

/** Load once per open — yachts (non-archived) with their contact details. */
export async function loadYachts(): Promise<YachtRow[]> {
  const { data } = await db().from("yachts")
    .select("id, vessel_name, email_address, contact_person, status, archive")
    .order("vessel_name");
  return ((data ?? []) as any[]).filter((y) => !y.archive && y.vessel_name);
}

/** A yacht → recipient, using its first contact email (null if it has none). */
export function yachtRecipient(y: YachtRow, override?: { name?: string | null; email?: string | null; role?: string | null }): RecipientDraft | null {
  const email = (override?.email && parseEmails(override.email)[0]) || parseEmails(y.email_address)[0];
  if (!email) return null;
  const name = (override?.name || y.contact_person || "Captain").trim();
  return { key: recipientKey(email, y.id), yacht_id: y.id, vessel: y.vessel_name, name, email, role: override?.role ?? "Captain", fromVessel: !override?.email && !override?.name };
}

async function loadContacts(): Promise<ContactRow[]> {
  const [wa, caps, agency] = await Promise.all([
    db().from("wa_contacts").select("name, email, yacht_id, yachts:yacht_id(vessel_name)").not("email", "is", null).limit(2000),
    db().from("captain_accounts").select("display_name, email, position, yacht_id, active, yachts:yacht_id(vessel_name)").eq("active", true),
    db().from("agency_contacts").select("name, email, contact_type").not("email", "is", null),
  ]);
  const out: ContactRow[] = [];
  for (const c of (caps.data ?? []) as any[]) {
    for (const e of parseEmails(c.email).slice(0, 1)) out.push({ name: c.display_name || e, email: e, yacht_id: c.yacht_id, vessel: c.yachts?.vessel_name ?? null, role: c.position || "Client Portal", source: "Client Portal" });
  }
  for (const c of (wa.data ?? []) as any[]) {
    for (const e of parseEmails(c.email).slice(0, 1)) out.push({ name: c.name || e, email: e, yacht_id: c.yacht_id, vessel: c.yachts?.vessel_name ?? null, role: null, source: "Contacts" });
  }
  for (const c of (agency.data ?? []) as any[]) {
    for (const e of parseEmails(c.email).slice(0, 1)) out.push({ name: c.name || e, email: e, yacht_id: null, vessel: null, role: c.contact_type ?? null, source: "Agency contacts" });
  }
  // De-duplicate on email + vessel, keeping the first (Client Portal beats contact book).
  const seen = new Set<string>();
  return out.filter((c) => { const k = recipientKey(c.email, c.yacht_id); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadGroups(): Promise<GroupRow[]> {
  const { data } = await db().from("esign_contact_groups")
    .select("id, name, members:esign_contact_group_members(yacht_id, name, email, role)").order("name");
  return (data ?? []) as GroupRow[];
}

/** Expand saved groups into recipients (yacht members use the yacht's email unless the member has one). */
export function expandGroups(groups: GroupRow[], yachts: YachtRow[]): { recipients: RecipientDraft[]; skipped: string[] } {
  const byId = new Map(yachts.map((y) => [y.id, y]));
  const recipients: RecipientDraft[] = []; const skipped: string[] = [];
  for (const g of groups) {
    for (const m of g.members) {
      if (m.yacht_id) {
        const y = byId.get(m.yacht_id);
        if (!y) { skipped.push("(archived vessel)"); continue; }
        const r = yachtRecipient(y, { name: m.name, email: m.email, role: m.role });
        if (r) recipients.push(r); else skipped.push(y.vessel_name);
      } else if (m.email) {
        const e = parseEmails(m.email)[0];
        if (e) recipients.push({ key: recipientKey(e, null), yacht_id: null, vessel: null, name: m.name || e, email: e, role: m.role });
      }
    }
  }
  return { recipients, skipped };
}

const TABS = [
  { key: "yachts", label: "Yachts", icon: Ship },
  { key: "contacts", label: "Contacts", icon: Users },
  { key: "groups", label: "Groups", icon: FolderHeart },
  { key: "manual", label: "Type in", icon: Keyboard },
] as const;

export function RecipientPicker({ open, onClose, onAdd, existing, hideGroups }: {
  open: boolean;
  onClose: () => void;
  onAdd: (r: RecipientDraft[]) => void;
  existing: Set<string>;
  hideGroups?: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("yachts");
  const [loading, setLoading] = useState(false);
  const [yachts, setYachts] = useState<YachtRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[] | null>(null);
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [picked, setPicked] = useState<Map<string, RecipientDraft>>(new Map());
  const [pickedGroups, setPickedGroups] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState({ name: "", email: "", vesselId: "" });

  useEffect(() => {
    if (!open) return;
    setPicked(new Map()); setPickedGroups(new Set()); setQ("");
    setLoading(true);
    void loadYachts().then(setYachts).finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (tab === "contacts" && !contacts) void loadContacts().then(setContacts);
    if (tab === "groups" && !groups) void loadGroups().then(setGroups);
  }, [tab, open, contacts, groups]);

  const statuses = useMemo(() => [...new Set(yachts.map((y) => y.status).filter(Boolean))] as string[], [yachts]);
  const ql = q.trim().toLowerCase();
  const yachtList = useMemo(() => yachts.filter((y) =>
    (statusFilter === "all" || (statusFilter === "with-email" ? parseEmails(y.email_address).length > 0 : y.status === statusFilter)) &&
    (!ql || `${y.vessel_name} ${y.email_address ?? ""} ${y.contact_person ?? ""}`.toLowerCase().includes(ql)),
  ), [yachts, ql, statusFilter]);
  const contactList = useMemo(() => (contacts ?? []).filter((c) =>
    !ql || `${c.name} ${c.email} ${c.vessel ?? ""} ${c.source}`.toLowerCase().includes(ql)), [contacts, ql]);

  const toggle = (r: RecipientDraft) => setPicked((m) => {
    const n = new Map(m); if (n.has(r.key)) n.delete(r.key); else n.set(r.key, r); return n;
  });

  function selectAllYachts() {
    setPicked((m) => {
      const n = new Map(m);
      for (const y of yachtList) { const r = yachtRecipient(y); if (r && !existing.has(r.key)) n.set(r.key, r); }
      return n;
    });
  }

  function addManual() {
    const email = parseEmails(manual.email)[0];
    if (!email) return;
    const y = yachts.find((v) => v.id === manual.vesselId) ?? null;
    const r: RecipientDraft = { key: recipientKey(email, y?.id ?? null), yacht_id: y?.id ?? null, vessel: y?.vessel_name ?? null, name: manual.name.trim() || email, email, role: null };
    setPicked((m) => new Map(m).set(r.key, r));
    setManual({ name: "", email: "", vesselId: manual.vesselId });
  }

  function confirm() {
    const out = [...picked.values()];
    if (pickedGroups.size && groups) {
      const { recipients } = expandGroups(groups.filter((g) => pickedGroups.has(g.id)), yachts);
      out.push(...recipients);
    }
    onAdd(out.filter((r) => !existing.has(r.key)));
    onClose();
  }

  const groupCount = useMemo(() => {
    if (!groups || !pickedGroups.size) return 0;
    return expandGroups(groups.filter((g) => pickedGroups.has(g.id)), yachts).recipients.length;
  }, [groups, pickedGroups, yachts]);
  const total = picked.size + groupCount;

  const row = "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[88vh] max-w-2xl flex-col">
        <DialogHeader><DialogTitle>Add recipients</DialogTitle></DialogHeader>
        <p className="-mt-2 text-xs text-muted-foreground">Each recipient gets their own email and their own signing link — nobody sees who else it went to.</p>

        <div className="flex gap-1 border-b border-border/60">
          {TABS.filter((t) => !(hideGroups && t.key === "groups")).map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cn("flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
                  tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </div>

        {tab !== "manual" && tab !== "groups" && (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-8" />
            </div>
            {tab === "yachts" && (
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm">
                <option value="all">All vessels</option>
                <option value="with-email">Has an email</option>
                {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>
        )}

        <div className="min-h-[280px] flex-1 space-y-1.5 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : tab === "yachts" ? (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{yachtList.length} vessels</span>
                <button className="font-medium text-primary hover:underline" onClick={selectAllYachts}>Select all with an email</button>
              </div>
              {yachtList.map((y) => {
                const r = yachtRecipient(y);
                const emails = parseEmails(y.email_address);
                const already = r ? existing.has(r.key) : false;
                const on = r ? picked.has(r.key) : false;
                return (
                  <button key={y.id} disabled={!r || already} onClick={() => r && toggle(r)}
                    className={cn(row, on ? "border-primary bg-primary/10" : "border-border/60 hover:bg-muted/40", (!r || already) && "cursor-not-allowed opacity-55")}>
                    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{on && <Check className="h-3 w-3" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{y.vessel_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r ? `${r.name} · ${r.email}${emails.length > 1 ? ` (+${emails.length - 1} more)` : ""}` : <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" /> No contact email on the vessel record</span>}
                      </span>
                    </span>
                    {already && <span className="text-[10px] uppercase text-muted-foreground">Added</span>}
                    {y.status && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{y.status}</span>}
                  </button>
                );
              })}
            </>
          ) : tab === "contacts" ? (
            !contacts ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> :
            contactList.map((c) => {
              const r: RecipientDraft = { key: recipientKey(c.email, c.yacht_id), yacht_id: c.yacht_id, vessel: c.vessel, name: c.name, email: c.email, role: c.role };
              const already = existing.has(r.key); const on = picked.has(r.key);
              return (
                <button key={r.key + c.source} disabled={already} onClick={() => toggle(r)}
                  className={cn(row, on ? "border-primary bg-primary/10" : "border-border/60 hover:bg-muted/40", already && "cursor-not-allowed opacity-55")}>
                  <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{on && <Check className="h-3 w-3" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}{c.vessel ? <span className="font-normal text-muted-foreground"> · {c.vessel}</span> : null}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.email}{c.role ? ` · ${c.role}` : ""}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{c.source}</span>
                </button>
              );
            })
          ) : tab === "groups" ? (
            !groups ? <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> :
            groups.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No groups yet — create them under Campaigns → Groups.</p> :
            groups.map((g) => {
              const on = pickedGroups.has(g.id);
              return (
                <button key={g.id} onClick={() => setPickedGroups((s) => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })}
                  className={cn(row, on ? "border-primary bg-primary/10" : "border-border/60 hover:bg-muted/40")}>
                  <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{on && <Check className="h-3 w-3" />}</span>
                  <span className="flex-1 font-medium">{g.name}</span>
                  <span className="text-xs text-muted-foreground">{g.members.length} member{g.members.length === 1 ? "" : "s"}</span>
                </button>
              );
            })
          ) : (
            <div className="space-y-3 pt-1">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Name (e.g. Captain John Smith)" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
                <Input placeholder="Email" type="email" value={manual.email} onChange={(e) => setManual({ ...manual, email: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") addManual(); }} />
              </div>
              <select value={manual.vesselId} onChange={(e) => setManual({ ...manual, vesselId: e.target.value })}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                <option value="">No vessel (or not a client vessel)</option>
                {yachts.map((y) => <option key={y.id} value={y.id}>{y.vessel_name}</option>)}
              </select>
              <Button variant="outline" size="sm" onClick={addManual} disabled={!parseEmails(manual.email).length}>Add to selection</Button>
              {[...picked.values()].length > 0 && (
                <ul className="space-y-1 text-sm">
                  {[...picked.values()].map((r) => <li key={r.key} className="text-muted-foreground">✓ {r.name} · {r.email}{r.vessel ? ` · ${r.vessel}` : ""}</li>)}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">Picking a vessel matters for per-vessel documents (e.g. the Appointment Letter is filled in with that vessel's name and IMO).</p>
            </div>
          )}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-sm text-muted-foreground">{total} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={confirm} disabled={!total}>Add {total || ""} recipient{total === 1 ? "" : "s"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
