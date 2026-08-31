import { createFileRoute } from "@tanstack/react-router";
import { OrbitApprovalsPage } from "@/components/orbit/orbit-approvals-page";

export const Route = createFileRoute("/_app/orbit/approvals")({
  component: OrbitApprovalsPage,
  head: () => ({ meta: [{ title: "Approvals — Orbit — Polaris" }] }),
});
