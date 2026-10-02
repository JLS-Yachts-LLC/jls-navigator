/**
 * Agent ownership for a vessel.
 *
 * Names the team member accountable for keeping this yacht's paperwork current —
 * FMA and DMA permits, cruising permits, sanitation, insurance. Without it,
 * responsibility is tribal knowledge and things lapse quietly.
 *
 * The choice is the Agency team — agency_team_members(), i.e. whoever can edit
 * Agency vessels other than admins — not every account in Polaris. It used to
 * list all fourteen active users, finance and logistics included, which is why
 * the Agency lead asked whether assigning a vessel to her team was possible at
 * all (SD-0036).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { updateOrThrow } from "@/lib/db-write";
import { UserCog, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type Staff = { userId: string; label: string };

/**
 * The Agency team, plus whoever `keepUserId` names if they fall outside it — a
 * vessel assigned before someone moved department must still show its agent
 * rather than silently reading "Unassigned".
 */
export function useAgencyTeam(keepUserId?: string | null) {
  const [staff, setStaff] = useState<Staff[]>([]);

  const load = useCallback(async () => {
    const { data } = await (supabase as any).rpc("agency_team_members");
    const team: Staff[] = ((data ?? []) as any[]).map((u) => ({ userId: u.user_id, label: u.label }));
    if (keepUserId && !team.some((s) => s.userId === keepUserId)) {
      const { data: p } = await (supabase as any)
        .from("user_profiles").select("display_name, email").eq("user_id", keepUserId).maybeSingle();
      team.push({
        userId: keepUserId,
        label: `${p?.display_name?.trim() || p?.email || "Unknown user"} (not in Agency)`,
      });
    }
    setStaff(team);
  }, [keepUserId]);

  useEffect(() => { void load(); }, [load]);
  return staff;
}

export function YachtAgentPicker({
  yachtId, agentUserId, onChanged, compact = false,
}: {
  yachtId: string;
  agentUserId: string | null;
  /** Called with the new agent id so the parent can update its copy of the row. */
  onChanged?: (next: string | null) => void;
  compact?: boolean;
}) {
  const staff = useAgencyTeam(agentUserId);
  const [value, setValue] = useState<string>(agentUserId ?? "");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => { setValue(agentUserId ?? ""); }, [agentUserId]);

  async function assign(next: string) {
    setSaving(true);
    setValue(next);
    try {
      await updateOrThrow(
        (supabase as any).from("yachts").update({
          agent_user_id: next || null,
          agent_assigned_at: next ? new Date().toISOString() : null,
        }).eq("id", yachtId).select("id"),
        "vessel",
      );
      onChanged?.(next || null);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1800);
      toast.success(next
        ? `${staff.find(s => s.userId === next)?.label ?? "Agent"} is now responsible for this vessel`
        : "Agent cleared — nobody is assigned to this vessel");
    } catch (e: any) {
      setValue(agentUserId ?? "");
      toast.error(e?.message ?? "Could not save the agent");
    } finally {
      setSaving(false);
    }
  }

  const select = (
    <select
      value={value}
      disabled={saving}
      onChange={(e) => void assign(e.target.value)}
      className={cn(
        "rounded-md border border-input bg-background px-2 text-sm",
        compact ? "h-7 text-[12px]" : "mt-1 h-9 w-full",
      )}
    >
      <option value="">Unassigned</option>
      {staff.map(s => <option key={s.userId} value={s.userId}>{s.label}</option>)}
    </select>
  );

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {select}
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {justSaved && !saving && <Check className="h-3 w-3 text-emerald-400" />}
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <UserCog className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-semibold">Responsible Agent</h3>
        {saving && <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {justSaved && !saving && <Check className="ml-1 h-3.5 w-3.5 text-emerald-400" />}
      </div>
      <p className="text-[11.5px] text-muted-foreground">
        Accountable for keeping this vessel's permits and documents up to date — FMA, DMA,
        cruising permits, sanitation and insurance.
      </p>
      {select}
      {!value && (
        <p className="mt-2 text-[11.5px] text-amber-400/90">
          Nobody is assigned to this vessel yet.
        </p>
      )}
    </div>
  );
}
