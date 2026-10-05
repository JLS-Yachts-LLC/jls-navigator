/**
 * Client portal — the small-boat owner's view.
 *
 * Same portal, same login, same MFA as the yacht "My Yacht" app
 * (captain-portal.tsx hands over here once every link on the login is a boat).
 * A boat owner's data is Orbit 2 Managed Boats, which portal logins cannot read
 * directly — it all comes from /api/portal/boats, scoped server-side to the
 * boats on the login and stripped of the office's internal fields.
 *
 * Home (photo, spec and what needs attention), Compliance, Documents, Jobs and
 * Safety kit come from /api/portal/boats/detail (boat-sections.tsx). Requests
 * and Chat are the yacht portal's own screens, pointed at the boat: requests
 * carry boat_id, and each boat's portal account has its own chat thread.
 */
import { useCallback, useEffect, useState } from "react";
import {
  BoatAlertsCard, BoatCompliance, BoatDocuments, BoatJobs, BoatSafetyKit, boatAlerts, type BoatDetail,
} from "@/components/portal/boat-sections";
import {
  NewRequestSheet, PortalChatTab, PreviewContext, RequestsTab, type ChatAccount, type PortalChat,
} from "@/components/portal/captain-portal";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle, ClipboardList, Eye, FileCheck2, Home, LifeBuoy, Loader2, LogOut,
  Menu, MessageSquare, ShieldCheck, Ship, Wrench, X,
} from "lucide-react";
import { PolarisMark } from "@/components/brand/PolarisMark";
import { portalFetch } from "@/lib/portal/portal-fetch";
import { cn } from "@/lib/utils";

type PortalBoat = {
  id: string;
  name: string;
  boatType: string | null;
  photoUrl: string | null;
  spec: {
    hullNumber: string | null;
    hullMaterial: string | null;
    yearOfBuild: number | null;
    lengthM: number | null;
    beamM: number | null;
    maxPassengers: number | null;
    mmsi: string | null;
    imo: string | null;
  };
};

type BoatTab = "home" | "compliance" | "documents" | "jobs" | "safety" | "requests" | "chat";
const NAV: Array<{ key: BoatTab; label: string; icon: any }> = [
  { key: "home", label: "My Boat", icon: Home },
  { key: "compliance", label: "Compliance", icon: ShieldCheck },
  { key: "documents", label: "Documents", icon: FileCheck2 },
  { key: "jobs", label: "Jobs", icon: Wrench },
  { key: "safety", label: "Safety kit", icon: ClipboardList },
  { key: "requests", label: "Requests", icon: LifeBuoy },
  { key: "chat", label: "Chat with JLS", icon: MessageSquare },
];

export function BoatPortal({ displayName, email, previewAccountId, onSignOut }: {
  displayName: string | null;
  email: string;
  /** Set when a staff admin is previewing this owner's portal read-only. */
  previewAccountId: string | null;
  onSignOut: () => void;
}) {
  const [boats, setBoats] = useState<PortalBoat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boatId, setBoatId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [tab, setTab] = useState<BoatTab>("home");
  const [detail, setDetail] = useState<BoatDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [account, setAccount] = useState<ChatAccount | null>(null);
  const [chat, setChat] = useState<PortalChat | null>(null);
  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const [newRequest, setNewRequest] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await portalFetch("/api/portal/boats");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body?.error ?? "Could not load your boats."); setBoats([]); return; }
      const list: PortalBoat[] = body.boats ?? [];
      setBoats(list);
      setBoatId((cur) => (cur && list.some((b) => b.id === cur) ? cur : list[0]?.id ?? null));
    } catch {
      setError("Could not reach JLS Yachts — check your connection and try again.");
      setBoats([]);
    }
  }, [previewAccountId]);

  useEffect(() => { void load(); }, [load]);

  // The selected boat's compliance, documents, jobs and safety kit.
  useEffect(() => {
    if (!boatId) { setDetail(null); return; }
    let alive = true;
    setDetail(null); setDetailError(null);
    void (async () => {
      try {
        const res = await portalFetch(`/api/portal/boats/detail?boat=${encodeURIComponent(boatId)}`);
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) setDetailError(body?.error ?? "Could not load your boat's details.");
        else setDetail(body);
      } catch {
        if (alive) setDetailError("Could not reach JLS Yachts — check your connection and try again.");
      }
    })();
    return () => { alive = false; };
  }, [boatId, previewAccountId]);

  // The portal account for the selected boat — each boat on a login is its own
  // account, and its own chat thread. In preview, the previewed owner's.
  useEffect(() => {
    if (!boatId) { setAccount(null); return; }
    let alive = true;
    void (async () => {
      const db = supabase as any;
      let userId: string | null = null;
      if (previewAccountId) {
        const { data: pa } = await db.from("captain_accounts").select("id, user_id, boat_id").eq("id", previewAccountId).maybeSingle();
        if (!pa?.user_id) { if (alive) setAccount(pa ? { id: pa.id, yacht_id: null, boat_id: pa.boat_id } : null); return; }
        userId = pa.user_id;
      } else {
        userId = (await supabase.auth.getUser()).data.user?.id ?? null;
      }
      if (!userId) return;
      const { data } = await db.from("captain_accounts").select("id, boat_id")
        .eq("user_id", userId).eq("boat_id", boatId).eq("active", true).maybeSingle();
      if (alive) setAccount(data ? { id: data.id, yacht_id: null, boat_id: data.boat_id } : null);
    })();
    return () => { alive = false; };
  }, [boatId, previewAccountId]);

  const loadChat = useCallback(async () => {
    if (!account) { setChat(null); return; }
    const { data } = await (supabase as any).from("portal_chats")
      .select("id, captain_account_id, claimed_by_name, last_message_at, last_sender_role, portal_unread")
      .eq("captain_account_id", account.id).maybeSingle();
    setChat(data ?? null);
  }, [account]);
  useEffect(() => {
    void loadChat();
    const t = setInterval(() => void loadChat(), 20000);
    return () => clearInterval(t);
  }, [loadChat]);
  const unread = chat?.portal_unread ?? 0;

  const boat = boats?.find((b) => b.id === boatId) ?? null;
  const preview = !!previewAccountId;

  return (
    <PreviewContext.Provider value={preview}>
    <div className="flex min-h-screen w-full">
      {preview && (
        <div className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-[12px] font-semibold text-black">
          <Eye className="h-3.5 w-3.5" />
          Previewing {displayName ?? "boat owner"}’s portal — read only
          <button onClick={() => window.location.assign("/polaris-redesign")} className="rounded bg-black/15 px-2 py-0.5 hover:bg-black/25">Exit preview</button>
        </div>
      )}
      {navOpen && <div className="fixed inset-0 z-40 bg-black/50 sm:hidden" onClick={() => setNavOpen(false)} />}

      {/* ── Sidebar ── */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border/60 bg-card/40 backdrop-blur transition-transform duration-200",
        "sm:sticky sm:top-0 sm:z-30 sm:h-screen sm:translate-x-0",
        navOpen ? "translate-x-0" : "-translate-x-full",
        preview && "pt-7",
      )}>
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2.5">
            <PolarisMark size={36} title="" />
            <div className="leading-tight">
              <div className="text-[15px] font-bold tracking-wide text-foreground">JLS YACHTS</div>
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Client Portal</div>
            </div>
          </div>
          <button onClick={() => setNavOpen(false)} title="Close menu"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground sm:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Boat picker — one card per boat on this login. */}
        <div className="mx-3 mb-3 rounded-xl border border-border/60 bg-background/40 p-2">
          <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
            {(boats?.length ?? 0) > 1 ? "Your boats" : "Your boat"}
          </div>
          {boats === null ? (
            <div className="px-1 py-1 text-sm text-muted-foreground">…</div>
          ) : boats.length === 0 ? (
            <div className="px-1 py-1 text-sm text-muted-foreground">No boats yet</div>
          ) : (
            <div className="space-y-0.5">
              {boats.map((b) => (
                <button key={b.id} onClick={() => { setBoatId(b.id); setNavOpen(false); }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold transition",
                          b.id === boatId ? "bg-primary/15 text-primary" : "text-foreground hover:bg-background/60",
                        )}>
                  <Ship className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{b.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="truncate px-1 pt-1.5 text-[11px] text-muted-foreground">{displayName ?? email}</div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          <div className="space-y-0.5">
            {NAV.map((n) => {
              const count = n.key === "home" && detail ? boatAlerts(detail).filter((a) => a.tone !== "sky").length
                : n.key === "chat" ? unread : 0;
              return (
                <button key={n.key} type="button" onClick={() => { setTab(n.key); setOpenRequestId(null); setNavOpen(false); }}
                        className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                          tab === n.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-background/60 hover:text-foreground")}>
                  <n.icon className="h-4 w-4 shrink-0" /> <span className="flex-1 text-left">{n.label}</span>
                  {count > 0 && <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-black">{count}</span>}
                </button>
              );
            })}
          </div>
        </nav>

        <button onClick={onSignOut}
                className="m-3 flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>

      {/* ── Main ── */}
      <div className={cn("flex min-w-0 flex-1 flex-col", preview && "pt-7")}>
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur sm:hidden">
          <button onClick={() => setNavOpen(true)} title="Menu"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground">
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{NAV.find((n) => n.key === tab)?.label ?? "My Boat"}</div>
            <div className="truncate text-[11px] text-muted-foreground">{boat?.name ?? ""}</div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-5 sm:px-8 sm:pb-10">
          {boats === null ? (
            <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : error ? (
            <div className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">{error}</div>
              <button onClick={() => void load()} className="rounded-lg border border-red-300/40 px-2 py-0.5 text-xs">Retry</button>
            </div>
          ) : !boat ? (
            <div className="rounded-2xl border border-border bg-card/80 p-8 text-center text-sm text-muted-foreground">
              No boats are linked to your account yet. Contact JLS Yachts and we'll set it up.
            </div>
          ) : tab === "requests" ? (
            <RequestsTab yachtId={null} boatId={boat.id} openRequestId={openRequestId} setOpenRequestId={setOpenRequestId}
                         onNewRequest={() => setNewRequest(true)} displayName={displayName ?? email} refreshKey={refreshKey} />
          ) : tab === "chat" ? (
            account
              ? <PortalChatTab link={account} displayName={displayName ?? email} chat={chat} onChatChanged={() => void loadChat()} />
              : <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : tab === "home" ? (
            <BoatHome boat={boat} detail={detail} onOpen={(t) => setTab(t as BoatTab)} />
          ) : detailError ? (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-red-300">{detailError}</div>
          ) : !detail ? (
            <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : tab === "compliance" ? <BoatCompliance boatId={boat.id} detail={detail} />
            : tab === "documents" ? <BoatDocuments boatId={boat.id} detail={detail} />
            : tab === "jobs" ? <BoatJobs detail={detail} />
            : <BoatSafetyKit detail={detail} />}
        </main>
      </div>
      {newRequest && boat && (
        <NewRequestSheet yachtId={null} boatId={boat.id} initialCategory="general"
                         onClose={() => setNewRequest(false)}
                         onCreated={(id) => { setNewRequest(false); setTab("requests"); setOpenRequestId(id); setRefreshKey((k) => k + 1); }} />
      )}
    </div>
    </PreviewContext.Provider>
  );
}

function BoatHome({ boat, detail, onOpen }: { boat: PortalBoat; detail: BoatDetail | null; onOpen: (tab: string) => void }) {
  const s = boat.spec;
  const rows: [string, string | null][] = [
    ["Type", boat.boatType],
    ["Hull number", s.hullNumber],
    ["Hull material", s.hullMaterial],
    ["Year built", s.yearOfBuild != null ? String(s.yearOfBuild) : null],
    ["Length", s.lengthM != null ? `${s.lengthM} m` : null],
    ["Beam", s.beamM != null ? `${s.beamM} m` : null],
    ["Max passengers", s.maxPassengers != null ? String(s.maxPassengers) : null],
    ["MMSI", s.mmsi],
    ["IMO", s.imo],
  ];

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-border bg-card/80 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.5)]">
        <div className="relative aspect-[16/7] w-full bg-background/60">
          {boat.photoUrl ? (
            <img src={boat.photoUrl} alt={boat.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
              <Ship className="h-16 w-16" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Managed by JLS Yachts</div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">{boat.name}</h1>
            {boat.boatType && <div className="text-sm text-white/80">{boat.boatType}</div>}
          </div>
        </div>
      </div>

      {detail && <BoatAlertsCard detail={detail} onOpen={onOpen} />}

      <div className="rounded-2xl border border-border bg-card/80 p-5">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Boat details</h2>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="text-[15px] font-medium">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </div>

    </div>
  );
}
