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
import { PolarisMark } from "@/components/brand/PolarisMark";
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ChevronRight, FileCheck2, Fuel, Home, Laptop, LifeBuoy,
  Loader2, LogOut, Mail, MessageSquare, Phone, Plane, Plus, Send,
  Shield, Shirt, ShoppingCart, Users, X, Wallet, Truck, Package,
  MapPin, FileText, Download, ExternalLink, Clock, CheckCircle2,
  Bell, Compass, Wrench, CalendarRange, ShieldCheck, Menu, AlertTriangle, Eye,
  Pencil, Trash2, UserPlus, RotateCcw, ImagePlus,
  ClipboardCheck, NotebookPen, Anchor, IdCard, CalendarDays, Upload, BookOpen,
  SquareKanban, Boxes,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { portalFetch, setPortalYacht } from "@/lib/portal/portal-fetch";
import { perfMark, startPortalPerfProbe } from "@/lib/portal/portal-perf";
import { PortalBrandHeader, WrongAddressScreen, checkPortalAddress } from "./portal-address";
import { isLowStock } from "@/lib/portal/onboard";
import { moduleState, sectionEnabled, type PortalModuleState, type PortalModuleRow } from "@/lib/portal/portal-modules";
import { PmsSection } from "@/components/portal/sections/pms-section";
import { StockSection } from "@/components/portal/sections/stock-section";
import { ChecklistsSection } from "@/components/portal/sections/checklists-section";
import { HoursSection } from "@/components/portal/sections/hours-section";
import { HandoverSection } from "@/components/portal/sections/handover-section";
import { MovementsSection } from "@/components/portal/sections/movements-section";
import { QuoteDetail } from "@/components/portal/sections/quote-detail";
import { GatePassesSection } from "@/components/portal/sections/gatepasses-section";
import { OrdersSection } from "@/components/portal/sections/orders-section";
import { CalendarSection } from "@/components/portal/sections/calendar-section";
import { BriefSection } from "@/components/portal/sections/brief-section";
import { EsignPanel } from "@/components/portal/sections/esign-section";
import { CharterSection } from "@/components/portal/sections/charter-section";
import { TasksSection } from "@/components/portal/sections/tasks-section";
import { InventorySection } from "@/components/portal/sections/inventory-section";
import { IsmSection } from "@/components/portal/sections/ism-section";
import { canApproveRequisition, hiddenSections, canSeeFinance, canManageVessel } from "@/lib/portal/portal-positions";
import { cn } from "@/lib/utils";
import { BoatPortal } from "./boat-portal";
// /portal is a standalone route (no staff shell), so pull the design tokens in
// directly — the `pds` wrapper class below reads them.
import "@/components/polaris-ui/tokens.css";
import "./portal-themes.css";
import { AppearanceButton, PortalThemeContext } from "./portal-appearance";
import { cachedPortalTheme, ensureThemeFonts, rememberPortalTheme, resolvePortalTheme, themeClasses, type PortalTheme } from "@/lib/portal/portal-theme";

const db = supabase as any;

// Admin "preview as captain" mode: an admin opens /portal?previewCaptain=<id> to
// see a captain's portal read-only. Writes are blocked (this isn't their session).
export const PreviewContext = createContext(false);
const usePreview = () => useContext(PreviewContext);

// ── Types ─────────────────────────────────────────────────────────────────────
type CaptainLink = { id: string; yacht_id: string; display_name: string | null; position: string | null };
/** The portal account a chat belongs to — a yacht's or a managed boat's. */
export type ChatAccount = { id: string; yacht_id: string | null; boat_id?: string | null };
/** A small-boat owner's link (captain_accounts.boat_id) — served by BoatPortal, not PortalShell. */
type BoatOwnerLink = { id: string; display_name: string | null };
type AccountRow = { id: string; yacht_id: string | null; boat_id: string | null; display_name: string | null; position: string | null; yachts?: { vessel_name: string } | null };
/** A yacht this login can switch to (logins linked to several yachts). */
type VesselChoice = { link: CaptainLink; name: string };
const YACHT_KEY = "polaris.portal.yacht";
type Yacht = {
  id: string; vessel_name: string; vessel_type: string | null; flag: string | null;
  status: string | null; berth: string | null; location: string | null;
  vessel_image: string | null; ais_destination: string | null;
  ais_position_at: string | null; ais_speed: number | null;
  port_of_registry: string | null; length_overall_m: number | null;
  radio_call_sign: string | null; mmsi: string | null; imo_no: string | null;
  logo_url: string | null;
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
      {/* The Polaris star — the same mark as the staff login, the app's top bar
          and the browser tab. Decorative: the words beside it name the portal. */}
      <PolarisMark size={36} title="" />
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
type Stage = "loading" | "signed-out" | "not-captain" | "wrong-address" | "mfa-enroll" | "mfa-verify" | "ready" | "reset-password" | "link-expired";

// Read once, before the Supabase client consumes the URL: a password-reset link
// lands here as #access_token=…&type=recovery (or #error=… once it has expired).
const LANDED_WITH = typeof window === "undefined" ? null : (() => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (params.get("error") || params.get("error_code")) return "link-expired" as const;
  if (params.get("type") === "recovery") return "recovery" as const;
  return null;
})();

// Temporary: time the first load (long tasks, click delay) — see lib/portal/portal-perf.
startPortalPerfProbe();

export function CaptainPortal() {
  const [stage, setStage] = useState<Stage>("loading");
  useEffect(() => { perfMark(`stage:${stage}`); }, [stage]);
  const [link, setLinkState] = useState<CaptainLink | null>(null);
  const [vessels, setVessels] = useState<VesselChoice[]>([]);
  /** Put a yacht on screen: remembered in this browser and named on every portal API call. */
  const setLink = useCallback((l: CaptainLink | null) => {
    setLinkState(l);
    setPortalYacht(l?.yacht_id ?? null);
    if (l) { try { window.localStorage.setItem(YACHT_KEY, l.yacht_id); } catch { /* private mode */ } }
  }, []);
  const [boatOwner, setBoatOwner] = useState<BoatOwnerLink | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [preview, setPreview] = useState(false);
  const [wrongHome, setWrongHome] = useState<string | null>(null);

  const [resetHandled, setResetHandled] = useState(false);
  // Bridge on the server render; the browser's last look straight after mount, so
  // hydration matches and there's no lasting flash of the default.
  const [theme, setThemeState] = useState<PortalTheme>("bridge");
  useEffect(() => { const t = cachedPortalTheme(); ensureThemeFonts(t); setThemeState(t); }, []);
  const setTheme = useCallback((t: PortalTheme) => { setThemeState(t); if (!preview) rememberPortalTheme(t); }, [preview]);

  const bootstrap = useCallback(async () => {
    if (LANDED_WITH === "link-expired" && !resetHandled) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setStage("link-expired"); return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (LANDED_WITH === "recovery" && session && !resetHandled) {
      setUserEmail(session.user.email ?? "");
      setStage("reset-password"); return;
    }
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
        .select("id, yacht_id, boat_id, display_name, position")
        .eq("id", previewId).eq("active", true).maybeSingle() as { data: AccountRow | null };
      if (cap?.yacht_id) { setLink({ ...cap, yacht_id: cap.yacht_id }); setPreview(true); setStage("ready"); return; }
      if (cap?.boat_id) { setBoatOwner(cap); setPreview(true); setStage("ready"); return; }
      setStage("not-captain"); return;
    }

    // A login is linked to a yacht, or to one or more managed boats (one row
    // per boat). A yacht link wins if a login somehow has both.
    const { data: links } = await db.from("captain_accounts")
      .select("id, yacht_id, boat_id, display_name, position, yachts(vessel_name)")
      .eq("user_id", session.user.id).eq("active", true)
      .order("created_at", { ascending: true }) as { data: AccountRow[] | null };
    // Several yachts on one login: offer a switcher, and open the one used last.
    const yachtLinks = (links ?? []).filter((l) => l.yacht_id);
    setVessels(yachtLinks.map((l) => ({
      link: { id: l.id, yacht_id: l.yacht_id!, display_name: l.display_name, position: l.position },
      name: l.yachts?.vessel_name ?? "Vessel",
    })));
    let lastYacht: string | null = null;
    try { lastYacht = window.localStorage.getItem(YACHT_KEY); } catch { /* private mode */ }
    const yachtLink = yachtLinks.find((l) => l.yacht_id === lastYacht) ?? yachtLinks[0];
    const boatLink = links?.find((l) => l.boat_id);
    if (yachtLink) setLink({ ...yachtLink, yacht_id: yachtLink.yacht_id! });
    else if (boatLink) setBoatOwner(boatLink);
    else { setStage("not-captain"); return; }

    // Signed in at another client's own address (e.g. aquila.polaris…): send
    // them to theirs. Branding only — RLS already limits them to their vessel.
    const address = await checkPortalAddress();
    if (address && !address.matches) { setWrongHome(address.home); setStage("wrong-address"); return; }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") { setStage("ready"); return; }
    if (aal?.nextLevel === "aal2") { setStage("mfa-verify"); return; }
    setStage("mfa-enroll");
  }, [resetHandled]);

  useEffect(() => { void bootstrap(); }, [bootstrap]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setLink(null);
    setBoatOwner(null);
    setStage("signed-out");
  }, []);

  // The look: the person's own choice, else their vessel's default, else Bridge.
  useEffect(() => {
    if (stage !== "ready") return;
    let alive = true;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const t = await resolvePortalTheme({ userId: session?.user.id ?? null, yachtId: link?.yacht_id ?? null, preview });
      if (!alive) return;
      ensureThemeFonts(t);
      setTheme(t);
    })();
    return () => { alive = false; };
  }, [stage, link?.yacht_id, preview, setTheme]);
  const look = themeClasses(theme);

  return (
    <PortalThemeContext.Provider value={{ theme, setTheme, preview }}>
    <div className={cn("pds pds-embed min-h-screen bg-background text-foreground", look.dark && "dark", look.className)}
         style={{ colorScheme: look.dark ? "dark" : "light" }}>
      {stage === "loading" && (
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {stage === "signed-out" && <LoginScreen onSignedIn={bootstrap} />}
      {stage === "reset-password" && (
        <ResetPasswordScreen email={userEmail}
                             onDone={() => { window.history.replaceState(null, "", window.location.pathname + window.location.search); setResetHandled(true); }}
                             onSignOut={signOut} />
      )}
      {stage === "link-expired" && (
        <AuthFrame>
          <h1 className="text-xl font-bold">That link has expired</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Password reset links only work for a short time and only once. Ask for a new one from the sign-in page.
          </p>
          <PrimaryButton onClick={() => { setResetHandled(true); setStage("signed-out"); }} className="mt-6 w-full">Back to sign in</PrimaryButton>
        </AuthFrame>
      )}
      {stage === "not-captain" && <NotCaptainScreen email={userEmail} onSignOut={signOut} />}
      {stage === "wrong-address" && wrongHome && <WrongAddressScreen home={wrongHome} onSignOut={signOut} />}
      {stage === "mfa-enroll" && <MfaEnrollScreen onDone={bootstrap} onSignOut={signOut} />}
      {stage === "mfa-verify" && <MfaVerifyScreen onDone={bootstrap} onSignOut={signOut} />}
      {stage === "ready" && !link && boatOwner && (
        <BoatPortal displayName={boatOwner.display_name} email={userEmail}
                    previewAccountId={preview ? boatOwner.id : null} onSignOut={signOut} />
      )}
      {stage === "ready" && link && (
        <PreviewContext.Provider value={preview}>
          <PortalShell key={link.id} link={link} email={userEmail} onSignOut={signOut} preview={preview}
                       vessels={preview ? [] : vessels} onSwitchVessel={(l) => setLink(l)} />
        </PreviewContext.Provider>
      )}
    </div>
    </PortalThemeContext.Provider>
  );
}

// ── Auth screens ──────────────────────────────────────────────────────────────
function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-8"><PortalBrandHeader fallback={<Brand />} /></div>
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
  const [forgot, setForgot] = useState<"off" | "form" | "sent">("off");

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    await fetch("/api/portal/forgot-password", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }),
    }).catch(() => null);
    setBusy(false);
    setForgot("sent");
  };

  if (forgot !== "off") {
    return (
      <AuthFrame>
        <h1 className="text-xl font-bold">Reset your password</h1>
        {forgot === "sent" ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              If <span className="text-foreground">{email.trim()}</span> has a Client Portal login, we've emailed it a link to choose a new
              password. It works for a short time only. Nothing arrived? Check junk, or contact JLS Yachts.
            </p>
            <PrimaryButton onClick={() => setForgot("off")} className="mt-6 w-full">Back to sign in</PrimaryButton>
          </>
        ) : (
          <form onSubmit={requestReset} className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">Enter the email you sign in with and we'll send you a reset link.</p>
            <div>
              <FieldLabel>Email</FieldLabel>
              <input className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <PrimaryButton type="submit" disabled={busy} className="w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Send reset link
            </PrimaryButton>
            <button type="button" onClick={() => setForgot("off")} className="w-full text-center text-xs text-muted-foreground hover:text-foreground">Back to sign in</button>
          </form>
        )}
      </AuthFrame>
    );
  }

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
        <button type="button" onClick={() => { setError(null); setForgot("form"); }}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground">Forgot your password?</button>
      </form>
    </AuthFrame>
  );
}

/**
 * Where a password-reset link lands. Supabase only lets a password change once
 * the session is MFA-verified, so a client with an authenticator confirms a
 * code first; then they choose the new password and carry on into the portal.
 */
function ResetPasswordScreen({ email, onDone, onSignOut }: { email: string; onDone: () => void; onSignOut: () => void }) {
  const [needsCode, setNeedsCode] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      setNeedsCode(data?.nextLevel === "aal2" && data?.currentLevel !== "aal2");
    });
  }, []);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.[0];
    if (!totp) { setBusy(false); setError("No authenticator found on this account."); return; }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: code.trim() });
    setBusy(false);
    if (error) { setError("That code didn't work — check the time on your phone and try the newest code."); return; }
    setNeedsCode(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) { setError("Use at least 10 characters."); return; }
    if (password !== confirm) { setError("The two passwords don't match."); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    onDone();
  };

  return (
    <AuthFrame>
      <h1 className="text-xl font-bold">Choose a new password</h1>
      <p className="mt-1 text-sm text-muted-foreground">{email}</p>
      {needsCode === null ? (
        <div className="mt-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : needsCode ? (
        <form onSubmit={verify} className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">First, enter the 6-digit code from your authenticator app.</p>
          <input className={cn(inputCls, "text-center font-mono text-lg tracking-[0.4em]")} inputMode="numeric" autoComplete="one-time-code"
                 maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="Authenticator code" />
          {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
          <PrimaryButton type="submit" disabled={busy || code.length !== 6} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />} Continue
          </PrimaryButton>
          <p className="text-center text-xs text-muted-foreground">Lost your phone? Contact JLS Yachts and we'll reset your authenticator.</p>
        </form>
      ) : (
        <form onSubmit={save} className="mt-6 space-y-4">
          <div>
            <FieldLabel>New password</FieldLabel>
            <input className={inputCls} type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <FieldLabel>Type it again</FieldLabel>
            <input className={inputCls} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
          <PrimaryButton type="submit" disabled={busy} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save and continue
          </PrimaryButton>
        </form>
      )}
      <button onClick={onSignOut} className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground">Cancel and sign out</button>
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
      <p className="mt-1 text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app. Lost your phone? Contact JLS Yachts and we'll reset it.</p>
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
  | "home" | "brief"
  | "alerts" | "positions" | "crew" | "documents" | "pms" | "balances" | "invoices" | "charter" | "ism" | "tasks" | "inventory" | "stock" | "checklists" | "hours" | "handover" | "movements" | "gatepasses" | "orders" | "calendar"
  | "requests" | "logistics" | "chat" | "directory"
  | "finances"; // legacy alias used by the Home module launcher → routes to Invoices/Finance

type NavItem = { key: Tab; label: string; icon: any };
type NavGroup = { title?: string; module?: "core" | "management"; items: NavItem[] };

// Left navigation, in the portal's two modules. AGENCY WITH JLS (core) is
// everything JLS does for the vessel as its agent; ON BOARD (management) is the
// crew's own tools, shown only when the vessel has that module switched on.
const NAV_GROUPS: NavGroup[] = [
  { items: [{ key: "home", label: "Home", icon: Home }, { key: "brief", label: "Today's brief", icon: BookOpen }] },
  {
    title: "Agency with JLS",
    module: "core",
    items: [
      { key: "alerts", label: "Alerts", icon: Bell },
      { key: "calendar", label: "Compliance calendar", icon: CalendarDays },
      { key: "positions", label: "Positions", icon: Compass },
      { key: "movements", label: "Arrivals & departures", icon: Anchor },
      { key: "gatepasses", label: "Gate passes", icon: IdCard },
      { key: "crew", label: "Crew & immigration", icon: Users },
      { key: "documents", label: "Documents", icon: FileCheck2 },
      { key: "orders", label: "Orders", icon: ShoppingCart },
      { key: "requests", label: "Requests", icon: LifeBuoy },
      // Balances hidden for now (8 Oct 2026) — the Statement of account on Today's brief and Invoices cover it.
      // { key: "balances", label: "Balances", icon: Wallet },
      { key: "invoices", label: "Invoices", icon: FileText },
      { key: "logistics", label: "Deliveries", icon: Truck },
      { key: "chat", label: "Chat", icon: MessageSquare },
      { key: "directory", label: "Directory", icon: Phone },
    ],
  },
  {
    title: "On board",
    module: "management",
    items: [
      { key: "tasks", label: "Tasks & backlog", icon: SquareKanban },
      { key: "inventory", label: "Inventory", icon: Boxes },
      { key: "stock", label: "Stock & requisitions", icon: Package },
      { key: "checklists", label: "Checklists", icon: ClipboardCheck },
      { key: "hours", label: "Hours of rest", icon: Clock },
      { key: "handover", label: "Handover log", icon: NotebookPen },
      { key: "pms", label: "Jobs & maintenance", icon: Wrench },
      { key: "charter", label: "Guests & charter", icon: CalendarRange },
      { key: "ism", label: "ISM & safety", icon: ShieldCheck },
    ],
  },
];
const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

// What this person sees: the vessel's modules (lib/portal/portal-modules) narrowed
// by their position (lib/portal/portal-positions).
function navGroupsFor(position: string | null, modules: PortalModuleState): NavGroup[] {
  const hide = hiddenSections(position);
  return NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => !hide.has(i.key) && sectionEnabled(i.key, modules)) }))
    .filter((g) => g.items.length > 0);
}

export type PortalChat = {
  id: string; captain_account_id: string; claimed_by_name: string | null;
  last_message_at: string | null; last_sender_role: string | null; portal_unread: number;
};
type ChatMessage = {
  id: string; sender_name: string | null; sender_role: "staff" | "portal"; body: string; created_at: string;
};

function PortalShell({ link, email, onSignOut, preview = false, vessels = [], onSwitchVessel }: {
  link: CaptainLink; email: string; onSignOut: () => void; preview?: boolean;
  vessels?: VesselChoice[]; onSwitchVessel?: (l: CaptainLink) => void;
}) {
  const [tab, setTab] = useState<Tab>("home");
  const [yacht, setYacht] = useState<Yacht | null>(null);
  const [newRequestCat, setNewRequestCat] = useState<string | null>(null);
  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [chat, setChat] = useState<PortalChat | null>(null);
  const [navOpen, setNavOpen] = useState(false); // mobile sidebar drawer
  const [moduleRows, setModuleRows] = useState<PortalModuleRow[] | null>(null);

  // Which modules the vessel has switched on (no rows = core only).
  useEffect(() => {
    db.from("yacht_portal_modules")
      .select("module, enabled, features")
      .eq("yacht_id", link.yacht_id)
      .then(({ data }: any) => { perfMark("modules"); setModuleRows(data ?? []); });
  }, [link.yacht_id]);
  const modules = useMemo(() => moduleState(moduleRows), [moduleRows]);

  useEffect(() => {
    db.from("yachts")
      .select("id, vessel_name, vessel_type, flag, status, berth, location, vessel_image, ais_destination, ais_position_at, ais_speed, port_of_registry, length_overall_m, radio_call_sign, mmsi, imo_no, logo_url")
      .eq("id", link.yacht_id).maybeSingle()
      .then(({ data }: any) => { perfMark("yacht"); setYacht(data ?? null); });
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

  // Sections this person may see: the vessel's modules, narrowed by position.
  const navGroups = useMemo(() => navGroupsFor(link.position, modules), [link.position, modules]);
  const allowedKeys = useMemo(() => new Set(navGroups.flatMap((g) => g.items.map((i) => i.key))), [navGroups]);
  const financeOk = canSeeFinance(link.position) && sectionEnabled("finances", modules);
  // If the current tab isn't visible for this person, fall back to Home.
  // ("finances" is the Home tile's legacy key for the Invoices section.)
  useEffect(() => {
    if (moduleRows === null) return; // still loading the vessel's modules
    const visible = tab === "home" || (tab === "finances" ? financeOk : allowedKeys.has(tab));
    if (!visible) setTab("home");
  }, [tab, allowedKeys, financeOk, moduleRows]);

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
          {yacht?.logo_url && (
            <div className="mb-2.5 flex h-14 items-center justify-center rounded-lg bg-white px-3 py-2">
              <img src={yacht.logo_url} alt={`${yacht.vessel_name} logo`} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">{vessels.length > 1 ? "Your vessels" : "Your vessel"}</div>
          {vessels.length > 1 && onSwitchVessel ? (
            <select aria-label="Switch vessel" value={link.yacht_id}
                    onChange={(e) => { const v = vessels.find((x) => x.link.yacht_id === e.target.value); if (v) onSwitchVessel(v.link); }}
                    className="mt-1 w-full rounded-lg border border-border bg-background/60 px-2 py-1.5 text-sm font-bold outline-none focus:border-primary/50">
              {vessels.map((v) => <option key={v.link.id} value={v.link.yacht_id}>{v.name}</option>)}
            </select>
          ) : (
            <div className="mt-0.5 truncate text-sm font-bold">{yacht?.vessel_name ?? "…"}</div>
          )}
          <div className="truncate text-[11px] text-muted-foreground">{link.display_name ?? email}</div>
        </div>

        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 pb-4">
          {navGroups.map((g, gi) => (
            <div key={gi}>
              {g.title && (
                <div className="flex items-center gap-1.5 px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                  <span className={cn("h-1.5 w-1.5 rounded-full", g.module === "management" ? "bg-teal-400/80" : "bg-primary/80")} />
                  <span className="flex-1">{g.title}</span>
                </div>
              )}
              <div className="space-y-0.5">
                {g.items.map((t) => (
                  <button key={t.key} onClick={() => { perfMark(`nav:${t.key}`); setTab(t.key); setOpenRequestId(null); setNavOpen(false); }}
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

        <AppearanceButton />
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
        {/* The task board has five columns — give it the screen's width, not the reading column's. */}
        <main className={cn("mx-auto w-full flex-1 px-4 pb-16 pt-5 sm:px-8 sm:pb-10", tab === "tasks" ? "max-w-[1600px]" : "max-w-5xl")}>
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
                   unread={unread} financeOk={financeOk} modules={modules} allowedKeys={allowedKeys}
                   refreshKey={refreshKey}
                   canEditLogo={canManageVessel(link.position) && !preview}
                   onLogoChanged={(logo_url) => setYacht((y) => (y ? { ...y, logo_url } : y))} />
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
        {tab === "movements" && (
          <MovementsSection yachtId={link.yacht_id} canEdit={!preview}
                            onOpenRequest={(id) => { setTab("requests"); setOpenRequestId(id); }} />
        )}
        {tab === "calendar" && (
          <CalendarSection yachtId={link.yacht_id} includeIsm={allowedKeys.has("ism")} includeGatePasses={allowedKeys.has("gatepasses")}
                           onRenew={(cat) => setNewRequestCat(cat)} />
        )}
        {tab === "orders" && (
          <OrdersSection canEdit={!preview} onOpenRequest={(id) => { setTab("requests"); setOpenRequestId(id); }} />
        )}
        {tab === "gatepasses" && (
          <GatePassesSection canEdit={!preview} onOpenRequest={(id) => { setTab("requests"); setOpenRequestId(id); }} />
        )}
        {tab === "crew" && <CrewTab yachtId={link.yacht_id} />}
        {tab === "documents" && <DocumentsTab yachtId={link.yacht_id} canSend={!preview} />}
        {(tab === "invoices" || tab === "finances") && <FinancesTab onOpenRequest={(id) => { setTab("requests"); setOpenRequestId(id); }} />}
        {tab === "balances" && <BalancesTab />}
        {tab === "logistics" && <LogisticsTab yachtId={link.yacht_id} canBook={!preview} onOpenRequest={(id) => { setTab("requests"); setOpenRequestId(id); }} />}
        {tab === "alerts" && <AlertsTab yachtId={link.yacht_id} financeOk={financeOk} stockOk={allowedKeys.has("stock")} gatePassOk={allowedKeys.has("gatepasses")} onOpen={(t) => { setTab(t); setOpenRequestId(null); }} />}
        {tab === "positions" && yacht && <PositionsTab yacht={yacht} />}
        {/* On board (Management module). The tabs only appear when the vessel
            has the module and this position can see them; editing is off in
            staff preview (the server refuses it there too). */}
        {tab === "stock" && (
          <StockSection yachtId={link.yacht_id} canEdit={!preview} canApprove={canApproveRequisition(link.position)}
                        onOpenRequest={(id) => { setTab("requests"); setOpenRequestId(id); }} />
        )}
        {tab === "tasks" && <TasksSection yachtId={link.yacht_id} canEdit={!preview} />}
        {tab === "inventory" && <InventorySection yachtId={link.yacht_id} canEdit={!preview} showValue={canSeeFinance(link.position)} />}
        {tab === "checklists" && <ChecklistsSection yachtId={link.yacht_id} canEdit={!preview} />}
        {tab === "hours" && <HoursSection yachtId={link.yacht_id} canEdit={!preview} />}
        {tab === "handover" && <HandoverSection yachtId={link.yacht_id} canEdit={!preview} />}
        {tab === "pms" && <PmsSection yachtId={link.yacht_id} canEdit={!preview} />}
        {tab === "charter" && <CharterSection yachtId={link.yacht_id} canEdit={!preview} showFees={canSeeFinance(link.position)} />}
        {tab === "ism" && <IsmSection yachtId={link.yacht_id} canEdit={!preview} />}
        {tab === "directory" && <DirectoryTab />}
        {tab === "brief" && <BriefSection yachtId={link.yacht_id} preview={preview} onOpen={(t) => { setTab(t); setOpenRequestId(null); }} />}
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
// Core tiles — everything JLS does for the vessel as its agent.
const CORE_MODULES: ModuleDef[] = [
  { key: "brief",     label: "Today's brief",          blurb: "What's on today, what needs you & the week ahead", icon: BookOpen, accent: "text-primary bg-primary/10 border-primary/25" },
  { key: "orders",    label: "Order from JLS",         blurb: "Provisioning, fuel, uniform, spares — item by item", icon: ShoppingCart, accent: "text-primary bg-primary/10 border-primary/25" },
  { key: "requests",  label: "Requests",               blurb: "Permits, IT, visas & anything else",           icon: LifeBuoy,   accent: "text-primary bg-primary/10 border-primary/25" },
  { key: "movements", label: "Arrivals & departures",  blurb: "Pre-arrival form & crew sign-on / sign-off",   icon: Anchor,     accent: "text-primary bg-primary/10 border-primary/25" },
  { key: "gatepasses", label: "Gate passes",          blurb: "Contractors, visitors, vehicles — request & renew", icon: IdCard, accent: "text-primary bg-primary/10 border-primary/25" },
  { key: "crew",      label: "Crew & immigration",     blurb: "Roster, visas & passports",                    icon: Users,      accent: "text-primary bg-primary/10 border-primary/25" },
  { key: "finances",  label: "Invoices & statement",   blurb: "Invoices, quotations & statement",             icon: Wallet,     accent: "text-primary bg-primary/10 border-primary/25" },
  { key: "logistics", label: "Deliveries",             blurb: "Live driver position, deliveries & PODs",      icon: Truck,      accent: "text-primary bg-primary/10 border-primary/25" },
  { key: "documents", label: "Documents",              blurb: "Vessel papers, permits & visas",               icon: FileCheck2, accent: "text-primary bg-primary/10 border-primary/25" },
  { key: "chat",      label: "Chat & directory",       blurb: "Your agent, live chat & key contacts",         icon: MessageSquare, accent: "text-primary bg-primary/10 border-primary/25" },
];
// Management tiles — the crew's own tools; shown only when the vessel has the module.
const MANAGEMENT_MODULES: ModuleDef[] = [
  { key: "tasks",   label: "Tasks & backlog",    blurb: "The crew's board — backlog, to do, in progress & done", icon: SquareKanban, accent: "text-teal-300 bg-teal-500/10 border-teal-500/25" },
  { key: "inventory", label: "Inventory",        blurb: "What the vessel owns, where it is & its condition",   icon: Boxes,        accent: "text-teal-300 bg-teal-500/10 border-teal-500/25" },
  { key: "stock",   label: "Stock & requisitions", blurb: "What's on board, what's low & orders to JLS", icon: Package,       accent: "text-teal-300 bg-teal-500/10 border-teal-500/25" },
  { key: "checklists", label: "Checklists",       blurb: "Departure, arrival, daily rounds & more",        icon: ClipboardCheck, accent: "text-teal-300 bg-teal-500/10 border-teal-500/25" },
  { key: "hours",   label: "Hours of rest",        blurb: "Daily rest per crew, MLC minimums flagged",      icon: Clock,         accent: "text-teal-300 bg-teal-500/10 border-teal-500/25" },
  { key: "handover", label: "Handover log",        blurb: "Notes for the relief & the next watch",          icon: NotebookPen,   accent: "text-teal-300 bg-teal-500/10 border-teal-500/25" },
  { key: "pms",     label: "Jobs & maintenance", blurb: "Planned maintenance, running hours & defects", icon: Wrench,        accent: "text-teal-300 bg-teal-500/10 border-teal-500/25" },
  { key: "charter", label: "Guests & charter",   blurb: "Bookings, itineraries & guest preferences",   icon: CalendarRange, accent: "text-teal-300 bg-teal-500/10 border-teal-500/25" },
  { key: "ism",     label: "ISM & safety",       blurb: "Certificates, drills & the safety record",    icon: ShieldCheck,   accent: "text-teal-300 bg-teal-500/10 border-teal-500/25" },
];

function ModuleTiles({ defs, onOpen, unread }: { defs: ModuleDef[]; onOpen: (t: Tab) => void; unread: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {defs.map((m) => (
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
  );
}

function ModuleLauncher({ onOpen, unread, financeOk, modules, allowedKeys }: {
  onOpen: (t: Tab) => void; unread: number; financeOk: boolean; modules: PortalModuleState; allowedKeys: Set<Tab>;
}) {
  // A tile shows only when its section is on for the vessel AND this position.
  const core = CORE_MODULES.filter((m) => (m.key === "finances" ? financeOk : allowedKeys.has(m.key)));
  const management = modules.management.enabled ? MANAGEMENT_MODULES.filter((m) => allowedKeys.has(m.key)) : [];
  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary/80" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Agency with JLS</h2>
          <span className="hidden text-[11px] text-muted-foreground/60 sm:inline">Everything we do for your vessel as your agent</span>
        </div>
        <ModuleTiles defs={core} onOpen={onOpen} unread={unread} />
      </section>
      {management.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-teal-400/80" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">On board</h2>
            <span className="hidden text-[11px] text-muted-foreground/60 sm:inline">Your crew's own tools — JLS only sees what you send across</span>
          </div>
          <ModuleTiles defs={management} onOpen={onOpen} unread={0} />
        </section>
      )}
    </div>
  );
}

// ── Home ─────────────────────────────────────────────────────────────────────
// ── Vessel logo ─────────────────────────────────────────────────────────────
/**
 * The vessel's badge on the Home hero. Shown on a white tile so a dark or
 * transparent logo still reads on the portal's navy. Positions that may manage
 * the vessel can upload, replace or remove it — through /api/portal/vessel-logo,
 * since portal logins have no Storage write of their own.
 */
function VesselLogo({ yacht, canEdit, onChanged }: { yacht: Yacht; canEdit: boolean; onChanged: (url: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  if (!yacht.logo_url && !canEdit) return null;

  const send = async (init: RequestInit) => {
    setBusy(true);
    try {
      const res = await portalFetch("/api/portal/vessel-logo", init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not save the logo.");
      onChanged(body.logoUrl ?? null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not save the logo.");
    } finally {
      setBusy(false);
    }
  };
  const upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("That image is over 2 MB — please use a smaller one."); return; }
    const form = new FormData();
    form.append("file", file);
    void send({ method: "POST", body: form });
  };

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      {yacht.logo_url ? (
        <div className="flex h-16 w-28 items-center justify-center rounded-xl bg-white px-2.5 py-2 sm:h-20 sm:w-36">
          <img src={yacht.logo_url} alt={`${yacht.vessel_name} logo`} className="max-h-full max-w-full object-contain" />
        </div>
      ) : (
        <label className={cn(
          "flex h-16 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-foreground sm:h-20 sm:w-36",
          busy && "pointer-events-none opacity-50",
        )}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Add vessel logo
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={upload} />
        </label>
      )}
      {canEdit && yacht.logo_url && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <label className={cn("cursor-pointer hover:text-foreground", busy && "pointer-events-none opacity-50")}>
            {busy ? "Saving…" : "Change"}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={upload} />
          </label>
          <span aria-hidden>·</span>
          <button type="button" disabled={busy} className="hover:text-red-300"
                  onClick={() => { if (confirm("Remove the vessel logo?")) void send({ method: "DELETE" }); }}>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

function HomeTab({ yacht, onNewRequest, onSeeRequests, onOpenRequest, onOpenModule, unread, financeOk, modules, allowedKeys, refreshKey, canEditLogo, onLogoChanged }: {
  yacht: Yacht; onNewRequest: (cat: string) => void; onSeeRequests: () => void;
  onOpenRequest: (id: string) => void; onOpenModule: (t: Tab) => void; unread: number; financeOk: boolean;
  modules: PortalModuleState; allowedKeys: Set<Tab>; refreshKey: number;
  canEditLogo: boolean; onLogoChanged: (url: string | null) => void;
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
            <div className="flex items-center gap-4">
              <VesselLogo yacht={yacht} canEdit={canEditLogo} onChanged={onLogoChanged} />
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Your vessel</div>
                <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{yacht.vessel_name}</h1>
              </div>
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
      <ModuleLauncher onOpen={onOpenModule} unread={unread} financeOk={financeOk} modules={modules} allowedKeys={allowedKeys} />

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

export function RequestsTab({ yachtId, boatId = null, openRequestId, setOpenRequestId, onNewRequest, displayName, refreshKey }: {
  /** The vessel whose requests to list — a yacht, or (boat owners) a managed boat. */
  yachtId: string | null; boatId?: string | null;
  openRequestId: string | null; setOpenRequestId: (id: string | null) => void;
  onNewRequest: () => void; displayName: string; refreshKey: number;
}) {
  const [rows, setRows] = useState<PortalRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Filter to the vessel explicitly: a portal login's RLS already scopes it,
    // but in staff preview it's what keeps one client's list to their own.
    let q = db.from("captain_requests")
      .select("id, reference, category, title, details, priority, status, needed_by, created_at, updated_at");
    q = boatId ? q.eq("boat_id", boatId) : q.eq("yacht_id", yachtId);
    const { data } = await q.order("created_at", { ascending: false });
    setRows(data ?? []); setLoading(false);
  }, [yachtId, boatId]);
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
    if (!req || readOnly || !confirm("Cancel this request?")) return;
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
        {!readOnly && (req.status === "new" || req.status === "acknowledged") && (
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
export function NewRequestSheet({ yachtId, boatId = null, initialCategory, onClose, onCreated }: {
  yachtId: string | null; boatId?: string | null; initialCategory: string; onClose: () => void; onCreated: (id: string) => void;
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
      ...(boatId ? { boat_id: boatId } : { yacht_id: yachtId }), created_by: user?.id, category,
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
// Read and written through /api/portal/crew — passports live on a table the
// portal can't read directly, and crew changes go through the server's checks.
type PortalCrew = Crew & {
  middle_name: string | null; department: string | null; gender: string | null;
  date_of_birth: string | null; email: string | null; phone: string | null;
  passport_verified: boolean;
};

const CREW_CURRENT = new Set(["active", "on_leave"]);
const CREW_STATUS_LABEL: Record<string, string> = { active: "active", on_leave: "on leave", off_signed: "signed off" };
const crewName = (c: { full_name: string | null; first_name: string | null; last_name: string | null }) =>
  c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";

async function crewRequest(path: string, init: RequestInit = {}) {
  const res = await portalFetch(path, {
    ...init,
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong — please try again.");
  return body;
}

function CrewTab({ yachtId }: { yachtId: string }) {
  const [rows, setRows] = useState<PortalCrew[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [editing, setEditing] = useState<PortalCrew | "new" | null>(null);
  const [removing, setRemoving] = useState<PortalCrew | null>(null);

  const load = useCallback(async () => {
    try {
      const body = await crewRequest("/api/portal/crew");
      setRows(body.crew ?? []);
      setCanManage(!!body.canManage);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the crew list.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load, yachtId]);

  const current = rows.filter((c) => CREW_CURRENT.has(c.status ?? "active"));
  const past = rows.filter((c) => !CREW_CURRENT.has(c.status ?? "active"));
  const shown = showPast ? [...current, ...past] : current;

  const signBackOn = async (c: PortalCrew) => {
    try {
      await crewRequest(`/api/portal/crew?id=${c.id}`, { method: "PATCH", body: JSON.stringify({ status: "active" }) });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not sign them back on.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold">Crew on your vessel</h1>
        <div className="flex items-center gap-2">
          {past.length > 0 && (
            <button type="button" onClick={() => setShowPast((v) => !v)}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground">
              {showPast ? "Hide" : "Show"} signed off ({past.length})
            </button>
          )}
          {canManage && (
            <PrimaryButton onClick={() => setEditing("new")} className="min-h-9 px-4 text-xs">
              <UserPlus className="h-4 w-4" /> Add crew
            </PrimaryButton>
          )}
        </div>
      </div>
      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <Card className="px-6 py-10 text-center text-sm text-red-300">{error}</Card>
      ) : shown.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted-foreground">
          {canManage ? "No crew yet — use Add crew to start your list." : "No crew records yet."}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((c) => {
            const isPast = !CREW_CURRENT.has(c.status ?? "active");
            const expiring = c.passport_expiry_date && new Date(c.passport_expiry_date).getTime() - Date.now() < 180 * 86400000;
            return (
              <Card key={c.id} className={cn("p-4", isPast && "opacity-60")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{crewName(c)}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{[c.rank, c.nationality].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {c.status && (
                      <span className="rounded-full border border-border bg-background/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {CREW_STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    )}
                    {canManage && !isPast && (
                      <>
                        <button type="button" onClick={() => setEditing(c)} title="Edit" aria-label={`Edit ${crewName(c)}`}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background/60 hover:text-foreground">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => setRemoving(c)} title="Remove" aria-label={`Remove ${crewName(c)}`}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-500/10 hover:text-red-300">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    {canManage && isPast && (
                      <button type="button" onClick={() => void signBackOn(c)} title="Sign back on" aria-label={`Sign ${crewName(c)} back on`}
                              className="flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-muted-foreground transition hover:bg-background/60 hover:text-foreground">
                        <RotateCcw className="h-3.5 w-3.5" /> Sign on
                      </button>
                    )}
                  </div>
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
      {editing && (
        <CrewFormModal crew={editing === "new" ? null : editing} onClose={() => setEditing(null)}
                       onSaved={() => { setEditing(null); void load(); }} />
      )}
      {removing && (
        <RemoveCrewModal crew={removing} onClose={() => setRemoving(null)}
                         onRemoved={() => { setRemoving(null); void load(); }} />
      )}
    </div>
  );
}

const CREW_FORM_FIELDS = [
  "first_name", "middle_name", "last_name", "rank", "department", "nationality",
  "gender", "date_of_birth", "email", "phone", "passport_number", "passport_expiry_date",
] as const;
type CrewForm = Record<(typeof CREW_FORM_FIELDS)[number], string>;

function CrewFormModal({ crew, onClose, onSaved }: { crew: PortalCrew | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CrewForm>(() =>
    Object.fromEntries(CREW_FORM_FIELDS.map((k) => [k, ((crew as any)?.[k] as string | null) ?? ""])) as CrewForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passportLocked = !!crew?.passport_verified;
  const set = (k: keyof CrewForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    // A JLS-verified passport isn't sent — the server refuses to change it from here.
    const body: Record<string, string> = { ...form };
    if (passportLocked) { delete body.passport_number; delete body.passport_expiry_date; }
    try {
      await crewRequest(crew ? `/api/portal/crew?id=${crew.id}` : "/api/portal/crew", {
        method: crew ? "PATCH" : "POST", body: JSON.stringify(body),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{crew ? `Edit ${crewName(crew)}` : "Add crew member"}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><FieldLabel>First name</FieldLabel><input className={inputCls} required maxLength={120} value={form.first_name} onChange={set("first_name")} /></div>
            <div><FieldLabel>Middle name</FieldLabel><input className={inputCls} maxLength={120} value={form.middle_name} onChange={set("middle_name")} /></div>
            <div><FieldLabel>Last name</FieldLabel><input className={inputCls} required maxLength={120} value={form.last_name} onChange={set("last_name")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Rank</FieldLabel><input className={inputCls} maxLength={120} value={form.rank} onChange={set("rank")} placeholder="e.g. Bosun" /></div>
            <div>
              <FieldLabel>Department</FieldLabel>
              <select className={inputCls} value={form.department} onChange={set("department")}>
                <option value="">—</option>
                {["Deck", "Engine", "Interior", "Galley", "Other"].map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div><FieldLabel>Nationality</FieldLabel><input className={inputCls} maxLength={120} value={form.nationality} onChange={set("nationality")} /></div>
            <div>
              <FieldLabel>Gender</FieldLabel>
              <select className={inputCls} value={form.gender} onChange={set("gender")}>
                <option value="">—</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div><FieldLabel>Date of birth</FieldLabel><input className={inputCls} type="date" value={form.date_of_birth} onChange={set("date_of_birth")} /></div>
            <div><FieldLabel>Phone</FieldLabel><input className={inputCls} type="tel" maxLength={120} value={form.phone} onChange={set("phone")} /></div>
          </div>
          <div><FieldLabel>Email</FieldLabel><input className={inputCls} type="email" maxLength={120} value={form.email} onChange={set("email")} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Passport number</FieldLabel>
              <input className={cn(inputCls, "font-mono uppercase")} maxLength={30} disabled={passportLocked} value={form.passport_number} onChange={set("passport_number")} /></div>
            <div><FieldLabel>Passport expiry</FieldLabel>
              <input className={inputCls} type="date" disabled={passportLocked} value={form.passport_expiry_date} onChange={set("passport_expiry_date")} /></div>
          </div>
          {passportLocked && (
            <p className="-mt-2 text-xs text-muted-foreground">This passport has been verified by JLS. To change it, send us a Visa &amp; Immigration request.</p>
          )}
          {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
          <PrimaryButton type="submit" disabled={busy || !form.first_name.trim() || !form.last_name.trim()} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {crew ? "Save changes" : "Add to crew"}
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}

function RemoveCrewModal({ crew, onClose, onRemoved }: { crew: PortalCrew; onClose: () => void; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true); setError(null);
    try {
      await crewRequest(`/api/portal/crew?id=${crew.id}`, { method: "DELETE" });
      onRemoved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove.");
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <h2 className="text-lg font-bold">Remove {crewName(crew)}?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          They'll be taken off your crew list. If JLS holds any records for them (visas, documents or sign-on history),
          they're signed off rather than deleted, so those records are kept and you can sign them back on later.
        </p>
        {error && <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-border px-5 text-sm font-medium text-muted-foreground hover:text-foreground">Cancel</button>
          <button type="button" onClick={() => void remove()} disabled={busy}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-500/90 px-5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Documents (permits + visas) ──────────────────────────────────────────────
const CLIENT_DOC_TYPES = [
  { value: "crew_document", label: "Crew document (passport, visa, certificate)" },
  { value: "vessel_certificate", label: "Vessel certificate" },
  { value: "insurance", label: "Insurance" },
  { value: "registration", label: "Registration / licence" },
  { value: "contract", label: "Contract or agreement" },
  { value: "other", label: "Something else" },
];

/** A document the client sends to JLS — stored with the vessel's documents and flagged to the team. */
function SendDocumentModal({ onClose, onSent }: { onClose: () => void; onSent: (title: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("crew_document");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const { uploadPortalFile } = await import("@/components/portal/sections/section-ui");
      await uploadPortalFile({ target: "client_document", file, title: title.trim() || file.name, doc_type: docType });
      onSent(title.trim() || file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the document."); setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-lg rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Send JLS a document</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-4 space-y-4">
          <div>
            <FieldLabel>File</FieldLabel>
            <input type="file" required accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.doc,.docx,.xlsx" aria-label="Document file"
                   onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, "")); }}
                   className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground" />
          </div>
          <div>
            <FieldLabel>What is it?</FieldLabel>
            <select className={inputCls} value={docType} onChange={(e) => setDocType(e.target.value)}>
              {CLIENT_DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Title</FieldLabel>
            <input className={inputCls} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chief Engineer passport — renewed" />
          </div>
          {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
          <PrimaryButton type="submit" disabled={busy || !file} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Send to JLS
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}

/**
 * A document the vessel can open. The stored location never reaches the browser:
 * the button asks /api/portal/documents/open, which re-checks that the document
 * belongs to this vessel before signing anything.
 */
function OpenDocumentButton({ kind, id, label = "Open" }: { kind: string; id: string; label?: string }) {
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const res = await portalFetch(`/api/portal/documents/open?type=${kind}&id=${id}`, { redirect: "follow" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "That document could not be opened.");
      }
      window.open(res.url, "_blank", "noreferrer");
    } catch (e) {
      alert(e instanceof Error ? e.message : "That document could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button" onClick={() => void open()} disabled={busy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-foreground transition hover:border-primary/50 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} {label}
    </button>
  );
}

type PortalDoc = { hasFile?: boolean };
type PortalPermit = Permit & PortalDoc & { license_no?: string | null };
type PortalVisa = Visa & PortalDoc;
type VesselDoc = PortalDoc & {
  id: string; title: string | null; file_name: string | null; doc_type: string | null; created_at: string | null;
};

function DocumentsTab({ yachtId, canSend = false }: { yachtId: string; canSend?: boolean }) {
  const [sending, setSending] = useState(false);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [permits, setPermits] = useState<PortalPermit[]>([]);
  const [visas, setVisas] = useState<PortalVisa[]>([]);
  const [vesselDocs, setVesselDocs] = useState<VesselDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await portalFetch("/api/portal/documents");
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? "Could not load documents");
        if (!alive) return;
        setPermits(body.permits ?? []);
        setVisas(body.visas ?? []);
        setVesselDocs(body.vesselDocuments ?? []);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not load documents");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [yachtId, reloadKey]);

  const typeLabel = (t: string) => t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (loading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (error) return <Card className="px-6 py-8 text-center text-sm text-muted-foreground">{error}</Card>;

  return (
    <div className="space-y-6">
      {canSend && (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <Upload className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold">Send JLS a document</div>
            <div className="text-xs text-muted-foreground">A crew passport, a renewed certificate, insurance, a contract — PDF, photo or Word, up to 15 MB.</div>
          </div>
          <PrimaryButton onClick={() => setSending(true)} className="min-h-9 px-4 text-xs"><Upload className="h-4 w-4" /> Send a document</PrimaryButton>
        </Card>
      )}
      {sentNote && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{sentNote}</div>}
      <EsignPanel />
      {sending && (
        <SendDocumentModal onClose={() => setSending(false)}
                           onSent={(title) => { setSending(false); setSentNote(`"${title}" sent to JLS — it's in your vessel documents below.`); setReloadKey((k) => k + 1); }} />
      )}
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
                  {p.hasFile && <OpenDocumentButton kind="permit" id={p.id} />}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Vessel documents</h2>
        {vesselDocs.length === 0 ? (
          <Card className="px-6 py-8 text-center text-sm text-muted-foreground">No documents have been shared for your vessel yet.</Card>
        ) : (
          <div className="space-y-2">
            {vesselDocs.map((d) => (
              <Card key={d.id} className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background/50">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{d.title ?? d.file_name ?? "Document"}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {[d.doc_type, d.created_at ? `Added ${fmtDate(d.created_at)}` : null].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                {d.hasFile && <OpenDocumentButton kind="vessel_doc" id={d.id} />}
              </Card>
            ))}
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
                {v.hasFile && <OpenDocumentButton kind="visa" id={v.id} />}
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
const authedFetch = (path: string) => portalFetch(path);
const money = (n: number, ccy: string) =>
  `${ccy} ${Number(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type FinanceData = {
  vessel: string; linked: boolean;
  invoices: { id: string; docNumber: string | null; date: string | null; dueDate: string | null; total: number; balance: number; currency: string; status: "paid" | "overdue" | "open"; company?: string }[];
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

type QuoteDecision = { qbo_estimate_id: string; decision: "approved" | "declined" | "query"; decided_by_name: string | null; created_at: string };

function FinancesTab({ onOpenRequest }: { onOpenRequest: (requestId: string) => void }) {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<"invoices" | "quotations">("invoices");
  const [decisions, setDecisions] = useState<QuoteDecision[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [openQuote, setOpenQuote] = useState<string | null>(null);

  const loadDecisions = useCallback(async () => {
    const res = await authedFetch("/api/portal/quotes").catch(() => null);
    const j = res && res.ok ? await res.json() : null;
    setDecisions(j?.decisions ?? []);
    setCanApprove(!!j?.canApprove);
  }, []);

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
    void loadDecisions();
  }, [loadDecisions]);

  /** The client's final word on a quotation (approve / decline), if any. */
  const decisionOf = (id: string) => decisions.find((d) => d.qbo_estimate_id === id && d.decision !== "query");

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
  const toReview = data.quotations.filter((q) => q.status === "pending" && !decisionOf(q.id));

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
            <Card className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Open balance</div><div className="mt-1 text-lg font-bold text-primary">{money(data.summary.outstanding, data.summary.currency)}</div></Card>
            <Card className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Invoices</div><div className="mt-1 text-lg font-bold">{data.summary.invoiceCount}</div></Card>
            <Card className="p-4"><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Quotations</div><div className="mt-1 text-lg font-bold">{data.summary.quotationCount}</div></Card>
          </div>

          {toReview.length > 0 && canApprove && (
            <button type="button" onClick={() => (toReview.length === 1 ? setOpenQuote(toReview[0].id) : setView("quotations"))}
                    className="flex w-full items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-4 text-left transition hover:bg-primary/15">
              <FileText className="h-5 w-5 shrink-0 text-primary" />
              <span className="flex-1 text-sm">
                <span className="font-semibold">{toReview.length === 1 ? `Quotation ${toReview[0].docNumber ?? ""} is waiting for your approval` : `${toReview.length} quotations are waiting for your approval`}</span>
                <span className="block text-xs text-muted-foreground">Review the lines and approve, decline or ask JLS a question.</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          )}

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
                    <div className="mt-0.5 text-xs text-muted-foreground">Issued {fmtDate(i.date)}{i.status !== "paid" && i.dueDate ? ` · Due ${fmtDate(i.dueDate)}` : ""}{i.company && i.company !== "JLS Yachts" ? ` · ${i.company}` : ""}</div>
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
              {view === "quotations" && data.quotations.map((q) => {
                const d = decisionOf(q.id);
                return (
                  <button key={q.id} type="button" onClick={() => setOpenQuote(q.id)}
                          className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-card/80 p-4 text-left transition hover:border-primary/50">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">Quotation {q.docNumber ?? q.id}</span>
                        {d ? (
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", d.decision === "approved" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400")}>
                            {d.decision === "approved" ? "you approved" : "you declined"}
                          </span>
                        ) : (
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", QUOTE_BADGE[q.status] ?? "bg-slate-500/15 text-slate-300")}>
                            {q.status === "pending" ? "awaiting approval" : q.status}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Dated {fmtDate(q.date)}{q.expiryDate ? ` · Valid to ${fmtDate(q.expiryDate)}` : ""}
                        {d?.decided_by_name && ` · ${d.decided_by_name}, ${fmtDate(d.created_at)}`}
                      </div>
                    </div>
                    <div className="text-right font-semibold">{money(q.total, q.currency)}</div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
      {openQuote && (
        <QuoteDetail id={openQuote} onClose={() => setOpenQuote(null)} onDecided={() => void loadDecisions()}
                     onOpenRequest={(id) => { setOpenQuote(null); onOpenRequest(id); }} />
      )}
    </div>
  );
}

// ── Logistics (ShipSync packages & deliveries, vessel-scoped) ─────────────────
/**
 * Ask JLS to collect something from the boat — returns, items for repair,
 * outgoing parcels, luggage. Raised as a Client Request the logistics team
 * schedules; the conversation and driver details follow on that request.
 */
function CollectionSheet({ yachtId, onClose, onBooked }: {
  yachtId: string; onClose: () => void; onBooked: (r: { id: string; reference: string | null }) => void;
}) {
  const [what, setWhat] = useState("");
  const [pieces, setPieces] = useState("1");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("JLS Yachts office");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [window_, setWindow] = useState("Any time");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    db.from("yachts").select("berth, location").eq("id", yachtId).maybeSingle().then(({ data }: any) => {
      const where = [data?.berth && `Berth ${data.berth}`, data?.location].filter(Boolean).join(", ");
      if (where) setFrom((f) => f || where);
    });
  }, [yachtId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    const when = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    const details = [
      `Collection: ${what.trim()}`,
      `Pieces: ${pieces || "1"}`,
      `Collect from: ${from.trim() || "the vessel"}`,
      `Deliver to: ${to.trim() || "JLS Yachts office"}`,
      `When: ${when}, ${window_}`,
      contact.trim() ? `On-board contact: ${contact.trim()}` : null,
      notes.trim() ? `\nNotes: ${notes.trim()}` : null,
    ].filter(Boolean).join("\n");
    const { data, error } = await db.from("captain_requests").insert({
      yacht_id: yachtId, created_by: user?.id, category: "general",
      title: `Collection — ${what.trim()}`.slice(0, 200), details,
      priority: date <= new Date().toISOString().slice(0, 10) ? "high" : "normal", needed_by: date,
    }).select("id, reference").single();
    setBusy(false);
    if (error || !data) { setError(error?.message ?? "Could not book the collection."); return; }
    onBooked({ id: data.id, reference: data.reference ?? null });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Book a collection</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2"><FieldLabel>What needs collecting?</FieldLabel>
            <input className={inputCls} required maxLength={160} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="e.g. Tender outboard for repair, returns to supplier" /></div>
          <div><FieldLabel>Pieces</FieldLabel>
            <input className={inputCls} type="number" min={1} value={pieces} onChange={(e) => setPieces(e.target.value)} /></div>
          <div><FieldLabel>Date</FieldLabel>
            <input className={inputCls} type="date" required min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="col-span-2"><FieldLabel>Time</FieldLabel>
            <select className={inputCls} value={window_} onChange={(e) => setWindow(e.target.value)}>
              {["Any time", "Morning (08:00–12:00)", "Afternoon (12:00–17:00)", "Evening (17:00–20:00)"].map((w) => <option key={w}>{w}</option>)}
            </select></div>
          <div className="col-span-2"><FieldLabel>Collect from</FieldLabel>
            <input className={inputCls} maxLength={200} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Marina and berth" /></div>
          <div className="col-span-2"><FieldLabel>Deliver to</FieldLabel>
            <input className={inputCls} maxLength={200} value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="col-span-2"><FieldLabel>On-board contact</FieldLabel>
            <input className={inputCls} maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Name and phone" /></div>
          <div className="col-span-2"><FieldLabel>Notes</FieldLabel>
            <textarea className={cn(inputCls, "min-h-[64px]")} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Size, weight, anything fragile…" /></div>
        </div>
        {error && <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{error}</div>}
        <PrimaryButton type="submit" disabled={busy || !what.trim()} className="mt-5 w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Book collection
        </PrimaryButton>
      </form>
    </div>
  );
}

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
  in_office: "In office", in_storage: "Warehouse", assigned: "Assigned",
  out_for_delivery: "Out for delivery", delivered: "Delivered",
  delivered_tbi: "Delivered - TBI", completed: "Completed",
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

function LogisticsTab({ yachtId, canBook = false, onOpenRequest }: { yachtId: string; canBook?: boolean; onOpenRequest?: (id: string) => void }) {
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<{ id: string; reference: string | null } | null>(null);
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">Logistics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Packages and deliveries for {data.vessel}.</p>
        </div>
        {canBook && (
          <PrimaryButton onClick={() => setBooking(true)} className="min-h-9 px-4 text-xs"><Truck className="h-4 w-4" /> Book a collection</PrimaryButton>
        )}
      </div>
      {booked && (
        <button type="button" onClick={() => onOpenRequest?.(booked.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-left text-sm text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="flex-1">Collection booked{booked.reference ? ` as ${booked.reference}` : ""} — JLS will confirm the driver and time.</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
      {booking && <CollectionSheet yachtId={yachtId} onClose={() => setBooking(false)} onBooked={(r) => { setBooking(false); setBooked(r); }} />}

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

function AlertsTab({ yachtId, onOpen, financeOk, stockOk, gatePassOk }: { yachtId: string; onOpen: (t: Tab) => void; financeOk: boolean; stockOk: boolean; gatePassOk: boolean }) {
  const [alerts, setAlerts] = useState<PortalAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [reqR, crewR, visaR, permitR, finR, logR, stockR, passR] = await Promise.allSettled([
        db.from("captain_requests").select("id, reference, title, status").eq("yacht_id", yachtId),
        db.from("crew_members").select("id, full_name, first_name, last_name, passport_expiry_date").eq("yacht_id", yachtId),
        db.from("visa_applications").select("id, given_name, surname, visa_expiry").eq("yacht_id", yachtId),
        db.from("permits").select("id, permit_type, expiry_date").eq("yacht_id", yachtId),
        financeOk ? authedFetch("/api/portal/finance").then((r) => r.json()).catch(() => null) : Promise.resolve(null),
        authedFetch("/api/portal/logistics").then((r) => r.json()).catch(() => null),
        stockOk ? db.from("onboard_stock_items").select("quantity, min_quantity, par_quantity").eq("yacht_id", yachtId) : Promise.resolve({ data: [] }),
        gatePassOk ? authedFetch("/api/portal/gatepasses").then((r) => r.json()).catch(() => null) : Promise.resolve(null),
      ]);
      const out: PortalAlert[] = [];

      // Overdue / outstanding invoices
      if (finR.status === "fulfilled" && finR.value?.invoices) {
        const overdue = finR.value.invoices.filter((i: any) => i.status === "overdue");
        if (overdue.length) out.push({ id: "fin-overdue", severity: "high", icon: Wallet, title: `${overdue.length} overdue invoice${overdue.length > 1 ? "s" : ""}`, detail: `${money(overdue.reduce((s: number, i: any) => s + i.balance, 0), finR.value.summary?.currency ?? "AED")} past due`, go: "invoices" });
        else if (finR.value.summary?.outstanding > 0) out.push({ id: "fin-out", severity: "medium", icon: Wallet, title: "Outstanding balance", detail: money(finR.value.summary.outstanding, finR.value.summary.currency), go: "invoices" });
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

      // Stock at or below its minimum (On board)
      if (stockR.status === "fulfilled") {
        const low = ((stockR.value as any).data ?? []).filter(isLowStock).length;
        if (low) out.push({ id: "stock-low", severity: "medium", icon: Package, title: `${low} stock item${low > 1 ? "s" : ""} at or below minimum`, detail: "Raise a requisition to top up", go: "stock" });
      }

      // Issued gate passes running out within 3 days
      if (passR.status === "fulfilled" && passR.value?.requests) {
        const today = new Date().toISOString().slice(0, 10);
        const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
        const ending = passR.value.requests.filter((p: any) => p.captain_requests?.status === "completed" && p.valid_to >= today && p.valid_to <= soon).length;
        if (ending) out.push({ id: "gp-ending", severity: "medium", icon: IdCard, title: `${ending} gate pass${ending > 1 ? "es" : ""} running out`, detail: "Renew if they're still needed", go: "gatepasses" });
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
  }, [financeOk, stockOk, gatePassOk, yachtId]);

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
  const [statementBusy, setStatementBusy] = useState(false);

  /** Today's open-item statement, aged, on JLS letterhead. */
  async function openStatement() {
    setStatementBusy(true);
    try {
      const res = await authedFetch("/api/portal/finance?statement=1");
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Could not create the statement.");
      window.open(URL.createObjectURL(await res.blob()), "_blank");
    } catch (e: any) { alert(e?.message ?? "Could not create the statement."); }
    finally { setStatementBusy(false); }
  }

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">Balances</h1>
          <p className="mt-1 text-sm text-muted-foreground">Account statement for {data.vessel}.</p>
        </div>
        {data.linked && (
          <button type="button" onClick={() => void openStatement()} disabled={statementBusy}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium transition hover:border-primary/50 disabled:opacity-50">
            {statementBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Statement PDF
          </button>
        )}
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
                    <div className="mt-0.5 text-xs text-muted-foreground">Issued {fmtDate(i.date)}{i.dueDate ? ` · Due ${fmtDate(i.dueDate)}` : ""}{i.company && i.company !== "JLS Yachts" ? ` · ${i.company}` : ""}</div>
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

// ── Chat (staff ⇄ portal) ─────────────────────────────────────────────────────
export function PortalChatTab({ link, displayName, chat, onChatChanged }: {
  link: ChatAccount; displayName: string;
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
          .insert({ captain_account_id: link.id, ...(link.boat_id ? { boat_id: link.boat_id } : { yacht_id: link.yacht_id }) })
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
