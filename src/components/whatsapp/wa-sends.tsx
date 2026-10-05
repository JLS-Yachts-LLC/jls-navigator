/**
 * Sends — a broadcast of one approved template to one list, and its report.
 *
 * Pressing Send queues every list member, skipping (with the reason recorded)
 * anyone without consent for that kind of message, then sends in batches of
 * 100 until done. Delivery and read receipts arrive by webhook.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Send, ChevronLeft, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { placeholderCount, dynamicUrlButtons, HEADER_MEDIA, type HeaderFormat, type WaButton } from "@/lib/whatsapp/shared";
import { db, waApi, uploadWaMedia, MessageStatusChip, Chip, fmtDate, Empty, type WaTemplate, type WaList } from "./wa-common";
import { WaTemplatePreview, templateBlocker } from "./wa-templates";

interface Campaign {
  id: string;
  name: string;
  list_id: string | null;
  template_id: string | null;
  variables: string[];
  button_values: string[];
  header_media_path: string | null;
  status: "draft" | "sending" | "sent" | "failed" | "cancelled";
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  list?: { name: string } | null;
  template?: WaTemplate | null;
}

const CAMPAIGN_TONE = { draft: "grey", sending: "blue", sent: "green", failed: "red", cancelled: "amber" } as const;

export function WaSends({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<Campaign[] | null>(null);
  const [stats, setStats] = useState<Record<string, Record<string, number>>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const [{ data, error }, { data: msgs }] = await Promise.all([
      db().from("wa_campaigns").select("*, list:wa_lists(name), template:wa_templates(*)").order("created_at", { ascending: false }),
      db().from("wa_messages").select("campaign_id, status").not("campaign_id", "is", null),
    ]);
    if (error) toast.error(error.message);
    const s: Record<string, Record<string, number>> = {};
    for (const m of (msgs ?? []) as any[]) {
      const c = (s[m.campaign_id] ??= {});
      c[m.status] = (c[m.status] ?? 0) + 1;
    }
    setStats(s);
    setRows((data ?? []) as Campaign[]);
  }
  useEffect(() => { void load(); }, []);

  const open = rows?.find((r) => r.id === openId) ?? null;
  if (open) return <SendDetail c={open} canEdit={canEdit} onBack={() => { setOpenId(null); void load(); }} onChanged={load} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-xs text-muted-foreground">Each send goes to one list using one approved template.</p>
        {canEdit && <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5"><Plus className="h-4 w-4" /> New send</Button>}
      </div>
      {rows === null ? <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        : rows.length === 0 ? <Empty title="Nothing sent yet">Create a list and get a template approved, then send.</Empty>
        : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-3 py-2">Send</th><th className="px-3 py-2">List</th><th className="px-3 py-2">Template</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Results</th><th className="px-3 py-2">When</th></tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const s = stats[c.id] ?? {};
                  return (
                    <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40">
                      <td className="px-3 py-2 font-medium">{c.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{c.list?.name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{c.template?.name ?? "—"}</td>
                      <td className="px-3 py-2"><Chip t={CAMPAIGN_TONE[c.status]}>{c.status}</Chip></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {c.status === "draft" ? "—" : [
                          `${(s.sent ?? 0) + (s.delivered ?? 0) + (s.read ?? 0)} sent`,
                          s.read ? `${s.read} read` : null, s.failed ? `${s.failed} failed` : null, s.skipped ? `${s.skipped} skipped` : null,
                        ].filter(Boolean).join(" · ")}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(c.started_at ?? c.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      {creating && <NewSendDialog onClose={() => setCreating(false)} onSaved={(id) => { void load(); setOpenId(id); }} />}
    </div>
  );
}

function SendDetail({ c, canEdit, onBack, onChanged }: { c: Campaign; canEdit: boolean; onBack: () => void; onChanged: () => void }) {
  const [msgs, setMsgs] = useState<any[] | null>(null);
  const [preview, setPreview] = useState<{ eligible: number; blocked: Record<string, number> } | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; failed: number; remaining: number } | null>(null);
  const [filter, setFilter] = useState("all");

  async function load() {
    const { data } = await db().from("wa_messages")
      .select("id, status, skip_reason, error_message, phone_e164, sent_at, delivered_at, read_at, contact:wa_contacts(name, yacht:yachts(vessel_name))")
      .eq("campaign_id", c.id).order("queued_at");
    setMsgs(data ?? []);
  }

  // Before sending: who on the list would actually receive it, and why the rest won't.
  async function loadPreview() {
    if (!c.list_id || !c.template) return;
    const { data } = await db().from("wa_list_members")
      .select("contact:wa_contacts(phone_e164, consent_status, consent_updates, consent_marketing)")
      .eq("list_id", c.list_id).is("removed_at", null);
    const blocked: Record<string, number> = {};
    let eligible = 0;
    for (const r of (data ?? []) as any[]) {
      const k = r.contact;
      const why = !k.phone_e164 ? "no WhatsApp number" : k.consent_status === "opted_out" ? "opted out"
        : k.consent_status !== "opted_in" ? "not opted in yet"
        : c.template.category === "MARKETING" && !k.consent_marketing ? "not opted in to news & offers"
        : c.template.category === "UTILITY" && !k.consent_updates ? "not opted in to updates" : null;
      if (why) blocked[why] = (blocked[why] ?? 0) + 1; else eligible++;
    }
    setPreview({ eligible, blocked });
  }

  useEffect(() => {
    if (c.status === "draft") void loadPreview(); else void load();
    if (c.status === "sending" || c.status === "sent") {
      const t = setInterval(() => { if (!document.hidden) void load(); }, 20_000);
      return () => clearInterval(t);
    }
  }, [c.id, c.status]);

  async function sendAll() {
    if (!confirm(`Send "${c.template?.name}" to ${preview?.eligible ?? "the eligible members of"} ${c.list?.name}? This can't be recalled.`)) return;
    setSending(true);
    let total = { sent: 0, failed: 0, remaining: 0 };
    try {
      for (let i = 0; i < 100; i++) {
        const r = await waApi<{ sent: number; failed: number; remaining: number; done: boolean }>("campaigns/send", { campaignId: c.id });
        total = { sent: total.sent + r.sent, failed: total.failed + r.failed, remaining: r.remaining };
        setProgress(total);
        if (r.done || (r.sent === 0 && r.failed === 0)) break;
      }
      toast.success(`Sent ${total.sent}${total.failed ? `, ${total.failed} failed` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send stopped", { description: "Press Send again to carry on — nobody is messaged twice." });
    } finally {
      setSending(false);
      onChanged();
      await load();
    }
  }

  async function remove() {
    if (!confirm("Delete this draft send?")) return;
    const { error } = await db().from("wa_campaigns").delete().eq("id", c.id);
    if (error) toast.error(error.message); else onBack();
  }

  const counts = useMemo(() => {
    const n: Record<string, number> = { all: (msgs ?? []).length };
    for (const m of msgs ?? []) n[m.status] = (n[m.status] ?? 0) + 1;
    return n;
  }, [msgs]);
  const values = (c.variables ?? []).map(String);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /> All sends</button>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{c.name}</h2>
          <p className="text-xs text-muted-foreground">{c.list?.name ?? "No list"} · <span className="font-mono">{c.template?.name}</span> · <Chip t={CAMPAIGN_TONE[c.status]}>{c.status}</Chip></p>
        </div>
        {canEdit && (c.status === "draft" || c.status === "sending") && (
          <div className="flex gap-2">
            <Button onClick={() => void sendAll()} disabled={sending || c.template?.status !== "approved" || (c.status === "draft" && !preview?.eligible)} className="gap-1.5">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {c.status === "sending" ? "Carry on sending" : `Send to ${preview?.eligible ?? "…"}`}
            </Button>
            {c.status === "draft" && <Button variant="ghost" onClick={() => void remove()} className="text-red-500"><Trash2 className="h-4 w-4" /></Button>}
          </div>
        )}
      </div>

      {c.template && (
        <div className="max-w-md">
          <WaTemplatePreview t={c.template} values={values.map((v) => v.replace(/\{\{\s*name\s*\}\}/gi, "Captain Smith"))} mediaPath={c.header_media_path} />
        </div>
      )}
      {c.template && c.template.status !== "approved" && (
        <p className="text-xs text-amber-600">The template is {c.template.status} — it can be sent once Meta approves it.</p>
      )}
      {c.template && !c.header_media_path && templateBlocker(c.template) && (
        <p className="text-xs text-amber-600">{templateBlocker(c.template)} (Templates tab).</p>
      )}

      {c.status === "draft" && preview && (
        <div className="rounded-xl border border-border p-4 text-sm">
          <p><strong>{preview.eligible}</strong> member{preview.eligible === 1 ? "" : "s"} will receive this.</p>
          {Object.keys(preview.blocked).length > 0 && (
            <ul className="mt-1 text-xs text-muted-foreground">
              {Object.entries(preview.blocked).map(([why, n]) => <li key={why}>{n} skipped — {why}</li>)}
            </ul>
          )}
        </div>
      )}
      {progress && <p className="text-xs text-muted-foreground">Progress: {progress.sent} sent · {progress.failed} failed · {progress.remaining} to go</p>}

      {c.status !== "draft" && (
        msgs === null ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /> : (
          <>
            <div className="flex flex-wrap gap-1">
              {["all", "read", "delivered", "sent", "queued", "failed", "skipped"].filter((f) => f === "all" || counts[f]).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {f} ({counts[f] ?? 0})
                </button>
              ))}
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-3 py-2">Recipient</th><th className="px-3 py-2">Number</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Detail</th></tr>
                </thead>
                <tbody>
                  {msgs.filter((m) => filter === "all" || m.status === filter).map((m) => (
                    <tr key={m.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2">{m.contact?.name}<span className="ml-1 text-xs text-muted-foreground">{m.contact?.yacht?.vessel_name}</span></td>
                      <td className="px-3 py-2 font-mono text-xs">{m.phone_e164 ?? "—"}</td>
                      <td className="px-3 py-2"><MessageStatusChip s={m.status} /></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {m.skip_reason ?? m.error_message ?? fmtDate(m.read_at ?? m.delivered_at ?? m.sent_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}
    </div>
  );
}

function NewSendDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [lists, setLists] = useState<WaList[]>([]);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [name, setName] = useState("");
  const [listId, setListId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const [buttonValues, setButtonValues] = useState<string[]>([]);
  const [media, setMedia] = useState<{ path: string; mime: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void db().from("wa_lists").select("*").eq("archived", false).order("name").then(({ data }: any) => setLists(data ?? []));
    void db().from("wa_templates").select("*").eq("status", "approved").order("name").then(({ data }: any) => setTemplates(data ?? []));
  }, []);

  const t = templates.find((x) => x.id === templateId);
  const needed = t ? placeholderCount(t.body_text) : 0;
  const linkButtons = t ? dynamicUrlButtons(t.buttons) : [];
  const spec = t && t.header_format !== "TEXT" ? HEADER_MEDIA[t.header_format as Exclude<HeaderFormat, "TEXT">] : null;

  async function pickFile(f: File | undefined) {
    if (!f || !spec) return;
    if (!spec.accept.split(",").includes(f.type)) { toast.error(`That file type isn't allowed — ${spec.label}`); return; }
    if (f.size > spec.maxMb * 1024 * 1024) { toast.error(`Too big — ${spec.label}`); return; }
    setUploading(true);
    try { setMedia({ path: await uploadWaMedia(f, "sends"), mime: f.type, name: f.name }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    finally { setUploading(false); }
  }

  async function save() {
    if (!name.trim() || !listId || !t) { toast.error("Name it, and choose a list and a template"); return; }
    if (values.slice(0, needed).filter((v) => v?.trim()).length < needed) { toast.error("Fill in every value"); return; }
    if (linkButtons.some((i) => !buttonValues[i]?.trim())) { toast.error("Fill in the link for each website button"); return; }
    if (spec && !media && !t.header_media_path) { toast.error(`This template needs a header ${t.header_format.toLowerCase()} — choose one`); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await db().from("wa_campaigns").insert({
      name: name.trim(), list_id: listId, template_id: t.id, variables: values.slice(0, needed), created_by: u.user?.id ?? null,
      button_values: (t.buttons ?? []).map((_, i) => buttonValues[i] ?? ""),
      header_media_path: media?.path ?? null, header_media_mime: media?.mime ?? null,
    }).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onSaved(data.id);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New send</DialogTitle>
          <DialogDescription>Saved as a draft — you'll see who it reaches before anything is sent.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="October marina update" /></div>
          <div className="space-y-1.5">
            <Label>List</Label>
            <select value={listId} onChange={(e) => setListId(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
              <option value="">Choose a list…</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Template</Label>
            <select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setValues([]); setButtonValues([]); setMedia(null); }} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
              <option value="">{templates.length ? "Choose an approved template…" : "No approved templates yet"}</option>
              {templates.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.category === "MARKETING" ? "news & offers" : "updates"})</option>)}
            </select>
          </div>
          {needed > 0 && (
            <div className="space-y-1.5">
              <Label>Values</Label>
              {Array.from({ length: needed }, (_, i) => (
                <Input key={i} value={values[i] ?? ""} placeholder={`{{${i + 1}}} — use {{name}} for each person's name`}
                  onChange={(e) => setValues((v) => { const n = [...v]; n[i] = e.target.value; return n; })} />
              ))}
            </div>
          )}
          {linkButtons.length > 0 && t && (
            <div className="space-y-1.5">
              <Label>Website button links</Label>
              {linkButtons.map((i) => {
                const b = t.buttons[i] as Extract<WaButton, { type: "URL" }>;
                return (
                  <div key={i} className="flex items-center gap-1 text-xs">
                    <span className="shrink-0 text-muted-foreground">{b.url.replace(/\{\{\s*1\s*\}\}$/, "")}</span>
                    <Input value={buttonValues[i] ?? ""} className="h-8" placeholder={b.example || "value"}
                      onChange={(e) => setButtonValues((v) => { const n = [...v]; n[i] = e.target.value; return n; })} />
                  </div>
                );
              })}
            </div>
          )}
          {spec && t && (
            <div className="space-y-1.5">
              <Label>Header {t.header_format.toLowerCase()}</Label>
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept={spec.accept} className="hidden" onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} />
                <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {media ? "Replace" : t.header_media_path ? "Use a different file" : "Choose file"}
                </Button>
                <span className="truncate text-[11px] text-muted-foreground">
                  {media ? media.name : t.header_media_path ? "Using the template's own file" : spec.label}
                </span>
                {media && <button type="button" className="text-[11px] underline" onClick={() => setMedia(null)}>use template's</button>}
              </div>
            </div>
          )}
          {t && <WaTemplatePreview t={t} values={values.map((v) => v.replace(/\{\{\s*name\s*\}\}/gi, "Captain Smith"))} mediaPath={media?.path} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
