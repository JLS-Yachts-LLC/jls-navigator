import { createFileRoute } from "@tanstack/react-router";
import { ErrorLogPage } from "@/components/dev/error-log-page";

export const Route = createFileRoute("/_app/error-log")({
  component: ErrorLogPage,
  head: () => ({ meta: [{ title: "Error & Warning Log — Polaris" }] }),
});
