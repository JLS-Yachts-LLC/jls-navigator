import { Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import "@/components/polaris-ui/tokens.css";
import { PolarisShell, navItemForScreen, activeScreenForPath } from "@/components/polaris-ui/shell";
import { ViewAsBanner } from "@/components/view-as-banner";
import { LeoBubble } from "@/components/leo-bubble";
import { DeployWatcher } from "@/components/deploy-watcher";
import { WorkingIndicator } from "@/components/working-indicator";
import { useAuth } from "@/lib/auth";
import { recordVisit } from "@/lib/recent-tabs";
import { recordAction, installErrorCapture } from "@/lib/action-log";
import { installErrorLogging, setLogUser } from "@/lib/error-logger";

// The Old View (classic sidebar + top bar) is SHELVED, not deleted: every app
// route now renders inside the Polaris (New View) chrome. Flip this to false to
// bring the old chrome back (see git history for the previous layout markup).
export const OLD_VIEW_SHELVED = true;

export function AppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // Capture JS errors once, for the bug-report widget's activity log + the
  // persistent Developer ▸ Error & Warning Log.
  useEffect(() => { installErrorCapture(); installErrorLogging(); }, []);

  // Keep persisted logs attributable to the signed-in user.
  useEffect(() => { setLogUser(user ?? null); }, [user]);

  // Track each visited page for the activity log.
  useEffect(() => {
    if (user) { recordVisit(location.pathname); recordAction(`Navigated to ${location.pathname}`); }
  }, [location.pathname, user]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return null;

  // The Polaris home screen ships its own shell (screen switching lives inside it).
  if (location.pathname.startsWith("/polaris-redesign")) {
    return (
      <>
        <DeployWatcher />
        <Outlet />
      </>
    );
  }

  // Every other app route renders inside the same Polaris chrome, so deep links
  // and detail pages never surface the old layout. Nav items either navigate to
  // a route or deep-open a screen on the Polaris home via ?screen=.
  return (
    <>
      <DeployWatcher />
      <PolarisShell
        role="global_admin"
        active={activeScreenForPath(location.pathname)}
        onNavigate={(s) => {
          const item = navItemForScreen(s);
          if (item?.route) navigate({ to: item.route as any });
          else navigate({ to: "/polaris-redesign", search: { screen: s } as any });
        }}
        vesselName=""
        userInitials={(user.email ?? "?").slice(0, 2).toUpperCase()}
        userName={user.email ?? "User"}
      >
        <ViewAsBanner />
        <Outlet />
      </PolarisShell>
      <WorkingIndicator />
      <LeoBubble />
    </>
  );
}
