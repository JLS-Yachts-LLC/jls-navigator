/**
 * JLS Training — the training room tablet at /training-kiosk.
 *
 * Paired exactly like the Port Operations wall: first visit registers the
 * tablet, keeps the secret key it's handed (localStorage + a long cookie) and
 * shows a code + QR; Training staff enter it at Training Institute → Tablet.
 * From then on it opens straight to the kiosk:
 *
 *   Sign in   — today's sessions; tap yours, type your name and mobile, done.
 *               Nobody else's name is ever shown — only how many have signed in.
 *   Calendar  — courses and exams for the next six weeks, and the course list.
 *   Review    — a QR code to JLS Training's Google review page (scanned with the
 *               student's own phone, so nobody signs in to Google on a shared tablet).
 *
 * Untouched for a minute, it clears what was typed and goes back to Sign in.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  TRAINING_BRAND, type KioskSession, type SignInResult, type TrainingKioskBoard, type TrainingKioskResponse,
} from "@/lib/training-kiosk";

declare const __BUILD_ID__: string;

const KEY_STORE = "polaris.kiosk.key";
const BOARD_STORE = "polaris.kiosk.lastBoard";
const COOKIE = "polaris_kiosk";
const IDLE_MS = 60_000;
const DONE_MS = 7_000;

const C = {
  bg: "#081422",
  panel: "#0E1E33",
  edge: "#1D3858",
  text: "#EAF2F8",
  muted: "#9DB2C8",
  dim: "#62758C",
  teal: "#96CBC7",
  blue: "#4590BA",
  gold: "#F5B83D",
  green: "#3DBE84",
  red: "#EF5A5F",
};

// ── Key storage ──────────────────────────────────────────────────────────────
function readKey(): string | null {
  try { const k = localStorage.getItem(KEY_STORE); if (k) return k; } catch { /* storage blocked */ }
  const m = typeof document !== "undefined" ? document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([a-f0-9]{64})`)) : null;
  return m ? m[1] : null;
}
function saveKey(k: string) {
  try { localStorage.setItem(KEY_STORE, k); } catch { /* cookie still holds it */ }
  document.cookie = `${COOKIE}=${k}; Max-Age=${60 * 60 * 24 * 400}; Path=/training-kiosk; SameSite=Lax; Secure`;
}
function clearKey() {
  try { localStorage.removeItem(KEY_STORE); localStorage.removeItem(BOARD_STORE); } catch { /* ignore */ }
  document.cookie = `${COOKIE}=; Max-Age=0; Path=/training-kiosk; SameSite=Lax; Secure`;
}

// ── Formatting (always UAE time) ─────────────────────────────────────────────
const TZ = "Asia/Dubai";
const dayLong = (ymd: string) =>
  new Date(`${ymd}T12:00:00+04:00`).toLocaleDateString("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const dayShort = (ymd: string) =>
  new Date(`${ymd}T12:00:00+04:00`).toLocaleDateString("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
/** "0900-1700" → "09:00 – 17:00"; anything else as typed. */
function fmtTime(t: string | null): string | null {
  if (!t) return null;
  const m = t.replace(/\s/g, "").match(/^(\d{1,2}):?(\d{2})-(\d{1,2}):?(\d{2})$/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]} – ${m[3].padStart(2, "0")}:${m[4]}` : t;
}

type View = "signin" | "calendar" | "review";

// ── Root ─────────────────────────────────────────────────────────────────────
export function TrainingKioskScreen() {
  const [state, setState] = useState<TrainingKioskResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);

  const register = useCallback(async () => {
    try {
      const res = await fetch("/api/training-kiosk/display", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Could not register");
      saveKey(body.key);
      keyRef.current = body.key;
      setRegisterError(null);
      setState({ state: "pending", code: body.code, expiresAt: body.expiresAt });
    } catch (e) {
      setRegisterError((e as Error).message);
    }
  }, []);

  const poll = useCallback(async () => {
    const key = keyRef.current;
    if (!key) return register();
    try {
      const res = await fetch("/api/training-kiosk/display", { headers: { "X-Kiosk-Key": key }, cache: "no-store" });
      const body = (await res.json()) as TrainingKioskResponse;
      setOffline(false);
      if (body.state === "unknown") { clearKey(); keyRef.current = null; return register(); }
      setState(body);
      if (body.state === "paired") { try { localStorage.setItem(BOARD_STORE, JSON.stringify(body)); } catch { /* full */ } }
    } catch {
      setOffline(true);
    }
  }, [register]);

  useEffect(() => {
    keyRef.current = readKey();
    if (keyRef.current) {
      try { const last = localStorage.getItem(BOARD_STORE); if (last) setState(JSON.parse(last)); } catch { /* ignore */ }
    }
    poll();
  }, [poll]);

  // Waiting tablets check every 4s so pairing feels instant; the kiosk every minute.
  const pending = state?.state === "pending" || !state;
  useEffect(() => {
    const t = setInterval(poll, pending ? 4_000 : 60_000);
    return () => clearInterval(t);
  }, [poll, pending]);

  // A tablet left on for weeks still picks up new builds.
  useEffect(() => {
    const running = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";
    if (running === "dev") return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        const { buildId } = await r.json();
        if (buildId && buildId !== running) location.reload();
      } catch { /* try again next time */ }
    }, 10 * 60_000);
    return () => clearInterval(t);
  }, []);

  // Keep the screen awake.
  useEffect(() => {
    let lock: any = null;
    const grab = async () => { try { lock = await (navigator as any).wakeLock?.request("screen"); } catch { /* unsupported */ } };
    grab();
    const onVis = () => { if (document.visibilityState === "visible") grab(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lock?.release?.().catch?.(() => {}); };
  }, []);

  const signIn = useCallback(async (eventId: string, name: string, mobile: string): Promise<SignInResult> => {
    try {
      const res = await fetch("/api/training-kiosk/sign-in", {
        method: "POST",
        headers: { "X-Kiosk-Key": keyRef.current ?? "", "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, name, mobile }),
      });
      const body = (await res.json().catch(() => ({}))) as SignInResult;
      if (res.status === 401) poll();
      if (body.ok) poll(); // the session's count goes up
      return body.ok !== undefined ? body : { ok: false, error: "Couldn't save that — please try again." };
    } catch {
      return { ok: false, error: "No connection — please try again in a moment." };
    }
  }, [poll]);

  return (
    <div onContextMenu={(e) => e.preventDefault()} style={{
      position: "fixed", inset: 0, background: C.bg, color: C.text, overflow: "hidden",
      fontFamily: "Inter, system-ui, sans-serif", fontSize: "clamp(15px, 1.45vw, 24px)",
      // A shared touchscreen: no stray pinch-zoom or text selection (inputs still select).
      touchAction: "pan-y", userSelect: "none", WebkitUserSelect: "none",
    }}>
      <style>{`
        .kiosk-btn { all: unset; box-sizing: border-box; cursor: pointer; -webkit-tap-highlight-color: transparent; }
        .kiosk-btn:active { transform: scale(.985); filter: brightness(1.15); }
        .kiosk-btn:focus-visible { outline: 3px solid ${C.gold}; outline-offset: 2px; }
        .kiosk-input { box-sizing: border-box; width: 100%; font: inherit; font-size: 1.35em; padding: .7em .8em; border-radius: 14px;
          border: 2px solid ${C.edge}; background: #06101C; color: ${C.text}; user-select: text; -webkit-user-select: text; }
        .kiosk-input:focus { outline: none; border-color: ${C.teal}; }
        .kiosk-scroll { overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: ${C.edge} transparent; }
        @keyframes kiosk-pop { from { transform: scale(.6); opacity: 0 } to { transform: none; opacity: 1 } }
      `}</style>
      {state?.state === "paired"
        ? <Kiosk name={state.name} title={state.settings.title} board={state.board} offline={offline} signIn={signIn} />
        : <Pairing code={state?.state === "pending" ? state.code : null} error={registerError} />}
    </div>
  );
}

// ── Pairing ──────────────────────────────────────────────────────────────────
function Pairing({ code, error }: { code: string | null; error: string | null }) {
  const [qr, setQr] = useState<string | null>(null);
  const link = code ? `${location.origin}/training?tab=tablet&code=${code}` : null;
  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: "#081422", light: "#FFFFFF" } }).then(setQr).catch(() => setQr(null));
  }, [link]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2em", padding: "4vh 5vw", textAlign: "center" }}>
      <div>
        <div style={{ color: C.teal, fontSize: "1em", textTransform: "uppercase", letterSpacing: ".2em", fontWeight: 600 }}>{TRAINING_BRAND}</div>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "2.2em", fontWeight: 700, marginTop: ".3em" }}>Training room tablet</div>
        <div style={{ color: C.muted, fontSize: "1.2em", marginTop: ".4em" }}>This tablet isn't paired yet.</div>
      </div>
      {error ? (
        <div style={{ color: C.red, fontSize: "1.2em" }}>{error} — retrying…</div>
      ) : (
        <div style={{ display: "flex", gap: "3em", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <div>
            <div style={{ color: C.muted, fontSize: "1em", textTransform: "uppercase", letterSpacing: ".18em" }}>Pairing code</div>
            <div style={{ fontFamily: "'Space Grotesk', monospace", fontSize: "4.6em", fontWeight: 700, letterSpacing: ".16em", color: C.teal, marginTop: ".1em" }}>
              {code ? `${code.slice(0, 3)} ${code.slice(3)}` : "· · ·"}
            </div>
            <div style={{ color: C.dim }}>A new code appears every 30 minutes</div>
          </div>
          {qr && (
            <div style={{ background: "#fff", padding: ".8em", borderRadius: 16 }}>
              <img src={qr} alt="" style={{ width: "11em", height: "11em", display: "block" }} />
            </div>
          )}
        </div>
      )}
      <div style={{ color: C.muted, fontSize: "1.1em", maxWidth: "34em", lineHeight: 1.6 }}>
        In Polaris, open <b style={{ color: C.text }}>Training Institute → Tablet</b> and enter this code — or scan the QR code with your phone.
        The tablet remembers itself once paired.
      </div>
    </div>
  );
}

// ── The kiosk ────────────────────────────────────────────────────────────────
function Kiosk({ name, title, board, offline, signIn }: {
  name: string; title?: string; board: TrainingKioskBoard; offline: boolean;
  signIn: (eventId: string, name: string, mobile: string) => Promise<SignInResult>;
}) {
  const [view, setView] = useState<View>("signin");
  const [session, setSession] = useState<KioskSession | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const back = useCallback(() => setSession(null), []);

  // A minute untouched → clear everything typed, back to the start.
  useEffect(() => {
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const opts = { capture: true, passive: true } as const;
    for (const ev of ["pointerdown", "keydown", "touchstart", "input"]) window.addEventListener(ev, bump, opts);
    const t = setInterval(() => {
      if (Date.now() - last > IDLE_MS) {
        last = Date.now();
        setView("signin"); setSession(null); setResetKey((k) => k + 1);
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
    }, 5000);
    return () => { for (const ev of ["pointerdown", "keydown", "touchstart", "input"]) window.removeEventListener(ev, bump, opts); clearInterval(t); };
  }, []);

  // The session picked can drop off the board (staff edited the calendar) — go back.
  useEffect(() => {
    if (session && !board.sessions.some((s) => s.id === session.id)) setSession(null);
  }, [board.sessions, session]);

  const tabs: [View, string][] = [["signin", "Sign in"], ["calendar", "Course calendar"], ...(board.reviewUrl ? [["review", "Leave a review"] as [View, string]] : [])];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1em", padding: "1em 1.6em", borderBottom: `1px solid ${C.edge}` }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.teal, fontSize: ".8em", textTransform: "uppercase", letterSpacing: ".2em", fontWeight: 600 }}>{TRAINING_BRAND}</div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.6em", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {title || "Welcome"}
          </div>
        </div>
        <Clock today={board.today} />
      </header>

      <nav style={{ display: "flex", gap: ".6em", padding: ".9em 1.6em 0" }}>
        {tabs.map(([v, label]) => (
          <button key={v} className="kiosk-btn" onClick={() => { setView(v); if (v !== "signin") setSession(null); }} style={{
            flex: 1, textAlign: "center", padding: ".85em .6em", borderRadius: 14, fontWeight: 650, fontSize: "1.1em",
            background: view === v ? C.teal : C.panel, color: view === v ? "#06101C" : C.text, border: `1px solid ${view === v ? C.teal : C.edge}`,
          }}>{label}</button>
        ))}
      </nav>

      <main className="kiosk-scroll" style={{ flex: 1, minHeight: 0, padding: "1.2em 1.6em 1.6em" }}>
        {view === "signin" && (session
          ? <SignInForm key={`${session.id}-${resetKey}`} session={session} onBack={back} signIn={signIn} />
          : <Sessions board={board} onPick={setSession} onCalendar={() => setView("calendar")} />)}
        {view === "calendar" && <Calendar board={board} />}
        {view === "review" && board.reviewUrl && <Review url={board.reviewUrl} />}
      </main>

      <footer style={{ display: "flex", justifyContent: "space-between", padding: ".5em 1.6em", color: C.dim, fontSize: ".75em", borderTop: `1px solid ${C.edge}` }}>
        <span>{name}</span>
        <span>{offline ? "Offline — showing the last update" : "Your details are only seen by the JLS Training team"}</span>
      </footer>
    </div>
  );
}

function Clock({ today }: { today: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(t); }, []);
  return (
    <div style={{ textAlign: "right", flexShrink: 0 }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.7em", fontWeight: 700 }}>
        {now.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })}
      </div>
      <div style={{ color: C.muted, fontSize: ".9em" }}>{dayLong(today)}</div>
    </div>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return <span style={{ display: "inline-block", padding: ".15em .65em", borderRadius: 999, fontSize: ".78em", fontWeight: 650, color, border: `1px solid ${color}66`, background: `${color}1A` }}>{children}</span>;
}
const pillColor = (cat: string | null) => (cat === "Exam" ? C.gold : cat === "Closed" ? C.dim : C.blue);

// ── Sign in: today's sessions ────────────────────────────────────────────────
function Sessions({ board, onPick, onCalendar }: { board: TrainingKioskBoard; onPick: (s: KioskSession) => void; onCalendar: () => void }) {
  if (!board.sessions.length) {
    return (
      <div style={{ textAlign: "center", padding: "10vh 1em", color: C.muted }}>
        <div style={{ fontSize: "1.6em", color: C.text, fontWeight: 650 }}>No sessions on the calendar today</div>
        <div style={{ marginTop: ".6em", fontSize: "1.1em" }}>If you're here for a course, please let your instructor know.</div>
        <button className="kiosk-btn" onClick={onCalendar} style={{ marginTop: "1.8em", padding: ".8em 1.6em", borderRadius: 14, border: `1px solid ${C.edge}`, background: C.panel, fontWeight: 600 }}>
          See upcoming courses
        </button>
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: "1.35em", fontWeight: 650 }}>Here for a course today?</div>
      <div style={{ color: C.muted, marginTop: ".2em", marginBottom: "1em" }}>Tap your session to sign in.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(17em, 1fr))", gap: "1em" }}>
        {board.sessions.map((s) => (
          <button key={s.id} className="kiosk-btn" onClick={() => onPick(s)} style={{
            display: "flex", flexDirection: "column", gap: ".55em", padding: "1.3em 1.4em", borderRadius: 18,
            background: C.panel, border: `1px solid ${C.edge}`, minHeight: "9em",
          }}>
            <div style={{ display: "flex", gap: ".5em", alignItems: "center" }}>
              {s.category && <Pill color={pillColor(s.category)}>{s.category}</Pill>}
              {fmtTime(s.time) && <span style={{ color: C.muted }}>{fmtTime(s.time)}</span>}
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.6em", fontWeight: 700, lineHeight: 1.2 }}>{s.title}</div>
            <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1em" }}>
              <span style={{ color: C.dim, fontSize: ".9em" }}>{s.signedIn ? `${s.signedIn} signed in` : "Nobody signed in yet"}</span>
              <span style={{ color: C.teal, fontWeight: 650 }}>Sign in →</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SignInForm({ session, onBack, signIn }: {
  session: KioskSession; onBack: () => void;
  signIn: (eventId: string, name: string, mobile: string) => Promise<SignInResult>;
}) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<SignInResult, { ok: true }> | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  // After the thank-you, back to the list for the next person (and nothing typed is left behind).
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onBack, DONE_MS);
    return () => clearTimeout(t);
  }, [done, onBack]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    const r = await signIn(session.id, name, mobile);
    setBusy(false);
    if (r.ok) { setDone(r); setName(""); setMobile(""); (document.activeElement as HTMLElement | null)?.blur?.(); }
    else setError(r.error);
  };

  if (done) {
    return (
      <div style={{ textAlign: "center", padding: "8vh 1em" }}>
        <div style={{ width: "5.5em", height: "5.5em", margin: "0 auto", borderRadius: "50%", background: C.green, color: "#06101C",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6em", fontWeight: 800, animation: "kiosk-pop .35s ease-out" }}>✓</div>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "2em", fontWeight: 700, marginTop: ".8em" }}>
          {done.already ? `You're already signed in${done.firstName ? `, ${done.firstName}` : ""}` : `Thanks${done.firstName ? `, ${done.firstName}` : ""} — you're signed in`}
        </div>
        <div style={{ color: C.muted, fontSize: "1.2em", marginTop: ".4em" }}>{done.session} · enjoy your course!</div>
        <button className="kiosk-btn" onClick={onBack} style={{ marginTop: "2em", padding: ".8em 1.8em", borderRadius: 14, background: C.panel, border: `1px solid ${C.edge}`, fontWeight: 600 }}>
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: "34em", margin: "0 auto" }}>
      <button type="button" className="kiosk-btn" onClick={onBack} style={{ color: C.muted, padding: ".4em 0", fontWeight: 600 }}>← Back to today's sessions</button>
      <div style={{ marginTop: ".8em", display: "flex", gap: ".5em", alignItems: "center" }}>
        {session.category && <Pill color={pillColor(session.category)}>{session.category}</Pill>}
        {fmtTime(session.time) && <span style={{ color: C.muted }}>{fmtTime(session.time)}</span>}
      </div>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.9em", fontWeight: 700, marginTop: ".2em" }}>{session.title}</div>

      <label style={{ display: "block", marginTop: "1.4em" }}>
        <div style={{ fontWeight: 600, marginBottom: ".4em" }}>Your full name</div>
        <input ref={nameRef} className="kiosk-input" value={name} onChange={(e) => setName(e.target.value)}
          autoComplete="off" autoCorrect="off" spellCheck={false} autoCapitalize="words" maxLength={80} enterKeyHint="next" />
      </label>
      <label style={{ display: "block", marginTop: "1em" }}>
        <div style={{ fontWeight: 600, marginBottom: ".4em" }}>Your mobile number</div>
        <input className="kiosk-input" value={mobile} onChange={(e) => setMobile(e.target.value)}
          type="tel" inputMode="tel" autoComplete="off" maxLength={30} placeholder="e.g. 050 123 4567" enterKeyHint="done" />
      </label>

      {error && <div style={{ color: C.red, marginTop: ".9em", fontWeight: 600 }}>{error}</div>}

      <button type="submit" className="kiosk-btn" disabled={busy} style={{
        display: "block", width: "100%", textAlign: "center", marginTop: "1.4em", padding: ".9em", borderRadius: 14,
        background: C.teal, color: "#06101C", fontWeight: 750, fontSize: "1.3em", opacity: busy ? 0.6 : 1,
      }}>{busy ? "Signing in…" : "Sign in"}</button>
      <div style={{ color: C.dim, fontSize: ".85em", marginTop: ".9em", lineHeight: 1.5 }}>
        Your name and number are used only to record your attendance and are seen only by the JLS Training team.
        Nothing you type stays on this tablet.
      </div>
    </form>
  );
}

// ── Calendar ─────────────────────────────────────────────────────────────────
function Calendar({ board }: { board: TrainingKioskBoard }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(20em, 1fr))", gap: "1.6em", alignItems: "start" }}>
      <section>
        <div style={{ fontSize: "1.35em", fontWeight: 650 }}>Coming up</div>
        <div style={{ color: C.muted, marginTop: ".2em", marginBottom: "1em" }}>Courses and exams for the next six weeks.</div>
        {board.calendar.length === 0 && <div style={{ color: C.muted, padding: "1em 0" }}>Nothing on the calendar yet — ask the team about dates.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: ".7em" }}>
          {board.calendar.map((d) => (
            <div key={d.date} style={{ display: "flex", gap: "1em", padding: ".9em 1.1em", borderRadius: 14, background: C.panel, border: `1px solid ${d.date === board.today ? C.teal : C.edge}` }}>
              <div style={{ width: "6.5em", flexShrink: 0, fontWeight: 650, color: d.date === board.today ? C.teal : C.text }}>
                {d.date === board.today ? "Today" : dayShort(d.date)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: ".4em", minWidth: 0 }}>
                {d.events.map((e) => (
                  <div key={e.id} style={{ display: "flex", gap: ".6em", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600 }}>{e.title}</span>
                    {e.category && <Pill color={pillColor(e.category)}>{e.category}</Pill>}
                    {fmtTime(e.time) && <span style={{ color: C.muted, fontSize: ".9em" }}>{fmtTime(e.time)}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <div style={{ fontSize: "1.35em", fontWeight: 650 }}>Our courses</div>
        <div style={{ color: C.muted, marginTop: ".2em", marginBottom: "1em" }}>Want to book another course? Ask the team — we'll find you a date.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: ".6em" }}>
          {board.courses.map((c) => (
            <div key={c.name} style={{ padding: ".85em 1.1em", borderRadius: 14, background: C.panel, border: `1px solid ${C.edge}` }}>
              <div style={{ fontWeight: 650 }}>{c.name}</div>
              <div style={{ color: C.muted, fontSize: ".9em", marginTop: ".2em" }}>
                {[c.duration, c.timings, c.clientType].filter(Boolean).join(" · ")}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Review ───────────────────────────────────────────────────────────────────
function Review({ url }: { url: string }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 480, color: { dark: "#081422", light: "#FFFFFF" } }).then(setQr).catch(() => setQr(null));
  }, [url]);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "3vh 1em", gap: "1.4em" }}>
      <div>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "2em", fontWeight: 700 }}>How was your course?</div>
        <div style={{ color: C.muted, fontSize: "1.15em", marginTop: ".4em", maxWidth: "30em" }}>
          Scan the code with your phone's camera to leave us a Google review — it takes a minute and helps other students find us.
        </div>
      </div>
      {qr && (
        <div style={{ background: "#fff", padding: "1em", borderRadius: 20 }}>
          <img src={qr} alt="QR code for the JLS Yacht Training Institute Google review page" style={{ width: "15em", height: "15em", display: "block" }} />
        </div>
      )}
      <div style={{ color: C.gold, fontSize: "1.6em", letterSpacing: ".15em" }}>★★★★★</div>
      <div style={{ color: C.dim, fontSize: ".85em" }}>Thank you from all of us at {TRAINING_BRAND}.</div>
    </div>
  );
}
