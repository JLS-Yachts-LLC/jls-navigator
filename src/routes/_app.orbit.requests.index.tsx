import { createFileRoute } from "@tanstack/react-router";
import { OrbitRequestsPage } from "@/components/orbit/orbit-requests-page";

export const Route = createFileRoute("/_app/orbit/requests/")({
  component: OrbitRequestsPage,
  head: () => ({ meta: [{ title: "Orbit — Service Requests — Polaris" }] }),
});
