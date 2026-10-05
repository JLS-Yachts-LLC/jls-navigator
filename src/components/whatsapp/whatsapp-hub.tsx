/**
 * Communications → WhatsApp. Client messaging over the WhatsApp Business
 * Platform: a shared inbox, contacts with recorded consent, broadcast lists,
 * Meta-approved templates and sends with delivery tracking.
 *
 * View access reads everything; edit access sends, invites and changes.
 */
import { useEffect, useState } from "react";
import { Inbox, Users, Radio, FileText, Send, Gauge, CalendarClock } from "lucide-react";
import { useAccess } from "@/lib/auth/useAccess";
import { useUserPreference } from "@/lib/user-preferences";
import { cn } from "@/lib/utils";
import { db } from "./wa-common";
import { WaInbox } from "./wa-inbox";
import { WaContacts } from "./wa-contacts";
import { WaLists } from "./wa-lists";
import { WaTemplates } from "./wa-templates";
import { WaSends } from "./wa-sends";
import { WaOverview } from "./wa-overview";
import { WaAutomations } from "./wa-automations";

const TABS = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "contacts", label: "Contacts", icon: Users },
  { key: "lists", label: "Lists", icon: Radio },
  { key: "templates", label: "Templates", icon: FileText },
  { key: "sends", label: "Sends", icon: Send },
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

  // Unread badge on the Inbox tab, whichever tab is open.
  useEffect(() => {
    const load = () => db().from("wa_conversations").select("unread_count").gt("unread_count", 0)
      .then(({ data }: any) => setUnread(((data ?? []) as any[]).reduce((n, r) => n + r.unread_count, 0)));
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 20_000);
    return () => clearInterval(t);
  }, []);

  if (loading) return null;
  if (!canAccessModule("communications", "view")) {
    return <div className="p-8 text-sm text-muted-foreground">You don't have access to Communications.</div>;
  }
  const canEdit = canAccessModule("communications", "edit");

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Message clients who've opted in, and reply to them — every message, receipt and consent recorded.
          {!canEdit && " You have view-only access."}
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn("-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
              tab === key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icon className="h-4 w-4" /> {label}
            {key === "inbox" && unread > 0 && (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-white">{unread}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "inbox" && <WaInbox canEdit={canEdit} />}
      {tab === "contacts" && <WaContacts canEdit={canEdit} />}
      {tab === "lists" && <WaLists canEdit={canEdit} />}
      {tab === "templates" && <WaTemplates canEdit={canEdit} />}
      {tab === "sends" && <WaSends canEdit={canEdit} />}
      {tab === "automations" && <WaAutomations canEdit={canEdit} />}
      {tab === "overview" && <WaOverview />}
    </div>
  );
}
