import type { ReactNode } from "react";
import { Loader2, Lock } from "lucide-react";
import { useAccess } from "@/lib/auth/useAccess";

/**
 * Training screens are for Training staff only: the Training module (a personal
 * grant or the department default) or a global admin. Same rule as the
 * database (can_access_training(), migration 20261019180000) and the sidebar,
 * so someone without it gets a clear message instead of an empty page.
 */
export function TrainingAccessGate({ children }: { children: ReactNode }) {
  const { loading, canAccessModule } = useAccess();
  if (loading) {
    return <div className="flex h-full items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!canAccessModule("training")) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
          <div className="mt-3 text-[15px] font-semibold">You don't have access to Training</div>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Training Institute holds students' personal details, so it's only open to the Training team.
            If you need it, ask an admin to give you the Training module in Manage Users.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
