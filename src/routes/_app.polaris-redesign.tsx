/**
 * Polaris Redesign — preview app (#195).
 * Mounts the full new design system (shell + dashboard + visa reports) at
 * /polaris-redesign so it's deployable and reviewable WITHOUT touching the live
 * dashboard or restyling existing modules. Promote to the real dashboard when signed off.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { LeoPanel } from "@/components/leo/LeoPanel";
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
          <>
            <LeoPanel
              token={session?.access_token ?? ""}
              userName={user?.email ?? ""}
            />
            <PolarisDashboard
              yacht={yacht}
              onSwitchVessel={() => setSwitcher(true)}
              onOpenReports={() => setScreen("visa-reports")}
            />
          </>
        ) : screen === "crew" ? (
          <div style={{ height: "100%" }}>
            <CrewListPage />
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
