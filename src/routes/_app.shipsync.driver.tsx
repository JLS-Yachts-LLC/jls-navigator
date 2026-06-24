import { createFileRoute } from "@tanstack/react-router";
import { DriverApp } from "@/components/shipsync/driver/DriverApp";

export const Route = createFileRoute("/_app/shipsync/driver")({
  component: DriverApp,
  head: () => ({
    meta: [
      { title: "ShipSync Driver" },
      { name: "theme-color", content: "#0d1520" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "ShipSync" },
    ],
    links: [
      { rel: "manifest", href: "/shipsync-driver.webmanifest" },
      { rel: "apple-touch-icon", href: "/shipsync-icon.svg" },
    ],
  }),
});
