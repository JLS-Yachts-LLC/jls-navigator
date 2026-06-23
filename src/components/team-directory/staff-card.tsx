import { MapPin } from "lucide-react";
import type { Department, StaffProfile } from "@/lib/directory/types";
import { ContactActions, StaffAvatar } from "./contact-buttons";

export function StaffCard({
  staff,
  department,
  onOpen,
}: {
  staff: StaffProfile;
  department?: Department;
  onOpen: (s: StaffProfile) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(staff)}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-card/80"
    >
      <div className="flex items-start gap-3">
        <StaffAvatar staff={staff} className="h-12 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-display text-sm font-semibold text-foreground">{staff.full_name}</h3>
            {staff.is_emergency_contact && (
              <span className="shrink-0 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-destructive">
                24/7
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{staff.position}</p>
          {department && <p className="truncate text-[11px] text-primary/80">{department.name}</p>}
          {staff.office_location && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" /> {staff.office_location}
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-border pt-3" onClick={(e) => e.stopPropagation()}>
        <ContactActions staff={staff} />
      </div>
    </button>
  );
}
