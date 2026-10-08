/**
 * Templates — the messages Meta must approve before JLS can start a
 * conversation. Drafted here, submitted to Meta, and their verdict comes back
 * by webhook (or the Sync button).
 *
 * A template can open with an image, video or PDF, and carry up to 10 buttons:
 * quick replies, website links (optionally ending in a per-send value) and a
 * call button. Marketing templates always get a "Stop promotions" quick reply,
 * so every promotional message carries a one-tap opt-out.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Loader2, Send, RefreshCw, Pencil, Trash2, Info, Image as ImageIcon, Video, FileText, Type, X,
  Reply, ExternalLink, Phone, AlertTriangle, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  placeholderCount, toTemplateName, fillTemplate, normalizeButtons, buttonsError, hasOptOut, HEADER_MEDIA,
  MARKETING_OPT_OUT_BUTTON, type WaButton, type HeaderFormat,
} from "@/lib/whatsapp/shared";
import { db, waApi, uploadWaMedia, waMediaUrl, TemplateStatusChip, fmtDate, Empty, Chip, type WaTemplate } from "./wa-common";

const OPT_OUT_FOOTER = "Reply STOP to opt out";

/** What's stopping a template being sent, if anything. */
export function templateBlocker(t: WaTemplate): string | null {
  if (t.header_format !== "TEXT" && !t.header_media_path) return `Add the header ${t.header_format.toLowerCase()} before sending`;
  if (t.category === "MARKETING" && !hasOptOut(t)) return "No opt-out button — edit and resubmit before sending";
  return null;
}

export function WaTemplates({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<WaTemplate[] | null>(null);
  const [editing, setEditing] = useState<WaTemplate | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data, error } = await db().from("wa_templates").select("*").order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as WaTemplate[]);
  }
  useEffect(() => { void load(); }, []);

  async function submit(t: WaTemplate) {
    setBusy(t.id);
    try {
      const r = await waApi<{ status: string }>("templates/submit", { templateId: t.id });
      toast.success("Submitted to Meta", { description: `Status: ${r.status.toLowerCase()}. Review usually takes minutes, sometimes up to a day.` });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setBusy("sync");
    try {
      const r = await waApi<{ onMeta: number; updated: number; imported: number; skipped: Array<{ name: string; reason: string }>; unsent?: string[] }>("templates/sync", {});
      const unsent = r.unsent ?? [];
      const parts = [`${r.imported} imported`, `${r.updated} updated`, ...r.skipped.map((s) => `${s.name}: ${s.reason}`),
        ...unsent.map((n) => `${n}: has changes not yet sent to Meta — click Submit to Meta on it`)];
      (r.skipped.length || unsent.length ? toast.warning : toast.success)(
        `Found ${r.onMeta} template${r.onMeta === 1 ? "" : "s"} on this WhatsApp account`,
        { description: parts.join(" · "), duration: r.skipped.length || unsent.length ? 15000 : 5000 });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(t: WaTemplate) {
    if (!confirm(`Delete the draft "${t.name}"?`)) return;
    const { error } = await db().from("wa_templates").delete().eq("id", t.id);
    if (error) toast.error(error.message); else void load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-xs text-muted-foreground">
          Templates start conversations. Replies inside the 24-hour window don't need one.
        </p>
        {canEdit && (
          <>
            <Button size="sm" variant="outline" onClick={() => void sync()} disabled={busy === "sync"} className="gap-1.5">
              <RefreshCw className={cn("h-4 w-4", busy === "sync" && "animate-spin")} /> Sync with Meta
            </Button>
            <Button size="sm" onClick={() => setEditing("new")} className="gap-1.5"><Plus className="h-4 w-4" /> New template</Button>
          </>
        )}
      </div>

      {rows === null ? <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        : rows.length === 0 ? <Empty title="No templates yet">Write one, submit it to Meta, and once approved it can be sent.</Empty>
        : (
          <div className="grid gap-3 lg:grid-cols-2">
            {rows.map((t) => {
              const blocker = templateBlocker(t);
              return (
                <div key={t.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm font-medium">{t.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t.category === "MARKETING" ? "News & offers (marketing)" : "Updates (utility)"} · {t.language} · edited {fmtDate(t.updated_at)}
                      </p>
                    </div>
                    <TemplateStatusChip s={t.status} />
                  </div>
                  <WaTemplatePreview t={t} values={t.sample_values ?? []} />
                  {t.status === "rejected" && t.rejection_reason && (
                    <p className="mt-2 text-xs text-red-500">Meta's reason: {t.rejection_reason.replace(/_/g, " ").toLowerCase()}</p>
                  )}
                  {blocker && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3.5 w-3.5" />{blocker}</p>
                  )}
                  {canEdit && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {["draft", "rejected"].includes(t.status) && (
                        <Button size="sm" onClick={() => void submit(t)} disabled={busy === t.id} className="gap-1.5">
                          {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit to Meta
                        </Button>
                      )}
                      {t.status !== "pending" && (
                        <Button size="sm" variant="outline" onClick={() => setEditing(t)} className="gap-1.5"><Pencil className="h-4 w-4" /> Edit</Button>
                      )}
                      {t.header_format !== "TEXT" && <HeaderFileButton t={t} onSaved={load} />}
                      {t.status === "draft" && !t.meta_template_id && (
                        <Button size="sm" variant="ghost" onClick={() => void remove(t)} className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      {editing && <TemplateDialog t={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

/**
 * The file sent in the header. Changing it doesn't need Meta's review — only the
 * template's wording and layout are approved — so an approved template stays approved.
 */
function HeaderFileButton({ t, onSaved }: { t: WaTemplate; onSaved: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const spec = HEADER_MEDIA[t.header_format as Exclude<HeaderFormat, "TEXT">];
  async function pick(f: File | undefined) {
    if (!f) return;
    if (!spec.accept.split(",").includes(f.type)) { toast.error(`That file type isn't allowed — ${spec.label}`); return; }
    if (f.size > spec.maxMb * 1024 * 1024) { toast.error(`Too big — ${spec.label}`); return; }
    setBusy(true);
    try {
      const path = await uploadWaMedia(f, "templates");
      const { error } = await db().from("wa_templates").update({
        header_media_path: path, header_media_mime: f.type, header_media_name: f.name,
        header_media_id: null, header_media_uploaded_at: null,
      }).eq("id", t.id);
      if (error) throw new Error(error.message);
      toast.success(`Header ${t.header_format.toLowerCase()} set`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <input ref={ref} type="file" accept={spec.accept} className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <Button size="sm" variant={t.header_media_path ? "ghost" : "default"} className="gap-1.5" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {t.header_media_path ? `Change ${t.header_format.toLowerCase()}` : `Add ${t.header_format.toLowerCase()}`}
      </Button>
    </>
  );
}

// ─── Preview: a WhatsApp-style bubble ─────────────────────────────────────────

export function WaTemplatePreview({ t, values, mediaPath, mediaUrl: givenUrl }: {
  t: Pick<WaTemplate, "header_text" | "body_text" | "footer_text" | "category" | "header_format" | "header_media_path" | "header_media_name" | "buttons">;
  values: string[];
  /** Show this file instead of the template's own (a send's override). */
  mediaPath?: string | null;
  /** Already-resolved link (e.g. a file not yet uploaded). */
  mediaUrl?: string | null;
}) {
  const path = mediaPath ?? t.header_media_path;
  const [url, setUrl] = useState<string | null>(givenUrl ?? null);
  useEffect(() => {
    if (givenUrl) { setUrl(givenUrl); return; }
    setUrl(null);
    if (path && t.header_format !== "TEXT") void waMediaUrl(path).then(setUrl);
  }, [path, givenUrl, t.header_format]);

  const buttons = normalizeButtons(Array.isArray(t.buttons) ? t.buttons : [], t.category);

  return (
    <div className="mt-3 rounded-lg bg-emerald-950/5 p-3 dark:bg-emerald-50/5">
      <div className="max-w-sm overflow-hidden rounded-xl rounded-tl-sm border border-border bg-card text-sm shadow-sm">
        {t.header_format === "IMAGE" && (
          url ? <img src={url} alt="" className="max-h-56 w-full object-cover" />
            : <div className="grid h-32 place-items-center bg-muted text-xs text-muted-foreground"><ImageIcon className="h-6 w-6" /></div>
        )}
        {t.header_format === "VIDEO" && (
          url ? <video src={url} className="max-h-56 w-full bg-black" controls muted />
            : <div className="grid h-32 place-items-center bg-muted text-xs text-muted-foreground"><Video className="h-6 w-6" /></div>
        )}
        {t.header_format === "DOCUMENT" && (
          <div className="flex items-center gap-2 bg-muted px-3 py-3 text-xs">
            <FileText className="h-5 w-5 text-red-500" />
            <span className="truncate">{t.header_media_name ?? (path ? path.split("/").pop() : "document.pdf")}</span>
          </div>
        )}
        <div className="px-3 py-2">
          {t.header_format === "TEXT" && t.header_text && <p className="font-semibold">{t.header_text}</p>}
          <p className="whitespace-pre-wrap">{fillTemplate(t.body_text || "…", values)}</p>
          {t.footer_text && <p className="mt-1 text-xs text-muted-foreground">{t.footer_text}</p>}
        </div>
      </div>
      {buttons.map((b, i) => (
        <div key={i} className="mt-1 flex max-w-sm items-center justify-center gap-1.5 rounded-lg border border-border bg-card py-1.5 text-xs text-sky-600">
          {b.type === "URL" ? <ExternalLink className="h-3.5 w-3.5" /> : b.type === "PHONE_NUMBER" ? <Phone className="h-3.5 w-3.5" /> : <Reply className="h-3.5 w-3.5" />}
          {b.text || "…"}
        </div>
      ))}
    </div>
  );
}

// ─── Create / edit ────────────────────────────────────────────────────────────

const HEADER_CHOICES: Array<{ f: HeaderFormat | "NONE"; label: string; icon: typeof Type }> = [
  { f: "NONE", label: "None", icon: X },
  { f: "TEXT", label: "Text", icon: Type },
  { f: "IMAGE", label: "Image", icon: ImageIcon },
  { f: "VIDEO", label: "Video", icon: Video },
  { f: "DOCUMENT", label: "PDF", icon: FileText },
];

function TemplateDialog({ t, onClose, onSaved }: { t: WaTemplate | null; onClose: () => void; onSaved: () => void }) {
  const onMeta = !!t?.meta_template_id;
  const [name, setName] = useState(t?.name ?? "");
  const [category, setCategory] = useState<WaTemplate["category"]>(t?.category ?? "UTILITY");
  const [language, setLanguage] = useState(t?.language ?? "en");
  const [headerKind, setHeaderKind] = useState<HeaderFormat | "NONE">(
    t ? (t.header_format === "TEXT" && !t.header_text ? "NONE" : t.header_format) : "NONE");
  const [header, setHeader] = useState(t?.header_text ?? "");
  const [media, setMedia] = useState<{ path: string; mime: string; name: string } | null>(
    t?.header_media_path ? { path: t.header_media_path, mime: t.header_media_mime ?? "", name: t.header_media_name ?? "" } : null);
  const [uploading, setUploading] = useState(false);
  const [body, setBody] = useState(t?.body_text ?? "");
  const [footer, setFooter] = useState(t?.footer_text ?? OPT_OUT_FOOTER);
  const [samples, setSamples] = useState<string[]>(t?.sample_values ?? []);
  // The opt-out quick reply is added automatically for marketing; don't edit it here.
  const [buttons, setButtons] = useState<WaButton[]>(
    (t?.buttons ?? []).filter((b) => !(b.type === "QUICK_REPLY" && b.text === MARKETING_OPT_OUT_BUTTON)));
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const needed = placeholderCount(body);
  const format: HeaderFormat = headerKind === "NONE" ? "TEXT" : headerKind;
  const mediaSpec = format !== "TEXT" ? HEADER_MEDIA[format] : null;

  async function pickFile(f: File | undefined) {
    if (!f || !mediaSpec) return;
    if (!mediaSpec.accept.split(",").includes(f.type)) { toast.error(`That file type isn't allowed — ${mediaSpec.label}`); return; }
    if (f.size > mediaSpec.maxMb * 1024 * 1024) { toast.error(`Too big — ${mediaSpec.label}`); return; }
    setUploading(true);
    try {
      setMedia({ path: await uploadWaMedia(f, "templates"), mime: f.type, name: f.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const setButton = (i: number, patch: Partial<WaButton>) =>
    setButtons((bs) => bs.map((b, j) => (j === i ? ({ ...b, ...patch } as WaButton) : b)));

  async function save() {
    const clean = toTemplateName(name);
    if (!clean) { toast.error("Give it a name (lowercase letters, numbers and underscores)"); return; }
    if (!body.trim()) { toast.error("Write the message"); return; }
    if (body.length > 1024) { toast.error("The message is limited to 1,024 characters"); return; }
    if (headerKind === "TEXT" && header.length > 60) { toast.error("The header is limited to 60 characters"); return; }
    if (format !== "TEXT" && !media) { toast.error(`Add the header ${format.toLowerCase()}`); return; }
    if (footer.length > 60) { toast.error("The footer is limited to 60 characters"); return; }
    if (/^\s*\{\{|\}\}\s*$/.test(body)) { toast.error("Meta rejects a message that starts or ends with a placeholder — add a word before/after it"); return; }
    const final = normalizeButtons(buttons, category);
    const bErr = buttonsError(final);
    if (bErr) { toast.error(bErr); return; }
    setSaving(true);
    const row = {
      name: clean, category, language: language.trim() || "en",
      header_format: format,
      header_text: headerKind === "TEXT" ? header.trim() || null : null,
      header_media_path: format !== "TEXT" ? media?.path ?? null : null,
      header_media_mime: format !== "TEXT" ? media?.mime ?? null : null,
      header_media_name: format !== "TEXT" ? media?.name ?? null : null,
      // A new file means a new upload to Meta when it's next sent.
      ...(media?.path !== t?.header_media_path ? { header_media_id: null, header_media_uploaded_at: null } : {}),
      body_text: body.trim(), footer_text: footer.trim() || null,
      sample_values: samples.slice(0, needed),
      buttons: final,
      // Any edit goes back through Meta's review before it can be sent again.
      status: "draft",
    };
    const { error } = t ? await db().from("wa_templates").update(row).eq("id", t.id) : await db().from("wa_templates").insert(row);
    setSaving(false);
    if (error) { toast.error(error.code === "23505" ? "A template with that name and language already exists" : error.message); return; }
    toast.success(onMeta ? "Saved — submit it to send the change to Meta for review" : "Template saved as a draft");
    onSaved();
    onClose();
  }

  const previewT = {
    header_format: format, header_text: headerKind === "TEXT" ? header : null, header_media_path: media?.path ?? null,
    header_media_name: media?.name ?? null, body_text: body, footer_text: footer, category, buttons,
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>
            {onMeta
              ? "Meta already has this template. Saving makes it a draft here; submit it to send the change for review (Meta limits how often an approved template can be edited)."
              : "Saved as a draft. Nothing reaches Meta until you press Submit."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={name} disabled={onMeta} onChange={(e) => setName(e.target.value)} onBlur={() => setName(toTemplateName(name))} placeholder="berth_confirmation" />
              </div>
              <div className="space-y-1.5"><Label>Language</Label><Input value={language} disabled={onMeta} onChange={(e) => setLanguage(e.target.value)} /></div>
            </div>

            <div className="space-y-1.5">
              <Label>Kind of message</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["UTILITY", "MARKETING"] as const).map((c) => (
                  <button key={c} type="button" disabled={onMeta} onClick={() => setCategory(c)}
                    className={cn("rounded-lg border px-3 py-2 text-left text-xs disabled:opacity-60",
                      category === c ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}>
                    <span className="block font-medium">{c === "UTILITY" ? "Updates" : "News & offers"}</span>
                    <span className="text-muted-foreground">{c === "UTILITY" ? "About their vessel, crew, visas or a booking" : "Promotions, newsletters, announcements"}</span>
                  </button>
                ))}
              </div>
              <p className="flex gap-1 text-[11px] text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                Meta re-categorises anything promotional as marketing. Only clients who agreed to that kind of message receive it.
              </p>
            </div>

            {/* Header */}
            <div className="space-y-1.5">
              <Label>Header</Label>
              <div className="flex flex-wrap gap-1">
                {HEADER_CHOICES.map(({ f, label, icon: Icon }) => (
                  <button key={f} type="button" onClick={() => { setHeaderKind(f); if (f !== format) setMedia(null); }}
                    className={cn("inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs",
                      headerKind === f ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}>
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </div>
              {headerKind === "TEXT" && <Input value={header} maxLength={60} onChange={(e) => setHeader(e.target.value)} placeholder="Season opener 2026" />}
              {mediaSpec && (
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" accept={mediaSpec.accept} className="hidden" onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} />
                  <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {media ? "Replace file" : "Choose file"}
                  </Button>
                  <span className="truncate text-[11px] text-muted-foreground">{media?.name || mediaSpec.label}</span>
                </div>
              )}
              {mediaSpec && (
                <p className="text-[11px] text-muted-foreground">Meta's reviewers see this file, and it's sent with every message unless a send uses its own.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea rows={6} value={body} maxLength={1024} onChange={(e) => setBody(e.target.value)}
                placeholder={"Hello {{1}}, your berth at {{2}} is confirmed for {{3}}. Reply here with any questions."} />
              <p className="text-[11px] text-muted-foreground">Use {"{{1}}"}, {"{{2}}"}… for parts that change each send. {body.length}/1024</p>
            </div>

            {needed > 0 && (
              <div className="space-y-1.5">
                <Label>Examples for Meta's reviewers</Label>
                {Array.from({ length: needed }, (_, i) => (
                  <Input key={i} value={samples[i] ?? ""} placeholder={`Example for {{${i + 1}}}`}
                    onChange={(e) => setSamples((s) => { const n = [...s]; n[i] = e.target.value; return n; })} />
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Footer (optional)</Label>
              <Input value={footer} maxLength={60} onChange={(e) => setFooter(e.target.value)} />
            </div>

            {/* Buttons */}
            <div className="space-y-2">
              <Label>Buttons (optional)</Label>
              {buttons.map((b, i) => (
                <div key={i} className="space-y-1.5 rounded-lg border border-border p-2">
                  <div className="flex items-center gap-2">
                    <Chip t="blue">{b.type === "URL" ? "Website" : b.type === "PHONE_NUMBER" ? "Call" : "Quick reply"}</Chip>
                    <Input value={b.text} maxLength={25} placeholder="Button label" className="h-8"
                      onChange={(e) => setButton(i, { text: e.target.value })} />
                    <button type="button" onClick={() => setButtons((bs) => bs.filter((_, j) => j !== i))} className="rounded p-1 text-muted-foreground hover:bg-muted">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {b.type === "URL" && (
                    <>
                      <Input value={b.url} className="h-8" placeholder="https://jlsyachts.com/offers"
                        onChange={(e) => setButton(i, { url: e.target.value })} />
                      {/\{\{\s*1\s*\}\}$/.test(b.url) ? (
                        <Input value={b.example ?? ""} className="h-8" placeholder="Example for {{1}}, e.g. summer-2026"
                          onChange={(e) => setButton(i, { example: e.target.value })} />
                      ) : (
                        <p className="text-[10px] text-muted-foreground">End the link with {"{{1}}"} to fill in part of it on each send.</p>
                      )}
                    </>
                  )}
                  {b.type === "PHONE_NUMBER" && (
                    <Input value={b.phone_number} className="h-8" placeholder="+97143313555"
                      onChange={(e) => setButton(i, { phone_number: e.target.value })} />
                  )}
                </div>
              ))}
              {category === "MARKETING" && (
                <p className="text-[11px] text-muted-foreground">A "{MARKETING_OPT_OUT_BUTTON}" quick reply is added automatically — tapping it opts them out of news &amp; offers straight away.</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs"
                  onClick={() => setButtons((bs) => [...bs, { type: "QUICK_REPLY", text: "" }])}>
                  <Reply className="h-3.5 w-3.5" /> Quick reply
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs"
                  disabled={buttons.filter((b) => b.type === "URL").length >= 2}
                  onClick={() => setButtons((bs) => [...bs, { type: "URL", text: "", url: "https://" }])}>
                  <ExternalLink className="h-3.5 w-3.5" /> Website
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs"
                  disabled={buttons.some((b) => b.type === "PHONE_NUMBER")}
                  onClick={() => setButtons((bs) => [...bs, { type: "PHONE_NUMBER", text: "Call us", phone_number: "+97143313555" }])}>
                  <Phone className="h-3.5 w-3.5" /> Call
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2 md:sticky md:top-0 md:self-start">
            <Label>Preview</Label>
            <WaTemplatePreview t={previewT} values={samples} />
            <p className="text-[11px] text-muted-foreground">Quick replies show first, then website and call buttons — that's how WhatsApp groups them.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || uploading}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
