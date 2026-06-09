import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PolarisLogo } from "@/components/polaris-logo";

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
  const [busy, setBusy] = useState(false);

  // Detect invite / password-recovery tokens in the URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=invite") || hash.includes("type=recovery")) {
      setMode("set-password");
    }
  }, []);

  // Redirect authenticated users unless they are setting a password
  useEffect(() => {
    if (!loading && user && mode === "signin") {
      navigate({ to: "/yachts" });
    }
  }, [loading, user, mode, navigate]);

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
      navigate({ to: "/yachts" });
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
    "signin": { heading: "Sign in", sub: "Access the operations dashboard." },
    "set-password": { heading: "Set your password", sub: "You have been invited to Polaris. Choose a password to activate your account." },
    "forgot-password": { heading: "Reset password", sub: "Enter your email and we'll send you a reset link." },
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="absolute inset-0 -z-10 opacity-40 [background-image:radial-gradient(circle_at_25%_15%,oklch(0.62_0.18_245/.25),transparent_45%),radial-gradient(circle_at_80%_80%,oklch(0.74_0.18_155/.18),transparent_50%)]" />
      <div className="w-full max-w-sm rounded-xl border border-border bg-card/80 p-6 backdrop-blur-md shadow-2xl">
        <div className="flex flex-col items-center mb-7">
          <PolarisLogo className="w-60 max-w-full" />
        </div>

        <h1 className="font-display text-xl font-semibold mb-1">{titles[mode].heading}</h1>
        <p className="text-sm text-muted-foreground mb-5">{titles[mode].sub}</p>

        {mode === "signin" && (
          <form onSubmit={handleSignIn} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@jlsyachts.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Please wait…" : "Sign in"}
            </Button>
            <button
              type="button"
              onClick={() => setMode("forgot-password")}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition"
            >
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
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
