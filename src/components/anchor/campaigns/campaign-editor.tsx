/**
 * Create / edit a Signature Campaign (drafts only): document, recipients,
 * personalised message with a live preview, delivery options — then send.
 * Sending runs one recipient per request so each gets their own email + link.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, FileText, Users, Mail, Settings2, Plus, Trash2, Send, Save, Loader2, FlaskConical, AlertTriangle, Paperclip, PenLine } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getFormDef } from "@/lib/anchor-forms/definitions";
import { CAMPAIGN_FORMS, MERGE_TAGS, defaultCampaignCopy, renderCampaignEmail } from "@/lib/esign/campaign-email";
import { campaignApi, parseEmails } from "@/lib/esign/campaign-client";
import { RecipientPicker, recipientKey, type RecipientDraft } from "./recipient-picker";

const db = () => supabase as any;

type DocOption = { kind: "template" | "form"; key: string; title: string; description: string | null; perVessel: boolean };

type Draft = {
  id: string | null;
  name: string;
  doc: DocOption | null;
  subject: string;
  heading: string;
  note: string;
  sign_off: string;
  include_pdf: boolean;
  allow_esign: boolean;
  expires_days: number;
};

const EMPTY: Draft = {
  id: null, name: "", doc: null, subject: "", heading: "", note: "", sign_off: "",
  include_pdf: true, allow_esign: true, expires_days: 30,
};

function Section({ icon: Icon, title, children, hint }: { icon: any; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border/70 bg-card/40 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary/80" /> {title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function CampaignEditor({ campaignId, onClose, onSent }: {
  campaignId: string | null;
  onClose: () => void;
  onSent: (id: string) => void;
}) {
  const { user } = useAuth();
  const [d, setD] = useState<Draft>(EMPTY);
  const [recipients, setRecipients] = useState<RecipientDraft[]>([]);
  const [docs, setDocs] = useState<DocOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [testing, setTesting] = useState(false);
  const [mailStatus, setMailStatus] = useState<{ emailEnabled: boolean; clientEmailEnabled: boolean } | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [senderName, setSenderName] = useState("");

  useEffect(() => { void init(); }, [campaignId]);

  async function init() {
    setLoading(true);
    try {
      const [{ data: tpls }, profile] = await Promise.all([
        db().from("esign_templates").select("id, name, description, category").order("name"),
        user?.id ? db().from("user_profiles").select("display_name").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      setSenderName((profile as any)?.data?.display_name || user?.email || "JLS Yachts");
      const opts: DocOption[] = [
        ...CAMPAIGN_FORMS.map((k) => {
          const def = getFormDef(k)!;
          return { kind: "form" as const, key: k, title: def.title, description: "Personalised per vessel — vessel name & IMO filled in for each recipient.", perVessel: true };
        }),
        ...((tpls ?? []) as any[]).map((t) => ({ kind: "template" as const, key: t.id, title: t.name, description: t.description, perVessel: false })),
      ];
      setDocs(opts);

      if (campaignId) {
        const [{ data: c }, { data: rs }] = await Promise.all([
          db().from("esign_campaigns").select("*").eq("id", campaignId).maybeSingle(),
          db().from("esign_campaign_recipients").select("*, yachts:yacht_id(vessel_name)").eq("campaign_id", campaignId).order("created_at"),
        ]);
        if (c) {
          const doc = opts.find((o) => (c.source_kind === "form" ? o.kind === "form" && o.key === c.form_key : o.kind === "template" && o.key === c.template_id)) ?? null;
          setD({
            id: c.id, name: c.name, doc, subject: c.subject, heading: c.heading ?? "", note: c.note ?? "", sign_off: c.sign_off ?? "",
            include_pdf: c.include_pdf, allow_esign: c.allow_esign, expires_days: c.expires_days,
          });
          setRecipients(((rs ?? []) as any[]).map((r) => ({
            key: r.id, yacht_id: r.yacht_id, vessel: r.yachts?.vessel_name ?? null, name: r.name, email: r.email, role: r.role,
          })));
        }
      } else {
        setD(EMPTY); setRecipients([]);
      }
    } finally { setLoading(false); }
    campaignApi("status").then(setMailStatus).catch(() => {});
  }

  function chooseDoc(o: DocOption) {
    setD((cur) => {
      const copy = defaultCampaignCopy(o);
      // Only fill copy that hasn't been written yet — never overwrite staff edits.
      const untouched = !cur.note.trim() || (cur.doc && cur.note === defaultCampaignCopy(cur.doc).note);
      return {
        ...cur, doc: o,
        name: cur.name.trim() ? cur.name : `${o.title} — ${new Date().toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`,
        ...(untouched ? { subject: copy.subject, heading: copy.heading, note: copy.note, sign_off: cur.sign_off || copy.signOff } : {}),
      };
    });
  }

  // Row keys stay stable while a name/email is edited; duplicates are judged on email + vessel.
  const existingKeys = useMemo(() => new Set(recipients.map((r) => recipientKey(r.email, r.yacht_id))), [recipients]);
  const perVesselMissing = d.doc?.perVessel ? recipients.filter((r) => !r.yacht_id).length : 0;
  const invalid = recipients.filter((r) => !parseEmails(r.email).length).length;

  const sample = recipients[Math.min(previewIdx, Math.max(0, recipients.length - 1))] ?? { name: "Captain John Smith", vessel: "M/Y Example" };
  const preview = useMemo(() => renderCampaignEmail({
    subject: d.subject, heading: d.heading, note: d.note, signOff: d.sign_off,
    docTitle: d.doc?.title ?? "Document", includePdf: d.include_pdf, allowEsign: d.allow_esign, expiresDays: d.expires_days,
  }, { name: sample.name, vessel: (sample as any).vessel }, { link: "https://polaris.jlsyachts.com/sign/…", sender: senderName }),
  [d, sample, senderName]);

  function updateRecipient(key: string, patch: Partial<RecipientDraft>) {
    setRecipients((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function validate(): string | null {
    if (!d.doc) return "Choose the document to send";
    if (!d.name.trim()) return "Give the campaign a name";
    if (!d.subject.trim()) return "Add an email subject";
    if (!d.include_pdf && !d.allow_esign) return "Switch on e-signature, the PDF attachment, or both";
    return null;
  }

  /** Save the draft + its recipient list. Returns the campaign id. */
  async function save(quiet = false): Promise<string | null> {
    const err = validate();
    if (err) { toast.error(err); return null; }
    const dupe = new Set<string>(); for (const r of recipients) { const k = recipientKey(r.email, r.yacht_id); if (dupe.has(k)) { toast.error(`${r.email} is listed twice for the same vessel`); return null; } dupe.add(k); }
    setSaving(true);
    try {
      const row = {
        name: d.name.trim(), source_kind: d.doc!.kind,
        template_id: d.doc!.kind === "template" ? d.doc!.key : null,
        form_key: d.doc!.kind === "form" ? d.doc!.key : null,
        doc_title: d.doc!.title, subject: d.subject.trim(), heading: d.heading.trim() || null,
        note: d.note, sign_off: d.sign_off, include_pdf: d.include_pdf, allow_esign: d.allow_esign,
        expires_days: Math.min(365, Math.max(1, Number(d.expires_days) || 30)),
      };
      let id = d.id;
      if (id) {
        const { error } = await db().from("esign_campaigns").update(row).eq("id", id).eq("status", "draft");
        if (error) throw error;
      } else {
        const { data, error } = await db().from("esign_campaigns")
          .insert({ ...row, created_by: user?.id ?? null, created_by_name: senderName }).select("id").single();
        if (error) throw error;
        id = data.id as string;
        setD((cur) => ({ ...cur, id }));
      }
      // Replace the draft's recipient list.
      const { error: delErr } = await db().from("esign_campaign_recipients").delete().eq("campaign_id", id).eq("status", "pending");
      if (delErr) throw delErr;
      if (recipients.length) {
        const { error: insErr } = await db().from("esign_campaign_recipients").insert(recipients.map((r) => ({
          campaign_id: id, yacht_id: r.yacht_id, name: r.name.trim() || r.email, email: r.email.trim(), role: r.role,
        })));
        if (insErr) throw insErr;
      }
      if (!quiet) toast.success("Draft saved");
      return id;
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save the campaign");
      return null;
    } finally { setSaving(false); }
  }

  async function sendTest() {
    const id = await save(true);
    if (!id) return;
    setTesting(true);
    try {
      const res = await campaignApi("test", { campaignId: id });
      toast.success(`Test email sent to ${res.sentTo}`, { description: res.sample ? `Previewed as ${res.sample}` : undefined });
    } catch (e: any) { toast.error(e?.message ?? "Test failed"); }
    finally { setTesting(false); }
  }

  async function sendAll() {
    setConfirmOpen(false);
    const id = await save(true);
    if (!id) return;
    const { data: rs } = await db().from("esign_campaign_recipients").select("id").eq("campaign_id", id).eq("status", "pending").order("created_at");
    const ids = ((rs ?? []) as any[]).map((r) => r.id as string);
    setSending({ done: 0, total: ids.length, failed: 0 });
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        const res = await campaignApi("send-one", { recipientId: ids[i] });
        if (res.ok === false) failed++;
      } catch { failed++; }
      setSending({ done: i + 1, total: ids.length, failed });
    }
    if (failed) toast.warning(`${ids.length - failed} sent, ${failed} not sent — see the campaign for details`);
    else toast.success(`Sent ${ids.length} personal email${ids.length === 1 ? "" : "s"}`);
    setSending(null);
    onSent(id);
  }

  function insertTag(tag: string) {
    setD((cur) => ({ ...cur, note: `${cur.note}${cur.note && !cur.note.endsWith(" ") && !cur.note.endsWith("\n") ? " " : ""}${tag}` }));
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const busy = saving || !!sending || testing;
  const sendable = recipients.length > 0 && !invalid && !perVesselMissing;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={!!sending} className="h-8 gap-1"><ArrowLeft className="h-4 w-4" /> Campaigns</Button>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">{d.id ? "Draft campaign" : "New campaign"}</div>
            <h1 className="font-display text-[1.15rem] font-semibold tracking-tight">{d.name || "Untitled campaign"}</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={sendTest} disabled={busy}>
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />} Send me a test
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => save()} disabled={busy}>
            {saving && !sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save draft
          </Button>
          <Button size="sm" className="h-9 gap-1.5" disabled={busy || !sendable} onClick={() => { const e = validate(); if (e) toast.error(e); else setConfirmOpen(true); }}>
            <Send className="h-3.5 w-3.5" /> Review &amp; send
          </Button>
        </div>
      </header>

      {mailStatus && (!mailStatus.emailEnabled || !mailStatus.clientEmailEnabled) && (
        <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-6 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{!mailStatus.emailEnabled
            ? "Outbound email is switched off in Polaris, so nothing will be delivered. Campaign emails will be marked “held”."
            : "Client email is switched off in Polaris — only @jlsyachts.com addresses will receive this. Emails to clients will be marked “held” and can be re-sent once client email is switched on."}</span>
        </div>
      )}

      {sending && (
        <div className="border-b border-border/60 bg-primary/5 px-6 py-3">
          <div className="mb-1.5 flex justify-between text-sm"><span>Sending personal emails… keep this tab open</span><span className="tabular-nums">{sending.done}/{sending.total}{sending.failed ? ` · ${sending.failed} not sent` : ""}</span></div>
          <Progress value={sending.total ? (sending.done / sending.total) * 100 : 0} />
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-5 overflow-auto p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Section icon={FileText} title="1 · Document" hint="What each recipient is asked to sign.">
            <div className="grid gap-2">
              {docs.map((o) => {
                const on = d.doc?.kind === o.kind && d.doc.key === o.key;
                return (
                  <button key={`${o.kind}:${o.key}`} onClick={() => chooseDoc(o)}
                    className={cn("rounded-lg border px-3.5 py-2.5 text-left transition", on ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border/60 hover:bg-muted/40")}>
                    <div className="flex items-center gap-2 text-sm font-medium">{o.title}
                      {o.perVessel && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-600">Per vessel</span>}
                    </div>
                    {o.description && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{o.description}</div>}
                  </button>
                );
              })}
              <p className="text-xs text-muted-foreground">Other documents can be added as templates under Anchor → Templates.</p>
            </div>
            <div className="mt-4">
              <label className="text-xs font-medium text-muted-foreground">Campaign name (internal)</label>
              <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Tariff renewal 2026/27" className="mt-1" />
            </div>
          </Section>

          <Section icon={Users} title={`2 · Recipients (${recipients.length})`} hint="One personal email and signing link per row. Edit a name or address inline.">
            <div className="mb-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPickerOpen(true)}><Plus className="h-3.5 w-3.5" /> Add recipients</Button>
              {recipients.length > 0 && <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setRecipients([])}>Clear all</Button>}
            </div>
            {perVesselMissing > 0 && (
              <p className="mb-2 flex items-center gap-1.5 text-xs text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> {perVesselMissing} recipient{perVesselMissing === 1 ? " has" : "s have"} no vessel — this document is filled in per vessel, so each recipient needs one.</p>
            )}
            {recipients.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/70 py-8 text-center text-sm text-muted-foreground">No recipients yet.</p>
            ) : (
              <div className="max-h-[420px] overflow-auto rounded-lg border border-border/60">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 text-left text-xs text-muted-foreground">
                    <tr><th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Email</th><th className="px-3 py-2 font-medium">Vessel</th><th className="w-8" /></tr>
                  </thead>
                  <tbody>
                    {recipients.map((r) => (
                      <tr key={r.key} className="border-t border-border/50">
                        <td className="px-2 py-1"><input value={r.name} onChange={(e) => updateRecipient(r.key, { name: e.target.value })} className="h-8 w-full rounded border border-transparent bg-transparent px-1.5 hover:border-border focus:border-border focus:outline-none" /></td>
                        <td className="px-2 py-1"><input value={r.email} onChange={(e) => updateRecipient(r.key, { email: e.target.value })}
                          className={cn("h-8 w-full rounded border border-transparent bg-transparent px-1.5 hover:border-border focus:border-border focus:outline-none", !parseEmails(r.email).length && "border-red-500/60 text-red-600")} /></td>
                        <td className="px-3 py-1 text-muted-foreground">{r.vessel ?? "—"}</td>
                        <td className="px-1"><button onClick={() => setRecipients((rs) => rs.filter((x) => x.key !== r.key))} className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section icon={Settings2} title="3 · Delivery">
            <div className="space-y-3">
              <label className="flex items-start justify-between gap-4">
                <span><span className="flex items-center gap-1.5 text-sm font-medium"><PenLine className="h-3.5 w-3.5" /> E-signature</span>
                  <span className="text-xs text-muted-foreground">Recipients can sign on screen from the link in their email.</span></span>
                <Switch checked={d.allow_esign} onCheckedChange={(v) => setD({ ...d, allow_esign: v, include_pdf: v ? d.include_pdf : true })} />
              </label>
              <label className="flex items-start justify-between gap-4">
                <span><span className="flex items-center gap-1.5 text-sm font-medium"><Paperclip className="h-3.5 w-3.5" /> Include PDF</span>
                  <span className="text-xs text-muted-foreground">Attach the document as a PDF for anyone who'd rather print, sign &amp; stamp it. They can upload the signed copy from the link or reply by email.</span></span>
                <Switch checked={d.include_pdf} onCheckedChange={(v) => setD({ ...d, include_pdf: v, allow_esign: v ? d.allow_esign : true })} />
              </label>
              <label className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">Link valid for (days)</span>
                <Input type="number" min={1} max={365} value={d.expires_days} onChange={(e) => setD({ ...d, expires_days: Number(e.target.value) })} className="h-8 w-24" />
              </label>
            </div>
          </Section>
        </div>

        <div className="space-y-5">
          <Section icon={Mail} title="4 · Message" hint="Personalise with tags — each recipient's email is filled in individually.">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Subject</label>
                <Input value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Heading</label>
                <Input value={d.heading} onChange={(e) => setD({ ...d, heading: e.target.value })} placeholder="Optional headline at the top of the email" className="mt-1" />
              </div>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Note</label>
                  <div className="flex flex-wrap gap-1">
                    {MERGE_TAGS.map((t) => (
                      <button key={t.tag} onClick={() => insertTag(t.tag)} className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted">+ {t.label}</button>
                    ))}
                  </div>
                </div>
                <Textarea rows={9} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} className="mt-1 font-[inherit] text-sm" />
                <p className="mt-1 text-[11px] text-muted-foreground">Blank line = new paragraph · start a line with “- ” for bullets · **bold** · links are clickable.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Sign-off</label>
                <Textarea rows={3} value={d.sign_off} onChange={(e) => setD({ ...d, sign_off: e.target.value })} className="mt-1 text-sm" />
              </div>
              <p className="text-[11px] text-muted-foreground">Sent from anchor@jlsyachts.com — replies come straight to you.</p>
            </div>
          </Section>

          <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Preview{recipients.length ? ` as ${sample.name}` : " (sample recipient)"}</div>
                <div className="truncate text-sm font-medium">{preview.subject}</div>
              </div>
              {recipients.length > 1 && (
                <select value={previewIdx} onChange={(e) => setPreviewIdx(Number(e.target.value))} className="h-8 max-w-[220px] rounded-md border border-border bg-background px-2 text-xs">
                  {recipients.map((r, i) => <option key={r.key} value={i}>{r.name}{r.vessel ? ` · ${r.vessel}` : ""}</option>)}
                </select>
              )}
            </div>
            <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[640px] w-full border-0 bg-white" />
            {d.include_pdf && <div className="flex items-center gap-1.5 border-t border-border/60 px-4 py-2 text-xs text-muted-foreground"><Paperclip className="h-3.5 w-3.5" /> {d.doc ? `${d.doc.title}${(sample as any).vessel ? ` — ${(sample as any).vessel}` : ""}.pdf` : "Document.pdf"}</div>}
          </section>
        </div>
      </div>

      <RecipientPicker open={pickerOpen} onClose={() => setPickerOpen(false)} existing={existingKeys}
        onAdd={(rs) => setRecipients((cur) => [...cur, ...rs.map((r) => ({ ...r, key: `${r.key}#${crypto.randomUUID()}` }))])} />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to {recipients.length} recipient{recipients.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>This sends <strong>{recipients.length} separate email{recipients.length === 1 ? "" : "s"}</strong> — one per person, each with their own signing link. Nobody is CC'd and nobody sees who else received it.</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  <li>Document: <strong>{d.doc?.title}</strong>{d.doc?.perVessel ? " (filled in per vessel)" : ""}</li>
                  <li>{d.allow_esign ? "E-signature on" : "E-signature off (paper only)"} · {d.include_pdf ? "PDF attached" : "no PDF attachment"}</li>
                  <li>Links valid for {d.expires_days} days</li>
                </ul>
                <p>Once sent, the campaign can't be edited — but you can remind, resend or cancel.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={sendAll}>Yes, send {recipients.length} email{recipients.length === 1 ? "" : "s"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
