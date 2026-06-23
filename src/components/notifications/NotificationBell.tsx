import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Notification = {
  id: string;
  type: string;
  urgency: "info" | "warning" | "danger";
  title: string;
  body: string;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

const DOT: Record<string, string> = {
  info: "bg-sky-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
};

function relTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const unread = items.filter((n) => !n.read_at).length;

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await (supabase as any)
      .from("notifications")
      .select("id, type, urgency, title, body, action_url, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data ?? []) as Notification[]);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  // Live updates — fires when the table is in the realtime publication; harmless
  // (just no live push) if it isn't, since we also refetch on open.
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`notifications:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user?.id, load]);

  async function markRead(ids: string[]) {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: now } : n)));
    await (supabase as any).from("notifications").update({ read_at: now }).in("id", ids);
  }

  function open(n: Notification) {
    if (!n.read_at) void markRead([n.id]);
    if (n.action_url) navigate({ to: n.action_url as any }).catch(() => {});
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition"
          title="Notifications"
          onClick={() => void load()}
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button
              onClick={() => void markRead(items.filter((n) => !n.read_at).map((n) => n.id))}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Check className="h-3 w-3" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-auto">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">You're all caught up.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => open(n)}
                className={cn(
                  "flex w-full gap-2.5 border-b border-border/50 px-3 py-2.5 text-left transition last:border-0 hover:bg-accent",
                  !n.read_at && "bg-primary/[0.04]",
                )}
              >
                <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : DOT[n.urgency] ?? "bg-sky-500")} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-[12.5px]", n.read_at ? "font-medium text-foreground/80" : "font-semibold text-foreground")}>{n.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{relTime(n.created_at)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[11px] text-muted-foreground">{n.body}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
