/**
 * Live Chat — staff side of the Client Portal chat.
 * Conversation list + thread with a claim ("Handled by …") so two staff members
 * don't both reply to the same client. First staff reply auto-claims.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const db = supabase as any;

type StaffChat = {
  id: string; captain_account_id: string; yacht_id: string;
  claimed_by: string | null; claimed_by_name: string | null;
  last_message_at: string | null; last_sender_role: string | null;
  portal_unread: number; staff_unread: number;
  captain_accounts?: { display_name: string | null; email: string | null; position: string | null; yachts?: { vessel_name: string } | null } | null;
};
type ChatMsg = { id: string; sender_name: string | null; sender_role: string; body: string; created_at: string };

const fmt = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function staffDisplayName(email: string | null | undefined): string {
  if (!email) return "JLS Yachts";
  const local = email.split("@")[0];
  return local.split(/[._-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

export function StaffChatsPanel() {
  const { user } = useAuth();
  const [chats, setChats] = useState<StaffChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await db.from("portal_chats")
      .select("*, captain_accounts(display_name, email, position, yachts(vessel_name))")
      .order("last_message_at", { ascending: false, nullsFirst: false });
    setChats(data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  const open = chats.find((c) => c.id === openId) ?? null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
        <div>
          <div className="label-caps">Client Portal</div>
          <h1 className="font-display text-xl font-bold">Live Chat</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Two-way chat with portal users. The <span className="text-foreground/80">Handled by</span> tag shows who has the
            conversation — check it before replying so two people never answer the same client.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setStartOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Start chat
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[360px_1fr]">
        {/* Conversation list */}
        <div className="overflow-y-auto border-r border-border/60">
          {loading ? (
            <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : chats.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No conversations yet. Start one, or wait for a portal user to say hello.
            </div>
          ) : (
            chats.map((c) => (
              <button key={c.id} onClick={() => setOpenId(c.id)}
                      className={cn(
                        "flex w-full flex-col gap-1 border-b border-border/40 px-4 py-3 text-left transition hover:bg-accent/30",
                        openId === c.id && "bg-accent/40",
                      )}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">
                    {c.captain_accounts?.yachts?.vessel_name ?? "—"} · {c.captain_accounts?.display_name ?? c.captain_accounts?.email ?? "Portal user"}
                  </span>
                  {c.staff_unread > 0 && (
                    <span className="flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {c.staff_unread > 9 ? "9+" : c.staff_unread}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{c.last_message_at ? fmt(c.last_message_at) : "no messages"}</span>
                  {c.claimed_by_name ? (
                    <span className={cn(
                      "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                      c.claimed_by === user?.id
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-300",
                    )}>
                      Handled by {c.claimed_by === user?.id ? "you" : c.claimed_by_name}
                    </span>
                  ) : (
                    <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px]">Unclaimed</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Thread */}
        <div className="min-h-0 overflow-hidden">
          {open ? (
            <StaffChatThread chat={open} onChanged={load} />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
              Select a conversation on the left.
            </div>
          )}
        </div>
      </div>

      {startOpen && (
        <StartChatDialog existing={chats} onClose={() => setStartOpen(false)}
                         onStarted={(id) => { setStartOpen(false); setOpenId(id); void load(); }} />
      )}
    </div>
  );
}

function StaffChatThread({ chat, onChanged }: { chat: StaffChat; onChanged: () => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const myName = staffDisplayName(user?.email);
  const claimedByOther = Boolean(chat.claimed_by && chat.claimed_by !== user?.id);

  const load = useCallback(async () => {
    const { data } = await db.from("portal_chat_messages")
      .select("id, sender_name, sender_role, body, created_at")
      .eq("chat_id", chat.id).order("created_at").limit(500);
    setMessages(data ?? []);
  }, [chat.id]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  // Opening the thread clears the staff unread counter.
  useEffect(() => {
    if (chat.staff_unread > 0) {
      void db.from("portal_chats").update({ staff_unread: 0 }).eq("id", chat.id).then(() => onChanged());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id, chat.staff_unread, messages.length]);

  const claim = async () => {
    await db.from("portal_chats").update({
      claimed_by: user?.id, claimed_by_name: myName, claimed_at: new Date().toISOString(),
    }).eq("id", chat.id);
    onChanged();
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      // First staff reply auto-claims the conversation.
      if (!chat.claimed_by) await claim();
      await db.from("portal_chat_messages").insert({
        chat_id: chat.id, sender_user_id: user?.id, sender_name: myName,
        sender_role: "staff", body,
      });
      setDraft("");
      await load();
      onChanged();
    } finally { setSending(false); }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div>
          <div className="text-sm font-semibold">
            {chat.captain_accounts?.yachts?.vessel_name ?? "—"} · {chat.captain_accounts?.display_name ?? chat.captain_accounts?.email ?? "Portal user"}
          </div>
          <div className="text-[11px] text-muted-foreground">{chat.captain_accounts?.email ?? ""}</div>
        </div>
        {chat.claimed_by ? (
          <span className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            claimedByOther
              ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
          )}>
            {claimedByOther ? `${chat.claimed_by_name} is handling this chat` : "You are handling this chat"}
          </span>
        ) : (
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => void claim()}>
            Join chat
          </Button>
        )}
      </div>

      {claimedByOther && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
          ⚠ {chat.claimed_by_name} started / is handling this conversation — coordinate before replying so the client is
          never answered twice.
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
        {messages.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.sender_role === "staff" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[75%] rounded-xl px-3 py-2 text-sm",
              m.sender_role === "staff" ? "bg-primary/15" : "border border-border bg-background/50",
            )}>
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {m.sender_name ?? (m.sender_role === "staff" ? "Staff" : "Portal user")} · {fmt(m.created_at)}
              </div>
              <div className="whitespace-pre-wrap">{m.body}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-end gap-2 border-t border-border/60 p-3">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
                  placeholder="Reply to the client…"
                  className="w-full resize-none rounded-lg border border-border bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary/50"
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(); }} />
        <Button size="sm" className="gap-1.5" disabled={sending || !draft.trim()} onClick={() => void send()}>
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send
        </Button>
      </div>
    </div>
  );
}

function StartChatDialog({ existing, onClose, onStarted }: {
  existing: StaffChat[]; onClose: () => void; onStarted: (chatId: string) => void;
}) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    db.from("captain_accounts")
      .select("id, display_name, email, yacht_id, active, user_id, yachts(vessel_name)")
      .eq("active", true).not("user_id", "is", null)
      .then(({ data }: any) => setAccounts(data ?? []));
  }, []);

  const start = async () => {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    setBusy(true);
    try {
      const already = existing.find((c) => c.captain_account_id === acc.id);
      if (already) { onStarted(already.id); return; }
      const { data: created, error } = await db.from("portal_chats").insert({
        captain_account_id: acc.id, yacht_id: acc.yacht_id,
        claimed_by: user?.id, claimed_by_name: staffDisplayName(user?.email),
        claimed_at: new Date().toISOString(),
      }).select("id").single();
      if (error || !created) { toast.error(error?.message ?? "Could not start the chat"); return; }
      onStarted(created.id);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5">
        <h3 className="font-semibold">Start a chat</h3>
        <p className="text-xs text-muted-foreground">
          Starting a chat claims it under your name — the portal user sees who they're talking to, and colleagues see
          you're handling it.
        </p>
        <select className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary/50"
                value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Choose a portal user…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {(a.yachts?.vessel_name ?? "—")} — {a.display_name ?? a.email}
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy || !accountId} onClick={() => void start()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Start chat
          </Button>
        </div>
      </div>
    </div>
  );
}
