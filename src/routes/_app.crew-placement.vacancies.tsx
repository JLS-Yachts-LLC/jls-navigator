import { createFileRoute } from "@tanstack/react-router";
import { ResourcePage, type ResourceConfig } from "@/components/resource-page";
import { Briefcase } from "lucide-react";

const config: ResourceConfig = {
  table: "placement_vacancies",
  title: "Vacancies",
  breadcrumb: "Crew Placement / Vacancies",
  singular: "Vacancy",
  icon: <Briefcase className="h-4 w-4 text-primary/80" />,
  statusKey: "status",
  emptyHint: "Track open positions across the fleet and their hiring status.",
  orderBy: { col: "created_at", asc: false },
  statusLabels: { open: "Open", shortlisting: "Shortlisting", filled: "Filled", closed: "Closed" },
  statusColors: {
    open: "bg-emerald-500/15 text-emerald-500", shortlisting: "bg-amber-500/15 text-amber-500",
    filled: "bg-blue-500/15 text-blue-500", closed: "bg-slate-500/15 text-slate-400",
  },
  fields: [
    { key: "position", label: "Position", required: true, table: true },
    { key: "yacht_id", label: "Vessel", type: "yacht", table: true },
    { key: "department", label: "Department", table: true },
    { key: "status", label: "Status", type: "select", table: true, badge: true, options: ["open", "shortlisting", "filled", "closed"] },
    { key: "salary_range", label: "Salary Range" },
    { key: "start_date", label: "Start Date", type: "date", table: true },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

export const Route = createFileRoute("/_app/crew-placement/vacancies")({
  component: () => <ResourcePage config={config} />,
  head: () => ({ meta: [{ title: "Vacancies — Polaris" }] }),
});
