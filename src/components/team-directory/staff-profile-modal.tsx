import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, Building2, Mail, Languages, Sparkles, Clock, ShieldAlert } from "lucide-react";
import type { Department, StaffProfile } from "@/lib/directory/types";
import { ContactActions, StaffAvatar } from "./contact-buttons";

function DetailRow({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="flex-1 text-foreground">{value}</span>
    </div>
  );
}

export function StaffProfileModal({
  staff,
  department,
  onClose,
}: {
  staff: StaffProfile | null;
  department?: Department;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!staff} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        {staff && (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">{staff.full_name}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-2 text-center">
              <StaffAvatar staff={staff} className="h-24 w-24" />
              <div>
                <h2 className="font-display text-lg font-semibold text-foreground">{staff.full_name}</h2>
                <p className="text-sm text-muted-foreground">
                  {staff.position}
                  {department ? ` · ${department.name}` : ""}
                </p>
                {staff.office_location && <p className="text-xs text-muted-foreground">{staff.office_location}</p>}
              </div>
              {staff.is_emergency_contact && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
                  <ShieldAlert className="h-3 w-3" /> Emergency · {staff.emergency_hours || "Available 24/7"}
                </span>
              )}
            </div>

            <div className="mt-1 space-y-3">
              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Contact</h3>
                <div className="space-y-1.5">
                  <DetailRow icon={Phone} label="Direct Mobile" value={staff.direct_mobile} />
                  <DetailRow icon={Building2} label="Office" value={staff.office_number} />
                  <DetailRow icon={Mail} label="Email" value={staff.email} />
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Actions</h3>
                <ContactActions staff={staff} size="md" />
              </section>

              {(staff.languages?.length || staff.areas_of_expertise?.length || staff.office_hours) && (
                <section>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Details</h3>
                  <div className="space-y-1.5">
                    <DetailRow icon={Languages} label="Languages" value={staff.languages?.join(", ")} />
                    <DetailRow icon={Sparkles} label="Expertise" value={staff.areas_of_expertise?.join(", ")} />
                    <DetailRow icon={Clock} label="Office Hours" value={staff.office_hours} />
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
