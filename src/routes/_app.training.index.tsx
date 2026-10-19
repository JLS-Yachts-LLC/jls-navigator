import { createFileRoute } from "@tanstack/react-router";
import { TrainingPage } from "@/components/training/training-page";
import { TrainingAccessGate } from "@/components/training/training-access";

export const Route = createFileRoute("/_app/training/")({
  component: () => <TrainingAccessGate><TrainingPage /></TrainingAccessGate>,
  head: () => ({ meta: [{ title: "Training — Polaris" }] }),
});
