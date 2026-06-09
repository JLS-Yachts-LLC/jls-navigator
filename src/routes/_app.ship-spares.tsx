import { createFileRoute } from "@tanstack/react-router";
import { ResourcePage, type ResourceConfig } from "@/components/resource-page";
import { Package } from "lucide-react";

const config: ResourceConfig = {
  table: "ship_spares",
  title: "Ship Spares In Transit",
  breadcrumb: "ShipSync / Logistics",
  singular: "Spare",
  icon: <Package className="h-4 w-4 text-primary/80" />,
  statusKey: "status",
  emptyHint: "Track ship spares and parts from order through customs to delivery on board.",
  orderBy: { col: "eta", asc: true },
  statusLabels: { ordered: "Ordered", in_transit: "In Transit", customs: "Customs", delivered: "Delivered", delayed: "Delayed" },
  statusColors: {
    ordered: "bg-blue-500/15 text-blue-500", in_transit: "bg-amber-500/15 text-amber-500",
    customs: "bg-violet-500/15 text-violet-500", delivered: "bg-emerald-500/15 text-emerald-500",
    delayed: "bg-red-500/15 text-red-500",
  },
  fields: [
    { key: "description", label: "Description", required: true, table: true, full: true },
    { key: "yacht_id", label: "Vessel", type: "yacht", table: true },
    { key: "part_number", label: "Part No.", table: true, mono: true },
    { key: "supplier", label: "Supplier", table: true },
    { key: "courier", label: "Courier" },
    { key: "tracking_number", label: "Tracking No.", mono: true },
    { key: "origin", label: "Origin" },
    { key: "destination", label: "Destination" },
    { key: "status", label: "Status", type: "select", table: true, badge: true, options: ["ordered", "in_transit", "customs", "delivered", "delayed"] },
    { key: "eta", label: "ETA", type: "date", table: true },
    { key: "customs_ref", label: "Customs Ref" },
    { key: "notes", label: "Notes", type: "textarea" },
  ],
};

export const Route = createFileRoute("/_app/ship-spares")({
  component: () => <ResourcePage config={config} />,
  head: () => ({ meta: [{ title: "Ship Spares — Polaris" }] }),
});
