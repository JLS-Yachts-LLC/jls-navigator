/**
 * The Crew Academy page (/academy) — for crew a vessel has enrolled in training.
 *
 * A learner is one person on one vessel. They see only the courses enrolled to
 * them there (by group or by name) and their own results. Everything comes from
 * /api/academy; the login itself can read nothing from the database.
 *
 * Sign-in, set / reset password, the second sign-in step (authenticator app via
 * QR code, or an emailed code — /api/academy/mfa), the "My courses" list and the
 * course player (course-player.tsx). Drag-and-drop exercises and certificates
 * come later.
 *
 * The invite email is a password-set link that lands here (#type=recovery).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, GraduationCap, Loader2, LogOut, Mail, RefreshCw, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PolarisMark } from "@/components/brand/PolarisMark";
import { cn } from "@/lib/utils";
import { CoursePlayer, type PlayerApi } from "@/components/academy/course-player";
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
  course: { id: string; title: string; summary: string | null; category: string | null; minutes: number | null; from: string } | null;
};
type Home = {
  me: { displayName: string | null; email: string; sharedWithJls: boolean };
  vessel: { name: string; logo: string | null };
  todo: CourseRow[];
  done: CourseRow[];
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
    if (!session) { setStage("signed-out"); return; }
    setEmail(session.user.email ?? "");
    if (LANDED_WITH === "recovery" && !resetHandled) { setStage("reset-password"); return; }
    const { data: isLearner } = await (supabase as any).rpc("is_portal_learner");
    if (isLearner !== true) { setStage("not-learner"); return; }
    // The second sign-in step: authenticator app or emailed code.
    const mfa = await academyFetch("/api/academy/mfa").catch(() => null);
    setStage(mfa?.passed ? "ready" : "mfa");
  }, [resetHandled]);

  useEffect(() => { void bootstrap(); }, [bootstrap]);

  const signOut = useCallback(async () => {
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
function MyCourses({ onSignOut }: { onSignOut: () => void }) {
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setHome(await academyFetch("/api/academy?op=home")); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (open) return <CourseView enrolmentId={open} onExit={() => { setOpen(null); void load(); }} />;

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 pb-16 pt-5 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {home?.vessel.logo
            ? <img src={home.vessel.logo} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain p-1" />
            : <PolarisMark size={36} title="" />}
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[15px] font-bold tracking-wide">{home?.vessel.name || "Crew Academy"}</div>
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Crew Academy</div>
          </div>
        </div>
        <button onClick={onSignOut}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 text-sm transition hover:bg-card">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </header>

      <h1 className="mt-8 text-2xl font-bold">
        {home?.me.displayName ? `Hello, ${home.me.displayName.split(" ")[0]}` : "My training"}
      </h1>

      {loading && !home && (
        <div className="mt-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}
      {error && (
        <div className="mt-6 space-y-3">
          <ErrorNote>{error}</ErrorNote>
          <PrimaryButton onClick={load}><RefreshCw className="h-4 w-4" /> Try again</PrimaryButton>
        </div>
      )}

      {home && (
        <>
          <Section title="To do" rows={home.todo} onOpen={setOpen}
            empty="Nothing to do yet. When your vessel enrols you on a course it will appear here." />
          {home.done.length > 0 && <Section title="Completed" rows={home.done} onOpen={setOpen} />}
          <ShareResults shared={home.me.sharedWithJls} vessel={home.vessel.name}
            onChange={(sharedWithJls) => setHome({ ...home, me: { ...home.me, sharedWithJls } })} />
        </>
      )}
    </div>
  );
}

function Section({ title, rows, empty, onOpen }: { title: string; rows: CourseRow[]; empty?: string; onOpen: (enrolmentId: string) => void }) {
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
          {rows.map((r) => <CourseCard key={r.enrolmentId} row={r} onOpen={() => onOpen(r.enrolmentId)} />)}
        </ul>
      )}
    </section>
  );
}

function CourseCard({ row, onOpen }: { row: CourseRow; onOpen: () => void }) {
  const overdue = !!row.dueDate && row.dueDate < todayIso() && row.status !== "completed";
  const status =
    row.status === "completed" ? { label: `Passed${row.score != null ? ` · ${row.score}%` : ""}`, cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" }
    : row.status === "expired" ? { label: "Needs a refresher", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" }
    : row.status === "failed" ? { label: "Not passed yet", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" }
    : row.status === "in_progress" ? { label: "In progress", cls: "border-primary/40 bg-primary/10 text-primary" }
    : { label: "Not started", cls: "border-border bg-card text-muted-foreground" };
  return (
    <li>
      <button onClick={onOpen} className="block w-full rounded-2xl border border-border bg-card/70 p-4 text-left transition hover:border-primary/40 hover:bg-card sm:p-5">
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

  useEffect(() => {
    academyFetch(`/api/academy?op=course&enrolment=${encodeURIComponent(enrolmentId)}`).then(setData).catch((e) => setError(e.message));
  }, [enrolmentId]);

  // Stable, so the player's file links aren't fetched again on every render.
  const api = useMemo<PlayerApi>(() => ({
    mediaUrl: async (mediaId) =>
      (await academyFetch(`/api/academy?op=media&enrolment=${encodeURIComponent(enrolmentId)}&media=${encodeURIComponent(mediaId)}`)).url ?? null,
    viewed: (lessonId) => postJson({ op: "viewed", enrolment: enrolmentId, lessonId }),
    video: (blockId, percent, seconds) => postJson({ op: "video", enrolment: enrolmentId, blockId, percent, seconds }),
    answer: (blockId, answers) => postJson({ op: "answer", enrolment: enrolmentId, blockId, answers }),
    acknowledge: (blockId) => postJson({ op: "acknowledge", enrolment: enrolmentId, blockId }),
  }), [enrolmentId]);

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
      initialProgress={data.progress} initialStatus={data.enrolment.status} api={api} onExit={onExit} />
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
