/**
 * Client Requests — staff triage for Captain's Portal requests.
 * List + filter incoming captain requests, update status, reply into the
 * request thread (visible to the captain), and manage the portal Directory
 * (click-to-call numbers shown to captains).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Phone, Plus, RefreshCw, Save, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { REQUEST_CATEGORIES, REQUEST_STATUS_STYLE } from "./captain-portal";
import { StaffChatsPanel } from "./staff-chat";

const db = supabase as any;

type Row = {
  id: string; reference: string | null; yacht_id: string; category: string;
  title: string; details: string | null; priority: string; status: string;
  needed_by: string | null; created_at: string; updated_at: string;
  yachts?: { vessel_name: string } | null;
};
type Msg = {
  id: string; sender_name: string | null; sender_role: string; body: string; created_at: string;
};
type Dir = {
  id: string; department: string; contact_name: string | null; phone: string | null;
  email: string | null; notes: string | null; sort_order: number; active: boolean;
};

const STATUSES = ["new", "acknowledged", "in_progress", "completed", "cancelled"];
const statusLabel = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const fmt = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function ClientRequestsPage() {
  const [mode, setMode] = useState<"requests" | "chats">("requests");
  const [chatUnread, setChatUnread] = useState(0);

  // Unread chat badge for the mode switcher (refreshed on mount + every 30s).
  useEffect(() => {
    const tick = async () => {
      const { data } = await db.from("portal_chats").select("staff_unread");
      setChatUnread((data ?? []).reduce((s: number, c: any) => s + (c.staff_unread ?? 0), 0));
    };
    void tick();
    const t = setInterval(() => void tick(), 30000);
    return () => clearInterval(t);
  }, [mode]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border/60 bg-card/30 px-4">
        {([["requests", "Requests"], ["chats", "Live Chat"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setMode(key)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
                    mode === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}>
            {label}
            {key === "chats" && chatUnread > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {chatUnread > 9 ? "9+" : chatUnread}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {mode === "requests" ? <RequestsPanel /> : <StaffChatsPanel />}
      </div>
    </div>
  );
}

function RequestsPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showDirectory, setShowDirectory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await db.from("captain_requests")
      .select("*, yachts(vessel_name)")
      .order("created_at", { ascending: false });
    setRows(data ?? []); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return rows;
    if (statusFilter === "open") return rows.filter((r) => !["completed", "cancelled"].includes(r.status));
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  const counts = useMemo(() => {
    const open = rows.filter((r) => !["completed", "cancelled"].includes(r.status)).length;
    return { open, all: rows.length };
  }, [rows]);

  const setStatus = async (id: string, status: string) => {
    await db.from("captain_requests").update({ status }).eq("id", id);
    void load();
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
        <div>
          <div className="label-caps">Client Portal</div>
          <h1 className="font-display text-xl font-bold">Client Requests</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowDirectory((s) => !s)}>
            <Phone className="h-3.5 w-3.5" /> {showDirectory ? "Hide directory" : "Edit directory"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </header>

      {showDirectory && <DirectoryEditor />}

      <div className="flex flex-wrap items-center gap-1.5 px-6 py-3">
        {[
          { key: "open", label: `Open (${counts.open})` },
          { key: "all", label: `All (${counts.all})` },
          ...STATUSES.map((s) => ({ key: s, label: statusLabel(s) })),
        ].map((f) => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
                  className={cn("rounded-full border px-3 py-1 text-xs font-medium transition",
                                statusFilter === f.key
                                  ? "border-primary/50 bg-primary/15 text-foreground"
                                  : "border-border text-muted-foreground hover:text-foreground")}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            No requests {statusFilter === "open" ? "open" : "here"} right now.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ref</th><th>Yacht</th><th>Category</th><th>Title</th>
                  <th>Priority</th><th>Needed by</th><th>Raised</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const cat = REQUEST_CATEGORIES.find((c) => c.key === r.category);
                  return (
                    <tr key={r.id} className="cursor-pointer" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                      <td className="font-medium tabular-nums">{r.reference}</td>
                      <td className="font-medium">{r.yachts?.vessel_name ?? "—"}</td>
                      <td className="text-foreground/75">{cat?.label ?? r.category}</td>
                      <td className="max-w-[280px] truncate text-foreground/85">{r.title}</td>
                      <td className={cn("text-foreground/75", r.priority === "urgent" && "font-semibold text-red-300", r.priority === "high" && "text-amber-300")}>{r.priority}</td>
                      <td className="tabular-nums text-foreground/60">{r.needed_by ?? "—"}</td>
                      <td className="tabular-nums text-foreground/60">{fmt(r.created_at)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select value={r.status} onChange={(e) => void setStatus(r.id, e.target.value)}
                                className={cn("rounded-full border bg-transparent px-2 py-1 text-[11px] font-semibold uppercase",
                                              REQUEST_STATUS_STYLE[r.status] ?? "")}>
                          {STATUSES.map((s) => <option key={s} value={s} className="bg-card text-foreground">{statusLabel(s)}</option>)}
                        </select>
                      </td>
                      <td className="text-right text-xs text-primary">{openId === r.id ? "Close" : "Thread"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {openId && <Thread requestId={openId} staffName={user?.email ?? "JLS Yachts"} />}
      </div>
    </div>
  );
}

function Thread({ requestId, staffName }: { requestId: string; staffName: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const { data } = await db.from("captain_request_messages")
      .select("id, sender_name, sender_role, body, created_at")
      .eq("request_id", requestId).order("created_at");
    setMessages(data ?? []);
  }, [requestId]);
  useEffect(() => { void load(); }, [load]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    await db.from("captain_request_messages").insert({
      request_id: requestId, sender_user_id: user?.id,
      sender_name: staffName, sender_role: "staff", body,
    });
    setSending(false); setDraft(""); void load();
  };

  return (
    <div className="mt-4 rounded-xl border border-border bg-card p-4">
      <div className="label-caps mb-3">Conversation with the captain</div>
      <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
        {messages.length === 0 && <p className="py-2 text-xs text-muted-foreground">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.sender_role === "staff" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[70%] rounded-xl px-3 py-2 text-sm",
                               m.sender_role === "staff" ? "bg-primary/15" : "border border-border bg-background/50")}>
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {m.sender_role === "staff" ? (m.sender_name ?? "Staff") : `Captain${m.sender_name ? ` — ${m.sender_name}` : ""}`} · {fmt(m.created_at)}
              </div>
              <div className="whitespace-pre-wrap">{m.body}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-end gap-2 border-t border-border/60 pt-3">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
                  placeholder="Reply to the captain…"
                  className="w-full resize-none rounded-lg border border-border bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary/50" />
        <Button size="sm" className="gap-1.5" disabled={sending || !draft.trim()} onClick={() => void send()}>
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send
        </Button>
      </div>
    </div>
  );
}

function DirectoryEditor() {
  const [rows, setRows] = useState<Dir[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await db.from("portal_directory").select("*").order("sort_order");
    setRows(data ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const patch = (id: string, p: Partial<Dir>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const save = async (r: Dir) => {
    setSaving(r.id);
    await db.from("portal_directory").update({
      department: r.department, contact_name: r.contact_name, phone: r.phone,
      email: r.email, notes: r.notes, sort_order: r.sort_order, active: r.active,
    }).eq("id", r.id);
    setSaving(null);
  };

  const add = async () => {
    await db.from("portal_directory").insert({ department: "New department", sort_order: 999 });
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this directory entry?")) return;
    await db.from("portal_directory").delete().eq("id", id);
    void load();
  };

  const cell = "w-full rounded-md border border-border bg-background/40 px-2 py-1.5 text-xs outline-none focus:border-primary/50";

  return (
    <div className="border-b border-border/60 bg-card/40 px-6 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="label-caps">Portal directory (shown to captains — click-to-call)</div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void add()}>
          <Plus className="h-3.5 w-3.5" /> Add entry
        </Button>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-2 items-center gap-2 md:grid-cols-[1.4fr_1fr_1fr_1.4fr_1.4fr_60px_auto]">
            <input className={cell} value={r.department} onChange={(e) => patch(r.id, { department: e.target.value })} placeholder="Department" />
            <input className={cell} value={r.contact_name ?? ""} onChange={(e) => patch(r.id, { contact_name: e.target.value })} placeholder="Contact name" />
            <input className={cell} value={r.phone ?? ""} onChange={(e) => patch(r.id, { phone: e.target.value })} placeholder="+971 …" />
            <input className={cell} value={r.email ?? ""} onChange={(e) => patch(r.id, { email: e.target.value })} placeholder="email@jlsyachts.com" />
            <input className={cell} value={r.notes ?? ""} onChange={(e) => patch(r.id, { notes: e.target.value })} placeholder="Notes (hours, scope…)" />
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={r.active} onChange={(e) => patch(r.id, { active: e.target.checked })} /> live
            </label>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" disabled={saving === r.id} onClick={() => void save(r)}>
                {saving === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive" onClick={() => void remove(r.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
