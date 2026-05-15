import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-Da-yLdYc.js";
import { u as useAuth, a as useNavigate, s as supabase, t as toast } from "./router-DkuxBX4X.js";
import { B as Button } from "./button-B7lrsNYO.js";
import { I as Input } from "./input-Xwj40ESg.js";
import { L as Label } from "./label-CMI1dy08.js";
import { l as logo } from "./jls-logo-DfpNKY-Z.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
function AuthPage() {
  const {
    user,
    loading
  } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = reactExports.useState("signin");
  const [email, setEmail] = reactExports.useState("");
  const [password, setPassword] = reactExports.useState("");
  const [confirmPassword, setConfirmPassword] = reactExports.useState("");
  const [busy, setBusy] = reactExports.useState(false);
  reactExports.useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=invite") || hash.includes("type=recovery")) {
      setMode("set-password");
    }
  }, []);
  reactExports.useEffect(() => {
    if (!loading && user && mode === "signin") {
      navigate({
        to: "/yachts"
      });
    }
  }, [loading, user, mode, navigate]);
  async function handleSignIn(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const {
        error
      } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      toast.success("Welcome back");
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }
  async function handleSetPassword(e) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const {
        error
      } = await supabase.auth.updateUser({
        password
      });
      if (error) throw error;
      toast.success("Password set — welcome to JLS Yachts");
      navigate({
        to: "/yachts"
      });
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Failed to set password");
    } finally {
      setBusy(false);
    }
  }
  async function handleForgotPassword(e) {
    e.preventDefault();
    if (!email) {
      toast.error("Enter your email address first");
      return;
    }
    setBusy(true);
    try {
      const {
        error
      } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`
      });
      if (error) throw error;
      toast.success("Password reset link sent — check your email");
      setMode("signin");
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Failed to send reset email");
    } finally {
      setBusy(false);
    }
  }
  const titles = {
    "signin": {
      heading: "Sign in",
      sub: "Access the operations dashboard."
    },
    "set-password": {
      heading: "Set your password",
      sub: "You have been invited to JLS Yachts CRM. Choose a password to activate your account."
    },
    "forgot-password": {
      heading: "Reset password",
      sub: "Enter your email and we'll send you a reset link."
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-h-screen items-center justify-center bg-background p-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 -z-10 opacity-40 [background-image:radial-gradient(circle_at_25%_15%,oklch(0.62_0.18_245/.25),transparent_45%),radial-gradient(circle_at_80%_80%,oklch(0.74_0.18_155/.18),transparent_50%)]" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-sm rounded-xl border border-border bg-card/80 p-6 backdrop-blur-md shadow-2xl", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mb-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-11 w-11 items-center justify-center rounded-md bg-white p-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: logo, alt: "JLS Yachts", className: "h-full w-full object-contain" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-display text-lg font-bold", children: "JLS Yachts" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-wider text-muted-foreground", children: "Port & Operations" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-xl font-semibold mb-1", children: titles[mode].heading }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground mb-5", children: titles[mode].sub }),
      mode === "signin" && /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSignIn, className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "email", children: "Email" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: "email", type: "email", required: true, value: email, onChange: (e) => setEmail(e.target.value), placeholder: "you@jlsyachts.com" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "password", children: "Password" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: "password", type: "password", required: true, minLength: 6, value: password, onChange: (e) => setPassword(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", disabled: busy, className: "w-full", children: busy ? "Please wait…" : "Sign in" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setMode("forgot-password"), className: "w-full text-center text-xs text-muted-foreground hover:text-foreground transition", children: "Forgot your password?" })
      ] }),
      mode === "set-password" && /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSetPassword, className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "new-password", children: "New password" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: "new-password", type: "password", required: true, minLength: 8, value: password, onChange: (e) => setPassword(e.target.value), placeholder: "Min. 8 characters" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "confirm-password", children: "Confirm password" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: "confirm-password", type: "password", required: true, minLength: 8, value: confirmPassword, onChange: (e) => setConfirmPassword(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", disabled: busy, className: "w-full", children: busy ? "Saving…" : "Activate account" })
      ] }),
      mode === "forgot-password" && /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleForgotPassword, className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "reset-email", children: "Email" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: "reset-email", type: "email", required: true, value: email, onChange: (e) => setEmail(e.target.value), placeholder: "you@jlsyachts.com" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", disabled: busy, className: "w-full", children: busy ? "Sending…" : "Send reset link" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setMode("signin"), className: "w-full text-center text-xs text-muted-foreground hover:text-foreground transition", children: "Back to sign in" })
      ] })
    ] })
  ] });
}
export {
  AuthPage as component
};
