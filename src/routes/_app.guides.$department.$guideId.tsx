import { createFileRoute } from "@tanstack/react-router";
import { GuideDetailPage } from "@/components/guides/guide-detail-page";

export const Route = createFileRoute("/_app/guides/$department/$guideId")({
  component: GuideDetailPage,
  head: () => ({ meta: [{ title: "Guide — Polaris" }] }),
});
