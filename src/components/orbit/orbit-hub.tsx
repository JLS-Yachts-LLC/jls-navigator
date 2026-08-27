/**
 * OrbitHub — ORBIT entry point for the New View.
 *
 * Tabs (Projects, Service Requests, Defects & Repairs, Planned Maintenance)
 * mirror the standalone Old View routes under /orbit/*. Projects and Service
 * Requests each go list <-> detail via local state instead of router
 * navigation, so the whole ORBIT flow stays inside the Polaris shell
 * (mirrors src/components/port-calls/PortCallsHub.tsx and the crew screen
 * in src/routes/_app.polaris-redesign.tsx). Defects/Maintenance are the
 * generic ResourcePage — already route-independent, embedded as-is.
 */
import { useState } from "react";
import { ResourcePage } from "@/components/resource-page";
import { ProjectsPage } from "./projects-page";
import { ProjectDetailPage } from "./project-detail-page";
import { OrbitRequestsPage } from "./orbit-requests-page";
import { OrbitRequestDetailPage } from "./orbit-request-detail-page";
import { ORBIT_DEFECTS_CONFIG, ORBIT_MAINTENANCE_CONFIG } from "./orbit-resource-configs";
import { OrbitBoatsHub } from "./orbit-boats-hub";
import { OrbitApprovalsPage } from "./orbit-approvals-page";
import { LayoutGrid, ClipboardList, Wrench, CalendarClock, Ship, ShieldCheck } from "lucide-react";

type Tab = "projects" | "requests" | "approvals" | "defects" | "maintenance" | "boats";
const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "projects", label: "Projects", icon: LayoutGrid },
  { key: "requests", label: "Service Requests", icon: ClipboardList },
  { key: "approvals", label: "Approvals", icon: ShieldCheck },
  { key: "defects", label: "Defects & Repairs", icon: Wrench },
  { key: "maintenance", label: "Planned Maintenance", icon: CalendarClock },
  { key: "boats", label: "Small Boats", icon: Ship },
];

type ProjectsView = { mode: "list" } | { mode: "detail"; projectId: string };
type RequestsView = { mode: "list" } | { mode: "detail"; requestId: string };

export function OrbitHub() {
  const [tab, setTab] = useState<Tab>("requests");
  const [projectsView, setProjectsView] = useState<ProjectsView>({ mode: "list" });
  const [requestsView, setRequestsView] = useState<RequestsView>({ mode: "list" });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border px-6">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition ${tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "projects" && (
          projectsView.mode === "detail" ? (
            <ProjectDetailPage
              projectId={projectsView.projectId}
              embedded
              onBack={() => setProjectsView({ mode: "list" })}
            />
          ) : (
            <ProjectsPage onOpenProject={(projectId) => setProjectsView({ mode: "detail", projectId })} />
          )
        )}

        {tab === "requests" && (
          requestsView.mode === "detail" ? (
            <OrbitRequestDetailPage
              requestId={requestsView.requestId}
              embedded
              onBack={() => setRequestsView({ mode: "list" })}
            />
          ) : (
            <OrbitRequestsPage onOpenRequest={(requestId) => setRequestsView({ mode: "detail", requestId })} />
          )
        )}

        {tab === "approvals" && (
          <div className="h-full overflow-auto"><OrbitApprovalsPage /></div>
        )}

        {tab === "defects" && (
          <div className="h-full overflow-auto">
            <ResourcePage config={ORBIT_DEFECTS_CONFIG} />
          </div>
        )}

        {tab === "maintenance" && (
          <div className="h-full overflow-auto">
            <ResourcePage config={ORBIT_MAINTENANCE_CONFIG} />
          </div>
        )}

        {tab === "boats" && <OrbitBoatsHub />}
      </div>
    </div>
  );
}

export default OrbitHub;
