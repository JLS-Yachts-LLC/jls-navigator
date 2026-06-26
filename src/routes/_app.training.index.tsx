import { createFileRoute } from "@tanstack/react-router";
import { TrainingPage } from "@/components/training/training-page";

export const Route = createFileRoute("/_app/training/")({
  component: TrainingPage,
  head: () => ({ meta: [{ title: "Training — Polaris" }] }),
});
