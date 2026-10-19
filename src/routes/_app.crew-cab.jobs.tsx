import { createFileRoute } from "@tanstack/react-router";
import { JobCardsPage } from "@/components/crew-cab/job-cards-page";

export const Route = createFileRoute("/_app/crew-cab/jobs")({
  // ?job=<id> opens that job card — the bell, email and Teams alerts link here.
  validateSearch: (s: Record<string, unknown>): { job?: string } => (typeof s.job === "string" ? { job: s.job } : {}),
  component: JobCardsRoute,
  head: () => ({ meta: [{ title: "Job Cards — Crew Care" }] }),
});

function JobCardsRoute() {
  const { job } = Route.useSearch();
  return <JobCardsPage initialJobId={job} />;
}
