import { createFileRoute } from "@tanstack/react-router";
import { ResourcePage, type ResourceConfig } from "@/components/resource-page";
import { GraduationCap } from "lucide-react";

const config: ResourceConfig = {
  table: "training_records",
  title: "Training Records",
  breadcrumb: "JLS Training Institute",
  singular: "Record",
  icon: <GraduationCap className="h-4 w-4 text-primary/80" />,
  statusKey: "status",
  emptyHint: "Track crew course enrolments, progress and completions.",
  orderBy: { col: "start_date", asc: false },
  statusLabels: { enrolled: "Enrolled", in_progress: "In Progress", completed: "Completed", failed: "Failed" },
  statusColors: {
    enrolled: "bg-blue-500/15 text-blue-500", in_progress: "bg-amber-500/15 text-amber-500",
    completed: "bg-emerald-500/15 text-emerald-500", failed: "bg-red-500/15 text-red-500",
  },
  fields: [
    { key: "crew_name", label: "Crew Member", required: true, table: true },
    { key: "course", label: "Course", required: true, table: true },
    { key: "provider", label: "Provider", table: true },
    { key: "status", label: "Status", type: "select", table: true, badge: true, options: ["enrolled", "in_progress", "completed", "failed"] },
    { key: "start_date", label: "Start Date", type: "date", table: true },
    { key: "completion_date", label: "Completed", type: "date", table: true },
    { key: "certificate_no", label: "Certificate No.", mono: true },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

export const Route = createFileRoute("/_app/training/")({
  component: () => <ResourcePage config={config} />,
  head: () => ({ meta: [{ title: "Training Records — Polaris" }] }),
});
