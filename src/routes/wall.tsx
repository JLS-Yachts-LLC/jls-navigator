import { createFileRoute } from "@tanstack/react-router";
import { WallScreen } from "@/components/wall/wall-screen";

// Port Operations wall — a TV screen, NOT under `_app` (no login, no staff shell).
// The screen is authorised by the key it was given when a member of staff paired
// it (Operations → Wall Displays); every read goes through /api/wall/display.
export const Route = createFileRoute("/wall")({
  component: WallScreen,
  head: () => ({
    meta: [
      { title: "Port Operations — Polaris" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
