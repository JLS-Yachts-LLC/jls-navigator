import { createFileRoute } from "@tanstack/react-router";
import { TrainingKioskScreen } from "@/components/training-kiosk/kiosk-screen";

// JLS Training room tablet — NOT under `_app` (no login, no staff shell).
// The tablet is authorised by the key it was given when Training staff paired it
// (Training Institute → Tablet); every read goes through /api/training-kiosk/*.
export const Route = createFileRoute("/training-kiosk")({
  component: TrainingKioskScreen,
  head: () => ({
    meta: [
      { title: "JLS Training — Polaris" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
