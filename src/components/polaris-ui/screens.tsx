/**
 * Polaris Redesign — Dashboard + Visa Reports screens (#195, Phases 2–3).
 * Card-first, action-first, traffic-light layouts built from the polaris-ui library.
 * Generate/Send use the existing /api/visa/* routes; reads use the shared data hook.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { formatDateDMY } from "@/lib/visa-reporting/statusHelpers";
import {
  StatCard,
  PolarisCard,
  CrewRow,
  TrafficLight,
  ComplianceBar,
  type StatVariant,
} from "./cards";
import {
  StatusBadge,
  PolarisButton,
  SectionLabel,
  Skeleton,
  EmptyState,
  TIcon,
  type BadgeVariant,
} from "./primitives";
import { ConfirmModal, useToast } from "./feedback";
import { LeoPanel } from "@/components/leo/LeoPanel";
import { ManageUsers } from "@/components/admin/manage-users";
import { MfaSetup } from "@/components/auth/MfaSetup";
import { PermissionsPanel, IntegrationsPanel, EmailTemplatesPanel } from "@/routes/_app.settings";
import {
  useVesselVisaData,
  useVesselMovements,
  useVesselImmigration,
  useVesselLogistics,
  useVesselTraining,
  useVesselDocuments,
  type YachtOption,
  type CrewVisaRow,
} from "./data";

const SWITCH_ICON = "arrows-exchange";
// Expiry-state → badge for training certs & crew documents.
const EXP_BADGE: Record<string, { variant: BadgeVariant; label: string }> = {
  active: { variant: "active", label: "Valid" },
  expiring_soon: { variant: "expiring", label: "Expiring" },
  expired: { variant: "expired", label: "Expired" },
  none: { variant: "grey", label: "No expiry" },
};

const STATUS_BADGE: Record<
  CrewVisaRow["status"],
  { variant: BadgeVariant; label: string }
> = {
  active: { variant: "active", label: "Active" },
  expiring_soon: { variant: "expiring", label: "Expiring" },
  expired: { variant: "expired", label: "Expired" },
  no_visa: { variant: "grey", label: "No visa" },
};

interface ReportLogRow {
  id: string;
  generated_at: string;
  sent_at: string | null;
  status: string;
  crew_count: number | null;
  expired_count: number | null;
  expiring_count: number | null;
}

function useReportLog(yachtId: string | null) {
  const [rows, setRows] = useState<ReportLogRow[]>([]);
  const load = useCallback(async () => {
    if (!yachtId) return;
    const { data } = await (supabase as any)
      .from("visa_report_log")
      .select(
        "id, generated_at, sent_at, status, crew_count, expired_count, expiring_count",
      )
      .eq("yacht_id", yachtId)
      .order("generated_at", { ascending: false })
      .limit(20);
    setRows((data ?? []) as ReportLogRow[]);
  }, [yachtId]);
  useEffect(() => {
    void load();
  }, [load]);
  return { rows, reload: load };
}

function useReportActions(yachtId: string | null, onChange: () => void) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const toast = useToast();
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  const generate = useCallback(async () => {
    if (!yachtId) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/visa/report-generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ yacht_id: yachtId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generate failed");
      toast("Report generated", "success");
      onChange();
      return data.report?.id as string | undefined;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Generate failed", "error");
    } finally {
      setGenerating(false);
    }
  }, [yachtId, token, toast, onChange]);

  const send = useCallback(
    async (reportId: string) => {
      setSending(true);
      try {
        const res = await fetch("/api/visa/report-send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ report_id: reportId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Send failed");
        toast("Report sent", "success");
        onChange();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Send failed", "error");
      } finally {
        setSending(false);
      }
    },
    [token, toast, onChange],
  );

  return { generate, send, generating, sending };
}

function PageHeader({
  title,
  actions,
}: {
  title: string;
  actions: React.ReactNode;
}) {
  const today = useMemo(
    () =>
      new Date().toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [],
  );
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        marginBottom: 16,
      }}
    >
      <div>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--pds-font-display)",
            fontSize: "var(--pds-fs-title)",
            fontWeight: 600,
            color: "var(--pds-text)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h1>
        <div
          style={{
            fontSize: "var(--pds-fs-label)",
            color: "var(--pds-text-secondary)",
            marginTop: 2,
          }}
        >
          {today}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function PolarisDashboard({
  yacht,
  onSwitchVessel,
  onOpenReports,
  leoToken,
  userName,
}: {
  yacht: YachtOption | null;
  onSwitchVessel: () => void;
  onOpenReports: () => void;
  /** Leo morning-brief greeting on the dashboard (Beta). */
  leoToken?: string;
  userName?: string;
}) {
  const { loading, rows, counts } = useVesselVisaData(yacht?.id ?? null);
  const { rows: reports, reload: reloadReports } = useReportLog(
    yacht?.id ?? null,
  );
  const { generate, send, generating, sending } = useReportActions(
    yacht?.id ?? null,
    reloadReports,
  );
  const [confirm, setConfirm] = useState(false);

  const canSend = !!yacht?.send_visa_reports && !!yacht?.visa_report_email;
  const alerts = rows.filter(
    (r) => r.status === "expired" || r.status === "expiring_soon",
  );
  const upcoming = rows
    .filter((r) => r.status === "expiring_soon")
    .sort((a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0));

  async function handleSendLatest() {
    setConfirm(false);
    const latest = reports[0]?.id ?? (await generate());
    if (latest) await send(latest);
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={
          <>
            <PolarisButton
              variant="primary"
              icon="refresh"
              label={generating ? "Generating…" : "Generate report"}
              onClick={() => void generate()}
              disabled={generating || !yacht}
            />
            <PolarisButton
              variant="ghost"
              icon="send"
              label="Send report"
              onClick={() => setConfirm(true)}
              disabled={!canSend || sending}
              title={
                canSend
                  ? undefined
                  : "Enable report emails for this vessel first"
              }
            />
          </>
        }
      />

      {/* Leo morning brief — greets the user on the Beta dashboard */}
      {leoToken && (
        <div style={{ marginBottom: 16 }}>
          <LeoPanel token={leoToken} userName={userName ?? ""} />
        </div>
      )}

      {/* Stat cards */}
      <SectionLabel>Fleet status — {yacht?.vessel_name ?? "—"}</SectionLabel>
      <div className="pds-stats-grid" style={{ marginBottom: 16 }}>
        {loading ? (
          [...Array(6)].map((_, i) => (
            <Skeleton key={i} height={88} radius={12} />
          ))
        ) : (
          <>
            <StatCard
              label="Crew onboard"
              value={counts.total}
              variant="neutral"
            />
            <StatCard
              label="Active visas"
              value={counts.active}
              variant="active"
            />
            <StatCard
              label="Expiring"
              value={counts.expiring}
              variant="expiring"
              sub="within 30 days"
            />
            <StatCard
              label="Expired"
              value={counts.expired}
              variant="expired"
            />
            <StatCard label="No visa" value={counts.noVisa} variant="neutral" />
            <StatCard label="Sign-ons (7d)" value={0} variant="neutral" />
          </>
        )}
      </div>

      {/* Two-column: alerts | fleet */}
      <div className="pds-grid-2" style={{ marginBottom: 16 }}>
        <PolarisCard
          title="Compliance alerts"
          icon="alert-triangle"
          badge={
            alerts.length ? (
              <StatusBadge
                variant={counts.expired ? "expired" : "expiring"}
                label={`${alerts.length}`}
              />
            ) : undefined
          }
        >
          {loading ? (
            <Skeleton height={60} />
          ) : alerts.length === 0 ? (
            <EmptyState
              icon="circle-check"
              message="No compliance alerts for this vessel."
            />
          ) : (
            alerts.slice(0, 6).map((c) => {
              const b = STATUS_BADGE[c.status];
              const detail =
                c.status === "expired"
                  ? `${c.daysOverdue}d overdue`
                  : `${c.daysRemaining}d left`;
              return (
                <CrewRow
                  key={c.crewId}
                  name={c.name}
                  detail={`${c.visaType ?? "Visa"} · ${detail}`}
                  badge={<StatusBadge variant={b.variant} label={b.label} />}
                />
              );
            })
          )}
        </PolarisCard>

        <PolarisCard title="Fleet status" icon="traffic-lights">
          {loading ? (
            <Skeleton height={60} />
          ) : (
            <TrafficLight
              expired={counts.expired > 0}
              expiring={counts.expiring > 0}
              active={counts.active > 0}
              label={yacht?.vessel_name ?? "Vessel"}
              count={`${counts.active}/${counts.total}`}
              countVariant={
                counts.expired
                  ? "expired"
                  : counts.expiring
                    ? "expiring"
                    : "active"
              }
              onClick={onOpenReports}
            />
          )}
        </PolarisCard>
      </div>

      {/* Crew onboard */}
      <div style={{ marginBottom: 16 }}>
        <PolarisCard
          title="Crew onboard"
          icon="users"
          action={{ label: "View all", onClick: onOpenReports }}
        >
          {loading ? (
            <Skeleton height={80} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="users"
              message="No crew on this vessel yet."
            />
          ) : (
            rows.slice(0, 6).map((c) => {
              const b = STATUS_BADGE[c.status];
              return (
                <CrewRow
                  key={c.crewId}
                  name={c.name}
                  detail={`${c.rank ?? "Crew"} · ${c.nationality ?? "—"}`}
                  badge={<StatusBadge variant={b.variant} label={b.label} />}
                />
              );
            })
          )}
        </PolarisCard>
      </div>

      {/* Two-column: recent reports | upcoming expiries */}
      <div className="pds-grid-2">
        <PolarisCard
          title="Recent reports"
          icon="history"
          action={{ label: "Reports", onClick: onOpenReports }}
        >
          {reports.length === 0 ? (
            <EmptyState
              icon="file-description"
              message="No reports generated yet."
              action={{
                label: "Generate report",
                onClick: () => void generate(),
              }}
            />
          ) : (
            reports
              .slice(0, 5)
              .map((r) => (
                <CrewRow
                  key={r.id}
                  name={formatDateDMY(r.generated_at)}
                  detail={`${r.crew_count ?? 0} crew · ${r.expired_count ?? 0} expired`}
                  badge={
                    <StatusBadge
                      variant={
                        r.status === "sent"
                          ? "active"
                          : r.status === "failed"
                            ? "expired"
                            : "neutral"
                      }
                      label={r.status}
                    />
                  }
                />
              ))
          )}
        </PolarisCard>

        <PolarisCard title="Upcoming expiries" icon="clock">
          {loading ? (
            <Skeleton height={60} />
          ) : upcoming.length === 0 ? (
            <EmptyState
              icon="circle-check"
              message="Nothing expiring in the next 30 days."
            />
          ) : (
            upcoming
              .slice(0, 6)
              .map((c) => (
                <CrewRow
                  key={c.crewId}
                  name={c.name}
                  detail={`Expires ${formatDateDMY(c.expiry)}`}
                  badge={
                    <StatusBadge
                      variant="expiring"
                      label={`${c.daysRemaining}d`}
                    />
                  }
                />
              ))
          )}
        </PolarisCard>
      </div>

      {confirm && (
        <ConfirmModal
          title="Send visa report"
          confirmLabel="Confirm & send"
          confirmIcon="send"
          busy={sending || generating}
          onCancel={() => setConfirm(false)}
          onConfirm={handleSendLatest}
        >
          Send the latest visa report for{" "}
          <strong style={{ color: "var(--pds-text)" }}>
            {yacht?.vessel_name}
          </strong>{" "}
          to{" "}
          <strong style={{ color: "var(--pds-text)" }}>
            {yacht?.visa_report_email}
          </strong>{" "}
          by email. A fresh report is generated first if none exists.
        </ConfirmModal>
      )}
    </>
  );
}

// ── Visa Reports screen ───────────────────────────────────────────────────────
export function PolarisVisaReports({
  yachts,
  selectedId,
  onSelect,
}: {
  yachts: YachtOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const yacht = yachts.find((y) => y.id === selectedId) ?? null;
  const { loading, rows, counts } = useVesselVisaData(selectedId);
  const { rows: reports, reload } = useReportLog(selectedId);
  const { generate, send, generating, sending } = useReportActions(
    selectedId,
    reload,
  );
  const [showActive, setShowActive] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const canSend = !!yacht?.send_visa_reports && !!yacht?.visa_report_email;
  const expired = rows.filter((r) => r.status === "expired");
  const expiring = rows.filter((r) => r.status === "expiring_soon");
  const active = rows.filter((r) => r.status === "active");

  async function handleSend() {
    setConfirm(false);
    const latest = reports[0]?.id ?? (await generate());
    if (latest) await send(latest);
  }

  const crewList = (list: CrewVisaRow[], detail: (c: CrewVisaRow) => string) =>
    list.map((c) => {
      const b = STATUS_BADGE[c.status];
      return (
        <CrewRow
          key={c.crewId}
          name={c.name}
          detail={detail(c)}
          badge={<StatusBadge variant={b.variant} label={b.label} />}
        />
      );
    });

  return (
    <>
      <PageHeader
        title="Visa Reports"
        actions={
          <>
            <PolarisButton
              variant="primary"
              icon="refresh"
              label={generating ? "Generating…" : "Generate report"}
              onClick={() => void generate()}
              disabled={generating || !selectedId}
            />
            <PolarisButton
              variant="ghost"
              icon="send"
              label="Send to vessel"
              onClick={() => setConfirm(true)}
              disabled={!canSend || sending}
              title={
                canSend
                  ? undefined
                  : "Enable report emails for this vessel first"
              }
            />
          </>
        }
      />

      {/* Vessel switcher pills */}
      <SectionLabel>Vessel</SectionLabel>
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}
      >
        {yachts.slice(0, 12).map((y) => {
          const on = y.id === selectedId;
          return (
            <button
              key={y.id}
              onClick={() => onSelect(y.id)}
              style={{
                background: on
                  ? "var(--pds-gold-muted)"
                  : "var(--pds-surface-2)",
                border: `1px solid ${on ? "var(--pds-border-gold-strong)" : "var(--pds-border)"}`,
                color: on
                  ? "var(--pds-gold-light)"
                  : "var(--pds-text-secondary)",
                fontSize: "var(--pds-fs-label)",
                fontWeight: on ? 600 : 500,
                padding: "8px 14px",
                minHeight: 40,
                borderRadius: "var(--pds-radius-full)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <TIcon name="ship" size={14} />
              {y.vessel_name ?? "Unnamed"}
            </button>
          );
        })}
      </div>

      {/* Stat cards */}
      <div className="pds-stats-grid" style={{ marginBottom: 16 }}>
        {loading ? (
          [...Array(4)].map((_, i) => (
            <Skeleton key={i} height={88} radius={12} />
          ))
        ) : (
          <>
            <StatCard
              label="Total crew"
              value={counts.total}
              variant="neutral"
            />
            <StatCard label="Active" value={counts.active} variant="active" />
            <StatCard
              label="Expiring"
              value={counts.expiring}
              variant="expiring"
            />
            <StatCard
              label="Expired"
              value={counts.expired}
              variant="expired"
            />
          </>
        )}
      </div>

      {/* Expired | Expiring */}
      <div className="pds-grid-2" style={{ marginBottom: 16 }}>
        <PolarisCard
          title="Expired — immediate attention"
          icon="alert-circle"
          badge={
            expired.length ? (
              <StatusBadge variant="expired" label={`${expired.length}`} />
            ) : undefined
          }
        >
          {loading ? (
            <Skeleton height={60} />
          ) : expired.length === 0 ? (
            <EmptyState icon="circle-check" message="No expired visas." />
          ) : (
            crewList(
              expired,
              (c) => `${c.visaType ?? "Visa"} · ${c.daysOverdue}d overdue`,
            )
          )}
        </PolarisCard>
        <PolarisCard
          title="Expiring within 30 days"
          icon="clock"
          badge={
            expiring.length ? (
              <StatusBadge variant="expiring" label={`${expiring.length}`} />
            ) : undefined
          }
        >
          {loading ? (
            <Skeleton height={60} />
          ) : expiring.length === 0 ? (
            <EmptyState icon="circle-check" message="Nothing expiring soon." />
          ) : (
            crewList(
              expiring,
              (c) =>
                `${c.visaType ?? "Visa"} · expires ${formatDateDMY(c.expiry)}`,
            )
          )}
        </PolarisCard>
      </div>

      {/* Active (collapsed) */}
      <div style={{ marginBottom: 16 }}>
        <PolarisCard
          title={`Active visas (${active.length})`}
          icon="circle-check"
          action={
            active.length
              ? {
                  label: showActive ? "Hide" : "Show all",
                  onClick: () => setShowActive((s) => !s),
                }
              : undefined
          }
        >
          {loading ? (
            <Skeleton height={40} />
          ) : active.length === 0 ? (
            <EmptyState icon="circle-check" message="No active visas." />
          ) : showActive ? (
            crewList(
              active,
              (c) => `${c.visaType ?? "Visa"} · ${c.daysRemaining}d left`,
            )
          ) : (
            <div
              style={{
                fontSize: "var(--pds-fs-label)",
                color: "var(--pds-text-secondary)",
              }}
            >
              {active.length} crew with active visas. Use “Show all” to expand.
            </div>
          )}
        </PolarisCard>
      </div>

      {/* Report history */}
      <PolarisCard title="Report history" icon="history">
        {reports.length === 0 ? (
          <EmptyState
            icon="file-description"
            message="No reports generated for this vessel yet."
            action={{
              label: "Generate report",
              onClick: () => void generate(),
            }}
          />
        ) : (
          reports.map((r, i) => (
            <CrewRow
              key={r.id}
              name={`${formatDateDMY(r.generated_at)}${i === 0 ? "  · Latest" : ""}`}
              detail={`${r.crew_count ?? 0} crew · ${r.expiring_count ?? 0} expiring · ${r.expired_count ?? 0} expired`}
              badge={
                <StatusBadge
                  variant={
                    r.status === "sent"
                      ? "active"
                      : r.status === "failed"
                        ? "expired"
                        : "neutral"
                  }
                  label={r.status}
                />
              }
            />
          ))
        )}
      </PolarisCard>

      {confirm && (
        <ConfirmModal
          title="Send visa report"
          confirmLabel="Confirm & send"
          confirmIcon="send"
          busy={sending || generating}
          onCancel={() => setConfirm(false)}
          onConfirm={handleSend}
        >
          Send the latest report for{" "}
          <strong style={{ color: "var(--pds-text)" }}>
            {yacht?.vessel_name}
          </strong>{" "}
          to{" "}
          <strong style={{ color: "var(--pds-text)" }}>
            {yacht?.visa_report_email}
          </strong>{" "}
          by email.
        </ConfirmModal>
      )}
    </>
  );
}

// ── Crew screen ───────────────────────────────────────────────────────────────
type CrewFilter = "all" | CrewVisaRow["status"];

export function PolarisCrew({
  yacht,
  onSwitchVessel,
}: {
  yacht: YachtOption | null;
  onSwitchVessel: () => void;
}) {
  const { loading, rows, counts } = useVesselVisaData(yacht?.id ?? null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<CrewFilter>("all");

  const term = q.trim().toLowerCase();
  const filtered = rows.filter((c) => {
    if (filter !== "all" && c.status !== filter) return false;
    if (!term) return true;
    return (
      c.name.toLowerCase().includes(term) ||
      (c.rank ?? "").toLowerCase().includes(term) ||
      (c.nationality ?? "").toLowerCase().includes(term) ||
      (c.visaType ?? "").toLowerCase().includes(term)
    );
  });

  const FILTERS: { key: CrewFilter; label: string; n: number }[] = [
    { key: "all", label: "All", n: counts.total },
    { key: "active", label: "Active", n: counts.active },
    { key: "expiring_soon", label: "Expiring", n: counts.expiring },
    { key: "expired", label: "Expired", n: counts.expired },
    { key: "no_visa", label: "No visa", n: counts.noVisa },
  ];

  const visaDetail = (c: CrewVisaRow) => {
    if (c.status === "expired")
      return `${c.visaType ?? "Visa"} · ${c.daysOverdue}d overdue`;
    if (c.status === "expiring_soon")
      return `${c.visaType ?? "Visa"} · expires ${formatDateDMY(c.expiry)}`;
    if (c.status === "no_visa") return "No active visa";
    return `${c.visaType ?? "Visa"} · ${c.daysRemaining}d left`;
  };

  return (
    <>
      <PageHeader
        title="Crew"
        actions={null}
      />

      <SectionLabel>Crew — {yacht?.vessel_name ?? "—"}</SectionLabel>
      <div className="pds-stats-grid" style={{ marginBottom: 16 }}>
        {loading ? (
          [...Array(5)].map((_, i) => (
            <Skeleton key={i} height={88} radius={12} />
          ))
        ) : (
          <>
            <StatCard
              label="Total crew"
              value={counts.total}
              variant="neutral"
              onClick={() => setFilter("all")}
            />
            <StatCard
              label="Active"
              value={counts.active}
              variant="active"
              onClick={() => setFilter("active")}
            />
            <StatCard
              label="Expiring"
              value={counts.expiring}
              variant="expiring"
              sub="within 30 days"
              onClick={() => setFilter("expiring_soon")}
            />
            <StatCard
              label="Expired"
              value={counts.expired}
              variant="expired"
              onClick={() => setFilter("expired")}
            />
            <StatCard
              label="No visa"
              value={counts.noVisa}
              variant="neutral"
              onClick={() => setFilter("no_visa")}
            />
          </>
        )}
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <span
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
          }}
        >
          <TIcon name="search" size={16} color="var(--pds-text-secondary)" />
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search crew by name, rank, nationality…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "var(--pds-surface-2)",
            border: "1px solid var(--pds-border)",
            borderRadius: "var(--pds-radius-md)",
            color: "var(--pds-text)",
            fontSize: "var(--pds-fs-body)",
            padding: "10px 12px 10px 36px",
            minHeight: 44,
            outline: "none",
          }}
        />
      </div>

      {/* Filter pills */}
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}
      >
        {FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                background: on ? "var(--pds-gold-muted)" : "var(--pds-surface-2)",
                border: `1px solid ${on ? "var(--pds-border-gold-strong)" : "var(--pds-border)"}`,
                color: on ? "var(--pds-gold-light)" : "var(--pds-text-secondary)",
                fontSize: "var(--pds-fs-label)",
                fontWeight: on ? 600 : 500,
                padding: "6px 12px",
                minHeight: 36,
                borderRadius: "var(--pds-radius-full)",
                cursor: "pointer",
              }}
            >
              {f.label} ({f.n})
            </button>
          );
        })}
      </div>

      <PolarisCard title={`Crew list (${filtered.length})`} icon="users">
        {loading ? (
          <Skeleton height={120} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="users"
            message="No crew on this vessel yet."
                     />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="search"
            message="No crew match your search or filter."
          />
        ) : (
          filtered.map((c) => {
            const b = STATUS_BADGE[c.status];
            return (
              <CrewRow
                key={c.crewId}
                name={c.name}
                detail={`${c.rank ?? "Crew"} · ${c.nationality ?? "—"} · ${visaDetail(c)}`}
                badge={<StatusBadge variant={b.variant} label={b.label} />}
              />
            );
          })
        )}
      </PolarisCard>
    </>
  );
}

// ── Compliance screen ─────────────────────────────────────────────────────────
export function PolarisCompliance({
  yacht,
  onSwitchVessel,
}: {
  yacht: YachtOption | null;
  onSwitchVessel: () => void;
}) {
  const { loading, rows, counts } = useVesselVisaData(yacht?.id ?? null);
  const pct = counts.total ? Math.round((counts.active / counts.total) * 100) : 0;
  const scoreColour =
    pct >= 70
      ? "var(--pds-active)"
      : pct >= 40
        ? "var(--pds-expiring)"
        : "var(--pds-expired)";
  const breaches = rows.filter((r) => r.status === "expired");
  const atRisk = rows.filter((r) => r.status === "expiring_soon");

  const list = (arr: CrewVisaRow[], detail: (c: CrewVisaRow) => string) =>
    arr.map((c) => {
      const b = STATUS_BADGE[c.status];
      return (
        <CrewRow
          key={c.crewId}
          name={c.name}
          detail={detail(c)}
          badge={<StatusBadge variant={b.variant} label={b.label} />}
        />
      );
    });

  return (
    <>
      <PageHeader
        title="Compliance"
        actions={null}
      />

      <SectionLabel>Visa compliance — {yacht?.vessel_name ?? "—"}</SectionLabel>

      <div style={{ marginBottom: 16 }}>
        <PolarisCard title="Compliance score" icon="shield-check">
          {loading ? (
            <Skeleton height={60} />
          ) : (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--pds-font-display)",
                    fontSize: "var(--pds-fs-hero)",
                    fontWeight: 600,
                    color: scoreColour,
                    lineHeight: 1,
                  }}
                >
                  {pct}%
                </span>
                <span
                  style={{
                    fontSize: "var(--pds-fs-label)",
                    color: "var(--pds-text-secondary)",
                  }}
                >
                  {counts.active} of {counts.total} crew hold a valid visa
                </span>
              </div>
              <ComplianceBar pct={pct} />
            </div>
          )}
        </PolarisCard>
      </div>

      <div className="pds-stats-grid" style={{ marginBottom: 16 }}>
        {loading ? (
          [...Array(4)].map((_, i) => (
            <Skeleton key={i} height={88} radius={12} />
          ))
        ) : (
          <>
            <StatCard label="Compliant" value={counts.active} variant="active" />
            <StatCard
              label="At risk"
              value={counts.expiring}
              variant="expiring"
              sub="expiring ≤ 30 days"
            />
            <StatCard label="Breach" value={counts.expired} variant="expired" />
            <StatCard label="No visa" value={counts.noVisa} variant="neutral" />
          </>
        )}
      </div>

      <div className="pds-grid-2">
        <PolarisCard
          title="Breaches — expired"
          icon="alert-circle"
          badge={
            breaches.length ? (
              <StatusBadge variant="expired" label={`${breaches.length}`} />
            ) : undefined
          }
        >
          {loading ? (
            <Skeleton height={60} />
          ) : breaches.length === 0 ? (
            <EmptyState icon="circle-check" message="No compliance breaches." />
          ) : (
            list(
              breaches,
              (c) => `${c.visaType ?? "Visa"} · ${c.daysOverdue}d overdue`,
            )
          )}
        </PolarisCard>

        <PolarisCard
          title="At risk — expiring soon"
          icon="clock"
          badge={
            atRisk.length ? (
              <StatusBadge variant="expiring" label={`${atRisk.length}`} />
            ) : undefined
          }
        >
          {loading ? (
            <Skeleton height={60} />
          ) : atRisk.length === 0 ? (
            <EmptyState icon="circle-check" message="Nothing expiring soon." />
          ) : (
            list(
              atRisk,
              (c) =>
                `${c.visaType ?? "Visa"} · expires ${formatDateDMY(c.expiry)}`,
            )
          )}
        </PolarisCard>
      </div>
    </>
  );
}

// ── Vessels (fleet) screen ────────────────────────────────────────────────────
export function PolarisVessels({
  yachts,
  selectedId,
  onSelect,
}: {
  yachts: YachtOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const list = yachts.filter(
    (y) => !term || (y.vessel_name ?? "").toLowerCase().includes(term),
  );

  return (
    <>
      <PageHeader title="Vessels" actions={null} />
      <SectionLabel>Fleet — {yachts.length} vessels</SectionLabel>

      <div style={{ position: "relative", marginBottom: 16 }}>
        <span
          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex" }}
        >
          <TIcon name="search" size={16} color="var(--pds-text-secondary)" />
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search vessels…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "var(--pds-surface-2)",
            border: "1px solid var(--pds-border)",
            borderRadius: "var(--pds-radius-md)",
            color: "var(--pds-text)",
            fontSize: "var(--pds-fs-body)",
            padding: "10px 12px 10px 36px",
            minHeight: 44,
            outline: "none",
          }}
        />
      </div>

      {list.length === 0 ? (
        <EmptyState icon="ship" message="No vessels match your search." />
      ) : (
        <div className="pds-grid-2">
          {list.map((y) => {
            const on = y.id === selectedId;
            const reports = !!y.send_visa_reports && !!y.visa_report_email;
            return (
              <button
                key={y.id}
                onClick={() => onSelect(y.id)}
                style={{
                  textAlign: "left",
                  background: "var(--pds-surface-2)",
                  border: `1px solid ${on ? "var(--pds-border-gold-strong)" : "var(--pds-border)"}`,
                  borderRadius: "var(--pds-radius-lg)",
                  padding: 16,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  minHeight: 64,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "var(--pds-gold-muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <TIcon name="ship" size={20} color="var(--pds-gold)" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: "var(--pds-fs-body)",
                      fontWeight: 600,
                      color: on ? "var(--pds-gold-light)" : "var(--pds-text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {y.vessel_name ?? "Unnamed vessel"}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <StatusBadge
                      variant={reports ? "active" : "grey"}
                      label={reports ? "Reports on" : "Reports off"}
                    />
                  </div>
                </div>
                {on && <TIcon name="check" size={18} color="var(--pds-gold)" />}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Sign On / Off screen ──────────────────────────────────────────────────────
export function PolarisSignOnOff({
  yacht,
  onSwitchVessel,
}: {
  yacht: YachtOption | null;
  onSwitchVessel: () => void;
}) {
  const { loading, rows, counts } = useVesselMovements(yacht?.id ?? null);
  const isOn = (t: string) => t.includes("on");

  return (
    <>
      <PageHeader
        title="Sign On / Off"
        actions={null}
      />

      <SectionLabel>Crew movements — {yacht?.vessel_name ?? "—"}</SectionLabel>
      <div className="pds-stats-grid" style={{ marginBottom: 16 }}>
        {loading ? (
          [...Array(4)].map((_, i) => (
            <Skeleton key={i} height={88} radius={12} />
          ))
        ) : (
          <>
            <StatCard label="Onboard now" value={counts.onboard} variant="active" />
            <StatCard label="Sign-ons (7d)" value={counts.signOns} variant="neutral" />
            <StatCard label="Sign-offs (7d)" value={counts.signOffs} variant="neutral" />
            <StatCard
              label="Upcoming"
              value={counts.upcoming}
              variant="expiring"
              sub="scheduled ahead"
            />
          </>
        )}
      </div>

      <PolarisCard title="Recent movements" icon="login">
        {loading ? (
          <Skeleton height={120} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="login"
            message="No sign-on/off records for this vessel."
                     />
        ) : (
          rows.slice(0, 40).map((m) => (
            <CrewRow
              key={m.id}
              name={m.crewName}
              detail={`${isOn(m.eventType) ? "Sign-on" : "Sign-off"} · ${m.eventDate ? formatDateDMY(m.eventDate) : "—"}${m.port ? ` · ${m.port}` : ""}${m.flightNumber ? ` · ${m.flightNumber}` : ""}`}
              badge={
                <StatusBadge
                  variant={isOn(m.eventType) ? "active" : "grey"}
                  label={isOn(m.eventType) ? "On" : "Off"}
                />
              }
            />
          ))
        )}
      </PolarisCard>
    </>
  );
}

// Vessel switching is disabled in the Beta for now (the vessel context will move
// to Agent/Crew views). Kept as a no-op so screen signatures are unchanged.
function SwitchVesselAction(_: { onSwitchVessel: () => void }) {
  return null;
}

// ── Immigration screen ────────────────────────────────────────────────────────
export function PolarisImmigration({
  yacht, onSwitchVessel,
}: { yacht: YachtOption | null; onSwitchVessel: () => void }) {
  const { loading, rows, counts } = useVesselImmigration(yacht?.id ?? null);
  const badgeFor = (s: string): { variant: BadgeVariant; label: string } => {
    const x = s.toLowerCase();
    if (x === "approved") return { variant: "active", label: "Approved" };
    if (x === "rejected" || x === "cancelled") return { variant: "expired", label: x === "cancelled" ? "Cancelled" : "Rejected" };
    if (x === "draft") return { variant: "grey", label: "Draft" };
    return { variant: "expiring", label: s.replace(/_/g, " ") || "In progress" };
  };
  return (
    <>
      <PageHeader title="Immigration" actions={<SwitchVesselAction onSwitchVessel={onSwitchVessel} />} />
      <SectionLabel>Visa applications — {yacht?.vessel_name ?? "—"}</SectionLabel>
      <div className="pds-stats-grid" style={{ marginBottom: 16 }}>
        {loading ? [...Array(5)].map((_, i) => <Skeleton key={i} height={88} radius={12} />) : (
          <>
            <StatCard label="Applications" value={counts.total} variant="neutral" />
            <StatCard label="In progress" value={counts.inProgress} variant="expiring" />
            <StatCard label="Approved" value={counts.approved} variant="active" />
            <StatCard label="Rejected" value={counts.rejected} variant="expired" />
            <StatCard label="Draft" value={counts.draft} variant="neutral" />
          </>
        )}
      </div>
      <PolarisCard title="Recent applications" icon="id-badge">
        {loading ? <Skeleton height={120} /> : rows.length === 0 ? (
          <EmptyState icon="id-badge" message="No visa applications for this vessel."  />
        ) : rows.slice(0, 40).map((a) => {
          const b = badgeFor(a.status);
          return (
            <CrewRow key={a.id} name={a.name}
              detail={`${a.visaType ?? "Visa"}${a.destination ? ` · ${a.destination}` : ""}${a.reference ? ` · ${a.reference}` : ""}`}
              badge={<StatusBadge variant={b.variant} label={b.label} />} />
          );
        })}
      </PolarisCard>
    </>
  );
}

// ── Logistics (ShipSync) screen ───────────────────────────────────────────────
export function PolarisLogistics({
  yacht, onSwitchVessel,
}: { yacht: YachtOption | null; onSwitchVessel: () => void }) {
  const { loading, rows, counts } = useVesselLogistics(yacht?.vessel_name ?? null);
  const badgeFor = (s: string): { variant: BadgeVariant; label: string } => {
    const x = s.toLowerCase();
    if (["delivered", "collected"].includes(x)) return { variant: "active", label: "Delivered" };
    if (["assigned", "out_for_delivery"].includes(x)) return { variant: "expiring", label: "In transit" };
    if (["refused"].includes(x)) return { variant: "expired", label: "Refused" };
    return { variant: "grey", label: x.replace(/_/g, " ") || "In office" };
  };
  return (
    <>
      <PageHeader title="Logistics" actions={<SwitchVesselAction onSwitchVessel={onSwitchVessel} />} />
      <SectionLabel>ShipSync packages — {yacht?.vessel_name ?? "—"}</SectionLabel>
      <div className="pds-stats-grid" style={{ marginBottom: 16 }}>
        {loading ? [...Array(4)].map((_, i) => <Skeleton key={i} height={88} radius={12} />) : (
          <>
            <StatCard label="Packages" value={counts.total} variant="neutral" />
            <StatCard label="Awaiting" value={counts.awaiting} variant="neutral" />
            <StatCard label="In transit" value={counts.inTransit} variant="expiring" />
            <StatCard label="Delivered" value={counts.delivered} variant="active" />
          </>
        )}
      </div>
      <PolarisCard title="Recent packages" icon="truck">
        {loading ? <Skeleton height={120} /> : rows.length === 0 ? (
          <EmptyState icon="truck" message="No packages for this vessel."  />
        ) : rows.slice(0, 40).map((p) => {
          const b = badgeFor(p.status);
          return (
            <CrewRow key={p.id} name={p.barcode || p.owner || "Package"}
              detail={`${p.owner ?? "—"}${p.courier ? ` · ${p.courier}` : ""}${p.receivedAt ? ` · ${formatDateDMY(p.receivedAt)}` : ""}`}
              badge={<StatusBadge variant={b.variant} label={b.label} />} />
          );
        })}
      </PolarisCard>
    </>
  );
}

// ── Training screen ───────────────────────────────────────────────────────────
export function PolarisTraining({
  yacht, onSwitchVessel,
}: { yacht: YachtOption | null; onSwitchVessel: () => void }) {
  const { loading, rows, counts } = useVesselTraining(yacht?.id ?? null);
  return (
    <>
      <PageHeader title="Training" actions={<SwitchVesselAction onSwitchVessel={onSwitchVessel} />} />
      <SectionLabel>Certifications — {yacht?.vessel_name ?? "—"}</SectionLabel>
      <div className="pds-stats-grid" style={{ marginBottom: 16 }}>
        {loading ? [...Array(4)].map((_, i) => <Skeleton key={i} height={88} radius={12} />) : (
          <>
            <StatCard label="Certificates" value={counts.total} variant="neutral" />
            <StatCard label="Valid" value={counts.valid} variant="active" />
            <StatCard label="Expiring" value={counts.expiring} variant="expiring" sub="within 90 days" />
            <StatCard label="Expired" value={counts.expired} variant="expired" />
          </>
        )}
      </div>
      <PolarisCard title="Certifications" icon="certificate">
        {loading ? <Skeleton height={120} /> : rows.length === 0 ? (
          <EmptyState icon="certificate" message="No certifications for this vessel's crew."  />
        ) : rows.slice(0, 50).map((c) => {
          const b = EXP_BADGE[c.state];
          return (
            <CrewRow key={c.id} name={`${c.crewName} — ${c.certificate ?? "Certificate"}`}
              detail={`${c.issuer ?? "—"}${c.expiry ? ` · expires ${formatDateDMY(c.expiry)}` : ""}`}
              badge={<StatusBadge variant={b.variant} label={b.label} />} />
          );
        })}
      </PolarisCard>
    </>
  );
}

// ── Crew Documents screen ─────────────────────────────────────────────────────
export function PolarisCrewDocuments({
  yacht, onSwitchVessel,
}: { yacht: YachtOption | null; onSwitchVessel: () => void }) {
  const { loading, rows, counts } = useVesselDocuments(yacht?.id ?? null);
  return (
    <>
      <PageHeader title="Crew Documents" actions={<SwitchVesselAction onSwitchVessel={onSwitchVessel} />} />
      <SectionLabel>Documents — {yacht?.vessel_name ?? "—"}</SectionLabel>
      <div className="pds-stats-grid" style={{ marginBottom: 16 }}>
        {loading ? [...Array(4)].map((_, i) => <Skeleton key={i} height={88} radius={12} />) : (
          <>
            <StatCard label="Documents" value={counts.total} variant="neutral" />
            <StatCard label="Valid" value={counts.valid} variant="active" />
            <StatCard label="Expiring" value={counts.expiring} variant="expiring" sub="within 90 days" />
            <StatCard label="Expired" value={counts.expired} variant="expired" />
          </>
        )}
      </div>
      <PolarisCard title="Crew documents" icon="files">
        {loading ? <Skeleton height={120} /> : rows.length === 0 ? (
          <EmptyState icon="files" message="No documents for this vessel's crew."  />
        ) : rows.slice(0, 50).map((d) => {
          const b = EXP_BADGE[d.state];
          return (
            <CrewRow key={d.id} name={`${d.crewName} — ${d.title ?? d.docType ?? "Document"}`}
              detail={`${d.docType ?? "Document"}${d.expiry ? ` · expires ${formatDateDMY(d.expiry)}` : ""}`}
              badge={<StatusBadge variant={b.variant} label={b.label} />} />
          );
        })}
      </PolarisCard>
    </>
  );
}

// ── Sign-On/Off Reports screen ────────────────────────────────────────────────
export function PolarisSosoReports({
  yacht, onSwitchVessel,
}: { yacht: YachtOption | null; onSwitchVessel: () => void }) {
  const { loading, rows, counts } = useVesselMovements(yacht?.id ?? null);
  const isOn = (t: string) => t.includes("on");
  const signOns = rows.filter((m) => isOn(m.eventType));
  const signOffs = rows.filter((m) => !isOn(m.eventType));
  const block = (list: typeof rows) =>
    list.slice(0, 20).map((m) => (
      <CrewRow key={m.id} name={m.crewName}
        detail={`${m.eventDate ? formatDateDMY(m.eventDate) : "—"}${m.port ? ` · ${m.port}` : ""}${m.flightNumber ? ` · ${m.flightNumber}` : ""}`}
        badge={<StatusBadge variant={isOn(m.eventType) ? "active" : "grey"} label={isOn(m.eventType) ? "On" : "Off"} />} />
    ));
  return (
    <>
      <PageHeader title="Sign-On/Off Reports" actions={<SwitchVesselAction onSwitchVessel={onSwitchVessel} />} />
      <SectionLabel>Movement reports — {yacht?.vessel_name ?? "—"}</SectionLabel>
      <div className="pds-stats-grid" style={{ marginBottom: 16 }}>
        {loading ? [...Array(4)].map((_, i) => <Skeleton key={i} height={88} radius={12} />) : (
          <>
            <StatCard label="Onboard now" value={counts.onboard} variant="active" />
            <StatCard label="Sign-ons (7d)" value={counts.signOns} variant="neutral" />
            <StatCard label="Sign-offs (7d)" value={counts.signOffs} variant="neutral" />
            <StatCard label="Upcoming" value={counts.upcoming} variant="expiring" />
          </>
        )}
      </div>
      <div className="pds-grid-2">
        <PolarisCard title={`Sign-ons (${signOns.length})`} icon="login">
          {loading ? <Skeleton height={80} /> : signOns.length === 0 ? (
            <EmptyState icon="login" message="No sign-on records." />
          ) : block(signOns)}
        </PolarisCard>
        <PolarisCard title={`Sign-offs (${signOffs.length})`} icon="logout">
          {loading ? <Skeleton height={80} /> : signOffs.length === 0 ? (
            <EmptyState icon="logout" message="No sign-off records." />
          ) : block(signOffs)}
        </PolarisCard>
      </div>
    </>
  );
}

// ── Settings screen ────────────────────────────────────────────────────────────
// One home for everything: user management, MFA, role permissions, integration
// credentials and email templates (panels shared with routes/_app.settings.tsx).
const SETTINGS_TABS = [
  { key: "users", label: "Manage Users", icon: "users" },
  { key: "security", label: "Security", icon: "shield-lock" },
  { key: "permissions", label: "Permissions", icon: "shield-check" },
  { key: "integrations", label: "Integrations", icon: "plug" },
  { key: "emailTemplates", label: "Email Templates", icon: "mail" },
] as const;
type SettingsTabKey = (typeof SETTINGS_TABS)[number]["key"];

export function PolarisSettings() {
  const [tab, setTab] = useState<SettingsTabKey>("users");
  return (
    <>
      <PageHeader title="Settings" actions={null} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {SETTINGS_TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", minHeight: 34,
                borderRadius: "var(--pds-radius-full)",
                border: `1px solid ${on ? "var(--pds-border-gold)" : "var(--pds-border)"}`,
                background: on ? "var(--pds-gold-muted)" : "transparent",
                color: on ? "var(--pds-gold-light)" : "var(--pds-text-secondary)",
                fontSize: "var(--pds-fs-label)", fontWeight: 600, cursor: "pointer",
              }}
            >
              <TIcon name={t.icon} size={15} color={on ? "var(--pds-gold)" : "var(--pds-text-secondary)"} />
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === "users" && <ManageUsers />}
      {tab === "security" && <MfaSetup />}
      {tab === "permissions" && <PermissionsPanel />}
      {tab === "integrations" && <IntegrationsPanel />}
      {tab === "emailTemplates" && <EmailTemplatesPanel />}
    </>
  );
}
