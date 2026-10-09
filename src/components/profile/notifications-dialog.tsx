/**
 * Profile menu → My notifications. Each person chooses which emails Polaris
 * sends them about their own work (lib/staff-notifications.ts). Saved to their
 * account, so it follows them to any device.
 */
import { Bell } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useUserPreference } from "@/lib/user-preferences";
import { STAFF_NOTIFICATIONS, type StaffNotificationKey } from "@/lib/staff-notifications";

function NotificationRow({ k, label, description, fallback }: { k: StaffNotificationKey; label: string; description: string; fallback: boolean }) {
  const [on, setOn] = useUserPreference<boolean>(k, fallback);
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={on} onCheckedChange={(v) => setOn(!!v)} aria-label={label} />
    </label>
  );
}

export function NotificationsDialog({ open, onClose, email }: { open: boolean; onClose: () => void; email: string | null }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bell className="h-4 w-4" /> My notifications</DialogTitle>
          <DialogDescription>
            Emails about documents you send to clients{email ? <>, to <b>{email}</b></> : null}. Only you see and change these.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {STAFF_NOTIFICATIONS.map((n) => (
            <NotificationRow key={n.key} k={n.key} label={n.label} description={n.description} fallback={n.default} />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Changes save straight away.</p>
      </DialogContent>
    </Dialog>
  );
}
