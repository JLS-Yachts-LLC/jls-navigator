import { createFileRoute } from "@tanstack/react-router";
import { ResourcePage, type ResourceConfig } from "@/components/resource-page";
import { UtensilsCrossed } from "lucide-react";

const config: ResourceConfig = {
  table: "provisioning_orders",
  title: "Superyacht Provisioning",
  breadcrumb: "Superyacht Provisioning",
  singular: "Order",
  icon: <UtensilsCrossed className="h-4 w-4 text-primary/80" />,
  statusKey: "status",
  emptyHint: "Manage food, beverage, interior, floral and special-event provisioning requests.",
  orderBy: { col: "delivery_date", asc: true },
  statusLabels: { requested: "Requested", sourcing: "Sourcing", confirmed: "Confirmed", delivered: "Delivered" },
  statusColors: {
    requested: "bg-blue-500/15 text-blue-500", sourcing: "bg-amber-500/15 text-amber-500",
    confirmed: "bg-violet-500/15 text-violet-500", delivered: "bg-emerald-500/15 text-emerald-500",
  },
  fields: [
    { key: "description", label: "Description", required: true, table: true, full: true },
    { key: "yacht_id", label: "Vessel", type: "yacht", table: true },
    { key: "category", label: "Category", type: "select", table: true, options: ["food", "beverage", "interior", "floral", "special", "event"] },
    { key: "requested_by", label: "Requested By", table: true },
    { key: "status", label: "Status", type: "select", table: true, badge: true, options: ["requested", "sourcing", "confirmed", "delivered"] },
    { key: "delivery_date", label: "Delivery Date", type: "date", table: true },
    { key: "amount", label: "Amount (AED)", type: "number" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

export const Route = createFileRoute("/_app/provisioning")({
  component: () => <ResourcePage config={config} />,
  head: () => ({ meta: [{ title: "Superyacht Provisioning — Polaris" }] }),
});
