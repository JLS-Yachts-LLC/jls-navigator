import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { COLORS } from "@/lib/tokens";
import { WALL_PANELS, isInteractive, type WallPanelKey, type WallSettings } from "@/lib/wall-types";

// Operations → Wall Displays: pair a TV showing /wall with its code, choose what
// it shows, and unpair it. Pairing needs agency view (global admins always pass).
export const Route = createFileRoute("/_app/wall-displays")({
  validateSearch: (s: Record<string, unknown>) => ({ code: typeof s.code === "string" ? s.code : undefined }),
  component: WallDisplaysPage,
  head: () => ({ meta: [{ title: "Wall Displays — Polaris" }] }),
});

type Display = {
  id: string;
  name: string | null;
  settings: WallSettings;
  paired_at: string | null;
  paired_by_name: string | null;
  last_seen_at: string | null;
  user_agent: string | null;
};

const ALL: WallPanelKey[] = WALL_PANELS.map((p) => p.key);

const card: React.CSSProperties = { background: COLORS.abyss, border: `1px solid ${COLORS.deep}`, borderRadius: 12, padding: 20 };
const input: React.CSSProperties = {
  background: COLORS.void, border: `1px solid ${COLORS.deep}`, borderRadius: 8, color: COLORS.frost,
  padding: "9px 12px", fontSize: 15, width: "100%", boxSizing: "border-box",
};
const button = (primary = true): React.CSSProperties => ({
  background: primary ? COLORS.signal : "transparent", color: primary ? "#14110a" : COLORS.frost,
  border: primary ? "none" : `1px solid ${COLORS.deep}`, borderRadius: 8, padding: "9px 16px",
  fontSize: 14, fontWeight: 600, cursor: "pointer",
});

function online(lastSeen: string | null) {
  return !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 3 * 60_000;
}
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";

function deviceLabel(ua: string | null) {
  if (!ua) return null;
  if (/AFT|Fire ?TV/i.test(ua)) return "Fire TV";
  if (/Android TV|BRAVIA|GoogleTV/i.test(ua)) return "Android TV";
  if (/Tizen|SMART-TV|Web0S|webOS/i.test(ua)) return "Smart TV";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

function PanelPicker({ value, onChange }: { value: WallPanelKey[]; onChange: (v: WallPanelKey[]) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {WALL_PANELS.map((p) => {
        const on = value.includes(p.key);
        return (
          <button
            key={p.key} type="button"
            onClick={() => onChange(on ? value.filter((k) => k !== p.key) : [...value, p.key])}
            style={{
              borderRadius: 999, padding: "6px 12px", fontSize: 13, cursor: "pointer",
              border: `1px solid ${on ? COLORS.signal : COLORS.deep}`,
              background: on ? `${COLORS.signal}22` : "transparent", color: on ? COLORS.frost : COLORS.steel,
            }}
          >
            {on ? "✓ " : ""}{p.label}
          </button>
        );
      })}
    </div>
  );
}

/** Tap a boat for details, pan/zoom the map; off = the board runs hands-off. */
function InteractiveToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: COLORS.frost, cursor: "pointer", lineHeight: 1.45 }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 3, accentColor: COLORS.signal }} />
      <span>
        Interactive — tap a boat (or use the TV remote) for its details, pan and zoom the map
        <span style={{ display: "block", color: COLORS.steel, fontSize: 12 }}>
          Details are board-safe only: berth, ETA/ETD, AIS position, permit expiry dates and crew sign on/off counts. The board resets itself after 2 minutes untouched.
        </span>
      </span>
    </label>
  );
}

function WallDisplaysPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const search = Route.useSearch();
  const qc = useQueryClient();

  const api = async (method: string, body?: unknown) => {
    const res = await fetch("/api/wall/admin", {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
    return data;
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["wall-displays"],
    enabled: !!token,
    refetchInterval: 30_000,
    queryFn: () => api("GET") as Promise<{ displays: Display[] }>,
  });

  const [code, setCode] = useState(search.code ?? "");
  const [name, setName] = useState("");
  const [panels, setPanels] = useState<WallPanelKey[]>(ALL);
  const [interactive, setInteractive] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (search.code) setCode(search.code); }, [search.code]);

  const wallUrl = typeof window !== "undefined" ? `${window.location.origin}/wall` : "/wall";

  const pair = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("POST", { code, name, settings: { panels, ...(interactive ? {} : { interactive: false }) } });
      toast.success(`${name} is paired — the screen will switch over in a few seconds.`);
      setCode(""); setName(""); setPanels(ALL); setInteractive(true);
      qc.invalidateQueries({ queryKey: ["wall-displays"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const update = async (id: string, patch: { name?: string; settings?: WallSettings }) => {
    try {
      await api("PATCH", { id, ...patch });
      qc.invalidateQueries({ queryKey: ["wall-displays"] });
      toast.success("Saved — the screen picks it up within a minute.");
    } catch (err) { toast.error((err as Error).message); }
  };

  const unpair = async (d: Display) => {
    if (!confirm(`Unpair "${d.name}"? The screen goes back to showing a pairing code.`)) return;
    try {
      await api("DELETE", { id: d.id });
      qc.invalidateQueries({ queryKey: ["wall-displays"] });
      toast.success("Unpaired.");
    } catch (err) { toast.error((err as Error).message); }
  };

  const displays = data?.displays ?? [];

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, padding: "4px 0 24px" }}>
      <div>
        <h1 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, color: COLORS.frost }}>Wall Displays</h1>
        <p style={{ fontSize: 14, color: COLORS.muted, margin: "6px 0 0", lineHeight: 1.5, maxWidth: 760 }}>
          A Port Operations board for an office TV: vessels in country, arrivals, departures, live AIS positions,
          crew movements (counts only — no names), bunker deliveries and cruising permits running out.
          Nothing confidential is shown. On the TV, open{" "}
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText(wallUrl); toast.success("Link copied"); }}
            style={{ all: "unset", cursor: "pointer", color: COLORS.signal, fontWeight: 600 }}
            title="Copy link"
          >{wallUrl}</button>{" "}
          — it shows a code; enter it below. The TV remembers it's paired from then on.
        </p>
      </div>

      <form onSubmit={pair} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600, color: COLORS.frost }}>Pair a screen</div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,200px) minmax(0,1fr)", gap: 12 }}>
          <label style={{ fontSize: 12, color: COLORS.steel }}>
            Code on the screen
            <input
              value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={7}
              placeholder="ABC 123" autoFocus={!search.code}
              style={{ ...input, marginTop: 4, fontFamily: "'Space Grotesk', monospace", fontSize: 20, letterSpacing: "0.15em", textTransform: "uppercase" }}
            />
          </label>
          <label style={{ fontSize: 12, color: COLORS.steel }}>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Port Ops office TV" autoFocus={!!search.code} style={{ ...input, marginTop: 4 }} />
          </label>
        </div>
        <div>
          <div style={{ fontSize: 12, color: COLORS.steel, marginBottom: 6 }}>Show on this screen</div>
          <PanelPicker value={panels} onChange={setPanels} />
        </div>
        <InteractiveToggle value={interactive} onChange={setInteractive} />
        <div>
          <button type="submit" disabled={busy || !code.trim() || !name.trim()} style={{ ...button(), opacity: busy || !code.trim() || !name.trim() ? 0.5 : 1 }}>
            {busy ? "Pairing…" : "Pair screen"}
          </button>
        </div>
      </form>

      <div style={card}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600, color: COLORS.frost, marginBottom: 12 }}>
          Paired screens {displays.length ? <span style={{ color: COLORS.steel, fontWeight: 400 }}>({displays.length})</span> : null}
        </div>
        {error ? <div style={{ color: COLORS.error, fontSize: 14 }}>{(error as Error).message}</div>
          : isLoading ? <div style={{ color: COLORS.steel, fontSize: 13 }}>Loading…</div>
          : displays.length === 0 ? <div style={{ color: COLORS.steel, fontSize: 14 }}>No screens paired yet.</div>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {displays.map((d) => <DisplayRow key={d.id} d={d} onSave={update} onUnpair={unpair} />)}
            </div>
          )}
      </div>
    </div>
  );
}

function DisplayRow({ d, onSave, onUnpair }: { d: Display; onSave: (id: string, p: { name?: string; settings?: WallSettings }) => void; onUnpair: (d: Display) => void }) {
  const [name, setName] = useState(d.name ?? "");
  const [panels, setPanels] = useState<WallPanelKey[]>(d.settings.panels?.length ? d.settings.panels : ALL);
  const [interactive, setInteractive] = useState(isInteractive(d.settings));
  const isOn = online(d.last_seen_at);
  const device = deviceLabel(d.user_agent);
  const dirty = name.trim() !== (d.name ?? "") || panels.join() !== (d.settings.panels?.length ? d.settings.panels : ALL).join()
    || interactive !== isInteractive(d.settings);

  return (
    <div style={{ border: `1px solid ${COLORS.deep}`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span title={isOn ? "Online" : "Offline"} style={{ width: 10, height: 10, borderRadius: "50%", background: isOn ? COLORS.success : COLORS.steel, flex: "0 0 auto" }} />
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, width: 280, padding: "6px 10px" }} />
        <span style={{ fontSize: 13, color: COLORS.steel }}>
          {isOn ? "Online" : `Last seen ${when(d.last_seen_at)}`}{device ? ` · ${device}` : ""} · paired {when(d.paired_at)}{d.paired_by_name ? ` by ${d.paired_by_name}` : ""}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {dirty && <button type="button" style={button()} onClick={() => onSave(d.id, { name: name.trim(), settings: { ...d.settings, panels, interactive } })}>Save</button>}
          <button type="button" style={{ ...button(false), color: COLORS.error }} onClick={() => onUnpair(d)}>Unpair</button>
        </div>
      </div>
      <PanelPicker value={panels} onChange={setPanels} />
      <InteractiveToggle value={interactive} onChange={setInteractive} />
    </div>
  );
}
