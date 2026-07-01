/**
 * Recruitment Dashboard tab — reads the 7 resolver views from migration 078
 * only, never the underlying tables directly, per the established Polaris
 * rule (same as v_inward_clearance_active for Port Calls).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, Briefcase, TrendingUp, Building2, Target, DollarSign, Award,
} from "lucide-react";

const db = () => supabase as any;

function fmtLabel(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function MetricCard({ title, icon: Icon, data }: { title: string; icon: React.ComponentType<{ className?: string }>; data: Record<string, any> | null }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-display text-sm font-semibold">{title}</h3>
      </div>
      {!data ? (
        <p className="text-xs text-muted-foreground">No data.</p>
      ) : (
        <dl className="space-y-1.5">
          {Object.entries(data).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-xs">
              <dt className="text-muted-foreground">{fmtLabel(k)}</dt>
              <dd className="font-semibold tabular-nums">{v == null ? "—" : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function PlacementDashboardTab() {
  const [recruitment, setRecruitment] = useState<Record<string, number> | null>(null);
  const [vacancies, setVacancies] = useState<Record<string, number> | null>(null);
  const [candidateStatus, setCandidateStatus] = useState<Record<string, number> | null>(null);
  const [clientActivity, setClientActivity] = useState<Record<string, number> | null>(null);
  const [kpis, setKpis] = useState<Record<string, number> | null>(null);
  const [revenueByClient, setRevenueByClient] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); }, []);
  async function load() {
    setLoading(true);
    const [rec, vac, cand, client, kpi, rev] = await Promise.all([
      db().from("v_recruitment_dashboard").select("*").single(),
      db().from("v_vacancy_dashboard").select("*").single(),
      db().from("v_candidate_status_summary").select("*").single(),
      db().from("v_client_activity").select("*").single(),
      db().from("v_recruitment_kpis").select("*").single(),
      db().from("v_revenue_by_client").select("*").order("total_recruitment_fees", { ascending: false }).limit(8),
    ]);
    setRecruitment(rec.data ?? null);
    setVacancies(vac.data ?? null);
    setCandidateStatus(cand.data ?? null);
    setClientActivity(client.data ?? null);
    setKpis(kpi.data ?? null);
    setRevenueByClient(rev.data ?? []);
    setLoading(false);
  }

  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">Loading dashboard…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <MetricCard title="Recruitment" icon={Users} data={recruitment} />
        <MetricCard title="Vacancies" icon={Briefcase} data={vacancies} />
        <MetricCard title="Candidate Status" icon={Target} data={candidateStatus} />
        <MetricCard title="Client Activity" icon={Building2} data={clientActivity} />
        <MetricCard title="KPIs" icon={TrendingUp} data={kpis} />
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-semibold">Revenue by Client</h3>
        </div>
        {revenueByClient.length === 0 ? (
          <p className="text-xs text-muted-foreground">No placement revenue recorded yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="py-1">Client</th><th className="py-1">Placements</th><th className="py-1">Total Fees</th>
            </tr></thead>
            <tbody>
              {revenueByClient.map((r) => (
                <tr key={r.client_id} className="border-t border-border/40">
                  <td className="py-1.5">{r.company_name}</td>
                  <td className="py-1.5">{r.placements}</td>
                  <td className="py-1.5 font-semibold">{r.total_recruitment_fees}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Award className="h-3.5 w-3.5" />
        Consultant performance is tracked via v_consultant_performance — surface once a per-consultant assignment concept exists on vacancies/applications.
      </div>
    </div>
  );
}

export default PlacementDashboardTab;
