import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/how-to")({
  component: () => <Outlet />,
});
