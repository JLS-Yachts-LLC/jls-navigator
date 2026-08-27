/**
 * ORBIT → Approvals — the tiered spend approval desk.
 *
 * Three things in one place:
 *  • Desk: everything awaiting approval, showing the stage, who's next, and the
 *    amount both as the supplier quoted it and normalised to AED.
 *  • Limits: per-vessel captain/manager thresholds (fleet default when unset).
 *  • Rates: the FX table the normalisation uses — snapshotted onto each approval
 *    so a later rate change never rewrites an approval that already happened.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAccess } from "@/lib/auth/useAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ShieldCheck, Loader2, Check, X, Ship, TrendingUp, SlidersHorizontal,
  CircleDot, History, AlertTriangle, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  planApproval, advance, chainFor, currentApprover, canActOnStage,
  ROLE_LABELS, STATUS_LABELS,
  type ApprovalPolicy, type ApprovalStatus, type FxRates, type OrbitApproverRole,
} from "@/lib/orbit/approvals";

type Tab = "desk" | "limits" | "rates";

type Quotation = {
  id: string; request_id: string | null; supplier: string | null;
  amount: number | null; currency: string | null; amount_base: number | null;
  approval_status: ApprovalStatus; approval_stage: number; approval_total_stages: number;
  status: string | null; created_at: string;
  request?: { id: string; title: string | null; yacht_id: string | null; yachts?: { vessel_name: string } | null } | null;
};
type ApprovalRow = {
  id: string; quotation_id: string | null; request_id: string | null;
  stage_number: number; total_stages: number; approver_role: string | null;
  action: string | null; status: string | null; approved_by_name: string | null;
  amount_original: number | null; currency_original: string | null;
  amount_base: number | null; fx_rate: number | null; comments: string | null;
  approved_at: string | null; created_at: string;
};
type Policy = {
  id: string; yacht_id: string | null; captain_limit: number; manager_limit: number;
  base_currency: string; notes: string | null;
};
type Yacht = { id: string; vessel_name: string };

const fmt = (n: number, ccy = "AED") =>
  `${ccy} ${Number(n).toLocaleString("en-AE", { maximumFractionDigits: 2 })}`;
const fmtWhen = (d: string) =>
  new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const STATUS_STYLE: Record<ApprovalStatus, string> = {
  not_required: "bg-muted text-muted-foreground",
  awaiting_approval: "bg-amber-500/15 text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-400",
  auto_approved: "bg-sky-500/15 text-sky-400",
  rejected: "bg-red-500/15 text-red-400",
};

export function OrbitApprovalsPage() {
  const { user } = useAuth();
  const { isGlobalAdmin } = useAccess();
  const [tab, setTab] = useState<Tab>("desk");
  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [history, setHistory] = useState<ApprovalRow[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const db = supabase as any;
    const [q, h, p, r, y] = await Promise.all([
      db.from("orbit_quotations")
        .select("*, request:request_id(id, title, yacht_id, yachts(vessel_name))")
        .order("created_at", { ascending: false }).limit(200),
      db.from("orbit_approvals").select("*").order("created_at", { ascending: false }).limit(100),
      db.from("orbit_approval_policies").select("*"),
      db.from("orbit_fx_rates").select("*").order("currency"),
      db.from("yachts").select("id, vessel_name").eq("archive", false).order("vessel_name"),
    ]);
    setQuotes((q.data ?? []) as Quotation[]);
    setHistory((h.data ?? []) as ApprovalRow[]);
    setPolicies((p.data ?? []) as Policy[]);
    setRates(Object.fromEntries(((r.data ?? []) as any[]).map(x => [x.currency, Number(x.rate_to_aed)])));
    setYachts((y.data ?? []) as Yacht[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const fleetDefault = policies.find(p => !p.yacht_id);
  const policyFor = useCallback((yachtId: string | null | undefined): ApprovalPolicy => {
    const own = yachtId ? policies.find(p => p.yacht_id === yachtId) : null;
    const src = own ?? fleetDefault;
    return {
      captainLimit: Number(src?.captain_limit ?? 5000),
      managerLimit: Number(src?.manager_limit ?? 50000),
      baseCurrency: src?.base_currency ?? "AED",
    };
  }, [policies, fleetDefault]);

  /** The user's approval roles. Kept simple until ORBIT roles are assigned:
   *  admins can act on any stage, everyone else needs an explicit role. */
  const myRoles = useMemo<OrbitApproverRole[]>(() => (isGlobalAdmin ? ["captain", "technical_manager", "owner"] : []), [isGlobalAdmin]);

  const pending = useMemo(
    () => quotes.filter(q => q.approval_status === "awaiting_approval"),
    [quotes],
  );
  const unsubmitted = useMemo(
    () => quotes.filter(q => q.approval_status === "not_required" && (q.amount ?? 0) > 0),
    [quotes],
  );

  // ── Actions ─────────────────────────────────────────────────────────────────

  /** Submit a quotation into the chain — computes the stages from its value. */
  async function submitForApproval(q: Quotation) {
    setBusy(q.id);
    try {
      const policy = policyFor(q.request?.yacht_id);
      const plan = planApproval(Number(q.amount ?? 0), q.currency ?? policy.baseCurrency, policy, rates as FxRates);
      const db = supabase as any;

      const { error: upErr } = await db.from("orbit_quotations").update({
        approval_status: plan.initialStatus,
        approval_stage: 0,
        approval_total_stages: plan.totalStages,
        amount_base: plan.amountBase,
      }).eq("id", q.id);
      if (upErr) throw upErr;

      // Audit: the submission itself, with the rate that produced the figure.
      await db.from("orbit_approvals").insert([{
        quotation_id: q.id,
        request_id: q.request_id,
        yacht_id: q.request?.yacht_id ?? null,
        stage_number: 0,
        total_stages: plan.totalStages,
        approver_role: "submitter",
        action: plan.initialStatus === "auto_approved" ? "auto_approved" : "submitted",
        status: plan.initialStatus,
        approved_by_name: user?.email ?? null,
        approver_id: user?.id ?? null,
        amount_original: q.amount,
        currency_original: (q.currency ?? policy.baseCurrency).toUpperCase(),
        amount_base: plan.amountBase,
        fx_rate: (rates as FxRates)[(q.currency ?? policy.baseCurrency).toUpperCase()] ?? 1,
        comments: plan.rationale,
        approved_at: new Date().toISOString(),
      }]);

      toast.success(plan.initialStatus === "auto_approved" ? "Auto-approved" : `Submitted — ${plan.totalStages} approvals needed`, {
        description: plan.rationale,
      });
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not submit for approval");
    } finally { setBusy(null); }
  }

  /** Record one stage decision. */
  async function decide(q: Quotation, action: "approve" | "reject") {
    setBusy(q.id);
    try {
      const policy = policyFor(q.request?.yacht_id);
      const chain = chainFor(Number(q.amount_base ?? 0), policy);
      const role = currentApprover(chain, q.approval_stage);
      if (!role) throw new Error("This quotation has no outstanding approval stage.");
      if (!canActOnStage(chain, q.approval_stage, myRoles, isGlobalAdmin)) {
        throw new Error(`Stage ${q.approval_stage + 1} needs the ${ROLE_LABELS[role]} — you can't approve this one.`);
      }

      const next = advance(chain, q.approval_stage, action);
      const db = supabase as any;

      await db.from("orbit_approvals").insert([{
        quotation_id: q.id,
        request_id: q.request_id,
        yacht_id: q.request?.yacht_id ?? null,
        stage_number: q.approval_stage + 1,
        total_stages: chain.length,
        approver_role: role,
        action: action === "approve" ? "approved" : "rejected",
        status: next.status,
        approved_by_name: user?.email ?? null,
        approver_id: user?.id ?? null,
        // Snapshot what THIS approver saw, at the rate in force right now.
        amount_original: q.amount,
        currency_original: (q.currency ?? policy.baseCurrency).toUpperCase(),
        amount_base: q.amount_base,
        fx_rate: (rates as FxRates)[(q.currency ?? policy.baseCurrency).toUpperCase()] ?? 1,
        comments: note[q.id]?.trim() || null,
        approved_at: new Date().toISOString(),
      }]);

      await db.from("orbit_quotations").update({
        approval_status: next.status,
        approval_stage: next.stage,
        ...(next.complete && action === "approve" ? { status: "accepted", reviewed_at: new Date().toISOString() } : {}),
        ...(action === "reject" ? { status: "rejected" } : {}),
      }).eq("id", q.id);

      setNote(prev => ({ ...prev, [q.id]: "" }));
      toast.success(
        action === "reject" ? "Rejected" :
        next.complete ? "Approved — chain complete" : `Stage ${next.stage} approved — next: ${ROLE_LABELS[currentApprover(chain, next.stage)!]}`,
      );
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not record the decision");
    } finally { setBusy(null); }
  }

  async function savePolicy(yachtId: string | null, captain: number, manager: number) {
    if (manager < captain) { toast.error("The manager limit must be at least the captain limit"); return; }
    const db = supabase as any;
    const existing = policies.find(p => (p.yacht_id ?? null) === yachtId);
    const row = {
      yacht_id: yachtId, captain_limit: captain, manager_limit: manager,
      base_currency: fleetDefault?.base_currency ?? "AED",
      updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
    };
    const { error } = existing
      ? await db.from("orbit_approval_policies").update(row).eq("id", existing.id)
      : await db.from("orbit_approval_policies").insert([row]);
    if (error) toast.error(error.message);
    else { toast.success(yachtId ? "Vessel limits saved" : "Fleet default saved"); await load(); }
  }

  async function saveRate(currency: string, rate: number) {
    if (!(rate > 0)) { toast.error("Rate must be greater than zero"); return; }
    const { error } = await (supabase as any).from("orbit_fx_rates").upsert({
      currency: currency.toUpperCase(), rate_to_aed: rate,
      updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
    }, { onConflict: "currency" });
    if (error) toast.error(error.message);
    else { toast.success(`${currency.toUpperCase()} rate saved`); await load(); }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "desk", label: "Approval Desk", icon: ShieldCheck },
    { key: "limits", label: "Limits", icon: SlidersHorizontal },
    { key: "rates", label: "Exchange Rates", icon: TrendingUp },
  ];

  if (loading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading approvals…</div>;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm font-semibold">Spend Approvals</h2>
        <span className="text-[11px] text-muted-foreground">
          How many approvals a cost needs is set by its value — small spend clears itself.
        </span>
        <div className="ml-auto flex gap-1">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition",
                  tab === t.key ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground")}>
                <Icon className="h-3.5 w-3.5" /> {t.label}
                {t.key === "desk" && pending.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-400">{pending.length}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Desk ── */}
      {tab === "desk" && (
        <div className="space-y-4">
          {/* Awaiting approval */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <CircleDot className="h-4 w-4 text-amber-400" /> Awaiting approval
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{pending.length}</span>
            </h3>
            {pending.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing waiting. Quotations over the captain's limit appear here once submitted.</p>
            ) : pending.map(q => {
              const policy = policyFor(q.request?.yacht_id);
              const chain = chainFor(Number(q.amount_base ?? 0), policy);
              const role = currentApprover(chain, q.approval_stage);
              const mine = canActOnStage(chain, q.approval_stage, myRoles, isGlobalAdmin);
              return (
                <div key={q.id} className="mb-2 rounded-lg border border-border/70 bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{q.request?.title ?? "Quotation"}</span>
                    {q.request?.yachts?.vessel_name && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Ship className="h-3 w-3" /> {q.request.yachts.vessel_name}
                      </span>
                    )}
                    <span className="ml-auto font-mono text-sm">
                      {fmt(Number(q.amount ?? 0), (q.currency ?? "AED").toUpperCase())}
                      {(q.currency ?? "AED").toUpperCase() !== policy.baseCurrency && (
                        <span className="ml-1.5 text-[11px] text-muted-foreground">
                          = {fmt(Number(q.amount_base ?? 0), policy.baseCurrency)}
                        </span>
                      )}
                    </span>
                  </div>
                  {/* Stage tracker */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                    {chain.map((r, i) => (
                      <span key={r} className="flex items-center gap-1.5">
                        <span className={cn("rounded-full px-2 py-0.5 font-medium",
                          i < q.approval_stage ? "bg-emerald-500/15 text-emerald-400"
                          : i === q.approval_stage ? "bg-amber-500/15 text-amber-400"
                          : "bg-muted text-muted-foreground")}>
                          {i < q.approval_stage ? "✓ " : ""}{ROLE_LABELS[r]}
                        </span>
                        {i < chain.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
                      </span>
                    ))}
                    <span className="ml-1 text-muted-foreground">· {q.supplier ?? "supplier not set"}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Input value={note[q.id] ?? ""} onChange={e => setNote(p => ({ ...p, [q.id]: e.target.value }))}
                      placeholder="Comment (recorded on the approval)" className="h-9 flex-1 min-w-[200px] text-xs" />
                    <Button size="sm" className="h-9" disabled={busy === q.id || !mine} onClick={() => void decide(q, "approve")}>
                      {busy === q.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                      Approve stage {q.approval_stage + 1}
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 border-red-500/40 text-red-400 hover:bg-red-500/10"
                      disabled={busy === q.id || !mine} onClick={() => void decide(q, "reject")}>
                      <X className="mr-1.5 h-3.5 w-3.5" /> Reject
                    </Button>
                  </div>
                  {!mine && role && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-400/90">
                      <AlertTriangle className="h-3 w-3" /> Stage {q.approval_stage + 1} is the {ROLE_LABELS[role]}'s to approve.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quotations not yet submitted */}
          {unsubmitted.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-1 text-sm font-semibold">Not yet submitted</h3>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Submitting works out the approvals needed from the value — anything within the captain's limit clears immediately.
              </p>
              {unsubmitted.slice(0, 12).map(q => {
                const policy = policyFor(q.request?.yacht_id);
                let preview = "";
                try {
                  preview = planApproval(Number(q.amount ?? 0), q.currency ?? policy.baseCurrency, policy, rates as FxRates).rationale;
                } catch (e: any) { preview = e.message; }
                return (
                  <div key={q.id} className="mb-1.5 flex flex-wrap items-center gap-2 rounded-lg bg-muted/20 px-3 py-2 text-xs">
                    <span className="font-medium">{q.request?.title ?? "Quotation"}</span>
                    <span className="text-muted-foreground">{q.supplier ?? "—"}</span>
                    <span className="font-mono">{fmt(Number(q.amount ?? 0), (q.currency ?? "AED").toUpperCase())}</span>
                    <span className="w-full text-[11px] text-muted-foreground sm:w-auto sm:flex-1">{preview}</span>
                    <Button size="sm" variant="outline" className="h-8" disabled={busy === q.id}
                      onClick={() => void submitForApproval(q)}>
                      {busy === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Submit"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Audit trail */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4 text-primary" /> Approval history
            </h3>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">No approvals recorded yet.</p>
            ) : history.slice(0, 25).map(h => (
              <div key={h.id} className="mb-1 flex flex-wrap items-center gap-2 border-b border-border/40 py-1.5 text-[11px] last:border-0">
                <span className={cn("rounded-full px-1.5 py-0.5 font-semibold",
                  h.action === "rejected" ? "bg-red-500/15 text-red-400"
                  : h.action === "submitted" ? "bg-muted text-muted-foreground"
                  : "bg-emerald-500/15 text-emerald-400")}>
                  {h.action === "auto_approved" ? "Auto-approved" : h.action ? h.action[0].toUpperCase() + h.action.slice(1) : "—"}
                </span>
                {h.stage_number > 0 && <span className="text-muted-foreground">Stage {h.stage_number}/{h.total_stages}</span>}
                {h.approver_role && h.approver_role !== "submitter" && (
                  <span className="font-medium">{ROLE_LABELS[h.approver_role as OrbitApproverRole] ?? h.approver_role}</span>
                )}
                {h.amount_original != null && (
                  <span className="font-mono text-muted-foreground">
                    saw {fmt(Number(h.amount_original), h.currency_original ?? "AED")}
                    {h.currency_original && h.currency_original !== "AED" && ` @ ${h.fx_rate}`}
                  </span>
                )}
                <span className="text-muted-foreground">{h.approved_by_name ?? ""}</span>
                <span className="ml-auto text-muted-foreground/70">{fmtWhen(h.approved_at ?? h.created_at)}</span>
                {h.comments && <span className="w-full italic text-muted-foreground">{h.comments}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Limits ── */}
      {tab === "limits" && (
        <div className="space-y-3">
          <PolicyRow label="Fleet default" sub="Used by any vessel without its own limits"
            policy={fleetDefault} base={fleetDefault?.base_currency ?? "AED"}
            onSave={(c, m) => void savePolicy(null, c, m)} />
          {yachts.map(y => {
            const own = policies.find(p => p.yacht_id === y.id);
            return (
              <PolicyRow key={y.id} label={y.vessel_name}
                sub={own ? "Vessel-specific limits" : "Following the fleet default"}
                policy={own} fallback={fleetDefault} base={fleetDefault?.base_currency ?? "AED"}
                onSave={(c, m) => void savePolicy(y.id, c, m)} />
            );
          })}
        </div>
      )}

      {/* ── Rates ── */}
      {tab === "rates" && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-1 text-sm font-semibold">Exchange rates to AED</h3>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Used to normalise foreign quotes before the limits are applied. The rate in force is copied onto
            each approval, so changing a rate here never alters an approval already recorded.
          </p>
          <div className="space-y-1.5">
            {Object.entries(rates).sort(([a], [b]) => a.localeCompare(b)).map(([ccy, rate]) => (
              <RateRow key={ccy} currency={ccy} rate={rate} onSave={r => void saveRate(ccy, r)} />
            ))}
          </div>
          <AddRate onSave={(c, r) => void saveRate(c, r)} />
        </div>
      )}
    </div>
  );
}

// ── Small sub-components ───────────────────────────────────────────────────────

function PolicyRow({ label, sub, policy, fallback, base, onSave }: {
  label: string; sub: string; policy?: Policy | null; fallback?: Policy | null; base: string;
  onSave: (captain: number, manager: number) => void;
}) {
  const eff = policy ?? fallback;
  const [captain, setCaptain] = useState(String(eff?.captain_limit ?? 5000));
  const [manager, setManager] = useState(String(eff?.manager_limit ?? 50000));
  useEffect(() => {
    setCaptain(String((policy ?? fallback)?.captain_limit ?? 5000));
    setManager(String((policy ?? fallback)?.manager_limit ?? 50000));
  }, [policy, fallback]);
  const dirty = String(eff?.captain_limit ?? "") !== captain || String(eff?.manager_limit ?? "") !== manager;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
      <div className="min-w-[160px]">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">{sub}</div>
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground">Auto-approve up to ({base})</label>
        <Input value={captain} onChange={e => setCaptain(e.target.value)} inputMode="numeric" className="h-9 w-32 text-xs" />
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground">Manager approves up to ({base})</label>
        <Input value={manager} onChange={e => setManager(e.target.value)} inputMode="numeric" className="h-9 w-32 text-xs" />
      </div>
      <div className="text-[11px] text-muted-foreground">
        Above that → Owner / Client
      </div>
      <Button size="sm" className="ml-auto h-9" disabled={!dirty}
        onClick={() => onSave(Number(captain) || 0, Number(manager) || 0)}>
        Save
      </Button>
    </div>
  );
}

function RateRow({ currency, rate, onSave }: { currency: string; rate: number; onSave: (r: number) => void }) {
  const [val, setVal] = useState(String(rate));
  useEffect(() => { setVal(String(rate)); }, [rate]);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/20 px-3 py-2">
      <span className="w-14 font-mono text-sm font-semibold">{currency}</span>
      <span className="text-[11px] text-muted-foreground">1 {currency} =</span>
      <Input value={val} onChange={e => setVal(e.target.value)} inputMode="decimal"
        className="h-8 w-28 text-xs" disabled={currency === "AED"} />
      <span className="text-[11px] text-muted-foreground">AED</span>
      <Button size="sm" variant="outline" className="ml-auto h-8"
        disabled={currency === "AED" || String(rate) === val}
        onClick={() => onSave(Number(val))}>
        Save
      </Button>
    </div>
  );
}

function AddRate({ onSave }: { onSave: (currency: string, rate: number) => void }) {
  const [ccy, setCcy] = useState("");
  const [rate, setRate] = useState("");
  return (
    <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
      <Input value={ccy} onChange={e => setCcy(e.target.value.toUpperCase().slice(0, 3))}
        placeholder="CCY" className="h-8 w-20 text-xs" />
      <Input value={rate} onChange={e => setRate(e.target.value)} inputMode="decimal"
        placeholder="Rate to AED" className="h-8 w-32 text-xs" />
      <Button size="sm" variant="outline" className="h-8" disabled={ccy.length < 3 || !(Number(rate) > 0)}
        onClick={() => { onSave(ccy, Number(rate)); setCcy(""); setRate(""); }}>
        Add currency
      </Button>
    </div>
  );
}
