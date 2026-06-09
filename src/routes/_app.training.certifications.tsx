import { createFileRoute } from "@tanstack/react-router";
import { ResourcePage, type ResourceConfig } from "@/components/resource-page";
import { FileCheck2 } from "lucide-react";

const config: ResourceConfig = {
  table: "training_certifications",
  title: "Certifications",
  breadcrumb: "JLS Training Institute",
  singular: "Certification",
  icon: <FileCheck2 className="h-4 w-4 text-primary/80" />,
  statusKey: "status",
  emptyHint: "Track crew certifications and their expiry dates (STCW, medical, safety, flag).",
  orderBy: { col: "expiry_date", asc: true },
  statusLabels: { valid: "Valid", expiring: "Expiring", expired: "Expired" },
  statusColors: {
    valid: "bg-emerald-500/15 text-emerald-500", expiring: "bg-amber-500/15 text-amber-500", expired: "bg-red-500/15 text-red-500",
  },
  fields: [
    { key: "crew_name", label: "Crew Member", required: true, table: true },
    { key: "certificate", label: "Certificate", required: true, table: true },
    { key: "cert_type", label: "Type", type: "select", table: true, options: ["stcw", "medical", "safety", "flag", "other"] },
    { key: "issuing_body", label: "Issuing Body", table: true },
    { key: "issue_date", label: "Issued", type: "date" },
    { key: "expiry_date", label: "Expiry", type: "date", table: true },
    { key: "status", label: "Status", type: "select", table: true, badge: true, options: ["valid", "expiring", "expired"] },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

export const Route = createFileRoute("/_app/training/certifications")({
  component: () => <ResourcePage config={config} />,
  head: () => ({ meta: [{ title: "Certifications — Polaris" }] }),
});
