/**
 * Vessel comms preferences — "Visa Reports & Document Delivery" panel.
 * Conditional fields per the Visa Reporting spec. Reads/saves via
 * /api/visa/vessel-prefs (GET/POST). allow_crew_whatsapp_delivery is locked with a
 * "Coming soon" badge and is always sent as false (spec rule #9).
 */
import { useEffect, useState } from "react";
import { COLORS, FONTS } from "@/lib/tokens";

interface Prefs {
  visa_report_email: string | null;
  send_visa_reports: boolean | null;
  vessel_whatsapp: string | null;
  send_visa_via_whatsapp: boolean | null;
  allow_crew_email_delivery: boolean | null;
  allow_crew_whatsapp_delivery: boolean | null;
}

export function VesselCommsPreferences({
  yachtId,
  vesselName,
  token,
  onSaved,
}: {
  yachtId: string;
  vesselName: string;
  token: string;
  onSaved?: () => void | Promise<void>;
}) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setError(null);
      const res = await fetch(`/api/visa/vessel-prefs?yacht_id=${yachtId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setPrefs(data.prefs);
      else setError(data.error ?? "Could not load preferences");
    })();
  }, [yachtId, token]);

  function set<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setPrefs((p) => (p ? { ...p, [key]: value } : p));
  }

  async function save() {
    if (!prefs) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/visa/vessel-prefs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ yacht_id: yachtId, ...prefs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      await onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const card: React.CSSProperties = {
    background: COLORS.abyss,
    border: `1px solid var(--border)`,
    borderRadius: 12,
    padding: 20,
    fontFamily: FONTS.display,
  };
  const label: React.CSSProperties = {
    fontSize: 14,
    color: COLORS.frost,
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
  };
  const input: React.CSSProperties = {
    background: COLORS.void,
    border: `1px solid var(--border)`,
    borderRadius: 8,
    padding: "9px 12px",
    color: COLORS.frost,
    fontFamily: FONTS.display,
    fontSize: 15,
    width: "100%",
    maxWidth: 360,
  };
  const help: React.CSSProperties = {
    fontSize: 14,
    color: COLORS.muted,
    margin: "2px 0 0 26px",
  };

  if (!prefs) {
    return (
      <div style={card}>
        {error ? (
          <span style={{ color: COLORS.warn, fontSize: 14 }}>{error}</span>
        ) : (
          <span style={{ color: COLORS.muted, fontSize: 14 }}>
            Loading preferences…
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={card}>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: COLORS.frost,
          margin: "0 0 4px",
        }}
      >
        Visa Reports &amp; Document Delivery
      </h2>
      <p style={{ fontSize: 14, color: COLORS.muted, margin: "0 0 18px" }}>
        {vesselName}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Email reports */}
        <div>
          <label style={label}>
            <input
              type="checkbox"
              checked={!!prefs.send_visa_reports}
              onChange={(e) => set("send_visa_reports", e.target.checked)}
            />
            Send weekly visa reports by email
          </label>
          {prefs.send_visa_reports && (
            <div style={{ marginTop: 10, marginLeft: 26 }}>
              <input
                type="email"
                placeholder="reports@vessel.com"
                value={prefs.visa_report_email ?? ""}
                onChange={(e) => set("visa_report_email", e.target.value)}
                style={input}
              />
            </div>
          )}
        </div>

        {/* Vessel WhatsApp */}
        <div>
          <div style={{ fontSize: 14, color: COLORS.frost, marginBottom: 6 }}>
            Vessel WhatsApp (optional)
          </div>
          <input
            type="tel"
            placeholder="+9715xxxxxxxx"
            value={prefs.vessel_whatsapp ?? ""}
            onChange={(e) => set("vessel_whatsapp", e.target.value)}
            style={input}
          />
          {prefs.vessel_whatsapp && (
            <label style={{ ...label, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={!!prefs.send_visa_via_whatsapp}
                onChange={(e) =>
                  set("send_visa_via_whatsapp", e.target.checked)
                }
              />
              Also send a visa report summary to this WhatsApp number
            </label>
          )}
        </div>

        {/* Crew email delivery */}
        <div>
          <label style={label}>
            <input
              type="checkbox"
              checked={!!prefs.allow_crew_email_delivery}
              onChange={(e) =>
                set("allow_crew_email_delivery", e.target.checked)
              }
            />
            Allow approved visas to be sent to the crew member&apos;s email
          </label>
          <div style={help}>
            The crew member&apos;s email on their Polaris profile will be used.
          </div>
        </div>

        {/* Crew WhatsApp — locked */}
        <div>
          <label style={{ ...label, cursor: "not-allowed", opacity: 0.6 }}>
            <input type="checkbox" disabled checked={false} readOnly />
            Allow approved visas to be sent to the crew member&apos;s WhatsApp
            <span
              style={{
                marginLeft: 8,
                fontSize: 12,
                fontWeight: 700,
                color: COLORS.leoAmber,
                border: `1px solid ${COLORS.leoAmber}55`,
                borderRadius: 999,
                padding: "1px 8px",
              }}
            >
              Coming soon
            </span>
          </label>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 14, fontSize: 14, color: COLORS.warn }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            background: COLORS.signal,
            border: `1px solid ${COLORS.signal}`,
            borderRadius: 8,
            padding: "9px 18px",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.6 : 1,
            fontFamily: FONTS.display,
            fontSize: 15,
            fontWeight: 600,
            color: COLORS.void,
          }}
        >
          {saving ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </div>
  );
}
