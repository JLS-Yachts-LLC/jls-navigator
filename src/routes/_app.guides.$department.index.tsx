import { createFileRoute } from "@tanstack/react-router";
import { GuideDepartmentPage } from "@/components/guides/guide-department-page";

export const Route = createFileRoute("/_app/guides/$department/")({
  component: GuideDepartmentPage,
  head: () => ({ meta: [{ title: "Guides — Polaris" }] }),
});
