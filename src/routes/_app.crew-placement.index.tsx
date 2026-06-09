import { createFileRoute } from "@tanstack/react-router";
import { ResourcePage, type ResourceConfig } from "@/components/resource-page";
import { UserPlus } from "lucide-react";

const config: ResourceConfig = {
  table: "placement_candidates",
  title: "Crew Placement",
  breadcrumb: "Crew Placement / Candidates",
  singular: "Candidate",
  icon: <UserPlus className="h-4 w-4 text-primary/80" />,
  statusKey: "availability",
  emptyHint: "Build a pool of crew candidates and match them to vessel vacancies.",
  orderBy: { col: "created_at", asc: false },
  statusLabels: { available: "Available", interviewing: "Interviewing", placed: "Placed", unavailable: "Unavailable" },
  statusColors: {
    available: "bg-emerald-500/15 text-emerald-500", interviewing: "bg-amber-500/15 text-amber-500",
    placed: "bg-blue-500/15 text-blue-500", unavailable: "bg-slate-500/15 text-slate-400",
  },
  fields: [
    { key: "full_name", label: "Full Name", required: true, table: true },
    { key: "rank", label: "Rank / Position", table: true },
    { key: "department", label: "Department" },
    { key: "nationality", label: "Nationality", table: true },
    { key: "availability", label: "Availability", type: "select", table: true, badge: true,
      options: ["available", "interviewing", "placed", "unavailable"] },
    { key: "experience_years", label: "Experience (yrs)", type: "number", table: true },
    { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone" },
    { key: "current_vessel", label: "Current Vessel" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

export const Route = createFileRoute("/_app/crew-placement/")({
  component: () => <ResourcePage config={config} />,
  head: () => ({ meta: [{ title: "Crew Placement — Polaris" }] }),
});
