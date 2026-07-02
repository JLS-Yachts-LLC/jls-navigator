/**
 * Captain Dashboard — New View hub (POLARIS_CAPTAIN_DASHBOARD.md, tickets #146–#153).
 *
 * Vessel-scoped operational overview for the currently-selected yacht:
 *   Phase 2 — vessel banner, 6-metric stat strip, alerts panel.
 *   Phase 3 — crew manifest, visa pipeline, ShipSync panel, Request-Support modal
 *             (→ operations_requests) and the module grid.
 *
 * Auth/JWT vessel-scoping is deferred to production per the redesign preview model
 * (see _app.polaris-redesign.tsx) — scope here follows the shell's vessel switcher.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { TIcon } from "@/components/polaris-ui/primitives";
import { useToast } from "@/components/polaris-ui/feedback";
import {
  useVesselVisaData,
  useVesselLogistics,
  useVesselImmigration,
  type YachtOption,
} from "@/components/polaris-ui/data";

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

// ── Section shell ─────────────────────────────────────────────────────────────
function Panel({ title, icon, badge, children }: { title: string; icon: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--pds-surface-2)", border: "1px solid var(--pds-border)",
      borderRadius: "var(--pds-radius-lg)", padding: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <TIcon name={icon} size={16} color="var(--pds-gold-light)" />
        <span style={{ fontFamily: "var(--pds-font-display)", fontSize: "var(--pds-fs-card-title)", fontWeight: 600, color: "var(--pds-text)" }}>
          {title}
        </span>
        {badge}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div style={{ fontSize: "var(--pds-fs-body)", color: "var(--pds-text-hint)", padding: "6px 0" }}>{text}</div>;
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
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12, flexWrap: "wrap",
      background: "var(--pds-surface-1)", border: "1px solid var(--pds-border)",
      borderRadius: "var(--pds-radius-lg)", padding: "14px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <TIcon name="anchor" size={22} color="var(--pds-gold-light)" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--pds-font-display)", fontSize: "var(--pds-fs-title)", fontWeight: 600, color: "var(--pds-text)" }}>
            {yacht?.vessel_name ?? "Select a vessel"}
          </div>
          {subtitle && (
            <div style={{ fontSize: "var(--pds-fs-label)", color: "var(--pds-text-secondary)", marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Pill text={inPort ? `In Port — ${yacht?.location}` : "At Sea"}
          color={inPort ? "var(--pds-gold-light)" : "var(--pds-text-secondary)"}
          bg={inPort ? "var(--pds-gold-muted)" : "var(--pds-surface-3)"} />
        {yacht?.berth && <Pill text={`Berth ${yacht.berth}`} color="var(--pds-text-secondary)" bg="var(--pds-surface-3)" />}
        {yacht?.etd && (
          <Pill text={`ETD ${fmtDate(yacht.etd)}`}
            color={etdDays !== null && etdDays <= 7 ? "var(--pds-expiring)" : "var(--pds-text-secondary)"}
            bg={etdDays !== null && etdDays <= 7 ? "var(--pds-expiring-bg)" : "var(--pds-surface-3)"} />
        )}
        <button onClick={onSwitchVessel} style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "var(--pds-surface-3)", border: "1px solid var(--pds-border)",
          color: "var(--pds-text-secondary)", fontSize: "var(--pds-fs-label)", fontWeight: 600,
          padding: "5px 12px", minHeight: 32, borderRadius: "var(--pds-radius-full)", cursor: "pointer",
        }}>
          <TIcon name="switch-horizontal" size={14} /> Switch
        </button>
      </div>
    </div>
  );
}

function Pill({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", fontSize: "var(--pds-fs-badge)", fontWeight: 600,
      color, background: bg, padding: "4px 10px", borderRadius: "var(--pds-radius-full)",
    }}>{text}</span>
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
        <span style={{ fontSize: "var(--pds-fs-section)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--pds-text-hint)" }}>{label}</span>
      </div>
      <div style={{ fontFamily: "var(--pds-font-display)", fontSize: "var(--pds-fs-metric)", fontWeight: 600, color, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

// ── Alerts ──────────────────────────────────────────────────────────────────
type Severity = "red" | "amber" | "grey";
interface DashAlert { id: string; label: string; detail: string; severity: Severity; }
const SEV_DOT: Record<Severity, string> = { red: "var(--pds-expired)", amber: "var(--pds-expiring)", grey: "var(--pds-text-hint)" };
const SEV_BADGE_BG: Record<Severity, string> = { red: "var(--pds-expired-bg)", amber: "var(--pds-expiring-bg)", grey: "var(--pds-surface-3)" };
const SEV_BADGE_TEXT: Record<Severity, string> = { red: "var(--pds-expired-text)", amber: "var(--pds-expiring-text)", grey: "var(--pds-text-secondary)" };

function AlertsPanel({ alerts, loading }: { alerts: DashAlert[]; loading: boolean }) {
  const badge = alerts.length > 0
    ? <span style={{ marginLeft: "auto", fontSize: "var(--pds-fs-badge)", fontWeight: 700, color: "var(--pds-expired-text)", background: "var(--pds-expired-bg)", padding: "2px 9px", borderRadius: "var(--pds-radius-full)" }}>{alerts.length}</span>
    : undefined;
  return (
    <Panel title="Alerts requiring action" icon="alert-triangle" badge={badge}>
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
              <span style={{ marginLeft: "auto", fontSize: "var(--pds-fs-badge)", fontWeight: 600, color: SEV_BADGE_TEXT[a.severity], background: SEV_BADGE_BG[a.severity], padding: "3px 10px", borderRadius: "var(--pds-radius-full)", whiteSpace: "nowrap" }}>{a.detail}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── Crew manifest ─────────────────────────────────────────────────────────────
function CrewManifestPanel({ yachtId }: { yachtId: string | null }) {
  const visa = useVesselVisaData(yachtId);
  return (
    <Panel title="Crew Onboard" icon="users"
      badge={<span style={{ marginLeft: "auto", fontSize: "var(--pds-fs-badge)", color: "var(--pds-text-hint)", fontWeight: 600 }}>{visa.counts.total}</span>}>
      {visa.loading ? (
        <div className="pds-skeleton" style={{ height: 80 }} />
      ) : visa.rows.length === 0 ? (
        <EmptyRow text="No crew linked to this vessel." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
          {visa.rows.map((c) => {
            const badge = visaBadge(c.status, c.daysRemaining, c.daysOverdue);
            return (
              <div key={c.crewId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: badge.dot, flexShrink: 0 }} />
                <span style={{ fontSize: "var(--pds-fs-body)", color: "var(--pds-text)", fontWeight: 500 }}>{c.name}</span>
                <span style={{ fontSize: "var(--pds-fs-label)", color: "var(--pds-text-secondary)" }}>{c.rank ?? "—"}</span>
                <span style={{ marginLeft: "auto", fontSize: "var(--pds-fs-badge)", fontWeight: 600, color: badge.text, background: badge.bg, padding: "3px 10px", borderRadius: "var(--pds-radius-full)", whiteSpace: "nowrap" }}>{badge.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function visaBadge(status: string, daysRemaining: number | null, daysOverdue: number | null) {
  if (status === "expired") return { dot: "var(--pds-expired)", bg: "var(--pds-expired-bg)", text: "var(--pds-expired-text)", label: `Expired ${daysOverdue ?? 0}d` };
  if (status === "expiring_soon") return { dot: "var(--pds-expiring)", bg: "var(--pds-expiring-bg)", text: "var(--pds-expiring-text)", label: `Visa ${daysRemaining ?? 0}d` };
  if (status === "no_visa") return { dot: "var(--pds-expired)", bg: "var(--pds-expired-bg)", text: "var(--pds-expired-text)", label: "No visa" };
  return { dot: "var(--pds-active)", bg: "var(--pds-active-bg)", text: "var(--pds-active-text)", label: "Visa OK" };
}

// ── Visa Centre pipeline ──────────────────────────────────────────────────────
const VISA_STEPS = ["Requested", "Submitted", "Processing", "Approved", "Complete"];
function visaStep(status: string): { step: number; declined: boolean } {
  const s = status.toLowerCase();
  if (["rejected", "declined", "cancelled"].includes(s)) return { step: 1, declined: true };
  if (["complete", "completed"].includes(s)) return { step: 4, declined: false };
  if (s === "approved") return { step: 3, declined: false };
  if (["in_progress", "pending", "processing", "gov_processing"].includes(s)) return { step: 2, declined: false };
  if (s === "submitted") return { step: 1, declined: false };
  return { step: 0, declined: false };
}

function VisaCentrePanel({ yachtId }: { yachtId: string | null }) {
  const imm = useVesselImmigration(yachtId);
  const rows = imm.rows.slice(0, 8);
  return (
    <Panel title="Visa Centre" icon="id-badge"
      badge={<span style={{ marginLeft: "auto", fontSize: "var(--pds-fs-badge)", color: "var(--pds-text-hint)", fontWeight: 600 }}>{imm.counts.total} total</span>}>
      {imm.loading ? (
        <div className="pds-skeleton" style={{ height: 80 }} />
      ) : rows.length === 0 ? (
        <EmptyRow text="No visa applications for this vessel." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => {
            const { step, declined } = visaStep(r.status);
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ width: 110, minWidth: 110, fontSize: "var(--pds-fs-body)", color: "var(--pds-text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <span style={{ width: 64, minWidth: 64, fontSize: "var(--pds-fs-label)", color: "var(--pds-text-secondary)" }}>{r.visaType ?? "—"}</span>
                {declined ? (
                  <span style={{ fontSize: "var(--pds-fs-badge)", fontWeight: 600, color: "var(--pds-expired-text)", background: "var(--pds-expired-bg)", padding: "3px 10px", borderRadius: "var(--pds-radius-full)" }}>Declined</span>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                    {VISA_STEPS.map((label, i) => {
                      const done = i < step, active = i === step;
                      const bg = done ? "var(--pds-active)" : active ? "var(--pds-gold)" : "var(--pds-surface-3)";
                      const col = done || active ? "var(--pds-navy-deep)" : "var(--pds-text-hint)";
                      return (
                        <span key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: col, background: bg, padding: "2px 7px", borderRadius: "var(--pds-radius-full)" }}>{label}</span>
                          {i < VISA_STEPS.length - 1 && <span style={{ color: "var(--pds-text-hint)", fontSize: 11 }}>›</span>}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── ShipSync panel ────────────────────────────────────────────────────────────
const SHIP_STAGES = ["Received", "Assigned", "Out for delivery", "Delivered"];
function shipStage(status: string): number {
  const s = status.toLowerCase();
  if (["delivered", "collected"].includes(s)) return 3;
  if (s === "out_for_delivery") return 2;
  if (s === "assigned") return 1;
  return 0;
}

function ShipSyncPanel({ vesselName }: { vesselName: string | null }) {
  const logistics = useVesselLogistics(vesselName);
  const rows = logistics.rows.slice(0, 6);
  return (
    <Panel title="ShipSync" icon="package"
      badge={<span style={{ marginLeft: "auto", fontSize: "var(--pds-fs-badge)", color: "var(--pds-text-hint)", fontWeight: 600 }}>{logistics.counts.inTransit} in transit</span>}>
      {logistics.loading ? (
        <div className="pds-skeleton" style={{ height: 60 }} />
      ) : rows.length === 0 ? (
        <EmptyRow text="No shipments tagged to this vessel." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((s) => {
            const stage = shipStage(s.status);
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ width: 96, minWidth: 96, fontFamily: "var(--pds-font-body)", fontSize: "var(--pds-fs-label)", color: "var(--pds-gold-light)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.barcode ?? "—"}</span>
                <span style={{ fontSize: "var(--pds-fs-label)", color: "var(--pds-text-secondary)", flex: 1, minWidth: 80 }}>{s.courier ?? s.owner ?? "—"}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {SHIP_STAGES.map((label, i) => (
                    <span key={label} title={label} style={{
                      width: 9, height: 9, borderRadius: "50%",
                      background: i <= stage ? (i === stage ? "var(--pds-gold)" : "var(--pds-active)") : "var(--pds-surface-3)",
                    }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ── Request support (→ operations_requests) ─────────────────────────────────
const REQUEST_CATEGORIES: { key: string; label: string; icon: string; accent?: boolean }[] = [
  { key: "immigration", label: "Immigration", icon: "id-badge" },
  { key: "bunkering", label: "Bunkering", icon: "droplet" },
  { key: "berthing", label: "Berthing", icon: "building-lighthouse" },
  { key: "visa", label: "Visa", icon: "file-certificate" },
  { key: "technical", label: "Technical", icon: "tool" },
  { key: "logistics", label: "Logistics", icon: "truck-delivery" },
  { key: "provisioning", label: "Provisioning", icon: "package" },
  { key: "crew_care", label: "Crew Care", icon: "heart-rate-monitor", accent: true },
];

function RequestSupportSection({ yachtId }: { yachtId: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} disabled={!yachtId} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        background: "var(--pds-gold-muted)", border: "1px solid var(--pds-border-gold)",
        color: "var(--pds-gold-light)", fontFamily: "var(--pds-font-display)",
        fontSize: "var(--pds-fs-card-title)", fontWeight: 600, padding: "12px 16px",
        borderRadius: "var(--pds-radius-lg)", cursor: yachtId ? "pointer" : "not-allowed",
      }}>
        <TIcon name="plus" size={16} /> Request support from our Port &amp; Agency Team
      </button>
      {open && <RequestSupportModal yachtId={yachtId} onClose={() => setOpen(false)} />}
    </>
  );
}

function RequestSupportModal({ yachtId, onClose }: { yachtId: string | null; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("routine");
  const [requiredDate, setRequiredDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!yachtId || !category || !description.trim()) return;
    setBusy(true); setError(null);
    const { error } = await (supabase as any).from("operations_requests").insert({
      yacht_id: yachtId,
      submitted_by: user?.id ?? null,
      category,
      description: description.trim(),
      priority,
      required_date: requiredDate || null,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    toast("Request submitted to our Port & Agency Team", "success");
    onClose();
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 10000, background: "rgba(4,14,20,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} className="pds" style={{
        width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto",
        background: "var(--pds-navy-mid)", border: "1px solid var(--pds-border-gold)",
        borderRadius: "var(--pds-radius-xl)", padding: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <TIcon name="lifebuoy" size={18} color="var(--pds-gold-light)" />
          <span style={{ fontFamily: "var(--pds-font-display)", fontSize: "var(--pds-fs-title)", fontWeight: 600, color: "var(--pds-text)" }}>Request support</span>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <TIcon name="x" size={18} color="var(--pds-text-secondary)" />
          </button>
        </div>

        <div style={{ fontSize: "var(--pds-fs-section)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--pds-text-hint)", marginBottom: 8 }}>Category</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8, marginBottom: 16 }}>
          {REQUEST_CATEGORIES.map((c) => {
            const on = category === c.key;
            const accent = c.accent ? "var(--pds-expiring)" : "var(--pds-gold-light)";
            return (
              <button key={c.key} onClick={() => setCategory(c.key)} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 6px",
                background: on ? "var(--pds-gold-muted)" : "var(--pds-surface-2)",
                border: `1px solid ${on ? "var(--pds-border-gold-strong)" : "var(--pds-border)"}`,
                borderRadius: "var(--pds-radius-md)", cursor: "pointer",
              }}>
                <TIcon name={c.icon} size={20} color={accent} />
                <span style={{ fontSize: "var(--pds-fs-label)", fontWeight: 500, color: "var(--pds-text)" }}>{c.label}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: "var(--pds-fs-label)", color: "var(--pds-text-secondary)", fontWeight: 500 }}>Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What do you need from the team?"
              style={{ resize: "vertical", background: "var(--pds-surface-2)", border: "1px solid var(--pds-border)", borderRadius: "var(--pds-radius-md)", color: "var(--pds-text)", fontSize: "var(--pds-fs-body)", padding: "8px 10px", fontFamily: "var(--pds-font-body)" }} />
          </label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 160 }}>
              <span style={{ fontSize: "var(--pds-fs-label)", color: "var(--pds-text-secondary)", fontWeight: 500 }}>Priority</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}
                style={{ background: "var(--pds-surface-2)", border: "1px solid var(--pds-border)", borderRadius: "var(--pds-radius-md)", color: "var(--pds-text)", fontSize: "var(--pds-fs-body)", padding: "8px 10px" }}>
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="emergency">Emergency</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 160 }}>
              <span style={{ fontSize: "var(--pds-fs-label)", color: "var(--pds-text-secondary)", fontWeight: 500 }}>Required by (optional)</span>
              <input type="date" value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)}
                style={{ background: "var(--pds-surface-2)", border: "1px solid var(--pds-border)", borderRadius: "var(--pds-radius-md)", color: "var(--pds-text)", fontSize: "var(--pds-fs-body)", padding: "8px 10px" }} />
            </label>
          </div>

          {error && <div style={{ fontSize: "var(--pds-fs-label)", color: "var(--pds-expired)" }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button onClick={onClose} disabled={busy} style={{ background: "var(--pds-surface-3)", border: "1px solid var(--pds-border)", color: "var(--pds-text-secondary)", fontSize: "var(--pds-fs-body)", fontWeight: 600, padding: "8px 16px", borderRadius: "var(--pds-radius-full)", cursor: "pointer" }}>Cancel</button>
            <button onClick={submit} disabled={busy || !category || !description.trim()} style={{
              background: (!category || !description.trim()) ? "var(--pds-surface-3)" : "var(--pds-gold)",
              border: "none", color: "var(--pds-navy-deep)", fontSize: "var(--pds-fs-body)", fontWeight: 700,
              padding: "8px 18px", borderRadius: "var(--pds-radius-full)", cursor: busy ? "wait" : "pointer",
            }}>{busy ? "Submitting…" : "Submit request"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Module grid ─────────────────────────────────────────────────────────────
const MODULE_TILES: { label: string; icon: string; screen: string }[] = [
  { label: "Crew", icon: "users", screen: "crew" },
  { label: "Immigration", icon: "id-badge", screen: "immigration" },
  { label: "ShipSync", icon: "package", screen: "logistics" },
  { label: "Anchor", icon: "signature", screen: "anchor" },
  { label: "Port Calls", icon: "anchor", screen: "port-calls" },
  { label: "Orbit", icon: "orbit", screen: "orbit" },
  { label: "Yacht IT", icon: "cpu", screen: "yacht-it" },
  { label: "Visa Reports", icon: "file-description", screen: "visa-reports" },
];

function ModuleGrid({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
      {MODULE_TILES.map((t) => (
        <button key={t.screen} onClick={() => onNavigate?.(t.screen)} disabled={!onNavigate} style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 6px",
          background: "var(--pds-surface-2)", border: "1px solid var(--pds-border)",
          borderRadius: "var(--pds-radius-md)", cursor: onNavigate ? "pointer" : "default",
        }}>
          <TIcon name={t.icon} size={20} color="var(--pds-gold-light)" />
          <span style={{ fontSize: "var(--pds-fs-label)", fontWeight: 500, color: "var(--pds-text)" }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Hub ─────────────────────────────────────────────────────────────────────
export function CaptainHub({ yacht, onSwitchVessel, onNavigate }: {
  yacht: YachtOption | null;
  onSwitchVessel: () => void;
  onNavigate?: (screen: string) => void;
}) {
  const yachtId = yacht?.id ?? null;
  const detail = useYachtDetail(yachtId);
  const visa = useVesselVisaData(yachtId);
  const logistics = useVesselLogistics(yacht?.vessel_name ?? null);

  const loading = visa.loading || logistics.loading;
  const crewOnboard = visa.counts.total;
  const visaAlerts = visa.counts.expiring + visa.counts.expired + visa.counts.noVisa;
  const permitDays = daysUntil(detail?.cruising_permit_expiry);
  const expiringPermits = permitDays !== null && permitDays >= 0 && permitDays <= 30 ? 1 : 0;
  const shipmentsInTransit = logistics.counts.inTransit;

  const alerts = useMemo(() => {
    const list: DashAlert[] = [];
    for (const r of visa.rows) {
      if (r.status === "expired") list.push({ id: `visa-${r.crewId}`, label: `${r.name} — Visa`, detail: `Expired ${r.daysOverdue ?? 0}d ago`, severity: "red" });
      else if (r.status === "expiring_soon") { const d = r.daysRemaining ?? 0; list.push({ id: `visa-${r.crewId}`, label: `${r.name} — Visa`, detail: `Expires in ${d}d`, severity: d <= 7 ? "red" : "amber" }); }
      else if (r.status === "no_visa") list.push({ id: `visa-${r.crewId}`, label: `${r.name} — Visa`, detail: "No active visa", severity: "red" });
    }
    for (const s of logistics.rows) {
      if (String(s.status).toLowerCase().includes("hold")) list.push({ id: `ship-${s.id}`, label: `${s.barcode ?? "Shipment"} — Customs hold`, detail: s.courier ?? "Held", severity: "amber" });
    }
    const order: Record<Severity, number> = { red: 0, amber: 1, grey: 2 };
    return list.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [visa.rows, logistics.rows]);

  return (
    <div className="pds pds-fade" style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1100 }}>
      <VesselBanner yacht={detail} onSwitchVessel={onSwitchVessel} />

      <div className="pds-stats-grid">
        <MetricCard label="Crew Onboard" value={loading ? "…" : crewOnboard} icon="users" color="var(--pds-gold-light)" />
        <MetricCard label="Visa Alerts" value={loading ? "…" : visaAlerts} icon="id-badge" color={visaAlerts > 0 ? "var(--pds-expired)" : "var(--pds-active)"} />
        <MetricCard label="Expiring Permits" value={expiringPermits} icon="file-certificate" color={expiringPermits > 0 ? "var(--pds-expiring)" : "var(--pds-text)"} />
        <MetricCard label="SOA Balance" value="—" icon="report-money" color="var(--pds-text-secondary)" />
        <MetricCard label="Shipments" value={loading ? "…" : shipmentsInTransit} icon="package" color="var(--pds-text)" />
        <MetricCard label="IT Tickets" value="—" icon="cpu" color="var(--pds-text-secondary)" />
      </div>

      <div className="pds-grid-2">
        <AlertsPanel alerts={alerts} loading={loading} />
        <CrewManifestPanel yachtId={yachtId} />
      </div>

      <VisaCentrePanel yachtId={yachtId} />
      <ShipSyncPanel vesselName={yacht?.vessel_name ?? null} />
      <RequestSupportSection yachtId={yachtId} />
      <ModuleGrid onNavigate={onNavigate} />

      <p style={{ fontSize: "var(--pds-fs-label)", color: "var(--pds-text-hint)", margin: "2px 0 0" }}>
        SOA balance and IT tickets connect once the Finance and Yacht-IT vessel feeds are wired.
        Support requests are saved to operations_requests (migration 20260702090000 must be applied).
      </p>
    </div>
  );
}

export default CaptainHub;
