/**
 * Captain Dashboard — New View hub (POLARIS_CAPTAIN_DASHBOARD.md, ticket #146).
 *
 * Vessel-scoped operational overview: vessel banner + 6-metric stat strip + an
 * alerts panel (visa expiry, customs holds), all for the currently-selected yacht.
 * Auth/JWT vessel-scoping is deferred to production per the redesign preview model
 * (see _app.polaris-redesign.tsx) — scope here follows the shell's vessel switcher.
 *
 * Phase 2 of the build. Crew manifest, visa pipeline, ShipSync panel, request-support
 * modal and the module grid land in Phase 3.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TIcon } from "@/components/polaris-ui/primitives";
import { useVesselVisaData, useVesselLogistics, type YachtOption } from "@/components/polaris-ui/data";

// Full yacht record needed for the banner (YachtOption only carries id + name).
interface YachtDetail {
  vessel_name: string | null;
  flag: string | null;
  length_overall_m: number | null;
  built_year: number | null;
  location: string | null;
  berth: string | null;
  etd: string | null;
  max_crew: number | null;
  status: string | null;
  cruising_permit_expiry: string | null;
}

function useYachtDetail(yachtId: string | null): YachtDetail | null {
  const [detail, setDetail] = useState<YachtDetail | null>(null);
  useEffect(() => {
    if (!yachtId) { setDetail(null); return; }
    void (async () => {
      const { data } = await (supabase as any)
        .from("yachts")
        .select("vessel_name, flag, length_overall_m, built_year, location, berth, etd, max_crew, status, cruising_permit_expiry")
        .eq("id", yachtId)
        .maybeSingle();
      setDetail((data as YachtDetail) ?? null);
    })();
  }, [yachtId]);
  return detail;
}

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  const n = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  return Number.isNaN(n) ? null : n;
}

// ── Vessel banner ─────────────────────────────────────────────────────────────
function VesselBanner({ yacht, onSwitchVessel }: { yacht: YachtDetail | null; onSwitchVessel: () => void }) {
  const inPort = !!yacht?.location;
  const subtitle = [
    yacht?.length_overall_m ? `${yacht.length_overall_m}m` : null,
    yacht?.flag ? `${yacht.flag} flag` : null,
    yacht?.built_year ? `Built ${yacht.built_year}` : null,
  ].filter(Boolean).join(" · ");

  const etdDays = daysUntil(yacht?.etd);

  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap",
        background: "var(--pds-surface-1)",
        border: "1px solid var(--pds-border)",
        borderRadius: "var(--pds-radius-lg)",
        padding: "14px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <TIcon name="anchor" size={22} color="var(--pds-gold-light)" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--pds-font-display)", fontSize: "var(--pds-fs-title)", fontWeight: 600, color: "var(--pds-text)" }}>
            {yacht?.vessel_name ?? "Select a vessel"}
          </div>
          {subtitle && (
            <div style={{ fontSize: "var(--pds-fs-label)", color: "var(--pds-text-secondary)", marginTop: 2 }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Pill
          text={inPort ? `In Port — ${yacht?.location}` : "At Sea"}
          color={inPort ? "var(--pds-gold-light)" : "var(--pds-text-secondary)"}
          bg={inPort ? "var(--pds-gold-muted)" : "var(--pds-surface-3)"}
        />
        {yacht?.berth && <Pill text={`Berth ${yacht.berth}`} color="var(--pds-text-secondary)" bg="var(--pds-surface-3)" />}
        {yacht?.etd && (
          <Pill
            text={`ETD ${fmtDate(yacht.etd)}`}
            color={etdDays !== null && etdDays <= 7 ? "var(--pds-expiring)" : "var(--pds-text-secondary)"}
            bg={etdDays !== null && etdDays <= 7 ? "var(--pds-expiring-bg)" : "var(--pds-surface-3)"}
          />
        )}
        <button
          onClick={onSwitchVessel}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--pds-surface-3)", border: "1px solid var(--pds-border)",
            color: "var(--pds-text-secondary)", fontSize: "var(--pds-fs-label)", fontWeight: 600,
            padding: "5px 12px", minHeight: 32, borderRadius: "var(--pds-radius-full)", cursor: "pointer",
          }}
        >
          <TIcon name="switch-horizontal" size={14} /> Switch
        </button>
      </div>
    </div>
  );
}

function Pill({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontSize: "var(--pds-fs-badge)", fontWeight: 600, color,
      background: bg, padding: "4px 10px", borderRadius: "var(--pds-radius-full)",
    }}>
      {text}
    </span>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <div style={{
      background: "var(--pds-surface-2)", border: "1px solid var(--pds-border)",
      borderRadius: "var(--pds-radius-md)", padding: "12px 14px",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <TIcon name={icon} size={15} color="var(--pds-text-secondary)" />
        <span style={{ fontSize: "var(--pds-fs-section)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--pds-text-hint)" }}>
          {label}
        </span>
      </div>
      <div style={{ fontFamily: "var(--pds-font-display)", fontSize: "var(--pds-fs-metric)", fontWeight: 600, color, lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}

// ── Alerts ──────────────────────────────────────────────────────────────────
type Severity = "red" | "amber" | "grey";
interface DashAlert { id: string; label: string; detail: string; severity: Severity; }

const SEV_DOT: Record<Severity, string> = {
  red: "var(--pds-expired)", amber: "var(--pds-expiring)", grey: "var(--pds-text-hint)",
};
const SEV_BADGE_BG: Record<Severity, string> = {
  red: "var(--pds-expired-bg)", amber: "var(--pds-expiring-bg)", grey: "var(--pds-surface-3)",
};
const SEV_BADGE_TEXT: Record<Severity, string> = {
  red: "var(--pds-expired-text)", amber: "var(--pds-expiring-text)", grey: "var(--pds-text-secondary)",
};

function AlertsPanel({ alerts, loading }: { alerts: DashAlert[]; loading: boolean }) {
  return (
    <div style={{
      background: "var(--pds-surface-2)", border: "1px solid var(--pds-border)",
      borderRadius: "var(--pds-radius-lg)", padding: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <TIcon name="alert-triangle" size={16} color="var(--pds-gold-light)" />
        <span style={{ fontFamily: "var(--pds-font-display)", fontSize: "var(--pds-fs-card-title)", fontWeight: 600, color: "var(--pds-text)" }}>
          Alerts requiring action
        </span>
        {alerts.length > 0 && (
          <span style={{
            marginLeft: "auto", fontSize: "var(--pds-fs-badge)", fontWeight: 700,
            color: "var(--pds-expired-text)", background: "var(--pds-expired-bg)",
            padding: "2px 9px", borderRadius: "var(--pds-radius-full)",
          }}>
            {alerts.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="pds-skeleton" style={{ height: 56 }} />
      ) : alerts.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", color: "var(--pds-active)" }}>
          <TIcon name="circle-check" size={18} color="var(--pds-active)" />
          <span style={{ fontSize: "var(--pds-fs-body)", fontWeight: 500 }}>No alerts today.</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alerts.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEV_DOT[a.severity], flexShrink: 0 }} />
              <span style={{ fontSize: "var(--pds-fs-body)", color: "var(--pds-text)", fontWeight: 500 }}>{a.label}</span>
              <span style={{
                marginLeft: "auto", fontSize: "var(--pds-fs-badge)", fontWeight: 600,
                color: SEV_BADGE_TEXT[a.severity], background: SEV_BADGE_BG[a.severity],
                padding: "3px 10px", borderRadius: "var(--pds-radius-full)", whiteSpace: "nowrap",
              }}>
                {a.detail}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Hub ─────────────────────────────────────────────────────────────────────
export function CaptainHub({ yacht, onSwitchVessel }: { yacht: YachtOption | null; onSwitchVessel: () => void }) {
  const yachtId = yacht?.id ?? null;
  const detail = useYachtDetail(yachtId);
  const visa = useVesselVisaData(yachtId);
  const logistics = useVesselLogistics(yacht?.vessel_name ?? null);

  const loading = visa.loading || logistics.loading;

  // Metrics
  const crewOnboard = visa.counts.total;
  const visaAlerts = visa.counts.expiring + visa.counts.expired + visa.counts.noVisa;
  const permitDays = daysUntil(detail?.cruising_permit_expiry);
  const expiringPermits = permitDays !== null && permitDays >= 0 && permitDays <= 30 ? 1 : 0;
  const shipmentsInTransit = logistics.counts.inTransit;

  // Alerts — visa expiry (red/amber) + customs-hold shipments (amber).
  const alerts: DashAlert[] = [];
  for (const r of visa.rows) {
    if (r.status === "expired") {
      alerts.push({ id: `visa-${r.crewId}`, label: `${r.name} — Visa`, detail: `Expired ${r.daysOverdue ?? 0}d ago`, severity: "red" });
    } else if (r.status === "expiring_soon") {
      const d = r.daysRemaining ?? 0;
      alerts.push({ id: `visa-${r.crewId}`, label: `${r.name} — Visa`, detail: `Expires in ${d}d`, severity: d <= 7 ? "red" : "amber" });
    } else if (r.status === "no_visa") {
      alerts.push({ id: `visa-${r.crewId}`, label: `${r.name} — Visa`, detail: "No active visa", severity: "red" });
    }
  }
  for (const s of logistics.rows) {
    if (String(s.status).toLowerCase().includes("hold")) {
      alerts.push({ id: `ship-${s.id}`, label: `${s.barcode ?? "Shipment"} — Customs hold`, detail: s.courier ?? "Held", severity: "amber" });
    }
  }
  const order: Record<Severity, number> = { red: 0, amber: 1, grey: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <div className="pds pds-fade" style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1100 }}>
      <VesselBanner yacht={detail} onSwitchVessel={onSwitchVessel} />

      <div className="pds-stats-grid">
        <MetricCard label="Crew Onboard" value={loading ? "…" : crewOnboard} icon="users" color="var(--pds-gold-light)" />
        <MetricCard label="Visa Alerts" value={loading ? "…" : visaAlerts} icon="id-badge"
          color={visaAlerts > 0 ? "var(--pds-expired)" : "var(--pds-active)"} />
        <MetricCard label="Expiring Permits" value={expiringPermits} icon="file-certificate"
          color={expiringPermits > 0 ? "var(--pds-expiring)" : "var(--pds-text)"} />
        <MetricCard label="SOA Balance" value="—" icon="report-money" color="var(--pds-text-secondary)" />
        <MetricCard label="Shipments" value={loading ? "…" : shipmentsInTransit} icon="package" color="var(--pds-text)" />
        <MetricCard label="IT Tickets" value="—" icon="cpu" color="var(--pds-text-secondary)" />
      </div>

      <AlertsPanel alerts={alerts} loading={loading} />

      <p style={{ fontSize: "var(--pds-fs-label)", color: "var(--pds-text-hint)", margin: "2px 0 0" }}>
        SOA balance and IT tickets connect once the Finance and Yacht-IT vessel feeds are wired. Crew, visa
        and shipment panels follow in the next build phase.
      </p>
    </div>
  );
}

export default CaptainHub;
