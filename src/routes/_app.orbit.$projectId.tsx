import { createFileRoute } from "@tanstack/react-router";
import { ProjectDetailPage } from "@/components/orbit/project-detail-page";

export const Route = createFileRoute("/_app/orbit/$projectId")({
  component: ProjectDetailPage,
  head: () => ({ meta: [{ title: "Project — Orbit" }] }),
});
