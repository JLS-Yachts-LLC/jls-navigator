import { Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import "@/components/polaris-ui/tokens.css";
import { PolarisShell, navItemForScreen, activeScreenForPath } from "@/components/polaris-ui/shell";
import { ViewAsBanner } from "@/components/view-as-banner";
import { LeoBubble } from "@/components/leo-bubble";
import { DeployWatcher } from "@/components/deploy-watcher";
import { WorkingIndicator } from "@/components/working-indicator";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { recordVisit } from "@/lib/recent-tabs";
import { recordAction, installErrorCapture } from "@/lib/action-log";
import { installErrorLogging, setLogUser } from "@/lib/error-logger";

// The classic sidebar + top-bar chrome is retired: every app route renders
// inside the Polaris shell (see git history for the previous layout markup).

export function AppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // Portal captains (client logins) never see the staff app — RLS already
  // blanks all staff data for them; this just lands them somewhere useful.
  useEffect(() => {
    if (!user) return;
    (supabase as any)
      .from("captain_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("active", true)
      .limit(1)
      .then(({ data }: any) => {
        if (data?.length) window.location.assign("/portal");
      });
  }, [user]);

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
  // The ShipSync standalone apps (driver PWA, parcel checker, logistics app) render
  // full-screen without the office chrome, but in the new Polaris theme — the
  // `pds dark pds-embed` scope remaps the tokens to the brand navy/teal (same as
  // the captain portal), so they match the shell instead of the base black theme.
  const SHIPSYNC_STANDALONE = ["/shipsync/driver", "/shipsync/checker", "/shipsync/logistics"];
  if (SHIPSYNC_STANDALONE.some((p) => location.pathname.startsWith(p))) {
    return (
      <>
        <DeployWatcher />
        <div className="pds dark pds-embed h-screen overflow-y-auto bg-background text-foreground" style={{ colorScheme: "dark" }}>
          <Outlet />
        </div>
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
