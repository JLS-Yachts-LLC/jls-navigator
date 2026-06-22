import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/lib/auth/useAccess";
import { PolarisShell } from "@/components/platform/PolarisShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PhoneCall, ShieldAlert, MapPin, Anchor, LifeBuoy, HeartPulse, Flag, Umbrella,
  Wrench, UserCircle2, Phone, Mail, Plus, Pencil, Trash2, Loader2, Search, Clock,
} from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  { key: "company_247", label: "Company 24/7", Icon: PhoneCall },
  { key: "dpa_cso", label: "DPA / CSO", Icon: ShieldAlert },
  { key: "coast_guard", label: "Coast Guard / MRCC", Icon: LifeBuoy },
  { key: "medical", label: "Medical / Telemedicine", Icon: HeartPulse },
  { key: "agent", label: "Local Agent", Icon: MapPin },
  { key: "port_authority", label: "Port Authority", Icon: Anchor },
  { key: "flag_state", label: "Flag State", Icon: Flag },
  { key: "insurer", label: "Insurer / P&I", Icon: Umbrella },
  { key: "technical", label: "Technical Manager", Icon: Wrench },
  { key: "owner_rep", label: "Owner's Representative", Icon: UserCircle2 },
  { key: "other", label: "Other", Icon: Phone },
] as const;
type CategoryKey = typeof CATEGORIES[number]["key"];
const CAT_META = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

interface Contact {
  id: string; category: CategoryKey; name: string; role: string | null; organisation: string | null;
  phone: string | null; phone_alt: string | null; email: string | null; available_247: boolean;
  scope: "global" | "vessel" | "location"; vessel_id: string | null; region: string | null;
  notes: string | null; sort_order: number; active: boolean;
  yachts?: { vessel_name: string } | null;
}

export function EmergencyContactsPage() {
  const { isGlobalAdmin } = useAccess();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["emergency-contacts"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("emergency_contacts")
        .select("*, yachts:vessel_id(vessel_name)")
        .eq("active", true)
        .order("sort_order").order("name");
      return (data ?? []) as Contact[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("emergency_contacts").update({ active: false }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Contact removed"); qc.invalidateQueries({ queryKey: ["emergency-contacts"] }); setDeleteId(null); },
    onError: (e: any) => toast.error(e.message ?? "Could not remove"),
  });

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return contacts;
    return contacts.filter((c) =>
      `${c.name} ${c.role ?? ""} ${c.organisation ?? ""} ${c.region ?? ""} ${c.yachts?.vessel_name ?? ""} ${CAT_META[c.category]?.label ?? ""}`.toLowerCase().includes(t));
  }, [contacts, search]);

  const grouped = useMemo(() => {
    const g: Record<string, Contact[]> = {};
    for (const c of filtered) (g[c.category] ??= []).push(c);
    return g;
  }, [filtered]);

  return (
    <PolarisShell
      label="Polaris / My Vessel"
      title="Emergency Contacts"
      actions={isGlobalAdmin ? (
        <Button size="sm" className="gap-1.5" onClick={() => setEditing({ category: "company_247", scope: "global", available_247: true })}>
          <Plus className="h-4 w-4" /> Add contact
        </Button>
      ) : undefined}
    >
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-sm">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-muted-foreground">In a life-threatening emergency at sea, contact the nearest Coast Guard / MRCC or call local emergency services first. This directory is a reference for operational and company contacts.</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, role, vessel, region…" className="h-9 pl-8" />
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : contacts.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <PhoneCall className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm">No emergency contacts have been added yet.</p>
          {isGlobalAdmin && <p className="text-[13px] text-muted-foreground/70">Use “Add contact” to populate the directory.</p>}
        </div>
      ) : (
        <div className="space-y-6">
          {CATEGORIES.filter((c) => grouped[c.key]?.length).map(({ key, label, Icon }) => (
            <div key={key}>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Icon className="h-3.5 w-3.5" /> {label}
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{grouped[key].length}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grouped[key].map((c) => (
                  <ContactCard key={c.id} c={c} admin={isGlobalAdmin} onEdit={() => setEditing(c)} onDelete={() => setDeleteId(c.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <ContactDialog contact={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["emergency-contacts"] }); }} />}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this contact?</AlertDialogTitle>
            <AlertDialogDescription>It will be hidden from the directory. This can be re-added later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && del.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PolarisShell>
  );
}

function ContactCard({ c, admin, onEdit, onDelete }: { c: Contact; admin: boolean; onEdit: () => void; onDelete: () => void }) {
  const scopeLabel = c.scope === "vessel" ? (c.yachts?.vessel_name ?? "Vessel") : c.scope === "location" ? (c.region ?? "Regional") : "All vessels";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{c.name}</span>
            {c.available_247 && <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400"><Clock className="h-2.5 w-2.5" />24/7</span>}
          </div>
          {(c.role || c.organisation) && <div className="truncate text-[12px] text-muted-foreground">{[c.role, c.organisation].filter(Boolean).join(" · ")}</div>}
        </div>
        {admin && (
          <div className="flex shrink-0 gap-0.5">
            <button onClick={onEdit} className="rounded p-1 text-muted-foreground/60 hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={onDelete} className="rounded p-1 text-muted-foreground/60 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        {c.phone && <a href={`tel:${c.phone.replace(/\s+/g, "")}`} className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"><Phone className="h-3.5 w-3.5" />{c.phone}</a>}
        {c.phone_alt && <a href={`tel:${c.phone_alt.replace(/\s+/g, "")}`} className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-primary"><Phone className="h-3 w-3" />{c.phone_alt}</a>}
        {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-primary"><Mail className="h-3.5 w-3.5" />{c.email}</a>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">{scopeLabel}</span>
        {c.region && c.scope !== "location" && <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">{c.region}</span>}
      </div>
      {c.notes && <p className="mt-2 text-[12px] text-muted-foreground">{c.notes}</p>}
    </div>
  );
}

function ContactDialog({ contact, onClose, onSaved }: { contact: Partial<Contact>; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<Contact>>(contact);
  const [busy, setBusy] = useState(false);
  const { data: yachts = [] } = useQuery({
    queryKey: ["yachts-min-ec"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("yachts").select("id, vessel_name").eq("archive", false).order("vessel_name");
      return data ?? [];
    },
  });
  const set = (patch: Partial<Contact>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    if (!form.name?.trim()) { toast.error("Name is required"); return; }
    if (!form.phone && !form.email) { toast.error("Add at least a phone number or email"); return; }
    setBusy(true);
    try {
      const payload = {
        category: form.category ?? "other", name: form.name.trim(),
        role: form.role || null, organisation: form.organisation || null,
        phone: form.phone || null, phone_alt: form.phone_alt || null, email: form.email || null,
        available_247: !!form.available_247, scope: form.scope ?? "global",
        vessel_id: form.scope === "vessel" ? (form.vessel_id ?? null) : null,
        region: form.region || null, notes: form.notes || null,
      };
      const { error } = form.id
        ? await (supabase as any).from("emergency_contacts").update(payload).eq("id", form.id)
        : await (supabase as any).from("emergency_contacts").insert(payload);
      if (error) throw new Error(error.message);
      toast.success(form.id ? "Contact updated" : "Contact added");
      onSaved();
    } catch (e: any) { toast.error(e.message ?? "Could not save"); } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{form.id ? "Edit" : "Add"} emergency contact</DialogTitle></DialogHeader>
        <div className="grid max-h-[65vh] gap-3 overflow-auto py-1 pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={(v) => set({ category: v as CategoryKey })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Scope</Label>
              <Select value={form.scope} onValueChange={(v) => set({ scope: v as Contact["scope"] })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">All vessels</SelectItem>
                  <SelectItem value="vessel">Specific vessel</SelectItem>
                  <SelectItem value="location">Regional</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.scope === "vessel" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Vessel</Label>
              <Select value={form.vessel_id ?? ""} onValueChange={(v) => set({ vessel_id: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select vessel…" /></SelectTrigger>
                <SelectContent>{yachts.map((y: any) => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <Field label="Name *"><Input value={form.name ?? ""} onChange={(e) => set({ name: e.target.value })} className="h-9" placeholder="e.g. JLS Yachts Duty Officer" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role"><Input value={form.role ?? ""} onChange={(e) => set({ role: e.target.value })} className="h-9" /></Field>
            <Field label="Organisation"><Input value={form.organisation ?? ""} onChange={(e) => set({ organisation: e.target.value })} className="h-9" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><Input value={form.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} className="h-9" placeholder="+971 …" /></Field>
            <Field label="Alternative phone"><Input value={form.phone_alt ?? ""} onChange={(e) => set({ phone_alt: e.target.value })} className="h-9" /></Field>
          </div>
          <Field label="Email"><Input value={form.email ?? ""} onChange={(e) => set({ email: e.target.value })} className="h-9" type="email" /></Field>
          <div className="grid grid-cols-2 gap-3 items-end">
            <Field label="Region"><Input value={form.region ?? ""} onChange={(e) => set({ region: e.target.value })} className="h-9" placeholder="e.g. UAE" /></Field>
            <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={!!form.available_247} onChange={(e) => set({ available_247: e.target.checked })} className="accent-primary" /> Available 24/7</label>
          </div>
          <Field label="Notes"><Textarea value={form.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} className="min-h-[60px]" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
