import { createFileRoute } from "@tanstack/react-router";
import { TeamDirectoryPage } from "@/components/team-directory/directory-page";

export const Route = createFileRoute("/_app/directory")({
  component: TeamDirectoryPage,
  head: () => ({ meta: [{ title: "Team Directory — Polaris" }] }),
});
