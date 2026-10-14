import { createFileRoute } from "@tanstack/react-router";
import { AnchorPage } from "@/components/anchor/anchor-page";

export const Route = createFileRoute("/_app/esign/")({
  component: AnchorPage,
  head: () => ({ meta: [{ title: "Anchor — Polaris" }] }),
});
