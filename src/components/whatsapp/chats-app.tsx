/**
 * Polaris Chats (/chats-app) — the WhatsApp inbox on its own, installable as a
 * desktop or phone app.
 *
 * A WhatsApp number that runs through Polaris (the Training number) has no phone
 * of its own, so WhatsApp Desktop can't be linked to it by QR code. This is the
 * stand-in: the same Inbox as Communications → WhatsApp, full window, plus what
 * WhatsApp Desktop gives you —
 *   - an alert (and a short sound) when a message comes in while you're elsewhere;
 *     clicking it opens that conversation;
 *   - the unread count on the taskbar / dock icon and in the window title.
 *
 * Checks for new messages every 15 seconds while the app is open, even minimised
 * (browsers may slow that to once a minute after a few minutes in the background).
 * Nothing arrives while the app is closed — keep it open, like WhatsApp Desktop.
 * Who sees which number is decided by the database (wa_my_lines), as in the Inbox.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, Loader2, LogOut, MessageCircle, Volume2, VolumeX, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { db, loadMyLines, type MyLine } from "./wa-common";
import { WaInbox, type Active } from "./wa-inbox";

const APP_PATH = "/chats-app";
const POLL_MS = 15_000;
const SOUND_KEY = "polaris.chats.sound";

const readSound = () => { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; } };
const notifySupported = () => typeof window !== "undefined" && "Notification" in window;

/** A short two-note chime, made in the browser (no sound file to load). */
let audio: AudioContext | null = null;
function chime() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const t = audio.currentTime;
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.18, t + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.25);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.3);
    }
  } catch { /* no sound here — the alert still shows */ }
}

/** The thread asked for in the address (?c=contact&l=line) — set when an alert opened the app. */
function threadFromUrl(): Active | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  const contactId = p.get("c"), lineId = p.get("l");
  return contactId && lineId ? { contactId, lineId } : null;
}

type Incoming = {
  id: string; contact_id: string; line_id: string; unread_count: number;
  last_inbound_at: string | null; last_preview: string | null; contact: { name: string | null } | null;
};

/**
 * Watches for new messages: keeps the unread total (badge + title) and raises an
 * alert for each conversation with a message newer than the last one it saw.
 */
function useNewMessageAlerts(enabled: boolean, lines: MyLine[], sound: boolean, onOpen: (t: Active) => void) {
  const [unread, setUnread] = useState(0);
  const since = useRef<number | null>(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  const alert = useCallback(async (c: Incoming) => {
    const line = lines.find((l) => l.id === c.line_id);
    const title = `${c.contact?.name ?? "New message"}${lines.length > 1 && line ? ` · ${line.label}` : ""}`;
    const body = c.last_preview ?? "New message";
    const data = { contactId: c.contact_id, lineId: c.line_id };
    const opts: NotificationOptions = { body, tag: c.id, icon: "/chats-icons/icon-192.png", data };
    try {
      const n = new Notification(title, opts);
      n.onclick = () => { window.focus(); n.close(); openRef.current(data); };
    } catch {
      // Some browsers (Android Chrome) only allow alerts from the service worker.
      try { await (await navigator.serviceWorker.ready).showNotification(title, opts); } catch { /* no alerts here */ }
    }
  }, [lines]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const tick = async () => {
      const [{ data: unreadRows }, { data: recent }] = await Promise.all([
        db().from("wa_conversations").select("unread_count").gt("unread_count", 0),
        db().from("wa_conversations")
          .select("id, contact_id, line_id, unread_count, last_inbound_at, last_preview, contact:wa_contacts(name)")
          .not("last_inbound_at", "is", null).order("last_inbound_at", { ascending: false }).limit(20),
      ]);
      if (stopped) return;
      setUnread(((unreadRows ?? []) as Array<{ unread_count: number }>).reduce((n, r) => n + r.unread_count, 0));
      const rows = (recent ?? []) as Incoming[];
      const newest = rows.length ? Date.parse(rows[0].last_inbound_at!) : 0;
      // The first look only sets where "new" starts — nothing already there is announced.
      if (since.current === null) { since.current = newest; return; }
      const fresh = rows.filter((r) => Date.parse(r.last_inbound_at!) > since.current! && r.unread_count > 0);
      if (newest > since.current) since.current = newest;
      if (!fresh.length) return;
      if (soundRef.current) chime();
      // Someone looking at the app sees the message arrive; the alert is for when they're elsewhere.
      if (notifySupported() && Notification.permission === "granted" && (document.hidden || !document.hasFocus())) {
        for (const c of fresh.slice(0, 3)) await alert(c);
      }
    };
    void tick();
    // Runs even when the window is hidden — that's when the alert matters.
    const t = window.setInterval(() => void tick(), POLL_MS);
    return () => { stopped = true; window.clearInterval(t); };
  }, [enabled, alert]);

  // Unread count on the taskbar / dock icon and in the window title.
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Polaris Chats` : "Polaris Chats";
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (unread > 0) void nav.setAppBadge?.(unread).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  }, [unread]);

  return unread;
}

export function ChatsApp() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [lines, setLines] = useState<MyLine[] | null>(null);
  const [sound, setSound] = useState(readSound);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    notifySupported() ? Notification.permission : "unsupported");
  // Which thread to show, and a key to reopen the Inbox on it when an alert is clicked.
  const [target, setTarget] = useState<{ thread: Active | null; n: number }>(() => ({ thread: threadFromUrl(), n: 0 }));

  const open = (thread: Active) => setTarget((t) => ({ thread, n: t.n + 1 }));

  // Opened directly (taskbar icon, bookmark) while signed out: the route check is skipped, so check here too.
  useEffect(() => {
    if (!authLoading && !user) window.location.replace(`/auth?next=${encodeURIComponent(APP_PATH)}`);
  }, [authLoading, user]);

  useEffect(() => {
    if (!user) return;
    void loadMyLines().then(setLines).catch(() => setLines([]));
  }, [user]);

  // The service worker keeps the app openable offline and routes alert clicks back here.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/chats-sw.js", { scope: APP_PATH }).catch(() => { /* alerts still work from the page */ });
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; contactId?: string; lineId?: string } | null;
      if (d?.type === "open-thread" && d.contactId && d.lineId) open({ contactId: d.contactId, lineId: d.lineId });
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);

  // A thread opened from the address bar shouldn't reopen on refresh.
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, "", APP_PATH);
  }, []);

  const unread = useNewMessageAlerts(!!lines?.length, lines ?? [], sound, open);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    try { localStorage.setItem(SOUND_KEY, next ? "on" : "off"); } catch { /* remembered for this visit only */ }
    if (next) chime();
  };
  const askPermission = async () => {
    if (!notifySupported()) return;
    setPermission(await Notification.requestPermission());
  };

  if (authLoading || !user || lines === null) {
    return <div className="grid h-dvh place-items-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <MessageCircle className="h-5 w-5 text-emerald-500" />
        <span className="font-semibold">Polaris Chats</span>
        {unread > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold text-white">{unread}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {permission === "default" && (
            <button onClick={() => void askPermission()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 text-xs font-medium text-white hover:bg-emerald-700">
              <Bell className="h-3.5 w-3.5" /> Turn on message alerts
            </button>
          )}
          {permission === "denied" && (
            <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex"
              title="Alerts are blocked for this site. Allow notifications in the browser's site settings (the icon left of the address), then reload.">
              <BellOff className="h-3.5 w-3.5" /> Alerts blocked
            </span>
          )}
          <IconButton title={sound ? "Sound on — click to mute" : "Sound off — click to turn on"} onClick={toggleSound}>
            {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </IconButton>
          <a href="/" target="_blank" rel="noreferrer" title="Open the full Polaris"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <ExternalLink className="h-4 w-4" />
          </a>
          <IconButton title={`Sign out (${user.email ?? ""})`}
            onClick={() => void signOut().then(() => window.location.replace(`/auth?next=${encodeURIComponent(APP_PATH)}`))}>
            <LogOut className="h-4 w-4" />
          </IconButton>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        {lines.length === 0 ? (
          <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">
            You haven't been given a WhatsApp number in Polaris yet. An admin can add you in WhatsApp → Setup → Numbers.
          </div>
        ) : (
          <WaInbox key={target.n} lines={lines} openThread={target.thread} fill />
        )}
      </main>
    </div>
  );
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      className={cn("grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground")}>
      {children}
    </button>
  );
}
