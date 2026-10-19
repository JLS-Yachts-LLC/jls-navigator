import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PERMIT_STATUSES, type PermitStatus } from "@/lib/permit-types";

/**
 * The permit's status, for the per-type permit dialogs. Most of them had no
 * status control, so every permit made there stayed "Pending" for good — even
 * once it had been issued and emailed to the client.
 */
export function PermitStatusField({
  value,
  onChange,
}: {
  value: PermitStatus | null | undefined;
  onChange: (v: PermitStatus) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Status</Label>
      <Select value={value ?? "pending"} onValueChange={(v) => onChange(v as PermitStatus)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {PERMIT_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
