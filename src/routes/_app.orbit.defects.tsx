import { createFileRoute } from "@tanstack/react-router";
import { ResourcePage, type ResourceConfig } from "@/components/resource-page";
import { Wrench } from "lucide-react";

const config: ResourceConfig = {
  table: "orbit_defects",
  title: "Defects & Repairs",
  breadcrumb: "Orbit / Operations",
  singular: "Defect",
  icon: <Wrench className="h-4 w-4 text-primary/80" />,
  statusKey: "status",
  emptyHint: "Log vessel defects and track them through to repair.",
  orderBy: { col: "reported_date", asc: false },
  statusLabels: { open: "Open", in_progress: "In Progress", awaiting_parts: "Awaiting Parts", resolved: "Resolved" },
  statusColors: {
    open: "bg-red-500/15 text-red-500", in_progress: "bg-amber-500/15 text-amber-500",
    awaiting_parts: "bg-violet-500/15 text-violet-500", resolved: "bg-emerald-500/15 text-emerald-500",
    critical: "bg-red-500/15 text-red-500", major: "bg-amber-500/15 text-amber-500", minor: "bg-slate-500/15 text-slate-400",
  },
  fields: [
    { key: "title", label: "Defect", required: true, table: true, full: true },
    { key: "yacht_id", label: "Vessel", type: "yacht", table: true },
    { key: "system_area", label: "System / Area", type: "select", table: true,
      options: ["Engine", "Deck", "Electrical", "Plumbing", "HVAC", "Hull", "Navigation", "Other"] },
    { key: "severity", label: "Severity", type: "select", table: true, badge: true, options: ["critical", "major", "minor"] },
    { key: "status", label: "Status", type: "select", table: true, badge: true, options: ["open", "in_progress", "awaiting_parts", "resolved"] },
    { key: "reported_by", label: "Reported By" },
    { key: "reported_date", label: "Reported", type: "date", table: true },
    { key: "target_date", label: "Target Date", type: "date", table: true },
    { key: "description", label: "Description", type: "textarea" },
  ],
};

export const Route = createFileRoute("/_app/orbit/defects")({
  component: () => <ResourcePage config={config} />,
  head: () => ({ meta: [{ title: "Defects & Repairs — Polaris" }] }),
});
