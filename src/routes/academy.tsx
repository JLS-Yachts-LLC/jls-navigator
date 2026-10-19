import { createFileRoute } from "@tanstack/react-router";
import { AcademyApp } from "@/components/academy/academy-app";

// Crew Academy — crew on a vessel taking the training enrolled to them. NOT under
// `_app` (no staff shell). Every read goes through /api/academy, which keeps the
// learner to their own enrolments on their own vessel; RLS fences the login out
// of the database entirely.
export const Route = createFileRoute("/academy")({
  component: AcademyApp,
  head: () => ({
    meta: [
      { title: "Crew Academy — JLS Yachts" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
