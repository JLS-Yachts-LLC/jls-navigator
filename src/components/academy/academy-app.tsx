/**
 * The Crew Academy page (/academy) — for crew a vessel has enrolled in training.
 *
 * A learner is one person on one vessel. They see only the courses enrolled to
 * them there (by group or by name) and their own results. Everything comes from
 * /api/academy; the login itself can read nothing from the database.
 *
 * Sign-in, set / reset password, the second sign-in step (authenticator app via
 * QR code, or an emailed code — /api/academy/mfa), the "My courses" list and the
 * course player (course-player.tsx, with the exercises in exercises.tsx) and
 * certificate downloads.
 *
 * The invite email is a password-set link that lands here (#type=recovery).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Award, CheckCircle2, Clock, CloudOff, Download, GraduationCap, Inbox, Library, ListChecks, Loader2, LogOut, Mail, Menu, RefreshCw,
  Send, Shield, ShieldCheck, Trash2, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PolarisMark } from "@/components/brand/PolarisMark";
import { cn } from "@/lib/utils";
import { CoursePlayer, type PlayerApi } from "@/components/academy/course-player";
import { openAuthedPdf } from "@/components/academy/open-pdf";
import {
  applyLocally, claimDevice, clearOffline, deviceOwner, flush, isOffline, loadCourse, loadHome, offlineMedia, offlineSupported,
  queue, queued, removeCourse, saveCourse, saveHome, savedCourses, updateSavedProgress,
} from "@/components/academy/academy-offline";
import type { BlockProgress, CourseContent } from "@/lib/academy/content";
import "@/components/polaris-ui/tokens.css";

type Stage = "loading" | "signed-out" | "reset-password" | "link-expired" | "not-learner" | "mfa" | "ready";

type CourseRow = {
  enrolmentId: string;
  status: "not_started" | "in_progress" | "completed" | "failed" | "expired";
  mandatory: boolean;
  dueDate: string | null;
  completedAt: string | null;
  score: number | null;
  expiresAt: string | null;
  certificate: string | null;
  course: { id: string; title: string; summary: string | null; category: string | null; minutes: number | null; from: string } | null;
};
type Home = {
  me: { displayName: string | null; email: string; sharedWithJls: boolean };
  vessel: { name: string; logo: string | null };
  todo: CourseRow[];
  done: CourseRow[];
  requests?: {
    id: string; status: "pending" | "approved" | "declined"; note: string | null; decisionNote: string | null;
    decidedBy: string | null; decidedAt: string | null; createdAt: string; course: string;
  }[];
};

// Read once, before the Supabase client consumes the URL hash.
const LANDED_WITH = typeof window === "undefined" ? null : (() => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (params.get("error") || params.get("error_code")) return "link-expired" as const;
  if (params.get("type") === "recovery") return "recovery" as const;
  return null;
})();

const inputCls =
  "w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-[15px] text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50";

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

const todayIso = () => new Date().toISOString().slice(0, 10);
const mb = (bytes: number) => (bytes >= 1048576 ? `${Math.round(bytes / 1048576)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

async function academyFetch(path: string, init: RequestInit = {}): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${session?.access_token ?? ""}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error ?? `Request failed (${res.status})`), { status: res.status });
  return body;
}
const postJson = (body: unknown) =>
  academyFetch("/api/academy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function PrimaryButton({ className, disabled, onClick, children, type }: {
  className?: string; disabled?: boolean; onClick?: () => void; children: React.ReactNode; type?: "button" | "submit";
}) {
  return (
    <button type={type ?? "button"} disabled={disabled} onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition",
        "hover:opacity-90 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50", className,
      )}>
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</label>;
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <PolarisMark size={34} title="" />
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-wide text-foreground">JLS YACHTS</div>
        <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Crew Academy</div>
      </div>
    </div>
  );
}

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-8"><Brand /></div>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/80 p-6 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.5)] sm:p-8">{children}</div>
      <p className="mt-6 max-w-md text-center text-[11px] leading-relaxed text-muted-foreground/70">
        Crew Academy · you can see only the training your vessel has given you.
      </p>
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300">{children}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════
export function AcademyApp() {
  const [stage, setStage] = useState<Stage>("loading");
  const [email, setEmail] = useState("");
  const [resetHandled, setResetHandled] = useState(false);

  const bootstrap = useCallback(async () => {
    if (LANDED_WITH === "link-expired" && !resetHandled) {
      window.history.replaceState(null, "", window.location.pathname);
      setStage("link-expired"); return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // Offline for a while, the sign-in can't be refreshed — the courses saved on this phone still open.
      if (!navigator.onLine && deviceOwner() && loadHome()) { setStage("ready"); return; }
      setStage("signed-out"); return;
    }
    setEmail(session.user.email ?? "");
    if (LANDED_WITH === "recovery" && !resetHandled) { setStage("reset-password"); return; }
    const { data: isLearner, error: rpcError } = await (supabase as any).rpc("is_portal_learner");
    // No signal: open what this person saved on this phone, if anything.
    if (rpcError && !navigator.onLine && deviceOwner() === session.user.id && loadHome()) { setStage("ready"); return; }
    if (isLearner !== true) { setStage("not-learner"); return; }
    await claimDevice(session.user.id);
    // The second sign-in step: authenticator app or emailed code.
    const mfa = await academyFetch("/api/academy/mfa").catch(() => null);
    setStage(mfa?.passed ? "ready" : "mfa");
  }, [resetHandled]);

  useEffect(() => { void bootstrap(); }, [bootstrap]);

  // Lets the page open with no signal (scope /academy only — see public/academy-sw.js).
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || import.meta.env.DEV) return;
    navigator.serviceWorker.register("/academy-sw.js", { scope: "/academy", updateViaCache: "none" }).catch(() => {});
  }, []);

  const signOut = useCallback(async () => {
    await clearOffline(); // nothing of theirs stays on the phone
    await supabase.auth.signOut();
    setStage("signed-out");
  }, []);

  return (
    <div className="pds pds-embed dark min-h-screen bg-background text-foreground" style={{ colorScheme: "dark" }}>
      {stage === "loading" && (
        <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}
      {stage === "signed-out" && <LoginScreen onSignedIn={bootstrap} />}
      {stage === "reset-password" && (
        <SetPasswordScreen email={email} onSignOut={signOut}
          onDone={() => { window.history.replaceState(null, "", window.location.pathname); setResetHandled(true); }} />
      )}
      {stage === "link-expired" && (
        <AuthFrame>
          <h1 className="text-xl font-bold">That link has expired</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Password links only work for a limited time and only once. Use “Forgot your password?” on the sign-in page to get a new one,
            or ask whoever runs training on your vessel to re-send your invitation.
          </p>
          <PrimaryButton onClick={() => { setResetHandled(true); setStage("signed-out"); }} className="mt-6 w-full">Back to sign in</PrimaryButton>
        </AuthFrame>
      )}
      {stage === "not-learner" && (
        <AuthFrame>
          <h1 className="text-xl font-bold">No Crew Academy access</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            <span className="text-foreground">{email}</span> isn't signed up to a vessel's Crew Academy. If you work at JLS Yachts, use the
            normal Polaris sign-in; otherwise ask whoever runs training on your vessel to check your invitation.
          </p>
          <PrimaryButton onClick={signOut} className="mt-6 w-full"><LogOut className="h-4 w-4" /> Sign out</PrimaryButton>
        </AuthFrame>
      )}
      {stage === "mfa" && <MfaScreen onDone={bootstrap} onSignOut={signOut} />}
      {stage === "ready" && <MyCourses onSignOut={signOut} />}
    </div>
  );
}

// ── Auth screens ─────────────────────────────────────────────────────────────
function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState<"off" | "form" | "sent">("off");

  if (forgot !== "off") {
    return (
      <AuthFrame>
        <h1 className="text-xl font-bold">Reset your password</h1>
        {forgot === "sent" ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              If <span className="text-foreground">{email.trim()}</span> has a Crew Academy login, we've emailed it a link to choose a new
              password. Nothing arrived? Check junk, or ask whoever runs training on your vessel.
            </p>
            <PrimaryButton onClick={() => setForgot("off")} className="mt-6 w-full">Back to sign in</PrimaryButton>
          </>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={async (e) => {
            e.preventDefault(); setBusy(true);
            await fetch("/api/academy/forgot-password", {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }),
            }).catch(() => null);
            setBusy(false); setForgot("sent");
          }}>
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

  return (
    <AuthFrame>
      <h1 className="text-xl font-bold">Sign in to Crew Academy</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your training, on your phone or any computer.</p>
      <form className="mt-6 space-y-4" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setError(null);
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        setBusy(false);
        if (error) { setError(error.message === "User is banned" ? "This login has been switched off." : error.message); return; }
        onSignedIn();
      }}>
        <div>
          <FieldLabel>Email</FieldLabel>
          <input className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Password</FieldLabel>
          <input className={inputCls} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <PrimaryButton type="submit" disabled={busy} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />} Sign in
        </PrimaryButton>
        <button type="button" onClick={() => { setError(null); setForgot("form"); }}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground">Forgot your password?</button>
      </form>
    </AuthFrame>
  );
}

function SetPasswordScreen({ email, onDone, onSignOut }: { email: string; onDone: () => void; onSignOut: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthFrame>
      <h1 className="text-xl font-bold">Choose your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">{email}</p>
      <form className="mt-6 space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        if (password.length < 10) { setError("Use at least 10 characters."); return; }
        if (password !== confirm) { setError("The two passwords don't match."); return; }
        setBusy(true); setError(null);
        const { error } = await supabase.auth.updateUser({ password });
        setBusy(false);
        if (error) { setError(error.message); return; }
        onDone();
      }}>
        <div>
          <FieldLabel>New password</FieldLabel>
          <input className={inputCls} type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Type it again</FieldLabel>
          <input className={inputCls} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <PrimaryButton type="submit" disabled={busy} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save and continue
        </PrimaryButton>
      </form>
      <button onClick={onSignOut} className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground">Cancel and sign out</button>
    </AuthFrame>
  );
}

// ── My courses ───────────────────────────────────────────────────────────────
type View = "training" | "completed" | "catalogue" | "requests" | "privacy";
const VIEW_KEY = "academy.view";

/**
 * The crew member's Crew Academy: a left menu (a slide-out drawer on phones)
 * with My training, Completed, Course catalogue, My requests and Privacy &
 * offline. Everything comes from /api/academy; works offline for the courses
 * saved on the phone (academy-offline.ts).
 */
function MyCourses({ onSignOut }: { onSignOut: () => void }) {
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [saved, setSaved] = useState(savedCourses);
  const [view, setView] = useState<View>(() => {
    try { return (sessionStorage.getItem(VIEW_KEY) as View) || "training"; } catch { return "training"; }
  });
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (v: View) => {
    setView(v); setMenuOpen(false);
    try { sessionStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ }
    window.scrollTo({ top: 0 });
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Progress made without signal goes up first, so the list below is current.
      if (queued().length) await flush(postJson);
      const h = await academyFetch("/api/academy?op=home");
      setHome(h); saveHome(h); setOffline(false);
    } catch (e: any) {
      const cached = isOffline(e) ? loadHome<Home>() : null;
      if (cached) { setHome(cached); setOffline(true); } else setError(e.message);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const back = () => { void load(); };
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, [load]);
  const savedChanged = () => setSaved(savedCourses());

  if (open) return <CourseView enrolmentId={open} onExit={() => { setOpen(null); setSaved(savedCourses()); void load(); }} />;

  const pendingRequests = (home?.requests ?? []).filter((r) => r.status === "pending").length;
  const nav: { key: View; label: string; icon: any; count?: number; online?: boolean }[] = [
    { key: "training", label: "My training", icon: GraduationCap, count: home?.todo.length },
    { key: "completed", label: "Completed", icon: Award, count: home?.done.length },
    { key: "catalogue", label: "Course catalogue", icon: Library, online: true },
    { key: "requests", label: "My requests", icon: Inbox, count: pendingRequests || undefined, online: true },
    { key: "privacy", label: "Privacy & offline", icon: ShieldCheck },
  ];
  const off: OfflineProps = { offline, saved, onSavedChange: savedChanged };

  const menu = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 pb-5 pt-5">
        {home?.vessel.logo
          ? <img src={home.vessel.logo} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain p-1" />
          : <PolarisMark size={36} title="" />}
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[15px] font-bold tracking-wide">{home?.vessel.name || "Crew Academy"}</div>
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Crew Academy</div>
        </div>
      </div>
      <ul className="flex-1 space-y-1 px-2">
        {nav.map((n) => {
          const Icon = n.icon;
          const disabled = n.online && offline;
          return (
            <li key={n.key}>
              <button onClick={() => go(n.key)} disabled={disabled}
                className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition disabled:opacity-40",
                  view === n.key ? "bg-primary/15 font-semibold text-primary" : "text-foreground/85 hover:bg-card")}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{n.label}</span>
                {!!n.count && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  view === n.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>{n.count}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border/60 px-4 py-4 text-xs">
        <div className="truncate font-medium text-foreground">{home?.me.displayName || "Crew member"}</div>
        <div className="truncate text-muted-foreground">{home?.me.email}</div>
        <button onClick={onSignOut} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 text-sm hover:bg-card">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </nav>
  );

  const title = nav.find((n) => n.key === view)?.label ?? "My training";
  return (
    <div className="min-h-screen md:flex">
      {/* Desktop menu */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border/60 bg-card/30 md:block">{menu}</aside>

      {/* Phone: top bar + drawer */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <button onClick={() => setMenuOpen(true)} aria-label="Open menu" className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card/60">
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-bold">{title}</div>
          <div className="truncate text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{home?.vessel.name || "Crew Academy"}</div>
        </div>
        {pendingRequests > 0 && view !== "requests" && (
          <button onClick={() => go("requests")} className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">{pendingRequests} pending</button>
        )}
      </header>
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="absolute right-3 top-5 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground">
              <X className="h-5 w-5" />
            </button>
            {menu}
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-5 sm:px-6 md:pt-10">
        <h1 className="hidden text-2xl font-bold md:block">
          {view === "training" && home?.me.displayName ? `Hello, ${home.me.displayName.split(" ")[0]}` : title}
        </h1>
        {view === "training" && home?.me.displayName && <h1 className="text-xl font-bold md:hidden">Hello, {home.me.displayName.split(" ")[0]}</h1>}

        {loading && !home && <div className="mt-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
        {error && (
          <div className="mt-6 space-y-3">
            <ErrorNote>{error}</ErrorNote>
            <PrimaryButton onClick={load}><RefreshCw className="h-4 w-4" /> Try again</PrimaryButton>
          </div>
        )}
        {offline && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
            <span>No signal — showing the courses saved on this phone. Your progress is kept and sent when you're back online.</span>
          </div>
        )}

        {home && view === "training" && (
          <>
            <Section title="To do" rows={home.todo} onOpen={setOpen} {...off}
              empty="Nothing to do right now. Browse the course catalogue to ask for more training." />
            {!offline && (
              <button onClick={() => go("catalogue")} className="mt-6 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                <Library className="h-4 w-4" /> Browse the course catalogue
              </button>
            )}
          </>
        )}
        {home && view === "completed" && (
          <Section title="Completed" rows={home.done} onOpen={setOpen} {...off}
            empty="Nothing completed yet. Courses you pass appear here, with their certificates." />
        )}
        {home && view === "catalogue" && <Catalogue onOpenCourse={setOpen} onRequested={() => { void load(); }} home={home} />}
        {home && view === "requests" && <Requests requests={home.requests ?? []} onChanged={load} onBrowse={() => go("catalogue")} />}
        {home && view === "privacy" && (
          <>
            {!offline && <ShareResults shared={home.me.sharedWithJls} vessel={home.vessel.name}
              onChange={(sharedWithJls) => setHome({ ...home, me: { ...home.me, sharedWithJls } })} />}
            <SavedOnPhone saved={saved} offline={offline} onChanged={savedChanged} />
          </>
        )}
      </main>
    </div>
  );
}

// ── Course catalogue ─────────────────────────────────────────────────────────
type CatalogueCourse = {
  id: string; title: string; summary: string | null; category: string | null; minutes: number | null; passMark: number;
  refreshMonths: number | null; from: string; mine: "enrolled" | "completed" | "requested" | "declined" | null; requestId: string | null;
};
type Outline = { sections: { title: string; lessons: { title: string; kinds: string[] }[] }[] };

const KIND_LABEL: Record<string, string> = {
  reading: "reading", video: "video", document: "PDF", image: "picture", quiz: "quiz", acknowledge: "sign-off",
  match: "matching", order: "ordering", sort: "sorting", hotspot: "picture task",
};

function Catalogue({ home, onOpenCourse, onRequested }: { home: Home; onOpenCourse: (enrolmentId: string) => void; onRequested: () => void }) {
  const [courses, setCourses] = useState<CatalogueCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const load = useCallback(() => {
    academyFetch("/api/academy?op=catalogue").then((r) => setCourses(r.courses)).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="mt-6"><ErrorNote>{error}</ErrorNote></div>;
  if (!courses) return <div className="mt-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const categories = [...new Set(courses.map((c) => c.category).filter(Boolean))] as string[];
  const shown = courses.filter((c) => (!category || c.category === category)
    && (!q.trim() || `${c.title} ${c.summary ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const enrolmentFor = (courseId: string) => [...home.todo, ...home.done].find((r) => r.course?.id === courseId)?.enrolmentId;

  return (
    <div className="mt-5 space-y-4">
      <p className="text-sm text-muted-foreground">Courses available on {home.vessel.name || "your vessel"}. Ask to join one and a training manager on board will decide.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input className={cn(inputCls, "py-2.5")} placeholder="Search courses" value={q} onChange={(e) => setQ(e.target.value)} />
        {categories.length > 1 && (
          <select className={cn(inputCls, "py-2.5 sm:w-48")} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All topics</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>
      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 px-5 py-8 text-center text-sm text-muted-foreground">
          <Library className="mx-auto mb-2 h-6 w-6 opacity-60" />
          {courses.length ? "No courses match your search." : "No courses in the catalogue yet."}
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((c) => <CatalogueCard key={c.id} course={c} enrolmentId={enrolmentFor(c.id)} onOpenCourse={onOpenCourse}
            onChanged={() => { load(); onRequested(); }} />)}
        </ul>
      )}
    </div>
  );
}

function CatalogueCard({ course: c, enrolmentId, onOpenCourse, onChanged }: {
  course: CatalogueCourse; enrolmentId?: string; onOpenCourse: (enrolmentId: string) => void; onChanged: () => void;
}) {
  const [outline, setOutline] = useState<Outline | null>(null);
  const [showOutline, setShowOutline] = useState(false);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const badge = c.mine === "completed" ? { label: "Completed", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" }
    : c.mine === "enrolled" ? { label: "Enrolled", cls: "border-primary/40 bg-primary/10 text-primary" }
    : c.mine === "requested" ? { label: "Requested", cls: "border-sky-500/40 bg-sky-500/10 text-sky-300" }
    : c.mine === "declined" ? { label: "Not approved", cls: "border-border bg-card text-muted-foreground" } : null;

  return (
    <li className="rounded-2xl border border-border bg-card/70 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold leading-snug">{c.title}</div>
          {c.summary && <p className="mt-1 text-sm text-muted-foreground">{c.summary}</p>}
        </div>
        {badge && <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", badge.cls)}>{badge.label}</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>From {c.from}</span>
        {c.category && <span>{c.category}</span>}
        {c.minutes && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {c.minutes} min</span>}
        <span>Pass mark {c.passMark}%</span>
        {c.refreshMonths && <span>Refresher every {c.refreshMonths} months</span>}
      </div>

      {showOutline && (
        <div className="mt-3 rounded-xl bg-background/50 p-3 text-sm">
          {!outline ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : outline.sections.map((s, si) => (
            <div key={si} className="mb-2 last:mb-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.title}</div>
              <ul className="mt-1 space-y-0.5">
                {s.lessons.map((l, li) => (
                  <li key={li}>{l.title} <span className="text-xs text-muted-foreground">— {l.kinds.map((k) => KIND_LABEL[k] ?? k).join(", ")}</span></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {asking && (
        <div className="mt-3 space-y-2">
          <textarea className={cn(inputCls, "min-h-[70px] text-sm")} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Why would you like to do it? (optional — e.g. I'm moving to the deck team)" />
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex gap-2">
            <PrimaryButton disabled={busy} onClick={async () => {
              setBusy(true); setError(null);
              try { await postJson({ op: "request", course: c.id, note }); setAsking(false); onChanged(); }
              catch (e: any) { setError(e.message); }
              setBusy(false);
            }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send request</PrimaryButton>
            <button onClick={() => setAsking(false)} className="px-3 text-sm text-muted-foreground">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => {
          setShowOutline((s) => !s);
          if (!outline) academyFetch(`/api/academy?op=outline&course=${encodeURIComponent(c.id)}`).then(setOutline).catch(() => setShowOutline(false));
        }} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-sm hover:bg-card">
          <ListChecks className="h-4 w-4" /> {showOutline ? "Hide outline" : "What's in it"}
        </button>
        {(c.mine === "enrolled" || c.mine === "completed") && enrolmentId && (
          <button onClick={() => onOpenCourse(enrolmentId)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground">
            Open course
          </button>
        )}
        {(c.mine === null || c.mine === "declined") && !asking && (
          <button onClick={() => setAsking(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground">
            <Send className="h-4 w-4" /> Ask to enrol
          </button>
        )}
        {c.mine === "requested" && c.requestId && (
          <button disabled={busy} onClick={async () => {
            setBusy(true);
            try { await postJson({ op: "cancel-request", request: c.requestId }); onChanged(); } catch { /* already decided */ }
            setBusy(false);
          }} className="inline-flex min-h-9 items-center gap-1.5 px-2 text-sm text-muted-foreground hover:text-foreground">
            Cancel request
          </button>
        )}
      </div>
    </li>
  );
}

// ── My requests ──────────────────────────────────────────────────────────────
function Requests({ requests, onChanged, onBrowse }: { requests: NonNullable<Home["requests"]>; onChanged: () => void; onBrowse: () => void }) {
  if (!requests.length) {
    return (
      <div className="mt-5 rounded-2xl border border-dashed border-border bg-card/40 px-5 py-8 text-center text-sm text-muted-foreground">
        <Inbox className="mx-auto mb-2 h-6 w-6 opacity-60" />
        You haven't asked for any courses yet.
        <div><button onClick={onBrowse} className="mt-2 text-primary hover:underline">Browse the course catalogue</button></div>
      </div>
    );
  }
  return (
    <ul className="mt-5 space-y-3">
      {requests.map((r) => (
        <li key={r.id} className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold">{r.course}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">Asked {fmtDate(r.createdAt)}{r.note ? ` — “${r.note}”` : ""}</div>
            </div>
            <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              r.status === "approved" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : r.status === "declined" ? "border-border bg-card text-muted-foreground" : "border-sky-500/40 bg-sky-500/10 text-sky-300")}>
              {r.status === "approved" ? "Approved" : r.status === "declined" ? "Not approved" : "Waiting"}
            </span>
          </div>
          {r.status !== "pending" && (
            <p className="mt-2 text-sm text-muted-foreground">
              {r.status === "approved" ? "Approved" : "Not approved"}{r.decidedBy ? ` by ${r.decidedBy}` : ""}{r.decidedAt ? ` on ${fmtDate(r.decidedAt)}` : ""}
              {r.decisionNote ? ` — “${r.decisionNote}”` : ""}
              {r.status === "approved" ? ". It's in My training." : ""}
            </p>
          )}
          {r.status === "pending" && (
            <button onClick={async () => { try { await postJson({ op: "cancel-request", request: r.id }); } catch { /* decided meanwhile */ } onChanged(); }}
              className="mt-2 text-sm text-muted-foreground hover:text-foreground">Cancel request</button>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── Saved on this phone ──────────────────────────────────────────────────────
function SavedOnPhone({ saved, offline, onChanged }: { saved: ReturnType<typeof savedCourses>; offline: boolean; onChanged: () => void }) {
  const entries = Object.entries(saved);
  if (!offlineSupported()) return null;
  return (
    <section className="mt-6 rounded-2xl border border-border bg-card/40 p-4">
      <h2 className="font-medium">Saved on this phone</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Courses you save with “Save for offline” work with no signal. Signing out removes them from this phone.
      </p>
      {entries.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nothing saved yet.</p> : (
        <ul className="mt-3 divide-y divide-border/50 text-sm">
          {entries.map(([id, s]) => (
            <li key={id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate">{s.title} <span className="text-xs text-muted-foreground">· {mb(s.bytes)}</span></span>
              <button disabled={offline} onClick={async () => { await removeCourse(id); onChanged(); }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-300 disabled:opacity-40">
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type OfflineProps = { offline: boolean; saved: ReturnType<typeof savedCourses>; onSavedChange: () => void };

function Section({ title, rows, empty, onOpen, ...off }: { title: string; rows: CourseRow[]; empty?: string; onOpen: (enrolmentId: string) => void } & OfflineProps) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</h2>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 px-5 py-8 text-center text-sm text-muted-foreground">
          <GraduationCap className="mx-auto mb-2 h-6 w-6 opacity-60" />
          {empty}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => <CourseCard key={r.enrolmentId} row={r} onOpen={() => onOpen(r.enrolmentId)} {...off} />)}
        </ul>
      )}
    </section>
  );
}

function CourseCard({ row, onOpen, offline, saved, onSavedChange }: { row: CourseRow; onOpen: () => void } & OfflineProps) {
  const isSaved = !!saved[row.enrolmentId];
  const [saving, setSaving] = useState<string | null>(null);
  const unavailable = offline && !isSaved;
  const overdue = !!row.dueDate && row.dueDate < todayIso() && row.status !== "completed";
  const status =
    row.status === "completed" ? { label: `Passed${row.score != null ? ` · ${row.score}%` : ""}`, cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" }
    : row.status === "expired" ? { label: "Needs a refresher", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" }
    : row.status === "failed" ? { label: "Not passed yet", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" }
    : row.status === "in_progress" ? { label: "In progress", cls: "border-primary/40 bg-primary/10 text-primary" }
    : { label: "Not started", cls: "border-border bg-card text-muted-foreground" };
  return (
    <li>
      <button onClick={onOpen} disabled={unavailable}
        className={cn("block w-full rounded-2xl border border-border bg-card/70 p-4 text-left transition hover:border-primary/40 hover:bg-card disabled:opacity-50 sm:p-5")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold leading-snug">{row.course?.title ?? "Course"}</div>
            {row.course?.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{row.course.summary}</p>}
          </div>
          <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", status.cls)}>
            {status.label}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {row.course?.from && <span>From {row.course.from}</span>}
          {row.course?.minutes && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {row.course.minutes} min</span>}
          {row.mandatory && row.status !== "completed" && <span>Required</span>}
          {row.dueDate && row.status !== "completed" && (
            <span className={cn(overdue && "font-semibold text-red-300")}>{overdue ? "Overdue since" : "Due"} {fmtDate(row.dueDate)}</span>
          )}
          {row.status === "completed" && row.completedAt && <span>Completed {fmtDate(row.completedAt)}</span>}
          {row.status === "completed" && row.expiresAt && <span>Valid until {fmtDate(row.expiresAt)}</span>}
        </div>
      </button>
      {offlineSupported() && row.status !== "completed" && row.status !== "expired" && (
        isSaved ? (
          <button disabled={offline} onClick={async () => { await removeCourse(row.enrolmentId); onSavedChange(); }}
            className="mt-1.5 mr-3 inline-flex min-h-9 items-center gap-1.5 px-1 text-sm text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Saved on this phone ({mb(saved[row.enrolmentId].bytes)}){!offline && <Trash2 className="ml-1 h-3.5 w-3.5" />}
          </button>
        ) : !offline && (
          <button disabled={!!saving} onClick={async () => {
            setSaving("Getting ready…");
            try {
              const payload = await academyFetch(`/api/academy?op=course&enrolment=${encodeURIComponent(row.enrolmentId)}`);
              const total = Object.values(payload.mediaSizes ?? {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
              if (total > 50 * 1048576 && !confirm(`This course's videos and files are ${mb(total)}. Download them now? Best on Wi-Fi.`)) { setSaving(null); return; }
              await saveCourse(row.enrolmentId, payload,
                async (mediaId) => (await academyFetch(`/api/academy?op=media&enrolment=${encodeURIComponent(row.enrolmentId)}&media=${encodeURIComponent(mediaId)}`)).url ?? null,
                (done, n) => setSaving(n ? `Downloading ${done + 1 > n ? n : done + 1} of ${n}…` : "Saving…"));
              onSavedChange();
            } catch (e: any) {
              await removeCourse(row.enrolmentId).catch(() => undefined);
              alert(e?.name === "QuotaExceededError" ? "There isn't enough space on this phone for this course." : e?.message ?? "Couldn't save the course.");
            }
            setSaving(null);
          }} className="mt-1.5 mr-3 inline-flex min-h-9 items-center gap-1.5 px-1 text-sm text-primary hover:underline disabled:no-underline disabled:opacity-70">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {saving ?? "Save for offline"}
          </button>
        )
      )}
      {row.certificate && !offline && (
        <button onClick={() => {
          void openAuthedPdf(async () => {
            const { data: { session } } = await supabase.auth.getSession();
            return fetch(`/api/academy?op=certificate&enrolment=${encodeURIComponent(row.enrolmentId)}`, {
              headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
            });
          }).catch((e) => alert(e.message));
        }} className="mt-1.5 inline-flex min-h-9 items-center gap-1.5 px-1 text-sm text-primary hover:underline">
          <Award className="h-4 w-4" /> Certificate {row.certificate}
        </button>
      )}
    </li>
  );
}

/** The crew member's own choice to let JLS Yachts see their results — private to the vessel otherwise. */
function ShareResults({ shared, vessel, onChange }: { shared: boolean; vessel: string; onChange: (v: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="mt-10 rounded-2xl border border-border bg-card/40 p-4">
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={shared} disabled={busy} onChange={async (e) => {
          const next = e.target.checked;
          setBusy(true);
          try { await postJson({ op: "share-results", share: next }); onChange(next); } catch { /* left as it was */ }
          setBusy(false);
        }} />
        <span>
          <span className="block font-medium">Share my training results with JLS Yachts</span>
          <span className="block text-muted-foreground">
            Your results are seen only by {vessel || "your vessel"} unless you tick this. You can untick it any time.
          </span>
        </span>
      </label>
    </section>
  );
}

// ── Taking a course ──────────────────────────────────────────────────────────
type CoursePayload = {
  enrolment: { id: string; status: string; score: number | null; completedAt: string | null };
  course: { title: string; summary: string | null; passMark: number; version: number; from: string };
  content: CourseContent;
  progress: BlockProgress[];
};

function CourseView({ enrolmentId, onExit }: { enrolmentId: string; onExit: () => void }) {
  const [data, setData] = useState<CoursePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const progressRef = useRef<BlockProgress[]>([]);

  useEffect(() => {
    academyFetch(`/api/academy?op=course&enrolment=${encodeURIComponent(enrolmentId)}`)
      .then((d: CoursePayload) => { progressRef.current = d.progress; setData(d); void updateSavedProgress(enrolmentId, d.progress, d.enrolment.status); })
      .catch(async (e) => {
        const saved = isOffline(e) ? await loadCourse<CoursePayload>(enrolmentId) : null;
        if (saved) { progressRef.current = saved.progress; setData(saved); setOffline(true); } else setError(e.message);
      });
  }, [enrolmentId]);

  // Stable, so the player's file links aren't fetched again on every render.
  const api = useMemo<PlayerApi>(() => {
    const content = () => data?.content;
    // Online: save and keep the phone copy in step. No signal: queue it and move on locally.
    const send = async (body: { op: "viewed" | "video" | "acknowledge"; enrolment: string; [k: string]: unknown }) => {
      try {
        const u = await postJson(body);
        progressRef.current = u.progress;
        void updateSavedProgress(enrolmentId, u.progress, u.outcome?.status);
        return u;
      } catch (e) {
        if (!isOffline(e) || !content()) throw e;
        queue(body);
        progressRef.current = applyLocally(content()!, progressRef.current, body);
        void updateSavedProgress(enrolmentId, progressRef.current);
        return { progress: progressRef.current };
      }
    };
    return {
      mediaUrl: async (mediaId) => (await offlineMedia(enrolmentId, mediaId))
        ?? (await academyFetch(`/api/academy?op=media&enrolment=${encodeURIComponent(enrolmentId)}&media=${encodeURIComponent(mediaId)}`)).url ?? null,
      viewed: (lessonId) => send({ op: "viewed", enrolment: enrolmentId, lessonId }),
      video: (blockId, percent, seconds) => send({ op: "video", enrolment: enrolmentId, blockId, percent, seconds }),
      acknowledge: (blockId) => send({ op: "acknowledge", enrolment: enrolmentId, blockId }),
      answer: async (blockId, answers) => {
        try { return await postJson({ op: "answer", enrolment: enrolmentId, blockId, answers }); }
        catch (e) {
          if (isOffline(e)) throw new Error("No signal — quizzes and exercises are marked when you're back online. Everything else you do is saved.");
          throw e;
        }
      },
    };
  }, [enrolmentId, data]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
        <ErrorNote>{error}</ErrorNote>
        <PrimaryButton onClick={onExit} className="mt-4">Back to my courses</PrimaryButton>
      </div>
    );
  }
  if (!data) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  return (
    <CoursePlayer title={data.course.title} from={data.course.from} content={data.content} passMark={data.course.passMark}
      initialProgress={data.progress} initialStatus={data.enrolment.status} api={api} onExit={onExit}
      banner={offline ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" /> No signal — you're using the copy saved on this phone. Quizzes wait until you're back online.
        </div>
      ) : undefined} />
  );
}

// ── Second sign-in step ──────────────────────────────────────────────────────
type MfaStatus = { passed: boolean; hasAuthenticator: boolean; emailAvailable: boolean; email: string };
type MfaMode = "choose" | "app-setup" | "app-code" | "email";

/**
 * Crew choose how to prove it's them: a code from an authenticator app (set up
 * once by scanning a QR code — Supabase TOTP, like the Client Portal) or a code
 * emailed to them (checked by /api/academy/mfa). Either works each time.
 */
function MfaScreen({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [mode, setMode] = useState<MfaMode>("choose");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    academyFetch("/api/academy/mfa").then((s: MfaStatus) => {
      setStatus(s);
      // Someone with an authenticator goes straight to its code; with no email
      // route the app is the only way.
      if (s.hasAuthenticator) setMode("app-code");
      else if (!s.emailAvailable) setMode("app-setup");
    }).catch((e) => setError(e.message));
  }, []);

  if (error) return <AuthFrame><ErrorNote>{error}</ErrorNote><SignOutLink onSignOut={onSignOut} /></AuthFrame>;
  if (!status) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const other = (label: string, to: MfaMode) => (
    <button onClick={() => setMode(to)} className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground">{label}</button>
  );

  if (mode === "app-setup") {
    return <AuthenticatorSetup onDone={onDone} onSignOut={onSignOut}
      extra={status.emailAvailable ? other("Email me a code instead", "email") : null} />;
  }
  if (mode === "app-code") {
    return <AuthenticatorCode onDone={onDone} onSignOut={onSignOut}
      extra={status.emailAvailable ? other("Lost your phone? Email me a code instead", "email") : null} />;
  }
  if (mode === "email") {
    return <EmailCode email={status.email} onDone={onDone} onSignOut={onSignOut}
      extra={other(status.hasAuthenticator ? "Use my authenticator app instead" : "Use an authenticator app instead", status.hasAuthenticator ? "app-code" : "app-setup")} />;
  }

  return (
    <AuthFrame>
      <h1 className="text-xl font-bold">One more step</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        To keep your training record yours, we check it's you each time you sign in. Choose how:
      </p>
      <div className="mt-6 space-y-3">
        <button onClick={() => setMode("app-setup")}
          className="flex w-full items-start gap-3 rounded-xl border border-border bg-background/40 p-4 text-left transition hover:border-primary/50">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <span>
            <span className="block font-semibold">Authenticator app <span className="text-xs font-normal text-primary">recommended</span></span>
            <span className="block text-sm text-muted-foreground">Scan a QR code once with Microsoft or Google Authenticator. Works without signal.</span>
          </span>
        </button>
        <button onClick={() => setMode("email")}
          className="flex w-full items-start gap-3 rounded-xl border border-border bg-background/40 p-4 text-left transition hover:border-primary/50">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <span>
            <span className="block font-semibold">Email me a code</span>
            <span className="block text-sm text-muted-foreground">We send a 6-digit code to {status.email} each time you sign in.</span>
          </span>
        </button>
      </div>
      <SignOutLink onSignOut={onSignOut} />
    </AuthFrame>
  );
}

function SignOutLink({ onSignOut }: { onSignOut: () => void }) {
  return <button onClick={onSignOut} className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground">Sign out</button>;
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input className={cn(inputCls, "text-center font-mono text-xl tracking-[0.5em]")} inputMode="numeric" autoComplete="one-time-code"
      maxLength={6} required autoFocus value={value} placeholder="000000" onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} />
  );
}

function AuthenticatorSetup({ onDone, onSignOut, extra }: { onDone: () => void; onSignOut: () => void; extra: React.ReactNode }) {
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Clear dangling unverified factors from abandoned attempts, then enrol.
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const f of factors?.all ?? []) {
        if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Crew Academy" });
      if (error) { setError(error.message); return; }
      setFactorId(data.id);
      setQr((data as any).totp?.qr_code ?? null);
      setSecret((data as any).totp?.secret ?? null);
    })();
  }, []);

  return (
    <AuthFrame>
      <h1 className="text-xl font-bold">Set up your authenticator app</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Open Microsoft Authenticator or Google Authenticator, add an account, scan this QR code, then type the 6-digit code it shows.
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
          Setting up on this phone? Enter this key in the app instead: <span className="font-mono text-muted-foreground">{secret}</span>
        </p>
      )}
      <form className="mt-5 space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        if (!factorId) return;
        setBusy(true); setError(null);
        const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
        if (chErr || !ch) { setError(chErr?.message ?? "Couldn't start the check"); setBusy(false); return; }
        const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code });
        setBusy(false);
        if (vErr) { setError("That code didn't match — try again."); return; }
        onDone();
      }}>
        <div><FieldLabel>6-digit code</FieldLabel><CodeInput value={code} onChange={setCode} /></div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <PrimaryButton type="submit" disabled={busy || code.length !== 6 || !factorId} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />} Activate and continue
        </PrimaryButton>
      </form>
      {extra}
      <SignOutLink onSignOut={onSignOut} />
    </AuthFrame>
  );
}

function AuthenticatorCode({ onDone, onSignOut, extra }: { onDone: () => void; onSignOut: () => void; extra: React.ReactNode }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthFrame>
      <h1 className="text-xl font-bold">Enter your authenticator code</h1>
      <p className="mt-1 text-sm text-muted-foreground">Open your authenticator app and type the 6-digit code for Crew Academy.</p>
      <form className="mt-6 space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totp = factors?.totp?.[0];
        if (!totp) { setError("No authenticator is set up on this login."); setBusy(false); return; }
        const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
        if (chErr || !ch) { setError(chErr?.message ?? "Couldn't start the check"); setBusy(false); return; }
        const { error: vErr } = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: ch.id, code });
        setBusy(false);
        if (vErr) { setError("That code didn't match — try again."); return; }
        onDone();
      }}>
        <CodeInput value={code} onChange={setCode} />
        {error && <ErrorNote>{error}</ErrorNote>}
        <PrimaryButton type="submit" disabled={busy || code.length !== 6} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />} Continue
        </PrimaryButton>
      </form>
      {extra}
      <SignOutLink onSignOut={onSignOut} />
    </AuthFrame>
  );
}

function EmailCode({ email, onDone, onSignOut, extra }: { email: string; onDone: () => void; onSignOut: () => void; extra: React.ReactNode }) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const post = (body: unknown) =>
    academyFetch("/api/academy/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const send = async () => {
    setBusy(true); setError(null);
    try { await post({ op: "send" }); setSent(true); } catch (e: any) { setError(e.message); }
    setBusy(false);
  };
  useEffect(() => { void send(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthFrame>
      <h1 className="text-xl font-bold">Check your email</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {sent ? `We've sent a 6-digit code to ${email}. It works for 10 minutes.` : busy ? "Sending your code…" : "We couldn't send the code."}
      </p>
      <form className="mt-6 space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        try { await post({ op: "verify", code }); onDone(); } catch (err: any) { setError(err.message); setBusy(false); }
      }}>
        <CodeInput value={code} onChange={setCode} />
        {error && <ErrorNote>{error}</ErrorNote>}
        <PrimaryButton type="submit" disabled={busy || code.length !== 6} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Continue
        </PrimaryButton>
      </form>
      <button onClick={() => void send()} disabled={busy} className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
        Send a new code
      </button>
      {extra}
      <SignOutLink onSignOut={onSignOut} />
    </AuthFrame>
  );
}
