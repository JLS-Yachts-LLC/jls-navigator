/**
 * Port Operations wall — what a TV shows at /wall.
 *
 * First visit: the screen registers itself, keeps the secret key it is handed
 * (localStorage + a year-long cookie, so a browser that drops one still
 * remembers) and shows a pairing code + QR. Someone in Polaris enters the code
 * (Operations → Wall Displays) and the screen switches to the live board within
 * a few seconds. From then on it just opens straight to the board.
 */
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { PolarisLogo } from "@/components/brand/PolarisLogo";
import type {
  WallArrival, WallBoard, WallDisplayResponse, WallPanelKey, WallPosition, WallSettings,
} from "@/lib/wall-types";

const WallMap = lazy(() => import("./wall-map"));

declare const __BUILD_ID__: string;

const KEY_STORE = "polaris.wall.key";
const BOARD_STORE = "polaris.wall.lastBoard";
const COOKIE = "polaris_wall";

const C = {
  bg: "#081422",
  panel: "#0E1E33",
  panelEdge: "#18304D",
  text: "#EAF2F8",
  muted: "#8FA6BF",
  dim: "#5B6B82",
  teal: "#96CBC7",
  blue: "#4590BA",
  gold: "#F5B83D",
  green: "#3DBE84",
  orange: "#F08A3C",
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
  document.cookie = `${COOKIE}=${k}; Max-Age=${60 * 60 * 24 * 400}; Path=/wall; SameSite=Lax; Secure`;
}
function clearKey() {
  try { localStorage.removeItem(KEY_STORE); localStorage.removeItem(BOARD_STORE); } catch { /* ignore */ }
  document.cookie = `${COOKIE}=; Max-Age=0; Path=/wall; SameSite=Lax; Secure`;
}

// ── Formatting (always UAE time — the screen's own clock zone may be anything) ──
const TZ = "Asia/Dubai";
const fmtDay = (ymdOrIso: string | null) => {
  if (!ymdOrIso) return "—";
  const d = ymdOrIso.length === 10 ? new Date(`${ymdOrIso}T12:00:00+04:00`) : new Date(ymdOrIso);
  return isNaN(d.getTime()) ? ymdOrIso : d.toLocaleDateString("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
};
const fmtDayTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
function ago(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
function relDay(ymd: string, today: string): string {
  const n = Math.round((new Date(`${ymd.slice(0, 10)}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
const compass = (deg: number | null) => (deg == null ? "" : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8]);

// ── Root ─────────────────────────────────────────────────────────────────────
export function WallScreen() {
  const [state, setState] = useState<WallDisplayResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);

  const register = useCallback(async () => {
    try {
      const res = await fetch("/api/wall/display", { method: "POST" });
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
      const res = await fetch("/api/wall/display", { headers: { "X-Wall-Key": key }, cache: "no-store" });
      const body = (await res.json()) as WallDisplayResponse;
      setOffline(false);
      if (body.state === "unknown") { clearKey(); keyRef.current = null; return register(); }
      setState(body);
      if (body.state === "paired") { try { localStorage.setItem(BOARD_STORE, JSON.stringify(body)); } catch { /* full */ } }
    } catch {
      // Network blip: keep showing the last board, flag it in the footer.
      setOffline(true);
    }
  }, [register]);

  // Start: remembered key → straight to the board (last copy shown instantly).
  useEffect(() => {
    keyRef.current = readKey();
    if (keyRef.current) {
      try { const last = localStorage.getItem(BOARD_STORE); if (last) setState(JSON.parse(last)); } catch { /* ignore */ }
    }
    poll();
  }, [poll]);

  // Waiting screens check every 4s so pairing feels instant; the board every minute.
  const pending = state?.state === "pending" || !state;
  useEffect(() => {
    const t = setInterval(poll, pending ? 4_000 : 60_000);
    return () => clearInterval(t);
  }, [poll, pending]);

  // A screen left on for weeks still picks up new builds.
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

  useKioskBehaviour();

  return (
    <div style={{
      position: "fixed", inset: 0, background: C.bg, color: C.text, overflow: "hidden",
      fontFamily: "Inter, system-ui, sans-serif", fontSize: "clamp(12px, 0.88vw, 26px)",
    }}>
      <style>{`
        @keyframes wall-scroll { from { transform: translateY(0) } to { transform: translateY(-50%) } }
        @keyframes wall-pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
        .wall-map-label { background: rgba(8,20,34,.85) !important; color: #EAF2F8 !important; border: 1px solid #F5B83D55 !important; box-shadow: none !important; font: 600 11px Inter, sans-serif; padding: 1px 6px !important; }
        .wall-map-label::before { display: none }
      `}</style>
      {state?.state === "paired"
        ? <Board name={state.name} settings={state.settings} board={state.board} offline={offline} />
        : <Pairing code={state?.state === "pending" ? state.code : null} expiresAt={state?.state === "pending" ? state.expiresAt : null} error={registerError} />}
    </div>
  );
}

/** Keep the TV awake, hide the cursor when idle, tap/click for full screen. */
function useKioskBehaviour() {
  useEffect(() => {
    let lock: any = null;
    const grab = async () => { try { lock = await (navigator as any).wakeLock?.request("screen"); } catch { /* unsupported */ } };
    grab();
    const onVis = () => { if (document.visibilityState === "visible") grab(); };
    document.addEventListener("visibilitychange", onVis);

    let idle: ReturnType<typeof setTimeout>;
    const show = () => { document.body.style.cursor = ""; clearTimeout(idle); idle = setTimeout(() => { document.body.style.cursor = "none"; }, 3000); };
    window.addEventListener("mousemove", show);
    show();

    const full = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); };
    window.addEventListener("click", full);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("mousemove", show);
      window.removeEventListener("click", full);
      clearTimeout(idle);
      document.body.style.cursor = "";
      lock?.release?.().catch?.(() => {});
    };
  }, []);
}

// ── Pairing screen ───────────────────────────────────────────────────────────
function Pairing({ code, expiresAt, error }: { code: string | null; expiresAt: string | null; error: string | null }) {
  const [qr, setQr] = useState<string | null>(null);
  const link = code ? `${location.origin}/wall-displays?code=${code}` : null;
  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: "#081422", light: "#FFFFFF" } }).then(setQr).catch(() => setQr(null));
  }, [link]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2.5em", padding: "4vh 4vw", textAlign: "center" }}>
      <PolarisLogo size="xl" theme="dark" />
      <div>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "2.4em", fontWeight: 700 }}>Port Operations wall</div>
        <div style={{ color: C.muted, fontSize: "1.3em", marginTop: ".4em" }}>This screen isn't paired yet.</div>
      </div>
      {error ? (
        <div style={{ color: C.red, fontSize: "1.3em" }}>{error} — retrying…</div>
      ) : (
        <div style={{ display: "flex", gap: "4em", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <div>
            <div style={{ color: C.muted, fontSize: "1.1em", textTransform: "uppercase", letterSpacing: ".18em" }}>Pairing code</div>
            <div style={{ fontFamily: "'Space Grotesk', monospace", fontSize: "6em", fontWeight: 700, letterSpacing: ".18em", color: C.teal, marginTop: ".1em" }}>
              {code ? `${code.slice(0, 3)} ${code.slice(3)}` : "· · ·"}
            </div>
            {expiresAt && <div style={{ color: C.dim, fontSize: "1em" }}>A new code appears every 30 minutes</div>}
          </div>
          {qr && (
            <div style={{ background: "#fff", padding: "1em", borderRadius: 16 }}>
              <img src={qr} alt="" style={{ width: "13em", height: "13em", display: "block" }} />
            </div>
          )}
        </div>
      )}
      <div style={{ color: C.muted, fontSize: "1.25em", maxWidth: "40em", lineHeight: 1.6 }}>
        In Polaris, open <b style={{ color: C.text }}>Operations → Wall Displays</b> and enter this code — or scan the QR code with your phone.
        The screen remembers itself once paired.
      </div>
    </div>
  );
}

// ── The board ────────────────────────────────────────────────────────────────
function Board({ name, settings, board, offline }: { name: string; settings: WallSettings; board: WallBoard; offline: boolean }) {
  const on = (k: WallPanelKey) => !settings.panels?.length || settings.panels.includes(k);

  const middle = [on("map") && "map", on("arriving") && "arriving"].filter(Boolean) as string[];
  const right = (["departures", "movements", "bunkering", "permits"] as WallPanelKey[]).filter(on);
  const cols = [on("in_country") ? "1.25fr" : null, middle.length ? "1.15fr" : null, right.length ? "1fr" : null].filter(Boolean).join(" ") || "1fr";

  return (
    <div style={{ height: "100%", display: "grid", gridTemplateRows: "auto 1fr auto", gap: "1em", padding: "1.2em 1.4em .8em" }}>
      <Header title={settings.title || "Port Operations"} board={board} showWeather={on("weather")} />

      <div style={{ display: "grid", gridTemplateColumns: cols, gap: "1em", minHeight: 0 }}>
        {on("in_country") && <InCountryPanel board={board} />}
        {middle.length > 0 && (
          <div style={{ display: "grid", gridTemplateRows: middle.length === 2 ? "1.1fr 1fr" : "1fr", gap: "1em", minHeight: 0 }}>
            {on("map") && (
              <Panel title="Live positions" right={<Legend />} flush>
                <Suspense fallback={null}><WallMap points={board.map} /></Suspense>
              </Panel>
            )}
            {on("arriving") && <ArrivingPanel board={board} />}
          </div>
        )}
        {right.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1em", minHeight: 0 }}>
            {on("departures") && <DeparturesPanel board={board} />}
            {on("movements") && <MovementsPanel board={board} />}
            {on("bunkering") && board.bunkering.length > 0 && <BunkerPanel board={board} />}
            {on("permits") && board.permits.length > 0 && <PermitsPanel board={board} />}
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", color: C.dim, fontSize: ".85em" }}>
        <span>{name} · Polaris · JLS Yachts</span>
        <span>
          {offline && <span style={{ color: C.orange, marginRight: "1.2em", animation: "wall-pulse 2s infinite" }}>● Connection lost — showing last update</span>}
          Updated {fmtDayTime(board.generatedAt)} · positions by AIS
        </span>
      </div>
    </div>
  );
}

function Header({ title, board, showWeather }: { title: string; board: WallBoard; showWeather: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const w = board.weather;
  const k = board.kpis;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1.6em" }}>
      <PolarisLogo variant="mark-only" size="sm" theme="dark" className="wall-mark" />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.9em", fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
        <div style={{ color: C.muted, fontSize: "1em" }}>{now.toLocaleDateString("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      </div>
      <div style={{ flex: 1, display: "flex", gap: ".8em", justifyContent: "center" }}>
        <Kpi label="In country" value={k.inCountry} color={C.teal} />
        <Kpi label="Arriving" value={k.arriving} color={C.blue} />
        <Kpi label="Under way" value={k.underway} color={C.gold} />
        <Kpi label="Departing ≤7 days" value={k.departing} color={C.orange} />
        <Kpi label="Crew moves today" value={k.movementsToday} color={C.green} />
      </div>
      {showWeather && w && (
        <div style={{ textAlign: "right", color: C.muted, fontSize: "1em", lineHeight: 1.45 }}>
          <div><b style={{ color: C.text, fontSize: "1.25em" }}>{w.temperature != null ? `${Math.round(w.temperature)}°C` : "—"}</b> Dubai</div>
          <div>
            Wind {w.windSpeed != null ? `${Math.round(w.windSpeed)} kn ${compass(w.windDirection)}` : "—"}
            {w.windGust != null && <span style={{ color: w.windGust >= 25 ? C.orange : C.muted }}> · gusts {Math.round(w.windGust)}</span>}
            {w.waveHeight != null && <span style={{ color: w.waveHeight >= 1.5 ? C.orange : C.muted }}> · waves {w.waveHeight.toFixed(1)} m</span>}
          </div>
        </div>
      )}
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "2.6em", fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: "3.2em", textAlign: "right" }}>
        {now.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.panelEdge}`, borderTop: `3px solid ${color}`, borderRadius: 10, padding: ".45em 1.1em", minWidth: "7.5em" }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "2em", fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ color: C.muted, fontSize: ".85em", whiteSpace: "nowrap" }}>{label}</div>
    </div>
  );
}

function Panel({ title, count, right, flush, grow = true, children }: { title: string; count?: number; right?: React.ReactNode; flush?: boolean; grow?: boolean; children: React.ReactNode }) {
  return (
    <section style={{
      background: C.panel, border: `1px solid ${C.panelEdge}`, borderRadius: 12, display: "flex", flexDirection: "column",
      minHeight: 0, flex: grow ? "1 1 0" : "0 0 auto", overflow: "hidden",
    }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: ".6em", padding: ".7em 1em .55em", borderBottom: `1px solid ${C.panelEdge}` }}>
        <h2 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.15em", fontWeight: 600 }}>{title}</h2>
        {count != null && <span style={{ color: C.muted, fontSize: ".95em" }}>{count}</span>}
        <div style={{ marginLeft: "auto" }}>{right}</div>
      </header>
      <div style={{ flex: 1, minHeight: 0, position: "relative", padding: flush ? 0 : ".2em 0" }}>{children}</div>
    </section>
  );
}

/** Rolls a list that's taller than its panel, endlessly; leaves short lists still. */
function AutoScroll({ children, secondsPerItem = 2.4, items }: { children: React.ReactNode; secondsPerItem?: number; items: number }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    const check = () => {
      if (!box.current || !inner.current) return;
      const contentH = overflow ? inner.current.scrollHeight / 2 : inner.current.scrollHeight;
      setOverflow(contentH > box.current.clientHeight + 4);
    };
    check();
    const ro = new ResizeObserver(check);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [items, overflow]);
  return (
    <div ref={box} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div ref={inner} style={overflow ? { animation: `wall-scroll ${Math.max(20, items * secondsPerItem)}s linear infinite` } : undefined}>
        {children}
        {overflow && <div aria-hidden>{children}</div>}
      </div>
    </div>
  );
}

const row: React.CSSProperties = { display: "grid", alignItems: "center", gap: ".8em", padding: ".5em 1em", borderBottom: `1px solid ${C.panelEdge}88` };
const Empty = ({ text }: { text: string }) => <div style={{ padding: "1.4em 1em", color: C.dim, fontSize: "1em" }}>{text}</div>;

function PositionTag({ p }: { p: WallPosition | null }) {
  if (!p) return <span style={{ color: C.dim }}>No AIS</span>;
  const label = p.state === "underway" ? `Under way${p.speed != null ? ` ${p.speed.toFixed(1)} kn` : ""}` : p.state === "anchored" ? "At anchor" : p.state === "moored" ? "Moored" : "Position";
  const color = p.stale ? C.dim : p.state === "underway" ? C.gold : p.state === "anchored" ? C.blue : C.teal;
  return (
    <span style={{ color, whiteSpace: "nowrap" }}>
      ● {label}<span style={{ color: C.dim }}> · {ago(p.at)}</span>
    </span>
  );
}

function InCountryPanel({ board }: { board: WallBoard }) {
  const list = board.inCountry;
  const cols = "minmax(0,1.3fr) minmax(0,1.4fr) minmax(0,1.1fr) 5.5em";
  return (
    <Panel title="Vessels in country" count={list.length}>
      <div style={{ ...row, gridTemplateColumns: cols, color: C.dim, fontSize: ".8em", textTransform: "uppercase", letterSpacing: ".08em", padding: ".45em 1em" }}>
        <span>Vessel</span><span>Berth · location</span><span>Last position</span><span style={{ textAlign: "right" }}>ETD</span>
      </div>
      <div style={{ position: "absolute", inset: "2.2em 0 0 0" }}>
        {list.length === 0 ? <Empty text="No vessels marked In Country." /> : (
          <AutoScroll items={list.length}>
            {list.map((v) => (
              <div key={v.id} style={{ ...row, gridTemplateColumns: cols }}>
                <span style={{ fontWeight: 600, fontSize: "1.08em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</span>
                <span style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[v.berth, v.location].filter(Boolean).join(" · ") || "—"}
                </span>
                <span style={{ fontSize: ".92em", overflow: "hidden", textOverflow: "ellipsis" }}><PositionTag p={v.position} /></span>
                <span style={{ textAlign: "right", color: v.etd && v.etd >= board.today ? C.orange : C.dim, fontSize: ".92em" }}>
                  {v.etd && v.etd >= board.today ? fmtDay(v.etd).replace(/^\w+ /, "") : "—"}
                </span>
              </div>
            ))}
          </AutoScroll>
        )}
      </div>
    </Panel>
  );
}

function etaText(a: WallArrival, today: string) {
  if (!a.eta) return { text: "ETA not set", color: C.dim };
  const ymd = a.eta.slice(0, 10);
  if (ymd < today) return { text: `ETA passed (${fmtDay(a.eta)})`, color: C.dim };
  return { text: `${a.etaSource === "ais" ? fmtDayTime(a.eta) : fmtDay(a.eta)} · ${relDay(ymd, today)}`, color: ymd <= today ? C.gold : C.text };
}

function ArrivingPanel({ board }: { board: WallBoard }) {
  const list = board.arriving;
  return (
    <Panel title="Arriving" count={list.length}>
      {list.length === 0 ? <Empty text="No arrivals expected." /> : (
        <AutoScroll items={list.length} secondsPerItem={3.5}>
          {list.map((a) => {
            const eta = etaText(a, board.today);
            return (
              <div key={a.id} style={{ ...row, gridTemplateColumns: "minmax(0,1fr) auto" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "1.08em" }}>{a.name}</div>
                  <div style={{ color: C.muted, fontSize: ".9em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.destination ? `AIS destination ${a.destination}` : a.status ?? ""}
                    {a.position && <> · <PositionTag p={a.position} /></>}
                  </div>
                </div>
                <div style={{ textAlign: "right", color: eta.color, fontSize: ".95em" }}>
                  {eta.text}
                  {a.etaSource === "ais" && <div style={{ color: C.dim, fontSize: ".8em" }}>ETA from AIS</div>}
                </div>
              </div>
            );
          })}
        </AutoScroll>
      )}
    </Panel>
  );
}

function DeparturesPanel({ board }: { board: WallBoard }) {
  const list = board.departures;
  return (
    <Panel title="Departures" count={list.length}>
      {list.length === 0 ? <Empty text="No departures planned in the next 14 days." /> : (
        <AutoScroll items={list.length} secondsPerItem={3}>
          {list.map((d) => (
            <div key={`${d.kind}-${d.id}`} style={{ ...row, gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{d.name}</div>
                <div style={{ color: C.muted, fontSize: ".88em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.kind === "upcoming" ? [d.berth, d.location].filter(Boolean).join(" · ") || "—" : d.destination ? `Heading for ${d.destination}` : "Left UAE waters"}
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: ".92em" }}>
                {d.kind === "upcoming"
                  ? <span style={{ color: C.orange }}>{d.date ? `${fmtDay(d.date)} · ${relDay(d.date, board.today)}` : "—"}</span>
                  : <span style={{ color: C.dim }}>Departed {d.date && d.date.length > 10 ? fmtDayTime(d.date) : fmtDay(d.date)}</span>}
              </div>
            </div>
          ))}
        </AutoScroll>
      )}
    </Panel>
  );
}

function MovementsPanel({ board }: { board: WallBoard }) {
  const list = board.movements;
  return (
    <Panel title="Crew sign on / off" right={<span style={{ color: C.dim, fontSize: ".85em" }}>today + 2 days</span>}>
      {list.length === 0 ? <Empty text="No crew movements booked." /> : (
        <AutoScroll items={list.length} secondsPerItem={3}>
          {list.map((m) => (
            <div key={`${m.date}-${m.vessel}`} style={{ ...row, gridTemplateColumns: "5.6em minmax(0,1fr) auto" }}>
              <span style={{ color: m.date === board.today ? C.green : C.muted, fontSize: ".9em" }}>{relDay(m.date, board.today)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{m.vessel}</div>
                <div style={{ color: C.muted, fontSize: ".85em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[m.ports.join(", "), m.flights.length ? `Flights ${m.flights.join(", ")}` : null, m.pickups ? `${m.pickups} pickup${m.pickups > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap", fontSize: ".95em" }}>
                {m.signOn > 0 && <span style={{ color: C.green }}>▲ {m.signOn} on</span>}
                {m.signOn > 0 && m.signOff > 0 && "  "}
                {m.signOff > 0 && <span style={{ color: C.orange, marginLeft: ".5em" }}>▼ {m.signOff} off</span>}
              </div>
            </div>
          ))}
        </AutoScroll>
      )}
    </Panel>
  );
}

function BunkerPanel({ board }: { board: WallBoard }) {
  return (
    <Panel title="Bunker deliveries" count={board.bunkering.length} grow={false}>
      {board.bunkering.slice(0, 4).map((b, i) => (
        <div key={i} style={{ ...row, gridTemplateColumns: "minmax(0,1fr) auto" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{b.vessel}</div>
            <div style={{ color: C.muted, fontSize: ".85em" }}>{[b.fuel, b.quantity, b.port, b.berth].filter(Boolean).join(" · ")}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: ".9em" }}>
            {relDay(b.date, board.today)}{b.time ? ` ${b.time}` : ""}
            <div style={{ color: C.dim, fontSize: ".85em", textTransform: "capitalize" }}>{b.status.replace(/_/g, " ")}</div>
          </div>
        </div>
      ))}
    </Panel>
  );
}

function PermitsPanel({ board }: { board: WallBoard }) {
  return (
    <Panel title="Cruising permits expiring" count={board.permits.length} grow={false}>
      {board.permits.slice(0, 4).map((p) => (
        <div key={p.vessel} style={{ ...row, gridTemplateColumns: "minmax(0,1fr) auto" }}>
          <span style={{ fontWeight: 600 }}>{p.vessel}</span>
          <span style={{ color: p.days < 0 ? C.red : p.days <= 3 ? C.orange : C.gold, fontSize: ".92em" }}>
            {p.days < 0 ? `Expired ${fmtDay(p.expires)}` : `${fmtDay(p.expires)} · ${relDay(p.expires, board.today)}`}
          </span>
        </div>
      ))}
    </Panel>
  );
}

function Legend() {
  const dot = (c: string, l: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: ".35em", marginLeft: ".9em" }}>
      <span style={{ width: ".7em", height: ".7em", borderRadius: "50%", background: c, display: "inline-block" }} />{l}
    </span>
  );
  return <span style={{ color: C.muted, fontSize: ".8em" }}>{dot(C.teal, "In country")}{dot(C.blue, "Inbound")}{dot(C.gold, "Under way")}</span>;
}
