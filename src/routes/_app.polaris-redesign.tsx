/**
 * Polaris Redesign — preview app (#195).
 * Mounts the full new design system (shell + dashboard + visa reports) at
 * /polaris-redesign so it's deployable and reviewable WITHOUT touching the live
 * dashboard or restyling existing modules. Promote to the real dashboard when signed off.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import "@/components/polaris-ui/tokens.css";
import { PolarisShell, type PolarisRole } from "@/components/polaris-ui/shell";
import { ToastProvider } from "@/components/polaris-ui/feedback";
import {
  PolarisButton,
  TIcon,
  EmptyState,
} from "@/components/polaris-ui/primitives";
import {
  PolarisDashboard,
  PolarisVisaReports,
  PolarisCrew,
  PolarisCompliance,
  PolarisVessels,
  PolarisSignOnOff,
  PolarisLogistics,
  PolarisTraining,
  PolarisCrewDocuments,
  PolarisSosoReports,
  PolarisSettings,
} from "@/components/polaris-ui/screens";
import { useYachts, type YachtOption } from "@/components/polaris-ui/data";
import { YachtItSolutionsPage } from "@/components/yacht-it/yacht-it-solutions-page";
import { ImmigrationHub } from "@/components/crew-immigration/immigration-hub";

export const Route = createFileRoute("/_app/polaris-redesign")({
  component: PolarisRedesignApp,
  head: () => ({ meta: [{ title: "Polaris — Redesign Preview" }] }),
});

const LAST_VESSEL = "polaris.redesign.lastVessel";

function PolarisRedesignApp() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { yachts, loading } = useYachts();
  const [screen, setScreen] = useState("dashboard");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [switcher, setSwitcher] = useState(false);

  // Preview runs at the highest role so the whole nav is visible; real enforcement
  // lives on the API routes. Swap to derived claims when promoting to production.
  const role: PolarisRole = "global_admin";

  useEffect(() => {
    if (loading || selectedId) return;
    const stored =
      typeof window !== "undefined"
        ? sessionStorage.getItem(LAST_VESSEL)
        : null;
    const initial =
      (stored && yachts.some((y) => y.id === stored)
        ? stored
        : yachts[0]?.id) ?? null;
    setSelectedId(initial);
  }, [loading, yachts, selectedId]);

  function pickVessel(id: string) {
    setSelectedId(id);
    sessionStorage.setItem(LAST_VESSEL, id);
    setSwitcher(false);
  }

  const yacht: YachtOption | null =
    yachts.find((y) => y.id === selectedId) ?? null;
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <ToastProvider>
      <PolarisShell
        role={role}
        active={screen}
        onNavigate={setScreen}
        vesselName={yacht?.vessel_name ?? "Select vessel"}
        userInitials={initials}
        userName={user?.email ?? "User"}
        onVesselClick={() => setSwitcher(true)}
        onExitBeta={() => navigate({ to: "/dashboard" })}
      >
        {screen === "visa-reports" ? (
          <PolarisVisaReports
            yachts={yachts}
            selectedId={selectedId}
            onSelect={pickVessel}
          />
        ) : screen === "dashboard" ? (
          <PolarisDashboard
            yacht={yacht}
            onSwitchVessel={() => setSwitcher(true)}
            onOpenReports={() => setScreen("visa-reports")}
          />
        ) : screen === "crew" ? (
          <PolarisCrew yacht={yacht} onSwitchVessel={() => setSwitcher(true)} />
        ) : screen === "compliance" ? (
          <PolarisCompliance
            yacht={yacht}
            onSwitchVessel={() => setSwitcher(true)}
          />
        ) : screen === "vessels" ? (
          <PolarisVessels
            yachts={yachts}
            selectedId={selectedId}
            onSelect={pickVessel}
          />
        ) : screen === "soso" ? (
          <PolarisSignOnOff
            yacht={yacht}
            onSwitchVessel={() => setSwitcher(true)}
          />
        ) : screen === "immigration" ? (
          // Real Visa + Sign On/Off pages, tabbed (dark palette for the navy bg).
          <div className="dark" style={{ height: "100%" }}>
            <ImmigrationHub />
          </div>
        ) : screen === "logistics" ? (
          <PolarisLogistics yacht={yacht} onSwitchVessel={() => setSwitcher(true)} />
        ) : screen === "training" ? (
          <PolarisTraining yacht={yacht} onSwitchVessel={() => setSwitcher(true)} />
        ) : screen === "documents" ? (
          <PolarisCrewDocuments yacht={yacht} onSwitchVessel={() => setSwitcher(true)} />
        ) : screen === "soso-reports" ? (
          <PolarisSosoReports yacht={yacht} onSwitchVessel={() => setSwitcher(true)} />
        ) : screen === "settings" ? (
          <PolarisSettings />
        ) : screen === "yacht-it" ? (
          // Embedded app pages use the standard theme tokens; force the dark
          // palette so their text reads correctly on the Beta's navy background.
          <div className="dark" style={{ height: "100%" }}>
            <YachtItSolutionsPage />
          </div>
        ) : (
          <EmptyState
            icon="layout-dashboard"
            message={`The “${screen}” screen is part of the redesign roadmap.`}
            action={{
              label: "Back to dashboard",
              onClick: () => setScreen("dashboard"),
            }}
          />
        )}
      </PolarisShell>

      {/* Vessel switcher overlay */}
      {switcher && (
        <div
          className="pds"
          onClick={() => setSwitcher(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            zIndex: 1300,
            padding: 20,
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              marginTop: 60,
              background: "var(--pds-navy)",
              border: "1px solid var(--pds-border-gold)",
              borderTop: "3px solid var(--pds-gold)",
              borderRadius: "var(--pds-radius-xl)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderBottom: "1px solid var(--pds-border-soft)",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "var(--pds-fs-title)",
                  fontWeight: 600,
                  color: "var(--pds-text)",
                }}
              >
                Switch vessel
              </h3>
              <button
                onClick={() => setSwitcher(false)}
                aria-label="Close"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                <TIcon name="x" size={20} color="var(--pds-text-secondary)" />
              </button>
            </div>
            <div style={{ maxHeight: "60vh", overflowY: "auto", padding: 12 }}>
              {yachts.map((y) => (
                <button
                  key={y.id}
                  onClick={() => pickVessel(y.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px",
                    minHeight: 48,
                    borderRadius: "var(--pds-radius-md)",
                    border: "none",
                    background:
                      y.id === selectedId
                        ? "var(--pds-gold-muted)"
                        : "transparent",
                    color:
                      y.id === selectedId
                        ? "var(--pds-gold-light)"
                        : "var(--pds-text)",
                    fontSize: "var(--pds-fs-body)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <TIcon name="ship" size={16} color="var(--pds-gold)" />
                  {y.vessel_name ?? "Unnamed vessel"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </ToastProvider>
  );
}
