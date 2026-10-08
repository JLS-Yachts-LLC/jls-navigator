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
import { BellOff, BellRing, Download, MoreVertical, RefreshCw, Share, SquarePlus, WifiOff, X } from "lucide-react";
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

// ─── Notifications ────────────────────────────────────────────────────────────

const toKey = (b64url: string) => {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

type PortalApi = (path: string, init?: RequestInit) => Promise<Response>;
type PushState = { ready: boolean; available: boolean; supported: boolean; needsInstall: boolean; on: boolean; denied: boolean };

/**
 * This device's phone notifications. Web Push needs a service worker and, on
 * iPhone, the app installed on the home screen (Safari tabs can't receive them).
 * `available` is false until the server has its VAPID keys.
 */
export function usePush(api: PortalApi) {
  const [s, set] = useState<PushState>({ ready: false, available: false, supported: false, needsInstall: false, on: false, denied: false });
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const needsInstall = isIOS() && !isStandalone();
    let sub: PushSubscription | null = null;
    if (supported) { try { sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch { /* none */ } }
    try {
      const res = await api(`/api/portal/push${sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : ""}`);
      const j = res.ok ? await res.json() : null;
      setKey(j?.publicKey ?? null);
      set({ ready: true, available: !!j?.available, supported, needsInstall, on: !!sub && !!j?.subscribed,
            denied: supported && Notification.permission === "denied" });
    } catch {
      set({ ready: true, available: false, supported, needsInstall, on: false, denied: false });
    }
  }, [api]);

  useEffect(() => { void refresh(); }, [refresh]);

  const enable = useCallback(async () => {
    if (!key) return;
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== "granted") { await refresh(); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) });
      const res = await api("/api/portal/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't switch notifications on.");
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't switch notifications on.");
    } finally { setBusy(false); }
  }, [api, key, refresh]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) {
        await api("/api/portal/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      await refresh();
    } finally { setBusy(false); }
  }, [api, refresh]);

  return { ...s, busy, enable, disable };
}

/** Menu entry: switch this device's notifications on or off. Hidden until the server can send them. */
export function NotificationsMenuButton({ api }: { api: PortalApi }) {
  const push = usePush(api);
  const [howTo, setHowTo] = useState(false);
  if (!push.ready || !push.available) return null;
  const base = "mx-3 mb-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition";
  if (push.needsInstall) {
    return (
      <>
        <button type="button" onClick={() => setHowTo(true)} className={cn(base, "text-muted-foreground hover:text-foreground")}
                title="On iPhone, notifications work once the portal is on your home screen">
          <BellRing className="h-4 w-4" /> Notifications: add to home screen first
        </button>
        <InstallSheet open={howTo} onClose={() => setHowTo(false)} />
      </>
    );
  }
  if (!push.supported) return null;
  if (push.denied) {
    return (
      <p className="mx-3 mb-1 px-3 py-2 text-center text-[11px] leading-snug text-muted-foreground">
        Notifications are blocked for this site. Allow them in your phone's settings to get alerts.
      </p>
    );
  }
  return push.on ? (
    <button type="button" disabled={push.busy} onClick={() => void push.disable()}
            className={cn(base, "text-primary hover:text-foreground disabled:opacity-50")} title="Tap to stop notifications on this device">
      <BellRing className="h-4 w-4" /> Notifications on
    </button>
  ) : (
    <button type="button" disabled={push.busy} onClick={() => void push.enable()}
            className={cn(base, "text-muted-foreground hover:text-foreground disabled:opacity-50")}
            title="Get a notification when JLS replies, updates a request or finishes a job">
      <BellOff className="h-4 w-4" /> Turn on notifications
    </button>
  );
}

// ─── Offline ──────────────────────────────────────────────────────────────────

/** Online or not, kept current. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    setOnline(navigator.onLine !== false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export function OfflineBanner({ online, savedAt }: { online: boolean; savedAt?: string | null }) {
  if (online) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      <span>
        <span className="font-semibold">
          No signal: showing what was last loaded on this phone
          {savedAt ? ` (${new Date(savedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})` : ""}.
        </span>
        <span className="block text-xs text-muted-foreground">Sending requests, messages and changes needs a connection.</span>
      </span>
    </div>
  );
}

const SNAPSHOT_KEY = "portal.offline.v1";
const CACHE_OWNER_KEY = "portal.cacheOwner";

/** Who's signed in and on which vessel — enough to open the saved portal with no signal. No tokens. */
export type OfflineSnapshot<L, B, V> = { userId: string; email: string; link: L | null; boatOwner: B | null; vessels: V[]; savedAt: string };

export function saveOfflineSnapshot<L, B, V>(s: Omit<OfflineSnapshot<L, B, V>, "savedAt">) {
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ ...s, savedAt: new Date().toISOString() })); } catch { /* private mode */ }
}
export function loadOfflineSnapshot<L, B, V>(): OfflineSnapshot<L, B, V> | null {
  try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "null"); } catch { return null; }
}

/** Forget everything saved on this device for offline use. */
export async function clearPortalData() {
  try { localStorage.removeItem(SNAPSHOT_KEY); localStorage.removeItem(CACHE_OWNER_KEY); } catch { /* private mode */ }
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "clear-data" });
    for (const k of await caches.keys()) if (k.startsWith("portal-data-")) await caches.delete(k);
  } catch { /* no caches */ }
}

/** A different person signed in on this device: their predecessor's saved data goes. */
export async function claimPortalData(userId: string) {
  let owner: string | null = null;
  try { owner = localStorage.getItem(CACHE_OWNER_KEY); } catch { /* private mode */ }
  if (owner && owner !== userId) await clearPortalData();
  try { localStorage.setItem(CACHE_OWNER_KEY, userId); } catch { /* private mode */ }
}
