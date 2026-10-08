/**
 * Inbox — every WhatsApp conversation with a client, in one shared place.
 *
 * A thread merges what they sent (wa_inbound) with what we sent them
 * (wa_messages: broadcasts, replies and one-off templates). Inside WhatsApp's
 * 24-hour window staff reply in free text; outside it the composer switches to
 * an approved template, which also needs the client's consent.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Search, Send, Loader2, Check, CheckCheck, AlertCircle, Clock, Paperclip, Reply, X, Lock, MessageSquarePlus,
  CircleCheck, RotateCcw, UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { windowRemaining, placeholderCount, dynamicUrlButtons, personalise, placeholderContext, recipientOf } from "@/lib/whatsapp/shared";
import { TokenScope, TokenBar, TokenInput } from "./wa-tokens";
import { WaTemplatePreview, templateBlocker } from "./wa-templates";
import { db, waApi, waBlobUrl, ConsentChip, Chip, Empty, type WaContact, type WaTemplate } from "./wa-common";

interface Conversation {
  id: string;
  contact_id: string;
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
}

type Filter = "open" | "mine" | "unassigned" | "closed";
const POLL_MS = 15_000;

export function WaInbox({ canEdit }: { canEdit: boolean }) {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [staff, setStaff] = useState<Array<{ id: string; display_name: string | null }>>([]);
  const [starting, setStarting] = useState(false);

  const loadConvs = useCallback(async () => {
    const { data, error } = await db().from("wa_conversations")
      .select("*, contact:wa_contacts(id, name, email, phone_e164, phone_confirmed, consent_status, consent_updates, consent_marketing, yacht:yachts(vessel_name))")
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

  const counts = useMemo(() => ({
    open: convs.filter((c) => c.status === "open").length,
    mine: convs.filter((c) => c.status === "open" && c.assigned_to === me).length,
    unassigned: convs.filter((c) => c.status === "open" && !c.assigned_to).length,
    closed: convs.filter((c) => c.status === "closed").length,
    unread: convs.reduce((n, c) => n + (c.unread_count || 0), 0),
  }), [convs, me]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return convs.filter((c) => {
      if (filter === "closed" ? c.status !== "closed" : c.status !== "open") return false;
      if (filter === "mine" && c.assigned_to !== me) return false;
      if (filter === "unassigned" && c.assigned_to) return false;
      return !s || [c.contact?.name, c.contact?.phone_e164, c.contact?.yacht?.vessel_name, c.last_preview]
        .some((v) => (v ?? "").toLowerCase().includes(s));
    });
  }, [convs, filter, q, me]);

  const active = convs.find((c) => c.contact_id === activeId) ?? null;
  const staffName = (id: string | null | undefined) => staff.find((s) => s.id === id)?.display_name ?? null;

  return (
    <div className="grid h-[calc(100vh-15rem)] min-h-[520px] grid-cols-1 overflow-hidden rounded-xl border border-border md:grid-cols-[320px_1fr]">
      {/* ── Conversation list ── */}
      <aside className={cn("flex min-h-0 flex-col border-r border-border", activeId && "hidden md:flex")}>
        <div className="space-y-2 border-b border-border p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" className="h-8 pl-8" />
            </div>
            {canEdit && (
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
              <button key={c.id} onClick={() => setActiveId(c.contact_id)}
                className={cn("flex w-full gap-2 border-b border-border/60 px-3 py-2.5 text-left hover:bg-muted/50",
                  activeId === c.contact_id && "bg-muted")}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("truncate text-sm", c.unread_count > 0 ? "font-semibold" : "font-medium")}>{c.contact?.name}</span>
                    {open && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title="Reply window open" />}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.last_direction === "out" && "You: "}{c.last_preview ?? ""}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground/80">
                    {[c.contact?.yacht?.vessel_name, staffName(c.assigned_to) ? `→ ${staffName(c.assigned_to)}` : null].filter(Boolean).join(" · ")}
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
      <section className={cn("min-h-0", !activeId && "hidden md:block")}>
        {activeId ? (
          <Thread key={activeId} contactId={activeId} conv={active} canEdit={canEdit} staff={staff} me={me}
            onBack={() => setActiveId(null)} onChanged={loadConvs} />
        ) : (
          <div className="grid h-full place-items-center p-6">
            <Empty title={counts.unread ? `${counts.unread} unread message${counts.unread === 1 ? "" : "s"}` : "Choose a conversation"}>
              Replies from clients land here as they arrive.
            </Empty>
          </div>
        )}
      </section>

      {starting && (
        <StartDialog onClose={() => setStarting(false)} onPick={(id) => { setStarting(false); setActiveId(id); }} />
      )}
    </div>
  );
}

// ─── One conversation ─────────────────────────────────────────────────────────

function Thread({ contactId, conv, canEdit, staff, me, onBack, onChanged }: {
  contactId: string; conv: Conversation | null; canEdit: boolean;
  staff: Array<{ id: string; display_name: string | null }>; me: string | null;
  onBack: () => void; onChanged: () => void;
}) {
  const [contact, setContact] = useState<WaContact | null>(conv?.contact ?? null);
  const [items, setItems] = useState<ThreadItem[] | null>(null);
  const [lastInboundAt, setLastInboundAt] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ThreadItem | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [, tick] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  const unread = conv?.unread_count ?? 0;

  const load = useCallback(async () => {
    const [{ data: c }, { data: ins }, { data: outs }] = await Promise.all([
      db().from("wa_contacts").select("*, yacht:yachts(vessel_name)").eq("id", contactId).maybeSingle(),
      db().from("wa_inbound").select("id, wa_message_id, type, body, action, media_id, media_mime, context_wamid, received_at")
        .eq("contact_id", contactId).order("received_at", { ascending: false }).limit(300),
      db().from("wa_messages").select("id, kind, auto_reply, body, status, error_message, sent_by, wa_message_id, queued_at, sent_at, campaign:wa_campaigns(name)")
        .eq("contact_id", contactId).neq("status", "skipped").order("queued_at", { ascending: false }).limit(300),
    ]);
    setContact(c as WaContact);
    const merged: ThreadItem[] = [
      ...((ins ?? []) as any[]).map((m): ThreadItem => ({
        key: `i${m.id}`, dir: "in", at: m.received_at, body: m.body, inboundId: m.id, type: m.type,
        hasMedia: !!m.media_id, mediaMime: m.media_mime, action: m.action, contextWamid: m.context_wamid, wamid: m.wa_message_id,
      })),
      ...((outs ?? []) as any[]).map((m): ThreadItem => ({
        key: `o${m.id}`, dir: "out", at: m.sent_at ?? m.queued_at, body: m.body, kind: m.kind, auto: !!m.auto_reply, status: m.status,
        error: m.error_message, sentBy: m.sent_by, campaignName: m.campaign?.name ?? null, wamid: m.wa_message_id,
      })),
    ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    setItems(merged);
    setLastInboundAt(((ins ?? []) as any[])[0]?.received_at ?? null);
  }, [contactId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, POLL_MS);
    const clock = setInterval(() => tick((n) => n + 1), 60_000);
    return () => { clearInterval(t); clearInterval(clock); };
  }, [load]);

  // Reading the thread clears unread (and gives the client blue ticks).
  useEffect(() => {
    if (unread > 0) void waApi("conversations/read", { contactId }).then(onChanged).catch(() => {});
  }, [unread, contactId, onChanged]);

  useEffect(() => {
    if (items && items.length !== lastCount.current) {
      lastCount.current = items.length;
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [items]);

  const remaining = windowRemaining(lastInboundAt);
  const byWamid = useMemo(() => new Map((items ?? []).filter((i) => i.wamid).map((i) => [i.wamid!, i])), [items]);
  const staffName = (id: string | null | undefined) => staff.find((s) => s.id === id)?.display_name ?? null;

  async function send() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await waApi("reply", { contactId, text: body, replyTo: replyTo?.wamid ?? null });
      setText("");
      setReplyTo(null);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Not sent");
      await load();
    } finally {
      setSending(false);
    }
  }

  async function setConv(patch: Partial<Pick<Conversation, "status" | "assigned_to">>) {
    if (!conv) return;
    const { error } = await db().from("wa_conversations").update(patch).eq("id", conv.id);
    if (error) toast.error(error.message);
    onChanged();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Button size="sm" variant="ghost" className="h-7 px-2 md:hidden" onClick={onBack}>←</Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{contact?.name ?? "…"}</h3>
            {contact && <ConsentChip c={contact} />}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {[contact?.phone_e164, contact?.yacht?.vessel_name].filter(Boolean).join(" · ")}
          </p>
        </div>
        {conv && canEdit && (
          <div className="flex items-center gap-1.5">
            <select value={conv.assigned_to ?? ""} onChange={(e) => void setConv({ assigned_to: e.target.value || null })}
              className="h-7 max-w-[160px] rounded-md border border-border bg-background px-2 text-xs" title="Assign">
              <option value="">Unassigned</option>
              {me && <option value={me}>Me</option>}
              {staff.filter((s) => s.id !== me).map((s) => <option key={s.id} value={s.id}>{s.display_name ?? "—"}</option>)}
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

      {/* Messages */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/20 px-4 py-4">
        {items === null ? (
          <div className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">No messages yet.</p>
        ) : items.map((m, i) => {
          const newDay = i === 0 || new Date(items[i - 1].at).toDateString() !== new Date(m.at).toDateString();
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
                  m.status === "failed" && "bg-red-600/90")}>
                  {m.kind === "campaign" && (
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-75">Broadcast{m.campaignName ? ` · ${m.campaignName}` : ""}</p>
                  )}
                  {m.kind === "template" && <p className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-75">Template</p>}
                  {m.auto && <p className="mb-1 text-[10px] font-medium uppercase tracking-wide opacity-75">Auto-reply</p>}
                  {m.dir === "in" && (m.type === "button" || m.type === "interactive") && (
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-emerald-600">Tapped a button</p>
                  )}
                  {quoted && (
                    <div className={cn("mb-1.5 rounded-md border-l-2 px-2 py-1 text-xs opacity-80",
                      m.dir === "out" ? "border-white/60 bg-white/10" : "border-emerald-500 bg-muted")}>
                      {(quoted.body ?? `[${quoted.type ?? "message"}]`).slice(0, 140)}
                    </div>
                  )}
                  {m.hasMedia && m.inboundId && <MediaLink inboundId={m.inboundId} type={m.type} mime={m.mediaMime} />}
                  {m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    : !m.hasMedia && <p className="italic opacity-70">[{m.type ?? "message"}]</p>}
                  {m.action && (
                    <p className="mt-1 text-[11px] font-medium text-red-500">
                      {m.action === "marketing_opt_out" ? "Opted out of news & offers" : "Opted out of WhatsApp messages"} — recorded automatically
                    </p>
                  )}
                  {m.status === "failed" && m.error && <p className="mt-1 text-[11px] opacity-90">Not delivered: {m.error}</p>}
                  <div className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px]", m.dir === "out" ? "text-white/75" : "text-muted-foreground")}>
                    {m.dir === "out" && staffName(m.sentBy) && <span>{staffName(m.sentBy)} ·</span>}
                    <span>{new Date(m.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                    {m.dir === "out" && <Ticks s={m.status} />}
                  </div>
                </div>
                {m.dir === "in" && canEdit && remaining > 0 && m.wamid && (
                  <button onClick={() => setReplyTo(m)} title="Reply to this message"
                    className="ml-1 self-center rounded p-1 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100">
                    <Reply className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      {canEdit && contact && (
        remaining > 0 ? (
          <div className="border-t border-border p-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Reply window open for {fmtLeft(remaining)}</span>
              <span>{text.length}/4096</span>
            </div>
            {replyTo && (
              <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-emerald-500 bg-muted px-2 py-1 text-xs">
                <span className="line-clamp-2 flex-1">{replyTo.body ?? `[${replyTo.type}]`}</span>
                <button onClick={() => setReplyTo(null)}><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <Textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 4096))} rows={2}
                placeholder="Type a reply — Enter to send, Shift+Enter for a new line"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                className="min-h-[44px] resize-none" />
              <Button onClick={() => void send()} disabled={sending || !text.trim()} className="h-11 gap-1.5">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
              </Button>
            </div>
          </div>
        ) : (
          <TemplateComposer contact={contact} onSent={async () => { await load(); onChanged(); }} />
        )
      )}
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

function MediaLink({ inboundId, type, mime }: { inboundId: string; type?: string | null; mime?: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isImage = type === "image" || type === "sticker";
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function open() {
    setBusy(true);
    try {
      const u = url ?? await waBlobUrl(`media?inbound=${inboundId}`);
      setUrl(u);
      if (!isImage) window.open(u, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load the file");
    } finally {
      setBusy(false);
    }
  }

  if (isImage && url) return <img src={url} alt="Photo from client" className="mb-1 max-h-72 rounded-lg" />;
  return (
    <button onClick={() => void open()} className="mb-1 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-foreground hover:bg-muted/70">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
      {isImage ? "Show photo" : type === "audio" ? "Play voice note" : type === "video" ? "Play video" : "Open file"}
      {mime && !isImage && <span className="text-muted-foreground">({mime.split("/")[1]?.split(";")[0]})</span>}
    </button>
  );
}

// ─── Outside the window: approved templates only ──────────────────────────────

function TemplateComposer({ contact, onSent }: { contact: WaContact; onSent: () => void }) {
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [tid, setTid] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void db().from("wa_templates").select("*").eq("status", "approved").order("name")
      .then(({ data }: any) => setTemplates(data ?? []));
  }, []);

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
      await waApi("reply", { contactId: contact.id, templateId: t.id, variables: values.slice(0, needed), buttonValues });
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

function StartDialog({ onClose, onPick }: { onClose: () => void; onPick: (contactId: string) => void }) {
  const [rows, setRows] = useState<WaContact[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    void db().from("wa_contacts").select("*, yacht:yachts(vessel_name)").eq("consent_status", "opted_in")
      .not("phone_e164", "is", null).order("name").then(({ data }: any) => setRows(data ?? []));
  }, []);
  const s = q.trim().toLowerCase();
  const list = (rows ?? []).filter((r) => !s || [r.name, r.phone_e164, r.yacht?.vessel_name].some((v) => (v ?? "").toLowerCase().includes(s)));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Message a contact</DialogTitle>
          <DialogDescription>Only contacts who have opted in can be messaged first — and the first message must be an approved template.</DialogDescription>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search opted-in contacts" autoFocus />
        <div className="max-h-80 overflow-y-auto">
          {rows === null ? <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-muted-foreground" />
            : list.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">No opted-in contacts{s ? " match" : " yet"}.</p>
            : list.map((r) => (
              <button key={r.id} onClick={() => onPick(r.id)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-muted">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[r.phone_e164, r.yacht?.vessel_name].filter(Boolean).join(" · ")}</span>
                </span>
                <ConsentChip c={r} />
              </button>
            ))}
        </div>
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

