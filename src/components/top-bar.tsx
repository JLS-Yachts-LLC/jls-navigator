import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Search, Bell, LogOut, Settings, UserCircle2, Ship, Loader2, ChevronDown, X, Sun, Moon,
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SearchResult = {
  kind: "yacht" | "crew";
  id: string;
  label: string;
  sub: string;
  to: string;
};

export function TopBar() {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
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
      const [yRes, cRes] = await Promise.all([
        db.from("yachts").select("id, vessel_name, vessel_type").ilike("vessel_name", `%${q.trim()}%`).limit(6),
        db.from("crew_members").select("id, first_name, last_name, rank").or(`first_name.ilike.%${q.trim()}%,last_name.ilike.%${q.trim()}%`).limit(6),
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
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpenResults(true)}
          placeholder="Search for crew, vessel, document…"
          className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-9 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition"
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
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition"
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </button>

        {/* Notifications */}
        <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition" title="Notifications">
          <Bell className="h-[18px] w-[18px]" />
        </button>

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
