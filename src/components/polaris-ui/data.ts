/**
 * Polaris Redesign — shared data hook for the preview screens (#195).
 * Reads live yacht/crew/visa data via the browser Supabase client (RLS-scoped),
 * and classifies each crew member with the shared visa-status logic. Vessel-scoped:
 * every query filters by yacht_id (spec rule #6).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getVisaStatus,
  type VisaStatus,
} from "@/lib/visa-reporting/statusHelpers";

export interface YachtOption {
  id: string;
  vessel_name: string | null;
  send_visa_reports: boolean | null;
  visa_report_email: string | null;
}

export interface CrewVisaRow {
  crewId: string;
  name: string;
  rank: string | null;
  nationality: string | null;
  visaType: string | null;
  expiry: string | null;
  status: VisaStatus;
  daysRemaining: number | null;
  daysOverdue: number | null;
}

export interface VesselVisaData {
  loading: boolean;
  rows: CrewVisaRow[];
  counts: {
    total: number;
    active: number;
    expiring: number;
    expired: number;
    noVisa: number;
  };
}

export function useYachts(): { yachts: YachtOption[]; loading: boolean } {
  const [yachts, setYachts] = useState<YachtOption[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any)
        .from("yachts")
        .select("id, vessel_name, send_visa_reports, visa_report_email")
        .order("vessel_name", { ascending: true });
      setYachts((data ?? []) as YachtOption[]);
      setLoading(false);
    })();
  }, []);
  return { yachts, loading };
}

const EXCLUDED = new Set(["cancelled", "sign off", "signed off"]);

/** Days-to-expiry → simple traffic-light state (expiring window = 90 days). */
function expiryState(d: string | null): "active" | "expiring_soon" | "expired" | "none" {
  if (!d) return "none";
  const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  if (Number.isNaN(days)) return "none";
  if (days < 0) return "expired";
  if (days <= 90) return "expiring_soon";
  return "active";
}

// ── Immigration: visa applications pipeline (per vessel) ──────────────────────
export interface VisaAppRow {
  id: string; name: string; visaType: string | null; status: string;
  destination: string | null; reference: string | null;
}
export interface VesselImmigration {
  loading: boolean;
  rows: VisaAppRow[];
  counts: { total: number; draft: number; inProgress: number; approved: number; rejected: number };
}
export function useVesselImmigration(yachtId: string | null): VesselImmigration {
  const [state, setState] = useState<VesselImmigration>({
    loading: true, rows: [], counts: { total: 0, draft: 0, inProgress: 0, approved: 0, rejected: 0 },
  });
  useEffect(() => {
    if (!yachtId) return;
    void (async () => {
      setState((s) => ({ ...s, loading: true }));
      const { data } = await (supabase as any)
        .from("visa_applications")
        .select("id, given_name, surname, visa_type, status, destination_country, jls_reference, created_at")
        .eq("yacht_id", yachtId)
        .order("created_at", { ascending: false })
        .limit(300);
      const rows: VisaAppRow[] = ((data ?? []) as any[]).map((v) => ({
        id: v.id,
        name: [v.given_name, v.surname].filter(Boolean).join(" ") || "—",
        visaType: v.visa_type ?? null,
        status: String(v.status ?? "draft"),
        destination: v.destination_country ?? null,
        reference: v.jls_reference ?? null,
      }));
      const has = (s: string) => rows.filter((r) => r.status.toLowerCase() === s).length;
      const counts = {
        total: rows.length,
        draft: has("draft"),
        approved: has("approved"),
        rejected: has("rejected") + has("cancelled"),
        inProgress: rows.filter((r) => ["submitted", "in_progress", "pending", "processing"].includes(r.status.toLowerCase())).length,
      };
      setState({ loading: false, rows, counts });
    })();
  }, [yachtId]);
  return state;
}

// ── Logistics: ShipSync packages (per vessel, by boat name) ───────────────────
export interface PackageRow {
  id: string; barcode: string | null; owner: string | null; courier: string | null;
  status: string; receivedAt: string | null; num: number | null;
}
export interface VesselLogistics {
  loading: boolean;
  rows: PackageRow[];
  counts: { total: number; awaiting: number; inTransit: number; delivered: number };
}
export function useVesselLogistics(vesselName: string | null): VesselLogistics {
  const [state, setState] = useState<VesselLogistics>({
    loading: true, rows: [], counts: { total: 0, awaiting: 0, inTransit: 0, delivered: 0 },
  });
  useEffect(() => {
    if (!vesselName) return;
    void (async () => {
      setState((s) => ({ ...s, loading: true }));
      const { data } = await (supabase as any)
        .from("shipsync_packages")
        .select("id, barcode, package_owner, courier, status, num_packages, received_at, boat_name")
        .ilike("boat_name", vesselName)
        .order("received_at", { ascending: false })
        .limit(300);
      const rows: PackageRow[] = ((data ?? []) as any[]).map((p) => ({
        id: p.id, barcode: p.barcode ?? null, owner: p.package_owner ?? null,
        courier: p.courier ?? null, status: String(p.status ?? "in_office"),
        receivedAt: p.received_at ?? null, num: p.num_packages ?? null,
      }));
      const inSet = (s: string, set: string[]) => set.includes(s.toLowerCase());
      const counts = {
        total: rows.length,
        awaiting: rows.filter((r) => inSet(r.status, ["in_office", "in_storage", "to_collect"])).length,
        inTransit: rows.filter((r) => inSet(r.status, ["assigned", "out_for_delivery"])).length,
        delivered: rows.filter((r) => inSet(r.status, ["delivered", "collected"])).length,
      };
      setState({ loading: false, rows, counts });
    })();
  }, [vesselName]);
  return state;
}

// Crew ids + names for a vessel (used to scope training / documents to the vessel).
async function crewForVessel(yachtId: string): Promise<{ ids: string[]; nameById: Map<string, string> }> {
  const { data } = await (supabase as any).from("crew_members").select("id, full_name").eq("yacht_id", yachtId);
  const nameById = new Map<string, string>();
  for (const c of (data ?? []) as any[]) nameById.set(c.id, c.full_name ?? "—");
  return { ids: Array.from(nameById.keys()), nameById };
}

// ── Training: certifications for the vessel's crew ────────────────────────────
export interface CertRow {
  id: string; crewName: string; certificate: string | null; issuer: string | null;
  expiry: string | null; state: "active" | "expiring_soon" | "expired" | "none";
}
export interface VesselTraining {
  loading: boolean;
  rows: CertRow[];
  counts: { total: number; valid: number; expiring: number; expired: number };
}
export function useVesselTraining(yachtId: string | null): VesselTraining {
  const [state, setState] = useState<VesselTraining>({
    loading: true, rows: [], counts: { total: 0, valid: 0, expiring: 0, expired: 0 },
  });
  useEffect(() => {
    if (!yachtId) return;
    void (async () => {
      setState((s) => ({ ...s, loading: true }));
      const { ids, nameById } = await crewForVessel(yachtId);
      if (!ids.length) { setState({ loading: false, rows: [], counts: { total: 0, valid: 0, expiring: 0, expired: 0 } }); return; }
      const { data } = await (supabase as any)
        .from("training_certifications")
        .select("id, crew_member_id, crew_name, certificate, cert_type, issuing_body, expiry_date")
        .in("crew_member_id", ids)
        .order("expiry_date", { ascending: true })
        .limit(400);
      const rows: CertRow[] = ((data ?? []) as any[]).map((c) => ({
        id: c.id,
        crewName: c.crew_name ?? nameById.get(c.crew_member_id) ?? "—",
        certificate: c.certificate ?? c.cert_type ?? null,
        issuer: c.issuing_body ?? null,
        expiry: c.expiry_date ?? null,
        state: expiryState(c.expiry_date ?? null),
      }));
      const counts = {
        total: rows.length,
        valid: rows.filter((r) => r.state === "active").length,
        expiring: rows.filter((r) => r.state === "expiring_soon").length,
        expired: rows.filter((r) => r.state === "expired").length,
      };
      setState({ loading: false, rows, counts });
    })();
  }, [yachtId]);
  return state;
}

// ── Crew documents for the vessel's crew ──────────────────────────────────────
export interface DocRow {
  id: string; crewName: string; title: string | null; docType: string | null;
  expiry: string | null; state: "active" | "expiring_soon" | "expired" | "none"; fileUrl: string | null;
}
export interface VesselDocuments {
  loading: boolean;
  rows: DocRow[];
  counts: { total: number; valid: number; expiring: number; expired: number };
}
export function useVesselDocuments(yachtId: string | null): VesselDocuments {
  const [state, setState] = useState<VesselDocuments>({
    loading: true, rows: [], counts: { total: 0, valid: 0, expiring: 0, expired: 0 },
  });
  useEffect(() => {
    if (!yachtId) return;
    void (async () => {
      setState((s) => ({ ...s, loading: true }));
      const { ids, nameById } = await crewForVessel(yachtId);
      if (!ids.length) { setState({ loading: false, rows: [], counts: { total: 0, valid: 0, expiring: 0, expired: 0 } }); return; }
      const { data } = await (supabase as any)
        .from("crew_documents")
        .select("id, crew_member_id, doc_type, title, file_url, expiry_date")
        .in("crew_member_id", ids)
        .order("expiry_date", { ascending: true })
        .limit(400);
      const rows: DocRow[] = ((data ?? []) as any[]).map((d) => ({
        id: d.id,
        crewName: nameById.get(d.crew_member_id) ?? "—",
        title: d.title ?? null,
        docType: d.doc_type ?? null,
        expiry: d.expiry_date ?? null,
        state: expiryState(d.expiry_date ?? null),
        fileUrl: d.file_url ?? null,
      }));
      const counts = {
        total: rows.length,
        valid: rows.filter((r) => r.state === "active" || r.state === "none").length,
        expiring: rows.filter((r) => r.state === "expiring_soon").length,
        expired: rows.filter((r) => r.state === "expired").length,
      };
      setState({ loading: false, rows, counts });
    })();
  }, [yachtId]);
  return state;
}

export interface MovementRow {
  id: string;
  crewName: string;
  eventType: string; // 'sign_on' | 'sign_off'
  eventDate: string | null;
  port: string | null;
  flightNumber: string | null;
  status: string | null;
}

export interface VesselMovements {
  loading: boolean;
  rows: MovementRow[];
  counts: { onboard: number; signOns: number; signOffs: number; upcoming: number };
}

/** Crew sign-on/off movements for a vessel (most recent first), with crew names. */
export function useVesselMovements(yachtId: string | null): VesselMovements {
  const [state, setState] = useState<VesselMovements>({
    loading: true,
    rows: [],
    counts: { onboard: 0, signOns: 0, signOffs: 0, upcoming: 0 },
  });

  useEffect(() => {
    if (!yachtId) return;
    void (async () => {
      setState((s) => ({ ...s, loading: true }));
      const { data: events } = await (supabase as any)
        .from("crew_signon_events")
        .select("id, crew_member_id, event_type, event_date, port, flight_number, status")
        .eq("yacht_id", yachtId)
        .order("event_date", { ascending: false })
        .limit(200);
      const evs = (events ?? []) as any[];

      const ids = Array.from(new Set(evs.map((e) => e.crew_member_id).filter(Boolean)));
      const nameById = new Map<string, string>();
      if (ids.length) {
        const { data: crew } = await (supabase as any)
          .from("crew_members").select("id, full_name").in("id", ids);
        for (const c of (crew ?? []) as any[]) nameById.set(c.id, c.full_name ?? "—");
      }

      const rows: MovementRow[] = evs.map((e) => ({
        id: e.id,
        crewName: nameById.get(e.crew_member_id) ?? "—",
        eventType: e.event_type ?? "",
        eventDate: e.event_date ?? null,
        port: e.port ?? null,
        flightNumber: e.flight_number ?? null,
        status: e.status ?? null,
      }));

      // Currently onboard = crew whose most recent movement is a sign-on.
      const latestByCrew = new Map<string, any>();
      for (const e of evs) if (!latestByCrew.has(e.crew_member_id)) latestByCrew.set(e.crew_member_id, e);
      let onboard = 0;
      for (const e of latestByCrew.values()) if (String(e.event_type).includes("on")) onboard++;

      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const inWeek = (d: string | null) => !!d && d >= weekAgo && d <= today;
      const counts = {
        onboard,
        signOns: evs.filter((e) => String(e.event_type).includes("on") && inWeek(e.event_date)).length,
        signOffs: evs.filter((e) => String(e.event_type).includes("off") && inWeek(e.event_date)).length,
        upcoming: evs.filter((e) => (e.event_date ?? "") > today).length,
      };

      setState({ loading: false, rows, counts });
    })();
  }, [yachtId]);

  return state;
}

export function useVesselVisaData(
  yachtId: string | null,
): VesselVisaData & { reload: () => void } {
  const [state, setState] = useState<VesselVisaData>({
    loading: true,
    rows: [],
    counts: { total: 0, active: 0, expiring: 0, expired: 0, noVisa: 0 },
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));

    // yachtId === null → GLOBAL: aggregate visa compliance across the whole fleet.
    const crewQ = (supabase as any)
      .from("crew_members")
      .select("id, full_name, rank, status, nationality")
      .limit(20000);
    const visaQ = (supabase as any)
      .from("visa_applications")
      .select("crew_member_id, visa_type, visa_expiry, status")
      .eq("status", "approved")
      .limit(20000);
    const [{ data: crew }, { data: visas }] = await Promise.all([
      yachtId ? crewQ.eq("yacht_id", yachtId) : crewQ,
      yachtId ? visaQ.eq("yacht_id", yachtId) : visaQ,
    ]);

    // latest approved visa per crew member (by expiry desc)
    const byCrew = new Map<
      string,
      { visa_type: string | null; visa_expiry: string | null }
    >();
    for (const v of (visas ?? []) as any[]) {
      const prev = byCrew.get(v.crew_member_id);
      if (!prev || (v.visa_expiry ?? "") > (prev.visa_expiry ?? ""))
        byCrew.set(v.crew_member_id, {
          visa_type: v.visa_type,
          visa_expiry: v.visa_expiry,
        });
    }

    const rows: CrewVisaRow[] = ((crew ?? []) as any[])
      .filter((c) => !EXCLUDED.has(String(c.status ?? "").toLowerCase()))
      .map((c) => {
        const v = byCrew.get(c.id);
        const st = getVisaStatus(v?.visa_expiry ?? null);
        return {
          crewId: c.id,
          name: c.full_name ?? "—",
          rank: c.rank ?? null,
          nationality: c.nationality ?? null,
          visaType: v?.visa_type ?? null,
          expiry: v?.visa_expiry ?? null,
          status: st.status,
          daysRemaining: st.daysRemaining,
          daysOverdue: st.daysOverdue,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const counts = {
      total: rows.length,
      active: rows.filter((r) => r.status === "active").length,
      expiring: rows.filter((r) => r.status === "expiring_soon").length,
      expired: rows.filter((r) => r.status === "expired").length,
      noVisa: rows.filter((r) => r.status === "no_visa").length,
    };

    setState({ loading: false, rows, counts });
  }, [yachtId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: () => void load() };
}
