/**
 * Templates — the messages Meta must approve before JLS can start a
 * conversation. Drafted here, submitted to Meta, and their verdict comes back
 * by webhook (or the Sync button).
 *
 * Marketing templates get a "Stop promotions" button added on submission, so
 * every promotional message carries a one-tap opt-out.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Send, RefreshCw, Pencil, Trash2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { placeholderCount, toTemplateName, fillTemplate, MARKETING_OPT_OUT_BUTTON } from "@/lib/whatsapp/shared";
import { db, waApi, TemplateStatusChip, fmtDate, Empty, type WaTemplate } from "./wa-common";

const OPT_OUT_FOOTER = "Reply STOP to opt out";

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
      const r = await waApi<{ onMeta: number; updated: number; imported: number; skipped: Array<{ name: string; reason: string }> }>("templates/sync", {});
      const parts = [
        `${r.imported} imported`, `${r.updated} updated`,
        ...r.skipped.map((s) => `${s.name}: ${s.reason}`),
      ];
      (r.skipped.length ? toast.warning : toast.success)(
        `Found ${r.onMeta} template${r.onMeta === 1 ? "" : "s"} on this WhatsApp account`,
        { description: parts.join(" · "), duration: r.skipped.length ? 15000 : 5000 });
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
            {rows.map((t) => (
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
                <Preview t={t} values={t.sample_values ?? []} />
                {t.status === "rejected" && t.rejection_reason && (
                  <p className="mt-2 text-xs text-red-500">Meta's reason: {t.rejection_reason.replace(/_/g, " ").toLowerCase()}</p>
                )}
                {canEdit && ["draft", "rejected"].includes(t.status) && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => void submit(t)} disabled={busy === t.id} className="gap-1.5">
                      {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit to Meta
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(t)} className="gap-1.5"><Pencil className="h-4 w-4" /> Edit</Button>
                    {t.status === "draft" && (
                      <Button size="sm" variant="ghost" onClick={() => void remove(t)} className="text-red-500"><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      {editing && <TemplateDialog t={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

function Preview({ t, values }: { t: Pick<WaTemplate, "header_text" | "body_text" | "footer_text" | "category">; values: string[] }) {
  return (
    <div className="mt-3 rounded-lg bg-emerald-950/5 p-3 dark:bg-emerald-50/5">
      <div className="max-w-sm rounded-xl rounded-tl-sm border border-border bg-card px-3 py-2 text-sm shadow-sm">
        {t.header_text && <p className="font-semibold">{t.header_text}</p>}
        <p className="whitespace-pre-wrap">{fillTemplate(t.body_text || "…", values)}</p>
        {t.footer_text && <p className="mt-1 text-xs text-muted-foreground">{t.footer_text}</p>}
      </div>
      {t.category === "MARKETING" && (
        <div className="mt-1 max-w-sm rounded-lg border border-border bg-card py-1.5 text-center text-xs text-sky-600">{MARKETING_OPT_OUT_BUTTON}</div>
      )}
    </div>
  );
}

function TemplateDialog({ t, onClose, onSaved }: { t: WaTemplate | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(t?.name ?? "");
  const [category, setCategory] = useState<WaTemplate["category"]>(t?.category ?? "UTILITY");
  const [language, setLanguage] = useState(t?.language ?? "en");
  const [header, setHeader] = useState(t?.header_text ?? "");
  const [body, setBody] = useState(t?.body_text ?? "");
  const [footer, setFooter] = useState(t?.footer_text ?? OPT_OUT_FOOTER);
  const [samples, setSamples] = useState<string[]>(t?.sample_values ?? []);
  const [saving, setSaving] = useState(false);
  const needed = placeholderCount(body);

  async function save() {
    const clean = toTemplateName(name);
    if (!clean) { toast.error("Give it a name (lowercase letters, numbers and underscores)"); return; }
    if (!body.trim()) { toast.error("Write the message"); return; }
    if (body.length > 1024) { toast.error("The message is limited to 1,024 characters"); return; }
    if (header.length > 60) { toast.error("The header is limited to 60 characters"); return; }
    if (footer.length > 60) { toast.error("The footer is limited to 60 characters"); return; }
    if (/^\s*\{\{|\}\}\s*$/.test(body)) { toast.error("Meta rejects a message that starts or ends with a placeholder — add a word before/after it"); return; }
    setSaving(true);
    const row = {
      name: clean, category, language: language.trim() || "en",
      header_text: header.trim() || null, body_text: body.trim(), footer_text: footer.trim() || null,
      sample_values: samples.slice(0, needed),
      // An edited rejection goes back to draft so it can be resubmitted.
      status: "draft",
    };
    const { error } = t ? await db().from("wa_templates").update(row).eq("id", t.id) : await db().from("wa_templates").insert(row);
    setSaving(false);
    if (error) { toast.error(error.code === "23505" ? "A template with that name and language already exists" : error.message); return; }
    toast.success("Template saved as a draft");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>Saved as a draft. Nothing reaches Meta until you press Submit.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setName(toTemplateName(name))} placeholder="berth_confirmation" />
            </div>
            <div className="space-y-1.5">
              <Label>Kind of message</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["UTILITY", "MARKETING"] as const).map((c) => (
                  <button key={c} type="button" onClick={() => setCategory(c)}
                    className={cn("rounded-lg border px-3 py-2 text-left text-xs",
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
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <div className="space-y-1.5"><Label>Header (optional)</Label><Input value={header} maxLength={60} onChange={(e) => setHeader(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Language</Label><Input value={language} onChange={(e) => setLanguage(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea rows={6} value={body} maxLength={1024} onChange={(e) => setBody(e.target.value)}
                placeholder={"Hello {{1}}, your berth at {{2}} is confirmed for {{3}}. Reply here with any questions."} />
              <p className="text-[11px] text-muted-foreground">Use {"{{1}}"}, {"{{2}}"}… for parts that change each send. {body.length}/1024</p>
            </div>
            <div className="space-y-1.5">
              <Label>Footer (optional)</Label>
              <Input value={footer} maxLength={60} onChange={(e) => setFooter(e.target.value)} />
            </div>
          </div>
          <div className="space-y-3">
            {needed > 0 && (
              <div className="space-y-1.5">
                <Label>Examples for Meta's reviewers</Label>
                {Array.from({ length: needed }, (_, i) => (
                  <Input key={i} value={samples[i] ?? ""} placeholder={`Example for {{${i + 1}}}`}
                    onChange={(e) => setSamples((s) => { const n = [...s]; n[i] = e.target.value; return n; })} />
                ))}
              </div>
            )}
            <div>
              <Label>Preview</Label>
              <Preview t={{ header_text: header, body_text: body, footer_text: footer, category }} values={samples} />
            </div>
            {category === "MARKETING" && (
              <p className="text-[11px] text-muted-foreground">
                A "{MARKETING_OPT_OUT_BUTTON}" button is added automatically. Tapping it opts them out of news &amp; offers straight away.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
