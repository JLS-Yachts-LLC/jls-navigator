/**
 * The Client Portal as a phone app — installing it, and keeping it up to date.
 *
 * Installing
 *   /portal links /portal.webmanifest (named after the vessel on its own address),
 *   so Android offers "Install app" and iPhone's Share → Add to Home Screen opens it
 *   full-screen with its own icon. Android announces the install dialog with
 *   `beforeinstallprompt`; it's held here so our button opens it in one tap.
 *   iPhone has no install API, so the button explains the two taps instead.
 *
 * Self-updating (no app store involved)
 *   public/portal-sw.js loads the page from the network first, so opening the app
 *   always gets the latest release. An app left open in the background is caught
 *   by watching /version.json (every build writes a new id): when it changes, the
 *   app reloads itself — but only when nothing would be lost (no half-written
 *   message, no open form, nobody typing). Until then a small "Update" button
 *   shows. When the app is next sent to the background, it updates there.
 */
import { useCallback, useEffect, useState } from "react";
import { Download, MoreVertical, RefreshCw, Share, SquarePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

declare const __BUILD_ID__: string;

const RUNNING = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";
const CHECK_MS = 5 * 60_000;
const QUIET_MS = 20_000;
const ATTEMPTS_KEY = "portal.app.updateAttempts";
const DISMISS_KEY = "portal.app.installDismissed";

// ─── Install ──────────────────────────────────────────────────────────────────

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// The event can fire before any component mounts, so it's caught at module load.
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // our button opens it instead of Chrome's mini-bar
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => { deferred = null; notify(); });
}

/** Running from the home screen (the installed app), not a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isPhoneOrTablet(): boolean {
  if (typeof navigator === "undefined") return false;
  return isIOS() || /Android|Mobi/i.test(navigator.userAgent);
}

export function useInstall() {
  const [, force] = useState(0);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(true); // until storage says otherwise
  const [handheld, setHandheld] = useState(false);

  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    setInstalled(isStandalone());
    setHandheld(isPhoneOrTablet());
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === "1"); } catch { setDismissed(false); }
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => { listeners.delete(l); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  return {
    installed,
    handheld,
    canPrompt: deferred !== null,
    ios: isIOS(),
    dismissed,
    dismiss() {
      setDismissed(true);
      try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
    },
    async prompt(): Promise<boolean> {
      const ev = deferred;
      if (!ev) return false;
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      deferred = null;
      notify();
      if (outcome === "accepted") setInstalled(true);
      return outcome === "accepted";
    },
  };
}

/** The one-time card on Home, on phones and tablets that haven't installed it. */
export function InstallCard({ vessel }: { vessel: string | null }) {
  const install = useInstall();
  const [howTo, setHowTo] = useState(false);
  if (install.installed || install.dismissed || !(install.handheld || install.canPrompt)) return null;

  async function add() {
    if (install.canPrompt) { if (await install.prompt()) install.dismiss(); }
    else setHowTo(true);
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-4">
        <SquarePlus className="h-6 w-6 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Put {vessel ? `${vessel}'s portal` : "the portal"} on your home screen</div>
          <div className="text-xs text-muted-foreground">Opens full-screen like an app, and keeps itself up to date.</div>
        </div>
        <button type="button" onClick={() => void add()}
                className="shrink-0 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground">
          Add
        </button>
        <button type="button" onClick={install.dismiss} title="Not now" aria-label="Not now"
                className="shrink-0 rounded-lg p-1 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <InstallSheet open={howTo} onClose={() => setHowTo(false)} />
    </>
  );
}

/** Menu entry — there until installed, for anyone who dismissed the card. */
export function InstallMenuButton() {
  const install = useInstall();
  const [howTo, setHowTo] = useState(false);
  if (install.installed) return null;
  return (
    <>
      <button type="button" onClick={() => void (install.canPrompt ? install.prompt() : Promise.resolve(setHowTo(true)))}
              className="mx-3 mb-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
        <Download className="h-4 w-4" /> Install the app
      </button>
      <InstallSheet open={howTo} onClose={() => setHowTo(false)} />
    </>
  );
}

function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ios = isIOS();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 shadow-2xl sm:rounded-3xl"
           style={{ paddingBottom: "max(28px, env(safe-area-inset-bottom))" }}
           onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">Add to your home screen</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ol className="space-y-4">
          {ios ? (
            <>
              <Step n={1}>Tap <b>Share</b> <Share className="mx-0.5 inline h-4 w-4 align-text-bottom text-primary" /> at the bottom of Safari (top-right on iPad).</Step>
              <Step n={2}>Scroll down, tap <b>Add to Home Screen</b>, then <b>Add</b>.</Step>
            </>
          ) : (
            <>
              <Step n={1}>Tap the browser menu <MoreVertical className="mx-0.5 inline h-4 w-4 align-text-bottom text-primary" /> (top-right in Chrome).</Step>
              <Step n={2}>Tap <b>Install app</b> or <b>Add to Home screen</b>, then confirm.</Step>
            </>
          )}
          <Step n={3}>Open it from your home screen.</Step>
        </ol>
        {ios && (
          <p className="mt-5 rounded-xl border border-border bg-background/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            On iPhone the home-screen app keeps its own sign-in, so you'll sign in (and confirm your code) once more the first time you open it.
          </p>
        )}
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm leading-relaxed">
      <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary")}>{n}</span>
      <span>{children}</span>
    </li>
  );
}

// ─── Self-updating ────────────────────────────────────────────────────────────

let lastInput = 0;
if (typeof window !== "undefined") {
  for (const ev of ["keydown", "input", "pointerdown"] as const) {
    window.addEventListener(ev, () => { lastInput = Date.now(); }, { capture: true, passive: true });
  }
}

/** Reloading now would lose nothing: no field in use, no sheet open, no unsent text. */
function safeToReload(): boolean {
  const a = document.activeElement as HTMLElement | null;
  if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)) return false;
  // Portal sheets and dialogs are full-screen overlays; the menu drawer's backdrop too.
  if (document.querySelector('[role="dialog"], [role="alertdialog"], .fixed.inset-0')) return false;
  for (const t of Array.from(document.querySelectorAll("textarea"))) if (t.value.trim()) return false;
  return Date.now() - lastInput > QUIET_MS;
}

/** At most two reloads per build, so a slow-to-arrive release can't loop. */
function mayReloadFor(build: string): boolean {
  try {
    const seen = JSON.parse(sessionStorage.getItem(ATTEMPTS_KEY) || "{}") as Record<string, number>;
    if ((seen[build] ?? 0) >= 2) return false;
    sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify({ [build]: (seen[build] ?? 0) + 1 }));
    return true;
  } catch { return true; }
}

/**
 * Register the app's service worker and keep the running build current.
 * Mount once, inside the portal. Returns whether an update is waiting on the user.
 */
export function usePortalAppUpdates(): { ready: boolean; apply: () => void } {
  const [latest, setLatest] = useState<string | null>(null);

  // Tapped on purpose, so no limit: whatever they had open, they chose to update.
  const apply = useCallback(() => { window.location.reload(); }, []);

  useEffect(() => {
    if (RUNNING === "dev" || typeof window === "undefined") return;
    let reg: ServiceWorkerRegistration | null = null;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/portal-sw.js", { scope: "/portal", updateViaCache: "none" })
        .then((r) => { reg = r; })
        .catch(() => { /* no worker: the portal still works, just not offline */ });
    }

    let pending: string | null = null;
    const tryApply = () => {
      if (!pending || !safeToReload() || !mayReloadFor(pending)) return false;
      window.location.reload();
      return true;
    };

    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const { buildId } = (await res.json()) as { buildId?: string };
        if (!buildId || buildId === RUNNING) return;
        pending = buildId;
        void reg?.update().catch(() => {});
        if (!tryApply()) setLatest(buildId);
      } catch { /* offline — next time */ }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
      else tryApply(); // sent to the background: update there, out of the way
    };
    const interval = setInterval(() => { if (pending) tryApply(); else void check(); }, CHECK_MS);
    const retry = setInterval(() => { if (pending) tryApply(); }, 30_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", check);
    void check();
    return () => {
      clearInterval(interval);
      clearInterval(retry);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", check);
    };
  }, []);

  return { ready: latest !== null, apply };
}

/** The small "new version" button, while an update waits for a safe moment. */
export function UpdateReady({ onApply }: { onApply: () => void }) {
  return (
    <button type="button" onClick={onApply}
            className="fixed left-1/2 z-[65] flex -translate-x-1/2 items-center gap-2 rounded-full border border-primary/50 bg-card px-4 py-2 text-sm font-semibold shadow-xl"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 84px)" }}>
      <RefreshCw className="h-4 w-4 text-primary" /> New version ready — Update
    </button>
  );
}
