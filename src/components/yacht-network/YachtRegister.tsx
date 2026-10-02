/**
 * The register: every system aboard, grouped by discipline.
 *
 * This is where the detail actually gets entered — the canvas is the pretty
 * view of the same rows. Contract dates are highlighted here rather than
 * anywhere else because this is the list someone scans before a trip.
 */
import { useMemo, useState } from "react";
import {
  DISCIPLINES, disciplineMeta, statusMeta, criticalityMeta, daysUntil,
  CONTRACT_WARN_DAYS, dattoPresence,
  type Discipline, type YachtSystem, type DattoDevice,
} from "@/components/yacht-network/taxonomy";
import { Search, X, Plus, ChevronDown, Layers, ServerCog } from "lucide-react";

export function YachtRegister({ systems, dattoByUid, selectedId, onSelect, onAddSystem, readOnly = false }: {
  systems: YachtSystem[];
  dattoByUid: Map<string, DattoDevice>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddSystem: (discipline: Discipline) => void;
  /** View-only access: rows still open, nothing can be added. */
  readOnly?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [discipline, setDiscipline] = useState<Discipline | "all">("all");
  const [addOpen, setAddOpen] = useState(false);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of systems) out[s.discipline] = (out[s.discipline] ?? 0) + 1;
    return out;
  }, [systems]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return systems.filter((s) => {
      if (discipline !== "all" && s.discipline !== discipline) return false;
      if (!q) return true;
      return [
        s.name, s.manufacturer, s.model, s.ip_address, s.hostname, s.vlan,
        s.deck, s.compartment, s.rack_location, s.supplier_name, s.role_description,
      ].some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [systems, search, discipline]);

  /** Ordered by discipline so the table reads top-of-ship down, like the map. */
  const ordered = useMemo(() => {
    const rank = Object.fromEntries(DISCIPLINES.map((d, i) => [d.key, i]));
    return [...filtered].sort((a, b) => {
      const byDiscipline = (rank[a.discipline] ?? 99) - (rank[b.discipline] ?? 99);
      return byDiscipline !== 0 ? byDiscipline : a.name.localeCompare(b.name);
    });
  }, [filtered]);

  return (
    <div className="h-full flex min-h-0">

      {/* Discipline rail */}
      <div className="w-52 shrink-0 border-r border-border bg-card/40 overflow-y-auto p-2 space-y-0.5">
        <button
          onClick={() => setDiscipline("all")}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
            discipline === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
          }`}
        >
          <Layers className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">All systems</span>
          <span className="ml-auto text-[10px] opacity-70">{systems.length}</span>
        </button>

        {DISCIPLINES.map((d) => {
          const Icon = d.icon;
          const count = counts[d.key] ?? 0;
          const active = discipline === d.key;
          return (
            <button
              key={d.key}
              onClick={() => setDiscipline(d.key)}
              title={d.hint}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                active ? "bg-primary text-primary-foreground"
                       : count === 0 ? "text-muted-foreground/40 hover:bg-muted"
                                     : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: active ? undefined : d.colour }} />
              <span className="truncate">{d.label}</span>
              <span className="ml-auto text-[10px] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-border">
          <div className="relative flex-1 min-w-[180px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, model, IP, location…"
              className="w-full rounded-lg border border-border bg-background pl-9 pr-8 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {!readOnly && <div className="relative">
            <button
              onClick={() => setAddOpen((p) => !p)}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Add system <ChevronDown className="h-3 w-3" />
            </button>
            {addOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setAddOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-72 rounded-lg border border-border bg-popover shadow-lg p-1 max-h-[60vh] overflow-y-auto">
                  {DISCIPLINES.map((d) => {
                    const Icon = d.icon;
                    return (
                      <button
                        key={d.key}
                        onClick={() => { setAddOpen(false); onAddSystem(d.key); }}
                        className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                      >
                        <Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: d.colour }} />
                        <span className="min-w-0">
                          <span className="block text-xs font-medium">{d.label}</span>
                          <span className="block text-[11px] text-muted-foreground truncate">{d.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>}
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {ordered.length === 0 ? (
            <div className="grid place-items-center h-full text-center p-10">
              <div>
                <Layers className="h-7 w-7 mx-auto text-muted-foreground/40" />
                <p className="mt-2 text-sm font-medium">
                  {systems.length === 0 ? "No systems recorded yet" : "Nothing matches"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {systems.length === 0
                    ? "Add the first one, discipline by discipline."
                    : "Try a different search or discipline."}
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2">System</th>
                  <th className="text-left font-medium px-3 py-2">Make / model</th>
                  <th className="text-left font-medium px-3 py-2">Network</th>
                  <th className="text-left font-medium px-3 py-2">Location</th>
                  <th className="text-left font-medium px-3 py-2">Criticality</th>
                  <th className="text-left font-medium px-3 py-2">Status</th>
                  <th className="text-left font-medium px-3 py-2">Datto</th>
                  <th className="text-left font-medium px-3 py-2">Support to</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((s) => {
                  const meta = disciplineMeta(s.discipline);
                  const Icon = meta.icon;
                  const status = statusMeta(s.status);
                  const crit = criticalityMeta(s.criticality);
                  const left = daysUntil(s.support_contract_end);
                  const location = [s.deck, s.compartment, s.rack_location].filter(Boolean).join(" · ");
                  const network = [s.ip_address, s.vlan ? `VLAN ${s.vlan}` : null].filter(Boolean).join(" · ");
                  return (
                    <tr
                      key={s.id}
                      onClick={() => onSelect(s.id)}
                      className={`border-b border-border/60 cursor-pointer transition-colors ${
                        s.id === selectedId ? "bg-primary/10" : "hover:bg-muted/50"
                      }`}
                    >
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <Icon className="h-4 w-4 shrink-0" style={{ color: meta.colour }} />
                          <span className="min-w-0">
                            <span className="block font-medium truncate">{s.name}</span>
                            <span className="block text-[11px] text-muted-foreground truncate">{meta.label}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {[s.manufacturer, s.model].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{network || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{location || "—"}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className="h-2 w-2 rounded-full" style={{ background: crit.colour }} />
                          {crit.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className="h-2 w-2 rounded-full" style={{ background: status.colour }} />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {(() => {
                          // A linked uid whose device has gone from the Datto
                          // mirror shows as a stale link rather than silently
                          // reading as "not linked".
                          if (!s.datto_uid) return <span className="text-muted-foreground">—</span>;
                          const d = dattoByUid.get(s.datto_uid);
                          if (!d) return <span className="text-amber-600 dark:text-amber-400">link stale</span>;
                          const presence = dattoPresence(d);
                          return (
                            <span
                              className="inline-flex items-center gap-1.5"
                              title={`${d.hostname ?? d.datto_uid} · ${presence.label}${d.last_seen_at ? ` · last seen ${new Date(d.last_seen_at).toLocaleString()}` : ""}`}
                            >
                              <ServerCog className="h-3 w-3 text-muted-foreground" />
                              <span
                                className={`h-2 w-2 rounded-full ${presence.stale ? "ring-1 ring-muted-foreground/40" : ""}`}
                                style={{ background: presence.colour }}
                              />
                              <span className="truncate max-w-[110px]">{d.hostname ?? d.device_name ?? "linked"}</span>
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {s.support_contract_end ? (
                          <span className={
                            left !== null && left < 0 ? "text-destructive font-medium"
                            : left !== null && left <= CONTRACT_WARN_DAYS ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground"
                          }>
                            {s.support_contract_end}
                            {left !== null && left < 0 && " · lapsed"}
                            {left !== null && left >= 0 && left <= CONTRACT_WARN_DAYS && ` · ${left}d`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
