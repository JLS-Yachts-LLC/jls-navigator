/**
 * Per-person staff notification settings — profile menu → My notifications.
 * Stored with the person's other preferences (user_preferences.prefs), read by
 * lib/staff-notifications.server.ts. Each person chooses for themselves.
 */
export type StaffNotificationKey = "notify.sentToClient" | "notify.clientOpened";

export const STAFF_NOTIFICATIONS: Array<{ key: StaffNotificationKey; label: string; description: string; default: boolean }> = [
  {
    key: "notify.sentToClient",
    label: "When I send a document to a client",
    description: "An email to you confirming it went — which document, which vessel and who it was sent to. Covers permits (Send to client) and crew visas (Send to Vessel).",
    default: true,
  },
  {
    key: "notify.clientOpened",
    label: "When the client opens it",
    description: "An email to you the first time the client opens the secure link you sent — handy for knowing whether to chase.",
    default: false,
  },
];

export const notificationDefault = (key: StaffNotificationKey) =>
  STAFF_NOTIFICATIONS.find((n) => n.key === key)?.default ?? false;
