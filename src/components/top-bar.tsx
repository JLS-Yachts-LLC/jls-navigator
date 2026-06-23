import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Search, LogOut, Settings, UserCircle2, Ship, Loader2, ChevronDown, X, Sun, Moon, Users, Eye, Check, ShieldCheck,
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useViewAsRole, setViewAsRole, useCanImpersonate, VIEW_AS_OPTIONS, ROLE_LABEL } from "@/lib/view-as";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";
import { NotificationBell } from "@/components/notifications/NotificationBell";

type SearchResult = {
  kind: "yacht" | "crew";
  id: string;
  label: string;
  sub: string;
  to: string;
};

function nameFromEmail(email?: string | null): string {
  return (email ?? "User").split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type OnlineUser = { id: string; name: string; email: string };

// Live "who's online" via Supabase Realtime presence. Each client broadcasts its
// identity to a shared channel; the count + names update in real time.
function OnlineUsers() {
  const { user } = useAuth();
  const [online, setOnline] = useState<OnlineUser[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel("presence:online-users", {
      config: { presence: { key: user.id } },
    });
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState() as Record<string, Array<{ name?: string; email?: string }>>;
      const users = Object.entries(state).map(([id, metas]) => ({
        id,
        name: metas[0]?.name ?? nameFromEmail(metas[0]?.email),
        email: metas[0]?.email ?? "",
      }));
      users.sort((a, b) => a.name.localeCompare(b.name));
      setOnline(users);
    });
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ name: nameFromEmail(user.email), email: user.email ?? "", online_at: new Date().toISOString() });
      }
    });
    return () => { void supabase.removeChannel(channel); };
  }, [user?.id, user?.email]);

  const count = online.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-9 items-center gap-1.5 rounded-lg px-2 text-muted-foreground hover:bg-accent hover:text-foreground transition"
          title={`${count} user${count !== 1 ? "s" : ""} online`}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <Users className="h-[18px] w-[18px]" />
          <span className="text-xs font-semibold tabular-nums">{count}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Online now</span>
          <span className="text-xs font-normal text-muted-foreground">{count}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {online.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">No one online</div>
        ) : (
          <div className="max-h-72 overflow-auto py-1">
            {online.map((u) => (
              <div key={u.id} className="flex items-center gap-2.5 px-2 py-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {u.name}{u.id === user?.id && <span className="ml-1 text-[10px] font-normal text-muted-foreground">(you)</span>}
                  </div>
                  {u.email && <div className="truncate text-[11px] text-muted-foreground">{u.email}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Admin-only "View as" control — preview the app as a client/crew role.
function ViewAsSwitcher() {
  const canImpersonate = useCanImpersonate();
  const viewAs = useViewAsRole();
  if (!canImpersonate) return null;
  const active = !!viewAs;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm transition",
            active
              ? "bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          title="Preview the app as a client"
        >
          <Eye className="h-[17px] w-[17px]" />
          <span className="hidden text-xs font-semibold md:inline">{active ? ROLE_LABEL[viewAs] ?? "Client" : "View as"}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Impersonate view</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setViewAsRole(null)} className="gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="flex-1">Admin (full access)</span>
          {!active && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {VIEW_AS_OPTIONS.map((o) => (
          <DropdownMenuItem key={o.role} onClick={() => setViewAsRole(o.role)} className="gap-2">
            <UserCircle2 className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">{o.label}</span>
            {viewAs === o.role && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBar() {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const canSeeOnline = useCanImpersonate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [openResults, setOpenResults] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const displayName = (user?.email ?? "User")
    .split("@")[0]
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const initials = (user?.email ?? "U").slice(0, 2).toUpperCase();

  // Debounced global search across yachts + crew
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); setOpenResults(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const db = supabase as any;
      const term = q.trim();
      // Crew: match EVERY token against full_name (covers middle names, any order).
      let crewQuery = db.from("crew_members").select("id, first_name, last_name, rank");
      for (const tok of term.split(/\s+/)) crewQuery = crewQuery.ilike("full_name", `%${tok}%`);
      const [yRes, cRes] = await Promise.all([
        db.from("yachts").select("id, vessel_name, vessel_type").ilike("vessel_name", `%${term}%`).limit(6),
        crewQuery.limit(6),
      ]);
      const out: SearchResult[] = [];
      (yRes.data ?? []).forEach((y: any) => out.push({
        kind: "yacht", id: y.id, label: y.vessel_name, sub: y.vessel_type || "Vessel", to: `/yachts/${y.id}`,
      }));
      (cRes.data ?? []).forEach((c: any) => out.push({
        kind: "crew", id: c.id, label: `${c.first_name} ${c.last_name}`, sub: c.rank || "Crew", to: `/crew-immigration/crew`,
      }));
      setResults(out);
      setOpenResults(true);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Close results on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpenResults(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-5">
      {/* Global search */}
      <div ref={boxRef} className="relative w-full max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/70" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpenResults(true)}
          placeholder="Search for crew, vessel, document…"
          className="h-9 w-full rounded-lg border border-primary/30 bg-muted/40 pl-9 pr-9 text-sm placeholder:text-muted-foreground/70 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 hover:border-primary/50 transition"
        />
        {q && (
          <button onClick={() => { setQ(""); setOpenResults(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground">
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          </button>
        )}

        {/* Results dropdown */}
        {openResults && (
          <div className="absolute left-0 right-0 top-11 z-50 max-h-96 overflow-auto rounded-xl border border-border bg-popover shadow-lg">
            {results.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                {searching ? "Searching…" : `No matches for "${q}"`}
              </div>
            ) : (
              <div className="py-1.5">
                {results.map((r) => (
                  <Link
                    key={`${r.kind}-${r.id}`}
                    to={r.to as any}
                    onClick={() => { setOpenResults(false); setQ(""); }}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-accent transition-colors"
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${r.kind === "yacht" ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-500"}`}>
                      {r.kind === "yacht" ? <Ship className="h-4 w-4" /> : <UserCircle2 className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{r.label}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.sub}</div>
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground/50">{r.kind}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {/* View-as / client preview (admin only) */}
        <ViewAsSwitcher />

        {/* Online users (live presence) — admins/developers only */}
        {canSeeOnline && <OnlineUsers />}

        {/* Report a bug / suggest a feature */}
        <FeedbackWidget />

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition"
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </button>

        {/* Notifications */}
        <NotificationBell />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 rounded-lg py-1 pl-1.5 pr-2 hover:bg-accent transition">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary ring-1 ring-primary/20">
                {initials}
              </div>
              <div className="hidden text-left sm:block">
                <div className="text-[12.5px] font-semibold leading-tight text-foreground">{displayName}</div>
                <div className="text-[10.5px] leading-tight text-muted-foreground">{user?.email}</div>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="text-sm font-medium">{displayName}</div>
              <div className="text-xs text-muted-foreground font-normal">{user?.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
              <Settings className="mr-2 h-4 w-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
