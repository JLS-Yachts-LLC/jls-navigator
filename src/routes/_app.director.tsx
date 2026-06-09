import { createFileRoute } from "@tanstack/react-router";
import { DirectorPage } from "@/components/director-page";

export const Route = createFileRoute("/_app/director")({
  component: DirectorPage,
  head: () => ({ meta: [{ title: "Director — Polaris" }] }),
});
