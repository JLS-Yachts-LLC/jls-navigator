import { Eye, X } from "lucide-react";
import { useViewAsRole, useViewAsLabel, setViewAsRole, ROLE_LABEL } from "@/lib/view-as";

/** Persistent banner shown while an admin is previewing a client/crew view. */
export function ViewAsBanner() {
  const viewAs = useViewAsRole();
  const label = useViewAsLabel();
  if (!viewAs) return null;
  const roleName = ROLE_LABEL[viewAs] ?? viewAs.replace(/_/g, " ");
  return (
    <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-5 py-1.5 text-xs text-amber-500">
      <Eye className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium">
        Previewing as <strong>{label ? `${label} (${roleName})` : roleName}</strong> — preview only; your data access is unchanged.
      </span>
      <button
        onClick={() => setViewAsRole(null)}
        className="ml-auto inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 font-semibold hover:bg-amber-500/30 transition"
      >
        <X className="h-3 w-3" /> Exit client view
      </button>
    </div>
  );
}
