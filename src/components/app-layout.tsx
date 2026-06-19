import { Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/top-bar";
import { ViewAsBanner } from "@/components/view-as-banner";
import { RecentTabsBar } from "@/components/recent-tabs-bar";
import { LeoBubble } from "@/components/leo-bubble";
import { WorkingIndicator } from "@/components/working-indicator";
import { useAuth } from "@/lib/auth";
import { recordVisit, getLastRoute } from "@/lib/recent-tabs";
import { recordAction, installErrorCapture } from "@/lib/action-log";

export function AppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const restored = useRef(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // Restore the last route once, on a fresh entry to a default landing.
  useEffect(() => {
    if (restored.current || loading || !user) return;
    restored.current = true;
    const last = getLastRoute();
    if (last && last.startsWith("/") && (location.pathname === "/" || location.pathname === "/dashboard") && last !== location.pathname) {
      navigate({ to: last as any });
    }
  }, [loading, user, location.pathname, navigate]);

  // Capture JS errors once, for the bug-report widget's activity log.
  useEffect(() => { installErrorCapture(); }, []);

  // Track each visited page for "recent tabs" + last-route memory + activity log.
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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <ViewAsBanner />
        <RecentTabsBar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <WorkingIndicator />
      <LeoBubble />
    </div>
  );
}
