import { createFileRoute } from "@tanstack/react-router";
import { FeedbackPage } from "@/components/feedback/feedback-page";

export const Route = createFileRoute("/_app/feedback")({
  component: FeedbackPage,
  head: () => ({ meta: [{ title: "Feedback & Requests — Polaris" }] }),
});
