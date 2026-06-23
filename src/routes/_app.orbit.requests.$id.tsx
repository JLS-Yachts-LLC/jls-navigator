import { createFileRoute } from "@tanstack/react-router";
import { OrbitRequestDetailPage } from "@/components/orbit/orbit-request-detail-page";

export const Route = createFileRoute("/_app/orbit/requests/$id")({
  component: OrbitRequestDetailPage,
  head: () => ({ meta: [{ title: "Service Request — Orbit — Polaris" }] }),
});
