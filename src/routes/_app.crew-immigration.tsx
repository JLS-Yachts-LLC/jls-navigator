import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/crew-immigration" as any)({
  component: () => <Outlet />,
});
