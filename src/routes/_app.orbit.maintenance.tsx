import { createFileRoute } from "@tanstack/react-router";
import { ResourcePage, type ResourceConfig } from "@/components/resource-page";
import { Wrench } from "lucide-react";

const config: ResourceConfig = {
  table: "orbit_maintenance",
  title: "Planned Maintenance",
  breadcrumb: "Orbit / Operations",
  singular: "Task",
  icon: <Wrench className="h-4 w-4 text-primary/80" />,
  statusKey: "status",
  emptyHint: "Schedule planned maintenance by calendar or running hours and track what's due.",
  orderBy: { col: "next_due", asc: true },
  statusLabels: { scheduled: "Scheduled", due: "Due", overdue: "Overdue", completed: "Completed" },
  statusColors: {
    scheduled: "bg-blue-500/15 text-blue-500", due: "bg-amber-500/15 text-amber-500",
    overdue: "bg-red-500/15 text-red-500", completed: "bg-emerald-500/15 text-emerald-500",
  },
  fields: [
    { key: "task", label: "Task", required: true, table: true, full: true },
    { key: "yacht_id", label: "Vessel", type: "yacht", table: true },
    { key: "component", label: "Component", table: true },
    { key: "interval_type", label: "Interval Type", type: "select", options: ["calendar", "running_hours"] },
    { key: "frequency", label: "Frequency", table: true, placeholder: "e.g. Every 250 hrs / Monthly" },
    { key: "last_done", label: "Last Done", type: "date" },
    { key: "next_due", label: "Next Due", type: "date", table: true },
    { key: "status", label: "Status", type: "select", table: true, badge: true, options: ["scheduled", "due", "overdue", "completed"] },
    { key: "assigned_to", label: "Assigned To", table: true },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

export const Route = createFileRoute("/_app/orbit/maintenance")({
  component: () => <ResourcePage config={config} />,
  head: () => ({ meta: [{ title: "Planned Maintenance — Polaris" }] }),
});
