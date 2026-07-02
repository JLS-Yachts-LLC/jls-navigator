/**
 * Polaris Redesign — preview app (#195).
 * Mounts the full new design system (shell + dashboard + visa reports) at
 * /polaris-redesign so it's deployable and reviewable WITHOUT touching the live
 * dashboard or restyling existing modules. Promote to the real dashboard when signed off.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { LeoChat } from "@/components/leo/LeoChat";
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
  PolarisCompliance,
  PolarisSignOnOff,
  PolarisTraining,
  PolarisCrewDocuments,
  PolarisSosoReports,
  PolarisSettings,
} from "@/components/polaris-ui/screens";
import { useYachts, type YachtOption } from "@/components/polaris-ui/data";
import { YachtItSolutionsPage } from "@/components/yacht-it/yacht-it-solutions-page";
import { ImmigrationHub } from "@/components/crew-immigration/immigration-hub";
import { VesselsHub } from "@/components/vessels/vessels-hub";
import { CrewListPage } from "@/components/crew-immigration/crew-list-page";
import { CrewProfilePage } from "@/components/crew-immigration/crew-profile-page";
import { AnchorPage } from "@/components/anchor/anchor-page";
import { ShipSyncPage } from "@/components/shipsync-page";
import { FinancePage } from "@/components/finance/finance-page";
import { DevSettingsPage } from "@/components/dev/dev-settings-page";
import { ChangelogPage } from "@/components/changelog-page";
import { AutomationsPage } from "@/components/automations/automations-page";
import { ErrorLogPage } from "@/components/dev/error-log-page";
import { IntegrationsPage } from "@/components/dev/integrations-page";
import { FeedbackPage } from "@/components/feedback/feedback-page";
import { CrewPlacementPage } from "@/components/crew-placement/crew-placement-page";
import { PortCallsHub } from "@/components/port-calls/PortCallsHub";
import { OrbitHub } from "@/components/orbit/orbit-hub";

/** Beta screens that simply embed an existing full app page (Beta styling is inherited
 *  from the shell's pds-embed content area). */
const EMBED_SCREENS: Record<string, React.ComponentType> = {
  finance: FinancePage,
  "crew-placement": CrewPlacementPage,
  "admin-dev": DevSettingsPage,
  "admin-changelog": ChangelogPage,
  "admin-automations": AutomationsPage,
  "admin-errors": ErrorLogPage,
  "admin-integrations": IntegrationsPage,
  "admin-feedback": FeedbackPage,
};

export const Route = createFileRoute("/_app/polaris-redesign")({
  component: PolarisRedesignApp,
  head: () => ({ meta: [{ title: "Polaris — Redesign Preview" }] }),
});

const LAST_VESSEL = "polaris.redesign.lastVessel";

function PolarisRedesignApp() {
  const { user, session } = useAuth();
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

  // Start collapsed — Leo's chat opens only when the user clicks the LEO pill,
  // so it doesn't pop open on every page load / refresh.
  const [leoOpen, setLeoOpen] = useState(false);
  const leoToken = session?.access_token ?? "";

  return (
    <ToastProvider>
      {/* ── Leo floating agent — fixed bottom-right, outside shell flow ──
           This is the ASK-LEO chat (not the briefing). The morning brief lives
           inline on the dashboard; here the user types questions about the app. ── */}
      {leoToken && (
        <div
          style={{
            position:  "fixed",
            bottom:    24,
            right:     24,
            width:     leoOpen ? 420 : "auto",
            zIndex:    9999,
            display:   "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap:        0,
            filter:    "drop-shadow(0 8px 32px rgba(0,0,0,0.55))",
          }}
        >
          {leoOpen && (
            <div style={{ width: "100%", height: "min(70vh, 520px)", marginBottom: 0 }}>
              <LeoChat
                token={leoToken}
                userName={user?.email ?? ""}
              />
            </div>
          )}
          {/* Toggle pill */}
          <button
            onClick={() => setLeoOpen(o => !o)}
            style={{
              marginTop:     leoOpen ? 6 : 0,
              display:       "flex",
              alignItems:    "center",
              gap:            6,
              background:    "#0D1520",
              border:        "1px solid #1E4060",
              borderRadius:  20,
              padding:       "6px 14px 6px 10px",
              cursor:        "pointer",
              fontFamily:    "'Space Grotesk', sans-serif",
              fontSize:      12,
              fontWeight:    700,
              color:         "#E8A020",
              letterSpacing: "0.12em",
              boxShadow:     "0 2px 12px rgba(0,0,0,0.4)",
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: "#E8A020", display: "inline-block",
              animation: "pulse 2s ease-in-out infinite",
            }} />
            LEO
            <span style={{
              fontSize: 10, color: "#3A5570", fontWeight: 400,
              marginLeft: 2,
            }}>
              {leoOpen ? "▾" : "▴"}
            </span>
          </button>
        </div>
      )}

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
            leoToken={leoToken}
            userName={user?.email ?? ""}
          />
        ) : screen === "crew" ? (
          <div style={{ height: "100%" }}>
            <BetaCrewScreen />
          </div>
        ) : screen === "compliance" ? (
          <PolarisCompliance
            yacht={yacht}
            onSwitchVessel={() => setSwitcher(true)}
          />
        ) : screen === "vessels" ? (
          // Vessel Overview (with SharePoint images) + Live Tracking, tabbed.
          // Beta styling inherited from the shell's pds-embed content area.
          <div style={{ height: "100%" }}>
            <VesselsHub />
          </div>
        ) : screen === "soso" ? (
          <PolarisSignOnOff
            yacht={yacht}
            onSwitchVessel={() => setSwitcher(true)}
          />
        ) : screen === "immigration" ? (
          // Real Visa + Sign On/Off pages, tabbed. Beta styling comes from the
          // shell's `pds-embed` content area (see PolarisShell).
          <div style={{ height: "100%" }}>
            <ImmigrationHub />
          </div>
        ) : screen === "logistics" ? (
          <div style={{ height: "100%" }}>
            <ShipSyncPage />
          </div>
        ) : screen === "training" ? (
          <PolarisTraining yacht={yacht} onSwitchVessel={() => setSwitcher(true)} />
        ) : screen === "documents" ? (
          <PolarisCrewDocuments yacht={yacht} onSwitchVessel={() => setSwitcher(true)} />
        ) : screen === "soso-reports" ? (
          <PolarisSosoReports yacht={yacht} onSwitchVessel={() => setSwitcher(true)} />
        ) : screen === "settings" ? (
          <PolarisSettings />
        ) : screen === "yacht-it" ? (
          // Beta styling comes from the shell's `pds-embed` content area.
          <div style={{ height: "100%" }}>
            <YachtItSolutionsPage />
          </div>
        ) : screen === "anchor" ? (
          <div style={{ height: "100%" }}>
            <AnchorPage />
          </div>
        ) : screen === "port-calls" ? (
          <div style={{ height: "100%" }}>
            <PortCallsHub />
          </div>
        ) : screen === "orbit" ? (
          <div style={{ height: "100%" }}>
            <OrbitHub />
          </div>
        ) : EMBED_SCREENS[screen] ? (
          <div style={{ height: "100%" }}>
            {(() => { const C = EMBED_SCREENS[screen]; return <C />; })()}
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
    </ToastProvider>
  );
}

/** Crew screen for the Beta shell: list ↔ profile via local state, so viewing a
 *  crew profile stays inside the Beta view instead of routing to /_app. */
function BetaCrewScreen() {
  const [crewId, setCrewId] = useState<string | null>(null);
  return crewId ? (
    <CrewProfilePage crewId={crewId} embedded onBack={() => setCrewId(null)} />
  ) : (
    <CrewListPage onOpenCrew={setCrewId} />
  );
}
