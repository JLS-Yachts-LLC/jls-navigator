import { ScrollText } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type EntryType = "feature" | "fix" | "improvement" | "patch";

type ChangeEntry = {
  type: EntryType;
  title: string;
  description?: string;
};

type Release = {
  version: string;
  date: string;
  summary?: string;
  entries: ChangeEntry[];
};

// ─── Changelog data ───────────────────────────────────────────────────────────

const RELEASES: Release[] = [
  {
    version: "2.0.0",
    date: "2026-06-04",
    summary: "Aquila One — platform rebrand to The Operating System Behind Yacht Operations, with a new light enterprise theme, Crew & Immigration, live fleet tracking and a full module restructure.",
    entries: [
      {
        type: "feature",
        title: "Aquila One rebrand",
        description:
          "JLS Navigator is now Aquila One — The Operating System Behind Yacht Operations. New eagle logo lockup, gold accent, and a light enterprise theme (white content surfaces, deep navy sidebar, enterprise-blue accents) matching the brand identity.",
      },
      {
        type: "feature",
        title: "Module restructure",
        description:
          "Navigation reorganised into the full Aquila One module hierarchy: Superyacht Middle East (Yachts, Permits, Crew & Immigration), Orbit, ShipSync, Waypoint, Superyacht Provisioning, JLS Training Institute, Crew Placement, Finance, Transport & Fleet, Yacht IT Solutions, AI Assistant and Compass.",
      },
      {
        type: "feature",
        title: "Crew & Immigration",
        description:
          "New module with reusable crew profiles (enter once, reuse everywhere) and an airline-style Visa Application tracker — pipeline status flow (Draft → Submitted → In Review → Processing → Approved → Completed), priority flags, document checklist and per-application detail panel.",
      },
      {
        type: "feature",
        title: "Light & dark themes",
        description:
          "Toggle between the light enterprise theme (white surfaces, navy sidebar) and a full dark theme from the top bar. Your choice persists and applies before the page paints — no flash.",
      },
      {
        type: "improvement",
        title: "Concept-aligned menu",
        description:
          "Sidebar menu reordered to match the Aquila One concept — Dashboard, Vessel Overview, Crew, Crew & Immigration (Crew List, Visas, Permits & Gate Passes, Sign On/Off, Crew Documents), Logistics, Operations, Maintenance, Finance, Reports, Settings — with matching icons. Remaining modules grouped under a Modules section below.",
      },
      {
        type: "feature",
        title: "Global top bar",
        description:
          "New top bar across the app with global search (find any crew member or vessel as you type), notifications, and a user menu with quick access to settings and sign out.",
      },
      {
        type: "feature",
        title: "Active vessel switcher",
        description:
          "Vessel selector in the sidebar lets you set an active vessel (or All Vessels). The selection persists and provides the foundation for vessel-scoped views across modules.",
      },
      {
        type: "feature",
        title: "Live Fleet Tracking",
        description:
          "Real-time GPS vehicle tracking (map, positions, speed, addresses, trip history) embedded under ShipSync and Transport & Fleet, powered by the mygps.ae fleet platform.",
      },
      {
        type: "feature",
        title: "Module landing pages",
        description:
          "Waypoint, Superyacht Provisioning, JLS Training Institute, Crew Placement, AI Assistant and Compass now have landing pages describing their planned capabilities and roadmap phase.",
      },
      {
        type: "improvement",
        title: "Shared driver pool",
        description:
          "ShipSync Drivers and Transport & Fleet Drivers now share a single driver roster — add or edit a driver in either module and it appears in both.",
      },
      {
        type: "fix",
        title: "Production build — route generation",
        description:
          "Removed type-cast workarounds from route definitions that were breaking the TanStack Router code generator and failing the Cloudflare build. Routes now use plain string literals as required.",
      },
    ],
  },
  {
    version: "1.5.0",
    date: "2026-05-16",
    summary: "Crew Cab module — full transport management system with trips, drivers, vehicles and locations.",
    entries: [
      {
        type: "feature",
        title: "Crew Cab — Trips",
        description:
          "Plan and track crew pickups and in-house journeys. Filter by type, assign drivers and vehicles, set pickup/drop-off times. Built-in OpenStreetMap route preview when both locations have coordinates.",
      },
      {
        type: "feature",
        title: "Crew Cab — Drivers",
        description:
          "Manage internal driver roster: name, contact, license number and active/inactive status. Full add/edit/delete with inline status badges.",
      },
      {
        type: "feature",
        title: "Crew Cab — Vehicles",
        description:
          "Fleet registry: make, model, year, registration, colour, capacity, mileage, insurance expiry and availability status (Available / In Use / Maintenance).",
      },
      {
        type: "feature",
        title: "Crew Cab — Locations",
        description:
          "Trusted saved locations with category tags (Airport, Marina, Hotel, Office, Restaurant). Nominatim geocoding auto-fills lat/lng from the address. Map link opens OpenStreetMap at the exact coordinates.",
      },
      {
        type: "fix",
        title: "ERR_TOO_MANY_REDIRECTS on Trips page",
        description:
          "The parent layout route /_app/crew-cab.tsx had a beforeLoad redirect to /crew-cab/trips. Because TanStack Router evaluates the parent beforeLoad for every child route load, this caused an infinite redirect loop. Fixed by replacing the redirect with a passthrough <Outlet />.",
      },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-05-16",
    summary: "Navigation restructure — Port & Operations group, Changelog, and Director section.",
    entries: [
      {
        type: "feature",
        title: "Port & Operations nav group",
        description:
          "Yachts, all Permits sub-items and Small Boat Registration are now nested under a collapsible Port & Operations parent in the sidebar.",
      },
      {
        type: "feature",
        title: "Changelog page",
        description:
          "This page — tracks all patches, fixes and new features with versioned timeline and categorised badge labels.",
      },
      {
        type: "improvement",
        title: "Director section expanded",
        description:
          "Dashboard, Settings and Changelog are now all children of the Director nav group for cleaner organisation.",
      },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-05-15",
    summary: "SharePoint yacht image sync — fully automated image discovery and download.",
    entries: [
      {
        type: "feature",
        title: "Auto-discovery of SharePoint yacht images",
        description:
          "When a yacht has no SharePoint item ID on record, the sync now searches the SharePoint list by IMO number and then by vessel name. Matching items are linked and the ID is saved to the database for future syncs.",
      },
      {
        type: "fix",
        title: "Image was found but could not be downloaded",
        description:
          "Microsoft Graph API tokens cannot authenticate against direct SharePoint file download URLs. Fixed by acquiring a separate SharePoint-scoped OAuth token (https://{hostname}.sharepoint.com/.default) for the actual file download, separate from the Graph token used for list queries.",
      },
      {
        type: "fix",
        title: "\"No image found\" shown for all yachts",
        description:
          "downloadYachtImage returned null immediately when sharepoint_item_id was null, with no fallback search. Now performs automatic SP list search before giving up.",
      },
      {
        type: "improvement",
        title: "Sync error messages surface reason",
        description:
          "The sync image button on yacht detail pages now shows a specific error message (e.g. \"No matching yacht found in SharePoint\") instead of the generic fallback.",
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-05-14",
    summary: "SharePoint webhook and real-time sync.",
    entries: [
      {
        type: "feature",
        title: "SharePoint real-time webhook",
        description:
          "Register a SharePoint list subscription so the app is notified instantly whenever a yacht record changes. Includes expiry tracking and one-click renewal from Settings → Integrations.",
      },
      {
        type: "fix",
        title: "SharePoint webhook validation failure",
        description:
          "The validationToken query parameter was being double-decoded (decodeURIComponent on an already-decoded value), causing a URIError crash when the token contained % characters. Fixed by returning the raw parameter value directly.",
      },
      {
        type: "improvement",
        title: "Cron fallback sync every 15 minutes",
        description:
          "Even without a webhook, a scheduled cron job polls SharePoint for delta changes every 15 minutes automatically — no manual action required.",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-05-10",
    summary: "Settings — department permissions, email templates, and user management.",
    entries: [
      {
        type: "feature",
        title: "Department permissions matrix",
        description:
          "Control view / create / edit access per department and per module. Changes are persisted to Supabase and enforce access control across the app.",
      },
      {
        type: "feature",
        title: "Email templates",
        description:
          "Create and manage email templates for permits and notifications. Supports merge tags ({{boat_name}}, {{holder_name}}, etc.) with a click-to-insert tag picker. Default templates for Permit to Work and Boat Registration Update can be seeded in one click.",
      },
      {
        type: "feature",
        title: "User management",
        description:
          "Invite users by email, assign roles (admin / manager / user), reset passwords, disable MFA, and remove users — all from Settings → Users.",
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-05-01",
    summary: "Initial launch — Yachts, Permits, Small Boat Registration, Orbit and Packages.",
    entries: [
      {
        type: "feature",
        title: "Yachts registry",
        description:
          "Full vessel registry with details, image sync from SharePoint, and per-yacht permit tracking.",
      },
      {
        type: "feature",
        title: "Permits module",
        description:
          "Exit & Entry, Sanitation, Cruising (Mothership & Tenders), Gate Pass, TDRA, Navigation License, and DMA Permits — all with email sending capability.",
      },
      {
        type: "feature",
        title: "Small Boat Registration",
        description: "Track registration status, phases and documents for small boats.",
      },
      {
        type: "feature",
        title: "Orbit",
        description: "Orbit module stub — placeholder for future operations tracking.",
      },
      {
        type: "feature",
        title: "Packages & Deliveries",
        description: "Track inbound and outbound packages for yachts.",
      },
      {
        type: "feature",
        title: "Authentication & MFA",
        description:
          "Supabase Auth with email/password login, multi-factor authentication support, and role-based access.",
      },
      {
        type: "feature",
        title: "SharePoint integration",
        description:
          "Connect to a SharePoint list via Azure AD app registration. Field mapping UI with auto-suggestion and full sync with delta tracking.",
      },
    ],
  },
];

// ─── Badge styles ─────────────────────────────────────────────────────────────

const BADGE: Record<EntryType, { label: string; className: string }> = {
  feature: {
    label: "New Feature",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  },
  fix: {
    label: "Fix",
    className:
      "border-red-500/30 bg-red-500/10 text-red-400",
  },
  improvement: {
    label: "Improvement",
    className:
      "border-blue-500/30 bg-blue-500/10 text-blue-400",
  },
  patch: {
    label: "Patch",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },
};

// ─── Components ───────────────────────────────────────────────────────────────

function EntryBadge({ type }: { type: EntryType }) {
  const { label, className } = BADGE[type];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}
    >
      {label}
    </span>
  );
}

function ReleaseCard({ release }: { release: Release }) {
  const dateLabel = new Date(release.date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="relative pl-8">
      {/* Timeline dot */}
      <div className="absolute left-0 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-primary bg-background">
        <div className="h-2 w-2 rounded-full bg-primary" />
      </div>

      {/* Header */}
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <span className="font-display text-lg font-bold tracking-tight">
          v{release.version}
        </span>
        <span className="text-xs text-muted-foreground">{dateLabel}</span>
      </div>

      {release.summary && (
        <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
          {release.summary}
        </p>
      )}

      {/* Entries */}
      <div className="space-y-3">
        {release.entries.map((entry, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-card px-4 py-3 flex gap-3 items-start"
          >
            <div className="pt-0.5 shrink-0">
              <EntryBadge type={entry.type} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{entry.title}</p>
              {entry.description && (
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  {entry.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Page header */}
      <div className="mb-8 flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <ScrollText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Changelog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A running history of new features, fixes and improvements to Aquila One.
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-8 flex flex-wrap gap-2">
        {(Object.keys(BADGE) as EntryType[]).map((type) => (
          <EntryBadge key={type} type={type} />
        ))}
      </div>

      {/* Timeline */}
      <div className="relative space-y-10 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-border">
        {RELEASES.map((r) => (
          <ReleaseCard key={r.version} release={r} />
        ))}
      </div>
    </div>
  );
}
