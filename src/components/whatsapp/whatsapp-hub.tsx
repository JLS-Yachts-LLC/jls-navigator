/**
 * Communications → WhatsApp. Client messaging over the WhatsApp Business
 * Platform: a shared inbox, contacts with recorded consent, broadcast lists,
 * Meta-approved templates and sends with delivery tracking.
 *
 * View access reads everything; edit access sends, invites and changes.
 *
 * Numbers: someone given a WhatsApp number in Setup → Numbers (e.g. the
 * Training number) but not the Communications permission sees only the Inbox,
 * and only that number's conversations.
 */
import { useEffect, useState } from "react";
import { Inbox, Users, Radio, FileText, Send, Gauge, CalendarClock, ListChecks, MessageCircle } from "lucide-react";
import { useAccess } from "@/lib/auth/useAccess";
import { useUserPreference } from "@/lib/user-preferences";
import { cn } from "@/lib/utils";
import { db, loadMyLines, type MyLine } from "./wa-common";
import { WaInbox } from "./wa-inbox";
import { WaContacts } from "./wa-contacts";
import { WaLists } from "./wa-lists";
import { WaTemplates } from "./wa-templates";
import { WaSends } from "./wa-sends";
import { WaOverview } from "./wa-overview";
import { WaAutomations } from "./wa-automations";
import { WaResponses } from "./wa-responses";

const TABS = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "contacts", label: "Contacts", icon: Users },
  { key: "lists", label: "Lists", icon: Radio },
  { key: "templates", label: "Templates", icon: FileText },
  { key: "sends", label: "Sends", icon: Send },
  { key: "responses", label: "Responses", icon: ListChecks },
  { key: "automations", label: "Automations", icon: CalendarClock },
  { key: "overview", label: "Setup", icon: Gauge },
] as const;
type Tab = (typeof TABS)[number]["key"];

const TAB_KEY = "polaris.whatsapp.tab";

export function WhatsAppHub() {
  const { canAccessModule, loading } = useAccess();
  // The last tab each person used — saved to their account, so it reopens there on any device.
  const [savedTab, setTab] = useUserPreference<string>("whatsapp.tab", "inbox", { key: TAB_KEY, parse: (raw) => raw });
  const tab: Tab = TABS.some((t) => t.key === savedTab) ? (savedTab as Tab) : "inbox";
  const [unread, setUnread] = useState(0);
  // A contact's Message button opens their Inbox thread.
  const [openContact, setOpenContact] = useState<string | null>(null);
  /** The numbers this person can use (null while loading). */
  const [lines, setLines] = useState<MyLine[] | null>(null);
  useEffect(() => { void loadMyLines().then(setLines).catch(() => setLines([])); }, []);

  // Unread badge on the Inbox tab, whichever tab is open.
  useEffect(() => {
    const load = () => db().from("wa_conversations").select("unread_count").gt("unread_count", 0)
      .then(({ data }: any) => setUnread(((data ?? []) as any[]).reduce((n, r) => n + r.unread_count, 0)));
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 20_000);
    return () => clearInterval(t);
  }, []);

  if (loading || lines === null) return null;
  const full = canAccessModule("communications", "view");
  if (!full && lines.length === 0) {
    return <div className="p-8 text-sm text-muted-foreground">You don't have access to WhatsApp. An admin can give you a number in WhatsApp → Setup → Numbers.</div>;
  }
  const canEdit = canAccessModule("communications", "edit");
  // A number-only user: just the Inbox.
  const tabs = full ? TABS : TABS.filter((t) => t.key === "inbox");
  const current: Tab = tabs.some((t) => t.key === tab) ? tab : "inbox";

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">WhatsApp</h1>
          <p className="text-sm text-muted-foreground">
            Message clients who've opted in, and reply to them — every message, receipt and consent recorded.
            {!canEdit && " You have view-only access."}
          </p>
        </div>
        {/* The inbox on its own, installable like WhatsApp Desktop (see chats-app.tsx). */}
        <a href="/chats-app" target="_blank" rel="noreferrer"
          title="Just your WhatsApp conversations in a window of their own, with an alert when a message comes in. Install it from the browser's address bar to get a taskbar icon."
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted">
          <MessageCircle className="h-3.5 w-3.5 text-emerald-500" /> Open Polaris Chats
        </a>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => { setOpenContact(null); setTab(key); }}
            className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
              current === key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icon className="h-4 w-4" /> {label}
            {key === "inbox" && unread > 0 && (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-white">{unread}</span>
            )}
          </button>
        ))}
      </div>

      {current === "inbox" && <WaInbox key={openContact ?? "inbox"} lines={lines} openContactId={openContact} />}
      {current === "contacts" && <WaContacts canEdit={canEdit} onMessage={(id) => { setOpenContact(id); setTab("inbox"); }} />}
      {current === "lists" && <WaLists canEdit={canEdit} />}
      {current === "templates" && <WaTemplates canEdit={canEdit} />}
      {current === "sends" && <WaSends canEdit={canEdit} />}
      {current === "responses" && <WaResponses canEdit={canEdit} />}
      {current === "automations" && <WaAutomations canEdit={canEdit} />}
      {current === "overview" && <WaOverview onLinesChanged={() => void loadMyLines().then(setLines)} />}
    </div>
  );
}
