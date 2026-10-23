/**
 * Inbox — every WhatsApp conversation with a client, in one shared place.
 *
 * A thread merges what they sent (wa_inbound) with what we sent them
 * (wa_messages: broadcasts, replies and one-off templates). Inside WhatsApp's
 * 24-hour window staff reply in free text; outside it the composer switches to
 * an approved template, which also needs the client's consent.
 *
 * In the window the reply box can also send files (photos, PDF/Office documents,
 * video, audio — /api/whatsapp/reply-media), several at once, and drop in a saved quick reply
 * (the ⚡ button, or type "/" — see wa-quick-replies).
 *
 * Several numbers: a thread is one contact on one number (the office number,
 * the Training number…). People see only the numbers they have access to, and
 * can reply only where they have "send" (WhatsApp → Setup → Numbers).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Search, Send, Loader2, Check, CheckCheck, AlertCircle, Clock, Paperclip, Reply, X, Lock, MessageSquarePlus,
  CircleCheck, RotateCcw, UserRound, Zap, Pencil, Copy, UserPlus, Contact as ContactIcon, Forward, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { windowRemaining, placeholderCount, dynamicUrlButtons, personalise, placeholderContext, recipientOf } from "@/lib/whatsapp/shared";
import { TokenScope, TokenBar, TokenInput } from "./wa-tokens";
import { WaTemplatePreview, templateBlocker } from "./wa-templates";
import { db, waApi, waBlob, ConsentChip, Chip, Empty, lineName, type WaContact, type WaTemplate, type MyLine } from "./wa-common";
import { QuickReplyMenu, QuickRepliesManager, noteQuickReplyUsed, type QuickReply } from "./wa-quick-replies";

/** What the paperclip accepts — the same kinds the server sends (see OUTBOUND_MEDIA). */
const ATTACH_ACCEPT = "image/jpeg,image/png,video/mp4,video/3gpp,audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain";

async function sendMediaReply(form: FormData): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/whatsapp/reply-media", {
    method: "POST",
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    body: form,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error ?? `Not sent (${res.status})`);
}

/** Most files one send takes — each goes as its own WhatsApp message (there's no album send). */
const MAX_FILES = 10;

const fileSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

interface Conversation {
  id: string;
  contact_id: string;
  line_id: string;
  status: "open" | "closed";
  assigned_to: string | null;
  last_inbound_at: string | null;
  last_message_at: string | null;
  last_preview: string | null;
  last_direction: "in" | "out" | null;
  unread_count: number;
  contact: WaContact;
}

interface ThreadItem {
  key: string;
  dir: "in" | "out";
  at: string;
  body: string | null;
  // in
  inboundId?: string;
  type?: string | null;
  mediaMime?: string | null;
  hasMedia?: boolean;
  /** A document's file name, as the client sent it. */
  fileName?: string | null;
  action?: string | null;
  contextWamid?: string | null;
  // out
  kind?: "campaign" | "reply" | "template";
  auto?: boolean;
  status?: string;
  error?: string | null;
  sentBy?: string | null;
  campaignName?: string | null;
  wamid?: string | null;
  outboundId?: string;
  outMedia?: { type: string; mime: string | null; name: string | null } | null;
  /** Typed in the WhatsApp Business app on the phone, not in Polaris. */
  fromPhone?: boolean;
  /** Imported from the Business app's chat history when the number was connected. */
  imported?: boolean;
  /** Contact cards the client shared (WhatsApp "contacts" message). */
  shared?: SharedContact[];
  /** Shown straight away while the send is still on its way to WhatsApp. */
  pending?: boolean;
}

/** One contact card from a shared-contacts message, as Meta sends it. */
type SharedContact = {
  name?: { formatted_name?: string; first_name?: string; last_name?: string };
  phones?: Array<{ phone?: string; wa_id?: string; type?: string }>;
};

/** The thread on screen: one contact, on one number. */
export type Active = { contactId: string; lineId: string };

type Filter = "open" | "mine" | "unassigned" | "closed";
const POLL_MS = 15_000;

export function WaInbox({ lines, openContactId = null, openThread = null, fill = false }: {
  lines: MyLine[];
  openContactId?: string | null;
  /** Start in this thread (a new-message alert in the Chats app). */
  openThread?: Active | null;
  /** Fill the parent edge to edge (the Chats app) instead of sitting in a page. */
  fill?: boolean;
}) {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  /** Which number's threads to show — "all" for every number the person can use. */
  const [lineFilter, setLineFilter] = useState<string>("all");
  const lineOf = (id: string | null | undefined) => lines.find((l) => l.id === id) ?? null;
  const defaultLine = lines.find((l) => l.is_default) ?? lines[0] ?? null;
  const sendable = lines.filter((l) => l.level === "send" && l.status !== "disconnected");
  // Opened from a contact's Message button: start in their thread (on the office number, or the only one they have).
  const [active, setActive] = useState<Active | null>(
    openThread ?? (openContactId && (defaultLine) ? { contactId: openContactId, lineId: defaultLine.id } : null));
  const [me, setMe] = useState<string | null>(null);
  const [staff, setStaff] = useState<Array<{ id: string; display_name: string | null }>>([]);
  const [starting, setStarting] = useState(false);

  const loadConvs = useCallback(async () => {
    const { data, error } = await db().from("wa_conversations")
      .select("*, contact:wa_contacts(id, name, first_name, last_name, email, phone_e164, phone_confirmed, consent_status, consent_updates, consent_marketing, yacht:yachts(vessel_name))")
      .order("last_message_at", { ascending: false, nullsFirst: false }).limit(500);
    if (error) toast.error(error.message);
    else setConvs((data ?? []) as Conversation[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadConvs();
    void supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
    void db().from("profiles").select("id, display_name").order("display_name")
      .then(({ data }: any) => setStaff(data ?? []));
    const t = setInterval(() => { if (!document.hidden) void loadConvs(); }, POLL_MS);
    return () => clearInterval(t);
  }, [loadConvs]);
  // New messages are pushed (wa_conversations changes on every message); the poll is the fallback.
  useLive("wa-convs", [{ table: "wa_conversations" }], loadConvs);

  // Only numbers the person can use reach the browser (row-level security);
  // this narrows to the one picked.
  const onLine = useMemo(() => convs.filter((c) => lineFilter === "all" || c.line_id === lineFilter), [convs, lineFilter]);
  const counts = useMemo(() => ({
    open: onLine.filter((c) => c.status === "open").length,
    mine: onLine.filter((c) => c.status === "open" && c.assigned_to === me).length,
    unassigned: onLine.filter((c) => c.status === "open" && !c.assigned_to).length,
    closed: onLine.filter((c) => c.status === "closed").length,
    unread: onLine.reduce((n, c) => n + (c.unread_count || 0), 0),
  }), [onLine, me]);
  const unreadOn = (lineId: string) => convs.filter((c) => c.line_id === lineId).reduce((n, c) => n + (c.unread_count || 0), 0);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return onLine.filter((c) => {
      if (filter === "closed" ? c.status !== "closed" : c.status !== "open") return false;
      if (filter === "mine" && c.assigned_to !== me) return false;
      if (filter === "unassigned" && c.assigned_to) return false;
      return !s || [c.contact?.name, c.contact?.phone_e164, c.contact?.yacht?.vessel_name, c.last_preview]
        .some((v) => (v ?? "").toLowerCase().includes(s));
    });
  }, [onLine, filter, q, me]);

  const activeConv = active ? convs.find((c) => c.contact_id === active.contactId && c.line_id === active.lineId) ?? null : null;
  const activeLine = active ? lineOf(active.lineId) : null;
  const staffName = (id: string | null | undefined) => staff.find((s) => s.id === id)?.display_name ?? null;

  return (
    <div className={cn("grid grid-cols-1 overflow-hidden md:grid-cols-[320px_1fr]",
      fill ? "h-full min-h-0" : "h-[calc(100vh-15rem)] min-h-[520px] rounded-xl border border-border")}>
      {/* ── Conversation list ── */}
      <aside className={cn("flex min-h-0 flex-col border-r border-border", active && "hidden md:flex")}>
        <div className="space-y-2 border-b border-border p-3">
          {lines.length > 1 && (
            <select value={lineFilter} onChange={(e) => setLineFilter(e.target.value)} aria-label="WhatsApp number"
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs">
              <option value="all">All my numbers</option>
              {lines.map((l) => {
                const n = unreadOn(l.id);
                return <option key={l.id} value={l.id}>{lineName(l)}{n ? ` (${n} unread)` : ""}{l.level === "view" ? " — read only" : l.level === "assigned" ? " — chats assigned to you" : ""}</option>;
              })}
            </select>
          )}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" className="h-8 pl-8" />
            </div>
            {sendable.length > 0 && (
              <Button size="sm" variant="outline" className="h-8 px-2" title="Message a contact" onClick={() => setStarting(true)}>
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {(["open", "mine", "unassigned", "closed"] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn("rounded-full px-2.5 py-0.5 text-[11px]",
                  filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
                {{ open: "Open", mine: "Mine", unassigned: "Unassigned", closed: "Closed" }[f]} ({counts[f]})
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : shown.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">
              {convs.length === 0 ? "No conversations yet. When a client messages your WhatsApp number, it appears here." : "Nothing here."}
            </p>
          ) : shown.map((c) => {
            const open = windowRemaining(c.last_inbound_at) > 0;
            return (
              <button key={c.id} onClick={() => setActive({ contactId: c.contact_id, lineId: c.line_id })}
                className={cn("flex w-full gap-2 border-b border-border/60 px-3 py-2.5 text-left hover:bg-muted/50",
                  activeConv?.id === c.id && "bg-muted")}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("truncate text-sm", c.unread_count > 0 ? "font-semibold" : "font-medium")}>{c.contact?.name}</span>
                    {open && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title="Reply window open" />}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.last_direction === "out" && "You: "}{c.last_preview ?? ""}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground/80">
                    {[lines.length > 1 && lineFilter === "all" ? lineOf(c.line_id)?.label : null,
                      c.contact?.yacht?.vessel_name, staffName(c.assigned_to) ? `→ ${staffName(c.assigned_to)}` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[10px] text-muted-foreground">{shortTime(c.last_message_at)}</span>
                  {c.unread_count > 0 && (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-white">{c.unread_count}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Thread ── */}
      <section className={cn("min-h-0", !active && "hidden md:block")}>
        {active && activeLine ? (
          <Thread key={`${active.contactId}:${active.lineId}`} contactId={active.contactId} line={activeLine} showLine={lines.length > 1}
            conv={activeConv} canEdit={activeLine.level === "send" || (!!me && activeConv?.assigned_to === me)} staff={staff} me={me} sendable={sendable}
            onBack={() => setActive(null)} onChanged={loadConvs}
            onOpen={(contactId) => { setActive({ contactId, lineId: active.lineId }); void loadConvs(); }} />
        ) : (
          <div className="grid h-full place-items-center p-6">
            <Empty title={counts.unread ? `${counts.unread} unread message${counts.unread === 1 ? "" : "s"}` : "Choose a conversation"}>
              Replies from clients land here as they arrive.
            </Empty>
          </div>
        )}
      </section>

      {starting && (
        <StartDialog lines={sendable} initialLineId={lineFilter !== "all" && sendable.some((l) => l.id === lineFilter) ? lineFilter : (sendable.find((l) => l.is_default) ?? sendable[0])?.id ?? ""}
          onClose={() => setStarting(false)} onPick={(contactId, lineId) => { setStarting(false); setActive({ contactId, lineId }); }} />
      )}
    </div>
  );
}

// ─── One conversation ─────────────────────────────────────────────────────────

function Thread({ contactId, line, showLine, conv, canEdit, staff, me, sendable, onBack, onChanged, onOpen }: {
  contactId: string; line: MyLine; showLine: boolean; conv: Conversation | null; canEdit: boolean;
  staff: Array<{ id: string; display_name: string | null }>; me: string | null;
  /** Numbers this person can send from — where a message can be forwarded to. */
  sendable: MyLine[];
  onBack: () => void; onChanged: () => void;
  /** Open another contact's thread on this number (a shared contact card's Message button). */
  onOpen: (contactId: string) => void;
}) {
  const [contact, setContact] = useState<WaContact | null>(conv?.contact ?? null);
  /** Each person's level on this number — who'd only reach this chat by being assigned it. */
  const [lineLevels, setLineLevels] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    if (!canEdit) return;
    void db().rpc("wa_line_people", { p_line: line.id })
      .then(({ data }: any) => setLineLevels(new Map(((data ?? []) as any[]).map((r) => [r.user_id, r.level]))));
  }, [canEdit, line.id]);
  const [items, setItems] = useState<ThreadItem[] | null>(null);
  const [lastInboundAt, setLastInboundAt] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ThreadItem | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  /** What's being sent right now, shown in the thread before WhatsApp confirms it. */
  const [pending, setPending] = useState<ThreadItem[]>([]);
  const [forwarding, setForwarding] = useState<ThreadItem | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrQuery, setQrQuery] = useState("");
  const [manageQr, setManageQr] = useState(false);
  /** The add / edit contact form, when open. */
  const [editing, setEditing] = useState<ContactDraft | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [, tick] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  const unread = conv?.unread_count ?? 0;

  const load = useCallback(async () => {
    const [{ data: c }, { data: ins }, { data: outs }] = await Promise.all([
      db().from("wa_contacts").select("*, yacht:yachts(vessel_name)").eq("id", contactId).maybeSingle(),
      db().from("wa_inbound").select("id, wa_message_id, type, body, action, media_id, media_mime, context_wamid, received_at, source, shared:raw->contacts, doc_name:raw->document->>filename")
        .eq("contact_id", contactId).eq("line_id", line.id).order("received_at", { ascending: false }).limit(300),
      db().from("wa_messages").select("id, kind, auto_reply, body, status, error_message, sent_by, wa_message_id, queued_at, sent_at, media_type, media_mime, media_name, media_path, media_id, from_phone, source, campaign:wa_campaigns(name)")
        .eq("contact_id", contactId).eq("line_id", line.id).neq("status", "skipped").order("queued_at", { ascending: false }).limit(300),
    ]);
    setContact(c as WaContact);
    const merged: ThreadItem[] = [
      ...((ins ?? []) as any[]).map((m): ThreadItem => ({
        key: `i${m.id}`, dir: "in", at: m.received_at, body: m.body, inboundId: m.id, type: m.type,
        hasMedia: !!m.media_id, mediaMime: m.media_mime, fileName: m.doc_name ?? null, action: m.action, contextWamid: m.context_wamid, wamid: m.wa_message_id,
        imported: m.source === "history",
        shared: m.type === "contacts" && Array.isArray(m.shared) ? m.shared : undefined,
      })),
      ...((outs ?? []) as any[]).map((m): ThreadItem => ({
        key: `o${m.id}`, dir: "out", at: m.sent_at ?? m.queued_at, body: m.body, kind: m.kind, auto: !!m.auto_reply, status: m.status,
        error: m.error_message, sentBy: m.sent_by, campaignName: m.campaign?.name ?? null, wamid: m.wa_message_id,
        outboundId: m.id, outMedia: m.media_path || m.media_id ? { type: m.media_type, mime: m.media_mime, name: m.media_name } : null,
        fromPhone: !!m.from_phone,
        imported: m.source === "history",
      })),
    ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    setItems(merged);
    // Only a real message opens the reply window — never imported history.
    setLastInboundAt(((ins ?? []) as any[]).find((m) => m.source !== "history")?.received_at ?? null);
  }, [contactId, line.id]);

  useEffect(() => {
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, POLL_MS);
    const clock = setInterval(() => tick((n) => n + 1), 60_000);
    return () => { clearInterval(t); clearInterval(clock); };
  }, [load]);
  // Their messages (via the conversation row) and our delivery / read ticks, pushed as they happen.
  useLive(`wa-thread-${contactId}`, [
    { table: "wa_conversations", filter: `contact_id=eq.${contactId}` },
    { table: "wa_messages", filter: `contact_id=eq.${contactId}` },
  ], load);

  // Reading the thread clears unread (and gives the client blue ticks).
  useEffect(() => {
    if (unread > 0) void waApi("conversations/read", { contactId, lineId: line.id }).then(onChanged).catch(() => {});
  }, [unread, contactId, line.id, onChanged]);

  const shownItems = useMemo(() => (items === null ? null : [...items, ...pending]), [items, pending]);
  useEffect(() => {
    if (shownItems && shownItems.length !== lastCount.current) {
      lastCount.current = shownItems.length;
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [shownItems]);

  const remaining = windowRemaining(lastInboundAt);
  const byWamid = useMemo(() => new Map((items ?? []).filter((i) => i.wamid).map((i) => [i.wamid!, i])), [items]);
  const staffName = (id: string | null | undefined) => staff.find((s) => s.id === id)?.display_name ?? null;

  function addFiles(picked: File[]) {
    if (!picked.length) return;
    const all = [...files, ...picked];
    if (all.length > MAX_FILES) toast.error(`Up to ${MAX_FILES} files at a time — the first ${MAX_FILES} are attached`);
    setFiles(all.slice(0, MAX_FILES));
  }

  // Pasted (Ctrl+V) or dropped files — e.g. a screenshot straight from the clipboard.
  // Clipboard images all arrive as "image.png", so give each a unique name.
  function takeFiles(list: FileList) {
    const picked = Array.from(list);
    const ok = picked.filter((f) => ATTACH_ACCEPT.split(",").includes(f.type));
    if (ok.length < picked.length) toast.error("WhatsApp can't send that file type — use JPG/PNG, MP4, PDF, Office or audio files");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    addFiles(ok.map((f, i) => /^image\.(png|jpe?g)$/i.test(f.name)
      ? new File([f], `pasted-${stamp}${ok.length > 1 ? `-${i + 1}` : ""}.${f.type === "image/png" ? "png" : "jpg"}`, { type: f.type })
      : f));
  }

  async function send() {
    const body = text.trim();
    if (!body && !files.length) return;
    // Clear the box and show the message at once; WhatsApp's confirmation follows.
    const sendFiles = files, quote = replyTo, at = new Date().toISOString();
    setText(""); setReplyTo(null); setFiles([]);
    setPending(sendFiles.length
      ? sendFiles.map((f, i) => ({ key: `p${at}${i}`, dir: "out", at, pending: true, kind: "reply",
          body: `📎 ${f.name}${i === 0 && body ? `\n${body}` : ""}` }))
      : [{ key: `p${at}`, dir: "out", at, pending: true, kind: "reply", body }]);
    setSending(true);
    try {
      if (sendFiles.length) {
        // One message per file, in order; the text goes as the first one's caption.
        // A file that fails stops the run and goes back in the box with those after it.
        for (let i = 0; i < sendFiles.length; i++) {
          const form = new FormData();
          form.append("contactId", contactId);
          form.append("lineId", line.id);
          form.append("file", sendFiles[i]);
          if (i === 0 && body) form.append("caption", body);
          if (i === 0 && quote?.wamid) form.append("replyTo", quote.wamid);
          try {
            await sendMediaReply(form);
          } catch (e) {
            const left = sendFiles.slice(i);
            setFiles(left);
            if (i === 0) { setText(body); setReplyTo(quote); }
            throw new Error(`${sendFiles[i].name}: ${e instanceof Error ? e.message : "not sent"}${i > 0 ? ` — ${i} sent, ${left.length} left to send` : ""}`);
          }
        }
      } else {
        try {
          await waApi("reply", { contactId, lineId: line.id, text: body, replyTo: quote?.wamid ?? null });
        } catch (e) {
          setText((cur) => cur || body); setReplyTo((cur) => cur ?? quote);
          throw e;
        }
      }
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Not sent");
      await load();
    } finally {
      setPending([]);
      setSending(false);
    }
  }

  function pickQuickReply(r: QuickReply) {
    // Personal fields filled for this contact; still editable before sending.
    const filled = contact ? personalise(r.body, recipientOf(contact)) : r.body;
    setText(filled.slice(0, 4096));
    setQrOpen(false);
    noteQuickReplyUsed(r);
  }
  function onType(v: string) {
    setText(v.slice(0, 4096));
    // "/" at the start opens the quick replies, filtered by what follows.
    const m = /^\/(\S*)$/.exec(v);
    if (m) { setQrQuery(m[1]); setQrOpen(true); } else if (qrOpen && !v.startsWith("/")) setQrOpen(false);
  }

  async function setConv(patch: Partial<Pick<Conversation, "status" | "assigned_to">>) {
    if (!conv) return;
    const { error } = await db().from("wa_conversations").update(patch).eq("id", conv.id);
    if (error) toast.error(error.message);
    // Handing on a chat you only had through being assigned it: it leaves your inbox.
    else if (line.level === "assigned" && patch.assigned_to !== undefined && patch.assigned_to !== me) onBack();
    onChanged();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Button size="sm" variant="ghost" className="h-7 px-2 md:hidden" onClick={onBack}>←</Button>
        {/* Right-click the name or number to save / rename the contact or copy the number. */}
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-semibold">{contact?.name ?? "…"}</h3>
                {contact && canEdit && (
                  <button type="button" onClick={() => setEditing(draftFor(contact))}
                    title={isUnsaved(contact) ? "Add to contacts" : "Edit contact"}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                    {isUnsaved(contact) ? <UserPlus className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  </button>
                )}
                {contact && <ConsentChip c={contact} />}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {[contact?.phone_e164, contact?.yacht?.vessel_name, showLine ? `via ${line.label}` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
          </ContextMenuTrigger>
          {contact && (
            <ContextMenuContent>
              {canEdit && (
                <ContextMenuItem onSelect={() => setEditing(draftFor(contact))}>
                  {isUnsaved(contact) ? <UserPlus className="mr-2 h-4 w-4" /> : <Pencil className="mr-2 h-4 w-4" />}
                  {isUnsaved(contact) ? "Add to contacts…" : "Edit contact…"}
                </ContextMenuItem>
              )}
              {contact.phone_e164 && (
                <ContextMenuItem onSelect={() => void navigator.clipboard.writeText(contact.phone_e164!).then(() => toast.success("Number copied"))}>
                  <Copy className="mr-2 h-4 w-4" /> Copy number
                </ContextMenuItem>
              )}
            </ContextMenuContent>
          )}
        </ContextMenu>
        {conv && canEdit && (
          <div className="flex items-center gap-1.5">
            <select value={conv.assigned_to ?? ""} onChange={(e) => void setConv({ assigned_to: e.target.value || null })}
              className="h-7 max-w-[160px] rounded-md border border-border bg-background px-2 text-xs"
              title={`Assign. Someone marked "this chat only" can't use ${line.label} — being assigned lets them read and reply to this chat, nothing else on it.`}>
              <option value="">Unassigned</option>
              {me && <option value={me}>Me</option>}
              {staff.filter((s) => s.id !== me && (!lineLevels || lineLevels.has(s.id))).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name ?? "—"}{lineLevels?.get(s.id) === "none" ? " · this chat only" : ""}
                </option>
              ))}
            </select>
            {conv.status === "open" ? (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => void setConv({ status: "closed" })}>
                <CircleCheck className="h-3.5 w-3.5" /> Close
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => void setConv({ status: "open" })}>
                <RotateCcw className="h-3.5 w-3.5" /> Reopen
              </Button>
            )}
          </div>
        )}
        {conv && !canEdit && staffName(conv.assigned_to) && (
          <Chip><UserRound className="h-3 w-3" />{staffName(conv.assigned_to)}</Chip>
        )}
      </header>

      {editing && (
        <ContactDialog draft={editing} onClose={() => setEditing(null)}
          onSave={async (d, open) => {
            const id = await saveContact(line.id, d, open);
            if (!id) return;
            setEditing(null);
            if (id !== contactId && open) onOpen(id);
            else { void load(); onChanged(); }
          }} />
      )}

      {/* Messages */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/20 px-4 py-4">
        {shownItems === null ? (
          <div className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : shownItems.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">No messages yet.</p>
        ) : shownItems.map((m, i) => {
          const newDay = i === 0 || new Date(shownItems[i - 1].at).toDateString() !== new Date(m.at).toDateString();
          const quoted = m.contextWamid ? byWamid.get(m.contextWamid) : null;
          return (
            <div key={m.key}>
              {newDay && (
                <p className="my-3 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
                  {new Date(m.at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                </p>
              )}
              <div className={cn("group flex", m.dir === "out" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                  m.dir === "out" ? "rounded-br-sm bg-emerald-600 text-white" : "rounded-bl-sm border border-border bg-card",
                  m.status === "failed" && "bg-red-600/90", m.pending && "opacity-70")}>
                  {m.kind === "campaign" && (
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-75">Broadcast{m.campaignName ? ` · ${m.campaignName}` : ""}</p>
                  )}
                  {m.kind === "template" && <p className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-75">Template</p>}
                  {m.auto && <p className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-75">Auto-reply</p>}
                  {m.imported && <p className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-75" title="Imported from the WhatsApp Business app's chat history when this number was connected">Imported</p>}
                  {m.fromPhone && !m.imported && <p className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-75" title="Typed in the WhatsApp Business app on the phone">From the phone</p>}
                  {m.dir === "in" && (m.type === "button" || m.type === "interactive") && (
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-emerald-600">Tapped a button</p>
                  )}
                  {quoted && (
                    <div className={cn("mb-1.5 rounded-md border-l-2 px-2 py-1 text-xs opacity-80",
                      m.dir === "out" ? "border-white/60 bg-white/10" : "border-emerald-500 bg-muted")}>
                      {(quoted.body ?? `[${quoted.type ?? "message"}]`).slice(0, 140)}
                    </div>
                  )}
                  {m.hasMedia && m.inboundId && <MediaLink src={`media?inbound=${m.inboundId}`} type={m.type} mime={m.mediaMime} name={m.fileName} />}
                  {m.dir === "out" && m.outMedia && m.outboundId && (
                    <MediaLink src={`media?outbound=${m.outboundId}`} type={m.outMedia.type} mime={m.outMedia.mime} name={m.outMedia.name} />
                  )}
                  {m.shared?.length ? (
                    <SharedContacts cards={m.shared} canEdit={canEdit}
                      onSave={(c) => setEditing(c)}
                      onMessage={(c) => void saveContact(line.id, c, true).then((id) => id && onOpen(id))} />
                  ) : m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    : !m.hasMedia && !m.outMedia && (m.type === "unsupported"
                      ? <p className="italic opacity-70" title="WhatsApp doesn't pass this kind of message on to business systems">A view-once photo, poll or other message WhatsApp can't show here — ask them to send it again as a normal message</p>
                      : <p className="italic opacity-70">[{m.type ?? "message"}]</p>)}
                  {m.action && (
                    <p className="mt-1 text-[11px] font-medium text-red-500">
                      {m.action === "marketing_opt_out" ? "Opted out of news & offers" : "Opted out of WhatsApp messages"} — recorded automatically
                    </p>
                  )}
                  {m.status === "failed" && m.error && <p className="mt-1 text-[11px] opacity-90">Not delivered: {m.error}</p>}
                  <div className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px]", m.dir === "out" ? "text-white/75" : "text-muted-foreground")}>
                    {m.dir === "out" && staffName(m.sentBy) && <span>{staffName(m.sentBy)} ·</span>}
                    <span>{new Date(m.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                    {m.dir === "out" && <Ticks s={m.pending ? undefined : m.status} />}
                  </div>
                </div>
                {m.dir === "in" && canEdit && remaining > 0 && m.wamid && (
                  <button onClick={() => setReplyTo(m)} title="Reply to this message"
                    className="ml-1 self-center rounded p-1 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100">
                    <Reply className="h-3.5 w-3.5" />
                  </button>
                )}
                {sendable.length > 0 && !m.pending && m.status !== "failed" && (m.hasMedia || m.outMedia || (m.body && !m.shared?.length)) && (
                  <button onClick={() => setForwarding(m)} title="Forward to another chat"
                    className={cn("self-center rounded p-1 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100",
                      m.dir === "out" ? "order-first mr-1" : "ml-1")}>
                    <Forward className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      {!canEdit && contact && (
        <p className="border-t border-border p-3 text-center text-xs text-muted-foreground">You can read {line.label}'s messages but not reply from it.</p>
      )}
      {canEdit && contact && (
        remaining > 0 ? (
          <div className="border-t border-border p-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Reply window open for {fmtLeft(remaining)}</span>
              <span>{text.length}/{files.length ? 1024 : 4096}</span>
            </div>
            {replyTo && (
              <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-emerald-500 bg-muted px-2 py-1 text-xs">
                <span className="line-clamp-2 flex-1">{replyTo.body ?? `[${replyTo.type}]`}</span>
                <button onClick={() => setReplyTo(null)}><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
            {files.map((f, i) => (
              <div key={`${f.name}-${f.size}-${f.lastModified}`} className="mb-1 flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs last:mb-2">
                <Paperclip className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-muted-foreground">{fileSize(f.size)}{i === 0 ? " · your text goes as its caption" : ""}</span>
                <button onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} aria-label="Remove the file"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <div className="relative flex items-end gap-2">
              <QuickReplyMenu open={qrOpen} query={qrQuery} onClose={() => setQrOpen(false)} onPick={pickQuickReply}
                              onManage={() => { setQrOpen(false); setManageQr(true); }} />
              <input ref={fileRef} type="file" accept={ATTACH_ACCEPT} multiple className="hidden"
                     onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.target.value = ""; addFiles(picked); }} />
              <div className="flex flex-col gap-1">
                <Button type="button" variant="outline" size="icon" className="h-[21px] w-9" title="Quick replies (or type /)"
                        onClick={() => { setQrQuery(""); setQrOpen((o) => !o); }}>
                  <Zap className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="outline" size="icon" className="h-[21px] w-9" title="Attach photos, PDFs, videos or audio files (up to 10 at once)"
                        onClick={() => fileRef.current?.click()}>
                  <Paperclip className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Textarea value={text} onChange={(e) => onType(e.target.value)} rows={2}
                placeholder={files.length ? "Add a caption (optional) — Enter to send" : "Type a reply, / for quick replies, or paste an image — Enter to send, Shift+Enter for a new line"}
                onKeyDown={(e) => { if (qrOpen) return; if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); takeFiles(e.clipboardData.files); } }}
                onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
                onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); takeFiles(e.dataTransfer.files); } }}
                className="min-h-[44px] resize-none" />
              <Button onClick={() => void send()} disabled={sending || (!text.trim() && !files.length) || (!!files.length && text.length > 1024)} className="h-11 gap-1.5">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send{files.length > 1 ? ` ${files.length}` : ""}
              </Button>
            </div>
          </div>
        ) : (
          <TemplateComposer contact={contact} lineId={line.id} onSent={async () => { await load(); onChanged(); }} />
        )
      )}
      <QuickRepliesManager open={manageQr} onClose={() => setManageQr(false)} />
      {forwarding && <ForwardDialog item={forwarding} lines={sendable} fromLineId={line.id} fromContactId={contactId}
        onClose={() => setForwarding(null)} onSent={onChanged} />}
    </div>
  );
}

function Ticks({ s }: { s?: string }) {
  if (s === "read") return <CheckCheck className="h-3.5 w-3.5 text-sky-300" aria-label="Read" />;
  if (s === "delivered") return <CheckCheck className="h-3.5 w-3.5" aria-label="Delivered" />;
  if (s === "sent") return <Check className="h-3.5 w-3.5" aria-label="Sent" />;
  if (s === "failed") return <AlertCircle className="h-3.5 w-3.5" aria-label="Failed" />;
  return <Clock className="h-3 w-3" aria-label="Sending" />;
}

// ─── Files in the thread ──────────────────────────────────────────────────────

/**
 * Files fetched this session, by API path — so a thumbnail, its full-size view,
 * a download and a forward all reuse one fetch. The oldest are let go past 80.
 */
const fileCache = new Map<string, Promise<{ blob: Blob; url: string }>>();
function cachedFile(src: string) {
  let hit = fileCache.get(src);
  if (!hit) {
    hit = waBlob(src).then((blob) => ({ blob, url: URL.createObjectURL(blob) }));
    hit.catch(() => fileCache.delete(src));
    fileCache.set(src, hit);
    if (fileCache.size > 80) {
      const [oldest, p] = fileCache.entries().next().value!;
      fileCache.delete(oldest);
      void p.then((f) => URL.revokeObjectURL(f.url), () => {});
    }
  }
  return hit;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf", "video/mp4": "mp4",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "text/plain": "txt",
};
const bareMime = (mime?: string | null) => (mime ?? "").split(";")[0].trim().toLowerCase();
/** A sensible file name when WhatsApp didn't give one (photos, voice notes). */
function fileNameFor(name: string | null | undefined, type: string | null | undefined, mime: string | null | undefined) {
  if (name) return name;
  const m = bareMime(mime);
  return `whatsapp-${type ?? "file"}.${EXT[m] ?? (m.split("/")[1] || "bin")}`;
}

function saveFile(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** The file on a thread item, for forwarding: its API path, name and type. */
function itemFile(m: ThreadItem): { src: string; name: string; mime: string } | null {
  if (m.hasMedia && m.inboundId) return { src: `media?inbound=${m.inboundId}`, name: fileNameFor(m.fileName, m.type, m.mediaMime), mime: bareMime(m.mediaMime) };
  if (m.outMedia && m.outboundId) {
    return { src: `media?outbound=${m.outboundId}`, name: fileNameFor(m.outMedia.name, m.outMedia.type, m.outMedia.mime), mime: bareMime(m.outMedia.mime) };
  }
  return null;
}

/**
 * Photos show as a thumbnail as soon as they scroll into view (click for full
 * size); voice notes and videos play in the thread; documents download on click.
 */
function MediaLink({ src, type, mime, name }: { src: string; type?: string | null; mime?: string | null; name?: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [big, setBig] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const isImage = type === "image" || type === "sticker";
  const playable = type === "audio" || type === "video";
  const fileName = fileNameFor(name, type, mime);

  async function fetchIt(): Promise<string | null> {
    setBusy(true);
    try {
      const f = await cachedFile(src);
      setUrl(f.url);
      return f.url;
    } catch (e) {
      setFailed(true);
      toast.error(e instanceof Error ? e.message : "Couldn't load the file");
      return null;
    } finally {
      setBusy(false);
    }
  }

  // Thumbnails load once they're on screen, so a long thread doesn't fetch every photo at once.
  useEffect(() => {
    if (!isImage || url || failed) return;
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); void fetchIt(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [isImage, url, failed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isImage) {
    return (
      <div ref={boxRef} className="mb-1">
        {url ? (
          <button type="button" onClick={() => setBig(true)} title="Open full size" className="block">
            <img src={url} alt={name ?? "Photo"} className="max-h-60 max-w-full rounded-lg object-cover" />
          </button>
        ) : (
          <button type="button" onClick={() => void fetchIt()} disabled={busy}
            className="grid h-32 w-44 place-items-center rounded-lg bg-muted text-xs text-muted-foreground">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : failed ? "Couldn't load — tap to retry" : <Loader2 className="h-4 w-4 animate-spin" />}
          </button>
        )}
        {big && url && (
          <Dialog open onOpenChange={(o) => { if (!o) setBig(false); }}>
            <DialogContent className="max-w-4xl">
              <DialogHeader><DialogTitle>Photo</DialogTitle></DialogHeader>
              <img src={url} alt={name ?? "Photo"} className="mx-auto max-h-[75vh] rounded-lg" />
              <Button variant="outline" className="ml-auto gap-1.5" onClick={() => saveFile(url, fileName)}>
                <Download className="h-4 w-4" /> Download
              </Button>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }
  if (playable && url) {
    return type === "audio"
      ? <audio src={url} controls autoPlay className="mb-1 max-w-full" />
      : <video src={url} controls autoPlay className="mb-1 max-h-72 max-w-full rounded-lg" />;
  }
  return (
    <button onClick={() => void (async () => {
        const u = url ?? await fetchIt();
        if (u && !playable) saveFile(u, fileName);
      })()}
      title={playable ? undefined : `Download ${fileName}`}
      className="mb-1 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-foreground hover:bg-muted/70">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : playable ? <Paperclip className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
      {type === "audio" ? "Play voice note" : type === "video" ? "Play video" : "Download"}
      {!playable && <span className="max-w-[180px] truncate text-muted-foreground">{fileName}</span>}
    </button>
  );
}

// ─── Forward ──────────────────────────────────────────────────────────────────

/** Most chats one forward goes to. */
const MAX_FORWARD = 10;

/**
 * Send a message on to other chats — a file is fetched once and re-sent from
 * here, with no download / upload by hand. Free-form, so only to chats whose
 * 24-hour reply window is open.
 */
function ForwardDialog({ item, lines, fromLineId, fromContactId, onClose, onSent }: {
  item: ThreadItem; lines: MyLine[]; fromLineId: string; fromContactId: string; onClose: () => void; onSent: () => void;
}) {
  const [rows, setRows] = useState<Conversation[] | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const file = itemFile(item);
  const lineLabel = (id: string) => lines.find((l) => l.id === id)?.label ?? "";

  useEffect(() => {
    void db().from("wa_conversations")
      .select("*, contact:wa_contacts(id, name, phone_e164, yacht:yachts(vessel_name))")
      .in("line_id", lines.map((l) => l.id)).order("last_inbound_at", { ascending: false, nullsFirst: false }).limit(500)
      .then(({ data }: any) => setRows(((data ?? []) as Conversation[])
        .filter((c) => !(c.contact_id === fromContactId && c.line_id === fromLineId))));
  }, [lines, fromLineId, fromContactId]);

  const s = q.trim().toLowerCase();
  const list = (rows ?? []).filter((c) => !s || [c.contact?.name, c.contact?.phone_e164, c.contact?.yacht?.vessel_name]
    .some((v) => (v ?? "").toLowerCase().includes(s)));

  async function send() {
    const targets = (rows ?? []).filter((c) => picked.includes(c.id));
    setSending(true);
    const failed: string[] = [];
    try {
      let attach: File | null = null;
      if (file) {
        if (!ATTACH_ACCEPT.split(",").includes(file.mime)) throw new Error("WhatsApp can't forward this kind of file (stickers and some voice notes can't be re-sent)");
        attach = new File([(await cachedFile(file.src)).blob], file.name, { type: file.mime });
      }
      for (const c of targets) {
        try {
          if (attach) {
            const form = new FormData();
            form.append("contactId", c.contact_id);
            form.append("lineId", c.line_id);
            form.append("file", attach);
            if (item.body) form.append("caption", item.body.slice(0, 1024));
            await sendMediaReply(form);
          } else {
            await waApi("reply", { contactId: c.contact_id, lineId: c.line_id, text: item.body ?? "" });
          }
        } catch (e) {
          failed.push(`${c.contact?.name ?? "?"}: ${e instanceof Error ? e.message : "not sent"}`);
        }
      }
      const ok = targets.length - failed.length;
      if (ok) toast.success(`Forwarded to ${ok} chat${ok === 1 ? "" : "s"}`);
      if (failed.length) toast.error(`Not forwarded to ${failed.length}`, { description: failed.join("\n") });
      onSent();
      if (!failed.length) onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Not forwarded");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Forward {file ? (item.type === "image" || item.outMedia?.type === "image" ? "photo" : "file") : "message"}</DialogTitle>
          <DialogDescription>
            Sent as a new message from the chat's own number. WhatsApp only allows this to chats that wrote in the last 24 hours.
          </DialogDescription>
        </DialogHeader>
        <p className="truncate rounded-md bg-muted px-2 py-1.5 text-xs">
          {file ? <><Paperclip className="mr-1 inline h-3 w-3" />{file.name}{item.body ? ` — ${item.body}` : ""}</> : item.body}
        </p>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" autoFocus />
        <div className="max-h-[45vh] overflow-y-auto rounded-md border border-border">
          {rows === null ? (
            <div className="grid place-items-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : list.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">No chats found.</p>
          ) : list.map((c) => {
            const open = windowRemaining(c.last_inbound_at) > 0;
            const on = picked.includes(c.id);
            return (
              <label key={c.id} title={open ? undefined : "Their 24-hour reply window is closed — only a template can be sent"}
                className={cn("flex items-center gap-2 border-b border-border/60 px-3 py-2 text-sm last:border-0",
                  open ? "cursor-pointer hover:bg-muted/50" : "opacity-50")}>
                <input type="checkbox" checked={on} disabled={!open || (!on && picked.length >= MAX_FORWARD)}
                  onChange={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c.contact?.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {[lines.length > 1 ? lineLabel(c.line_id) : null, c.contact?.yacht?.vessel_name, open ? null : "window closed"].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <Button onClick={() => void send()} disabled={!picked.length || sending} className="gap-1.5">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Forward className="h-4 w-4" />}
          Forward{picked.length ? ` to ${picked.length}` : ""}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ─── Live updates ─────────────────────────────────────────────────────────────

/**
 * Re-run `onChange` when any of these tables change (Supabase Realtime, under
 * the viewer's row-level security). Bursts — a message in also touches its
 * conversation — collapse into one reload.
 */
function useLive(name: string, subs: Array<{ table: string; filter?: string }>, onChange: () => unknown) {
  const ref = useRef(onChange);
  ref.current = onChange;
  const key = JSON.stringify(subs);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => { clearTimeout(timer); timer = setTimeout(() => void ref.current(), 250); };
    // Unique topic per mount — supabase.channel() hands back an existing channel for a repeated topic.
    let ch: any = supabase.channel(`${name}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    for (const s of JSON.parse(key) as typeof subs) {
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table: s.table, ...(s.filter ? { filter: s.filter } : {}) }, fire);
    }
    ch.subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(ch); };
  }, [name, key]);
}

// ─── Outside the window: approved templates only ──────────────────────────────

function TemplateComposer({ contact, lineId, onSent }: { contact: WaContact; lineId: string; onSent: () => void }) {
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [tid, setTid] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // Templates belong to a number's WhatsApp Business Account — only this number's.
    void db().from("wa_templates").select("*").eq("status", "approved").eq("line_id", lineId).order("name")
      .then(({ data }: any) => setTemplates(data ?? []));
  }, [lineId]);

  const t = templates.find((x) => x.id === tid) ?? null;
  const needed = t ? placeholderCount(t.body_text) : 0;
  const linkButtons = t ? dynamicUrlButtons(t.buttons) : [];
  const [buttonValues, setButtonValues] = useState<string[]>([]);
  const blocked = !t ? null
    : templateBlocker(t)?.toLowerCase() ?? (!contact.phone_e164 ? "they have no WhatsApp number"
    : contact.consent_status === "opted_out" ? "they have opted out"
    : contact.consent_status !== "opted_in" ? "they haven't opted in yet"
    : t.category === "MARKETING" && !contact.consent_marketing ? "they haven't agreed to news & offers"
    : t.category === "UTILITY" && !contact.consent_updates ? "they haven't agreed to updates"
    : null);

  async function send() {
    if (!t) return;
    setSending(true);
    try {
      await waApi("reply", { contactId: contact.id, lineId, templateId: t.id, variables: values.slice(0, needed), buttonValues });
      toast.success("Template sent");
      setTid(""); setValues([]); setButtonValues([]);
      onSent();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Not sent");
    } finally {
      setSending(false);
    }
  }

  const who = recipientOf(contact);

  return (
    <TokenScope>
    <div className="space-y-2 border-t border-border p-3">
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="mt-0.5 h-3 w-3 shrink-0" />
        The 24-hour reply window is closed. WhatsApp only allows an approved template until {contact.name.split(" ")[0]} writes again —
        and only one they've agreed to receive.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={tid} onChange={(e) => { setTid(e.target.value); setValues([]); setButtonValues([]); }}
          className="h-8 min-w-[220px] rounded-md border border-border bg-background px-2 text-sm">
          <option value="">{templates.length ? "Choose an approved template…" : "No approved templates yet"}</option>
          {templates.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.category === "MARKETING" ? "news & offers" : "updates"})</option>)}
        </select>
        {t && Array.from({ length: needed }, (_, i) => (
          <TokenInput key={i} value={values[i] ?? ""} placeholder={`{{${i + 1}}}`} className="h-8 w-44"
            title={placeholderContext(t.body_text, i + 1)}
            onChange={(v) => setValues((vs) => { const n = [...vs]; n[i] = v; return n; })} />
        ))}
        {t && linkButtons.map((i) => (
          <TokenInput key={`b${i}`} value={buttonValues[i] ?? ""} className="h-8 w-48"
            placeholder={`${t.buttons[i].text} link: ${(t.buttons[i] as any).example || "value"}`}
            onChange={(v) => setButtonValues((vs) => { const n = [...vs]; n[i] = v; return n; })} />
        ))}
        <Button size="sm" onClick={() => void send()} className="gap-1.5"
          disabled={!t || !!blocked || sending || values.slice(0, needed).filter((v) => v?.trim()).length < needed || linkButtons.some((i) => !buttonValues[i]?.trim())}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send template
        </Button>
      </div>
      {t && (
        <div className="max-w-sm">
          <WaTemplatePreview t={t} values={values.map((v) => personalise(v, who))} />
        </div>
      )}
      {blocked && <p className="text-xs text-red-500">Can't send this template: {blocked}.</p>}
      {t && (needed > 0 || linkButtons.length > 0) && <TokenBar />}
    </div>
    </TokenScope>
  );
}

// ─── Start a conversation with an opted-in contact ────────────────────────────

function StartDialog({ lines, initialLineId, onClose, onPick }: {
  lines: MyLine[]; initialLineId: string; onClose: () => void; onPick: (contactId: string, lineId: string) => void;
}) {
  const [rows, setRows] = useState<WaContact[] | null>(null);
  const [q, setQ] = useState("");
  const [lineId, setLineId] = useState(initialLineId);
  /** The "Add a new number" form, when open. */
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    // Everyone this person can see (line-only staff: the contacts on their number). Opted-in first.
    void db().from("wa_contacts").select("*, yacht:yachts(vessel_name)")
      .not("phone_e164", "is", null).neq("consent_status", "opted_out").order("name").limit(2000)
      .then(({ data }: any) => setRows(((data ?? []) as WaContact[])
        .sort((a, b) => Number(b.consent_status === "opted_in") - Number(a.consent_status === "opted_in"))));
  }, []);
  const s = q.trim().toLowerCase();
  const list = (rows ?? []).filter((r) => !s || [r.name, r.phone_e164, r.yacht?.vessel_name].some((v) => (v ?? "").toLowerCase().includes(s)));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Message a contact</DialogTitle>
          <DialogDescription>
            Anyone who messaged in the last 24 hours gets a normal reply. Otherwise the first message must be an approved template, sent to someone who has opted in.
          </DialogDescription>
        </DialogHeader>
        {lines.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            From
            <select value={lineId} onChange={(e) => setLineId(e.target.value)}
              className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground">
              {lines.map((l) => <option key={l.id} value={l.id}>{lineName(l)}</option>)}
            </select>
          </label>
        )}
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts" autoFocus />
          <Button variant="outline" className="shrink-0 gap-1" onClick={() => setAdding(true)} disabled={!lineId}>
            <UserPlus className="h-4 w-4" /> New number
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {rows === null ? <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-muted-foreground" />
            : list.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">No contacts{s ? " match" : " yet"} — use New number to add one.</p>
            : list.map((r) => (
              <button key={r.id} onClick={() => lineId && onPick(r.id, lineId)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-muted">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[r.phone_e164, r.yacht?.vessel_name].filter(Boolean).join(" · ")}</span>
                </span>
                <ConsentChip c={r} />
              </button>
            ))}
        </div>
      </DialogContent>
      {adding && (
        <ContactDialog draft={{ phone: /^[+ds()-]{7,}$/.test(q.trim()) ? q.trim() : "", name: "", email: "", notes: "" }}
          onClose={() => setAdding(false)}
          onSave={async (d) => {
            const id = await saveContact(lineId, d, true);
            if (id) { setAdding(false); onPick(id, lineId); }
          }} allowOpen={false} />
      )}
    </Dialog>
  );
}

// ─── Saving contacts ─────────────────────────────────────────────────────────

/** The add / edit contact form: an existing contact (contactId) or a number to save. */
type ContactDraft = { contactId?: string; phone: string; name: string; email: string; notes: string };

/** The note Polaris writes on a contact it made when an unknown number messaged in. */
const AUTO_NOTE = /^Created when they first messaged /;

/** Made automatically (just the number, or their WhatsApp profile name) and never saved by a person. */
function isUnsaved(c: Pick<WaContact, "name" | "phone_e164" | "notes">) {
  return !c.name || c.name === c.phone_e164 || /^[+ds()-]+$/.test(c.name) || AUTO_NOTE.test(c.notes ?? "");
}

function draftFor(c: WaContact): ContactDraft {
  return {
    contactId: c.id, phone: c.phone_e164 ?? "",
    name: /^[+ds()-]+$/.test(c.name ?? "") ? "" : c.name ?? "",
    email: c.email ?? "", notes: AUTO_NOTE.test(c.notes ?? "") ? "" : c.notes ?? "",
  };
}

function draftFromCard(card: SharedContact): ContactDraft {
  const p = card.phones?.find((x) => x.wa_id) ?? card.phones?.[0];
  return {
    phone: p?.wa_id ? `+${p.wa_id}` : p?.phone ?? "",
    name: card.name?.formatted_name ?? [card.name?.first_name, card.name?.last_name].filter(Boolean).join(" "),
    email: "", notes: "",
  };
}

/** Saves through the server (line-only staff can't write contacts directly). Returns the contact's id. */
async function saveContact(lineId: string, d: ContactDraft, open: boolean): Promise<string | null> {
  if (!d.name.trim()) { toast.error("Give the contact a name."); return null; }
  try {
    const r = await waApi<{ contactId: string; existed?: boolean }>("contacts/save", d.contactId
      ? { lineId, contactId: d.contactId, name: d.name, email: d.email, notes: d.notes }
      : { lineId, phone: d.phone, name: d.name, open });
    toast.success(d.contactId ? "Contact saved" : r.existed ? `${d.name} was already in contacts — opened` : `${d.name} added to contacts`);
    return r.contactId;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't save the contact");
    return null;
  }
}

/** Contact cards a client shared: who, their number, and Save / Message. */
function SharedContacts({ cards, canEdit, onSave, onMessage }: {
  cards: SharedContact[]; canEdit: boolean; onSave: (d: ContactDraft) => void; onMessage: (d: ContactDraft) => void;
}) {
  return (
    <div className="space-y-1.5">
      {cards.map((card, i) => {
        const d = draftFromCard(card);
        return (
          <div key={i} className="min-w-[220px] rounded-lg border border-border bg-background/60 p-2">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted"><ContactIcon className="h-4 w-4 text-muted-foreground" /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{d.name || "Contact"}</p>
                <p className="truncate text-xs text-muted-foreground">{(card.phones ?? []).map((p) => p.phone ?? p.wa_id).filter(Boolean).join(", ") || "No number"}</p>
              </div>
            </div>
            {canEdit && d.phone && (
              <div className="mt-2 flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 flex-1 gap-1 text-xs" onClick={() => onSave(d)}>
                  <UserPlus className="h-3.5 w-3.5" /> Save
                </Button>
                <Button size="sm" variant="outline" className="h-7 flex-1 gap-1 text-xs" onClick={() => onMessage(d)}>
                  <MessageSquarePlus className="h-3.5 w-3.5" /> Message
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Add someone to contacts, or edit a contact's name, email and notes. */
function ContactDialog({ draft, onClose, onSave, allowOpen = true }: {
  draft: ContactDraft; onClose: () => void; onSave: (d: ContactDraft, open: boolean) => Promise<void>; allowOpen?: boolean;
}) {
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const existing = !!draft.contactId;
  const go = async (open: boolean) => { setBusy(true); try { await onSave(d, open); } finally { setBusy(false); } };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit contact" : "Add to contacts"}</DialogTitle>
          <DialogDescription>
            Saving someone doesn't sign them up for messages. To message them first you still need an approved template and their agreement — or they message you.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void go(false); }}>
          <label className="block space-y-1 text-xs text-muted-foreground">
            Name
            <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} autoFocus placeholder="e.g. Gerry Julia" />
          </label>
          <label className="block space-y-1 text-xs text-muted-foreground">
            WhatsApp number
            <Input value={d.phone} disabled={existing} onChange={(e) => setD({ ...d, phone: e.target.value })} placeholder="+971 50 123 4567" />
          </label>
          {existing && (
            <>
              <label className="block space-y-1 text-xs text-muted-foreground">
                Email <span className="opacity-70">(optional)</span>
                <Input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
              </label>
              <label className="block space-y-1 text-xs text-muted-foreground">
                Notes <span className="opacity-70">(optional)</span>
                <Textarea rows={3} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="e.g. Intermediate + Advanced course, certificate pending" />
              </label>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            {!existing && allowOpen && (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void go(true)}>Save &amp; message</Button>
            )}
            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtLeft(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function shortTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

