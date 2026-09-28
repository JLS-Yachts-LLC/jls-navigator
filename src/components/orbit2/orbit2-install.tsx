/**
 * Orbit field app — putting it on the phone's home screen.
 *
 * Two platforms, two mechanisms:
 *
 *   Android (Chrome, Edge, Samsung Internet)
 *     The browser offers its own install dialog once the page links a manifest
 *     (public/orbit-app.webmanifest). It announces that with a
 *     `beforeinstallprompt` event, which is held here so the Add button can open
 *     the dialog in one tap.
 *
 *   iPhone / iPad
 *     Safari has no install API at all — the only way is Share → Add to Home
 *     Screen. So the button explains those two taps instead.
 *
 * Once it is running from the home screen (display-mode: standalone) all of this
 * disappears. The banner can be dismissed; the header button stays for later.
 */
import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/** Chrome's install event — not in the DOM typings. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// The event can fire before any component has mounted, so it is caught here, at
// module load, and handed to whichever component asks.
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep Chrome's mini-bar away; our button opens it
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => { deferred = null; notify(); });
}

const DISMISS_KEY = "orbit2.field.installDismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function useInstall() {
  const [, force] = useState(0);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(true); // assume dismissed until storage says otherwise

  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    setInstalled(isStandalone());
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === "1"); } catch { setDismissed(false); }
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => { listeners.delete(l); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  return {
    /** Already running from the home screen — offer nothing. */
    installed,
    /** Android: the browser's own dialog is ready to open. */
    canPrompt: deferred !== null,
    ios: isIOS(),
    dismissed,
    dismiss() {
      setDismissed(true);
      try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
    },
    /** Open the browser's install dialog. Resolves true if they said yes. */
    async prompt(): Promise<boolean> {
      const ev = deferred;
      if (!ev) return false;
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      deferred = null; // single use
      notify();
      if (outcome === "accepted") setInstalled(true);
      return outcome === "accepted";
    },
  };
}

/** The one-time banner at the top of the job list. */
export function InstallBanner({ onHowTo }: { onHowTo: () => void }) {
  const install = useInstall();
  if (install.installed || install.dismissed) return null;

  async function add() {
    if (install.canPrompt) { if (await install.prompt()) install.dismiss(); }
    else onHowTo();
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-3.5 py-3">
      <SquarePlus className="h-6 w-6 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">Add Orbit to your home screen</div>
        <div className="text-[14px] text-muted-foreground">Opens full-screen, like an app — one tap from your phone.</div>
      </div>
      <button onClick={() => void add()}
        className="shrink-0 rounded-lg bg-primary px-3 py-2 text-[15px] font-semibold text-primary-foreground">
        Add
      </button>
      <button onClick={install.dismiss} title="Not now" aria-label="Not now"
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Header button — always there until installed, for anyone who dismissed the banner. */
export function InstallButton({ onHowTo }: { onHowTo: () => void }) {
  const install = useInstall();
  if (install.installed) return null;
  return (
    <button
      onClick={() => void (install.canPrompt ? install.prompt() : Promise.resolve(onHowTo()))}
      title="Add to Home Screen" aria-label="Add to Home Screen"
      className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
      <Download className="h-5 w-5" />
    </button>
  );
}

/**
 * The instructions, for when the browser has no install dialog to open — every
 * iPhone, and Android browsers that have not offered one yet.
 */
export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ios = isIOS();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-card px-5 pb-8 pt-5 shadow-2xl"
        style={{ paddingBottom: "max(32px, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-display text-[22px] font-bold">Add to Home Screen</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        <ol className="space-y-4">
          {ios ? (
            <>
              <Step n={1}>
                Tap <b>Share</b> <Share className="mx-0.5 inline h-5 w-5 align-text-bottom text-primary" /> at the
                bottom of Safari (top-right on iPad).
              </Step>
              <Step n={2}>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</Step>
            </>
          ) : (
            <>
              <Step n={1}>
                Tap the browser menu <MoreVertical className="mx-0.5 inline h-5 w-5 align-text-bottom text-primary" /> (top-right in Chrome).
              </Step>
              <Step n={2}>Tap <b>Add to Home screen</b> or <b>Install app</b>, then confirm.</Step>
            </>
          )}
          <Step n={3}>Open <b>Orbit</b> from your home screen.</Step>
        </ol>

        {ios && (
          <p className="mt-5 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-[14px] text-muted-foreground">
            On iPhone the home-screen app keeps its own sign-in, so you'll sign in once more the first time you open it.
          </p>
        )}
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-[16px] leading-relaxed">
      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        "bg-primary/15 text-[14px] font-bold text-primary")}>{n}</span>
      <span>{children}</span>
    </li>
  );
}
