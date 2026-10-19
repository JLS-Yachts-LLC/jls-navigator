import { createFileRoute } from "@tanstack/react-router";
import { CourseLibrary } from "@/components/academy/course-library";

// Crew Academy — JLS's course library and course creator (staff). Vessels enrol
// their own crew from the Client Portal; see POLARIS_CREW_ACADEMY.md.
export const Route = createFileRoute("/_app/academy-admin")({
  component: CourseLibrary,
  head: () => ({ meta: [{ title: "Crew Academy — Polaris" }] }),
});
