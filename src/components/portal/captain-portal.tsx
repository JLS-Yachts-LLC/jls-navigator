/**
 * Captain's View — the JLS Yachts client portal.
 *
 * Flow: login → (MFA enrol on first login) → MFA code → portal.
 * Every query below runs against RLS policies that scope a captain to their
 * own yacht and require an aal2 (MFA-verified) session — the UI never has to
 * filter by yacht, the database does.
 *
 * Laptop / tablet / phone friendly: top tabs on desktop, bottom tab bar on
 * mobile, big touch targets, click-to-call directory.
 */
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Anchor, ArrowLeft, ChevronRight, FileCheck2, Fuel, Home, Laptop, LifeBuoy,
  Loader2, LogOut, Mail, MessageSquare, Phone, Plane, Plus, Send,
  Shield, Shirt, ShoppingCart, Users, X, Wallet, Truck, Package,
  MapPin, FileText, Download, ExternalLink, Clock, CheckCircle2,
  Bell, Compass, Wrench, CalendarRange, ShieldCheck, Menu, AlertTriangle, Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
// /portal is a standalone route (no staff shell), so pull the design tokens in
// directly — the `pds` wrapper class below reads them.
import "@/components/polaris-ui/tokens.css";

const db = supabase as any;

// Admin "preview as captain" mode: an admin opens /portal?previewCaptain=<id> to
// see a captain's portal read-only. Writes are blocked (this isn't their session).
const PreviewContext = createContext(false);
const usePreview = () => useContext(PreviewContext);

// ── Types ─────────────────────────────────────────────────────────────────────
type CaptainLink = { id: string; yacht_id: string; display_name: string | null };
type Yacht = {
  id: string; vessel_name: string; vessel_type: string | null; flag: string | null;
  status: string | null; berth: string | null; location: string | null;
  vessel_image: string | null; ais_destination: string | null;
  ais_position_at: string | null; ais_speed: number | null;
  port_of_registry: string | null; length_overall_m: number | null;
  radio_call_sign: string | null; mmsi: string | null; imo_no: string | null;
};
type PortalRequest = {
  id: string; reference: string | null; category: string; title: string;
  details: string | null; priority: string; status: string;
  needed_by: string | null; created_at: string; updated_at: string;
};
type RequestMessage = {
  id: string; request_id: string; sender_name: string | null;
  sender_role: "captain" | "staff"; body: string; created_at: string;
};
type Crew = {
  id: string; full_name: string | null; first_name: string | null; last_name: string | null;
  rank: string | null; nationality: string | null; status: string | null;
  passport_number: string | null; passport_expiry_date: string | null;
};
type Permit = {
  id: string; permit_type: string; permit_number: string | null; status: string | null;
  issue_date: string | null; expiry_date: string | null; issuing_authority: string | null;
  holder_name: string | null;
};
type Visa = {
  id: string; given_name: string | null; surname: string | null; visa_type: string | null;
  status: string | null; destination_country: string | null; visa_expiry: string | null;
  visa_number: string | null; sign_on_date: string | null;
};
type DirectoryEntry = {
  id: string; department: string; contact_name: string | null; phone: string | null;
  email: string | null; notes: string | null;
};

// ── Request categories ────────────────────────────────────────────────────────
export const REQUEST_CATEGORIES = [
  { key: "provisioning", label: "Provisioning", icon: ShoppingCart, blurb: "Food, beverage & galley supplies" },
  { key: "uniform", label: "Uniform", icon: Shirt, blurb: "Crew uniform & workwear" },
  { key: "bunkering", label: "Bunkering", icon: Fuel, blurb: "Fuel & lubricants" },
  { key: "permits", label: "Permits", icon: FileCheck2, blurb: "Cruising, gate & agency permits" },
  { key: "it_support", label: "IT Support", icon: Laptop, blurb: "Connectivity, hardware & systems" },
  { key: "visa_immigration", label: "Visa & Immigration", icon: Plane, blurb: "Crew visas & immigration" },
  { key: "general", label: "General", icon: MessageSquare, blurb: "Anything else — just ask" },
] as const;

export const REQUEST_STATUS_STYLE: Record<string, string> = {
  new: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  acknowledged: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  in_progress: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  cancelled: "bg-white/5 text-muted-foreground border-white/10",
};
const statusLabel = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// ── Shared bits ───────────────────────────────────────────────────────────────
function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card/80 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.5)]", className)}>
      {children}
    </div>
  );
}

function PrimaryButton({ className, disabled, onClick, children, type }: {
  className?: string; disabled?: boolean; onClick?: () => void;
  children: React.ReactNode; type?: "button" | "submit";
}) {
  return (
    <button
      type={type ?? "button"}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition",
        "hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none",
        className,
      )}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</label>;
}

const inputCls =
  "w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-[15px] text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50";

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/40 bg-primary/15">
        <Anchor className="h-4.5 w-4.5 text-primary" style={{ width: 18, height: 18 }} />
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-wide text-foreground">JLS YACHTS</div>
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Client Portal</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Root component — auth state machine
// ═══════════════════════════════════════════════════════════════════════════
type Stage = "loading" | "signed-out" | "not-captain" | "mfa-enroll" | "mfa-verify" | "ready";

export function CaptainPortal() {
  const [stage, setStage] = useState<Stage>("loading");
  const [link, setLink] = useState<CaptainLink | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [preview, setPreview] = useState(false);

  const bootstrap = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setStage("signed-out"); return; }
    setUserEmail(session.user.email ?? "");

    // Admin preview: /portal?previewCaptain=<captain_account_id>. Loads that
    // captain's portal read-only, skipping MFA. Only returns data the caller's
    // own RLS allows (staff/admin can read the client tables; a captain can't
    // reach another vessel), so this can't leak beyond existing staff access.
    const previewId = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("previewCaptain")
      : null;
    if (previewId) {
      const { data: cap } = await db.from("captain_accounts")
        .select("id, yacht_id, display_name")
        .eq("id", previewId).eq("active", true).maybeSingle();
      if (cap) { setLink(cap); setPreview(true); setStage("ready"); return; }
      setStage("not-captain"); return;
    }

    const { data: links } = await db.from("captain_accounts")
      .select("id, yacht_id, display_name")
      .eq("user_id", session.user.id).eq("active", true).limit(1);
    if (!links?.length) { setStage("not-captain"); return; }
    setLink(links[0]);

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") { setStage("ready"); return; }
    if (aal?.nextLevel === "aal2") { setStage("mfa-verify"); return; }
    setStage("mfa-enroll");
  }, []);

  useEffect(() => { void bootstrap(); }, [bootstrap]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setLink(null);
    setStage("signed-out");
  }, []);

  return (
    <div className="pds dark pds-embed min-h-screen bg-background text-foreground" style={{ colorScheme: "dark" }}>
      {stage === "loading" && (
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {stage === "signed-out" && <LoginScreen onSignedIn={bootstrap} />}
      {stage === "not-captain" && <NotCaptainScreen email={userEmail} onSignOut={signOut} />}
      {stage === "mfa-enroll" && <MfaEnrollScreen onDone={bootstrap} onSignOut={signOut} />}
      {stage === "mfa-verify" && <MfaVerifyScreen onDone={bootstrap} onSignOut={signOut} />}
      {stage === "ready" && link && (
        <PreviewContext.Provider value={preview}>
          <PortalShell link={link} email={userEmail} onSignOut={signOut} preview={preview} />
        </PreviewContext.Provider>
      )}
    </div>
  );
}

// ── Auth screens ──────────────────────────────────────────────────────────────
function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-8"><Brand /></div>
      <Card className="w-full max-w-md p-6 sm:p-8">{children}</Card>
      <p className="mt-6 max-w-md text-center text-[11px] leading-relaxed text-muted-foreground/70">
        Secure client portal · access is limited to your own vessel and protected by
        two-factor authentication.
      </p>
    </div>
  );
}

function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    onSignedIn();
  };

  return (
    <AuthFrame>
      <h1 className="text-xl font-bold">Welcome aboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to your account.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <FieldLabel>Email</FieldLabel>
          <input className={inputCls} type="email" autoComplete="email" required
                 value={email} onChange={(e) => setEmail(e.target.value)} placeholder="captain@yourvessel.com" />
        </div>
        <div>
          <FieldLabel>Password</FieldLabel>
          <input className={inputCls} type="password" autoComplete="current-password" required
                 value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        <PrimaryButton type="submit" disabled={busy} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />} Sign in
        </PrimaryButton>
      </form>
    </AuthFrame>
  );
}

function NotCaptainScreen({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <AuthFrame>
      <h1 className="text-xl font-bold">No vessel linked</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        <span className="text-foreground">{email}</span> isn't set up as a account.
        If you believe this is a mistake, contact JLS Yachts and we'll link your vessel.
      </p>
      <PrimaryButton onClick={onSignOut} className="mt-6 w-full">
        <LogOut className="h-4 w-4" /> Sign out
      </PrimaryButton>
    </AuthFrame>
  );
}

function MfaEnrollScreen({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Clear any dangling unverified factors from abandoned attempts, then enrol.
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const f of factors?.all ?? []) {
        if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Captain Portal" });
      if (error) { setError(error.message); return; }
      setFactorId(data.id);
      setQr((data as any).totp?.qr_code ?? null);
      setSecret((data as any).totp?.secret ?? null);
    })();
  }, []);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true); setError(null);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr || !ch) { setError(chErr?.message ?? "Challenge failed"); setBusy(false); return; }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.trim() });
    setBusy(false);
    if (vErr) { setError("That code didn't match — try again."); return; }
    onDone();
  };

  return (
    <AuthFrame>
      <h1 className="text-xl font-bold">Set up two-factor authentication</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Scan this QR code with an authenticator app (Microsoft Authenticator, Google
        Authenticator, 1Password…), then enter the 6-digit code it shows.
      </p>
      <div className="mt-5 flex justify-center">
        {qr ? (
          <div className="rounded-2xl bg-white p-3">
            <img alt="Authenticator QR code" width={190} height={190}
                 src={qr.startsWith("data:") ? qr : `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`} />
          </div>
        ) : error ? null : <Loader2 className="my-10 h-6 w-6 animate-spin text-muted-foreground" />}
      </div>
      {secret && (
        <p className="mt-3 break-all text-center text-[11px] text-muted-foreground/70">
          Can't scan? Enter this key manually: <span className="font-mono text-muted-foreground">{secret}</span>
        </p>
      )}
      <form onSubmit={verify} className="mt-5 space-y-4">
        <div>
          <FieldLabel>6-digit code</FieldLabel>
          <input className={cn(inputCls, "text-center text-xl tracking-[0.5em] font-mono")} inputMode="numeric"
                 autoComplete="one-time-code" maxLength={6} required value={code}
                 onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" />
        </div>
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        <PrimaryButton type="submit" disabled={busy || code.length !== 6 || !factorId} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />} Activate & continue
        </PrimaryButton>
      </form>
      <button onClick={onSignOut} className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground">Sign out</button>
    </AuthFrame>
  );
}

function MfaVerifyScreen({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.[0];
    if (!totp) { setError("No authenticator found on this account — contact JLS Yachts."); setBusy(false); return; }
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
    if (chErr || !ch) { setError(chErr?.message ?? "Challenge failed"); setBusy(false); return; }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: ch.id, code: code.trim() });
    setBusy(false);
    if (vErr) { setError("That code didn't match — try again."); return; }
    onDone();
  };

  return (
    <AuthFrame>
      <h1 className="text-xl font-bold">Two-factor check</h1>
      <p className="mt-1 text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input className={cn(inputCls, "text-center text-xl tracking-[0.5em] font-mono")} inputMode="numeric"
               autoComplete="one-time-code" maxLength={6} required autoFocus value={code}
               onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" />
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        <PrimaryButton type="submit" disabled={busy || code.length !== 6} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />} Verify
        </PrimaryButton>
      </form>
      <button onClick={onSignOut} className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground">Sign out</button>
    </AuthFrame>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Portal shell + tabs
// ═══════════════════════════════════════════════════════════════════════════
type Tab =
  | "home"
  | "alerts" | "positions" | "crew" | "documents" | "pms" | "balances" | "invoices" | "charter" | "ism"
  | "requests" | "logistics" | "chat" | "directory"
  | "finances"; // legacy alias used by the Home module launcher → routes to Invoices/Finance

type NavItem = { key: Tab; label: string; icon: any };
type NavGroup = { title?: string; items: NavItem[] };

// Left "My Yacht" navigation — the Yacht Management App shell. The MY YACHT group is
// the vessel's operational record; SUPPORT is how the client reaches JLS.
const NAV_GROUPS: NavGroup[] = [
  { items: [{ key: "home", label: "Home", icon: Home }] },
  {
    title: "My Yacht",
    items: [
      { key: "alerts", label: "Alerts", icon: Bell },
      { key: "positions", label: "Positions", icon: Compass },
      { key: "crew", label: "Crew", icon: Users },
      { key: "documents", label: "Documents", icon: FileCheck2 },
      { key: "pms", label: "PMS", icon: Wrench },
      { key: "balances", label: "Balances", icon: Wallet },
      { key: "invoices", label: "Invoices", icon: FileText },
      { key: "charter", label: "Charter", icon: CalendarRange },
      { key: "ism", label: "ISM", icon: ShieldCheck },
    ],
  },
  {
    title: "Support",
    items: [
      { key: "requests", label: "Requests", icon: LifeBuoy },
      { key: "logistics", label: "Logistics", icon: Truck },
      { key: "chat", label: "Chat", icon: MessageSquare },
      { key: "directory", label: "Directory", icon: Phone },
    ],
  },
];
const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

type PortalChat = {
  id: string; captain_account_id: string; claimed_by_name: string | null;
  last_message_at: string | null; last_sender_role: string | null; portal_unread: number;
};
type ChatMessage = {
  id: string; sender_name: string | null; sender_role: "staff" | "portal"; body: string; created_at: string;
};

function PortalShell({ link, email, onSignOut, preview = false }: { link: CaptainLink; email: string; onSignOut: () => void; preview?: boolean }) {
  const [tab, setTab] = useState<Tab>("home");
  const [yacht, setYacht] = useState<Yacht | null>(null);
  const [newRequestCat, setNewRequestCat] = useState<string | null>(null);
  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [chat, setChat] = useState<PortalChat | null>(null);
  const [navOpen, setNavOpen] = useState(false); // mobile sidebar drawer

  useEffect(() => {
    db.from("yachts")
      .select("id, vessel_name, vessel_type, flag, status, berth, location, vessel_image, ais_destination, ais_position_at, ais_speed, port_of_registry, length_overall_m, radio_call_sign, mmsi, imo_no")
      .eq("id", link.yacht_id).maybeSingle()
      .then(({ data }: any) => setYacht(data ?? null));
  }, [link.yacht_id]);

  // Chat thread + unread badge — refreshed every 20s so a staff-initiated chat
  // surfaces on the dashboard without a reload.
  const loadChat = useCallback(async () => {
    const { data } = await db.from("portal_chats")
      .select("id, captain_account_id, claimed_by_name, last_message_at, last_sender_role, portal_unread")
      .eq("captain_account_id", link.id).maybeSingle();
    setChat(data ?? null);
  }, [link.id]);
  useEffect(() => {
    void loadChat();
    const t = setInterval(() => void loadChat(), 20000);
    return () => clearInterval(t);
  }, [loadChat]);

  const unread = chat?.portal_unread ?? 0;
  const openNewRequest = (cat: string) => { setNewRequestCat(cat); };

  const activeItem = ALL_NAV_ITEMS.find((i) => i.key === tab);

  return (
    <div className="flex min-h-screen w-full">
      {/* Admin preview banner — read-only view of a captain's portal. */}
      {preview && (
        <div className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-[12px] font-semibold text-black">
          <Eye className="h-3.5 w-3.5" />
          Previewing {link.display_name ?? "captain"}’s portal — read only
          <button onClick={() => window.location.assign("/polaris-redesign")} className="rounded bg-black/15 px-2 py-0.5 hover:bg-black/25">Exit preview</button>
        </div>
      )}
      {/* Mobile drawer backdrop */}
      {navOpen && <div className="fixed inset-0 z-40 bg-black/50 sm:hidden" onClick={() => setNavOpen(false)} />}

      {/* ── Left "My Yacht" sidebar ── */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border/60 bg-card/40 backdrop-blur transition-transform duration-200",
        "sm:sticky sm:top-0 sm:z-30 sm:h-screen sm:translate-x-0",
        navOpen ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="flex items-center justify-between px-4 py-4">
          <Brand />
          <button onClick={() => setNavOpen(false)} title="Close menu"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground sm:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Vessel identity */}
        <div className="mx-3 mb-3 rounded-xl border border-border/60 bg-background/40 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">Your vessel</div>
          <div className="mt-0.5 truncate text-sm font-bold">{yacht?.vessel_name ?? "…"}</div>
          <div className="truncate text-[11px] text-muted-foreground">{link.display_name ?? email}</div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {NAV_GROUPS.map((g, gi) => (
            <div key={gi}>
              {g.title && <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">{g.title}</div>}
              <div className="space-y-0.5">
                {g.items.map((t) => (
                  <button key={t.key} onClick={() => { setTab(t.key); setOpenRequestId(null); setNavOpen(false); }}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                            tab === t.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                          )}>
                    <t.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{t.label}</span>
                    {t.key === "chat" && unread > 0 && (
                      <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <button onClick={onSignOut}
                className="m-3 flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>

      {/* ── Main column ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur sm:hidden">
          <button onClick={() => setNavOpen(true)} title="Menu"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground">
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{activeItem?.label ?? "Home"}</div>
            <div className="truncate text-[11px] text-muted-foreground">{yacht?.vessel_name ?? ""}</div>
          </div>
          {unread > 0 && (
            <button onClick={() => setTab("chat")} className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground">
              <MessageSquare className="h-4 w-4" />
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>
            </button>
          )}
        </header>

        {/* Content */}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-5 sm:px-8 sm:pb-10">
        {tab === "home" && unread > 0 && (
          <button onClick={() => setTab("chat")}
                  className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-4 text-left transition hover:bg-primary/15">
            <MessageSquare className="h-5 w-5 shrink-0 text-primary" />
            <span className="flex-1 text-sm">
              <span className="font-semibold">
                {chat?.claimed_by_name ? `${chat.claimed_by_name} from JLS Yachts` : "JLS Yachts"} sent you {unread === 1 ? "a message" : `${unread} messages`}
              </span>
              <span className="block text-xs text-muted-foreground">Tap to open the conversation.</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
        {tab === "home" && yacht && (
          <HomeTab yacht={yacht} onNewRequest={openNewRequest}
                   onSeeRequests={() => setTab("requests")}
                   onOpenRequest={(id) => { setTab("requests"); setOpenRequestId(id); }}
                   onOpenModule={(t) => { setTab(t); setOpenRequestId(null); }}
                   unread={unread}
                   refreshKey={refreshKey} />
        )}
        {tab === "chat" && (
          <PortalChatTab link={link} displayName={link.display_name ?? email}
                         chat={chat} onChatChanged={loadChat} />
        )}
        {tab === "requests" && (
          <RequestsTab yachtId={link.yacht_id} openRequestId={openRequestId}
                       setOpenRequestId={setOpenRequestId}
                       onNewRequest={() => setNewRequestCat("general")}
                       displayName={link.display_name ?? email} refreshKey={refreshKey} />
        )}
        {tab === "crew" && <CrewTab yachtId={link.yacht_id} />}
        {tab === "documents" && <DocumentsTab yachtId={link.yacht_id} />}
        {(tab === "invoices" || tab === "finances") && <FinancesTab />}
        {tab === "balances" && <BalancesTab />}
        {tab === "logistics" && <LogisticsTab />}
        {tab === "alerts" && <AlertsTab onOpen={(t) => { setTab(t); setOpenRequestId(null); }} />}
        {tab === "positions" && yacht && <PositionsTab yacht={yacht} />}
        {tab === "pms" && (
          <ComingSoonTab icon={Wrench} title="Planned Maintenance (PMS)"
            blurb="Your vessel's planned-maintenance schedule, running hours and job history will appear here, kept in step with the technical team." />
        )}
        {tab === "charter" && (
          <ComingSoonTab icon={CalendarRange} title="Charter"
            blurb="Upcoming and past charter bookings, itineraries and charter paperwork for your vessel." />
        )}
        {tab === "ism" && (
          <ComingSoonTab icon={ShieldCheck} title="ISM & Safety"
            blurb="ISM documentation, drills, audits and safety certificates — your vessel's safety-management record, in one place." />
        )}
        {tab === "directory" && <DirectoryTab />}
        </main>
      </div>

      {newRequestCat && (
        <NewRequestSheet
          yachtId={link.yacht_id}
          initialCategory={newRequestCat}
          onClose={() => setNewRequestCat(null)}
          onCreated={(id) => { setNewRequestCat(null); setTab("requests"); setOpenRequestId(id); setRefreshKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}

// ── Modules ──────────────────────────────────────────────────────────────────
// The portal's "front door": the Bridge home shows a grid of module tiles
// (DeepBlue-style). Each tile opens one of the tabs. Tiles reflow 2-up on mobile
// and 3-up on desktop; the tab bar / bottom bar remain for quick switching.
type ModuleDef = { key: Tab; label: string; blurb: string; icon: any; accent: string };
const MODULES: ModuleDef[] = [
  { key: "requests",  label: "Service Requests",     blurb: "Provisioning, uniform, permits & more", icon: LifeBuoy,     accent: "text-sky-400 bg-sky-500/10 border-sky-500/25" },
  { key: "crew",      label: "Crew, Visas & Permits", blurb: "Roster, visa status & compliance",      icon: Users,        accent: "text-violet-400 bg-violet-500/10 border-violet-500/25" },
  { key: "finances",  label: "Finance",              blurb: "Invoices, quotes & statements",         icon: Wallet,       accent: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25" },
  { key: "logistics", label: "Logistics & Deliveries", blurb: "Parcels, shipments & ETAs",           icon: Truck,        accent: "text-amber-400 bg-amber-500/10 border-amber-500/25" },
  { key: "documents", label: "Documents & e-Sign",   blurb: "Shared documents & signing",            icon: FileCheck2,   accent: "text-teal-400 bg-teal-500/10 border-teal-500/25" },
  { key: "chat",      label: "Support & Directory",  blurb: "Chat with JLS + key contacts",          icon: MessageSquare, accent: "text-primary bg-primary/10 border-primary/25" },
];

function ModuleLauncher({ onOpen, unread }: { onOpen: (t: Tab) => void; unread: number }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Modules</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {MODULES.map((m) => (
          <button
            key={m.key}
            onClick={() => onOpen(m.key)}
            className="group relative flex flex-col rounded-2xl border border-border bg-card/60 p-4 text-left transition hover:border-primary/50 hover:bg-card"
          >
            <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl border", m.accent)}>
              <m.icon className="h-5 w-5" />
            </div>
            {m.key === "chat" && unread > 0 && (
              <span className="absolute right-3 top-3 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
            <div className="mt-3 flex items-center gap-1 text-sm font-semibold">
              {m.label}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
            <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{m.blurb}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Home ─────────────────────────────────────────────────────────────────────
function HomeTab({ yacht, onNewRequest, onSeeRequests, onOpenRequest, onOpenModule, unread, refreshKey }: {
  yacht: Yacht; onNewRequest: (cat: string) => void; onSeeRequests: () => void;
  onOpenRequest: (id: string) => void; onOpenModule: (t: Tab) => void; unread: number; refreshKey: number;
}) {
  const [recent, setRecent] = useState<PortalRequest[]>([]);
  useEffect(() => {
    db.from("captain_requests")
      .select("id, reference, category, title, details, priority, status, needed_by, created_at, updated_at")
      .order("created_at", { ascending: false }).limit(3)
      .then(({ data }: any) => setRecent(data ?? []));
  }, [refreshKey]);

  const posAge = yacht.ais_position_at
    ? Math.round((Date.now() - new Date(yacht.ais_position_at).getTime()) / 60000)
    : null;

  return (
    <div className="space-y-6">
      {/* Yacht hero */}
      <Card className="overflow-hidden">
        {yacht.vessel_image && (
          <div className="h-40 w-full overflow-hidden sm:h-52">
            <img src={yacht.vessel_image} alt={yacht.vessel_name} className="h-full w-full object-cover" />
          </div>
        )}
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Your vessel</div>
              <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{yacht.vessel_name}</h1>
            </div>
            {yacht.status && (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {yacht.status}
              </span>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <div><div className="text-[11px] text-muted-foreground">Berth / Location</div><div className="mt-0.5 font-medium">{yacht.berth || yacht.location || "—"}</div></div>
            <div><div className="text-[11px] text-muted-foreground">Flag</div><div className="mt-0.5 font-medium">{yacht.flag ?? "—"}</div></div>
            <div><div className="text-[11px] text-muted-foreground">Destination</div><div className="mt-0.5 font-medium">{yacht.ais_destination ?? "—"}</div></div>
            <div>
              <div className="text-[11px] text-muted-foreground">Last position</div>
              <div className="mt-0.5 font-medium">
                {posAge === null ? "—" : posAge < 90 ? `${posAge} min ago` : `${Math.round(posAge / 60)} h ago`}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Module launcher — the DeepBlue-style front door */}
      <ModuleLauncher onOpen={onOpenModule} unread={unread} />

      {/* Quick requests */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Make a request</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {REQUEST_CATEGORIES.map((c) => (
            <button key={c.key} onClick={() => onNewRequest(c.key)}
                    className="group rounded-2xl border border-border bg-card/60 p-4 text-left transition hover:border-primary/50 hover:bg-card">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 transition group-hover:bg-primary/20">
                <c.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-3 text-sm font-semibold">{c.label}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{c.blurb}</div>
            </button>
          ))}
          <button onClick={onSeeRequests}
                  className="flex flex-col items-start justify-center rounded-2xl border border-dashed border-border/80 p-4 text-left text-muted-foreground transition hover:border-primary/40 hover:text-foreground">
            <div className="text-sm font-semibold">My requests</div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px]">View all <ChevronRight className="h-3 w-3" /></div>
          </button>
        </div>
      </section>

      {/* Recent requests */}
      {recent.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recent requests</h2>
          <div className="space-y-2">
            {recent.map((r) => <RequestRow key={r.id} r={r} onClick={() => onOpenRequest(r.id)} />)}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Requests ─────────────────────────────────────────────────────────────────
function RequestRow({ r, onClick }: { r: PortalRequest; onClick: () => void }) {
  const cat = REQUEST_CATEGORIES.find((c) => c.key === r.category);
  const Icon = cat?.icon ?? MessageSquare;
  return (
    <button onClick={onClick}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card/60 p-4 text-left transition hover:border-primary/40">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background/50">
        <Icon className="h-4.5 w-4.5 text-muted-foreground" style={{ width: 18, height: 18 }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{r.title}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {r.reference} · {cat?.label ?? r.category} · {fmtDate(r.created_at)}
        </div>
      </div>
      <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide", REQUEST_STATUS_STYLE[r.status] ?? REQUEST_STATUS_STYLE.new)}>
        {statusLabel(r.status)}
      </span>
    </button>
  );
}

function RequestsTab({ yachtId, openRequestId, setOpenRequestId, onNewRequest, displayName, refreshKey }: {
  yachtId: string; openRequestId: string | null; setOpenRequestId: (id: string | null) => void;
  onNewRequest: () => void; displayName: string; refreshKey: number;
}) {
  const [rows, setRows] = useState<PortalRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await db.from("captain_requests")
      .select("id, reference, category, title, details, priority, status, needed_by, created_at, updated_at")
      .order("created_at", { ascending: false });
    setRows(data ?? []); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  if (openRequestId) {
    return <RequestDetail requestId={openRequestId} displayName={displayName}
                          onBack={() => { setOpenRequestId(null); void load(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">My requests</h1>
        <PrimaryButton onClick={onNewRequest}><Plus className="h-4 w-4" /> New request</PrimaryButton>
      </div>
      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-12 text-center">
          <LifeBuoy className="h-9 w-9 text-muted-foreground/50" />
          <div className="mt-3 font-semibold">No requests yet</div>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Need provisioning, fuel, permits, IT help or crew visas? We're one tap away.
          </p>
          <PrimaryButton onClick={onNewRequest} className="mt-5"><Plus className="h-4 w-4" /> Make your first request</PrimaryButton>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => <RequestRow key={r.id} r={r} onClick={() => setOpenRequestId(r.id)} />)}
        </div>
      )}
    </div>
  );
}

function RequestDetail({ requestId, displayName, onBack }: { requestId: string; displayName: string; onBack: () => void }) {
  const [req, setReq] = useState<PortalRequest | null>(null);
  const [messages, setMessages] = useState<RequestMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [{ data: r }, { data: msgs }] = await Promise.all([
      db.from("captain_requests")
        .select("id, reference, category, title, details, priority, status, needed_by, created_at, updated_at")
        .eq("id", requestId).maybeSingle(),
      db.from("captain_request_messages")
        .select("id, request_id, sender_name, sender_role, body, created_at")
        .eq("request_id", requestId).order("created_at"),
    ]);
    setReq(r ?? null); setMessages(msgs ?? []);
  }, [requestId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  const readOnly = usePreview();
  const send = async () => {
    const body = draft.trim();
    if (!body || readOnly) return;
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await db.from("captain_request_messages").insert({
      request_id: requestId, sender_user_id: user?.id, sender_name: displayName,
      sender_role: "captain", body,
    });
    setSending(false);
    if (!error) { setDraft(""); void load(); }
  };

  const cancel = async () => {
    if (!req || !confirm("Cancel this request?")) return;
    await db.from("captain_requests").update({ status: "cancelled" }).eq("id", req.id);
    void load();
  };

  if (!req) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const cat = REQUEST_CATEGORIES.find((c) => c.key === req.category);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All requests
      </button>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {req.reference} · {cat?.label ?? req.category}
            </div>
            <h1 className="mt-1 text-lg font-bold">{req.title}</h1>
          </div>
          <span className={cn("rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide", REQUEST_STATUS_STYLE[req.status] ?? "")}>
            {statusLabel(req.status)}
          </span>
        </div>
        {req.details && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{req.details}</p>}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
          <span>Raised {fmtDateTime(req.created_at)}</span>
          {req.needed_by && <span>Needed by {fmtDate(req.needed_by)}</span>}
          <span>Priority: {req.priority}</span>
        </div>
        {(req.status === "new" || req.status === "acknowledged") && (
          <button onClick={cancel} className="mt-4 text-xs text-muted-foreground underline-offset-2 hover:text-red-300 hover:underline">
            Cancel this request
          </button>
        )}
      </Card>

      {/* Thread */}
      <Card className="flex flex-col p-4">
        <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">No messages yet — the JLS team will reply here.</p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.sender_role === "captain" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                m.sender_role === "captain"
                  ? "rounded-br-md bg-primary/20 text-foreground"
                  : "rounded-bl-md border border-border bg-background/60",
              )}>
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {m.sender_role === "captain" ? "You" : (m.sender_name || "JLS Yachts")} · {fmtDateTime(m.created_at)}
                </div>
                <div className="whitespace-pre-wrap">{m.body}</div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="mt-3 flex items-end gap-2 border-t border-border/60 pt-3">
          <textarea
            value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
            placeholder="Write a message to the JLS team…"
            className={cn(inputCls, "resize-none py-2.5")}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(); }}
          />
          <PrimaryButton onClick={() => void send()} disabled={sending || !draft.trim()} className="h-11 w-11 shrink-0 rounded-xl px-0">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </PrimaryButton>
        </div>
      </Card>
    </div>
  );
}

// ── New request sheet ────────────────────────────────────────────────────────
function NewRequestSheet({ yachtId, initialCategory, onClose, onCreated }: {
  yachtId: string; initialCategory: string; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [priority, setPriority] = useState("normal");
  const [neededBy, setNeededBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cat = REQUEST_CATEGORIES.find((c) => c.key === category);

  const readOnly = usePreview();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) { setError("Read-only preview — sign in as the captain to submit."); return; }
    setBusy(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await db.from("captain_requests").insert({
      yacht_id: yachtId, created_by: user?.id, category,
      title: title.trim(), details: details.trim() || null,
      priority, needed_by: neededBy || null,
    }).select("id").single();
    setBusy(false);
    if (error || !data) { setError(error?.message ?? "Could not create the request"); return; }
    onCreated(data.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">New request</h2>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <FieldLabel>What do you need?</FieldLabel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {REQUEST_CATEGORIES.map((c) => (
                <button key={c.key} type="button" onClick={() => setCategory(c.key)}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition",
                          category === c.key ? "border-primary/60 bg-primary/15 text-foreground" : "border-border bg-background/40 text-muted-foreground hover:text-foreground",
                        )}>
                  <c.icon className="h-4 w-4 shrink-0" /> {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel>Summary</FieldLabel>
            <input className={inputCls} required maxLength={140} value={title}
                   onChange={(e) => setTitle(e.target.value)}
                   placeholder={cat ? `e.g. ${cat.blurb}` : "What do you need?"} />
          </div>
          <div>
            <FieldLabel>Details</FieldLabel>
            <textarea className={cn(inputCls, "resize-none")} rows={4} value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      placeholder="Quantities, dates, crew names, berth access notes — anything that helps us move fast." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Priority</FieldLabel>
              <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <FieldLabel>Needed by</FieldLabel>
              <input className={inputCls} type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
            </div>
          </div>
          {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
          <PrimaryButton type="submit" disabled={busy || !title.trim()} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to JLS Yachts
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}

// ── Crew ─────────────────────────────────────────────────────────────────────
function CrewTab({ yachtId }: { yachtId: string }) {
  const [rows, setRows] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    db.from("crew_members")
      .select("id, full_name, first_name, last_name, rank, nationality, status, passport_number, passport_expiry_date")
      .order("last_name")
      .then(({ data }: any) => { setRows(data ?? []); setLoading(false); });
  }, [yachtId]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Crew on {""}your vessel</h1>
      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted-foreground">No crew records yet.</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((c) => {
            const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
            const expiring = c.passport_expiry_date && new Date(c.passport_expiry_date).getTime() - Date.now() < 180 * 86400000;
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{[c.rank, c.nationality].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  {c.status && (
                    <span className="rounded-full border border-border bg-background/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{c.status}</span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div><div className="text-muted-foreground">Passport</div><div className="mt-0.5 font-mono">{c.passport_number ?? "—"}</div></div>
                  <div>
                    <div className="text-muted-foreground">Expiry</div>
                    <div className={cn("mt-0.5", expiring && "text-amber-300")}>{fmtDate(c.passport_expiry_date)}</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Documents (permits + visas) ──────────────────────────────────────────────
function DocumentsTab({ yachtId }: { yachtId: string }) {
  const [permits, setPermits] = useState<Permit[]>([]);
  const [visas, setVisas] = useState<Visa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      db.from("permits")
        .select("id, permit_type, permit_number, status, issue_date, expiry_date, issuing_authority, holder_name")
        .order("created_at", { ascending: false }),
      db.from("visa_applications")
        .select("id, given_name, surname, visa_type, status, destination_country, visa_expiry, visa_number, sign_on_date")
        .order("created_at", { ascending: false }).limit(100),
    ]).then(([p, v]: any[]) => { setPermits(p.data ?? []); setVisas(v.data ?? []); setLoading(false); });
  }, [yachtId]);

  const typeLabel = (t: string) => t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (loading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="mb-3 text-lg font-bold">Permits</h1>
        {permits.length === 0 ? (
          <Card className="px-6 py-8 text-center text-sm text-muted-foreground">No permits on record for your vessel.</Card>
        ) : (
          <div className="space-y-2">
            {permits.map((p) => {
              const days = p.expiry_date ? Math.ceil((new Date(p.expiry_date).getTime() - Date.now()) / 86400000) : null;
              return (
                <Card key={p.id} className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background/50">
                    <FileCheck2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{typeLabel(p.permit_type)}{p.permit_number ? ` · ${p.permit_number}` : ""}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {[p.issuing_authority, p.holder_name].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    <div className={cn("font-semibold", days !== null && days < 0 ? "text-red-300" : days !== null && days <= 30 ? "text-amber-300" : "text-emerald-300")}>
                      {days === null ? (p.status ?? "—") : days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d left`}
                    </div>
                    <div className="mt-0.5 text-muted-foreground">{fmtDate(p.expiry_date)}</div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Crew visas</h2>
        {visas.length === 0 ? (
          <Card className="px-6 py-8 text-center text-sm text-muted-foreground">No visa applications on record for your vessel.</Card>
        ) : (
          <div className="space-y-2">
            {visas.map((v) => (
              <Card key={v.id} className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background/50">
                  <Plane className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{[v.given_name, v.surname].filter(Boolean).join(" ") || "—"}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {[v.visa_type, v.destination_country, v.visa_number].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs">
                  <div className="font-semibold">{v.status ?? "—"}</div>
                  <div className="mt-0.5 text-muted-foreground">{v.visa_expiry ? `Expires ${fmtDate(v.visa_expiry)}` : ""}</div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Directory ────────────────────────────────────────────────────────────────
function DirectoryTab() {
  const [rows, setRows] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    db.from("portal_directory")
      .select("id, department, contact_name, phone, email, notes")
      .order("sort_order")
      .then(({ data }: any) => { setRows(data ?? []); setLoading(false); });
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Directory</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tap a number to call the right department directly.</p>
      </div>
      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="font-semibold">{d.department}</div>
              {d.contact_name && <div className="mt-0.5 text-xs text-muted-foreground">{d.contact_name}</div>}
              {d.notes && <div className="mt-1 text-[11px] text-muted-foreground/80">{d.notes}</div>}
              <div className="mt-3 flex flex-wrap gap-2">
                {d.phone ? (
                  <a href={`tel:${d.phone.replace(/\s+/g, "")}`}
                     className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
                    <Phone className="h-4 w-4" /> {d.phone}
                  </a>
                ) : (
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-dashed border-border px-4 text-xs text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /> Number coming soon
                  </span>
                )}
                {d.email && (
                  <a href={`mailto:${d.email}`}
                     className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition hover:border-primary/50">
                    <Mail className="h-4 w-4" /> Email
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Finances (QuickBooks, vessel-scoped) ─────────────────────────────────────
async function authedFetch(path: string): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(path, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
}
const money = (n: number, ccy: string) =>
  `${ccy} ${Number(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type FinanceData = {
  vessel: string; linked: boolean;
  invoices: { id: string; docNumber: string | null; date: string | null; dueDate: string | null; total: number; balance: number; currency: string; status: "paid" | "overdue" | "open" }[];
  quotations: { id: string; docNumber: string | null; date: string | null; expiryDate: string | null; total: number; currency: string; status: string }[];
  summary: { outstanding: number; currency: string; invoiceCount: number; quotationCount: number };
};

const INV_BADGE: Record<string, string> = {
  paid: "bg-emerald-500/15 text-emerald-400",
  open: "bg-amber-500/15 text-amber-400",
  overdue: "bg-red-500/15 text-red-400",
};
const QUOTE_BADGE: Record<string, string> = {
  accepted: "bg-emerald-500/15 text-emerald-400",
  pending: "bg-sky-500/15 text-sky-400",
  closed: "bg-slate-500/15 text-slate-300",
  rejected: "bg-red-500/15 text-red-400",
};

function FinancesTab() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<"invoices" | "quotations">("invoices");

  useEffect(() => {
    void (async () => {
      setLoading(true); setErr(null);
      try {
        const res = await authedFetch("/api/portal/finance");
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "Could not load finances");
        setData(j);
      } catch (e: any) { setErr(e.message ?? "Could not load finances"); }
      finally { setLoading(false); }
    })();
  }, []);

  async function openInvoicePdf(id: string) {
    const res = await authedFetch(`/api/portal/finance?invoicePdf=${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), "_blank");
  }

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (err) return <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{err}</div>;
  if (!data) return null;

  const list = view === "invoices" ? data.invoices : data.quotations;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Finances</h1>
        <p className="mt-1 text-sm text-muted-foreground">Invoices and quotations for {data.vessel}.</p>
      </div>

      {!data.linked ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          <Wallet className="mx-auto mb-3 h-7 w-7 text-muted-foreground/40" />
          No billing account is linked to your vessel yet. Please contact Accounts &amp; Finance.
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding</div><div className="mt-1 text-lg font-bold text-primary">{money(data.summary.outstanding, data.summary.currency)}</div></Card>
            <Card className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Invoices</div><div className="mt-1 text-lg font-bold">{data.summary.invoiceCount}</div></Card>
            <Card className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Quotations</div><div className="mt-1 text-lg font-bold">{data.summary.quotationCount}</div></Card>
          </div>

          {/* Toggle */}
          <div className="inline-flex rounded-xl border border-border p-1 text-sm">
            {(["invoices", "quotations"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                      className={cn("rounded-lg px-4 py-1.5 font-medium capitalize transition", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {v}
              </button>
            ))}
          </div>

          {list.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">No {view} yet.</Card>
          ) : (
            <div className="space-y-2">
              {view === "invoices" && data.invoices.map((i) => (
                <Card key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Invoice {i.docNumber ?? i.id}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", INV_BADGE[i.status])}>{i.status}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">Issued {fmtDate(i.date)}{i.status !== "paid" && i.dueDate ? ` · Due ${fmtDate(i.dueDate)}` : ""}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{money(i.total, i.currency)}</div>
                    {i.status !== "paid" && <div className="text-xs text-amber-400">{money(i.balance, i.currency)} due</div>}
                  </div>
                  <button onClick={() => void openInvoicePdf(i.id)} title="View PDF"
                          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium transition hover:border-primary/50">
                    <FileText className="h-3.5 w-3.5" /> PDF
                  </button>
                </Card>
              ))}
              {view === "quotations" && data.quotations.map((q) => (
                <Card key={q.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Quotation {q.docNumber ?? q.id}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", QUOTE_BADGE[q.status] ?? "bg-slate-500/15 text-slate-300")}>{q.status}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">Dated {fmtDate(q.date)}{q.expiryDate ? ` · Valid to ${fmtDate(q.expiryDate)}` : ""}</div>
                  </div>
                  <div className="text-right font-semibold">{money(q.total, q.currency)}</div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Logistics (ShipSync packages & deliveries, vessel-scoped) ─────────────────
type LogisticsData = {
  vessel: string;
  packages: {
    active: LogPackage[]; done: LogPackage[];
  };
  deliveries: {
    id: string; number: string | null; status: string; destination: string | null;
    createdAt: string | null; deliveredAt: string | null; podUrl: string | null;
    driver: { name: string; phone: string | null } | null;
    vehicle: { label: string } | null;
    location: { lat: number; lng: number; updatedAt: string | null } | null;
  }[];
};
type LogPackage = { id: string; barcode: string | null; courier: string | null; count: number; description: string | null; status: string; zone: string | null; receivedAt: string | null; plannedDate: string | null; deliveredAt: string | null };

const PKG_LABEL: Record<string, string> = {
  in_office: "In office", in_storage: "In storage", assigned: "Assigned",
  out_for_delivery: "Out for delivery", delivered: "Delivered",
  to_collect: "To collect", collected: "Collected", refused: "Refused",
};
const PKG_BADGE: Record<string, string> = {
  out_for_delivery: "bg-orange-500/15 text-orange-400",
  delivered: "bg-emerald-500/15 text-emerald-400",
  collected: "bg-emerald-500/15 text-emerald-400",
  assigned: "bg-amber-500/15 text-amber-400",
  refused: "bg-red-500/15 text-red-400",
};
const relAgo = (s: string | null) => {
  if (!s) return "";
  const mins = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};

function PackageRow({ p }: { p: LogPackage }) {
  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{p.description || p.barcode || "Package"}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", PKG_BADGE[p.status] ?? "bg-sky-500/15 text-sky-400")}>{PKG_LABEL[p.status] ?? p.status}</span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {p.courier ? `${p.courier} · ` : ""}{p.count} {p.count === 1 ? "package" : "packages"}
          {p.barcode ? ` · ${p.barcode}` : ""}
        </div>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        {p.deliveredAt ? `Delivered ${fmtDate(p.deliveredAt)}` : p.plannedDate ? `Planned ${fmtDate(p.plannedDate)}` : p.receivedAt ? `Received ${fmtDate(p.receivedAt)}` : ""}
      </div>
    </Card>
  );
}

function LogisticsTab() {
  const [data, setData] = useState<LogisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const loadLogistics = useCallback(async () => {
    try {
      const res = await authedFetch("/api/portal/logistics");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Could not load logistics");
      setData(j);
    } catch (e: any) { setErr(e.message ?? "Could not load logistics"); }
    finally { setLoading(false); }
  }, []);

  // Refresh live driver positions periodically while the tab is open.
  useEffect(() => {
    void loadLogistics();
    const t = setInterval(() => void loadLogistics(), 30000);
    return () => clearInterval(t);
  }, [loadLogistics]);

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (err) return <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{err}</div>;
  if (!data) return null;

  const liveDeliveries = data.deliveries.filter((d) => d.status !== "delivered" && d.status !== "cancelled");
  const pastDeliveries = data.deliveries.filter((d) => d.status === "delivered" || d.status === "cancelled");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold">Logistics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Packages and deliveries for {data.vessel}.</p>
      </div>

      {/* Active deliveries + live driver tracking */}
      {liveDeliveries.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Out for delivery</h2>
          {liveDeliveries.map((d) => (
            <Card key={d.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" />
                    <span className="font-semibold">Delivery {d.number ?? ""}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {d.driver ? `Driver: ${d.driver.name}` : "Driver: unassigned"}
                    {d.vehicle ? ` · ${d.vehicle.label}` : ""}
                    {d.destination ? ` · ${d.destination}` : ""}
                  </div>
                </div>
                {d.driver?.phone && (
                  <a href={`tel:${d.driver.phone.replace(/\s+/g, "")}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium transition hover:border-primary/50">
                    <Phone className="h-3.5 w-3.5" /> Call
                  </a>
                )}
              </div>
              {d.location ? (
                <div>
                  <iframe
                    title={`Driver location ${d.number ?? d.id}`}
                    className="h-52 w-full border-0"
                    loading="lazy"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${d.location.lng - 0.008}%2C${d.location.lat - 0.006}%2C${d.location.lng + 0.008}%2C${d.location.lat + 0.006}&layer=mapnik&marker=${d.location.lat}%2C${d.location.lng}`}
                  />
                  <div className="flex items-center justify-between px-4 py-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Updated {relAgo(d.location.updatedAt)}</span>
                    <a href={`https://www.google.com/maps?q=${d.location.lat},${d.location.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      Open in Maps <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="border-t border-border/40 px-4 py-2.5 text-[11px] text-muted-foreground">
                  <Clock className="mr-1 inline h-3 w-3" /> Live location will appear here once the driver is en route.
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Incoming / in-warehouse packages */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Packages ({data.packages.active.length} active)</h2>
        {data.packages.active.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            <Package className="mx-auto mb-3 h-7 w-7 text-muted-foreground/40" />
            No packages currently in transit or awaiting delivery.
          </Card>
        ) : (
          data.packages.active.map((p) => <PackageRow key={p.id} p={p} />)
        )}
      </div>

      {/* History */}
      {(data.packages.done.length > 0 || pastDeliveries.length > 0) && (
        <div className="space-y-2">
          <button onClick={() => setShowDone((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <CheckCircle2 className="h-4 w-4" /> {showDone ? "Hide" : "Show"} completed ({data.packages.done.length})
          </button>
          {showDone && (
            <div className="space-y-2">
              {data.packages.done.map((p) => <PackageRow key={p.id} p={p} />)}
              {pastDeliveries.map((d) => (
                <Card key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3.5">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">Delivery {d.number ?? ""}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{d.status === "cancelled" ? "Cancelled" : `Delivered ${fmtDate(d.deliveredAt)}`}</span>
                  </div>
                  {d.podUrl && (
                    <a href={d.podUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium transition hover:border-primary/50">
                      <Download className="h-3.5 w-3.5" /> POD
                    </a>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Alerts (aggregated, vessel-scoped) ───────────────────────────────────────
type PortalAlert = { id: string; severity: "high" | "medium"; icon: any; title: string; detail?: string; go?: Tab };
const daysTo = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
const expiringWithin = (d: string | null | undefined, days: number) => {
  if (!d) return false;
  const n = daysTo(d);
  return n <= days && n >= -3650; // upcoming or recently lapsed, not ancient records
};

function AlertsTab({ onOpen }: { onOpen: (t: Tab) => void }) {
  const [alerts, setAlerts] = useState<PortalAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [reqR, crewR, visaR, permitR, finR, logR] = await Promise.allSettled([
        db.from("captain_requests").select("id, reference, title, status"),
        db.from("crew_members").select("id, full_name, first_name, last_name, passport_expiry_date"),
        db.from("visa_applications").select("id, given_name, surname, visa_expiry"),
        db.from("permits").select("id, permit_type, expiry_date"),
        authedFetch("/api/portal/finance").then((r) => r.json()).catch(() => null),
        authedFetch("/api/portal/logistics").then((r) => r.json()).catch(() => null),
      ]);
      const out: PortalAlert[] = [];

      // Overdue / outstanding invoices
      if (finR.status === "fulfilled" && finR.value?.invoices) {
        const overdue = finR.value.invoices.filter((i: any) => i.status === "overdue");
        if (overdue.length) out.push({ id: "fin-overdue", severity: "high", icon: Wallet, title: `${overdue.length} overdue invoice${overdue.length > 1 ? "s" : ""}`, detail: `${money(overdue.reduce((s: number, i: any) => s + i.balance, 0), finR.value.summary?.currency ?? "AED")} past due`, go: "invoices" });
        else if (finR.value.summary?.outstanding > 0) out.push({ id: "fin-out", severity: "medium", icon: Wallet, title: "Outstanding balance", detail: money(finR.value.summary.outstanding, finR.value.summary.currency), go: "balances" });
      }

      // Expiring crew passports
      if (crewR.status === "fulfilled") for (const c of (crewR.value.data ?? [])) {
        if (expiringWithin(c.passport_expiry_date, 90)) {
          const n = daysTo(c.passport_expiry_date);
          const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Crew";
          out.push({ id: `pp-${c.id}`, severity: n <= 30 ? "high" : "medium", icon: Users, title: `${name} — passport ${n < 0 ? "expired" : `expires in ${n}d`}`, detail: fmtDate(c.passport_expiry_date), go: "crew" });
        }
      }
      // Expiring visas
      if (visaR.status === "fulfilled") for (const v of (visaR.value.data ?? [])) {
        if (expiringWithin(v.visa_expiry, 90)) {
          const n = daysTo(v.visa_expiry);
          const name = [v.given_name, v.surname].filter(Boolean).join(" ") || "Crew";
          out.push({ id: `visa-${v.id}`, severity: n <= 30 ? "high" : "medium", icon: Plane, title: `${name} — visa ${n < 0 ? "expired" : `expires in ${n}d`}`, detail: fmtDate(v.visa_expiry), go: "documents" });
        }
      }
      // Expiring permits
      if (permitR.status === "fulfilled") for (const p of (permitR.value.data ?? [])) {
        if (expiringWithin(p.expiry_date, 60)) {
          const n = daysTo(p.expiry_date);
          out.push({ id: `permit-${p.id}`, severity: n <= 21 ? "high" : "medium", icon: Shield, title: `${(p.permit_type ?? "Permit").replace(/_/g, " ")} ${n < 0 ? "expired" : `expires in ${n}d`}`, detail: fmtDate(p.expiry_date), go: "documents" });
        }
      }

      // Logistics — packages out for delivery / awaiting
      if (logR.status === "fulfilled" && logR.value?.packages) {
        const active = logR.value.packages.active ?? [];
        const outForDelivery = active.filter((p: any) => p.status === "out_for_delivery").length;
        if (outForDelivery) out.push({ id: "log-ofd", severity: "medium", icon: Truck, title: `${outForDelivery} package${outForDelivery > 1 ? "s" : ""} out for delivery`, go: "logistics" });
        else if (active.length) out.push({ id: "log-active", severity: "medium", icon: Package, title: `${active.length} package${active.length > 1 ? "s" : ""} awaiting delivery`, go: "logistics" });
      }

      // Open service requests
      if (reqR.status === "fulfilled") {
        const open = (reqR.value.data ?? []).filter((r: any) => !["closed", "cancelled", "completed", "resolved"].includes((r.status ?? "").toLowerCase()));
        if (open.length) out.push({ id: "req-open", severity: "medium", icon: LifeBuoy, title: `${open.length} open service request${open.length > 1 ? "s" : ""}`, go: "requests" });
      }

      const rank = { high: 0, medium: 1 };
      out.sort((a, b) => rank[a.severity] - rank[b.severity]);
      setAlerts(out);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Alerts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Everything that needs your attention across the vessel.</p>
      </div>
      {alerts.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
          <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-400" />
          <p className="font-semibold">All clear</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">No expiring documents, overdue invoices or pending deliveries right now.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <button key={a.id} onClick={() => a.go && onOpen(a.go)} disabled={!a.go}
                    className={cn("flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition",
                      a.severity === "high" ? "border-red-500/30 bg-red-500/5 hover:bg-red-500/10" : "border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10",
                      !a.go && "cursor-default")}>
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", a.severity === "high" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400")}>
                <a.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{a.title}</div>
                {a.detail && <div className="mt-0.5 text-xs text-muted-foreground">{a.detail}</div>}
              </div>
              {a.go && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Positions (vessel AIS / voyage) ───────────────────────────────────────────
function PositionsTab({ yacht }: { yacht: Yacht }) {
  const posAge = yacht.ais_position_at ? relAgo(yacht.ais_position_at) : null;
  const mt = yacht.mmsi
    ? `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${yacht.mmsi}`
    : yacht.imo_no ? `https://www.marinetraffic.com/en/ais/details/ships/imo:${yacht.imo_no}` : null;

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-center justify-between border-b border-border/30 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Positions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Live voyage &amp; AIS status for {yacht.vessel_name}.</p>
      </div>
      <Card className="p-5">
        <Row label="Status" value={yacht.status} />
        <Row label="Berth / location" value={yacht.berth || yacht.location} />
        <Row label="Destination" value={yacht.ais_destination} />
        <Row label="Speed" value={yacht.ais_speed != null ? `${yacht.ais_speed} kn` : ""} />
        <Row label="Last position" value={posAge ? `${posAge}` : ""} />
      </Card>
      <Card className="p-5">
        <Row label="Flag" value={yacht.flag} />
        <Row label="Port of registry" value={yacht.port_of_registry} />
        <Row label="Call sign" value={yacht.radio_call_sign} />
        <Row label="MMSI" value={yacht.mmsi} />
        <Row label="IMO" value={yacht.imo_no} />
        <Row label="Length overall" value={yacht.length_overall_m != null ? `${yacht.length_overall_m} m` : ""} />
      </Card>
      {mt ? (
        <a href={mt} target="_blank" rel="noreferrer"
           className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
          <Compass className="h-4 w-4" /> View live on MarineTraffic <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">Live tracking becomes available once an MMSI or IMO number is on file for your vessel.</p>
      )}
    </div>
  );
}

// ── Balances (QuickBooks summary) ─────────────────────────────────────────────
function BalancesTab() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await authedFetch("/api/portal/finance");
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "Could not load balances");
        setData(j);
      } catch (e: any) { setErr(e.message ?? "Could not load balances"); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (err) return <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">{err}</div>;
  if (!data) return null;

  const ccy = data.summary.currency;
  const unpaid = data.invoices.filter((i) => i.status !== "paid");
  const overdue = data.invoices.filter((i) => i.status === "overdue");
  const totalInvoiced = data.invoices.reduce((s, i) => s + i.total, 0);
  const totalPaid = totalInvoiced - data.invoices.reduce((s, i) => s + i.balance, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Balances</h1>
        <p className="mt-1 text-sm text-muted-foreground">Account statement for {data.vessel}.</p>
      </div>
      {!data.linked ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          <Wallet className="mx-auto mb-3 h-7 w-7 text-muted-foreground/40" />
          No billing account is linked to your vessel yet. Please contact Accounts &amp; Finance.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding</div><div className="mt-1 text-lg font-bold text-primary">{money(data.summary.outstanding, ccy)}</div></Card>
            <Card className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Overdue</div><div className={cn("mt-1 text-lg font-bold", overdue.length ? "text-red-400" : "")}>{money(overdue.reduce((s, i) => s + i.balance, 0), ccy)}</div></Card>
            <Card className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Paid to date</div><div className="mt-1 text-lg font-bold text-emerald-400">{money(totalPaid, ccy)}</div></Card>
            <Card className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total invoiced</div><div className="mt-1 text-lg font-bold">{money(totalInvoiced, ccy)}</div></Card>
          </div>

          <h2 className="pt-1 text-sm font-semibold text-muted-foreground">Unpaid invoices</h2>
          {unpaid.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">Nothing outstanding — your account is fully settled.</Card>
          ) : (
            <div className="space-y-2">
              {unpaid.map((i) => (
                <Card key={i.id} className="flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Invoice {i.docNumber ?? i.id}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", INV_BADGE[i.status])}>{i.status}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">Issued {fmtDate(i.date)}{i.dueDate ? ` · Due ${fmtDate(i.dueDate)}` : ""}</div>
                  </div>
                  <div className="text-right font-semibold text-amber-400">{money(i.balance, i.currency)}</div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Coming-soon scaffold (PMS / Charter / ISM) ────────────────────────────────
function ComingSoonTab({ icon: Icon, title, blurb }: { icon: any; title: string; blurb: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">{title}</h1>
      <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-background/40">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="max-w-sm text-sm text-muted-foreground">{blurb}</p>
        <span className="mt-4 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">Coming soon</span>
      </Card>
    </div>
  );
}

// ── Chat (staff ⇄ portal) ─────────────────────────────────────────────────────
function PortalChatTab({ link, displayName, chat, onChatChanged }: {
  link: CaptainLink; displayName: string;
  chat: PortalChat | null; onChatChanged: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    if (!chat?.id) { setMessages([]); setLoading(false); return; }
    const { data } = await db.from("portal_chat_messages")
      .select("id, sender_name, sender_role, body, created_at")
      .eq("chat_id", chat.id).order("created_at").limit(500);
    setMessages(data ?? []);
    setLoading(false);
  }, [chat?.id]);

  // Load + poll while the tab is open, and clear our unread counter.
  useEffect(() => {
    void loadMessages();
    const t = setInterval(() => void loadMessages(), 8000);
    return () => clearInterval(t);
  }, [loadMessages]);

  useEffect(() => {
    if (chat?.id && chat.portal_unread > 0) {
      void db.from("portal_chats").update({ portal_unread: 0 }).eq("id", chat.id).then(() => onChatChanged());
    }
  }, [chat?.id, chat?.portal_unread, messages.length]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  const readOnly = usePreview();
  const send = async () => {
    const body = draft.trim();
    if (!body || sending || readOnly) return;
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let chatId = chat?.id;
      if (!chatId) {
        const { data: created, error } = await db.from("portal_chats")
          .insert({ captain_account_id: link.id, yacht_id: link.yacht_id })
          .select("id").single();
        if (error || !created) return;
        chatId = created.id;
      }
      await db.from("portal_chat_messages").insert({
        chat_id: chatId, sender_user_id: user?.id, sender_name: displayName,
        sender_role: "portal", body,
      });
      setDraft("");
      onChatChanged();
      await loadMessages();
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Chat with JLS Yachts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {chat?.claimed_by_name
            ? `${chat.claimed_by_name} is looking after this conversation.`
            : "Send us a message — the team will reply here."}
        </p>
      </div>
      <Card className="flex flex-col p-4">
        <div className="max-h-[55vh] min-h-[200px] space-y-3 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No messages yet. Say hello — we're here to help.
            </p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={cn("flex", m.sender_role === "portal" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  m.sender_role === "portal"
                    ? "rounded-br-md bg-primary/20 text-foreground"
                    : "rounded-bl-md border border-border bg-background/60",
                )}>
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {m.sender_role === "portal" ? "You" : (m.sender_name || "JLS Yachts")} · {fmtDateTime(m.created_at)}
                  </div>
                  <div className="whitespace-pre-wrap">{m.body}</div>
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
        <div className="mt-3 flex items-end gap-2 border-t border-border/60 pt-3">
          <textarea
            value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
            placeholder="Write a message…"
            className={cn(inputCls, "resize-none py-2.5")}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(); }}
          />
          <PrimaryButton onClick={() => void send()} disabled={sending || !draft.trim()} className="h-11 w-11 shrink-0 rounded-xl px-0">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </PrimaryButton>
        </div>
      </Card>
    </div>
  );
}
