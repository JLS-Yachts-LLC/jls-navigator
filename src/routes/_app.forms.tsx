import { createFileRoute } from "@tanstack/react-router";
import { FormsHub } from "@/components/forms/forms-hub";

export const Route = createFileRoute("/_app/forms")({
  component: FormsHub,
  head: () => ({ meta: [{ title: "Forms — Polaris" }] }),
});
