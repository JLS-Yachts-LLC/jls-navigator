/**
 * The Crew Academy page (/academy) — for crew a vessel has enrolled in training.
 *
 * A learner is one person on one vessel. They see only the courses enrolled to
 * them there (by group or by name) and their own results. Everything comes from
 * /api/academy; the login itself can read nothing from the database.
 *
 * Phase 1: sign-in, set / reset password and the "My courses" list. The course
 * player (lessons, video, quizzes, drag-and-drop) arrives in Phase 2.
 *
 * The invite email is a password-set link that lands here (#type=recovery).
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, GraduationCap, Loader2, LogOut, Mail, RefreshCw, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PolarisMark } from "@/components/brand/PolarisMark";
import { cn } from "@/lib/utils";
import "@/components/polaris-ui/tokens.css";

type Stage = "loading" | "signed-out" | "reset-password" | "link-expired" | "not-learner" | "ready";

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
  me: { displayName: string | null; email: string };
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

async function academyFetch(path: string): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error ?? `Request failed (${res.status})`), { status: res.status });
  return body;
}

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
    setStage(isLearner === true ? "ready" : "not-learner");
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

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setHome(await academyFetch("/api/academy?op=home")); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

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
          <Section title="To do" rows={home.todo}
            empty="Nothing to do yet. When your vessel enrols you on a course it will appear here." />
          {home.done.length > 0 && <Section title="Completed" rows={home.done} />}
        </>
      )}
    </div>
  );
}

function Section({ title, rows, empty }: { title: string; rows: CourseRow[]; empty?: string }) {
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
          {rows.map((r) => <CourseCard key={r.enrolmentId} row={r} />)}
        </ul>
      )}
    </section>
  );
}

function CourseCard({ row }: { row: CourseRow }) {
  const overdue = !!row.dueDate && row.dueDate < todayIso() && row.status !== "completed";
  const status =
    row.status === "completed" ? { label: `Passed${row.score != null ? ` · ${row.score}%` : ""}`, cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" }
    : row.status === "expired" ? { label: "Needs a refresher", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" }
    : row.status === "failed" ? { label: "Not passed yet", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" }
    : row.status === "in_progress" ? { label: "In progress", cls: "border-primary/40 bg-primary/10 text-primary" }
    : { label: "Not started", cls: "border-border bg-card text-muted-foreground" };
  return (
    <li className="rounded-2xl border border-border bg-card/70 p-4 sm:p-5">
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
    </li>
  );
}
