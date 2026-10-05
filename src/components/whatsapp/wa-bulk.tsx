/**
 * Bulk tools for Contacts: record consent (or an opt-out) for many contacts at
 * once, and import contacts from a CSV — with a template to download first.
 *
 * Consent still goes through wa_record_consent() one contact at a time, so every
 * person gets their own audit entry with the note saying how they agreed. A
 * CSV only records consent when the import is told to, with a note.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toE164, OPTIN_CATEGORY_TEXT } from "@/lib/whatsapp/shared";
import { db, Chip, type WaContact } from "./wa-common";

/** Run `fn` over items, a few at a time, reporting progress. */
async function eachLimited<T>(items: T[], limit: number, fn: (t: T) => Promise<void>, onDone?: (n: number) => void) {
  let i = 0, done = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
      onDone?.(++done);
    }
  });
  await Promise.all(workers);
}

// ─── Bulk consent / opt-out ───────────────────────────────────────────────────

export function BulkConsentDialog({ contacts, mode, onClose, onDone }: {
  contacts: WaContact[]; mode: "in" | "out"; onClose: () => void; onDone: () => void;
}) {
  const [updates, setUpdates] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const [scope, setScope] = useState<"all" | "marketing">("all");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  // Opting in needs a number, and never overrides someone's opt-out in bulk.
  const eligible = mode === "in"
    ? contacts.filter((c) => c.phone_e164 && c.consent_status !== "opted_out")
    : contacts.filter((c) => c.consent_status !== "opted_out" || (scope === "marketing" && c.consent_marketing));
  const noNumber = mode === "in" ? contacts.filter((c) => !c.phone_e164).length : 0;
  const optedOut = mode === "in" ? contacts.filter((c) => c.phone_e164 && c.consent_status === "opted_out").length : 0;

  async function run() {
    if (mode === "in") {
      if (!updates && !marketing) { toast.error("Tick at least one kind of message they agreed to."); return; }
      if (!note.trim()) { toast.error("Say how they agreed — it's saved against every contact."); return; }
      if (!confirmed) { toast.error("Confirm that each person agreed."); return; }
    }
    setProgress(0);
    const failed: string[] = [];
    await eachLimited(eligible, 5, async (c) => {
      const { error } = await db().rpc("wa_record_consent", mode === "in"
        ? { p_contact_id: c.id, p_action: "opted_in", p_updates: updates, p_marketing: marketing,
            p_channel: "staff", p_note: `${note.trim()} (recorded in bulk)`, p_phone: c.phone_e164 }
        : { p_contact_id: c.id, p_action: "opted_out",
            p_updates: scope === "marketing" ? c.consent_updates : false, p_marketing: false,
            p_channel: "staff", p_note: note.trim() || "Opt-out recorded in bulk by staff" });
      if (error) failed.push(`${c.name}: ${error.message}`);
    }, setProgress);
    const ok = eligible.length - failed.length;
    (failed.length ? toast.warning : toast.success)(
      mode === "in" ? `Consent recorded for ${ok}` : `Opt-out recorded for ${ok}`,
      { description: failed.length ? failed.slice(0, 3).join(" · ") : undefined, duration: failed.length ? 12000 : 4000 });
    onDone();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && progress === null) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "in" ? `Record consent for ${eligible.length}` : `Record opt-out for ${eligible.length}`}</DialogTitle>
          <DialogDescription>
            {mode === "in"
              ? "Only for people who have each agreed — by phone, in person or in writing — to WhatsApp messages from JLS Yachts. Each gets their own entry in the consent history."
              : "For people who have asked to stop receiving WhatsApp messages. It takes effect immediately."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {(noNumber > 0 || optedOut > 0) && (
            <div className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
              {noNumber > 0 && <p>{noNumber} skipped — no WhatsApp number (add one first).</p>}
              {optedOut > 0 && <p>{optedOut} skipped — they opted out. A new opt-in after an opt-out must be recorded one at a time.</p>}
            </div>
          )}
          {mode === "in" ? (
            <>
              <label className="flex items-start gap-2"><Checkbox checked={updates} onCheckedChange={(v) => setUpdates(!!v)} /><span>{OPTIN_CATEGORY_TEXT.updates}</span></label>
              <label className="flex items-start gap-2"><Checkbox checked={marketing} onCheckedChange={(v) => setMarketing(!!v)} /><span>{OPTIN_CATEGORY_TEXT.marketing}</span></label>
              <div className="space-y-1.5">
                <Label>How did they agree? <span className="text-red-500">*</span></Label>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Signed WhatsApp consent forms at the Dubai boat show, Oct 2026" />
              </div>
              <label className="flex items-start gap-2 rounded-md border border-border p-2 text-xs">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />
                <span>I confirm each of these {eligible.length} people agreed to receive these WhatsApp messages from JLS Yachts, and that this can be shown if asked.</span>
              </label>
            </>
          ) : (
            <>
              <label className="flex items-center gap-2"><input type="radio" checked={scope === "all"} onChange={() => setScope("all")} /> Stop all WhatsApp messages</label>
              <label className="flex items-center gap-2"><input type="radio" checked={scope === "marketing"} onChange={() => setScope("marketing")} /> Stop news &amp; offers only (keep updates)</label>
              <div className="space-y-1.5"><Label>Note (optional)</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Asked by email" /></div>
            </>
          )}
          {progress !== null && <Progress value={eligible.length ? (progress / eligible.length) * 100 : 100} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={progress !== null}>Cancel</Button>
          <Button onClick={() => void run()} disabled={progress !== null || eligible.length === 0} variant={mode === "out" ? "destructive" : "default"}>
            {progress !== null && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {mode === "in" ? `Record consent (${eligible.length})` : `Record opt-out (${eligible.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── CSV import ───────────────────────────────────────────────────────────────

const COLUMNS = ["name", "email", "whatsapp", "yacht", "notes", "updates", "marketing", "consent_note"] as const;

const TEMPLATE_ROWS = [
  ["Captain John Smith", "captain@serenity-yacht.com", "+971 50 123 4567", "Serenity", "Prefers WhatsApp before 6pm", "yes", "no", "Agreed by phone with Hilary, 5 Oct 2026"],
  ["Jane Doe", "jane.doe@example.com", "+44 7700 900123", "", "", "", "", ""],
];

function csvEscape(v: string) {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function downloadCsvTemplate() {
  const lines = [COLUMNS.join(","), ...TEMPLATE_ROWS.map((r) => r.map(csvEscape).join(","))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "whatsapp-contacts-template.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** RFC 4180-ish: quoted fields, doubled quotes, commas/newlines inside quotes, BOM, CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const yes = (v: string | undefined) => /^(y|yes|true|1|x|✓)$/i.test((v ?? "").trim());
const normVessel = (v: string) => v.toLowerCase().replace(/^(m\/?y|s\/?y|mv|sy|my)\s+/i, "").replace(/[^a-z0-9]+/g, "");

type RowStatus = "new" | "update" | "skip" | "error";
interface ParsedRow {
  line: number;
  name: string;
  email: string | null;
  phone: string | null;
  phoneRaw: string;
  yachtRaw: string;
  yachtId: string | null;
  yachtName: string | null;
  notes: string | null;
  updates: boolean;
  marketing: boolean;
  consentNote: string;
  existing: (WaContact & { phone_confirmed: boolean }) | null;
  /** Same person as an earlier row — never imported or consented twice. */
  dup: boolean;
  status: RowStatus;
  issues: string[];
}

export function CsvImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [raw, setRaw] = useState<string[][] | null>(null);
  const [ref, setRef] = useState<{ dial: string[]; yachts: Array<{ id: string; vessel_name: string | null }>; contacts: any[] } | null>(null);
  const [onExisting, setOnExisting] = useState<"skip" | "update">("skip");
  const [withConsent, setWithConsent] = useState(false);
  const [globalNote, setGlobalNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; consent: number; skipped: number; failed: string[] } | null>(null);

  useEffect(() => {
    void Promise.all([
      db().from("country_dial_codes").select("dial_code"),
      db().from("yachts").select("id, vessel_name, archive"),
      db().from("wa_contacts").select("id, name, email, phone_e164, phone_confirmed, yacht_id, consent_status, consent_updates, consent_marketing"),
    ]).then(([{ data: d }, { data: y }, { data: c }]: any[]) => setRef({
      dial: (d ?? []).map((r: any) => r.dial_code),
      yachts: (y ?? []).filter((r: any) => !r.archive),
      contacts: c ?? [],
    }));
  }, []);

  async function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast.error("That file is over 2 MB — split it into smaller files."); return; }
    const rows = parseCsv(await f.text());
    if (rows.length < 2) { toast.error("No rows found under the header."); return; }
    if (rows.length > 2001) { toast.error("Import at most 2,000 contacts at a time."); return; }
    setFileName(f.name);
    setRaw(rows);
    setResult(null);
  }

  const parsed: ParsedRow[] = useMemo(() => {
    if (!raw || !ref) return [];
    const header = raw[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
    const col = (names: string[]) => header.findIndex((h) => names.includes(h));
    const idx = {
      name: col(["name", "full_name", "contact_name"]), email: col(["email", "email_address"]),
      whatsapp: col(["whatsapp", "whatsapp_number", "phone", "mobile", "number"]), yacht: col(["yacht", "vessel", "vessel_name", "yacht_name"]),
      notes: col(["notes", "note"]), updates: col(["updates", "consent_updates"]), marketing: col(["marketing", "news_offers", "consent_marketing"]),
      consentNote: col(["consent_note", "how_agreed"]),
    };
    const byVessel = new Map<string, Array<{ id: string; vessel_name: string | null }>>();
    for (const y of ref.yachts) {
      const k = normVessel(y.vessel_name ?? "");
      if (k) byVessel.set(k, [...(byVessel.get(k) ?? []), y]);
    }
    const byPhone = new Map(ref.contacts.filter((c) => c.phone_e164).map((c) => [c.phone_e164, c]));
    const byEmail = new Map(ref.contacts.filter((c) => c.email).map((c) => [String(c.email).toLowerCase(), c]));
    const seen = new Set<string>();

    return raw.slice(1).map((cells, i): ParsedRow => {
      const get = (k: keyof typeof idx) => (idx[k] >= 0 ? (cells[idx[k]] ?? "").trim() : "");
      const issues: string[] = [];
      const name = get("name");
      const email = get("email").toLowerCase() || null;
      const phoneRaw = get("whatsapp");
      const phone = phoneRaw ? toE164(phoneRaw, ref.dial) : null;
      if (phoneRaw && !phone) issues.push("number needs its country code, e.g. +971…");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push("email doesn't look right");
      const yachtRaw = get("yacht");
      let yachtId: string | null = null, yachtName: string | null = null;
      if (yachtRaw) {
        const m = byVessel.get(normVessel(yachtRaw)) ?? [];
        if (m.length === 1) { yachtId = m[0].id; yachtName = m[0].vessel_name; }
        else issues.push(m.length ? `"${yachtRaw}" matches ${m.length} yachts — left unlinked` : `yacht "${yachtRaw}" not found — left unlinked`);
      }
      const existing = (phone && byPhone.get(phone)) || (email && byEmail.get(email)) || null;
      const key = phone ?? email ?? `${name}|${i}`;
      let status: RowStatus = existing ? (onExisting === "update" ? "update" : "skip") : "new";
      if (!name) { status = "error"; issues.unshift("no name"); }
      else if (!phone && !email) { status = "error"; issues.unshift("needs a WhatsApp number or an email"); }
      const dup = seen.has(key);
      if (status !== "error" && dup) { status = "skip"; issues.unshift("repeated earlier in the file"); }
      seen.add(key);
      return {
        line: i + 2, name, email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null, phone, phoneRaw, yachtRaw, yachtId, yachtName,
        notes: get("notes") || null, updates: yes(get("updates")), marketing: yes(get("marketing")), consentNote: get("consentNote"),
        existing, dup, status, issues,
      };
    });
  }, [raw, ref, onExisting]);

  const counts = useMemo(() => {
    const c = { new: 0, update: 0, skip: 0, error: 0, consent: 0 };
    for (const r of parsed) {
      c[r.status]++;
      if (r.status !== "error" && (r.updates || r.marketing)) c.consent++;
    }
    return c;
  }, [parsed]);

  /** Would this row's consent be recorded, and if not, why. */
  function consentPlan(r: ParsedRow): { ok: boolean; why?: string } {
    if (!(r.updates || r.marketing)) return { ok: false };
    if (!withConsent) return { ok: false, why: "consent columns ignored" };
    if (r.status === "error") return { ok: false, why: "row not imported" };
    if (r.dup) return { ok: false, why: "repeated row" };
    if (r.status === "skip" && !r.existing) return { ok: false, why: "row skipped" };
    const phone = r.phone ?? r.existing?.phone_e164 ?? null;
    if (!phone) return { ok: false, why: "no WhatsApp number" };
    if (r.existing?.consent_status === "opted_out") return { ok: false, why: "opted out — record individually" };
    if (!(r.consentNote || globalNote.trim())) return { ok: false, why: "no note saying how they agreed" };
    return { ok: true };
  }

  async function run() {
    if (withConsent && counts.consent && !confirmed) { toast.error("Confirm that the people marked in the file agreed."); return; }
    const toCreate = parsed.filter((r) => r.status === "new");
    const toUpdate = parsed.filter((r) => r.status === "update" && r.existing);
    const toConsent = parsed.filter((r) => consentPlan(r).ok);
    const total = toCreate.length + toUpdate.length + toConsent.length;
    if (!total) { toast.info("Nothing to import."); return; }
    setRunning({ done: 0, total });
    const failed: string[] = [];
    let done = 0;
    const tick = () => setRunning({ done: ++done, total });
    const ids = new Map<number, string>(); // line → contact id
    let created = 0;

    // New contacts, 200 at a time. Imported details aren't consent.
    for (let i = 0; i < toCreate.length; i += 200) {
      const chunk = toCreate.slice(i, i + 200);
      const { data, error } = await db().from("wa_contacts").insert(chunk.map((r) => ({
        name: r.name, email: r.email, phone_e164: r.phone, yacht_id: r.yachtId, source: "manual",
        notes: [r.notes, `Imported from ${fileName ?? "CSV"}`].filter(Boolean).join(" · "),
      }))).select("id, phone_e164, email, name");
      if (error) { chunk.forEach((r) => failed.push(`Line ${r.line} (${r.name}): ${error.message}`)); }
      else {
        created += (data as any[]).length;
        for (const r of chunk) {
          const hit = (data as any[]).find((d) => (r.phone && d.phone_e164 === r.phone) || (!r.phone && r.email && d.email === r.email && d.name === r.name));
          if (hit) ids.set(r.line, hit.id);
        }
      }
      chunk.forEach(tick);
    }

    // Existing contacts: fill in what the file has; a client-confirmed number is never overwritten.
    await eachLimited(toUpdate, 5, async (r) => {
      const ex = r.existing!;
      const patch: Record<string, unknown> = { name: r.name };
      if (r.email) patch.email = r.email;
      if (r.yachtId) patch.yacht_id = r.yachtId;
      if (r.notes) patch.notes = r.notes;
      if (r.phone && !ex.phone_confirmed && r.phone !== ex.phone_e164) patch.phone_e164 = r.phone;
      const { error } = await db().from("wa_contacts").update(patch).eq("id", ex.id);
      if (error) failed.push(`Line ${r.line} (${r.name}): ${error.message}`);
      ids.set(r.line, ex.id);
      tick();
    });

    // Consent, one audited entry per person.
    let consent = 0;
    await eachLimited(toConsent, 5, async (r) => {
      const id = ids.get(r.line) ?? r.existing?.id;
      const phone = r.phone ?? r.existing?.phone_e164;
      if (!id || !phone) { failed.push(`Line ${r.line} (${r.name}): consent not recorded — contact wasn't saved`); tick(); return; }
      const { error } = await db().rpc("wa_record_consent", {
        p_contact_id: id, p_action: "opted_in", p_updates: r.updates, p_marketing: r.marketing, p_channel: "staff",
        p_note: `${r.consentNote || globalNote.trim()} (imported from ${fileName ?? "CSV"}, line ${r.line})`, p_phone: phone,
      });
      if (error) failed.push(`Line ${r.line} (${r.name}): consent — ${error.message}`); else consent++;
      tick();
    });

    setRunning(null);
    setResult({ created, updated: toUpdate.length, consent, skipped: counts.skip + counts.error, failed });
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !running) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import contacts from a CSV</DialogTitle>
          <DialogDescription>
            Start from the template so the columns line up. Nothing is saved until you check the preview and press Import.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-5 w-5 text-emerald-500" /> Import finished</p>
            <p>{result.created} added · {result.updated} updated · {result.consent} consent recorded · {result.skipped} skipped</p>
            {result.failed.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-md bg-red-500/10 p-2 text-xs text-red-600">
                {result.failed.map((f, i) => <p key={i}>{f}</p>)}
              </div>
            )}
            <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">1. Download the template, fill it in</p>
                <p className="text-xs text-muted-foreground">
                  Columns: <code>name</code> (required), <code>email</code>, <code>whatsapp</code> (with country code), <code>yacht</code> (as named in Polaris),
                  {" "}<code>notes</code>, and optionally <code>updates</code> / <code>marketing</code> (yes/no) with <code>consent_note</code> saying how they agreed.
                </p>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={downloadCsvTemplate}><Download className="h-4 w-4" /> Download template</Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">2. Choose your file</p>
                <p className="text-xs text-muted-foreground">{fileName ? `${fileName} — ${parsed.length} row${parsed.length === 1 ? "" : "s"}` : "A .csv saved from Excel or Google Sheets."}</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
              <Button size="sm" variant="outline" disabled={!ref} onClick={() => fileRef.current?.click()}>{fileName ? "Choose another" : "Choose CSV"}</Button>
            </div>

            {parsed.length > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <Chip t="green">{counts.new} new</Chip>
                  <Chip t="blue">{counts.update} update</Chip>
                  <Chip t="grey">{counts.skip} skip</Chip>
                  {counts.error > 0 && <Chip t="red">{counts.error} with errors</Chip>}
                  <span className="ml-auto flex items-center gap-3">
                    Already in Polaris (same number or email):
                    <label className="flex items-center gap-1"><input type="radio" checked={onExisting === "skip"} onChange={() => setOnExisting("skip")} /> skip</label>
                    <label className="flex items-center gap-1"><input type="radio" checked={onExisting === "update"} onChange={() => setOnExisting("update")} /> update their details</label>
                  </span>
                </div>

                {counts.consent > 0 && (
                  <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                    <label className="flex items-start gap-2">
                      <Checkbox checked={withConsent} onCheckedChange={(v) => setWithConsent(!!v)} />
                      <span>
                        <strong>Record consent from the file</strong> — {counts.consent} row{counts.consent === 1 ? "" : "s"} marked yes for updates or news &amp; offers.
                        <span className="block text-xs text-muted-foreground">Off: they're imported as "Not invited" and you can email them an opt-in invitation instead (the stronger proof).</span>
                      </span>
                    </label>
                    {withConsent && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">How did they agree? (used where a row has no consent_note)</Label>
                          <Textarea rows={2} value={globalNote} onChange={(e) => setGlobalNote(e.target.value)} placeholder="Signed WhatsApp consent forms at the Dubai boat show, Oct 2026" />
                        </div>
                        <label className="flex items-start gap-2 text-xs">
                          <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />
                          <span>I confirm the people marked yes agreed to receive those WhatsApp messages from JLS Yachts, and that this can be shown if asked.</span>
                        </label>
                      </>
                    )}
                  </div>
                )}

                <div className="max-h-80 overflow-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 border-b border-border bg-muted text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                      <tr><th className="px-2 py-1.5">Line</th><th className="px-2 py-1.5">Name</th><th className="px-2 py-1.5">WhatsApp</th><th className="px-2 py-1.5">Email</th><th className="px-2 py-1.5">Yacht</th><th className="px-2 py-1.5">Consent</th><th className="px-2 py-1.5">Result</th></tr>
                    </thead>
                    <tbody>
                      {parsed.map((r) => {
                        const cp = consentPlan(r);
                        return (
                          <tr key={r.line} className="border-b border-border/60 align-top last:border-0">
                            <td className="px-2 py-1.5 text-muted-foreground">{r.line}</td>
                            <td className="px-2 py-1.5">{r.name || <span className="text-red-500">—</span>}</td>
                            <td className="px-2 py-1.5 font-mono">{r.phone ?? (r.phoneRaw ? <span className="text-red-500">{r.phoneRaw}</span> : "—")}</td>
                            <td className="px-2 py-1.5">{r.email ?? "—"}</td>
                            <td className="px-2 py-1.5">{r.yachtName ?? (r.yachtRaw ? <span className="text-amber-600">{r.yachtRaw}?</span> : "—")}</td>
                            <td className="px-2 py-1.5">
                              {r.updates || r.marketing ? (
                                <>
                                  {[r.updates && "updates", r.marketing && "offers"].filter(Boolean).join(" + ")}
                                  {!cp.ok && cp.why && <span className="block text-muted-foreground">not recorded: {cp.why}</span>}
                                </>
                              ) : "—"}
                            </td>
                            <td className="px-2 py-1.5">
                              <Chip t={r.status === "new" ? "green" : r.status === "update" ? "blue" : r.status === "error" ? "red" : "grey"}>{r.status}</Chip>
                              {r.issues.map((x, i) => (
                                <span key={i} className="mt-0.5 flex items-start gap-1 text-[10px] text-amber-600"><AlertTriangle className="mt-px h-3 w-3 shrink-0" />{x}</span>
                              ))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {running && <Progress value={(running.done / running.total) * 100} />}

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={!!running}>Cancel</Button>
              <Button onClick={() => void run()} disabled={!!running || !parsed.length || (counts.new + counts.update === 0 && !(withConsent && counts.consent))}>
                {running && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Import {counts.new + counts.update} contact{counts.new + counts.update === 1 ? "" : "s"}
                {withConsent && parsed.filter((r) => consentPlan(r).ok).length > 0 ? ` + ${parsed.filter((r) => consentPlan(r).ok).length} consent` : ""}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
