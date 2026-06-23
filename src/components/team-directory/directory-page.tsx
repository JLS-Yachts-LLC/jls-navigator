import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Contact, Search, Loader2, Plus, Pencil, ShieldAlert, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import type { Department, ServiceRoute, StaffProfile } from "@/lib/directory/types";
import { QRF_PRIORITY } from "@/lib/directory/types";
import { StaffCard } from "./staff-card";
import { StaffProfileModal } from "./staff-profile-modal";
import { StaffFormDialog } from "./staff-form-dialog";
import { ContactActions, StaffAvatar } from "./contact-buttons";

// Internal JLS roles see every department; vessel users (captain/crew) are limited
// to departments flagged visible_to_vessel_users (POLARIS_TEAM_DIRECTORY.md §4.2/§5).
function useIsInternal(): boolean {
  const { user } = useAuth();
  const raw = (user as any)?.app_metadata?.role ?? "";
  return ["global_admin", "org_admin", "admin", "staff"].includes(raw);
}
function useIsAdmin(): boolean {
  const { user } = useAuth();
  const raw = (user as any)?.app_metadata?.role ?? "";
  return ["global_admin", "org_admin", "admin"].includes(raw);
}

const EMERGENCY_SLUG = "quick-reaction-force";

export function TeamDirectoryPage() {
  const isInternal = useIsInternal();
  const isAdmin = useIsAdmin();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [routes, setRoutes] = useState<ServiceRoute[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [activeDept, setActiveDept] = useState<string>("all"); // "all" | "emergency" | slug
  const [activeService, setActiveService] = useState<ServiceRoute | null>(null);
  const [selected, setSelected] = useState<StaffProfile | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffProfile | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const [d, s, r] = await Promise.all([
      fetchAllRows<Department>(() => (supabase as any).from("departments").select("*").eq("is_active", true).order("display_order")),
      fetchAllRows<StaffProfile>(() => (supabase as any).from("staff_profiles").select("*").eq("is_active", true).order("display_order")),
      fetchAllRows<ServiceRoute>(() => (supabase as any).from("service_routing").select("*").order("service_keyword")),
    ]);
    if (d.error || s.error || r.error) toast.error((d.error || s.error || r.error).message);
    setDepartments(d.data ?? []);
    setStaff(s.data ?? []);
    setRoutes(r.data ?? []);
    setLoading(false);
  }

  // Vessel users only ever see vessel-visible departments + the staff within them.
  const visibleDepts = useMemo(
    () => (isInternal ? departments : departments.filter((d) => d.visible_to_vessel_users)),
    [departments, isInternal],
  );
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);
  const visibleDeptIds = useMemo(() => new Set(visibleDepts.map((d) => d.id)), [visibleDepts]);
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const visibleStaff = useMemo(
    () => (isInternal ? staff : staff.filter((s) => s.department_id && visibleDeptIds.has(s.department_id))),
    [staff, isInternal, visibleDeptIds],
  );

  // Search across name, position, department, expertise, location, email, mobile (§6.1).
  const searched = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return visibleStaff;
    return visibleStaff.filter((p) => {
      const dept = p.department_id ? deptById.get(p.department_id)?.name : "";
      return [p.full_name, p.position, dept, (p.areas_of_expertise ?? []).join(" "), p.office_location, p.email, p.direct_mobile]
        .some((v) => String(v ?? "").toLowerCase().includes(s));
    });
  }, [visibleStaff, q, deptById]);

  const emergencyStaff = useMemo(() => {
    const rank = (p: StaffProfile) => {
      const i = QRF_PRIORITY.findIndex((t) => p.position.toLowerCase().includes(t.toLowerCase()));
      return i === -1 ? QRF_PRIORITY.length : i;
    };
    return visibleStaff.filter((p) => p.is_emergency_contact).sort((a, b) => rank(a) - rank(b) || (a.display_order ?? 999) - (b.display_order ?? 999));
  }, [visibleStaff]);

  const shownStaff = useMemo(() => {
    if (activeDept === "all") return searched;
    if (activeDept === "emergency") return emergencyStaff.filter((p) => searched.includes(p));
    const dept = visibleDepts.find((d) => d.slug === activeDept);
    return dept ? searched.filter((p) => p.department_id === dept.id) : searched;
  }, [activeDept, searched, emergencyStaff, visibleDepts]);

  // Group the "All" view by department for readability.
  const grouped = useMemo(() => {
    const map = new Map<string, StaffProfile[]>();
    for (const p of shownStaff) {
      const key = p.department_id && deptById.has(p.department_id) ? p.department_id : "_none";
      (map.get(key) ?? map.set(key, []).get(key)!).push(p);
    }
    return map;
  }, [shownStaff, deptById]);

  function openEdit(p: StaffProfile) { setEditing(p); setFormOpen(true); }

  const hasEmergency = emergencyStaff.length > 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/40 px-5 py-3">
        <div className="flex items-center gap-2">
          <Contact className="h-4 w-4 text-primary" />
          <h1 className="font-display text-base font-semibold">Team Directory</h1>
          <span className="text-xs text-muted-foreground">({visibleStaff.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, role, service…" className="h-8 w-64 pl-8 text-xs" />
          </div>
          {isAdmin && (
            <Button onClick={() => { setEditing(null); setFormOpen(true); }} size="sm" className="h-8 gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add Member
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mx-auto max-w-6xl space-y-5 p-5">
            {/* Smart service routing (§9) */}
            {routes.length > 0 && (
              <section className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <LifeBuoy className="h-4 w-4 text-primary" />
                  <h2 className="font-display text-sm font-semibold">What do you need help with?</h2>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {routes.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setActiveService(activeService?.id === r.id ? null : r)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        activeService?.id === r.id
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-foreground hover:border-primary/40 hover:bg-primary/5",
                      )}
                    >
                      {r.service_keyword}
                    </button>
                  ))}
                </div>
                {activeService && (
                  <ServiceRoutingResult
                    route={activeService}
                    department={activeService.department_id ? deptById.get(activeService.department_id) : undefined}
                    staffById={staffById}
                    deptStaff={visibleStaff.filter((p) => p.department_id === activeService.department_id)}
                    onOpen={setSelected}
                  />
                )}
              </section>
            )}

            {/* Department filter bar */}
            <div className="flex flex-wrap gap-1.5">
              <FilterPill label="All" active={activeDept === "all"} onClick={() => setActiveDept("all")} />
              {hasEmergency && (
                <FilterPill
                  label="Emergency"
                  icon={<ShieldAlert className="h-3 w-3" />}
                  active={activeDept === "emergency"}
                  onClick={() => setActiveDept("emergency")}
                  danger
                />
              )}
              {visibleDepts.map((d) => (
                <FilterPill key={d.id} label={`${d.icon ? d.icon + " " : ""}${d.name}`} active={activeDept === d.slug} onClick={() => setActiveDept(d.slug)} />
              ))}
            </div>

            {/* Staff grid */}
            {shownStaff.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
                <Contact className="h-10 w-10 opacity-30" />
                <p className="text-sm">
                  {q.trim().length >= 2 ? `No contacts matching "${q}".` : "No team members listed yet."}
                </p>
                {q.trim().length >= 2 && <p className="text-xs">Try searching by service type — e.g. “visa”, “bunkering”, “training”.</p>}
              </div>
            ) : activeDept === "all" ? (
              <div className="space-y-6">
                {[...grouped.entries()].map(([deptId, members]) => {
                  const dept = deptById.get(deptId);
                  return (
                    <div key={deptId}>
                      <div className="mb-2 flex items-center gap-2">
                        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {dept ? `${dept.icon ? dept.icon + " " : ""}${dept.name}` : "Unassigned"}
                        </h3>
                        <span className="text-[11px] text-muted-foreground/60">({members.length})</span>
                      </div>
                      <CardGrid members={members} deptById={deptById} onOpen={setSelected} isAdmin={isAdmin} onEdit={openEdit} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <CardGrid members={shownStaff} deptById={deptById} onOpen={setSelected} isAdmin={isAdmin} onEdit={openEdit} />
            )}
          </div>
        )}
      </div>

      <StaffProfileModal
        staff={selected}
        department={selected?.department_id ? deptById.get(selected.department_id) : undefined}
        onClose={() => setSelected(null)}
      />
      {isAdmin && (
        <StaffFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} departments={departments} onSaved={load} />
      )}
    </div>
  );
}

function CardGrid({
  members, deptById, onOpen, isAdmin, onEdit,
}: {
  members: StaffProfile[];
  deptById: Map<string, Department>;
  onOpen: (s: StaffProfile) => void;
  isAdmin: boolean;
  onEdit: (s: StaffProfile) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {members.map((p) => (
        <div key={p.id} className="relative">
          <StaffCard staff={p} department={p.department_id ? deptById.get(p.department_id) : undefined} onOpen={onOpen} />
          {isAdmin && (
            <button
              onClick={() => onEdit(p)}
              title="Edit"
              className="absolute right-2 top-2 rounded-md border border-border bg-card/80 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function FilterPill({
  label, active, onClick, icon, danger,
}: {
  label: string; active: boolean; onClick: () => void; icon?: React.ReactNode; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? danger ? "border-destructive bg-destructive/15 text-destructive" : "border-primary bg-primary/15 text-primary"
          : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40",
      )}
    >
      {icon} {label}
    </button>
  );
}

function ServiceRoutingResult({
  route, department, staffById, deptStaff, onOpen,
}: {
  route: ServiceRoute;
  department?: Department;
  staffById: Map<string, StaffProfile>;
  deptStaff: StaffProfile[];
  onOpen: (s: StaffProfile) => void;
}) {
  const primary = route.primary_contact_id ? staffById.get(route.primary_contact_id) : undefined;
  const secondary = route.secondary_contact_id ? staffById.get(route.secondary_contact_id) : undefined;
  const emergency = route.emergency_contact_id ? staffById.get(route.emergency_contact_id) : undefined;
  const named = [
    { role: "Primary Contact", p: primary },
    { role: "Secondary Contact", p: secondary },
    { role: "Emergency Contact", p: emergency },
  ].filter((x) => x.p) as { role: string; p: StaffProfile }[];

  const fallback = named.length === 0 ? deptStaff : [];

  return (
    <div className="mt-3 rounded-lg border border-border bg-background/60 p-3">
      <p className="text-xs text-muted-foreground">
        Service: <span className="text-foreground">{route.service_keyword}</span>
        {department && <> · Department: <span className="text-foreground">{department.name}</span></>}
      </p>
      <div className="mt-2 space-y-2">
        {named.map(({ role, p }) => (
          <ContactLine key={role} role={role} p={p} onOpen={onOpen} />
        ))}
        {fallback.map((p) => <ContactLine key={p.id} role={p.position} p={p} onOpen={onOpen} />)}
        {named.length === 0 && fallback.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No contact assigned yet. Reach our Port &amp; Agency Team at support@jlsyachts.com / +971 4 331 3555.
          </p>
        )}
      </div>
    </div>
  );
}

function ContactLine({ role, p, onOpen }: { role: string; p: StaffProfile; onOpen: (s: StaffProfile) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
      <button onClick={() => onOpen(p)} className="flex min-w-0 items-center gap-2 text-left">
        <StaffAvatar staff={p} className="h-8 w-8 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{p.full_name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{role}</p>
        </div>
      </button>
      <ContactActions staff={p} />
    </div>
  );
}
