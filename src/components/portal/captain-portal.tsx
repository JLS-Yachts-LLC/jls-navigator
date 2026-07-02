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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Anchor, ArrowLeft, ChevronRight, FileCheck2, Fuel, Home, Laptop, LifeBuoy,
  Loader2, LogOut, Mail, MessageSquare, Phone, Plane, Plus, Send,
  Shield, Shirt, ShoppingCart, Users, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
// /portal is a standalone route (no staff shell), so pull the design tokens in
// directly — the `pds` wrapper class below reads them.
import "@/components/polaris-ui/tokens.css";

const db = supabase as any;

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
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Captain's Portal</div>
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

  const bootstrap = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setStage("signed-out"); return; }
    setUserEmail(session.user.email ?? "");

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
      {stage === "ready" && link && <PortalShell link={link} email={userEmail} onSignOut={signOut} />}
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
      <p className="mt-1 text-sm text-muted-foreground">Sign in to your captain's account.</p>
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
        <span className="text-foreground">{email}</span> isn't set up as a captain's account.
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
type Tab = "home" | "requests" | "crew" | "documents" | "directory";
const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "requests", label: "Requests", icon: MessageSquare },
  { key: "crew", label: "Crew", icon: Users },
  { key: "documents", label: "Documents", icon: FileCheck2 },
  { key: "directory", label: "Directory", icon: Phone },
];

function PortalShell({ link, email, onSignOut }: { link: CaptainLink; email: string; onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>("home");
  const [yacht, setYacht] = useState<Yacht | null>(null);
  const [newRequestCat, setNewRequestCat] = useState<string | null>(null);
  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    db.from("yachts")
      .select("id, vessel_name, vessel_type, flag, status, berth, location, vessel_image, ais_destination, ais_position_at, ais_speed, port_of_registry, length_overall_m, radio_call_sign, mmsi, imo_no")
      .eq("id", link.yacht_id).maybeSingle()
      .then(({ data }: any) => setYacht(data ?? null));
  }, [link.yacht_id]);

  const openNewRequest = (cat: string) => { setNewRequestCat(cat); };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6">
          <Brand />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold">{yacht?.vessel_name ?? "…"}</div>
              <div className="text-[11px] text-muted-foreground">{link.display_name ?? email}</div>
            </div>
            <button onClick={onSignOut} title="Sign out"
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Desktop / tablet tabs */}
        <nav className="hidden items-center gap-1 px-4 sm:flex sm:px-6">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => { setTab(t.key); setOpenRequestId(null); }}
                    className={cn(
                      "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition",
                      tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                    )}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 sm:pb-10">
        {tab === "home" && yacht && (
          <HomeTab yacht={yacht} onNewRequest={openNewRequest}
                   onSeeRequests={() => setTab("requests")}
                   onOpenRequest={(id) => { setTab("requests"); setOpenRequestId(id); }}
                   refreshKey={refreshKey} />
        )}
        {tab === "requests" && (
          <RequestsTab yachtId={link.yacht_id} openRequestId={openRequestId}
                       setOpenRequestId={setOpenRequestId}
                       onNewRequest={() => setNewRequestCat("general")}
                       displayName={link.display_name ?? email} refreshKey={refreshKey} />
        )}
        {tab === "crew" && <CrewTab yachtId={link.yacht_id} />}
        {tab === "documents" && <DocumentsTab yachtId={link.yacht_id} />}
        {tab === "directory" && <DirectoryTab />}
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border/60 bg-background/95 backdrop-blur sm:hidden"
           style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setOpenRequestId(null); }}
                  className={cn("flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition",
                                tab === t.key ? "text-primary" : "text-muted-foreground")}>
            <t.icon className="h-5 w-5" /> {t.label}
          </button>
        ))}
      </nav>

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

// ── Home ─────────────────────────────────────────────────────────────────────
function HomeTab({ yacht, onNewRequest, onSeeRequests, onOpenRequest, refreshKey }: {
  yacht: Yacht; onNewRequest: (cat: string) => void; onSeeRequests: () => void;
  onOpenRequest: (id: string) => void; refreshKey: number;
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

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
