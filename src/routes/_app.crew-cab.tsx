import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Route as RouteIcon, CalendarDays, Users, Car, Wrench, MapPin } from "lucide-react";

/**
 * Crew Care shell — the module's pages share this tab bar. Journeys and
 * Maintenance are the driver-facing screens, so the tabs stay big enough to
 * hit with a thumb.
 */
const TABS = [
  { to: "/crew-cab/trips", label: "Trips", icon: RouteIcon },
  { to: "/crew-cab/journeys", label: "Journeys", icon: CalendarDays },
  { to: "/crew-cab/drivers", label: "Drivers", icon: Users },
  { to: "/crew-cab/vehicles", label: "Vehicles", icon: Car },
  { to: "/crew-cab/maintenance", label: "Maintenance", icon: Wrench },
  { to: "/crew-cab/locations", label: "Locations", icon: MapPin },
] as const;

export const Route = createFileRoute("/_app/crew-cab")({
  component: () => (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 bg-card/30 px-2 sm:px-4">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className="flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:text-foreground [&.active]:border-primary [&.active]:text-foreground"
            >
              <Icon className="h-4 w-4" /> {t.label}
            </Link>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  ),
});
