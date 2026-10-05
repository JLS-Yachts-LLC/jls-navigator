/**
 * Contacts — who can be messaged, and the proof they agreed.
 *
 * Consent is never edited here directly: recording an opt-in or opt-out calls
 * wa_record_consent(), which writes the audit trail, and the database refuses
 * any other route. Imported numbers are suggestions; the client confirms their
 * own on the opt-in page.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Upload, Plus, Mail, ShieldCheck, ShieldOff, History, Pencil, Loader2, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toE164, OPTIN_CATEGORY_TEXT } from "@/lib/whatsapp/shared";
import { db, waApi, ConsentChip, Chip, fmtDate, Empty, type WaContact } from "./wa-common";
import { BulkConsentDialog, CsvImportDialog } from "./wa-bulk";

type Filter = "all" | WaContact["consent_status"];

export function WaContacts({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<WaContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<WaContact | "new" | null>(null);
  const [consentFor, setConsentFor] = useState<{ c: WaContact; mode: "in" | "out" } | null>(null);
  const [bulk, setBulk] = useState<"in" | "out" | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<WaContact | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await db().from("wa_contacts")
      .select("*, yacht:yachts(vessel_name)").order("name");
    if (error) toast.error(error.message);
    setRows((data ?? []) as WaContact[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) =>
      (filter === "all" || r.consent_status === filter) &&
      (!s || [r.name, r.email, r.phone_e164, r.yacht?.vessel_name].some((v) => (v ?? "").toLowerCase().includes(s))));
  }, [rows, q, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.consent_status] = (c[r.consent_status] ?? 0) + 1;
    return c;
  }, [rows]);

  // ── Import from the client records Polaris already holds ──
  async function importContacts() {
    setBusy("import");
    try {
      const [{ data: codes }, { data: vessels }, { data: agency }, { data: existing }] = await Promise.all([
        db().from("country_dial_codes").select("dial_code"),
        db().from("yachts").select("id, vessel_name, contact_person, email_address, contact_no, archive"),
        db().from("agency_contacts").select("id, name, email, phone, vessel_id"),
        db().from("wa_contacts").select("source, source_id"),
      ]);
      const dial = ((codes ?? []) as any[]).map((r) => r.dial_code);
      const have = new Set(((existing ?? []) as any[]).map((r) => `${r.source}:${r.source_id}`));
      const fresh: any[] = [];
      for (const v of (vessels ?? []) as any[]) {
        if (v.archive || have.has(`vessel:${v.id}`)) continue;
        if (!v.email_address && !v.contact_no) continue;
        fresh.push({
          name: (v.contact_person || "").trim() || `${v.vessel_name} (vessel contact)`,
          email: (v.email_address || "").trim() || null,
          phone_e164: toE164(v.contact_no, dial),
          yacht_id: v.id, source: "vessel", source_id: v.id,
        });
      }
      for (const a of (agency ?? []) as any[]) {
        if (have.has(`agency_contact:${a.id}`) || (!a.email && !a.phone)) continue;
        fresh.push({
          name: (a.name || "").trim() || "Agency contact",
          email: (a.email || "").trim() || null,
          phone_e164: toE164(a.phone, dial),
          yacht_id: a.vessel_id ?? null, source: "agency_contact", source_id: a.id,
        });
      }
      if (fresh.length) {
        const { error } = await db().from("wa_contacts").insert(fresh);
        if (error) throw error;
      }
      const noNumber = fresh.filter((f) => !f.phone_e164).length;
      toast.success(fresh.length ? `Imported ${fresh.length} contact${fresh.length === 1 ? "" : "s"}` : "Nothing new to import", {
        description: fresh.length
          ? `${noNumber} without a usable WhatsApp number — they can add one when they opt in. Nobody is opted in by importing.`
          : "Every vessel and agency contact with an email or number is already here.",
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  async function inviteSelected() {
    const ids = [...selected];
    setBusy("invite");
    try {
      const r = await waApi<{ sent: number; skipped: any[]; failed: any[] }>("optin/invite", { contactIds: ids });
      const notes = [
        r.skipped.length ? `${r.skipped.length} skipped (${[...new Set(r.skipped.map((s) => s.reason))].join(", ")})` : null,
        r.failed.length ? `${r.failed.length} failed: ${r.failed[0].reason}` : null,
      ].filter(Boolean).join(" · ");
      (r.failed.length ? toast.error : toast.success)(`Invitation emailed to ${r.sent}`, { description: notes || undefined });
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send invitations");
    } finally {
      setBusy(null);
    }
  }

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allShownSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, vessel, email, number" className="pl-8" />
        </div>
        <div className="flex flex-wrap gap-1">
          {(["all", "opted_in", "invited", "none", "opted_out"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full px-2.5 py-1 text-xs ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
              {{ all: "All", opted_in: "Opted in", invited: "Invited", none: "Not invited", opted_out: "Opted out" }[f]} ({counts[f] ?? 0})
            </button>
          ))}
        </div>
        {canEdit && (
          <div className="ml-auto flex gap-2">
            {selected.size > 0 && (
              <>
                <Button size="sm" onClick={() => void inviteSelected()} disabled={busy === "invite"} className="gap-1.5">
                  {busy === "invite" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Email opt-in invitation ({selected.size})
                </Button>
                <Button size="sm" variant="outline" onClick={() => setBulk("in")} className="gap-1.5" title="Record a consent each person gave by phone, in person or in writing">
                  <ShieldCheck className="h-4 w-4" /> Record consent ({selected.size})
                </Button>
                <Button size="sm" variant="outline" onClick={() => setBulk("out")} className="gap-1.5 text-red-500">
                  <ShieldOff className="h-4 w-4" /> Opt out ({selected.size})
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => setCsvOpen(true)} className="gap-1.5">
              <FileSpreadsheet className="h-4 w-4" /> Import CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => void importContacts()} disabled={busy === "import"} className="gap-1.5">
              {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import from vessels &amp; agency contacts
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing("new")} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add contact
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Empty title="No contacts yet">
          {canEdit ? "Import your vessel and agency contacts, then email them an opt-in invitation." : "Nobody has been added yet."}
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                {canEdit && (
                  <th className="w-8 px-3 py-2">
                    <Checkbox checked={allShownSelected} onCheckedChange={(v) =>
                      setSelected(v ? new Set(filtered.map((r) => r.id)) : new Set())} />
                  </th>
                )}
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Vessel</th>
                <th className="px-3 py-2">WhatsApp</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Consent</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  {canEdit && (
                    <td className="px-3 py-2"><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} /></td>
                  )}
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.yacht?.vessel_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.phone_e164 ? (
                      <span className="inline-flex items-center gap-1 font-mono text-xs">
                        {r.phone_e164}
                        {r.phone_confirmed
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-label="Confirmed by the client" />
                          : <Chip t="grey" title="Imported — the client hasn't confirmed this number">unconfirmed</Chip>}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">none</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.email ?? "—"}</td>
                  <td className="px-3 py-2"><ConsentChip c={r} /></td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Consent history" onClick={() => setHistoryFor(r)}>
                        <History className="h-3.5 w-3.5" />
                      </Button>
                      {canEdit && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 px-2" title="Edit" onClick={() => setEditing(r)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" title="Record a consent given by phone or in person"
                            onClick={() => setConsentFor({ c: r, mode: "in" })}>
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </Button>
                          {r.consent_status !== "opted_out" && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500" title="Record an opt-out"
                              onClick={() => setConsentFor({ c: r, mode: "out" })}>
                              <ShieldOff className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bulk && (
        <BulkConsentDialog mode={bulk} contacts={rows.filter((r) => selected.has(r.id))}
          onClose={() => setBulk(null)} onDone={() => { setSelected(new Set()); void load(); }} />
      )}
      {csvOpen && <CsvImportDialog onClose={() => setCsvOpen(false)} onDone={() => void load()} />}
      {editing && <ContactDialog contact={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={load} />}
      {consentFor && <ConsentDialog contact={consentFor.c} mode={consentFor.mode} onClose={() => setConsentFor(null)} onSaved={load} />}
      {historyFor && <HistoryDialog contact={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

// ─── Add / edit ───────────────────────────────────────────────────────────────

function ContactDialog({ contact, onClose, onSaved }: { contact: WaContact | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(contact?.name ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone_e164 ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [yachtId, setYachtId] = useState(contact?.yacht_id ?? "");
  const [yachts, setYachts] = useState<Array<{ id: string; vessel_name: string | null }>>([]);
  const [saving, setSaving] = useState(false);
  const locked = !!contact?.phone_confirmed;

  useEffect(() => {
    void db().from("yachts").select("id, vessel_name, archive").order("vessel_name")
      .then(({ data }: any) => setYachts(((data ?? []) as any[]).filter((y) => !y.archive || y.id === contact?.yacht_id)));
  }, [contact?.yacht_id]);

  async function save() {
    if (!name.trim()) { toast.error("Give the contact a name"); return; }
    setSaving(true);
    try {
      const { data: codes } = await db().from("country_dial_codes").select("dial_code");
      let phone_e164: string | null = null;
      if (phone.trim()) {
        phone_e164 = toE164(phone, ((codes ?? []) as any[]).map((r) => r.dial_code));
        if (!phone_e164) throw new Error("Enter the number with its country code, e.g. +971 50 123 4567");
      }
      const row: any = { name: name.trim(), email: email.trim() || null, notes: notes.trim() || null, yacht_id: yachtId || null };
      if (!locked) row.phone_e164 = phone_e164;
      const { error } = contact
        ? await db().from("wa_contacts").update(row).eq("id", contact.id)
        : await db().from("wa_contacts").insert({ ...row, source: "manual" });
      if (error) throw error;
      toast.success(contact ? "Contact saved" : "Contact added");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>{contact ? "Edit contact" : "Add contact"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>WhatsApp number</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+971 50 123 4567" disabled={locked} />
            {locked && <p className="text-[11px] text-muted-foreground">Confirmed by the client when they opted in. To change it, send them a new invitation.</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Yacht</Label>
            <select value={yachtId} onChange={(e) => setYachtId(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm">
              <option value="">Not linked to a yacht</option>
              {yachts.map((y) => <option key={y.id} value={y.id}>{y.vessel_name ?? "—"}</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground">Expiry reminders for a yacht go to its linked contacts who opted in to updates.</p>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <p className="text-[11px] text-muted-foreground">Adding a contact doesn't opt them in — that takes their agreement.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Record consent given off-platform ────────────────────────────────────────

function ConsentDialog({ contact, mode, onClose, onSaved }: {
  contact: WaContact; mode: "in" | "out"; onClose: () => void; onSaved: () => void;
}) {
  const [updates, setUpdates] = useState(mode === "in" ? true : false);
  const [marketing, setMarketing] = useState(false);
  const [scope, setScope] = useState<"all" | "marketing">("all");
  const [phone, setPhone] = useState(contact.phone_e164 ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      let p: string | null = null;
      if (mode === "in") {
        if (!updates && !marketing) throw new Error("Tick at least one kind of message they agreed to.");
        if (!note.trim()) throw new Error("Say how they agreed — e.g. 'by phone with Captain Mike, 5 Oct'.");
        const { data: codes } = await db().from("country_dial_codes").select("dial_code");
        p = toE164(phone, ((codes ?? []) as any[]).map((r) => r.dial_code));
        if (!p) throw new Error("Enter the WhatsApp number they gave you, with its country code.");
      }
      const { error } = await db().rpc("wa_record_consent", mode === "in"
        ? { p_contact_id: contact.id, p_action: "opted_in", p_updates: updates, p_marketing: marketing,
            p_channel: "staff", p_note: note.trim(), p_phone: p }
        : { p_contact_id: contact.id, p_action: "opted_out",
            p_updates: scope === "marketing" ? contact.consent_updates : false, p_marketing: false,
            p_channel: "staff", p_note: note.trim() || "Asked staff to stop WhatsApp messages" });
      if (error) throw error;
      toast.success(mode === "in" ? "Consent recorded" : "Opt-out recorded");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record it");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "in" ? `Record consent — ${contact.name}` : `Record opt-out — ${contact.name}`}</DialogTitle>
          <DialogDescription>
            {mode === "in"
              ? "Only for a client who has agreed to WhatsApp messages from JLS Yachts by phone or in person. The emailed invitation is the stronger proof where you can use it."
              : "For a client who has asked, by any means, to stop receiving WhatsApp messages. It takes effect immediately."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {mode === "in" ? (
            <>
              <label className="flex items-start gap-2"><Checkbox checked={updates} onCheckedChange={(v) => setUpdates(!!v)} /><span>{OPTIN_CATEGORY_TEXT.updates}</span></label>
              <label className="flex items-start gap-2"><Checkbox checked={marketing} onCheckedChange={(v) => setMarketing(!!v)} /><span>{OPTIN_CATEGORY_TEXT.marketing}</span></label>
              <div className="space-y-1.5"><Label>WhatsApp number they gave</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+971 50 123 4567" /></div>
              <div className="space-y-1.5">
                <Label>How did they agree? <span className="text-red-500">*</span></Label>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="By phone with Captain Mike, 5 Oct — agreed to vessel updates only" />
              </div>
            </>
          ) : (
            <>
              <label className="flex items-center gap-2"><input type="radio" checked={scope === "all"} onChange={() => setScope("all")} /> Stop all WhatsApp messages</label>
              <label className="flex items-center gap-2"><input type="radio" checked={scope === "marketing"} onChange={() => setScope("marketing")} /> Stop news &amp; offers only (keep vessel updates)</label>
              <div className="space-y-1.5"><Label>Note (optional)</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Asked by email on 5 Oct" /></div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving} variant={mode === "out" ? "destructive" : "default"}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{mode === "in" ? "Record consent" : "Record opt-out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── The audit trail ──────────────────────────────────────────────────────────

const CHANNEL: Record<string, string> = {
  email_link: "Opt-in email link", staff: "Recorded by staff", whatsapp_reply: "WhatsApp reply",
  whatsapp_button: "WhatsApp button", meta_preferences: "WhatsApp settings", system: "Polaris",
};

function HistoryDialog({ contact, onClose }: { contact: WaContact; onClose: () => void }) {
  const [events, setEvents] = useState<any[] | null>(null);
  useEffect(() => {
    void db().from("wa_consent_events").select("*").eq("contact_id", contact.id).order("created_at", { ascending: false })
      .then(({ data }: any) => setEvents(data ?? []));
  }, [contact.id]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consent history — {contact.name}</DialogTitle>
          <DialogDescription>Every change, as it happened. This record can't be edited or deleted.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {events === null ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            : events.length === 0 ? <p className="text-sm text-muted-foreground">No consent recorded yet.</p>
            : events.map((e) => (
              <div key={e.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="capitalize">{String(e.action).replace("_", " ")}</strong>
                  <span className="text-xs text-muted-foreground">{fmtDate(e.created_at)} · {CHANNEL[e.channel] ?? e.channel}</span>
                </div>
                {e.action !== "invited" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Updates: {e.consent_updates ? "yes" : "no"} · News &amp; offers: {e.consent_marketing ? "yes" : "no"}
                    {e.phone_e164 ? ` · ${e.phone_e164}` : ""}
                  </p>
                )}
                {e.note && <p className="mt-1 text-xs">{e.note}</p>}
                {e.wording && (
                  <details className="mt-1 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">What they agreed to (wording {e.wording_version})</summary>
                    <pre className="mt-1 whitespace-pre-wrap font-sans">{e.wording}</pre>
                  </details>
                )}
                {(e.actor_email || e.ip) && (
                  <p className="mt-1 text-[11px] text-muted-foreground/80">
                    {e.actor_email ? `By ${e.actor_email}` : ""}{e.ip ? ` · from ${e.ip}` : ""}
                  </p>
                )}
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
