import { createFileRoute } from "@tanstack/react-router";
import { SignOnOffPage } from "@/components/crew-immigration/sign-on-off-page";

export const Route = createFileRoute("/_app/crew-immigration/sign-on-off")({
  component: SignOnOffPage,
  head: () => ({ meta: [{ title: "Sign On / Sign Off — Polaris" }] }),
});
