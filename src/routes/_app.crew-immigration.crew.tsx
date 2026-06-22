import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout for /crew-immigration/crew — renders the list (index) or a child route
// such as /crew-immigration/crew/$id (the crew profile) via the Outlet.
export const Route = createFileRoute("/_app/crew-immigration/crew")({
  component: () => <Outlet />,
});
