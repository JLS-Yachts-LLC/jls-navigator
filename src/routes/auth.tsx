import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PolarisLogo } from "@/components/brand/PolarisLogo";
import { LoginBrandPanel } from "@/components/auth/LoginBrandPanel";
import { WorkspaceSelector } from "@/components/auth/WorkspaceSelector";
import { deriveClaims, resolveLandingPath, type PolarisClaims } from "@/lib/auth/claims";
import {
  getAvailableWorkspaces, resolveWorkspaceLandingPath, storeWorkspace,
  type WorkspaceContext,
} from "@/lib/auth/workspace";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({ meta: [{ title: "Sign in — Polaris" }] }),
});

type Mode = "signin" | "set-password" | "forgot-password";

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  // Post-auth workspace step
  const [workspaces, setWorkspaces] = useState<WorkspaceContext[] | null>(null);
  const [claims, setClaims] = useState<PolarisClaims | null>(null);
  const [resolving, setResolving] = useState(false);

  // Detect invite / password-recovery tokens in the URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=invite") || hash.includes("type=recovery")) {
      setMode("set-password");
    }
  }, []);

  // After authentication, derive claims → route directly or show workspace chooser.
  useEffect(() => {
    if (loading || !user || mode !== "signin" || resolving || workspaces) return;
    setResolving(true);
    (async () => {
      try {
        const c = await deriveClaims(supabase, user);
        setClaims(c);
        const ws = await getAvailableWorkspaces(supabase, c);
        if (ws.length > 1) {
          setWorkspaces(ws); // show selector
        } else if (ws.length === 1) {
          storeWorkspace(ws[0]);
          navigate({ to: resolveWorkspaceLandingPath(c, ws[0]) as any });
        } else {
          navigate({ to: resolveLandingPath(c) as any });
        }
      } catch {
        navigate({ to: "/polaris-redesign" as any });
      }
    })();
  }, [loading, user, mode, resolving, workspaces, navigate]);

  function pickWorkspace(ws: WorkspaceContext) {
    storeWorkspace(ws);
    navigate({ to: resolveWorkspaceLandingPath(claims ?? ({} as PolarisClaims), ws) as any });
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Welcome back");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password set — welcome to JLS Yachts");
      setMode("signin");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to set password");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      toast.error("Enter your email address first");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast.success("Password reset link sent — check your email");
      setMode("signin");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send reset email");
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, { heading: string; sub: string }> = {
    "signin": { heading: "Welcome back", sub: "Sign in to your account." },
    "set-password": { heading: "Set your password", sub: "You have been invited to Polaris. Choose a password to activate your account." },
    "forgot-password": { heading: "Reset password", sub: "Enter your email and we'll send you a reset link." },
  };

  const showWorkspaceStep = mode === "signin" && !!user && !!workspaces;

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2 bg-background">
      <LoginBrandPanel />

      {/* Right panel — form / workspace selector */}
      <div className="relative flex items-center justify-center p-6">
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-30 lg:hidden [background-image:radial-gradient(circle_at_20%_15%,rgba(0,196,204,0.35),transparent_45%),radial-gradient(circle_at_80%_85%,rgba(232,160,32,0.20),transparent_50%)]" />
        <div className="w-full max-w-sm">
          {/* logo on small screens (brand panel hidden there) */}
          <div className="mb-7 flex justify-center lg:hidden">
            <PolarisLogo size="md" theme="dark" className="h-auto w-full max-w-[260px]" />
          </div>

          {showWorkspaceStep ? (
            <WorkspaceSelector workspaces={workspaces!} onSelect={pickWorkspace} />
          ) : (
            <>
              <h1 className="font-display text-2xl font-semibold mb-1">{titles[mode].heading}</h1>
              <p className="text-sm text-muted-foreground mb-6">{titles[mode].sub}</p>

              {mode === "signin" && (
                <form onSubmit={handleSignIn} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@jlsyachts.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input id="password" type={showPassword ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
                      <button type="button" onClick={() => setShowPassword((s) => !s)} tabIndex={-1}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                        aria-label={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? "Please wait…" : "Sign in"}
                  </Button>
                  <button type="button" onClick={() => setMode("forgot-password")}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition">
                    Forgot your password?
                  </button>
                </form>
              )}

              {mode === "set-password" && (
                <form onSubmit={handleSetPassword} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-password">New password</Label>
                    <Input id="new-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-password">Confirm password</Label>
                    <Input id="confirm-password" type="password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                  </div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? "Saving…" : "Activate account"}
                  </Button>
                </form>
              )}

              {mode === "forgot-password" && (
                <form onSubmit={handleForgotPassword} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input id="reset-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@jlsyachts.com" />
                  </div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? "Sending…" : "Send reset link"}
                  </Button>
                  <button type="button" onClick={() => setMode("signin")}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition">
                    Back to sign in
                  </button>
                </form>
              )}

              <p className="mt-6 text-center text-xs text-muted-foreground">
                Need help?{" "}
                <a href="mailto:itsupport@jlsyachts.com" className="text-primary hover:underline">Contact IT Support</a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
