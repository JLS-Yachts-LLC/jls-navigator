/**
 * Vessel Visa Reports — on-demand generate, send, history & historical snapshots.
 * Spec: POLARIS Visa Reporting (ticket #194). Adapted to this codebase:
 *   • vessels -> yachts          • reads via the browser Supabase client (RLS:
 *   authenticated SELECT on visa_report_log)   • generate/send/prefs via the
 *   /api/visa/* server routes (service-role + requireAccess gating).
 *
 * Generate and Send are separate actions (spec rule #3). Active table collapses by
 * default; Expired and Expiring stay open. Historical views read the immutable
 * snapshot, never live data (spec rule #4).
 *
 * Font sizes follow the platform readability standard (CLAUDE.md §16): body/labels
 * ≥14px, metrics 28px, headings ≥22px.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS, FONTS } from "@/lib/tokens";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  STATUS_COLOURS,
  STATUS_LABEL,
  formatDateDMY,
  type SnapshotRow,
  type VisaStatus,
} from "@/lib/visa-reporting/statusHelpers";
import { VesselCommsPreferences } from "@/components/visa/VesselCommsPreferences";

interface Yacht {
  id: string;
  vessel_name: string | null;
  visa_report_email: string | null;
  send_visa_reports: boolean | null;
}
interface ReportRow {
  id: string;
  yacht_id: string;
  report_date: string;
  generated_at: string;
  sent_at: string | null;
  status: string;
  crew_count: number | null;
  active_count: number | null;
  expiring_count: number | null;
  expired_count: number | null;
  no_visa_count: number | null;
  sign_on_count: number | null;
  sign_off_count: number | null;
  manifest_source: string;
  snapshot_data: SnapshotRow[] | null;
}

const LAST_VESSEL_KEY = "polaris.visaReports.lastVessel";

export function VesselReportScreen() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";

  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [history, setHistory] = useState<ReportRow[]>([]);
  const [historyViewId, setHistoryViewId] = useState<string | null>(null); // null = latest/live
  const [activeExpanded, setActiveExpanded] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [confirmSend, setConfirmSend] = useState<ReportRow | null>(null);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const selectedYacht = yachts.find((y) => y.id === selectedId) ?? null;

  // ── Initial: load yachts, restore last vessel ──────────────────────────────
  useEffect(() => {
    void (async () => {
      // `as any`: generated Database types don't yet include the new comms columns.
      const { data } = await (supabase as any)
        .from("yachts")
        .select("id, vessel_name, visa_report_email, send_visa_reports")
        .order("vessel_name", { ascending: true });
      const list = (data ?? []) as Yacht[];
      setYachts(list);
      const stored =
        typeof window !== "undefined"
          ? sessionStorage.getItem(LAST_VESSEL_KEY)
          : null;
      const initial =
        (stored && list.some((y) => y.id === stored) ? stored : list[0]?.id) ??
        "";
      setSelectedId(initial);
      setLoading(false);
    })();
  }, []);

  const loadHistory = useCallback(async (yachtId: string) => {
    // `as any`: visa_report_log isn't in the generated Database types yet.
    const { data } = await (supabase as any)
      .from("visa_report_log")
      .select("*")
      .eq("yacht_id", yachtId)
      .order("generated_at", { ascending: false })
      .limit(50);
    setHistory((data ?? []) as ReportRow[]);
  }, []);

  // ── On vessel switch: reload, reset view state ─────────────────────────────
  useEffect(() => {
    if (!selectedId) return;
    sessionStorage.setItem(LAST_VESSEL_KEY, selectedId);
    setHistoryViewId(null);
    setActiveExpanded(false);
    setShowPrefs(false);
    void loadHistory(selectedId);
  }, [selectedId, loadHistory]);

  const currentReport: ReportRow | null = useMemo(() => {
    if (historyViewId)
      return history.find((h) => h.id === historyViewId) ?? null;
    return history[0] ?? null;
  }, [history, historyViewId]);

  const snapshot: SnapshotRow[] = (currentReport?.snapshot_data ??
    []) as SnapshotRow[];
  const byStatus = (s: VisaStatus) => snapshot.filter((r) => r.status === s);

  async function handleGenerate() {
    if (!selectedId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/visa/report-generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ yacht_id: selectedId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generate failed");
      await loadHistory(selectedId);
      setHistoryViewId(null);
      setToast("Report generated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSend(report: ReportRow) {
    setSending(true);
    setError(null);
    setConfirmSend(null);
    try {
      const res = await fetch("/api/visa/report-send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ report_id: report.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      await loadHistory(selectedId);
      setToast("Report sent.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const canSend =
    !!selectedYacht?.send_visa_reports && !!selectedYacht?.visa_report_email;
  const isHistorical = !!historyViewId && historyViewId !== history[0]?.id;

  // ── styles ──────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: COLORS.abyss,
    border: `1px solid var(--border)`,
    borderRadius: 12,
  };
  const btn = (
    variant: "primary" | "ghost" | "disabled",
  ): React.CSSProperties => ({
    background: variant === "primary" ? COLORS.signal : COLORS.void,
    border: `1px solid ${variant === "primary" ? COLORS.signal : "var(--border)"}`,
    borderRadius: 8,
    padding: "9px 16px",
    cursor: variant === "disabled" ? "not-allowed" : "pointer",
    opacity: variant === "disabled" ? 0.5 : 1,
    fontFamily: FONTS.display,
    fontSize: 15,
    fontWeight: 600,
    color: variant === "primary" ? COLORS.void : COLORS.frost,
  });
  const th: React.CSSProperties = {
    textAlign: "left",
    fontFamily: FONTS.display,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: COLORS.steel,
    padding: "10px 14px",
    borderBottom: `1px solid var(--border)`,
  };
  const td: React.CSSProperties = {
    fontFamily: FONTS.display,
    fontSize: 14,
    color: COLORS.frost,
    padding: "11px 14px",
    borderBottom: `1px solid var(--border)`,
  };

  function StatusPill({ status }: { status: VisaStatus }) {
    const c = STATUS_COLOURS[status];
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: c.bg,
          color: c.text,
          borderRadius: 999,
          padding: "3px 10px",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: c.dot,
          }}
        />
        {STATUS_LABEL[status]}
      </span>
    );
  }

  function CrewTable({
    rows,
    lastCol,
    lastVal,
  }: {
    rows: SnapshotRow[];
    lastCol: string;
    lastVal: (r: SnapshotRow) => string;
  }) {
    return (
      <div style={{ ...card, overflowX: "auto", marginTop: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Crew member</th>
              <th style={th}>Nationality</th>
              <th style={th}>Visa type</th>
              <th style={th}>Status</th>
              <th style={th}>{lastCol}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.crew_member_id}>
                <td style={td}>{r.name ?? "—"}</td>
                <td style={td}>{r.nationality ?? "—"}</td>
                <td style={td}>{r.visa_type ?? "—"}</td>
                <td style={td}>
                  <StatusPill status={r.status} />
                </td>
                <td style={td}>{lastVal(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const expired = byStatus("expired");
  const expiring = byStatus("expiring_soon");
  const active = byStatus("active");
  const noVisa = byStatus("no_visa");

  const metrics: { label: string; value: number; colour: string }[] =
    currentReport
      ? [
          {
            label: "Total crew",
            value: currentReport.crew_count ?? 0,
            colour: COLORS.frost,
          },
          {
            label: "Active",
            value: currentReport.active_count ?? 0,
            colour: "#4CAF80",
          },
          {
            label: "Expiring",
            value: currentReport.expiring_count ?? 0,
            colour: COLORS.leoAmber,
          },
          {
            label: "Expired",
            value: currentReport.expired_count ?? 0,
            colour: COLORS.warn,
          },
        ]
      : [];

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "24px 20px",
        fontFamily: FONTS.display,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: COLORS.frost,
            margin: 0,
          }}
        >
          Vessel Visa Reports
        </h1>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{
              background: COLORS.void,
              border: `1px solid var(--border)`,
              borderRadius: 8,
              padding: "9px 12px",
              color: COLORS.frost,
              fontFamily: FONTS.display,
              fontSize: 15,
              minWidth: 220,
            }}
          >
            {yachts.map((y) => (
              <option key={y.id} value={y.id}>
                {y.vessel_name ?? "Unnamed vessel"}
              </option>
            ))}
          </select>
          <button
            onClick={handleGenerate}
            style={btn(generating || !selectedId ? "disabled" : "primary")}
            disabled={generating || !selectedId}
          >
            {generating ? "Generating…" : "Generate report"}
          </button>
          <button onClick={() => setShowPrefs((s) => !s)} style={btn("ghost")}>
            {showPrefs ? "Hide settings" : "Report settings"}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 14,
            padding: "11px 14px",
            borderRadius: 8,
            background: `${COLORS.warn}14`,
            border: `1px solid ${COLORS.warn}40`,
            fontSize: 14,
            color: COLORS.warn,
          }}
        >
          {error}
        </div>
      )}
      {toast && (
        <div
          style={{
            marginBottom: 14,
            padding: "11px 14px",
            borderRadius: 8,
            background: `${COLORS.signal}14`,
            border: `1px solid ${COLORS.signal}40`,
            fontSize: 14,
            color: COLORS.signal,
          }}
        >
          {toast}
        </div>
      )}

      {showPrefs && selectedYacht && (
        <div style={{ marginBottom: 18 }}>
          <VesselCommsPreferences
            yachtId={selectedYacht.id}
            vesselName={selectedYacht.vessel_name ?? "Vessel"}
            token={token}
            onSaved={async () => {
              // refresh the yacht's send-eligibility in the selector cache
              const { data } = await (supabase as any)
                .from("yachts")
                .select("id, vessel_name, visa_report_email, send_visa_reports")
                .order("vessel_name", { ascending: true });
              setYachts((data ?? []) as Yacht[]);
              setToast("Preferences saved.");
            }}
          />
        </div>
      )}

      {loading ? (
        <div
          style={{
            textAlign: "center",
            padding: 48,
            color: COLORS.muted,
            fontSize: 15,
          }}
        >
          Loading…
        </div>
      ) : !currentReport ? (
        <div
          style={{
            ...card,
            textAlign: "center",
            padding: 48,
            color: COLORS.muted,
            fontSize: 15,
          }}
        >
          No reports yet for this vessel. Click{" "}
          <strong style={{ color: COLORS.frost }}>Generate report</strong> to
          create the first one.
        </div>
      ) : (
        <>
          {isHistorical && (
            <div
              style={{
                marginBottom: 14,
                padding: "12px 16px",
                borderRadius: 10,
                background: `${COLORS.leoAmber}14`,
                border: `1px solid ${COLORS.leoAmber}40`,
                color: COLORS.leoAmber,
                fontSize: 14,
              }}
            >
              ⚠ Snapshot — {formatDateDMY(currentReport.report_date)} — this is
              a historical record and does not reflect current visa status.{" "}
              <span style={{ color: COLORS.muted }}>
                Manifest source:{" "}
                {currentReport.manifest_source === "soso_roster"
                  ? "Live SOSO signed-on roster"
                  : "Polaris crew assignments"}
                .
              </span>{" "}
              <button
                onClick={() => setHistoryViewId(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: COLORS.signal,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Back to latest
              </button>
            </div>
          )}

          {/* Metrics */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
              marginBottom: 10,
            }}
          >
            {metrics.map((m) => (
              <div key={m.label} style={{ ...card, padding: "16px 18px" }}>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: m.colour,
                    lineHeight: 1,
                  }}
                >
                  {m.value}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: COLORS.steel,
                    marginTop: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {m.label}
                </div>
              </div>
            ))}
          </div>

          {/* Crew movements */}
          <div
            style={{
              ...card,
              padding: "14px 18px",
              marginBottom: 18,
              display: "flex",
              gap: 28,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: COLORS.steel,
              }}
            >
              Crew movements (7d)
            </div>
            <div style={{ fontSize: 16, color: COLORS.frost }}>
              Sign-ons: <strong>{currentReport.sign_on_count ?? "—"}</strong>
            </div>
            <div style={{ fontSize: 16, color: COLORS.frost }}>
              Sign-offs: <strong>{currentReport.sign_off_count ?? "—"}</strong>
            </div>
          </div>

          {/* Send */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: 18,
              alignItems: "center",
              gap: 12,
            }}
          >
            {currentReport.sent_at && (
              <span style={{ fontSize: 14, color: COLORS.muted }}>
                Last sent {formatDateDMY(currentReport.sent_at)}
              </span>
            )}
            <button
              onClick={() => canSend && setConfirmSend(currentReport)}
              disabled={!canSend || sending}
              title={
                canSend
                  ? "Send this report to the vessel"
                  : "Enable report emails for this vessel in Report settings first"
              }
              style={btn(!canSend || sending ? "disabled" : "primary")}
            >
              {sending ? "Sending…" : "Send report"}
            </button>
          </div>

          {/* Expired (always open) */}
          {expired.length > 0 && (
            <section style={{ marginBottom: 18 }}>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: COLORS.warn,
                  margin: "0 0 2px",
                }}
              >
                Expired — immediate attention ({expired.length})
              </h2>
              <CrewTable
                rows={expired}
                lastCol="Days overdue"
                lastVal={(r) => String(r.days_overdue ?? "—")}
              />
            </section>
          )}

          {/* Expiring (always open) */}
          {expiring.length > 0 && (
            <section style={{ marginBottom: 18 }}>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: COLORS.leoAmber,
                  margin: "0 0 2px",
                }}
              >
                Expiring within 30 days ({expiring.length})
              </h2>
              <CrewTable
                rows={expiring}
                lastCol="Days left"
                lastVal={(r) => String(r.days_remaining ?? "—")}
              />
            </section>
          )}

          {/* No visa */}
          {noVisa.length > 0 && (
            <section style={{ marginBottom: 18 }}>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: COLORS.muted,
                  margin: "0 0 2px",
                }}
              >
                No visa on record ({noVisa.length})
              </h2>
              <CrewTable rows={noVisa} lastCol="Expiry" lastVal={() => "—"} />
            </section>
          )}

          {/* Active (collapsed by default) */}
          <section style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: "#4CAF80",
                  margin: "0 0 2px",
                }}
              >
                Active ({active.length})
              </h2>
              {active.length > 0 && (
                <button
                  onClick={() => setActiveExpanded((s) => !s)}
                  style={{
                    background: "none",
                    border: "none",
                    color: COLORS.signal,
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {activeExpanded ? "Hide" : "Show all"}
                </button>
              )}
            </div>
            {activeExpanded && active.length > 0 && (
              <CrewTable
                rows={active}
                lastCol="Days left"
                lastVal={(r) => String(r.days_remaining ?? "—")}
              />
            )}
          </section>

          {/* History */}
          <section style={{ marginTop: 26 }}>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: COLORS.frost,
                margin: "0 0 10px",
              }}
            >
              Report history
            </h2>
            <div style={{ ...card, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Generated</th>
                    <th style={th}>Crew</th>
                    <th style={th}>Active</th>
                    <th style={th}>Expiring</th>
                    <th style={th}>Expired</th>
                    <th style={th}>Status</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr
                      key={h.id}
                      style={{
                        background:
                          currentReport?.id === h.id
                            ? `${COLORS.signal}10`
                            : "transparent",
                      }}
                    >
                      <td style={td}>
                        {formatDateDMY(h.generated_at)}
                        {i === 0 && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 12,
                              fontWeight: 700,
                              color: COLORS.signal,
                              border: `1px solid ${COLORS.signal}55`,
                              borderRadius: 999,
                              padding: "1px 8px",
                            }}
                          >
                            Latest
                          </span>
                        )}
                      </td>
                      <td style={td}>{h.crew_count ?? 0}</td>
                      <td style={td}>{h.active_count ?? 0}</td>
                      <td style={td}>{h.expiring_count ?? 0}</td>
                      <td style={td}>{h.expired_count ?? 0}</td>
                      <td style={td}>{h.status}</td>
                      <td style={td}>
                        <button
                          onClick={() => setHistoryViewId(h.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: COLORS.signal,
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: 600,
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Send confirmation modal */}
      {confirmSend && (
        <div
          onClick={() => setConfirmSend(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...card, maxWidth: 460, width: "100%", padding: 24 }}
          >
            <h3
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: COLORS.frost,
                margin: "0 0 10px",
              }}
            >
              Send visa report
            </h3>
            <p
              style={{
                fontSize: 15,
                color: COLORS.muted,
                lineHeight: 1.6,
                margin: "0 0 8px",
              }}
            >
              Send the {formatDateDMY(confirmSend.report_date)} report for{" "}
              <strong style={{ color: COLORS.frost }}>
                {selectedYacht?.vessel_name}
              </strong>{" "}
              to:
            </p>
            <ul
              style={{
                fontSize: 15,
                color: COLORS.frost,
                margin: "0 0 18px",
                paddingLeft: 18,
              }}
            >
              <li>Email — {selectedYacht?.visa_report_email}</li>
            </ul>
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}
            >
              <button onClick={() => setConfirmSend(null)} style={btn("ghost")}>
                Cancel
              </button>
              <button
                onClick={() => handleSend(confirmSend)}
                style={btn("primary")}
              >
                Confirm & send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
