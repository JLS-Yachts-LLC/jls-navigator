/**
 * Automations hub — step-by-step view + full run log for every automation.
 *
 * Worker automations: steps come from automations.steps (seeded in the DB) and
 * runs from automation_runs (status, timing, detail).
 *
 * n8n automations: steps are the workflow's nodes walked in execution order and
 * runs are live executions, both pulled from the n8n REST API (needs the
 * N8N_API_KEY secret; base URL from N8N_API_URL, default n8n.jlsyachts.com).
 * Fetched steps are cached back onto the automation row.
 */
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = supabaseAdmin as any;

const N8N_BASE = () => (process.env.N8N_API_URL ?? "https://n8n.jlsyachts.com").replace(/\/$/, "");
const N8N_KEY = () => process.env.N8N_API_KEY ?? "";

export type AutomationStep = { name: string; type?: string; note?: string };
export type StepsResult = { ok: boolean; steps: AutomationStep[]; source: string; note?: string };
export type RunEntry = {
  started_at: string; finished_at: string | null; duration_ms: number | null;
  status: string; detail: string | null;
};
export type RunsResult = { ok: boolean; runs: RunEntry[]; source: string; note?: string };

/** The n8n workflow id lives at the end of the "Open in n8n" endpoint URL. */
function n8nWorkflowId(endpoint: string | null): string | null {
  const m = String(endpoint ?? "").match(/\/workflow\/([A-Za-z0-9]+)/);
  return m?.[1] ?? null;
}

async function n8nGet(path: string): Promise<any> {
  const res = await fetch(`${N8N_BASE()}${path}`, {
    headers: { "X-N8N-API-KEY": N8N_KEY(), Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`n8n API ${res.status} for ${path}`);
  return res.json();
}

/** Walk the workflow graph from its trigger node(s) so steps read in execution order. */
function orderNodes(wf: any): AutomationStep[] {
  const nodes: any[] = wf?.nodes ?? [];
  const connections: Record<string, any> = wf?.connections ?? {};
  const byName = new Map(nodes.map((n) => [n.name, n]));

  const hasIncoming = new Set<string>();
  for (const outs of Object.values(connections)) {
    for (const branch of (outs as any).main ?? []) {
      for (const c of branch ?? []) hasIncoming.add(c.node);
    }
  }
  const roots = nodes.filter((n) => !hasIncoming.has(n.name));
  const ordered: string[] = [];
  const seen = new Set<string>();
  const queue = roots.map((n) => n.name);
  while (queue.length) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    ordered.push(name);
    for (const branch of (connections[name]?.main ?? [])) {
      for (const c of branch ?? []) queue.push(c.node);
    }
  }
  // Any disconnected nodes go at the end so nothing is hidden.
  for (const n of nodes) if (!seen.has(n.name)) ordered.push(n.name);

  return ordered.map((name) => {
    const n = byName.get(name) ?? {};
    const type = String(n.type ?? "").replace("n8n-nodes-base.", "");
    return { name, type, note: n.disabled ? "disabled" : undefined };
  });
}

export const getAutomationSteps = createServerFn({ method: "POST" })
  // @ts-expect-error — TanStack Start v1 serverFn handler typing
  .handler(async (ctx: { data: { key: string } }): Promise<StepsResult> => {
    const { data: a } = await db.from("automations")
      .select("key, source, endpoint, steps").eq("key", ctx.data.key).maybeSingle();
    if (!a) return { ok: false, steps: [], source: "unknown", note: "Automation not found" };

    if (Array.isArray(a.steps) && a.steps.length) {
      return { ok: true, steps: a.steps, source: a.source ?? "worker" };
    }

    if (a.source === "n8n") {
      const wfId = n8nWorkflowId(a.endpoint);
      if (!wfId) return { ok: false, steps: [], source: "n8n", note: "No workflow id on this automation" };
      if (!N8N_KEY()) {
        return { ok: false, steps: [], source: "n8n", note: "Set the N8N_API_KEY secret to pull workflow steps from n8n (Settings → n8n → API)." };
      }
      try {
        const wf = await n8nGet(`/api/v1/workflows/${wfId}`);
        const steps = orderNodes(wf);
        // Cache so subsequent opens are instant (refreshed whenever cache is cleared).
        await db.from("automations").update({ steps }).eq("key", a.key);
        return { ok: true, steps, source: "n8n" };
      } catch (e: any) {
        return { ok: false, steps: [], source: "n8n", note: `Could not reach the n8n API: ${e?.message ?? e}` };
      }
    }

    return { ok: false, steps: [], source: a.source ?? "worker", note: "No step metadata recorded for this automation yet." };
  });

export const getAutomationRuns = createServerFn({ method: "POST" })
  // @ts-expect-error — TanStack Start v1 serverFn handler typing
  .handler(async (ctx: { data: { key: string } }): Promise<RunsResult> => {
    const { data: a } = await db.from("automations")
      .select("key, source, endpoint").eq("key", ctx.data.key).maybeSingle();
    if (!a) return { ok: false, runs: [], source: "unknown", note: "Automation not found" };

    // n8n: live executions API — real status, start time and duration.
    if (a.source === "n8n") {
      const wfId = n8nWorkflowId(a.endpoint);
      if (!wfId || !N8N_KEY()) {
        return {
          ok: false, runs: [], source: "n8n",
          note: !wfId ? "No workflow id on this automation" : "Set the N8N_API_KEY secret to pull the execution log from n8n.",
        };
      }
      try {
        const res = await n8nGet(`/api/v1/executions?workflowId=${wfId}&limit=100&includeData=false`);
        const runs: RunEntry[] = (res?.data ?? []).map((e: any) => {
          const started = e.startedAt ?? e.createdAt;
          const stopped = e.stoppedAt ?? null;
          return {
            started_at: started,
            finished_at: stopped,
            duration_ms: started && stopped ? new Date(stopped).getTime() - new Date(started).getTime() : null,
            status: e.status ?? (e.finished ? "success" : "error"),
            detail: e.status === "error" ? (e?.data?.resultData?.error?.message ?? "failed") : null,
          };
        });
        return { ok: true, runs, source: "n8n" };
      } catch (e: any) {
        return { ok: false, runs: [], source: "n8n", note: `Could not reach the n8n API: ${e?.message ?? e}` };
      }
    }

    // Worker: our own automation_runs table.
    const { data: rows } = await db.from("automation_runs")
      .select("started_at, finished_at, status, detail")
      .eq("automation_key", a.key)
      .order("started_at", { ascending: false })
      .limit(100);
    const runs: RunEntry[] = (rows ?? []).map((r: any) => ({
      started_at: r.started_at,
      finished_at: r.finished_at,
      duration_ms: r.started_at && r.finished_at
        ? new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()
        : null,
      status: r.status,
      detail: r.detail,
    }));
    return { ok: true, runs, source: a.source ?? "worker" };
  });
