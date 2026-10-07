/**
 * A vessel's agents, and the permits each one looks after (SD-0047).
 *
 * UAE vessels are often split between teams — the Abu Dhabi agency team on the
 * FMA cruising permit, the Dubai team on the DMA permit — so a vessel can have
 * several agents, each covering particular permit types (or everything). The
 * first agent is the vessel's lead (yachts.agent_user_id, kept in step by the
 * database), which is what older screens and "My vessels" read.
 * Expiry reminders go to the agents covering that kind of permit.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { PERMIT_META } from "@/lib/permit-types";
import type { VesselAgent } from "@/lib/permit-expiry";
import { useAgencyTeam } from "./YachtAgentPicker";

const sb = supabase as any;

/** Permit kinds an agent can be made responsible for, in the order the agents think of them. */
export const COVER_OPTIONS: { value: string; label: string }[] = [
  { value: "cruising_mothership", label: "Cruising permit" },
  { value: "cruising_tenders", label: "Tender cruising permit" },
  { value: "dma", label: "DMA permit" },
  { value: "navigation_license", label: "Navigation licence" },
  { value: "abu_dhabi", label: "Abu Dhabi permits" },
  { value: "sanitation", label: "Sanitation" },
  { value: "tdra", label: "TDRA" },
  { value: "exit_entry", label: "Exit & entry" },
  { value: "gate_pass", label: "Gate pass" },
];
const coverLabel = (v: string) =>
  COVER_OPTIONS.find((o) => o.value === v)?.label ?? PERMIT_META[v as keyof typeof PERMIT_META]?.label ?? v;

/** "All permits", or "Cruising permit, DMA permit". */
export function coversText(covers: string[] | null | undefined): string {
  return covers?.length ? covers.map(coverLabel).join(", ") : "All permits";
}

export type AgentRow = VesselAgent & { id: string; name: string };

/**
 * Every vessel's agents (the table is small), with names. `reload` after a change.
 * Names come straight from the profile — the "active" flag is cosmetic.
 */
export function useYachtAgents(yachtId?: string) {
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    let q = sb.from("yacht_agents").select("id, yacht_id, user_id, covers, created_at").order("created_at");
    if (yachtId) q = q.eq("yacht_id", yachtId);
    const { data } = await q;
    const list = (data ?? []) as (VesselAgent & { id: string })[];
    const ids = [...new Set(list.map((a) => a.user_id))];
    const { data: people } = ids.length
      ? await sb.from("user_profiles").select("user_id, display_name, email").in("user_id", ids)
      : { data: [] };
    const name = new Map(((people ?? []) as any[]).map((p) => [p.user_id, p.display_name?.trim() || p.email || "Agent"]));
    setRows(list.map((a) => ({ ...a, name: name.get(a.user_id) ?? "Agent" })));
    setLoaded(true);
  }, [yachtId]);

  useEffect(() => { void reload(); }, [reload]);

  const byYacht = useMemo(() => {
    const m = new Map<string, AgentRow[]>();
    for (const a of rows) m.set(a.yacht_id, [...(m.get(a.yacht_id) ?? []), a]);
    return m;
  }, [rows]);

  return { rows, byYacht, loaded, reload };
}

/** "Sarah (Cruising permit) · Omar (DMA permit)" — for cards and lists. */
export function agentsLine(agents: AgentRow[] | undefined): string {
  if (!agents?.length) return "";
  if (agents.length === 1 && !agents[0].covers?.length) return agents[0].name;
  return agents.map((a) => (a.covers?.length ? `${a.name} (${coversText(a.covers)})` : a.name)).join(" · ");
}

/** The vessel page's panel: who looks after this vessel, and for which permits. */
export function YachtAgentsPanel({
  yachtId, canEdit, agents: rows, loaded, reload, onLeadChanged,
}: {
  yachtId: string;
  canEdit: boolean;
  /** From useYachtAgents(yachtId) in the page, so other panels see changes too. */
  agents: AgentRow[];
  loaded: boolean;
  reload: () => Promise<void>;
  /** The lead may change (first agent added / removed) — lets the page refresh its copy. */
  onLeadChanged?: (lead: string | null) => void;
}) {
  const team = useAgencyTeam();
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState("");
  const [covers, setCovers] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const available = team.filter((s) => !rows.some((r) => r.user_id === s.userId));

  async function after() {
    await reload();
    const { data } = await sb.from("yachts").select("agent_user_id").eq("id", yachtId).maybeSingle();
    onLeadChanged?.(data?.agent_user_id ?? null);
  }

  async function add() {
    if (!pick) return;
    setBusy("add");
    try {
      const { data: { user } } = await sb.auth.getUser();
      const { error } = await sb.from("yacht_agents").insert({ yacht_id: yachtId, user_id: pick, covers, created_by: user?.id ?? null });
      if (error) throw error;
      toast.success(`${team.find((s) => s.userId === pick)?.label ?? "Agent"} now looks after ${coversText(covers).toLowerCase()} on this vessel`);
      setPick(""); setCovers([]); setAdding(false);
      await after();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add the agent");
    } finally {
      setBusy(null);
    }
  }

  async function saveCovers(row: AgentRow, next: string[]) {
    setBusy(row.id);
    try {
      const { error } = await sb.from("yacht_agents").update({ covers: next }).eq("id", row.id);
      if (error) throw error;
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: AgentRow) {
    setBusy(row.id);
    try {
      const { error } = await sb.from("yacht_agents").delete().eq("id", row.id);
      if (error) throw error;
      toast.success(`${row.name} removed from this vessel`);
      await after();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not remove the agent");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <UserCog className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-semibold">Responsible agents</h3>
        {!loaded && <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <p className="text-[13px] text-muted-foreground">
        Who keeps this vessel's permits current. Each agent gets the expiry reminders for the permits they cover.
      </p>

      <ul className="mt-3 space-y-2">
        {rows.map((r, i) => (
          <li key={r.id} className="rounded-lg border border-border/70 bg-background/40 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium">
                  {r.name}
                  {i === 0 && rows.length > 1 && <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">· lead</span>}
                </div>
                <button type="button" disabled={!canEdit}
                  onClick={() => setEditing((cur) => (cur === r.id ? null : r.id))}
                  className={cn("text-left text-[13px] text-muted-foreground", canEdit && "hover:text-foreground hover:underline")}>
                  {coversText(r.covers)}
                </button>
              </div>
              {canEdit && (
                <button type="button" onClick={() => void remove(r)} disabled={busy === r.id}
                  title={`Remove ${r.name}`} aria-label={`Remove ${r.name}`}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-red-400">
                  {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              )}
            </div>
            {editing === r.id && canEdit && (
              <CoverPicker value={r.covers ?? []} onChange={(next) => void saveCovers(r, next)} />
            )}
          </li>
        ))}
      </ul>

      {loaded && !rows.length && (
        <p className="mt-2 text-[13px] text-amber-400/90">Nobody is assigned to this vessel yet.</p>
      )}

      {canEdit && (adding ? (
        <div className="mt-3 space-y-2 rounded-lg border border-dashed border-border p-2.5">
          <select value={pick} onChange={(e) => setPick(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Choose an agent…</option>
            {available.map((s) => <option key={s.userId} value={s.userId}>{s.label}</option>)}
          </select>
          <CoverPicker value={covers} onChange={setCovers} />
          <div className="flex gap-2">
            <button type="button" onClick={() => void add()} disabled={!pick || busy === "add"}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Add agent
            </button>
            <button type="button" onClick={() => { setAdding(false); setPick(""); setCovers([]); }}
              className="h-9 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-primary hover:underline">
          <Plus className="h-4 w-4" /> {rows.length ? "Add another agent" : "Add an agent"}
        </button>
      ))}
    </div>
  );
}

/** "All permits", or tick the permit kinds this agent looks after. */
function CoverPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const all = value.length === 0;
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="mt-2 space-y-1.5">
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={all} onChange={() => onChange([])} />
        <span className={cn(all && "font-medium")}>All permits</span>
      </label>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {COVER_OPTIONS.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
            <span className={cn(value.includes(o.value) && "text-foreground")}>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
