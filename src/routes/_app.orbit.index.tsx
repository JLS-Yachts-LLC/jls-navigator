import { createFileRoute } from "@tanstack/react-router";
import { ProjectsPage } from "@/components/orbit/projects-page";

export const Route = createFileRoute("/_app/orbit/")({
  component: ProjectsPage,
  head: () => ({ meta: [{ title: "Orbit — JLS Navigator" }] }),
});
