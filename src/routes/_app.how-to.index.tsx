import { createFileRoute } from "@tanstack/react-router";
import { HowToIndexPage } from "@/components/how-to/how-to-pages";

export const Route = createFileRoute("/_app/how-to/")({
  component: HowToIndexPage,
  head: () => ({ meta: [{ title: "How-to Guides — Polaris" }] }),
});
